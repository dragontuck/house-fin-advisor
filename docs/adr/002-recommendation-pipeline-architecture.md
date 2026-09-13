# ADR-002: Recommendation Pipeline Architecture

**Status**: Accepted  
**Date**: 2026-09-13  
**Deciders**: Architecture Team  

---

## Context

Slice 5 requires transformation of conversational AI into a structured, governable recommendation system. Recommendations must be:
- Independently validated
- Grounded in financial data and research
- Auditable from question to decision
- Delivered with confidence levels and evidence

## Decision

Recommendations follow a **strictly typed, deterministic pipeline** executed by domain services:

1. **Scenario Construction**: Build scenarios from user intent and financial snapshot
2. **Candidate Generation**: Generate alternative recommendation candidates from scenarios
3. **Validation**: Independently validate each candidate against policy, math, and data freshness
4. **Selection**: Choose the best candidate and set as final recommendation
5. **Persistence**: Save recommendation and full decision journal before delivery
6. **Approval**: Wait for explicit user approval before state changes

The **LLM orchestrates**, but **domain services decide**. The LLM never:
- Directly generates recommendations
- Skips validation
- Fabricates confidence or validation status
- Changes household financial state

## Consequences

### Positive
- Recommendations are reproducible from journal entries
- Validation is independent and cannot be bypassed
- Confidence is grounded in data quality, not LLM opinion
- All alternatives, assumptions, risks are domain-derived
- Failed validation prevents risky recommendations from being delivered

### Negative
- More complex domain code (scenario builder, candidate generator, validator)
- LLM cannot make the final decision unilaterally
- Requires upstream integration work in ai-orchestrator.ts
- Requires new API routes for recommendation lifecycle

## Implementation Rules

1. **Pipeline Execution**
   - Always run full pipeline: scenario → candidate → validation → selection
   - Never extract strings from LLM response and call them "recommendations"
   - Validation must pass before delivery (FAIL status blocks delivery)

2. **Validation Independence**
   - Validator recalculates all figures
   - Validator is never informed of LLM output
   - Validator cannot be skipped or mocked out

3. **Decision Journal**
   - Record every pipeline stage with inputs/outputs
   - Include tool results, scenarios, candidates, validation details
   - Journal is immutable; approval is append-only

4. **Recommendation Contract**
   - Must include: `financial_snapshot_id`, `policy_version`, `validation_result`, `evidence`, `alternatives`, `assumptions`, `risks`, `confidence`
   - Never include UI-synthesized fields
   - Never include hardcoded assumptions

## References
- PRODUCT_BUILD_CONTRACT.md § 1.4 Recommendations are Structured, Typed, and Governed
- SLICE_5_VALIDATION_FINDINGS.md § CRITICAL Finding #1
- packages/domain/recommendation-builder.ts
- packages/domain/recommendation-validator.ts
