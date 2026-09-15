1. Findings
CRITICAL
Production bypasses the independent recommendation pipeline.
The live path extracts arbitrary strings named recommendations, treats the first as final, and declares PASS when a candidate exists and required research is available. It never invokes the implemented scenario builder, candidate builder, validator, or selector.
recommendation-workflow.ts:25-67 · ai-orchestrator.ts:295-320 · recommendation-validator.ts:142-240

The UI presents synthetic validation as “Independently checked.”
UI validation is derived only from tool execution success. Assumptions, risks, confidence, and confidence reasoning are hardcoded rather than returned by the recommendation engine. A spouse is therefore shown assurances that the independent validator did not produce.
AdvisorResponseCard.tsx:49-61 · AdvisorResponseCard.tsx:166-195 · RecommendationExperience.tsx:174-204

HIGH
Financial rules remain inside the AI package.
simulatePurchase calculates emergency-fund floors, financing payments, affordability, and recommendations directly in ai, contrary to the domain-service requirement and Slice 1’s financial ownership boundary.
tool-implementations.ts:39-40 · tool-implementations.ts:117-149

Required research cannot succeed in production.
The server constructs AIOrchestrator without a RecommendationResearchProvider; every recognized tax, issuer, retirement-rule, or current-rate request therefore fails closed. This is safe, but Slice 5’s researched recommendation capability is unavailable.
server.ts:778-783 · recommendation-research.ts:32-42

Current-fact detection is incomplete.
Research requirements depend on narrow regexes. Product aliases such as “Should I keep my Amex?” do not match card, allowing current product claims to reach the LLM without mandatory issuer verification.
recommendation-research.ts:67-88

Recommendation versioning is defined but not operational.
Migrations and domain functions exist, but there is no recommendation repository implementation or recommendation API. The live system persists only journal records, where snapshot and policy versions are optional. Expiration and invalidation functions have no runtime callers.
decision-journal.ts:23-31 · recommendation-service.ts:88-114 · decision-journal.ts:18-69

Grounding failure is recorded as a successful, validated recommendation.
An ungrounded LLM answer is replaced with a safe fallback, but the response remains successful and the journal retains recommendation status PASS. The E2E test explicitly codifies this contradictory state.
ai-orchestrator.ts:376-435 · recommendation-e2e-scenarios.test.ts:470-500

Claim/evidence verification is incomplete.
Research acceptance checks status, tier, freshness, and verification state, but not whether returned evidence actually supports the requested claim or meets a relevance threshold.
recommendation-research.ts:43-64

Fabricated research attribution can pass once any evidence exists.
Fabricated-research patterns are checked only when verifiedResearch is empty. The validator does not compare named sources or prose claims against the supplied evidence set.
response-grounding.ts:229-239

MEDIUM / LOW
Scenario replay data is incomplete. Journal entries preserve outputs but not explicit tool parameters, candidate rankings, structured validation details, or transformation steps. API execution logging writes {} as parameters.
decision-journal.ts:80-111 · ai-orchestrator.ts:236-248

Approval history is effectively single-use. recommendation_id UNIQUE permits only one decision despite repository logic modeling an ordered decision history.
017_add_decision_journal.sql:25-34

Governance documentation is incomplete and stale. PRODUCT_BUILD_CONTRACT.md and adr are absent despite the master plan requiring them. The implementation plan still describes obsolete migrations and a different journal model.
AI_Financial_Advisor_Vibe_Coding_Master_Plan.md:277-335 · SLICE_5_IMPLEMENTATION_PLAN.md

2. Required Fixes
Wire the typed scenario → candidate → validator → selector pipeline into the live orchestrator.
Return and render the structured recommendation; remove UI-generated validation, risks, assumptions, and confidence.
Move remaining financial calculations from ai into financial/domain services.
Add an allowlisted research adapter and strengthen current-fact classification.
Persist typed recommendations and versions; enforce expiration and snapshot/policy invalidation.
Treat grounding or validator failure as non-normal delivery with consistent journal status.
Persist replay inputs, candidate rankings, and detailed validation lineage.
Restore the product contract and ADR set; reconcile Slice 5 documentation.
3. Financial Risks
Affordability and emergency-fund rules can drift from domain policy.
Recommendations can be marked valid without mathematical recalculation or policy validation.
Snapshot and policy versions are not mandatory on live journal entries.
Dormant scenario code contains assumed values such as 18% interest, 4% debt payments, zero active goals, and snapshot version 1.
4. Research Risks
No production research provider.
Regex gaps can miss current-fact questions.
Evidence relevance to claims is not verified.
Evidence freshness and source-tier filtering are strong when research is triggered, and unavailable research correctly fails closed.
5. AI Risks
No unrestricted SQL or direct database access was found in AI code.
External LLM context passes through the privacy gateway, with confidential tools excluded.
No arbitrary research network access currently exists; Anthropic is the only implemented external provider path.
Fabricated source attribution and unsupported non-dollar current facts remain insufficiently checked.
6. Persona Risks
Domain presenter tests confirm calculations, evidence, validation, and confidence remain unchanged across personas.
Runtime personas affect prompt framing only, which is appropriate.
The UI uses a separate persona list and does not display the versioned fictionalization disclaimer. This is LOW while labels remain generic, but it is architecture drift.
7. UX Issues
The current UI answers recommendation and “why” reasonably, but alternatives are loosely extracted, risks and assumptions are generic, evidence is usually unavailable to the UI, confidence is manufactured, validation is overstated, and approval exists only for budget planning. Questions 3–8 are therefore not reliably answered from authoritative data.

8. Architecture Drift
The implemented Slice 5 domain is largely disconnected from the advisor runtime. Three recommendation representations now coexist: full domain recommendations, lightweight orchestrator string recommendations, and UI-constructed recommendation models.

9. Technical Debt
Dormant recommendation tables/services/routes.
Duplicate persona definitions.
Unused evidence lifecycle and invalidation functions.
Heuristic UI extraction from tool payloads.
Documentation and migration numbering inconsistent with implementation.
10. Slice 6 Readiness
NO-GO. The full suite passes, but tests validate isolated domain services and the lightweight runtime separately; they do not prove the specified governed pipeline is active. Slice 6 should wait until the CRITICAL and HIGH integration findings are resolved and the governing contract/ADRs are restored.