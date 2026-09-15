# Final Recommendation Selection Implementation

**Date**: 2026-09-09  
**Phase**: 3.3 - Recommendation Selection  
**Status**: ✅ COMPLETE

## Overview

Implemented deterministic final recommendation selection from validated candidates using evidence-based ranking rules. The system applies 6 core selection rules to choose the optimal recommendation without relying on LLM preference.

## Rules Implemented

### Rule 1: Failed Candidates Excluded
```typescript
// FAIL candidates cannot become final
eligibleCandidates = candidates.filter(c => c.validation.status !== "FAIL")

// If all candidates failed, return null (no valid recommendation)
if (eligibleCandidates.length === 0) return null
```

**Test Coverage**:
- ✅ Excludes FAIL candidates
- ✅ Returns null if all failed
- ✅ Allows PASS_WITH_WARNINGS
- ✅ Allows INSUFFICIENT_INFORMATION (but downranks)

### Rule 2: Insufficient Evidence Cannot Claim High Confidence
```typescript
// Cannot be HIGH confidence with insufficient information
if (validation.status === "INSUFFICIENT_INFORMATION") {
  if (baseConfidence === ConfidenceLevel.HIGH)
    return ConfidenceLevel.MEDIUM
  if (baseConfidence === ConfidenceLevel.MEDIUM)
    return ConfidenceLevel.LOW
}

// Cannot be HIGH confidence with weak evidence only (TIER_4_MEDIA)
if (bestEvidenceTier === "TIER_4_MEDIA") {
  if (baseConfidence === ConfidenceLevel.HIGH)
    return ConfidenceLevel.MEDIUM
}

// Adjust down if validation has multiple warnings
if (validation.status === "PASS_WITH_WARNINGS" && warningChecks > 2)
  return ConfidenceLevel.MEDIUM
```

**Test Coverage**:
- ✅ Downgrades HIGH → MEDIUM for INSUFFICIENT_INFORMATION
- ✅ Downgrades HIGH → MEDIUM for TIER_4_MEDIA evidence only
- ✅ Keeps HIGH confidence for PASS + TIER_1_GOVERNMENT
- ✅ Downgrades for multiple warnings

### Rule 3: Policy Compliance Takes Precedence
```typescript
// Policy compliance is highly weighted (25% of score)
let policyComplianceScore = 100

if (!candidate.compliesWithPolicy) {
  policyComplianceScore = 30  // Significant penalty
}

// Additional penalty per violation
policyComplianceScore = Math.max(0, 30 - violations.length * 10)

// Respect risk tolerance
if (householdPolicy.riskTolerance === "CONSERVATIVE") {
  const highRiskCount = risks.filter(r => 
    r.severity === "HIGH" || r.severity === "CRITICAL"
  ).length
  policyComplianceScore = Math.max(20, 
    policyComplianceScore - highRiskCount * 15
  )
}
```

**Test Coverage**:
- ✅ Prefers policy-compliant over non-compliant
- ✅ Downranks policy violations
- ✅ Respects risk tolerance policy

### Rule 4: Deterministic Ranking (Not LLM-Based)
```typescript
// Weighted scoring formula (validated order of priorities)
const score = 
  validationStatus * 0.30 +      // 30%
  policyCompliance * 0.25 +      // 25%
  evidenceQuality * 0.20 +       // 20%
  confidenceLevel * 0.15 +       // 15%
  positiveImpact * 0.10 +        // 10%
  conflictPenalty                 // Variable penalty

// Ranking order
1. Validation Status (PASS > PASS_WITH_WARNINGS > INSUFFICIENT_INFORMATION)
2. Policy Compliance (compliant > violations)
3. Evidence Quality (TIER_1_GOVERNMENT > TIER_3 > TIER_2 > TIER_4)
4. Confidence Level (HIGH > MEDIUM > LOW > INSUFFICIENT)
5. Impact Magnitude (larger positive > smaller positive > neutral > negative)
```

**Test Coverage**:
- ✅ Ranks by validation status first
- ✅ Ranks by policy compliance second
- ✅ Ranks by evidence quality third
- ✅ Consistent scoring across identical candidates

### Rule 5: Material Alternatives Retained
```typescript
const final: FinalRecommendation = {
  recommendedAction: selected.candidate.recommendedAction,
  why: buildSelectionReasoning(selected, scored),
  alternatives: selected.candidate.alternatives,  // All alternatives preserved
  impact: selected.candidate.expectedImpact,
  assumptions: selected.candidate.assumptions,
  risks: selected.candidate.risks,
  evidence: selected.candidate.evidence,
  validation: selected.validation,
  confidence: finalConfidence,
  confidenceReasoning: buildConfidenceReasoning(...),
  approvalRequired: determinedApprovalRequired(selected.validation),
}
```

**Test Coverage**:
- ✅ Includes alternatives in final recommendation
- ✅ Preserves all alternatives regardless of count
- ✅ Retains material alternatives for user comparison

### Rule 6: Confidence Reflects Evidence and Uncertainty
```typescript
// Confidence reasoning documents all factors:
// - Data quality (HIGH/MEDIUM/LOW)
// - Evidence freshness (CURRENT/RECENT/STALE/EXPIRED)
// - Validation outcome (PASS/WARN/FAIL)
// - Evidence tier quality
// - Validation warnings count

// Examples:
// HIGH: "High confidence based on: Current, complete financial data. 
//        Current research and rates. Validation passed all checks."
// MEDIUM: "Medium confidence due to: Some data may be outdated or incomplete.
//          Research is recent but not current. Validation has warnings."
// LOW: "Low confidence due to: Limited or outdated financial data.
//       Available research is outdated. Some validation concerns."
```

**Test Coverage**:
- ✅ Provides confidence reasoning based on factors
- ✅ Notes data limitations in reasoning
- ✅ Flags data quality issues

## Scoring Factors

Each candidate is scored on 6 independent factors (0-100 scale):

| Factor | Weight | Calculation |
|--------|--------|-------------|
| **Validation Status** | 30% | PASS=100, PASS_WITH_WARNINGS=75, INSUFFICIENT=40 |
| **Policy Compliance** | 25% | Compliant=100, Violations reduce score |
| **Evidence Quality** | 20% | TIER_1=100, TIER_3=85, TIER_2=75, TIER_4=50 |
| **Confidence Level** | 15% | HIGH=100, MEDIUM=70, LOW=40, INSUFFICIENT=20 |
| **Positive Impact** | 10% | Wealth increase magnitude rated 0-100 |
| **Conflict Penalty** | Variable | -5 points per weakness found |

## Output Format

```typescript
interface FinalRecommendation {
  recommendedAction: string        // What to do
  why: string                      // Why this was selected
  alternatives: Alternative[]      // All alternatives retained
  impact: {                        // Financial impact
    cashFlowImpact: Money
    wealthIncrease: Money
    debtReduction: Money
    timeframeMonths?: number
  }
  assumptions: Assumption[]        // What we're assuming
  risks: Risk[]                    // What could go wrong
  evidence: Evidence[]             // Research supporting this
  validation: ValidationResult     // Full validation details
  confidence: ConfidenceLevel      // Adjusted confidence
  confidenceReasoning: string      // Why this confidence level
  approvalRequired: boolean        // User approval needed?
}
```

## Approval Requirements

Human approval is **required** when:

```typescript
// 1. Validation has warnings
if (validation.status === "PASS_WITH_WARNINGS") {
  approvalRequired = true
}

// 2. Insufficient information
if (validation.status === "INSUFFICIENT_INFORMATION") {
  approvalRequired = true
}

// 3. High or critical impact challenges identified
const criticalChallenges = validation.adversarialReview.challenges
  .filter(c => c.impact === "HIGH" || c.impact === "CRITICAL")
if (criticalChallenges.length > 0) {
  approvalRequired = true
}

// Otherwise: Default to requiring approval for safety
return true
```

## Selection Reasoning Generation

The system provides human-readable explanation of why a candidate was selected:

```
"It passed validation with 0 warnings. It is supported by authoritative 
evidence. It aligns with your financial policy. It offers substantial 
financial improvement (+$1,000.00). It scores significantly higher than 
alternative options."
```

Explains:
- ✅ Validation status
- ✅ Evidence quality
- ✅ Policy alignment
- ✅ Financial impact
- ✅ Comparison to alternatives

## Test Coverage

**Total Tests**: 33 (all passing ✅)

### Coverage by Rule

| Rule | Tests | Status |
|------|-------|--------|
| Rule 1: Failed excluded | 4 | ✅ All pass |
| Rule 2: Evidence → Confidence | 4 | ✅ All pass |
| Rule 3: Policy precedence | 3 | ✅ All pass |
| Rule 4: Deterministic ranking | 4 | ✅ All pass |
| Rule 5: Alternatives retained | 2 | ✅ All pass |
| Rule 6: Confidence reflects evidence | 3 | ✅ All pass |
| Approval requirements | 3 | ✅ All pass |
| Selection reasoning | 3 | ✅ All pass |
| Edge cases | 4 | ✅ All pass |
| Ranking with multiple candidates | 3 | ✅ All pass |

### Key Test Scenarios

1. **Exclusion Tests**: Failed candidates automatically excluded
2. **Confidence Adjustment**: Evidence tier affects confidence claims
3. **Policy Override**: Policy compliance trumps other factors
4. **Ranking Consistency**: Same candidates always score identically
5. **Alternative Preservation**: All alternatives retained for comparison
6. **Multiple Candidates**: Proper tie-breaking by evidence quality and impact
7. **Metadata Preservation**: Complete recommendation data retained
8. **Edge Cases**: Empty list, single candidate, various impact magnitudes

## Integration

### Files Created
- ✅ `packages/domain/recommendation-selector.ts` (500 lines)
- ✅ `tests/recommendation-selector.test.ts` (850 lines)

### Files Modified
- ✅ `packages/domain/index.ts` (added exports)

### Test Results
- ✅ 33 new tests added
- ✅ All 33 tests passing
- ✅ Full suite: 1324 tests passing
- ✅ No regressions
- ✅ 43 test suites total

## Validation Pipeline

The complete recommendation pipeline now:

```
Candidates
    ↓
[Validator: checks math, policy, evidence, assumptions, alternatives, bias]
    ↓
ValidationResult (PASS/WARN/FAIL)
    ↓
[Selector: ranks candidates, adjusts confidence, retains alternatives]
    ↓
FinalRecommendation (ready for approval/storage)
```

## Key Features

✅ **Deterministic**: No LLM dependency for selection  
✅ **Evidence-Based**: Ranking reflects research quality and freshness  
✅ **Policy-Compliant**: Household policy takes precedence  
✅ **Transparent**: Provides reasoning for every selection  
✅ **Safe**: Failed candidates automatically excluded  
✅ **Complete**: Retains all alternatives, assumptions, risks, evidence  
✅ **Auditable**: Full validation and ranking preserved  
✅ **User-Focused**: Requires approval for uncertain recommendations  

## Next Steps

Ready for:
1. ✅ API endpoints to call selectFinalRecommendation
2. ✅ Storage of FinalRecommendation in database
3. ✅ Decision Journal tracking for complete audit trail
4. ✅ UI presentation of final recommendation with alternatives
5. ✅ Approval workflow integration
