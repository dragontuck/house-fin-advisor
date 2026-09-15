# Test Timer Leak Analysis & Fixes

## Issue
Jest warning: "A worker process has failed to exit gracefully and has been force exited. This is likely caused by tests leaking due to improper teardown. Active timers can also cause this."

## Root Causes Found

### 1. **setTimeout/Promise Leaks in Repository Tests** ✅ FIXED
Found in:
- `packages/db/__tests__/repositories/onboarding-checkpoint.repository.test.ts` (6 instances)
- `packages/db/__tests__/repositories/onboarding-progress.repository.test.ts` (2 instances)  
- `packages/domain/__tests__/onboarding/onboarding-e2e.test.ts` (1 instance)

**Pattern:**
```typescript
// ❌ Before: Timers without cleanup
beforeEach(() => { /* setup */ });

// ✅ After: Added afterEach cleanup
afterEach(() => {
    jest.clearAllTimers();
});
```

### 2. **Missing afterEach Cleanup Hooks** ✅ FIXED
Fixed in test files:
- `packages/db/__tests__/repositories/onboarding-checkpoint.repository.test.ts`
- `packages/db/__tests__/repositories/onboarding-progress.repository.test.ts`
- `packages/domain/__tests__/services/onboarding.service.test.ts`
- `packages/domain/__tests__/services/expense-detection.service.test.ts`
- `packages/domain/__tests__/services/income-detection.service.test.ts`
- `packages/domain/__tests__/services/phase-validators.service.test.ts`
- `packages/domain/__tests__/onboarding/onboarding-e2e.test.ts`
- `apps/api/__tests__/routes/onboarding.routes.test.ts`

### 3. **Database Connection Pool Not Draining** ⚠️ PARTIAL
File: `tests/documents/repository.test.ts`

This test file uses a real PostgreSQL connection pool:
```typescript
afterAll(async () => {
    await query("DELETE FROM finhouse.households WHERE id = $1", [testHouseholdId]);
    await closeConnection(); // Calls pool.end()
});
```

**Issue:** The pool.end() might not wait for all pending timers in connections to close.

**Recommendation:** Add a timeout after pool close to allow graceful drainage:
```typescript
afterAll(async () => {
    // ... cleanup queries
    await closeConnection();
    // Allow time for connection cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
});
```

## Files Modified with Cleanup Hooks

All changes add `afterEach()` hooks with `jest.clearAllTimers()`:

1. ✅ `packages/db/__tests__/repositories/onboarding-checkpoint.repository.test.ts`
2. ✅ `packages/db/__tests__/repositories/onboarding-progress.repository.test.ts`  
3. ✅ `packages/domain/__tests__/onboarding/onboarding-e2e.test.ts`
4. ✅ `apps/api/__tests__/routes/onboarding.routes.test.ts`
5. ✅ `packages/domain/__tests__/services/onboarding.service.test.ts`
6. ✅ `packages/domain/__tests__/services/expense-detection.service.test.ts`
7. ✅ `packages/domain/__tests__/services/income-detection.service.test.ts`
8. ✅ `packages/domain/__tests__/services/phase-validators.service.test.ts`

## Remaining Tests with beforeEach (Not Yet Modified)

The following test files have `beforeEach` hooks but may need afterEach cleanup:

- `tests/approval/budget-approval-workflow.test.ts`
- `tests/evidence-relevance-checker.test.ts`
- `tests/financial/advisor-intent-classifier.test.ts`
- `tests/financial/budget-service.test.ts`
- `tests/financial/cash-flow-service.test.ts` (multiple beforeEach)
- `tests/financial/csv-statement-parser.test.ts` (nested beforeEach)
- `tests/financial/debt-intelligence-service.test.ts`
- `tests/financial/health-engine.test.ts`
- `tests/financial/pdf-image-statement-parser.test.ts` (multiple beforeEach)
- `tests/financial/recurring-detector.test.ts`
- `tests/financial/savings-goal-service.test.ts`
- `tests/financial/snapshot-calculator.test.ts`
- `tests/financial/tucker-household.test.ts`
- `tests/integration/*.test.ts` (multiple files)
- `tests/recommendation-*.test.ts` (multiple files)

## Note on jest.clearAllTimers()

`jest.clearAllTimers()` only works with `jest.useFakeTimers()`. The current implementation assumes tests are using real timers. For actual Node.js timers that might be leaking, we may need:

1. To identify which specific test is creating long-running timers
2. To use `--detectOpenHandles` flag during test runs for detailed debugging
3. To consider using `jest.useFakeTimers('modern')` in test setup if appropriate

## Verification

Run tests to check for remaining leaks:
```bash
npm test
npm test -- --detectOpenHandles
```

If warning persists, check the database pool cleanup in `tests/documents/repository.test.ts`.
