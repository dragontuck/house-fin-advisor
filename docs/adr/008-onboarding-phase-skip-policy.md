# ADR-008: Onboarding Phase Skip Validation Policy

**Status**: Accepted  
**Date**: 2026-09-15  
**Deciders**: Product Team, UX Team, Architecture Team  
**Related**: ADR-001, PRODUCT_BUILD_CONTRACT.md § Onboarding Phases

---

## Context

The onboarding workflow consists of 6 phases:
1. Setup (household profile)
2. Accounts (declare financial accounts)
3. Statements (provide account statements)
4. Context (income/expense patterns)
5. Profile (household preferences)
6. Review (confirm and launch)

Users may want to skip certain phases to proceed faster, but some phases are foundational to the system's ability to function. We needed to decide:

- Which phases can be skipped?
- Which phases are mandatory?
- How are skip decisions enforced?
- How is the user informed of restrictions?

## Decision

### Skip Policy Matrix

| Phase | Skippable | Rationale | Minimum Requirements |
|-------|-----------|-----------|---------------------|
| 1 Setup | ❌ No | Must establish household identity and profile type | None |
| 2 Accounts | ❌ No | Must declare at least one account to have financial data | Phase 1 complete |
| 3 Statements | ❌ No | Must provide statements to establish financial baseline | Phases 1-2 complete |
| 4 Context | ✅ Yes | Income/expense patterns can be updated/corrected later | Phases 1-3 complete |
| 5 Profile | ✅ Yes | User preferences can be configured after onboarding | Phases 1-3 complete |
| 6 Review | ❌ No | Must review aggregated data and consent before launch | Phases 1-3 complete |

### Skip Enforcement Rules

1. **Two-tier validation**:
   - **Client-side**: Quick feedback using local validation
   - **Server-side**: Authoritative validation (backend API enforces policy)

2. **Skip Button Behavior**:
   - Shown only if phase is skippable
   - Disabled with tooltip if requirements not met
   - Tooltip explains what's blocking the skip

3. **Error Messaging**:
   - Clear explanation of why phase cannot be skipped
   - Specific guidance on what must be completed first
   - Example: "Cannot skip phase 4. Must complete phase 3 (Statements) first."

4. **Data Preservation**:
   - Skipped phases preserve any partial data entered
   - Users can revisit skipped phases anytime
   - Skipped data counts toward completion tracking

### Implementation Pattern

```typescript
// Skip policy configuration
const SKIP_POLICIES: SkipPolicy[] = [
    {
        phase: 1,
        canSkip: false,
        reason: 'Phase 1 (Setup) is required - must establish household profile',
        minimumRequiredPhases: [],
    },
    {
        phase: 4,
        canSkip: true,
        reason: 'Phase 4 (Context) can be skipped - financial context can be updated later',
        minimumRequiredPhases: [1, 2, 3],
    },
    // ...
];

// Validation functions
export function canSkipPhase(phase: OnboardingPhase, progress: OnboardingProgress): boolean {
    const policy = getSkipPolicy(phase);
    if (!policy.canSkip) return false;
    
    return policy.minimumRequiredPhases.every(
        (requiredPhase) => progress.phases[requiredPhase]?.completed
    );
}

export function getSkipValidationError(
    phase: OnboardingPhase,
    progress: OnboardingProgress
): string | null {
    const policy = getSkipPolicy(phase);
    if (!policy.canSkip) {
        return policy.reason;
    }
    
    const incomplete = policy.minimumRequiredPhases.filter(
        (p) => !progress.phases[p]?.completed
    );
    
    if (incomplete.length > 0) {
        return `Cannot skip phase ${phase}. Must complete phase(s) ${incomplete.join(', ')} first.`;
    }
    
    return null;
}
```

## Consequences

### Positive
- **Clear expectations**: Users understand which phases are mandatory vs optional
- **Faster onboarding**: Users can skip non-critical phases to proceed quickly
- **Recovery path**: Skipped phases can be revisited anytime
- **Validated policy**: Server-side enforcement prevents policy bypass
- **User guidance**: Tooltips and error messages guide users
- **Progressive disclosure**: Skip option only shown when available
- **Reduced friction**: Users not forced through unwanted phases
- **Data safety**: No data loss from skipping

### Negative
- **Incomplete data**: Users may skip phases that would improve recommendations
- **Support burden**: Users may skip phases and encounter issues later
- **Policy maintenance**: Skip policy must stay synchronized client/server
- **Testing complexity**: Multiple phase-skip paths to test
- **UX complexity**: Conditional UI based on skip availability
- **Validation overhead**: Every skip triggers validation logic

## Rationale

### Why are Phases 1-3 and 6 mandatory?

**Phase 1 (Setup)**: Without household identity and profile type, the system cannot:
- Isolate data to the correct household
- Determine appropriate financial goals/advice
- Maintain multi-household separation
→ **Mandatory**

**Phase 2 (Accounts)**: Without declared accounts, the system cannot:
- Accept financial statements
- Build FinancialSnapshot
- Calculate cash flow, debt, or net worth
→ **Mandatory**

**Phase 3 (Statements)**: Without financial statements, the system cannot:
- Calculate baseline balances
- Detect income/expense patterns
- Provide financial health assessment
- Generate meaningful recommendations
→ **Mandatory**

**Phase 6 (Review)**: Without review and approval, the system cannot:
- Confirm user understands their financial state
- Obtain consent for data collection
- Launch advisor with correct baseline
- Establish audit trail
→ **Mandatory**

### Why are Phases 4-5 optional?

**Phase 4 (Context)**: Income/expense detection is enhancing but not blocking:
- Users can use advisor without auto-detected context
- Context can be refined/corrected later as more data arrives
- Missing context degrades recommendations, not core function
→ **Optional**

**Phase 5 (Profile)**: User preferences are for advisor behavior, not data integrity:
- Default preferences allow advisor to function
- Preferences can be changed anytime
- Skipping does not affect financial calculations
→ **Optional**

### Why enforce on both client and server?

| Layer | Purpose |
|-------|---------|
| Client | Fast feedback, responsive UX, disable skip button |
| Server | Security, policy enforcement, prevent bypass |

**Rationale**: Client-side validation improves UX; server-side validation prevents spoofing or API manipulation.

## Configurable vs Hard-coded

**Decision**: Keep skip policy hard-coded in service layer (not fetched from backend).

**Rationale**:
- Skip policy is a product decision, not a per-household configuration
- Changing policy requires product review, not runtime adjustment
- Reduces API calls and database queries during onboarding
- Easier to test and reason about

**If policy needs to become dynamic** (e.g., per-user role):
1. Add skip_policy_version to household
2. Fetch policy from backend on init
3. Cache in Context
4. Validate against cached policy

## Testing Strategy

### Unit Tests
- `canSkipPhase()` returns true only when all requirements met
- `getSkipValidationError()` returns correct error message
- Policy matrix covers all 6 phases
- Phase ordering enforced (cannot skip earlier required phases)

### Integration Tests
- Skip button visible/disabled correctly based on policy
- Skip operation succeeds when policy allows
- Skip operation rejected (with error) when policy prohibits
- API validation matches client-side policy

### E2E Tests
- User cannot skip Phase 1, 2, 3, or 6
- User can skip Phase 4 and 5 after Phase 3 complete
- Skipped phase data preserved
- User can revisit skipped phase anytime
- Skip creates audit trail entry

## Future Enhancements

### Per-household Skip Policies
If business needs vary by user role or household type:
1. Add skip_policy_id to household
2. Implement policy versioning/variants
3. Fetch policy from backend during init
4. Cache in Context with TTL

### Skip Reason Tracking
Track why users skip phases for analytics:
```typescript
interface SkipEvent {
    householdId: EntityId;
    phase: OnboardingPhase;
    skippedAt: Date;
    reason?: string;  // User-provided reason (optional)
    nextPhase: OnboardingPhase;
}
```

### Deferred Completion
Allow users to complete skipped phases later:
1. Track which phases were skipped
2. Provide "Complete Later" section in advisor UI
3. Notify user when skipped phase becomes critical

### Policy Learning
Monitor skip patterns to inform future policy:
- Which phases are most frequently skipped?
- Do skipped phases lead to support issues?
- Should skippability change based on patterns?

## References
- Implementation: `apps/web/src/services/skipValidation.ts`
- UI Integration: `apps/web/src/components/onboarding/OnboardingFlow.tsx`
- Backend Enforcement: `apps/api/src/routes/pg-onboarding.routes.ts`
- PRODUCT_BUILD_CONTRACT.md § Onboarding Phases
- AGENTS.md § Phase Skip Logic
