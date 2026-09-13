# ADR-006: Validation Independence

**Status**: Accepted  
**Date**: 2026-09-13  
**Deciders**: Architecture Team  

---

## Context

For recommendations to be trustworthy, the validation step must be independent of the recommendation itself. An independent validator that recalculates figures and challenges assumptions catches errors and prevents biased recommendations from being delivered.

## Decision

1. **Validator is Independent**: The validator never receives the LLM output or recommendation template. It operates on:
   - Financial snapshot (current balances, income, expenses)
   - Scenarios (alternative financial states)
   - Policy constraints (household rules)
   - Evidence (research used)

2. **Validation Covers**: Math (recalculates all figures), Policy (checks constraints), Freshness (data is current), Assumptions (identifies risks), Alternatives (challenges "is there a better option?")

3. **Adversarial Challenge**: The validator explicitly attempts to construct a counter-recommendation: "What would make this recommendation wrong?" This surfaces weaknesses and edge cases.

4. **Validation Status**:
   - PASS: All checks successful
   - PASS_WITH_WARNINGS: Logic correct but data is stale or assumptions are risky
   - FAIL: Math error, policy violation, or required research failed
   - INSUFFICIENT_INFORMATION: Cannot validate due to missing data
   - Only PASS or PASS_WITH_WARNINGS allow delivery

## Consequences

### Positive
- Catches recommendation errors before delivery
- Prevents overconfident or policy-violating recommendations
- Forces explicit handling of uncertainty and risk
- Increases user trust in recommendations

### Negative
- Validator complexity (more code to test)
- Validation can fail for good-faith recommendations (forces graceful handling)
- Requires validator to be kept in sync with business rules

## Implementation Rules

1. **Validator Invocation**
   - Always run: `validateRecommendation(recommendation, snapshot, policy)`
   - Never skip or mock out in production
   - Never deliver if validation status is FAIL

2. **Validator Output**
   - Returns: `ValidationResult` with status, summary, and detailed checks
   - Identifies specific failures or warnings
   - Suggests fixes or alternatives
   - Never fabricated or synthesized

3. **Failed Validation Handling**
   - Recommendation is not stored as APPROVED
   - User receives explanation (not an error)
   - System offers to regenerate with different assumptions or constraints
   - Journal records validation failure for audit

4. **Validator Testing**
   - Tests validate known good scenarios (PASS)
   - Tests validate known policy violations (FAIL)
   - Tests validate stale data (PASS_WITH_WARNINGS)
   - Tests validate insufficient data (INSUFFICIENT_INFORMATION)

## References
- PRODUCT_BUILD_CONTRACT.md § 5 Validation is Independent
- SLICE_5_VALIDATION_FINDINGS.md § HIGH Finding #2
- packages/domain/recommendation-validator.ts
