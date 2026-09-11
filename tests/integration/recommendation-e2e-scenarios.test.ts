import { describe, it, expect } from "@jest/globals";
import {
    EntityId,
    AdvisorWorkflow,
    ConfidenceLevel,
    SourceTier,
    SourceAuthority,
    SearchResearchResponse,
} from "@house-fin/contracts";
import {
    AIOrchestrator,
    AIToolPlanner,
    AIToolExecutor,
    OrchestratorRequest,
    LLMProvider,
    LLMRequest,
    LLMResponse,
    RecommendationResearchProvider,
    ResearchQuery,
    RecommendationResearchContext,
} from "@house-fin/ai";
import { PrivacyGateway, SanitizedFinancialContext } from "@house-fin/security";

const HOUSEHOLD_ID = "hh-e2e" as EntityId;
const MEMBER_ID = "member-e2e" as EntityId;
const CONVERSATION_ID = "conv-e2e" as EntityId;

/** Test LLM that returns a fixed response. */
class ScriptedLLMProvider implements LLMProvider {
    public callCount = 0;
    public lastRequest?: LLMRequest;
    constructor(private responseText: string) { }
    getName(): string { return "scripted"; }
    getConfig(): Record<string, unknown> { return { model: "test-model" }; }
    getMaxContextTokens(): number { return 100000; }
    validateRequest(): { valid: boolean; errors?: string[] } { return { valid: true }; }
    async generateResponse(request: LLMRequest): Promise<LLMResponse> {
        this.callCount++;
        this.lastRequest = request;
        return {
            content: this.responseText,
            usage: { inputTokens: 200, outputTokens: 60, totalTokens: 260 },
            stopReason: "END_TURN",
            generatedAt: new Date(),
        };
    }
}

/** Privacy gateway that passes data through for test observability. */
class PermissivePrivacyGateway extends PrivacyGateway {
    constructor() { super(undefined as any); }
    override sanitizeContextForLLM(context: Record<string, unknown>, correlationId: EntityId): SanitizedFinancialContext {
        return { ...context, timestamp: new Date(), correlationId, sanitizationApplied: true } as SanitizedFinancialContext;
    }
    override isContextSafe(): boolean { return true; }
}

/** Planner that can be told exactly which tools to run for a scenario. */
function createScenarioPlanner(toolNames: string[]): AIToolPlanner {
    const planner = new AIToolPlanner();
    planner.planToolExecution = (workflowType: AdvisorWorkflow) => ({
        workflowType,
        description: `Scenario plan for ${workflowType}`,
        tools: toolNames.map((toolName, index) => ({
            sequence: index,
            toolName,
            rationale: `Run ${toolName}`,
            isCritical: false,
            dependsOn: [],
            passToLLM: true,
        })),
        estimatedQueries: toolNames.length,
    });
    return planner;
}

function baseRequest(overrides: Partial<OrchestratorRequest> = {}): OrchestratorRequest {
    return {
        correlationId: `corr-${Math.random()}` as EntityId,
        userMessage: "test",
        workflowType: AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION,
        householdId: HOUSEHOLD_ID,
        memberId: MEMBER_ID,
        isHouseholdOwner: true,
        conversationId: CONVERSATION_ID,
        ...overrides,
    };
}

function snapshotFixture(cashCents: number, essentialCents: number) {
    return {
        snapshot: {
            id: "snap-e2e",
            householdId: HOUSEHOLD_ID,
            asOf: new Date("2027-03-01"),
            version: 3,
            cash: cashCents,
            debt: 250000,
            netWorth: 1500000,
            monthlyIncome: 600000,
            monthlyEssentialExpenses: essentialCents,
            monthlyDiscretionaryExpenses: 100000,
            monthlySurplus: 200000,
            financialHealthStatus: "HEALTHY",
            sourceAccountIds: [],
            calculatedAt: new Date("2027-03-01"),
            createdAt: new Date("2027-03-01"),
        },
    };
}

function verifiedTaxResearch(): RecommendationResearchProvider {
    return {
        async research(query: ResearchQuery, _context: RecommendationResearchContext): Promise<SearchResearchResponse> {
            return {
                claim: query.claim,
                status: "VERIFIED",
                results: [{
                    relevanceScore: 95,
                    evidence: {
                        id: "evidence-tax" as EntityId,
                        householdId: HOUSEHOLD_ID,
                        claim: "Federal ordinary income tax brackets are progressive.",
                        source: {
                            name: "IRS",
                            type: "GOVERNMENT",
                            tier: SourceTier.TIER_1_GOVERNMENT,
                            authority: SourceAuthority.REGULATORY,
                        },
                        sourceUrl: "https://irs.gov/tax-brackets",
                        sourceText: "Raw source content must not enter LLM context.",
                        retrievalDate: new Date("2026-09-11T00:00:00.000Z"),
                        freshness: "CURRENT",
                        confidence: ConfidenceLevel.HIGH,
                        usedIn: [],
                        verificationStatus: "VERIFIED",
                        createdAt: new Date("2026-09-11T00:00:00.000Z"),
                    },
                }],
            };
        },
    };
}

function unavailableResearch(): RecommendationResearchProvider {
    return {
        async research(query: ResearchQuery, _context: RecommendationResearchContext): Promise<SearchResearchResponse> {
            return {
                claim: query.claim,
                status: "UNVERIFIED",
                results: [],
            };
        },
    };
}

function buildOrchestrator(
    toolNames: string[],
    responseText: string,
    researchProvider?: RecommendationResearchProvider
): { orchestrator: AIOrchestrator; executor: AIToolExecutor; llm: ScriptedLLMProvider } {
    const executor = new AIToolExecutor();
    const llm = new ScriptedLLMProvider(responseText);
    const orchestrator = new AIOrchestrator(
        createScenarioPlanner(toolNames),
        executor,
        llm,
        new PermissivePrivacyGateway(),
        researchProvider
    );
    return { orchestrator, executor, llm };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — Windfall
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E Scenario 1 — Windfall", () => {
    it("analyzes snapshot, goals, debt, cash flow, and produces a validated recommendation with a decision journal", async () => {
        const { orchestrator, executor, llm } = buildOrchestrator(
            ["get_financial_snapshot", "get_goal_status", "get_debt_summary", "get_cash_flow", "simulate_windfall"],
            "Based on your $10,000 bonus, I recommend putting $6,000 into your emergency fund and $4,000 toward your highest-rate debt.",
        );

        executor.registerTool("get_financial_snapshot", async () => snapshotFixture(800000, 300000));
        executor.registerTool("get_goal_status", async () => ({
            householdId: HOUSEHOLD_ID,
            goals: [{
                id: "goal-ef",
                name: "Emergency Fund",
                targetAmountCents: 1800000,
                currentAmountCents: 900000,
                remainingCents: 900000,
                priority: "HIGH",
                monthsToTarget: 5,
            }],
            onTrackCount: 1,
            atRiskCount: 0,
        }));
        executor.registerTool("get_debt_summary", async () => ({
            householdId: HOUSEHOLD_ID,
            totalDebtCents: 250000,
            debtAccounts: [
                { id: "debt-1", name: "Credit Card", balanceCents: 150000, interestRateBps: 1999, minimumPaymentCents: 3000 },
            ],
            debtHealthStatus: "WATCH",
        }));
        executor.registerTool("get_cash_flow", async () => ({
            householdId: HOUSEHOLD_ID,
            currentMonth: "2027-3",
            netCashFlowCents: 200000,
            forecast: [],
            historicalAverage: { monthlyIncomeCents: 600000, monthlyExpensesCents: 400000, monthlySurplusCents: 200000 },
        }));
        executor.registerTool("simulate_windfall", async () => ({
            householdId: HOUSEHOLD_ID,
            windfallAmountCents: 1000000,
            emergencyFundAllocationCents: 600000,
            debtAllocationCents: 400000,
            recommendations: ["Put $6,000 into emergency fund and $4,000 toward highest-rate debt."],
        }));

        const response = await orchestrator.processRequest(baseRequest({
            userMessage: "We received a $10,000 bonus. What should we do with it?",
            workflowType: AdvisorWorkflow.BUDGET_SCENARIO,
            householdPolicyVersion: 2,
        }));

        expect(response.success).toBe(true);
        const executed = response.toolResults.filter((r) => r.success).map((r) => r.toolName);
        expect(executed).toEqual(["get_financial_snapshot", "get_goal_status", "get_debt_summary", "get_cash_flow", "simulate_windfall"]);
        expect(response.metadata.recommendation?.finalRecommendationProduced).toBe(true);
        expect(response.metadata.recommendation?.candidateCount).toBeGreaterThan(0);
        expect(response.decisionJournalEntry).toBeDefined();
        const journal = response.decisionJournalEntry!;
        expect(journal.question).toContain("$10,000 bonus");
        expect(journal.householdPolicyVersion).toBe(2);
        expect(journal.currentFinancialState.toolResults).toHaveLength(5);
        expect(journal.recommendation.presentedRecommendation).toContain("emergency fund");
        expect(journal.alternatives.length).toBeGreaterThanOrEqual(0);
        expect(journal.validation.recommendationStatus).toBe("PASS");
        expect(journal.personaUsed.key).toBe("kitces_framework");
        expect(journal.approvalState).toBe("PENDING");
        expect(llm.lastRequest?.messages[0].content).toContain("retirement-planning perspective");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — Surprise expense
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E Scenario 2 — Surprise expense", () => {
    it("evaluates liquidity, emergency fund, goals, debt, and funding scenarios", async () => {
        const { orchestrator, executor } = buildOrchestrator(
            ["get_financial_snapshot", "get_cash_flow", "get_goal_status", "get_debt_summary", "simulate_purchase"],
            "I recommend covering the $6,000 expense from your emergency fund and rebuilding it over the next three months.",
        );

        executor.registerTool("get_financial_snapshot", async () => snapshotFixture(1200000, 300000));
        executor.registerTool("get_cash_flow", async () => ({
            householdId: HOUSEHOLD_ID,
            currentMonth: "2027-3",
            netCashFlowCents: 200000,
            forecast: [],
            historicalAverage: { monthlyIncomeCents: 600000, monthlyExpensesCents: 400000, monthlySurplusCents: 200000 },
        }));
        executor.registerTool("get_goal_status", async () => ({
            householdId: HOUSEHOLD_ID,
            goals: [{ id: "goal-ef", name: "Emergency Fund", targetAmountCents: 1800000, currentAmountCents: 1200000, remainingCents: 600000 }],
            onTrackCount: 1,
            atRiskCount: 0,
        }));
        executor.registerTool("get_debt_summary", async () => ({
            householdId: HOUSEHOLD_ID,
            totalDebtCents: 50000,
            debtAccounts: [],
            debtHealthStatus: "HEALTHY",
        }));
        executor.registerTool("simulate_purchase", async () => ({
            householdId: HOUSEHOLD_ID,
            purchaseAmountCents: 600000,
            paymentMethod: "CASH",
            isAffordable: true,
            remainingEmergencyFundMonths: 2,
            impactOnEmergencyFund: "REDUCES_BELOW_TARGET",
            recommendations: ["Cover the $6,000 expense from the emergency fund and rebuild it over the next three months."],
        }));

        const response = await orchestrator.processRequest(baseRequest({
            userMessage: "We have an unexpected $6,000 expense. What should we do?",
            workflowType: AdvisorWorkflow.AFFORDABILITY,
        }));

        expect(response.success).toBe(true);
        const executed = response.toolResults.filter((r) => r.success).map((r) => r.toolName);
        expect(executed).toContain("get_financial_snapshot");
        expect(executed).toContain("simulate_purchase");
        expect(response.metadata.recommendation?.finalRecommendationProduced).toBe(true);
        expect(response.metadata.groundingPassed).toBe(true);
        expect(response.decisionJournalEntry?.validation.recommendationStatus).toBe("PASS");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — Credit card annual fee
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E Scenario 3 — Credit card annual fee", () => {
    it("uses verified current evidence to recommend keeping or closing the card", async () => {
        const { orchestrator, executor } = buildOrchestrator(
            ["get_financial_snapshot"],
            "The card's current annual fee is $95 and your usage justifies keeping it.",
            {
                async research(query: ResearchQuery, _context: RecommendationResearchContext): Promise<SearchResearchResponse> {
                    return {
                        claim: query.claim,
                        status: "VERIFIED",
                        results: [{
                            relevanceScore: 100,
                            evidence: {
                                id: "evidence-card" as EntityId,
                                householdId: HOUSEHOLD_ID,
                                claim: "The card's current annual fee is $95.",
                                source: {
                                    name: "Issuer",
                                    type: "PROVIDER",
                                    tier: SourceTier.TIER_2_PROVIDER,
                                    authority: SourceAuthority.OFFICIAL,
                                },
                                sourceUrl: "https://issuer.example/terms",
                                sourceText: "Raw source text stays out of LLM context.",
                                retrievalDate: new Date("2026-09-11T00:00:00.000Z"),
                                freshness: "CURRENT",
                                confidence: ConfidenceLevel.HIGH,
                                usedIn: [],
                                verificationStatus: "VERIFIED",
                                createdAt: new Date("2026-09-11T00:00:00.000Z"),
                            },
                        }],
                    };
                },
            }
        );

        executor.registerTool("get_financial_snapshot", async () => ({
            ...snapshotFixture(500000, 300000),
            recommendations: ["Keep the card because the $95 annual fee is justified by current usage and benefits."],
        }));

        const response = await orchestrator.processRequest(baseRequest({
            userMessage: "Should we keep this card?",
            workflowType: AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION,
        }));

        expect(response.success).toBe(true);
        expect(response.metadata.research?.status).toBe("VERIFIED");
        expect(response.metadata.research?.evidenceCount).toBe(1);
        expect(response.metadata.recommendation?.finalRecommendationProduced).toBe(true);
        expect(response.metadata.groundingPassed).toBe(true);
        expect(response.decisionJournalEntry?.evidence[0].claim).toContain("$95");
        expect(response.decisionJournalEntry?.validation.recommendationStatus).toBe("PASS");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 — Tax-sensitive decision
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E Scenario 4 — Tax-sensitive decision", () => {
    it("incorporates current tax research and explicit assumptions, and signals uncertainty", async () => {
        const { orchestrator, executor, llm } = buildOrchestrator(
            ["get_financial_snapshot"],
            "With the $20,000 bonus, pre-tax retirement contributions would likely reduce your federal taxable income, but the exact benefit depends on your marginal bracket and state taxes.",
            verifiedTaxResearch()
        );

        executor.registerTool("get_financial_snapshot", async () => ({
            ...snapshotFixture(1000000, 300000),
            windfallAmountCents: 2000000,
            recommendations: ["Pre-tax retirement contributions would likely reduce federal taxable income, but the exact benefit depends on marginal bracket and state taxes."],
        }));

        const response = await orchestrator.processRequest(baseRequest({
            userMessage: "What should we do with this $20,000 bonus considering taxes?",
            workflowType: AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION,
        }));

        expect(response.success).toBe(true);
        expect(response.metadata.research?.status).toBe("VERIFIED");
        expect(response.metadata.research?.evidenceCount).toBeGreaterThan(0);
        expect(response.metadata.groundingPassed).toBe(true);
        expect(response.decisionJournalEntry?.evidence[0].source.tier).toBe("TIER_1_GOVERNMENT");
        expect(llm.lastRequest?.messages[1].content).toContain("tax brackets");
        expect(response.assistantMessage).toContain("depends on");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 — Persona switch
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E Scenario 5 — Persona switch", () => {
    async function runWithPersona(personaKey: string) {
        const { orchestrator, executor } = buildOrchestrator(
            ["get_financial_snapshot"],
            "I recommend investing the windfall in a diversified portfolio aligned with your retirement horizon.",
        );
        executor.registerTool("get_financial_snapshot", async () => ({
            ...snapshotFixture(2000000, 300000),
            recommendations: ["Invest the windfall in a diversified portfolio aligned with your retirement horizon."],
        }));

        return orchestrator.processRequest(baseRequest({
            userMessage: "What should we do with a $10,000 bonus?",
            workflowType: AdvisorWorkflow.BUDGET_SCENARIO,
            advisorPersonaKey: personaKey,
        }));
    }

    it("produces identical data, validation, and recommendation under different personas; only presentation changes", async () => {
        const kitces = await runWithPersona("kitces_framework");
        const edelman = await runWithPersona("edelman_framework");

        expect(kitces.success).toBe(true);
        expect(edelman.success).toBe(true);
        expect(kitces.toolResults.map((r) => r.toolName)).toEqual(edelman.toolResults.map((r) => r.toolName));
        expect(kitces.toolResults.map((r) => r.data)).toEqual(edelman.toolResults.map((r) => r.data));
        expect(kitces.metadata.recommendation?.candidateCount).toBe(edelman.metadata.recommendation?.candidateCount);
        expect(kitces.metadata.recommendation?.validationStatus).toBe(edelman.metadata.recommendation?.validationStatus);
        expect(kitces.metadata.recommendation?.finalRecommendationProduced).toBe(edelman.metadata.recommendation?.finalRecommendationProduced);
        expect(kitces.metadata.research).toEqual(edelman.metadata.research);
        expect(kitces.decisionJournalEntry?.recommendation.deterministicRecommendation)
            .toBe(edelman.decisionJournalEntry?.recommendation.deterministicRecommendation);
        expect(kitces.decisionJournalEntry?.validation).toEqual(edelman.decisionJournalEntry?.validation);

        expect(kitces.metadata.advisorStyle).toBe("Retirement Planning");
        expect(edelman.metadata.advisorStyle).toBe("Longevity Planning");
        expect(kitces.decisionJournalEntry?.personaUsed.key).not.toBe(edelman.decisionJournalEntry?.personaUsed.key);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 — Research unavailable
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E Scenario 6 — Research unavailable", () => {
    it("refuses to fabricate current facts or produce an unsupported recommendation", async () => {
        const { orchestrator, executor, llm } = buildOrchestrator(
            ["get_financial_snapshot"],
            "I recommend keeping the card.",
            unavailableResearch()
        );

        executor.registerTool("get_financial_snapshot", async () => snapshotFixture(500000, 300000));

        const response = await orchestrator.processRequest(baseRequest({
            userMessage: "Should we keep this card?",
            workflowType: AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION,
        }));

        expect(response.success).toBe(false);
        expect(response.metadata.failureCategory).toBe("RESEARCH_UNAVAILABLE");
        expect(response.metadata.research?.status).toBe("UNAVAILABLE");
        expect(llm.callCount).toBe(0);
        expect(response.assistantMessage).toContain("couldn't verify");
        expect(response.decisionJournalEntry).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7 — Validator failure
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E Scenario 7 — Validator failure", () => {
    it("rejects an ungrounded LLM recommendation and returns a safe, tool-backed fallback", async () => {
        const { orchestrator, executor, llm } = buildOrchestrator(
            ["get_financial_snapshot", "simulate_windfall"],
            "I recommend investing the entire $50,000 bonus in a speculative fund.",
        );

        executor.registerTool("get_financial_snapshot", async () => snapshotFixture(500000, 300000));
        executor.registerTool("simulate_windfall", async () => ({
            householdId: HOUSEHOLD_ID,
            windfallAmountCents: 1000000,
            recommendations: ["Allocate the windfall across emergency fund, debt, and diversified investments."],
        }));

        const response = await orchestrator.processRequest(baseRequest({
            userMessage: "What should we do with a $10,000 bonus?",
            workflowType: AdvisorWorkflow.BUDGET_SCENARIO,
        }));

        expect(response.success).toBe(true);
        expect(response.metadata.groundingPassed).toBe(false);
        expect(response.metadata.groundingViolations).toContain("UNSUPPORTED_NUMBER");
        expect(response.assistantMessage).not.toContain("$50,000");
        expect(response.assistantMessage).not.toContain("speculative fund");
        expect(response.assistantMessage).toContain("Based on your current financial data");
        expect(response.decisionJournalEntry).toBeDefined();
        expect(response.decisionJournalEntry?.validation.groundingPassed).toBe(false);
        expect(response.decisionJournalEntry?.validation.recommendationStatus).toBe("PASS");
        expect(llm.callCount).toBe(1);
    });
});
