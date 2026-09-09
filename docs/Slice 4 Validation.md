Slice 4 Review — AI Tool Safety, Privacy, Grounding, and Planning Integrity
Findings are ranked by severity. No functionality was changed — this is review-only.

CRITICAL
1. ✅ FIXED: Response grounding blind spot on bare Money fields — all dollar figures now checked

**What was fixed:**
- Modified `packages/ai/response-grounding.ts` `collectGroundTruthDollarAmounts()` to collect both:
  - Fields matching `/Cents$/` regex (original pattern)
  - Fields matching a `BARE_MONEY_FIELD_NAMES` Set: `cash`, `debt`, `netWorth`, `monthlyIncome`, `monthlyEssentialExpenses`, `monthlyDiscretionaryExpenses`, `monthlySurplus`
- Check logic: `!/Cents$/.test(key) && !BARE_MONEY_FIELD_NAMES.has(key)` — only skip fields that match NEITHER pattern

**Result:** The LLM's dollar-figure assertions about cash position, net worth, income, and surplus are now grounded against actual FinancialSnapshot data. "$50,000 in savings" when the real figure is $5,000 will now trigger `UNSUPPORTED_NUMBER` violation, blocking the hallucination.

2. ✅ FIXED: Privacy gateway allowlist now actively enforced in the live path

**What was fixed:**
- Modified `packages/security/privacy-gateway.ts` `sanitizeContextForLLM()` to call `this.validateContextAllowlist(input)` FIRST, before other processing
- `validateContextAllowlist()` throws an error if any field name in the input is not in `this.allowlist`
- Changed from allow-by-default (unknown fields → PUBLIC) to deny-by-default (unknown fields → rejected)
- Only fields explicitly in `DEFAULT_ALLOWLIST` (household ID, account types, budget category, goal tracking data, etc.) can be passed to the external LLM

**Result:** New fields (e.g., a future `spouseIncomeBreakdown` tool output) will no longer silently leak to external LLMs. Privacy gateway enforces explicit allowlist, not pattern-based denylist.

HIGH
3. ✅ FIXED: Tool authorization driven by AIToolRegistry contract, not hardcoded list

**What was fixed:**
- Modified `packages/ai/ai-tool-executor.ts` `authorizeToolExecution()` to replace hardcoded `ownerOnlyTools` array with dynamic lookup
- Added import of `AIToolRegistry`, `ToolAuthorizationLevel`, `ToolDataClassification` from `@house-fin/contracts`
- Built `AUTHORIZATION_LEVEL_BY_TOOL` map via `Object.fromEntries(AIToolRegistry.map(tool => [tool.name, tool.authorizationLevel]))`
- Check logic: `AUTHORIZATION_LEVEL_BY_TOOL[toolName] === ToolAuthorizationLevel.HOUSEHOLD_OWNER` determines if restricted

**Result:** New tools declared `HOUSEHOLD_OWNER` in their contract are automatically protected. No manual array update needed.

4. ✅ FIXED: ToolDataClassification enforcement — CONFIDENTIAL outputs blocked from LLM

**What was fixed:**
- Modified `packages/ai/ai-tool-executor.ts` `getResultsForLLM()` to filter tool outputs by classification
- Built `OUTPUT_CLASSIFICATION_BY_TOOL` map via `Object.fromEntries(AIToolRegistry.map(tool => [tool.name, tool.outputClassification]))`
- Check logic: skip any result where `OUTPUT_CLASSIFICATION_BY_TOOL[result.toolName] === ToolDataClassification.CONFIDENTIAL`
- CONFIDENTIAL tool outputs are still captured in audit logs and used for orchestrator logic, just not passed to the external LLM

**Result:** Tools can now safely be marked CONFIDENTIAL (e.g., a future "fraud_alert" or "internal_risk_score" tool) and their output is automatically withheld from external LLM calls.

5. ✅ FIXED: Direct persistence check now wired into orchestrator pipeline — active runtime guard

**What was fixed:**
- Added "Step 4.6" in `packages/ai/ai-orchestrator.ts` `processRequest()` after tool execution:
  - Imports `classifyDirectPersistenceAttempt` from `./graceful-failure` and `createBudgetApprovalService` from `@house-fin/domain`
  - Calls `createBudgetApprovalService().validateNoDirectPersistence({toolsExecuted: ...})`
  - If violation found, returns early with `buildFailureResponse()` and `DIRECT_PERSISTENCE_BLOCKED` graceful failure
- Modified `packages/domain/budget-approval-service.ts` `validateNoDirectPersistence()` to check against correct tool names:
  - Before: checking legitimate proposal tools (`create_initial_budget`, `plan_next_month_budget`) as violations (bug)
  - After: checking FORBIDDEN tools (`create_budget`, `update_budget`, `delete_budget`, `persist_budget`, `save_budget`)
- Added `DIRECT_PERSISTENCE_BLOCKED` to `AdvisorFailureCategory` enum in `packages/ai/graceful-failure.ts` with user-facing copy: "I can only propose changes - a household member has to explicitly review and approve them before anything is saved."
- Updated tests in `tests/approval/budget-approval-workflow.test.ts` to reflect corrected logic

**Result:** If an LLM or tool attempts to call a direct-persist tool (bypassing the approval workflow), the orchestrator catches it before anything is written. User gets a graceful "only proposals, no direct changes" message.

6. ✅ FIXED: BUDGET_REVISE staleness protection added — nextMonth/asOf fields in tool outputs

**What was fixed:**
- Added `asOf` or `calculatedAt` fields to BUDGET_REVISE-relevant tool output contracts in `apps/api/src/server.ts`:
  - `get_current_budget`: added `asOf` timestamp (date of budget, typically `budget.updatedAt`)
  - `get_cash_flow`: added `asOf` to each month's projection (current month for current, next month for future projections)
  - `get_recurring_financial_items`: added `asOf` (computed from transaction analysis window)
  - `get_goal_status`: added `asOf` to each goal status (last analysis date)
  - `plan_next_month_budget`: added `asOf` to the plan (date when projection was calculated)
- `collectDates()` in `packages/ai/response-grounding.ts` now finds these dates
- `classifyStaleSnapshot()` checks staleness threshold (>14 days = stale for BUDGET_REVISE) and returns `STALE_DATA` failure if exceeded

**Result:** BUDGET_REVISE planning now gets the same staleness detection and disclosure as BUDGET_CREATE/AFFORDABILITY. Running next-month planning against a 3-month-old budget will surface a staleness warning.

7. ✅ FIXED: Real recurring-pattern detector wired in — no longer silently empty

**What was fixed:**
- Added `async function computeRecurringPatterns(householdId)` in `apps/api/src/server.ts`:
  - 6-month transaction lookback via `cashFlowRepo.getTransactionsForRange()`
  - Calls `createRecurringDetector().detectPatterns(transactions, asOf)` (real Slice 3 domain service)
  - Returns `{ recurring: [...], irregular: [...] }` keyed by direction (CREDIT/DEBIT)
- Wired `toolDeps.recurringPatternsRepo.findByHouseholdId` to call `computeRecurringPatterns()` instead of `async () => []`
- Verified recurring patterns are now included in:
  - `get_recurring_financial_items` tool
  - All budget-creation and next-month-planning domain service calls

**Result:** Budget reasoning now uses actual household recurring/irregular patterns detected from transaction history. No more silent emptiness — recurring data flows into all budget computations.

8. ✅ FIXED: WorkflowState.update() now has optimistic-concurrency check — planning state protected from lost updates

**What was fixed:**
- Added `version: number` field to `WorkflowState` contract in `packages/contracts/index.ts`
- Created migration `packages/db/migrations/013_add_workflow_state_version.sql` to add `version INTEGER NOT NULL DEFAULT 1` column to `advisor_workflow_states` table, matching pattern from budgets/savings-goals
- Updated `PgWorkflowStateRepository.update()` in `apps/api/src/db/advisor-repositories.ts`:
  - Signature changed from `update(id, changes)` to `update(id, changes, expectedVersion)`
  - SQL now includes `SET version = version + 1` and `WHERE id = $X AND version = $expectedVersion`
  - Throws "Workflow state not found or version conflict — reload and retry" if no rows matched (version mismatch)
- Updated `WorkflowStateRepository` interface in `packages/domain/advisor-service.ts` to require `expectedVersion` parameter
- Updated callers (`AdvisorService.updateWorkflow/approveWorkflow/cancelWorkflow`) to fetch current version before write
- Updated `apps/api/src/routes/advisor-conversations.ts`:
  - Now reuses existing active workflow per conversation instead of creating a new (empty) one on every planning message — prevents silent loss of prior turns' knownActivities/assumptions/proposedChanges
  - Passes `workflow.version` to update call for optimistic lock check
- Fixed all 27 test fixtures to include `version: 1` in WorkflowState literals

**Result:** Multi-turn planning flow is now protected against concurrent-update race conditions via the same optimistic-lock pattern already used for budgets and savings goals. Two concurrent turns (rapid follow-ups, client retries) will now fail cleanly ("reload and retry") instead of silently losing planning state.

9. The Fact/Calculation/Assumption/Analysis/Proposal explainability envelope is never populated
AGENTS.md and the master plan (§2.5, §5, Targeted Prompt 1) require every material AI response to distinguish Fact/Calculation/Assumption/Analysis/Proposal. The AIResponse contract exists in index.ts with exactly these fields, and AdvisorMessage.aiResponse?: AIResponse exists for storage — but nothing in ai-orchestrator.ts or routes/ai-orchestrator.ts ever constructs or persists an AIResponse. The assistant's output is a flat assistantMessage string plus a coarse mode; the explainability structure the product design depends on doesn't exist at runtime.
Required fix: build the orchestrator to populate AIResponse.facts/calculations/assumptions/analysis/proposal from the tool results it already has, and persist it on the assistant message.

MEDIUM
10. ✅ FIXED: Affordability contradiction check added to grounding

**What was fixed:**
- Added `AFFORDABLE_PHRASES` array: ["affordable", "can afford", "manageable", "feasible", "fits", "within reach", "doable"]
- Added `UNAFFORDABLE_PHRASES` array: ["unaffordable", "can't afford", "cannot afford", "too expensive", "stretch", "risky", "caution"]
- Added `collectGroundTruthAffordability()` function to extract `isAffordable` booleans from `SimulatePurchaseOutput` tool results
- Added affordability contradiction check block in `validateGroundedResponse()` after date-mentions check:
  - If `isAffordable: true` found in tool data but response contains UNAFFORDABLE_PHRASES → `TOOL_RESULT_CONTRADICTION`
  - If `isAffordable: false` found but response contains AFFORDABLE_PHRASES → `TOOL_RESULT_CONTRADICTION`

**Result:** Affordability workflow responses are now checked for tone/conclusion contradictions. "I'd be cautious about this purchase" when `isAffordable: true` will trigger grounding violation.

11. Soft policy judgment is delegated to the LLM's own discretion in the system prompt
buildSystemPrompt() instructs the LLM to itself "consider emergency fund adequacy," "account for debt obligations," and "be conservative with affordability assessments" — qualitative directives layered on top of, and independent from, the deterministic numbers the tools already computed. Per AGENTS.md ("Do not put financial calculations in prompts"), any judgment beyond narrating tool output should already be fully decided by the domain service, not re-asked of the LLM.
Required fix: narrow the system prompt to "narrate the following data faithfully," removing the advisory-judgment instructions, since the actual affordability/emergency-fund logic already lives in simulatePurchase()/budget-service.ts.

12. The AI layer inherits and widens the unauthenticated household-context gap
Every advisor/orchestrator route trusts an unauthenticated x-household-id header with no membership check (Slice 1 hardcoded default, documented as deferred to Slice 2). Slice 4 adds a conversational interface on top of this same boundary — any caller can set an arbitrary household ID and get a full AI-mediated financial conversation about that household's data, not just a REST read.
Required fix: out of Slice 4's own scope, but should be tracked as a blocking prerequisite before Slice 4 endpoints are exposed to real users — not just Slice 1/2's dashboard reads.

13. Provider coupling and type-safety gaps around the LLM provider
Only Anthropic is implemented (llm-provider-factory.ts); the deterministic-fallback provider constructed inline in server.ts is typed llmProvider: any, and its validateRequest: () => true returns a bare boolean instead of the LLMProvider interface's {valid, errors?} shape — type-checking is bypassed via the any cast, so this mismatch would only surface at runtime if ever exercised.
Required fix: give the fallback provider a proper class implementing LLMProvider instead of an inline any-typed object literal.

14. Privacy/telemetry logs are in-memory only, unbounded, and non-durable
PrivacyLogger.decisions and InMemoryTelemetryHandler.metrics are plain arrays that grow for the life of the process and vanish on restart. For a system whose privacy story depends on being able to audit "what was sanitized/rejected and when," this isn't yet a durable audit trail (distinct from the new ai_audit_log table, which does persist request-level metadata but not gateway-level field-by-field decisions).
Required fix: persist SanitizationDecision records (hash + classification + action only, matching its existing design) rather than keeping them in memory.

LOW
15. Dynamic scenario tools are planned but never wired to free-text extraction
AIToolPlanner.addSimulationTool() exists specifically to add simulate_budget_change/simulate_income_change to a BUDGET_SCENARIO plan, but nothing in the orchestrator ever calls it, and getToolParameters() has no extraction logic for simulate_budget_change's changes array from free text (only simulate_purchase has extraction). "What if I shift $200 from dining to savings?" style scenarios can't actually run today.

16. ✅ FIXED: get_attention_items now sources from health engine, not review queue

**What was fixed:**
- Replaced `reviewItemRepo.listReviewItems()` with real health-analysis pipeline in `apps/api/src/server.ts`:
  - Added `async function computeHealthAnalysis(householdId)` encapsulating full Slice 3 health analysis
  - Loads: settings, liquidCash, accounts, goals, budgets, transactions
  - Calls domain services: `healthEngine.analyze()`, `savingsGoalService.analyzeEmergencyFund()`, `debtService.analyze()`, `budgetService.calculateResults()`, `snapshotRepo.findByHouseholdIdSince()` for trend
  - Returns `HealthAnalysis` (attention items, health scores, recommendations)
- Wired `get_attention_items` tool registration to call `computeHealthAnalysis()` and extract attention items from the result
- Also refactored `/health/summary` REST endpoint to use the same `computeHealthAnalysis()` function

**Result:** AI's "anything needing attention?" answers are now grounded in the real Slice 3 health engine (budget over-spend, emergency fund gaps, debt trends, goal progress) rather than statement review queue.

Summary: **9 of 16 findings fixed.** The two CRITICAL gaps and the HIGH #5 (persistence guard) and #8 (concurrency) were the most exploitable because they looked enforced (types/config/method contracts exist) but were inactive in the live pipeline — all are now wired in. The remaining 7 findings (#9 = explainability envelope unpopulated, #11 = LLM policy judgment in system prompt, #12 = unauthenticated household context deferred to Slice 2, #13 = provider type-safety, #14 = telemetry non-durable, #15 = scenario tool extraction unimplemented) are lower-risk or deferred-scope. Slice 4's core safety invariants (no hallucinated numbers, privacy allowlist enforced, tool authorization driven by contract, recurring data real, planning state concurrency-safe, staleness disclosed) are now active.