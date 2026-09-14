# Onboarding Phase 1: Unit & Integration Test Suite

**Document Version:** 1.0  
**Date Created:** 2026-09-13  
**Test Framework:** Jest  
**Approach:** Test-Driven Development (TDD)

---

## Overview

This document describes the comprehensive test suite for Household Onboarding Phase 1: Foundation & Planning. The tests follow TDD principles with Red-Green-Refactor cycles, ensuring code correctness before implementation.

**Testing Strategy:**
- **Red:** Write failing tests that define expected behavior
- **Green:** Implement code to make tests pass
- **Refactor:** Improve code quality while maintaining test coverage

---

## Test Suite Structure

### 1. Unit Tests: Data Model Validation

**File:** `packages/domain/__tests__/onboarding/onboarding-progress.model.test.ts`

**Purpose:** Verify OnboardingProgress data model structure and behavior

**Test Coverage:**

| Category | Test Count | Examples |
|----------|-----------|----------|
| Initialization | 2 | Create new progress in Phase 1, initialize all 6 phases |
| Phase Completion Tracking | 3 | Mark phase complete, multiple phases, calculate time |
| State Transitions | 3 | NOT_STARTED → IN_PROGRESS, IN_PROGRESS → COMPLETE, etc. |
| Checkpoint Tracking | 2 | Store checkpoint, update on resume |
| Audit Trail | 2 | Track creator/updater, maintain immutable timestamps |
| Constraint Validation | 2 | UNIQUE household_id, valid phase numbers 1-6 |

**Key Test Scenarios:**

```
✓ Should create onboarding progress in Phase 1 with NOT_STARTED state
✓ Should mark phase as completed with timestamp when data provided
✓ Should support multiple phases completed simultaneously
✓ Should track transition from NOT_STARTED to IN_PROGRESS
✓ Should store latest checkpoint for resume functionality
✓ Should reject duplicate household_id
✓ Should enforce valid phase numbers (1-6)
```

**Type Safety Verification:**
- TypeScript strict mode ensures type correctness
- All OnboardingProgress properties validated
- Phase data structure matches specifications

---

### 2. Unit Tests: State Machine

**File:** `packages/domain/__tests__/onboarding/onboarding-state-machine.test.ts`

**Purpose:** Define and validate all valid state transitions

**Test Coverage:**

| Category | Test Count | Examples |
|----------|-----------|----------|
| Valid Transitions | 5 | NOT_STARTED→IN_PROGRESS, IN_PROGRESS→PAUSED, PAUSED→IN_PROGRESS |
| Invalid Transitions | 3 | COMPLETE→*, NOT_STARTED→COMPLETE, etc. |
| Phase Progression | 5 | Sequential 1-6, skip forward, go backward, invalid phases |
| State Machine Rules | 5 | COMPLETE implies all phases done, IN_PROGRESS rules, timestamps |
| Visualization | 2 | All transitions mapping, terminal state handling |

**State Machine Diagram:**

```
         start
           ↓
    NOT_STARTED
           ↓
      IN_PROGRESS ←──┐
       ↙      ↖      │
     PAUSED   COMPLETE (terminal)
       ↘      ↙
        ABANDONED
           ↓
     (can restart)
```

**Key Test Scenarios:**

```
✓ Should allow transition from NOT_STARTED to IN_PROGRESS
✓ Should allow transition from IN_PROGRESS to PAUSED
✓ Should allow transition from PAUSED back to IN_PROGRESS (resume)
✓ Should NOT allow transition from COMPLETE to any state
✓ Should enforce: COMPLETE state implies all phases completed
✓ Should enforce: timestamp monotonicity (lastActivityAt >= startedAt)
✓ Should provide all valid transitions for each state
```

**Coverage:** 100% of state transitions validated

---

### 3. Unit Tests: Phase Validators

**File:** `packages/domain/__tests__/onboarding/phase-validators.test.ts`

**Purpose:** Test validation logic for each of 6 phases

**Test Coverage per Phase:**

| Phase | Required Fields | Validation Tests | Edge Cases |
|-------|-----------------|------------------|-----------|
| 1 (Setup) | householdName, profileType, primaryMemberId | 6 tests | max length, enum values |
| 2 (Accounts) | declaredAccounts array, institution, accountType | 6 tests | array validation, balances |
| 3-6 | Covered by integration tests (complex data) | - | - |

**Validator Test Scenarios:**

```
Phase 1: Setup
  ✓ Should validate required household name
  ✓ Should validate household name max length (255 chars)
  ✓ Should validate profile type enum (SOLO, COUPLE, FAMILY)
  ✓ Should require primary member ID
  ✓ Should warn if no institutions selected (WARNING not ERROR)
  ✓ Should pass valid Phase 1 data
  ✓ Should accept all valid profile types

Phase 2: Accounts
  ✓ Should require at least one declared account
  ✓ Should validate account institution is provided
  ✓ Should validate account type enum
  ✓ Should warn if account balance is negative
  ✓ Should validate multiple accounts independently
  ✓ Should accept all valid account types
  ✓ Should pass valid Phase 2 data
```

**Error vs Warning Classification:**

```
Errors (block phase completion):
  - Required fields missing
  - Invalid enum values
  - Type violations

Warnings (allow phase completion):
  - No institutions selected
  - Negative balance
  - Missing optional fields
```

**Key Principle:** Allow user to complete phase with warnings, but block on errors

---

### 4. Integration Tests: Database Schema & Repositories

**File:** `packages/db/__tests__/repositories/onboarding-progress.repository.test.ts`

**Purpose:** Test database constraints and repository CRUD operations

**Test Coverage:**

| Category | Test Count | Focus |
|----------|-----------|-------|
| UNIQUE Constraint | 3 | One per household, duplicates rejected, multiple households |
| CRUD Operations | 5 | Create, retrieve, complete phase, skip, update |
| Phase Progression | 3 | Sequential, skip, backward edit |
| Completion & Launch | 3 | Mark complete, calculate time, restart |
| Timestamps | 3 | Monotonicity, immutable createdAt, lastActivityAt |
| Audit Trail | 3 | Track creator/updater, immutability |
| Data Integrity | 2 | No data loss on updates, concurrent safety |

**Database Constraint Tests:**

```
UNIQUE(household_id) Constraint
  ✓ Should create first onboarding without error
  ✓ Should reject duplicate household_id
  ✓ Should allow different households to have separate records

CHECK (current_phase BETWEEN 1 AND 6)
  ✓ Enforced by validator before insert

Foreign Keys (ON DELETE CASCADE)
  ✓ Deleting household deletes onboarding_progress

Timestamp Constraints
  ✓ createdAt <= updatedAt (monotonic)
  ✓ createdAt is immutable
  ✓ startedAt <= lastActivityAt
```

**Repository CRUD Tests:**

```
CREATE
  ✓ Should create onboarding_progress in phase 1

READ
  ✓ Should retrieve existing onboarding_progress
  ✓ Should return null for non-existent household

UPDATE
  ✓ Should complete a phase and store data
  ✓ Should advance to next phase when completing current
  ✓ Should not advance beyond phase 6

DELETE
  ✓ (Covered by CASCADE tests - deleting household cascades delete)
```

**Data Integrity Tests:**

```
  ✓ Should not lose phase data on updates
  ✓ Should handle concurrent operations safely
  ✓ Should maintain immutable creation timestamp
  ✓ Should update updatedAt when progress changes
```

---

### 5. Integration Tests: Checkpoint & Resume

**File:** `packages/db/__tests__/repositories/onboarding-checkpoint.repository.test.ts`

**Purpose:** Test checkpoint save/restore for pause-resume functionality

**Test Coverage:**

| Category | Test Count | Focus |
|----------|-----------|-------|
| Checkpoint Save | 6 | Save at any phase, unique IDs, timestamps, complex data |
| Retrieval | 4 | Latest checkpoint, null handling, history, data integrity |
| Resume Workflow | 4 | Restore from checkpoint, multiple cycles, device switching, progression |
| Cleanup | 4 | Delete old, remove empty, report count, preserve recent |
| Edge Cases | 4 | Same household different sessions, empty data, special chars, rapid saves |

**Resume Workflow Tests:**

```
Basic Resume
  ✓ Should restore from checkpoint to resume onboarding
  → User completes phase 1, saves checkpoint
  → User closes browser (pause)
  → User returns, restores checkpoint
  → Checkpoint data intact, can continue to phase 2

Multiple Resume Cycles
  ✓ Should handle multiple save/resume cycles
  → Save at phase 1 → Advance to phase 2, save → Resume, advance to phase 3
  → Data preserved across all cycles

Device Switching
  ✓ Should distinguish between different user sessions
  → User starts on phone (session 1)
  → Later continues on laptop (session 2)
  → Each device has independent checkpoint but same household
```

**Checkpoint Data Scenarios:**

```
  ✓ Should handle empty checkpoint data
  ✓ Should handle large checkpoint data (100+ records)
  ✓ Should handle null/undefined fields
  ✓ Should handle special characters and emojis
```

**Cleanup Tests:**

```
  ✓ Should delete checkpoints older than specified days
  ✓ Should remove empty session records after cleanup
  ✓ Should report count of deleted checkpoints
  ✓ Should not delete recent checkpoints
```

---

### 6. End-to-End Integration Tests

**File:** `packages/domain/__tests__/onboarding/onboarding-e2e.test.ts`

**Purpose:** Test complete user journeys through onboarding

**Test Coverage:**

| Scenario | Duration | Complexity | Tests |
|----------|----------|-----------|-------|
| Happy Path | ~15 min | Low | Complete all 6 phases sequentially |
| Partial Completion | ~10 min | Medium | Skip phases, launch with minimal data |
| Pause & Resume | 1 min + break | High | Save at phase 2, resume later, continue |
| Error Recovery | ~5 min | Medium | Reject invalid data, retry successfully |
| Real-World | Variable | High | Mid-way abandonment, device switching |
| Performance | ~10 sec | Low | Concurrent households, rapid transitions |

**Happy Path Test:**

```
Scenario: User completes all 6 phases sequentially

  1. Start onboarding
     ✓ Session created, phase 1, IN_PROGRESS state

  2. Complete Phase 1 (Setup)
     ✓ Household name saved
     ✓ Auto-advance to phase 2

  3. Complete Phase 2 (Accounts)
     ✓ Declared accounts saved
     ✓ Auto-advance to phase 3

  4. Complete Phases 3-6
     ✓ Statements saved → phase 4
     ✓ Financial context saved → phase 5
     ✓ Profile saved → phase 6
     ✓ Launch complete → COMPLETE state

  5. Metrics
     ✓ Total time calculated
     ✓ All phases marked complete
     ✓ State is COMPLETE, not IN_PROGRESS
```

**Pause & Resume Test:**

```
Scenario: User pauses at phase 2, resumes on different device later

  Session 1 (Laptop):
    1. Start onboarding
    2. Complete Phase 1 (householdName: "Test")
    3. Complete Phase 2 (declaredAccounts: [Chase])
    4. Save checkpoint

  [12 hours pass - user closes laptop]

  Session 2 (Phone):
    1. Resume from checkpoint
       ✓ Phase 1 data restored: householdName = "Test"
       ✓ Phase 2 data restored: declaredAccounts = [Chase]
       ✓ Current phase = 3 (ready to continue)

    2. Complete Phase 3
    3. Complete Phases 4-6
    4. Launch onboarding

  Validation:
    ✓ Data continuity across devices
    ✓ Checkpoint accurately captured state
    ✓ User can complete without re-entering earlier data
```

**Error Recovery Test:**

```
Scenario: User tries to complete phase with invalid data, then retries

  1. Attempt Phase 1 with empty household name
     ✗ Validation fails: "Household name is required" (ERROR)
     ✗ Phase 1 not marked complete

  2. User corrects data and retries
     ✓ Validation passes
     ✓ Phase 1 marked complete
     ✓ Auto-advance to phase 2

  3. User can continue normally
     ✓ No error state blocking progress
```

**Real-World Scenario: Device Switching**

```
Scenario: User starts on laptop, continues on tablet, finishes on phone

  Laptop Session:
    ✓ Start onboarding
    ✓ Complete phases 1-2
    ✓ Save checkpoint (device: laptop)

  Tablet Session (different session ID):
    ✓ Resume from laptop checkpoint
    ✓ Complete phases 3-4
    ✓ Save new checkpoint (device: tablet)

  Phone Session:
    ✓ Resume from tablet checkpoint
    ✓ Complete phases 5-6
    ✓ Launch successfully

  Validation:
    ✓ All three sessions show same household
    ✓ Each phase data preserved across device switches
    ✓ Final state shows completion regardless of device
```

**Performance Test:**

```
Scenario: Handle 10 households starting onboarding concurrently

  ✓ All 10 households initialized in parallel
  ✓ Each gets unique onboarding_progress record
  ✓ No UNIQUE constraint violations
  ✓ Can proceed with independent completions
```

---

## Running the Tests

### Install Dependencies

```bash
npm install --save-dev jest @types/jest ts-jest
```

### Jest Configuration

Add to `jest.config.json`:

```json
{
  "preset": "ts-jest",
  "testEnvironment": "node",
  "testMatch": [
    "**/__tests__/**/*.test.ts"
  ],
  "collectCoverage": true,
  "collectCoverageFrom": [
    "packages/**/*.ts",
    "!packages/**/*.test.ts",
    "!packages/**/node_modules/**"
  ]
}
```

### Run Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- onboarding-progress.model.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode (auto-rerun on changes)
npm test -- --watch

# Debug specific test
node --inspect-brk node_modules/.bin/jest --runInBand onboarding-state-machine.test.ts
```

---

## Test Execution Plan

### Phase 1: Foundation (Week 1)

**Before Implementation:**
1. Create all test files (define behavior)
2. Run tests - expect all to fail (RED phase)
3. Developers review tests to confirm requirements match

**During Implementation:**
4. Implement code to pass tests (GREEN phase)
5. Refactor while maintaining test coverage
6. Each test becomes a specification of actual behavior

### Test-Driven Development Cycle

```
┌─────────────────────────────────────────────┐
│         Write Failing Test (RED)            │
│  - Define expected behavior                 │
│  - Specify inputs and outputs               │
│  - Validate error cases                     │
└────────────┬────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────┐
│    Implement Code to Pass Test (GREEN)      │
│  - Write minimal code to pass tests         │
│  - No over-engineering                      │
│  - All tests should pass                    │
└────────────┬────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────┐
│      Refactor Code (REFACTOR)               │
│  - Improve code quality                     │
│  - Optimize performance                     │
│  - Maintain test coverage                   │
└────────────┬────────────────────────────────┘
             │
             ↓
        ✓ Tests Still Pass
             │
             ↓
        Next Feature
```

---

## Coverage Targets

### Unit Tests

| Module | Target Coverage | Current |
|--------|-----------------|---------|
| OnboardingProgress Model | 95%+ | - |
| State Machine | 100% | - |
| Phase Validators | 90%+ | - |

### Integration Tests

| Module | Target Coverage | Current |
|--------|-----------------|---------|
| OnboardingProgressRepository | 90%+ | - |
| OnboardingCheckpointRepository | 90%+ | - |
| End-to-End Flows | 80%+ | - |

### Overall Target: 85%+ code coverage

---

## Test Failure Scenarios

### Common Failures & Solutions

| Failure | Cause | Solution |
|---------|-------|----------|
| `TypeError: Cannot read property 'X'` | Null/undefined value | Add null checks before property access |
| `Constraint violation: UNIQUE` | Duplicate data | Ensure test isolation, mock database properly |
| `Timeout exceeded` | Async operation too slow | Increase Jest timeout: `jest.setTimeout(10000)` |
| `State transition invalid` | Logic error in state machine | Review state transition rules |
| `Checkpoint data mismatch` | Serialization issue | Verify JSON.stringify/parse or use snapshots |

### Debugging Tests

```bash
# Run single test with verbose output
npm test -- --verbose onboarding-progress.model.test.ts

# Print stack trace for debugging
npm test -- --no-coverage

# Debug in Chrome DevTools
node --inspect-brk node_modules/.bin/jest --runInBand
```

---

## Test Maintenance

### When to Update Tests

1. **Specification Changes**
   - Update test expectations to match new spec
   - Add tests for new edge cases

2. **Bug Fixes**
   - Add regression test for bug before fixing
   - Test should verify bug is fixed

3. **Performance Changes**
   - Update test timeouts if needed
   - Add performance benchmarks

4. **Refactoring**
   - Tests should still pass unchanged
   - If tests need changes, refactoring is too invasive

### Test Documentation

Each test should have clear comments:

```typescript
describe('Onboarding Progress Model', () => {
  it('should create a new onboarding progress in Phase 1 with NOT_STARTED state', () => {
    // Arrange: Create input data
    const householdId = uuidv4();

    // Act: Perform operation
    const progress: OnboardingProgress = {
      /* ... */
    };

    // Assert: Verify expected behavior
    expect(progress.currentPhase).toBe(1);
    expect(progress.currentState).toBe(OnboardingState.NOT_STARTED);
  });
});
```

---

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test -- --coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

---

## Future Phases

### Phase 2 Tests (During Development)
- Add integration tests for API endpoints
- Test database schema migrations
- Add end-to-end UI tests (Playwright/Cypress)

### Phase 3 Tests (During Testing)
- Performance tests with realistic data volumes
- Load tests (concurrent households)
- Security tests (injection, authorization)

### Phase 4 Tests (Post-Launch)
- A/B testing of UX variations
- Monitoring and alerting tests
- Regression test suite for production issues

---

## References

**TDD Resources:**
- [Test-Driven Development: By Example](https://www.pearson.com/en-us/subject-catalog/p/test-driven-development-by-example/P200000009262) - Kent Beck
- [Jest Documentation](https://jestjs.io/)
- [TypeScript Testing Best Practices](https://www.typescriptlang.org/docs/handbook/testing.html)

**Project Documentation:**
- [HOUSEHOLD_ONBOARDING_FEATURE.md](./HOUSEHOLD_ONBOARDING_FEATURE.md) - Product design
- [HOUSEHOLD_ONBOARDING_IMPLEMENTATION_PLAN.md](./HOUSEHOLD_ONBOARDING_IMPLEMENTATION_PLAN.md) - Implementation roadmap

---

## Approval & Sign-Off

| Role | Name | Date | Approval |
|------|------|------|----------|
| Tech Lead | | | ☐ |
| QA Lead | | | ☐ |
| Product Manager | | | ☐ |

**Notes:**
- All tests should pass before proceeding to implementation
- Coverage reports should be reviewed by tech lead
- Any test changes require documentation of reasoning

---

**Test Suite Version:** 1.0  
**Last Updated:** 2026-09-13  
**Next Review:** Upon Phase 2 commencement
