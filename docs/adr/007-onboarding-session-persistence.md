# ADR-007: Onboarding Session Persistence with React Context & localStorage

**Status**: Accepted  
**Date**: 2026-09-15  
**Deciders**: Frontend Architecture Team  
**Related**: ADR-001, ADR-003, AGENTS.md § Checkpoint Persistence

---

## Context

The household onboarding workflow spans multiple phases (1-6) and may take considerable time to complete. Users expect:
- Progress to be preserved if they close the browser
- Checkpoint data to be restored on app reload
- Seamless continuation without re-entering data
- Session state accessible to all phase components

We evaluated two primary state management approaches:

1. **React Context + localStorage**: Lightweight, built-in React solution
2. **Redux (or similar)**: Centralized store, middleware support, DevTools

Additionally, we considered where checkpoint data should persist:
- **Client-side (localStorage)**: Fast, offline-capable, browser-specific
- **Server-side (API)**: Durable, multi-device sync, requires API calls

## Decision

1. **State Management**: Use **React Context API** for session state management
   - Simpler for this scope (phase navigation, progress tracking, checkpoint metadata)
   - No external dependencies
   - Sufficient for current onboarding complexity
   - Can be refactored to Redux later if needs grow

2. **Persistence Layer**: Use **localStorage** as the primary checkpoint store
   - Automatic restoration on app load
   - Auto-sync to storage on state changes
   - Key format: `onboarding_session_{householdId}`
   - Graceful fallback if storage unavailable

3. **API Integration**: Use custom React hooks (useOnboarding, useFormProgress, etc.) for API communication
   - Separate concerns: API calls vs session state
   - Debounce-based auto-save (5-second intervals)
   - Hooks manage their own loading/error states
   - Context syncs hook results to session state

4. **Architecture Pattern**:
   ```
   API Layer (useOnboarding hook)
        ↓
   Context Layer (OnboardingContext)
        ↓
   localStorage (auto-persist)
        ↓
   UI Components (useOnboardingSession hook)
   ```

## Consequences

### Positive
- **Simplicity**: No Redux boilerplate or middleware complexity
- **Built-in React**: Uses standard React patterns (Context, hooks)
- **Offline-first**: localStorage provides offline capability
- **Fast restoration**: Immediate availability of cached progress
- **Minimal dependencies**: No additional packages required
- **Clear separation**: API hooks remain independent from state management
- **Component-level access**: Any component can access session via hook
- **Atomic updates**: Single point of truth (Context state)

### Negative
- **Browser-specific**: Data doesn't sync across devices
- **Limited debugging**: No Redux DevTools-equivalent tooling
- **localStorage limitations**: 5-10MB per domain, synchronous API, no encryption
- **Single-tab**: No automatic sync across browser tabs
- **No middleware**: Cannot implement global pre/post-action hooks easily
- **Context re-renders**: All consumers re-render on state change (address with useMemo if needed)

## Implementation Details

### Session Context Structure
```typescript
interface OnboardingSession {
    householdId: string;
    progress: OnboardingProgress | null;
    isLoading: boolean;
    error: string | null;
    currentPhase: OnboardingPhase;
    hasCheckpoint: boolean;
    lastSavedAt: Date | null;
}

interface OnboardingContextType {
    session: OnboardingSession;
    updateProgress: (progress: OnboardingProgress) => void;
    updatePhase: (phase: OnboardingPhase) => void;
    clearSession: () => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    markCheckpointSaved: () => void;
}
```

### localStorage Structure
```json
{
    "progress": { /* OnboardingProgress */ },
    "currentPhase": 2,
    "hasCheckpoint": true,
    "lastSavedAt": "2026-09-15T14:30:00Z"
}
```

### Hook Pattern
```typescript
// API communication hook (stateless, calls API)
const { progress, isLoading, error, completePhase, skipPhase, saveCheckpoint } = useOnboarding(householdId);

// Session management hook (syncs to Context + localStorage)
const { session, updateProgress, markCheckpointSaved } = useOnboardingSession();

// Sync pattern in component
useEffect(() => {
    if (progress) {
        updateProgress(progress);  // Sync to Context → localStorage
    }
}, [progress, updateProgress]);
```

## Trade-offs and Rationale

### Why Context over Redux?
| Aspect | Context | Redux |
|--------|---------|-------|
| Complexity | Low | High |
| Learning curve | Minimal | Steep |
| Boilerplate | None | Significant |
| Dependencies | 0 | 1+ |
| Current scope fit | Excellent | Overkill |
| Future scalability | Fair (refactor needed) | Excellent |

**Decision**: Context is appropriate for MVP. If onboarding grows to handle complex multi-household state, shared workflows, or deep undo/redo, Redux becomes justified.

### Why localStorage over server-side checkpoints?
| Aspect | localStorage | Server State |
|--------|-------------|--------------|
| Speed | Immediate (sync) | Network latency |
| Offline | Works | Requires fallback |
| Multi-device | No | Yes |
| Privacy | Browser-only | Server security required |
| Scalability | Per-browser | Server infrastructure |
| Corruption risk | High (user can clear) | Low |

**Decision**: localStorage for checkpoint provides fast restoration and offline capability. Server-side API calls for durability (form-save every 5 min). Two-tier model: fast local restore + persistent server save.

## Implementation Rules

1. **In `OnboardingContext.tsx`**:
   - Restore from localStorage on provider mount
   - Auto-persist to localStorage on state changes
   - Handle JSON serialization/deserialization errors gracefully
   - Provide key-scoped storage per householdId to avoid conflicts

2. **In `useOnboardingSession.ts`**:
   - Validate context exists (throw error if used outside provider)
   - Return stable interface regardless of implementation

3. **In `OnboardingFlow.tsx`**:
   - Sync API hook results to Context
   - Use Context for UI state (error messages, loading indicators)
   - Call API hooks directly for operations (completePhase, skipPhase)

4. **In Components**:
   - Prefer Context hook over direct API calls for session state
   - Use API hooks for one-off operations
   - Never directly manipulate localStorage

5. **Error Handling**:
   - Gracefully handle localStorage quota exceeded
   - Log storage errors but don't break functionality
   - Provide user feedback if checkpoint save fails

6. **Testing**:
   - Mock localStorage in tests
   - Test Context provider isolation (householdId scoping)
   - Test restore/persist round-trips
   - Test graceful degradation if storage unavailable

## Future Considerations

### Migration to Redux
If needed, migrate to Redux following this pattern:
1. Keep API hooks as-is (they're independent)
2. Replace Context with Redux store
3. Update consumers to use Redux selectors
4. Migrate localStorage to Redux persist middleware

### Multi-device Sync
If multi-device checkpoint sync is required:
1. Keep localStorage for fast local restore
2. Add server-side checkpoint storage endpoint
3. Implement sync strategy (conflict resolution, merging)
4. Use service workers or polling for background sync

### Encryption
If localStorage contains sensitive data:
1. Implement client-side encryption (TweetNaCl.js)
2. Store encryption key in sessionStorage (volatile, not persisted)
3. Decrypt on Context initialization
4. Re-encrypt on storage updates

## References
- Implementation: `apps/web/src/context/OnboardingContext.tsx`
- Hook: `apps/web/src/context/useOnboardingSession.ts`
- PRODUCT_BUILD_CONTRACT.md § Checkpoint Persistence
- AGENTS.md § Session Persistence
- React Context API docs: https://react.dev/reference/react/useContext
