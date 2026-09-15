# Architecture Decision Records (ADRs)

This directory contains the Architecture Decision Records for the AI Financial Advisor project. Each ADR documents an important architectural decision, the context that led to it, alternatives considered, and consequences.

---

## Index of ADRs

### Core Financial Architecture

#### [ADR-001: Money Representation](001-money-representation.md)
**Status**: Accepted | **Date**: 2026-09-13

All monetary values are represented as integer cent amounts (e.g., $10.50 = 1050 cents). Conversions to decimal representation occur only for display.

**Key Decision**: No floating-point arithmetic; all calculations use integers.

---

### AI and Privacy Architecture

#### [ADR-003: Privacy Boundary and AI Tool Access](003-privacy-boundary-and-ai-tools.md)
**Status**: Accepted | **Date**: 2026-09-13

All external LLM calls pass through a privacy gateway that removes identifiers, blocks secrets, and constructs minimal derived context. The LLM has tool-only access; raw financial data never leaves the self-hosted environment.

**Key Decision**: Privacy gateway middleware; tool-only AI access; no unrestricted database access.

---

### Recommendation and Validation Architecture

#### [ADR-002: Recommendation Pipeline Architecture](002-recommendation-pipeline-architecture.md)
**Status**: Accepted | **Date**: 2026-09-13

Recommendations flow through a multi-stage pipeline: Orchestrator → Research → Validator → Presenter. Each stage is independent and can be tested in isolation.

**Key Decision**: Multi-stage pipeline; research is separate from validation; presenter abstracts AI details.

---

#### [ADR-004: Decision Journal and Auditability](004-decision-journal-and-auditability.md)
**Status**: Accepted | **Date**: 2026-09-13

All financial decisions create audit trail entries documenting: what changed, why, who approved it, when, and evidence.

**Key Decision**: Immutable audit journal; every change is traceable.

---

#### [ADR-005: Persona Framing, Not Calculation](005-persona-framing-not-calculation.md)
**Status**: Accepted | **Date**: 2026-09-13

Persona prompts explain results to different user types, but calculations remain in domain services. Personas do not perform financial math.

**Key Decision**: Personas frame/explain, never calculate.

---

#### [ADR-006: Validation Independence](006-validation-independence.md)
**Status**: Accepted | **Date**: 2026-09-13

Recommendations are validated independently by a Validator service separate from the generating Orchestrator. Validation evidence is required before approval.

**Key Decision**: Independent validation; separation of generation and validation.

---

### Onboarding Architecture (NEW)

#### [ADR-007: Onboarding Session Persistence with React Context & localStorage](007-onboarding-session-persistence.md)
**Status**: Accepted | **Date**: 2026-09-15

Session state is managed using React Context API with automatic persistence to browser localStorage. Custom hooks (useOnboarding, useFormProgress, etc.) handle API communication. Two-tier architecture: Context for UI state, localStorage for client-side recovery, API for durable storage.

**Key Decision**: Context + localStorage (not Redux); automatic sync to storage; API hooks remain independent.

**Rationale**: Simplicity appropriate for MVP; localStorage provides fast restore; API provides durable backup.

---

#### [ADR-008: Onboarding Phase Skip Validation Policy](008-onboarding-phase-skip-policy.md)
**Status**: Accepted | **Date**: 2026-09-15

Phases 1, 2, 3, and 6 are mandatory (cannot skip). Phases 4 and 5 are optional (can skip after Phase 3 complete). Skip decisions are validated on both client (UX) and server (security). Skip button shows/hides and enables/disables based on policy.

**Key Decision**: Hard-coded skip policy; two-tier validation (client + server); phases 1-3, 6 required; phases 4-5 optional.

**Rationale**: Phases 1-3 are foundation for financial state; Phase 6 requires user approval; Phases 4-5 are enhancements.

---

#### [ADR-009: Onboarding API Integration Patterns with Custom Hooks](009-onboarding-api-integration-patterns.md)
**Status**: Accepted | **Date**: 2026-09-15

API communication is handled by custom React hooks that manage their own loading/error states and provide consistent interfaces. Each hook handles one logical domain (phase orchestration, form progress, income detection, etc.). Debounce pattern (5 seconds) for auto-save reduces API calls by ~95%.

**Key Decision**: Custom hooks for API; consistent interface pattern; debounce-based auto-save (5 seconds); try/catch error handling; useCallback for memoization.

**Rationale**: Simplicity (no REST library); separation of concerns; reusability across components; TypeScript type safety.

---

#### [ADR-010: Checkpoint and Progress Recovery Strategy](010-checkpoint-and-progress-recovery.md)
**Status**: Accepted | **Date**: 2026-09-15

Two-tier checkpoint strategy: localStorage for fast client-side recovery (immediate on app load) and API for durable server-side storage. Auto-save every 5 minutes to both tiers. localStorage restores immediately; API fetch happens in background. Graceful degradation if either tier fails.

**Key Decision**: Two-tier (local + server); auto-save every 5 minutes; localStorage restore first, then API sync; graceful fallback if either fails.

**Rationale**: Fast recovery (localStorage); data durability (API); works offline; reduces data loss; no user action required.

---

## ADR Status Legend

- **Accepted**: Decision is final and implemented
- **Proposed**: Decision under review
- **Superseded**: Decision overridden by newer ADR
- **Deprecated**: Decision no longer relevant

---

## How to Read ADRs

Each ADR follows this template:

1. **Title**: Clear, specific name for the decision
2. **Status**: Accepted/Proposed/Superseded/Deprecated
3. **Date**: When decision was made
4. **Deciders**: Who made the decision
5. **Related ADRs**: Cross-references to related decisions
6. **Context**: What problem led to this decision?
7. **Decision**: What did we decide?
8. **Consequences**: What are the trade-offs?
9. **Implementation Details**: How is it implemented?
10. **Testing Strategy**: How is it tested?
11. **References**: Links to code and docs

---

## Architecture Overview

```
Financial Calculations (Deterministic)
├─ Money: Integer cents (ADR-001)
├─ Calculations: Domain services (never in AI)
└─ Audit: Decision journal (ADR-004)

AI Layer (Recommendation Pipeline)
├─ Privacy Boundary: Gateway middleware (ADR-003)
├─ Orchestration: Multi-stage pipeline (ADR-002)
├─ Validation: Independent validator (ADR-006)
└─ Presentation: Persona framing (ADR-005)

Onboarding (Session Persistence)
├─ Session State: React Context + localStorage (ADR-007)
├─ Phase Routing: Skip validation policy (ADR-008)
├─ API Communication: Custom hooks (ADR-009)
└─ Recovery: Two-tier checkpoints (ADR-010)
```

---

## Recent Changes

### 2026-09-15: Onboarding ADRs Added
- ADR-007: Session persistence strategy
- ADR-008: Phase skip policy
- ADR-009: API integration patterns
- ADR-010: Checkpoint recovery

These ADRs document architectural decisions made during Steps 3-5 of household onboarding implementation.

---

## Next ADRs to Consider

Based on the roadmap and upcoming work:

- **ADR-011**: Statement Ingestion Pipeline Architecture
  - CSV/PDF parsing strategy
  - Source detection algorithm
  - Reconciliation approach
  - OCR usage and limitations

- **ADR-012**: Recurring Obligation Model
  - Utility bills vs Accounts
  - Frequency detection
  - Forecasting strategy

- **ADR-013**: Review Queue Architecture
  - Exception types and routing
  - User resolution paths
  - Audit trail for manual overrides

- **ADR-014**: Data Versioning and Migration
  - How to handle schema changes
  - Backward compatibility
  - Data upgrade strategy

- **ADR-015**: Multi-user Authorization
  - Household vs User scoping
  - Role-based access (admin vs member)
  - Two-spouse approval workflows

---

## How to Create a New ADR

1. **Pick the next number**: Follow ADR numbering sequence
2. **Copy the template**: Use an existing ADR as template
3. **Write clearly**: Assume future readers unfamiliar with context
4. **Include examples**: Code, diagrams, or scenarios help
5. **Document trade-offs**: Show alternatives considered
6. **Link references**: Point to code and related docs
7. **Get review**: Share with architecture team
8. **Update this index**: Add to the ADR listing above

---

## References

- [Joel Spolsky on ADRs](https://blog.adr.github.io/)
- [ADR GitHub org](https://adr.github.io/)
- [Lightweight ADR format](https://github.com/adr/adr-template)
- Project docs: `docs/architecture/`
- Engineering rules: `AGENTS.md`
- Product rules: `PRODUCT_BUILD_CONTRACT.md`
