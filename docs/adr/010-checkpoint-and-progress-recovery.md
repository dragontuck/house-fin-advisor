# ADR-010: Checkpoint and Progress Recovery Strategy

**Status**: Accepted  
**Date**: 2026-09-15  
**Deciders**: Product Team, Frontend Architecture Team  
**Related**: ADR-001, ADR-007, ADR-009, AGENTS.md § Checkpoint Persistence

---

## Context

Users expect their onboarding progress to survive browser close, network interruptions, and unexpected shutdowns. We needed a strategy that:

- Automatically saves progress without user action
- Restores progress on app reload
- Survives network interruptions
- Prevents data loss from partial saves
- Remains simple and maintainable
- Works with current infrastructure (no message queues, simple API)

We considered three approaches:

1. **Client-only (localStorage)**: Fast, works offline, but lost if browser data cleared
2. **Server-only (API checkpoints)**: Durable, but requires network; slow recovery
3. **Hybrid (both)**: Combines benefits, handles most failure modes

## Decision

Implement a **two-tier checkpoint strategy**:

### Tier 1: Client-side localStorage (Fast Recovery)
- **Auto-save**: Every 5 minutes via auto-save hook
- **Immediate restore**: On app load, before API call
- **Scope**: Current phase, form data, navigation state
- **Format**: JSON in browser localStorage
- **Key**: `onboarding_session_{householdId}`

### Tier 2: Server-side API checkpoints (Durable Storage)
- **Auto-save**: Every 5 minutes via `useFormProgress` debounce
- **Endpoint**: `POST /api/onboarding/checkpoint/save`
- **Scope**: Complete progress, all phase data, metadata
- **Durability**: Persisted in PostgreSQL
- **Recovery**: `GET /api/onboarding/checkpoint/resume`

### Recovery Flow

```
App Load
  ↓
Try localStorage restore
  ├─ Success → Show cached progress immediately
  └─ Fail → Continue to API
  ↓
Fetch progress from API
  ├─ Success → Sync with localStorage
  └─ Fail → Show offline/error state
  ↓
Display UI with restored state
```

### Save Flow

```
User makes change
  ↓
Hook updates state
  ↓
Debounce timer starts (5 sec)
  ├─ Another change → reset timer
  └─ 5 sec elapsed → send to API
  ↓
Save to API
  ├─ Success → localStorage auto-synced via Context
  └─ Fail → Log error, don't block UI
  ↓
Context updates lastSavedAt timestamp
```

## Consequences

### Positive
- **Fast Recovery**: localStorage restore is immediate (no network)
- **Durable Storage**: API checkpoint survives app uninstall/cache clear
- **Offline Capable**: Works in offline mode, sync on reconnect
- **No User Action**: Automatic saves, no "Save Progress" friction
- **Graceful Degradation**: Works if API down, recovers when online
- **Reduced Data Loss**: Two independent save paths
- **User Transparency**: Can see lastSavedAt timestamp
- **Resume Capability**: Users can literally continue where they left off
- **Minimal Latency**: Auto-save happens invisibly in background
- **Bandwidth Efficient**: Debounce reduces API calls by ~95%

### Negative
- **Complexity**: Two save paths to maintain and test
- **State Duplication**: Progress exists in three places (API, localStorage, Context)
- **Sync Issues**: Stale cache if API updates but localStorage doesn't
- **Storage Limits**: localStorage quota could be exceeded with large datasets
- **Privacy Exposure**: localStorage readable by any script in same domain
- **Cache Busting**: Must handle version changes (e.g., new fields in progress)
- **Debugging Difficulty**: Multiple sources of truth complicate debugging
- **Timing Edge Cases**: Network latency can cause save ordering issues

## Implementation Details

### localStorage Structure

```json
{
    "onboarding_session_hh_12345": {
        "progress": {
            "id": "prog_xyz",
            "householdId": "hh_12345",
            "currentPhase": 2,
            "currentState": "IN_PROGRESS",
            "phases": {
                "1": {
                    "completed": true,
                    "completedAt": "2026-09-15T10:30:00Z",
                    "data": { "householdName": "Smith Family", "profileType": "COUPLE" }
                },
                "2": {
                    "completed": false,
                    "completedAt": null,
                    "data": { "declaredAccounts": [ /* ... */ ] }
                }
            },
            "startedAt": "2026-09-15T10:00:00Z",
            "lastActivityAt": "2026-09-15T10:45:00Z",
            "completedAt": null,
            "totalTimeMinutes": 45,
            "createdAt": "2026-09-15T10:00:00Z",
            "updatedAt": "2026-09-15T10:45:00Z"
        },
        "currentPhase": 2,
        "hasCheckpoint": true,
        "lastSavedAt": "2026-09-15T10:45:00Z"
    }
}
```

### API Checkpoint Endpoints

#### Save Checkpoint
```
POST /api/onboarding/checkpoint/save
Content-Type: application/json

{
    "householdId": "hh_12345",
    "progress": { /* OnboardingProgress */ }
}

Response:
{
    "success": true,
    "savedAt": "2026-09-15T10:45:00Z",
    "checkpointId": "cp_abc123"
}
```

#### Resume Checkpoint
```
GET /api/onboarding/checkpoint/resume?householdId=hh_12345

Response (if checkpoint exists):
{
    "checkpoint": { /* OnboardingProgress */ },
    "restoredAt": "2026-09-15T10:45:00Z"
}

Response (if no checkpoint):
{
    "error": "Not Found",
    "status": 404
}
```

### Save Frequency and Timing

**Why 5 seconds?**
- Typing speed: 40-60 WPM = 1 char/100ms = event every 100-300ms
- Without debounce: 10+ API calls/minute from typing
- 5-second debounce: 1 API call/minute from typing
- Reduction: ~90% fewer API calls
- Balance: 5 seconds = acceptable data-loss window if crash occurs

**Alternative considered**:
- 3 seconds: Saves more frequently, but increases API load
- 10 seconds: Saves less frequently, but increases data-loss window
- On-blur: Precise, but misses data if multiple fields edited

### Auto-save Implementation

```typescript
// In useFormProgress hook
useEffect(() => {
    // Clear existing timer
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    
    // Set new timer
    debounceTimer.current = setTimeout(async () => {
        try {
            const response = await fetch(`${API_BASE}/onboarding/checkpoint/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    householdId,
                    phase: phaseNumber,
                    data,
                    timestamp: new Date().toISOString(),
                }),
            });

            if (response.ok) {
                // Update Context with save status
                markCheckpointSaved();  // Sets hasCheckpoint=true, lastSavedAt=now
            }
        } catch (err) {
            console.error('Checkpoint save error:', err);
            // Don't throw - auto-save failures shouldn't block user
            // Data still in localStorage as fallback
        }
    }, 5000);

    return () => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
}, [data, phaseNumber, householdId]);
```

### Restore on App Load

```typescript
// In OnboardingContext provider initialization
const [session, setSession] = useState<OnboardingSession>(() => {
    // Try localStorage first (immediate)
    if (typeof window !== 'undefined') {
        try {
            const stored = localStorage.getItem(`${STORAGE_KEY}_${householdId}`);
            if (stored) {
                const parsed = JSON.parse(stored);
                console.log('Restored from localStorage:', parsed);
                return {
                    ...DEFAULT_SESSION,
                    householdId,
                    ...parsed,
                    isLoading: false,
                };
            }
        } catch (err) {
            console.error('Failed to restore from localStorage:', err);
        }
    }
    return { ...DEFAULT_SESSION, householdId };
});

// In useOnboarding hook
useEffect(() => {
    const fetchProgress = async () => {
        try {
            setIsLoading(true);
            setError(null);
            
            const response = await fetch(
                `${API_BASE}/onboarding/progress?householdId=${householdId}`
            );
            
            if (!response.ok) {
                if (response.status === 404) {
                    // No progress yet, initialize
                    // But don't override localStorage if it has data
                    const initResponse = await fetch(`${API_BASE}/onboarding/initialize`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ householdId }),
                    });
                    if (initResponse.ok) {
                        const data = await initResponse.json();
                        setProgress(data.progress);
                    }
                }
            } else {
                const data = await response.json();
                setProgress(data.progress);
                // Sync API data to localStorage
                updateProgress(data.progress);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    if (householdId) {
        fetchProgress();  // Runs after localStorage restore
    }
}, [householdId]);
```

## Data Consistency Strategy

### Potential Conflicts

**Scenario**: User edits form → localStorage saves → API network fails → API eventually succeeds with stale data

**Prevention**:
1. Include timestamp in API payload: `timestamp: new Date().toISOString()`
2. Server compares with previous save timestamp
3. If out-of-order, reject with conflict error
4. Client refetches progress on conflict

**Code Example**:
```typescript
// In API checkpoint handler
const savedCheckpoint = await getLastCheckpoint(householdId);
if (savedCheckpoint && incomingTimestamp < savedCheckpoint.timestamp) {
    return res.status(409).json({
        error: 'Conflict: received out-of-order save',
        latestTimestamp: savedCheckpoint.timestamp,
    });
}
```

### Version Skew

**Scenario**: User upgrades app while offline, localStorage has old data structure

**Prevention**:
1. Include version in localStorage schema: `checkpointVersion: 1`
2. On restore, validate version matches current
3. If mismatch, discard stale data and reinitialize

**Code Example**:
```typescript
const CHECKPOINT_VERSION = 1;

const stored = localStorage.getItem(key);
if (stored) {
    const parsed = JSON.parse(stored);
    if (parsed.checkpointVersion !== CHECKPOINT_VERSION) {
        console.warn('Checkpoint version mismatch, discarding cache');
        localStorage.removeItem(key);
        return DEFAULT_SESSION;
    }
}
```

## Error Scenarios and Handling

| Scenario | Behavior | Recovery |
|----------|----------|----------|
| Network down during save | Auto-save silently fails | Data in localStorage safe; retry when online |
| App crashes during save | localStorage has data, API may/may not have it | Next load checks both sources; API is source of truth |
| localStorage quota exceeded | Save fails silently | Data still on server; localStorage recovers when cleaned up |
| User clears browser data | localStorage wiped, Context empty | API still has checkpoint; fetches on next load |
| Session expires between saves | Auth token invalid | API returns 401; UI redirects to login; resume after reauth |
| Phase data too large | localStorage save fails | API save may succeed; degrades gracefully |

## Testing Strategy

### Unit Tests

```typescript
describe('Checkpoint restoration', () => {
    it('should restore from localStorage on mount', () => {
        const mockData = { currentPhase: 2, progress: { /* ... */ } };
        localStorage.setItem(`onboarding_session_hh_123`, JSON.stringify(mockData));
        
        const { result } = renderHook(() => useOnboardingSession(), {
            wrapper: OnboardingProvider,
        });
        
        expect(result.current.session.currentPhase).toBe(2);
    });

    it('should handle localStorage corruption gracefully', () => {
        localStorage.setItem(`onboarding_session_hh_123`, 'invalid json');
        
        const { result } = renderHook(() => useOnboardingSession(), {
            wrapper: OnboardingProvider,
        });
        
        // Should not throw, should initialize to default
        expect(result.current.session.currentPhase).toBe(1);
    });
});

describe('Auto-save with debounce', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        global.fetch = jest.fn();
    });

    it('should debounce saves to 5 seconds', async () => {
        const { result } = renderHook(() => 
            useFormProgress('hh_123', 1, { name: '' })
        );
        
        // Make 10 changes in quick succession
        for (let i = 0; i < 10; i++) {
            act(() => {
                result.current.setData({ name: `name${i}` });
            });
        }
        
        // No API call yet
        expect(global.fetch).not.toHaveBeenCalled();
        
        // Fast-forward 5 seconds
        jest.advanceTimersByTime(5000);
        
        // Single API call made
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
    });
});
```

### Integration Tests

```typescript
describe('Checkpoint save and restore', () => {
    it('should save to API and localStorage together', async () => {
        const { result } = renderHook(() => useOnboarding('hh_123'), {
            wrapper: (props) => (
                <OnboardingProvider householdId="hh_123">
                    {props.children}
                </OnboardingProvider>
            ),
        });
        
        // Wait for initial load
        await waitFor(() => expect(result.current.progress).toBeDefined());
        
        // Complete phase
        act(() => {
            result.current.completePhase({ /* phase data */ });
        });
        
        // Wait for API and auto-save
        await waitFor(() => {
            expect(result.current.progress?.currentPhase).toBe(2);
        });
        
        // Check localStorage was updated
        const stored = JSON.parse(localStorage.getItem('onboarding_session_hh_123'));
        expect(stored.currentPhase).toBe(2);
    });
});
```

### E2E Tests (Playwright)

```typescript
test('should recover from browser crash', async ({ page }) => {
    // Start onboarding
    await page.goto('/onboarding');
    await page.fill('[name="householdName"]', 'Test Household');
    await page.click('text=Next');
    
    // Wait for auto-save (5 seconds)
    await page.waitForTimeout(6000);
    
    // Simulate crash: close browser
    await page.close();
    
    // Reopen browser
    const page2 = await browser.newPage();
    await page2.goto('/onboarding');
    
    // Should restore to Phase 2 with saved data
    await expect(page2.locator('text=Phase 2 of 6')).toBeVisible();
});
```

## Performance Metrics

### Checkpoint Operations

| Operation | Target | Method |
|-----------|--------|--------|
| localStorage restore | <100ms | Synchronous JSON.parse |
| API checkpoint save | <1000ms | Async fetch with timeout |
| Debounce window | 5000ms | useRef timer |
| API calls/minute (typing) | 1 | Debounce reduces 10→1 |

### Storage Usage

| Component | Size | Calculation |
|-----------|------|-------------|
| Typical checkpoint | ~50KB | JSON serialized progress + phase data |
| localStorage quota | 5-10MB | Varies by browser |
| Max checkpoints in quota | 100+ | 5MB / 50KB per checkpoint |

## Future Enhancements

### Checkpoint History
Track multiple checkpoints per household:
```typescript
interface CheckpointHistory {
    checkpointId: EntityId;
    householdId: EntityId;
    phase: OnboardingPhase;
    data: Record<string, unknown>;
    savedAt: Date;
    reachableFrom: OnboardingPhase[];  // Can resume from these phases
}
```

### Selective Sync
User controls which data syncs to API:
- "Save locally only" (faster, less data exposure)
- "Save to server" (durable, multi-device)
- "Save both" (default, maximum safety)

### Checkpoint Encryption
Encrypt localStorage data with user's password:
```typescript
const encrypted = await encryptCheckpoint(checkpoint, userPassword);
localStorage.setItem(key, encrypted);
```

### Advanced Recovery
Implement recovery UI if multiple checkpoints exist:
- Show list of saved states with timestamps
- Allow user to pick which checkpoint to restore
- Compare differences between checkpoints

## References
- Implementation: `apps/web/src/context/OnboardingContext.tsx`
- Auto-save hook: `apps/web/src/hooks/useOnboarding.ts` (useFormProgress)
- Backend endpoint: `apps/api/src/routes/pg-onboarding.routes.ts`
- PRODUCT_BUILD_CONTRACT.md § Checkpoint Persistence
- AGENTS.md § Onboarding Data Preservation
