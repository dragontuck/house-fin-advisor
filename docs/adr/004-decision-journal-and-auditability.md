# ADR-004: Decision Journal and Auditability

**Status**: Accepted  
**Date**: 2026-09-13  
**Deciders**: Architecture Team  

---

## Context

Slice 5 requires full auditability of recommendation decisions. When asked "Why did you recommend X?", the system must reproduce the exact financial context, research, scenarios, and validation that led to the recommendation. This demands a complete, immutable record of the decision-making process.

## Decision

1. **Decision Journal**: Every recommendation is recorded with complete lineage:
   - User intent and message
   - Financial snapshot (identity and version)
   - Scenarios constructed
   - Tool results
   - Research gathered (with sources and freshness)
   - Candidate recommendations generated
   - Validation details
   - Final recommendation selected
   - Assumptions, risks, confidence
   - Approval status and user decision

2. **Journal is Immutable**: Once recorded, journal entries cannot be edited. Approval and decline decisions are appended as separate records.

3. **Reproducibility**: From a saved journal entry, the recommendation can be deterministically replayed if snapshot and policy versions have not changed.

4. **Retirement**: Recommendations expire when snapshot version or policy version changes. The journal remains for historical audit, but the recommendation is no longer current.

## Consequences

### Positive
- Full audit trail from question to decision
- Can reproduce historical recommendations
- Can explain why a recommendation is no longer current
- Supports investigative debugging and trust verification

### Negative
- More database storage (complete lineage per recommendation)
- Requires careful state management (journal immutability)
- Replay depends on snapshot and policy stability

## Implementation Rules

1. **Journal Entry Recording**
   - Record at every pipeline stage: scenario construction, candidate generation, validation, selection
   - Include tool results (inputs and outputs)
   - Include timing information for performance analysis
   - Never skip journal recording for "quick" or "test" runs

2. **Journal Schema**
   ```sql
   CREATE TABLE decision_journal (
     id UUID PRIMARY KEY,
     household_id UUID NOT NULL,
     recommendation_id UUID,
     stage VARCHAR(50),  -- INTENT, CONTEXT_GATHERED, SCENARIOS_BUILT, etc.
     stage_timestamp TIMESTAMP,
     input JSONB,        -- User intent, message
     scenarios JSONB,    -- Full scenario details
     research JSONB,     -- Evidence with source tier, freshness, verification
     candidates JSONB,   -- All candidates with reasoning
     validation JSONB,   -- Validation result and details
     final JSONB,        -- Selected recommendation
     created_at TIMESTAMP
   );
   ```

3. **Approval Recording**
   - User approval/decline is a separate, appended record
   - Approval does not modify the original recommendation
   - Approval decision is auditable (who, when, reason)

4. **Expiration Handling**
   - When snapshot or policy version changes, recommendation is marked stale
   - Journal remains accessible for audit
   - New recommendation must be generated if user asks again

## References
- PRODUCT_BUILD_CONTRACT.md § 1.5 Explainability and Auditability
- packages/domain/decision-journal-service.ts
- packages/db/migrations/017_add_decision_journal.sql
