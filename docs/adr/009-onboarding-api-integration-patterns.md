# ADR-009: Onboarding API Integration Patterns with Custom Hooks

**Status**: Accepted  
**Date**: 2026-09-15  
**Deciders**: Frontend Architecture Team  
**Related**: ADR-007, ADR-010, AGENTS.md § API Integration

---

## Context

The onboarding workflow requires multiple interactions with backend APIs:
- Fetching current progress
- Starting/restarting onboarding
- Moving between phases
- Completing phases
- Saving checkpoints
- Validating form data
- Detecting income/expense patterns
- Fetching bank guidance

We needed a pattern that:
- Separates API concerns from UI rendering
- Manages loading/error states reliably
- Enables code reuse across components
- Keeps TypeScript type safety
- Handles auto-save and debouncing
- Provides clear error feedback

## Decision

Implement **custom React hooks** as the primary API integration layer:

1. **Atomic Responsibility**: Each hook handles one logical domain
   - `useOnboarding()` - phase orchestration
   - `useFormProgress()` - form data persistence
   - `useIncomeDetection()` - income pattern detection
   - `useExpenseDetection()` - expense pattern detection
   - `useFormValidation()` - server-side validation
   - `useStatementGuidance()` - bank guidance
   - `useCheckpointResume()` - checkpoint restoration

2. **Consistent Interface Pattern**:
   ```typescript
   // Input: parameters (householdId, phaseNumber, etc.)
   // Output: { data/results, isLoading, error, ...methods }
   
   const { progress, isLoading, error, completePhase } = useOnboarding(householdId);
   const { detections, isLoading, error, detect, confirm } = useIncomeDetection(householdId);
   ```

3. **Error Handling Strategy**: Try/catch with explicit state management
   ```typescript
   try {
       setIsLoading(true);
       setError(null);
       const response = await fetch(endpoint);
       if (!response.ok) throw new Error(message);
       const data = await response.json();
       setState(data);
   } catch (err) {
       setError(err instanceof Error ? err.message : 'An error occurred');
   } finally {
       setIsLoading(false);
   }
   ```

4. **Auto-save Pattern**: Debounce-based checkpoint saves
   ```typescript
   useEffect(() => {
       if (debounceTimer.current) clearTimeout(debounceTimer.current);
       debounceTimer.current = setTimeout(async () => {
           await saveCheckpoint();
       }, 5000);  // 5-second debounce
       return () => clearTimeout(debounceTimer.current);
   }, [data]);
   ```

5. **Composition with Context**: Hooks interact with session Context
   ```
   API Hook (fetch + state)
       ↓
   Component (uses both hook + context)
       ↓
   Context (session persistence)
   ```

## Consequences

### Positive
- **Separation of Concerns**: API logic isolated from rendering
- **Reusability**: Hooks used across multiple components
- **Type Safety**: Full TypeScript support, no implicit any
- **Testability**: Hooks testable without rendering
- **Clear Flow**: Data flow from API → hook state → Context → UI
- **Error Isolation**: Errors contained within hook, propagated to UI
- **Performance**: Loading states prevent unnecessary rerenders
- **No Dependencies**: Uses built-in React hooks (useState, useEffect, useCallback)
- **Progressive Disclosure**: Multiple small hooks vs one monolithic hook
- **Migration Path**: Can wrap hooks in Redux if needed later

### Negative
- **Hook Complexity**: useFormProgress debounce logic non-obvious
- **Debugging**: Multiple hooks → multiple state sources
- **Shared State**: Some state duplication between hook + Context
- **Error Proliferation**: Multiple error states vs centralized error handling
- **Testing Setup**: Each hook requires test setup/fixtures
- **Learning Curve**: Developers must understand hook patterns and dependencies
- **Dependency Array Risk**: Incorrect dependencies cause stale closures

## Implementation Details

### Hook Anatomy

All API hooks follow this template:

```typescript
export function useXxxApi(householdId: EntityId) {
    const [data, setData] = useState<DataType | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch on mount
    useEffect(() => {
        const fetch = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const response = await fetch(endpoint);
                if (!response.ok) throw new Error('...');
                const data = await response.json();
                setData(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        };
        if (householdId) fetch();
    }, [householdId]);

    // Action method (if needed)
    const action = useCallback(async (params) => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
            });
            if (!response.ok) throw new Error('...');
            const data = await response.json();
            setData(data);
            return data;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            setError(message);
            throw err;  // Re-throw for component handling
        } finally {
            setIsLoading(false);
        }
    }, [householdId]);

    return { data, isLoading, error, action };
}
```

### Debounce Pattern (useFormProgress)

```typescript
export function useFormProgress(householdId: EntityId, phaseNumber: OnboardingPhase, initialData) {
    const [data, setData] = useState(initialData);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // Clear existing timer
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        
        // Set new timer
        debounceTimer.current = setTimeout(async () => {
            try {
                setIsSaving(true);
                setSaveError(null);
                await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ householdId, phase: phaseNumber, data }),
                });
            } catch (err) {
                setSaveError(err instanceof Error ? err.message : 'Save failed');
            } finally {
                setIsSaving(false);
            }
        }, 5000);  // 5-second debounce

        // Cleanup: clear timer on unmount
        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [data, phaseNumber, householdId]);

    return { data, setData, isSaving, saveError };
}
```

### Error Handling in Components

```typescript
const { progress, isLoading, error, completePhase } = useOnboarding(householdId);
const { session, setError: setSessionError } = useOnboardingSession();

const handleSubmit = async (formData) => {
    try {
        await completePhase(formData);
        // Hook already updates progress state
    } catch (err) {
        // Hook already set error, but component can also update session
        setSessionError('Failed to save phase. Please try again.');
    }
};

// In JSX:
{isLoading && <LoadingSpinner />}
{error && <ErrorAlert message={error} />}
{progress && <PhaseContent data={progress} />}
```

### Hook Memoization

```typescript
// useCallback prevents recreating function on every render
const completePhase = useCallback(async (data) => {
    // Implementation
}, [householdId]);  // Only recreate if householdId changes

// useRef preserves timer reference across renders
const debounceTimer = useRef<NodeJS.Timeout | null>(null);
```

## API Endpoint Contracts

Each hook documents its contract:

### useOnboarding(householdId)

**Endpoints Used**:
- `GET /api/onboarding/progress?householdId=xxx`
- `POST /api/onboarding/start` → `{ householdId, householdName }`
- `POST /api/onboarding/complete-phase` → `{ householdId, phaseData }`
- `POST /api/onboarding/skip-phase` → `{ householdId, targetPhase }`

**Returns**: `{ progress, isLoading, error, start(), completePhase(), skipPhase() }`

### useFormProgress(householdId, phaseNumber, initialData)

**Endpoint Used**:
- `POST /api/onboarding/checkpoint/save` → `{ householdId, phase, data }` (5-sec debounce)

**Returns**: `{ data, setData, isSaving, saveError }`

### useIncomeDetection(householdId)

**Endpoints Used**:
- `GET /api/onboarding/detect-income?householdId=xxx`
- `POST /api/onboarding/income/confirm` → `{ householdId, confirmedAmount }`

**Returns**: `{ detections, isLoading, error, detect(), confirm() }`

## Testing Strategy

### Unit Tests

```typescript
// Mock fetch
global.fetch = jest.fn();

describe('useOnboarding', () => {
    it('should fetch progress on mount', async () => {
        fetch.mockResolvedValue({
            ok: true,
            json: async () => ({ progress: mockProgress }),
        });

        const { result } = renderHook(() => useOnboarding('hh_123'));
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        expect(result.current.progress).toEqual(mockProgress);
    });

    it('should handle errors', async () => {
        fetch.mockRejectedValue(new Error('Network error'));
        
        const { result } = renderHook(() => useOnboarding('hh_123'));
        
        await waitFor(() => {
            expect(result.current.error).toBe('Network error');
        });
    });
});
```

### Integration Tests

```typescript
// Test with real API (local or staging)
describe('useOnboarding integration', () => {
    it('should complete phase end-to-end', async () => {
        const { result } = renderHook(() => useOnboarding('hh_test_123'));
        
        await waitFor(() => expect(result.current.progress).toBeDefined());
        
        act(() => {
            result.current.completePhase({ ...phaseData });
        });
        
        await waitFor(() => {
            expect(result.current.progress?.currentPhase).toBe(2);
        });
    });
});
```

## Error Handling Patterns

### Network Errors
```typescript
if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}
```

### JSON Parsing Errors
```typescript
const data = await response.json();  // Throws if JSON invalid
```

### Validation Errors
```typescript
if (response.status === 400) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Validation failed');
}
```

### Graceful Degradation
```typescript
// Example: checkpoint load with 404 handling
try {
    const response = await fetch(endpoint);
    if (response.status === 404) {
        setCheckpoint(null);  // No checkpoint found, that's OK
    } else if (!response.ok) {
        throw new Error('Failed to load checkpoint');
    } else {
        setCheckpoint(await response.json());
    }
} catch (err) {
    setError(err.message);
}
```

## Performance Considerations

### Debounce Delays
- **5 seconds**: useFormProgress (form auto-save)
  - Balances server load vs data recency
  - Typical typing speed produces events every 100-500ms
  - 5s debounce reduces API calls by ~95%

### Loading States
- Prevent button clicks during async operations
- Show spinners for better UX feedback
- Track separate loading states per operation if needed

### Memory Leaks
- Always cleanup timers in useEffect return
- Always cleanup event listeners
- useRef for timers, not state

## Dependencies and Compatibility

### React Requirements
- React 16.8+ (hooks support)
- React 18.0+ (recommended for Suspense future)

### TypeScript
- TypeScript 4.9+ for proper type inference
- Full type safety on all hooks

### Browser Support
- Fetch API (all modern browsers)
- Fallback to polyfill if IE11 support needed

## Future Enhancements

### Request Caching
Implement SWR (stale-while-revalidate) pattern:
```typescript
// Cache within 5 seconds, revalidate in background
useSWR(`/onboarding/progress?householdId=${householdId}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
});
```

### Retry Logic
Exponential backoff for failed requests:
```typescript
const maxRetries = 3;
let retries = 0;
while (retries < maxRetries) {
    try {
        return await fetch(endpoint);
    } catch (err) {
        retries++;
        await sleep(Math.pow(2, retries) * 100);  // 200ms, 400ms, 800ms
    }
}
```

### Offline Support
Use IndexedDB for offline queue:
```typescript
if (!navigator.onLine) {
    await queueRequest(endpoint, payload);
} else {
    await fetch(endpoint, payload);
}
```

## References
- Implementation: `apps/web/src/hooks/useOnboarding.ts`
- Usage: `apps/web/src/components/onboarding/OnboardingFlow.tsx`
- Testing: (add integration test file path)
- React Hooks docs: https://react.dev/reference/react/hooks
- SWR library: https://swr.vercel.app/
