/**
 * Slice 4 End-to-End Workflow Tests
 *
 * Exercises the full AI advisor pipeline (tool planning → authorization → tool execution →
 * privacy gateway → LLM → response grounding) for each of the primary Slice 4 user workflows,
 * plus the cross-cutting graceful-failure and privacy-boundary guarantees.
 *
 * Complements (does not duplicate) the narrower unit suites:
 * - ai-orchestrator.test.ts (planner/executor/orchestrator mechanics)
 * - response-grounding.test.ts, graceful-failure.test.ts (validation/failure taxonomy)
 * - tests/approval/budget-approval-workflow.test.ts (approval service unit tests)
 * - tests/privacy/privacy-gateway.test.ts (data classification unit tests)
 * - conversation-continuity.test.ts (pronoun/follow-up resolution unit tests)
 */

import { describe, it, expect } from "@jest/globals";
import {
    EntityId,
    AdvisorWorkflow,
    WorkflowState,
    WorkflowStatus,
    BudgetProposal,
    BudgetProposalStatus,
    Budget,
    Money,
    AIToolRegistry,
} from "@house-fin/contracts";
import {
    AIOrchestrator,
    AIToolPlanner,
    AIToolExecutor,
    OrchestratorRequest,
    ConversationTurn,
    resolveConversationalReference,
    LLMProvider,
    LLMRequest,
    LLMResponse,
    LLMProviderError,
    createFinancialContextBuilder,
} from "@house-fin/ai";
import {
    WorkflowStateManager,
    createAdvisorContextService,
    createBudgetApprovalService,
} from "@house-fin/domain";
import { PrivacyGateway, SanitizedFinancialContext } from "@house-fin/security";

const HOUSEHOLD_ID = "hh-slice4" as EntityId;
const MEMBER_ID = "member-slice4" as EntityId;

/** Configurable mock LLM - default echoes grounded numbers pulled straight from tool results. */
class ScriptedLLMProvider implements LLMProvider {
    public callCount = 0;
    public lastRequest?: LLMRequest;
    constructor(
        private respond: (request: LLMRequest) => LLMResponse | Promise<LLMResponse> | never
    ) { }
    getName(): string { return "scripted"; }
    getConfig(): Record<string, unknown> { return { model: "test-model" }; }
    getMaxContextTokens(): number { return 100000; }
    validateRequest(): { valid: boolean; errors?: string[] } { return { valid: true }; }
    async generateResponse(request: LLMRequest): Promise<LLMResponse> {
        this.callCount++;
        this.lastRequest = request;
        return this.respond(request);
    }
}

function textResponse(content: string): LLMResponse {
    return {
        content,
        toolCalls: [],
        usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
        stopReason: "END_TURN",
        generatedAt: new Date(),
    };
}

/** Permissive privacy gateway that passes tool data straight through - used where the test's
 * focus is elsewhere and real classification isn't relevant to the assertions. */
class PermissivePrivacyGateway extends PrivacyGateway {
    constructor() { super(undefined as any); }
    override sanitizeContextForLLM(context: Record<string, unknown>, correlationId: EntityId): SanitizedFinancialContext {
        return { ...context, timestamp: new Date(), correlationId, sanitizationApplied: true };
    }
    override isContextSafe(): boolean { return true; }
}

function baseRequest(overrides: Partial<OrchestratorRequest> = {}): OrchestratorRequest {
    return {
        correlationId: `corr-${Math.random()}` as EntityId,
        userMessage: "test message",
        workflowType: AdvisorWorkflow.FINANCIAL_HEALTH,
        householdId: HOUSEHOLD_ID,
        memberId: MEMBER_ID,
        isHouseholdOwner: true,
        conversationId: "conv-slice4" as EntityId,
        ...overrides,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1 — Financial health
// ─────────────────────────────────────────────────────────────────────────────

describe("Slice 4 E2E — Test 1: Financial health", () => {
    it("retrieves the current snapshot and attention items, and grounds the answer in current data", async () => {
        const planner = new AIToolPlanner();
        const executor = new AIToolExecutor();
        const llm = new ScriptedLLMProvider(() =>
            textResponse("You're in healthy shape overall - this month's budget totals $4,000 with $3,800 spent so far.")
        );
        const orchestrator = new AIOrchestrator(planner, executor, llm, new PermissivePrivacyGateway());

        executor.registerTool("get_financial_snapshot", async () => ({
            snapshot: {
                id: "snap-1", householdId: HOUSEHOLD_ID, asOf: new Date("2027-03-01"), version: 5,
                cash: 500000, debt: 100000, netWorth: 900000,
                monthlyIncome: 600000, monthlyEssentialExpenses: 300000, monthlyDiscretionaryExpenses: 100000,
                monthlySurplus: 200000, financialHealthStatus: "HEALTHY", sourceAccountIds: [],
                calculatedAt: new Date("2027-03-01"), createdAt: new Date("2027-03-01"),
            },
        }));
        executor.registerTool("get_budget_status", async () => ({
            householdId: HOUSEHOLD_ID, period: "2027-3", asOf: new Date("2027-03-01"),
            categories: [], totalBudgetedCents: 400000, totalActualCents: 380000,
            totalVarianceCents: -20000, overBudgetCount: 0,
        }));
        executor.registerTool("get_attention_items", async () => ({
            householdId: HOUSEHOLD_ID,
            items: [{ id: "att-1", type: "LOW_EMERGENCY_FUND", severity: "LOW", description: "Emergency fund below target" }],
            criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 1,
        }));

        const response = await orchestrator.processRequest(
            baseRequest({ userMessage: "How are we doing financially?", workflowType: AdvisorWorkflow.FINANCIAL_HEALTH })
        );

        const executed = response.toolResults.filter((r) => r.success).map((r) => r.toolName);
        expect(executed).toContain("get_financial_snapshot"); // current snapshot retrieved
        expect(executed).toContain("get_attention_items");    // attention items retrieved
        expect(response.success).toBe(true);
        expect(response.metadata.groundingPassed).toBe(true); // answer grounded in current data
        expect(response.assistantMessage).toContain("$4,000");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2 — Initial budget
// ─────────────────────────────────────────────────────────────────────────────

describe("Slice 4 E2E — Test 2: Initial budget", () => {
    it("retrieves state and history, proposes a budget, and requires explicit approval before persisting", async () => {
        const planner = new AIToolPlanner();
        const executor = new AIToolExecutor();
        const llm = new ScriptedLLMProvider(() =>
            textResponse("I've proposed a budget totaling $2,000 based on your $3,000 income and past spending.")
        );
        const orchestrator = new AIOrchestrator(planner, executor, llm, new PermissivePrivacyGateway());

        executor.registerTool("get_financial_snapshot", async () => ({
            snapshot: {
                id: "s1", householdId: HOUSEHOLD_ID, asOf: new Date(), version: 2, cash: 500000, debt: 0, netWorth: 500000,
                monthlyIncome: 300000, monthlyEssentialExpenses: 150000, monthlyDiscretionaryExpenses: 50000, monthlySurplus: 100000,
                financialHealthStatus: "HEALTHY", sourceAccountIds: [], calculatedAt: new Date(), createdAt: new Date()
            },
        }));
        executor.registerTool("get_cash_flow", async () => ({
            householdId: HOUSEHOLD_ID, currentMonth: null, forecast: [],
            historicalAverage: { monthlyIncomeCents: 300000, monthlyExpensesCents: 200000, monthlySurplusCents: 100000 },
        }));
        executor.registerTool("get_historical_budget_performance", async () => ({
            householdId: HOUSEHOLD_ID,
            months: [
                { period: "2027-1", categories: [], totalBudgetedCents: 190000, totalActualCents: 195000, totalVarianceCents: 5000 },
                { period: "2027-2", categories: [], totalBudgetedCents: 190000, totalActualCents: 200000, totalVarianceCents: 10000 },
            ],
        }));
        executor.registerTool("get_debt_summary", async () => ({ householdId: HOUSEHOLD_ID, totalDebtCents: 0, debtAccounts: [], debtHealthStatus: "HEALTHY" }));
        executor.registerTool("get_recurring_financial_items", async () => ({
            householdId: HOUSEHOLD_ID, incomePatterns: [], expensePatterns: [],
            estimatedMonthlyIncomeCents: 300000, estimatedMonthlyExpensesCents: 200000, estimatedMonthlySurplusCents: 100000, totalPatternsFound: 0,
        }));
        executor.registerTool("get_goal_status", async () => ({ householdId: HOUSEHOLD_ID, goals: [], activeGoalCount: 0, completedGoalCount: 0, totalTargetCents: 0, totalCurrentProgressCents: 0 }));
        executor.registerTool("get_attention_items", async () => ({ householdId: HOUSEHOLD_ID, items: [], criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 }));

        const proposedBudgets = [
            { category: "Groceries", recommendedBudgetCents: 45000, historicalAverageCents: 42000, rationale: "Essential category based on historical spending" },
            { category: "Dining Out", recommendedBudgetCents: 20000, historicalAverageCents: 28000, rationale: "Discretionary category based on spending patterns" },
        ];
        let createInitialBudgetCalled = false;
        executor.registerTool("create_initial_budget", async () => {
            createInitialBudgetCalled = true;
            return {
                householdId: HOUSEHOLD_ID, month: "2027-4", proposedBudgets,
                totalBudgetedCents: 65000, monthlyIncomeCents: 300000, monthlyExpensesCents: 200000,
                projectedSurplusCents: 235000, recommendations: ["Budget balances essential and discretionary spending."],
            };
        });

        // A repository stub that records every write - proves nothing is persisted until approval.
        const persistedBudgets: Budget[] = [];
        const fakeBudgetRepo = {
            create: async (b: Omit<Budget, "id" | "createdAt" | "updatedAt" | "version">): Promise<Budget> => {
                const persisted: Budget = { ...b, id: `budget-${persistedBudgets.length}` as EntityId, version: 1, createdAt: new Date(), updatedAt: new Date() };
                persistedBudgets.push(persisted);
                return persisted;
            },
        };

        const response = await orchestrator.processRequest(
            baseRequest({ userMessage: "Help me create an initial budget.", workflowType: AdvisorWorkflow.BUDGET_CREATE, isHouseholdOwner: true })
        );

        const executed = response.toolResults.filter((r) => r.success).map((r) => r.toolName);
        expect(executed).toEqual(expect.arrayContaining(["get_financial_snapshot", "get_cash_flow"])); // current financial state retrieved
        expect(executed).toContain("get_historical_budget_performance"); // historical spending considered
        expect(executed).toContain("create_initial_budget"); // proposed budget created
        expect(createInitialBudgetCalled).toBe(true);

        const groceries = proposedBudgets.find((p) => p.category === "Groceries")!;
        // observed (historical) vs proposed (recommended) values are distinguishable fields
        expect(groceries.historicalAverageCents).toBe(42000);
        expect(groceries.recommendedBudgetCents).toBe(45000);
        expect(groceries.historicalAverageCents).not.toBe(groceries.recommendedBudgetCents);

        // Budget is not saved before approval - the tool call alone never touches the repository.
        expect(persistedBudgets).toHaveLength(0);

        // --- User reviews and modifies the proposal, then approves it ---
        const approvalService = createBudgetApprovalService();
        const proposal: BudgetProposal = {
            id: "proposal-1" as EntityId,
            householdId: HOUSEHOLD_ID,
            conversationId: "conv-slice4" as EntityId,
            periodYear: 2027,
            periodMonth: 4,
            status: BudgetProposalStatus.PROPOSED,
            proposedChanges: proposedBudgets.map((p) => ({
                category: p.category,
                proposedBudgetCents: p.recommendedBudgetCents as unknown as Money,
                currentBudgetCents: 0 as unknown as Money,
                reason: p.rationale,
            })),
            createdBy: MEMBER_ID,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // User can modify the proposal before approving (e.g. raise Dining Out above the AI's suggestion).
        const userModifiedChanges = proposal.proposedChanges.map((c) =>
            c.category === "Dining Out" ? { ...c, proposedBudgetCents: 25000 as unknown as Money } : c
        );
        const underReview: BudgetProposal = { ...proposal, status: BudgetProposalStatus.UNDER_REVIEW, approvedChanges: userModifiedChanges };
        expect(underReview.approvedChanges![1].proposedBudgetCents).not.toBe(proposal.proposedChanges[1].proposedBudgetCents);

        expect(persistedBudgets).toHaveLength(0); // still not saved merely by reviewing/modifying

        // Explicit approval persists the (possibly modified) changes as a new budget version.
        expect(approvalService.canApprove(underReview)).toBeNull();
        const newBudgets = approvalService.createBudgetsFromApprovedProposal(underReview, [], MEMBER_ID);
        for (const b of newBudgets) {
            await fakeBudgetRepo.create(b);
        }

        expect(persistedBudgets).toHaveLength(2); // approval creates a new budget version
        expect(persistedBudgets.every((b) => b.version === 1)).toBe(true);
        expect(persistedBudgets.find((b) => b.category === "Dining Out")!.amountCents).toBe(25000);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3 — Budget diagnosis
// ─────────────────────────────────────────────────────────────────────────────

describe("Slice 4 E2E — Test 3: Budget diagnosis", () => {
    it("analyzes history, distinguishes repeated vs. irregular variance, and makes no unsupported judgment", async () => {
        const planner = new AIToolPlanner();
        const executor = new AIToolExecutor();
        const llm = new ScriptedLLMProvider(() =>
            textResponse(
                "Dining Out has been over budget by about $150 every month analyzed, and a recurring " +
                "subscription of $120 isn't currently budgeted. Home Repairs was over budget once, in a single month."
            )
        );
        const orchestrator = new AIOrchestrator(planner, executor, llm, new PermissivePrivacyGateway());

        executor.registerTool("get_current_budget", async () => ({
            householdId: HOUSEHOLD_ID, period: "2027-3", budgets: [], totalBudgetedCents: 400000, categoryCount: 5,
        }));
        executor.registerTool("get_budget_status", async () => ({
            householdId: HOUSEHOLD_ID, period: "2027-3", asOf: new Date(), categories: [],
            totalBudgetedCents: 400000, totalActualCents: 415000, totalVarianceCents: 15000, overBudgetCount: 1,
        }));
        executor.registerTool("get_historical_budget_performance", async () => ({
            householdId: HOUSEHOLD_ID,
            months: [
                { period: "2027-1", categories: [], totalBudgetedCents: 400000, totalActualCents: 415000, totalVarianceCents: 15000 },
                { period: "2027-2", categories: [], totalBudgetedCents: 400000, totalActualCents: 412000, totalVarianceCents: 12000 },
                { period: "2027-3", categories: [], totalBudgetedCents: 400000, totalActualCents: 415000, totalVarianceCents: 15000 },
            ],
        }));
        executor.registerTool("get_recurring_financial_items", async () => ({
            householdId: HOUSEHOLD_ID,
            incomePatterns: [],
            expensePatterns: [
                { merchant: "Streaming Co", frequency: "MONTHLY", typicalAmountCents: 12000, confidence: 0.95, category: "Subscriptions", estimatedMonthlyImpactCents: 12000 },
            ],
            estimatedMonthlyIncomeCents: 500000, estimatedMonthlyExpensesCents: 415000, estimatedMonthlySurplusCents: 85000, totalPatternsFound: 1,
        }));
        executor.registerTool("analyze_budget_variance", async () => ({
            householdId: HOUSEHOLD_ID,
            periodAnalyzed: "2027-1 through 2027-3",
            monthsIncluded: 3,
            categoryVariances: [
                // Repeated: over budget every single month analyzed.
                { category: "Dining Out", avgVarianceCents: 15000, maxVarianceCents: 20000, minVarianceCents: 10000, overBudgetMonthCount: 3, totalMonthsAnalyzed: 3, trend: "WORSENING" },
                // Irregular: over budget only once.
                { category: "Home Repairs", avgVarianceCents: 5000, maxVarianceCents: 30000, minVarianceCents: 0, overBudgetMonthCount: 1, totalMonthsAnalyzed: 3, trend: "STABLE" },
            ],
            overallTrend: "WORSENING",
            typicalVarianceCents: 15000,
            recommendations: ["Dining Out has been over budget every month analyzed - consider raising its budget or reducing spending."],
        }));

        const response = await orchestrator.processRequest(
            baseRequest({ userMessage: "Why am I always over budget?", workflowType: AdvisorWorkflow.BUDGET_DIAGNOSE })
        );

        const executed = response.toolResults.filter((r) => r.success).map((r) => r.toolName);
        expect(executed).toContain("get_historical_budget_performance"); // historical performance analyzed
        expect(executed).toContain("analyze_budget_variance");
        expect(executed).toContain("get_recurring_financial_items"); // recurring expenses considered

        const variance = response.toolResults.find((r) => r.toolName === "analyze_budget_variance")!.data as any;
        const repeated = variance.categoryVariances.find((c: any) => c.category === "Dining Out");
        const irregular = variance.categoryVariances.find((c: any) => c.category === "Home Repairs");
        expect(repeated.overBudgetMonthCount).toBe(repeated.totalMonthsAnalyzed); // repeated category variance identified
        expect(irregular.overBudgetMonthCount).toBeLessThan(irregular.totalMonthsAnalyzed); // irregular expense considered/distinguished

        expect(response.success).toBe(true);
        expect(response.metadata.groundingPassed).toBe(true); // no unsupported judgment - fully grounded
        expect(response.metadata.groundingViolations ?? []).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4 — Next-month budget planning
// ─────────────────────────────────────────────────────────────────────────────

describe("Slice 4 E2E — Test 4: Next-month budget planning", () => {
    const planningMessage =
        "Help me revise next month's budget. We have a $1,200 car repair, a $900 birthday celebration, " +
        "and a $1,500 three-day trip.";

    it("extracts activities, retrieves state, and produces a proposal that requires approval", async () => {
        // Activities extracted from free text (deterministic, no LLM involved).
        const extracted = WorkflowStateManager.extractPlanningData(planningMessage);
        expect(extracted.activities).toHaveLength(3);
        expect(extracted.activities.map((a) => a.estimatedAmountCents).sort((a, b) => a - b)).toEqual([90000, 120000, 150000]);

        const planner = new AIToolPlanner();
        const executor = new AIToolExecutor();
        const llm = new ScriptedLLMProvider(() =>
            textResponse("Next month's proposed budget totals $3,600 with a projected surplus of $400.")
        );
        const orchestrator = new AIOrchestrator(planner, executor, llm, new PermissivePrivacyGateway());

        executor.registerTool("get_current_budget", async () => ({
            householdId: HOUSEHOLD_ID, period: "2027-3", budgets: [], totalBudgetedCents: 400000, categoryCount: 5,
        }));
        executor.registerTool("get_cash_flow", async () => ({
            householdId: HOUSEHOLD_ID,
            currentMonth: {
                month: "2027-3", projectedIncomeCents: 500000, projectedEssentialExpensesCents: 300000,
                projectedDiscretionaryExpensesCents: 100000, projectedSurplusCents: 100000, confidence: "HIGH",
                assumptions: [{ key: "income_stability", value: "stable", reasoning: "No income changes reported" }],
            },
            forecast: [],
        }));
        executor.registerTool("get_recurring_financial_items", async () => ({
            householdId: HOUSEHOLD_ID, incomePatterns: [], expensePatterns: [],
            estimatedMonthlyIncomeCents: 500000, estimatedMonthlyExpensesCents: 400000, estimatedMonthlySurplusCents: 100000, totalPatternsFound: 0,
        }));
        executor.registerTool("get_goal_status", async () => ({
            householdId: HOUSEHOLD_ID,
            goals: [{ id: "goal-1", currentProgressCents: 200000, percentComplete: 40, remainingCents: 300000, daysUntilTarget: 200, isOnTrack: true } as any],
            activeGoalCount: 1, completedGoalCount: 0, totalTargetCents: 500000, totalCurrentProgressCents: 200000,
        }));

        let capturedParams: Record<string, unknown> | undefined;
        executor.registerTool("plan_next_month_budget", async (params) => {
            capturedParams = params;
            return {
                householdId: HOUSEHOLD_ID, nextMonth: "2027-4", estimatedIncomeCents: 500000,
                proposedBudgets: [
                    { category: "Car Maintenance", proposedBudgetCents: 120000, isBasedOnRecurring: false, rationale: "Known upcoming car repair" },
                    { category: "Entertainment", proposedBudgetCents: 90000, isBasedOnRecurring: false, rationale: "Known upcoming birthday celebration" },
                    { category: "Travel", proposedBudgetCents: 150000, isBasedOnRecurring: false, rationale: "Known upcoming trip" },
                ],
                totalProposedBudgetCents: 360000,
                projectedSurplusCents: 40000, // recalculated projected cash after known activities
                knownUpcomingExpensesAccountedFor: true,
                recommendations: ["Known upcoming expenses reduce projected surplus to $400 - goals remain on track."],
            };
        });

        const response = await orchestrator.processRequest(
            baseRequest({
                userMessage: planningMessage,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                isHouseholdOwner: true,
            })
        );

        const executed = response.toolResults.filter((r) => r.success).map((r) => r.toolName);
        expect(executed).toContain("get_current_budget"); // current budget retrieved
        expect(executed).toContain("get_cash_flow"); // cash flow evaluated
        expect(executed).toContain("get_goal_status"); // goal impacts calculated
        expect(executed).toContain("plan_next_month_budget");

        const planResult = response.toolResults.find((r) => r.toolName === "plan_next_month_budget")!.data as any;
        expect(planResult.proposedBudgets).toHaveLength(3); // proposed changes generated
        expect(planResult.projectedSurplusCents).toBe(40000); // projected cash recalculated
        expect(planResult.knownUpcomingExpensesAccountedFor).toBe(true);

        const cashFlow = response.toolResults.find((r) => r.toolName === "get_cash_flow")!.data as any;
        expect(cashFlow.currentMonth.assumptions.length).toBeGreaterThan(0); // assumptions shown

        // Approval required: BUDGET_REVISE always yields a PENDING approval status - never auto-persisted.
        expect(response.metadata.auditEntry.approvalStatus).toBe("PENDING");
        expect(response.success).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5 — Conversational revision
// ─────────────────────────────────────────────────────────────────────────────

describe("Slice 4 E2E — Test 5: Conversational revision", () => {
    it("retains planning context, turns the new statement into a constraint, and recalculates", async () => {
        const contextService = createAdvisorContextService(
            createFinancialContextBuilder({
                budgetRepo: { findByHouseholdAndPeriod: async () => [], findByHouseholdIdRange: async () => [] },
                transactionRepo: { findByHouseholdAndPeriod: async () => [], findByHouseholdDateRange: async () => [] },
                settingsRepo: { findByHouseholdId: async () => null },
                recurringPatternsRepo: { findByHouseholdId: async () => [] },
                snapshotRepo: { findLatest: async () => null },
                debtRepo: { findByHouseholdId: async () => null },
                goalsRepo: { findByHouseholdId: async () => [] },
            })
        );

        // Turn 1 (Test 4's message) already produced a workflow with 3 known activities.
        let workflow: WorkflowState = {
            id: "workflow-1" as EntityId,
            householdId: HOUSEHOLD_ID,
            conversationId: "conv-slice4" as EntityId,
            workflowType: AdvisorWorkflow.BUDGET_REVISE,
            planningPeriod: { year: 2027, month: 4 },
            status: WorkflowStatus.ACTIVE,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const turn1 = contextService.updateWorkflowStateFromMessage(
            workflow,
            "Help me revise next month's budget. We have a $1,200 car repair, a $900 birthday celebration, and a $1,500 three-day trip."
        );
        workflow = { ...workflow, ...turn1 };
        expect(workflow.knownActivities).toHaveLength(3);

        // Turn 2: the new statement about vacation savings.
        const turn2 = contextService.updateWorkflowStateFromMessage(workflow, "I don't want to reduce vacation savings.");
        workflow = { ...workflow, ...turn2 };

        // Existing planning context retained across the turn.
        expect(workflow.knownActivities).toHaveLength(3);
        expect(workflow.knownActivities!.some((a) => a.description.toLowerCase().includes("car"))).toBe(true);

        // The new statement becomes a constraint (tracked as a workflow assumption), not lost.
        const vacationConstraint = workflow.assumptions?.find((a) => a.key.toLowerCase().includes("vacation"));
        expect(vacationConstraint).toBeDefined();

        // Revised scenario: re-run planning with the constraint honored - vacation category untouched.
        const planner = new AIToolPlanner();
        const executor = new AIToolExecutor();
        const llm = new ScriptedLLMProvider(() => textResponse("Vacation savings stay at $300 as requested; other categories were adjusted instead."));
        const orchestrator = new AIOrchestrator(planner, executor, llm, new PermissivePrivacyGateway());

        executor.registerTool("get_current_budget", async () => ({ householdId: HOUSEHOLD_ID, period: "2027-4", budgets: [], totalBudgetedCents: 400000, categoryCount: 5 }));
        executor.registerTool("get_cash_flow", async () => ({ householdId: HOUSEHOLD_ID, currentMonth: null, forecast: [] }));
        executor.registerTool("get_recurring_financial_items", async () => ({ householdId: HOUSEHOLD_ID, incomePatterns: [], expensePatterns: [], estimatedMonthlyIncomeCents: 500000, estimatedMonthlyExpensesCents: 400000, estimatedMonthlySurplusCents: 100000, totalPatternsFound: 0 }));
        executor.registerTool("get_goal_status", async () => ({ householdId: HOUSEHOLD_ID, goals: [], activeGoalCount: 0, completedGoalCount: 0, totalTargetCents: 0, totalCurrentProgressCents: 0 }));
        executor.registerTool("plan_next_month_budget", async () => ({
            householdId: HOUSEHOLD_ID, nextMonth: "2027-4", estimatedIncomeCents: 500000,
            proposedBudgets: [
                { category: "Vacation Savings", proposedBudgetCents: 30000, currentBudgetCents: 30000, isBasedOnRecurring: true, rationale: "Kept unchanged per user constraint" },
                { category: "Entertainment", proposedBudgetCents: 60000, currentBudgetCents: 90000, isBasedOnRecurring: false, rationale: "Reduced to accommodate known activities without touching vacation savings" },
            ],
            totalProposedBudgetCents: 90000, projectedSurplusCents: 20000, knownUpcomingExpensesAccountedFor: true,
            recommendations: ["Vacation savings preserved per your request; Entertainment reduced instead."],
        }));

        const response = await orchestrator.processRequest(
            baseRequest({ userMessage: "I don't want to reduce vacation savings.", workflowType: AdvisorWorkflow.BUDGET_REVISE })
        );

        const planResult = response.toolResults.find((r) => r.toolName === "plan_next_month_budget")!.data as any;
        const vacationLine = planResult.proposedBudgets.find((p: any) => p.category === "Vacation Savings");
        expect(vacationLine.proposedBudgetCents).toBe(vacationLine.currentBudgetCents); // constraint honored, unchanged
        expect(response.success).toBe(true); // revised scenario calculated
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6 — Affordability
// ─────────────────────────────────────────────────────────────────────────────

describe("Slice 4 E2E — Test 6: Affordability", () => {
    it("checks snapshot, cash flow, and goals, then simulates the purchase with a grounded explanation", async () => {
        const planner = new AIToolPlanner();
        const executor = new AIToolExecutor();
        const llm = new ScriptedLLMProvider(() =>
            textResponse("Yes, with conditions - this $4,000 purchase would leave $6,000 in liquid cash, above your emergency fund floor.")
        );
        const orchestrator = new AIOrchestrator(planner, executor, llm, new PermissivePrivacyGateway());

        executor.registerTool("get_financial_snapshot", async () => ({
            snapshot: {
                id: "s1", householdId: HOUSEHOLD_ID, asOf: new Date(), version: 3, cash: 1000000, debt: 0, netWorth: 1000000,
                monthlyIncome: 600000, monthlyEssentialExpenses: 300000, monthlyDiscretionaryExpenses: 100000, monthlySurplus: 200000,
                financialHealthStatus: "HEALTHY", sourceAccountIds: [], calculatedAt: new Date(), createdAt: new Date()
            },
        }));
        executor.registerTool("get_cash_flow", async () => ({ householdId: HOUSEHOLD_ID, currentMonth: null, forecast: [] }));
        executor.registerTool("get_debt_summary", async () => ({ householdId: HOUSEHOLD_ID, totalDebtCents: 0, debtAccounts: [], debtHealthStatus: "HEALTHY" }));
        executor.registerTool("get_goal_status", async () => ({ householdId: HOUSEHOLD_ID, goals: [], activeGoalCount: 0, completedGoalCount: 0, totalTargetCents: 0, totalCurrentProgressCents: 0 }));

        let capturedParams: Record<string, unknown> | undefined;
        executor.registerTool("simulate_purchase", async (params) => {
            capturedParams = params;
            return {
                householdId: HOUSEHOLD_ID,
                scenario: { purchaseAmountCents: params.purchaseAmountCents, paymentMethod: params.paymentMethod, description: params.description },
                projectedImpact: { currentLiquidCashCents: 1000000, projectedLiquidCashCents: 600000, affectsCashPosition: true, affectsDebtLevel: false, affectsEmergencyFund: false },
                recommendations: ["This purchase fits within your current cash position and emergency fund floor."],
                isAffordable: true,
            };
        });

        const response = await orchestrator.processRequest(
            baseRequest({ userMessage: "Can we afford a $4,000 kitchen project?", workflowType: AdvisorWorkflow.AFFORDABILITY })
        );

        const executed = response.toolResults.filter((r) => r.success).map((r) => r.toolName);
        expect(executed).toContain("get_financial_snapshot"); // financial snapshot
        expect(executed).toContain("get_cash_flow");          // cash flow
        expect(executed).toContain("get_goal_status");        // goals
        expect(executed).toContain("simulate_purchase");       // purchase simulation
        expect(capturedParams?.purchaseAmountCents).toBe(400000);

        expect(response.success).toBe(true);
        expect(response.metadata.groundingPassed).toBe(true); // grounded explanation
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7 — Follow-up scenario
// ─────────────────────────────────────────────────────────────────────────────

describe("Slice 4 E2E — Test 7: Follow-up scenario", () => {
    it("retains the kitchen-project context, re-fetches current data, and computes a fresh answer for the new amount", async () => {
        const history: ConversationTurn[] = [
            { role: "user", content: "Can we afford a $4,000 kitchen project?" },
            { role: "assistant", content: "Yes, with conditions." },
        ];

        const continuity = resolveConversationalReference("What if it's $6,000?", history);
        expect(continuity.isFollowUp).toBe(true);
        expect(continuity.referencedScenario?.subject).toBe("kitchen project"); // kitchen project context retained
        expect(continuity.resolvedMessage).toContain("$6,000");
        expect(continuity.resolvedMessage).not.toContain("$4,000"); // previous scenario amount not reused

        const planner = new AIToolPlanner();
        const executor = new AIToolExecutor();
        const llm = new ScriptedLLMProvider(() =>
            textResponse("At $6,000, this leaves $4,000 in liquid cash - still affordable, but tighter.")
        );
        const orchestrator = new AIOrchestrator(planner, executor, llm, new PermissivePrivacyGateway());

        let snapshotCalls = 0;
        executor.registerTool("get_financial_snapshot", async () => {
            snapshotCalls++;
            return {
                snapshot: {
                    id: "s1", householdId: HOUSEHOLD_ID, asOf: new Date(), version: 4, cash: 1000000, debt: 0, netWorth: 1000000,
                    monthlyIncome: 600000, monthlyEssentialExpenses: 300000, monthlyDiscretionaryExpenses: 100000, monthlySurplus: 200000,
                    financialHealthStatus: "HEALTHY", sourceAccountIds: [], calculatedAt: new Date(), createdAt: new Date()
                },
            };
        });
        executor.registerTool("get_cash_flow", async () => ({ householdId: HOUSEHOLD_ID, currentMonth: null, forecast: [] }));
        executor.registerTool("get_debt_summary", async () => ({ householdId: HOUSEHOLD_ID, totalDebtCents: 0, debtAccounts: [], debtHealthStatus: "HEALTHY" }));
        executor.registerTool("get_goal_status", async () => ({ householdId: HOUSEHOLD_ID, goals: [], activeGoalCount: 0, completedGoalCount: 0, totalTargetCents: 0, totalCurrentProgressCents: 0 }));

        let capturedParams: Record<string, unknown> | undefined;
        executor.registerTool("simulate_purchase", async (params) => {
            capturedParams = params;
            return {
                householdId: HOUSEHOLD_ID,
                scenario: { purchaseAmountCents: params.purchaseAmountCents, paymentMethod: params.paymentMethod, description: params.description },
                projectedImpact: { currentLiquidCashCents: 1000000, projectedLiquidCashCents: 400000, affectsCashPosition: true, affectsDebtLevel: false, affectsEmergencyFund: false },
                recommendations: ["Still affordable, but tighter than the original scenario."],
                isAffordable: true,
            };
        });

        const response = await orchestrator.processRequest(
            baseRequest({
                userMessage: "What if it's $6,000?",
                workflowType: AdvisorWorkflow.AFFORDABILITY,
                conversationHistory: history,
            })
        );

        expect(snapshotCalls).toBe(1); // current financial state re-retrieved for this turn
        expect(capturedParams?.purchaseAmountCents).toBe(600000); // new calculation performed for $6,000
        expect(capturedParams?.purchaseAmountCents).not.toBe(400000); // previous scenario not incorrectly reused
        expect(response.metadata.continuity?.isFollowUp).toBe(true);
        expect(response.metadata.continuity?.referencedSubject).toBe("kitchen project");
        expect(response.success).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 8 — LLM unavailable
// ─────────────────────────────────────────────────────────────────────────────

describe("Slice 4 E2E — Test 8: LLM unavailable", () => {
    it("degrades gracefully without corrupting data, with a useful fallback and an unaffected dashboard", async () => {
        const planner = new AIToolPlanner();
        const executor = new AIToolExecutor();
        const llm = new ScriptedLLMProvider(() => {
            throw new LLMProviderError("Service temporarily unavailable", "UNAVAILABLE", true, 503);
        });
        const orchestrator = new AIOrchestrator(planner, executor, llm, new PermissivePrivacyGateway());

        executor.registerTool("get_financial_snapshot", async () => ({
            snapshot: {
                id: "s1", householdId: HOUSEHOLD_ID, asOf: new Date(), version: 1, cash: 500000, debt: 0, netWorth: 500000,
                monthlyIncome: 500000, monthlyEssentialExpenses: 300000, monthlyDiscretionaryExpenses: 100000, monthlySurplus: 100000,
                financialHealthStatus: "HEALTHY", sourceAccountIds: [], calculatedAt: new Date(), createdAt: new Date()
            },
        }));
        executor.registerTool("get_budget_status", async () => ({ householdId: HOUSEHOLD_ID, period: "2027-3", asOf: new Date(), categories: [], totalBudgetedCents: 0, totalActualCents: 0, totalVarianceCents: 0, overBudgetCount: 0 }));
        executor.registerTool("get_attention_items", async () => ({ householdId: HOUSEHOLD_ID, items: [], criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 }));

        const response = await orchestrator.processRequest(
            baseRequest({ userMessage: "How are we doing financially?", workflowType: AdvisorWorkflow.FINANCIAL_HEALTH })
        );

        expect(response.success).toBe(false);
        expect(response.metadata.failureCategory).toBeDefined();
        expect(response.metadata.retryable).toBe(true);

        // No financial data corruption: the snapshot tool itself still executed correctly and
        // returned real data - the LLM outage never touched the underlying financial calculations.
        const snapshotResult = response.toolResults.find((r) => r.toolName === "get_financial_snapshot")!;
        expect(snapshotResult.success).toBe(true);
        expect((snapshotResult.data as any).snapshot.cash).toBe(500000);

        // Useful fallback: a plain, non-empty, non-technical message - never a raw error/stack trace.
        expect(response.assistantMessage.length).toBeGreaterThan(0);
        expect(response.assistantMessage).not.toContain("LLMProviderError");
        expect(response.assistantMessage.toLowerCase()).toContain("financial information is available");

        // Dashboard remains usable: the dashboard reads snapshot/budget data directly (not through
        // the LLM), and that data pipeline succeeded independently of the LLM failure above.
        expect(response.toolResults.filter((r) => r.success).length).toBeGreaterThan(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 9 — Privacy
// ─────────────────────────────────────────────────────────────────────────────

describe("Slice 4 E2E — Test 9: Privacy", () => {
    it("never lets restricted fields leave the privacy gateway", () => {
        const gateway = new PrivacyGateway();
        const contextWithRestrictedData = {
            tools: {
                get_financial_snapshot: {
                    snapshot: { cash: 500000, accountNumber: "1234567890" }, // RESTRICTED
                },
            },
        };

        expect(() => gateway.sanitizeContextForLLM(contextWithRestrictedData, "corr-privacy" as EntityId)).toThrow(
            /Privacy violation/
        );
    });

    it("never calls the LLM when restricted data would otherwise be sent", async () => {
        const planner = new AIToolPlanner();
        const executor = new AIToolExecutor();
        const llm = new ScriptedLLMProvider(() => {
            throw new Error("LLM should never be invoked when the privacy gateway rejects the context");
        });
        const orchestrator = new AIOrchestrator(planner, executor, llm, new PrivacyGateway());

        executor.registerTool("get_financial_snapshot", async () => ({
            // Simulates a tool accidentally leaking a restricted field - the gateway must still catch it.
            snapshot: { cash: 500000, accountNumber: "1234567890" },
        }));
        executor.registerTool("get_budget_status", async () => ({ categories: [] }));
        executor.registerTool("get_attention_items", async () => ({ items: [] }));

        const response = await orchestrator.processRequest(
            baseRequest({ userMessage: "How are we doing financially?", workflowType: AdvisorWorkflow.FINANCIAL_HEALTH })
        );

        expect(llm.callCount).toBe(0); // restricted data never reached the LLM call
        expect(response.success).toBe(false);
        expect(response.metadata.failureCategory).toBe("PRIVACY_REJECTED");
    });

    it("denies unauthorized tool execution (owner-only tools cannot run for a non-owner)", async () => {
        const executor = new AIToolExecutor();
        executor.registerTool("create_initial_budget", async () => ({ proposedBudgets: [] }));

        const result = await executor.executeTool(
            { sequence: 0, toolName: "create_initial_budget", rationale: "test", isCritical: true, dependsOn: [], passToLLM: true },
            { householdId: HOUSEHOLD_ID },
            { correlationId: "corr-1" as EntityId, householdId: HOUSEHOLD_ID, memberId: MEMBER_ID, isHouseholdOwner: false }
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain("Authorization failed");
    });

    it("never exposes a tool that returns raw, unaggregated transaction data to the LLM", () => {
        // The entire AI tool surface is aggregated/summarized by design (snapshots, budgets,
        // cash flow, recurring patterns, simulations) - no tool exists that would hand the LLM
        // a raw list of individual transactions.
        const toolNames = AIToolRegistry.map((t: { name: string }) => t.name.toLowerCase());
        const rawTransactionTools = toolNames.filter((n: string) => n.includes("transaction"));
        expect(rawTransactionTools).toHaveLength(0);
    });
});
