import { AdvisorWorkflow, EntityId, Money, ConfidenceLevel } from "@house-fin/contracts";
import { buildDecisionJournalEntry, isHistoricalRecommendationQuestion } from "@house-fin/ai";

describe("decision journal generation snapshot", () => {
    test("recognizes a request to explain a previous recommendation", () => {
        expect(isHistoricalRecommendationQuestion(
            "Why did you recommend putting the bonus into emergency savings?"
        )).toBe(true);
        expect(isHistoricalRecommendationQuestion("How much is in savings today?")).toBe(false);
    });

    test("preserves financial context independently of later input mutation", () => {
        const providedContext = {
            contextVersions: { snapshotVersion: 4, settingsVersion: 2 },
            snapshot: { id: "snapshot-4", cashCents: 250000 },
        };
        const toolData = {
            recommendations: ["Build emergency savings."],
            monthlyExpensesCents: 200000,
        };

        const entry = buildDecisionJournalEntry({
            request: {
                correlationId: "recommendation-1" as EntityId,
                userMessage: "Where should my bonus go?",
                workflowType: AdvisorWorkflow.BUDGET_SCENARIO,
                householdId: "household-1" as EntityId,
                memberId: "member-1" as EntityId,
                isHouseholdOwner: true,
                financialContext: providedContext,
                advisorPersonaKey: "kitces_framework",
            },
            toolResults: [{
                sequence: 1,
                toolName: "simulate_budget_change",
                success: true,
                data: toolData,
                parameters: { budgetAdjustment: { category: "savings", amountCents: 50000 } },
                durationMs: 5,
                retries: 0,
                executedAt: new Date("2026-09-11T10:00:00.000Z"),
            }],
            evidence: [],
            workflow: {
                scenarioConstruction: {
                    sourceTools: ["simulate_budget_change"],
                    scenarios: [{
                        id: "scenario-1" as EntityId,
                        householdId: "household-1" as EntityId,
                        type: "ALLOCATION" as const,
                        baseline: { cash: 250000, debt: 0, netWorth: 250000, monthlyIncome: 50000, monthlyEssentialExpenses: 20000, monthlyDiscretionaryExpenses: 10000, monthlySurplus: 20000, version: 1 },
                        proposed: { cash: 300000, debt: 0, netWorth: 300000, monthlyIncome: 50000, monthlyEssentialExpenses: 20000, monthlyDiscretionaryExpenses: 10000, monthlySurplus: 20000, version: 1 },
                        justification: "Allocate bonus to savings",
                        timeframeMonths: 1,
                        createdAt: new Date("2026-09-11T10:00:00.000Z"),
                    }],
                },
                candidates: [{
                    id: "candidate-1",
                    type: "SAVINGS_ALLOCATION" as const,
                    title: "Build emergency savings.",
                    summary: "Allocate bonus to emergency fund",
                    recommendedAction: "Put $5,000 bonus into emergency savings",
                    alternatives: [{ title: "Pay down debt", reasoning: "Reduce debt burden" }],
                    scenarioIds: ["scenario-1" as EntityId],
                    expectedImpact: { cashFlowImpact: Money(0), wealthIncrease: Money(50000), debtReduction: Money(0), timeframeMonths: 1 },
                    evidence: [],
                    assumptions: [],
                    risks: [],
                    confidence: ConfidenceLevel.MEDIUM,
                    confidenceReasoning: "Reasonable allocation",
                    confidenceFactors: { dataQuality: "HIGH", calculationStrength: "HIGH", evidenceFreshness: "CURRENT", evidenceTier: "TIER_1_GOVERNMENT" },
                    compliesWithPolicy: true,
                    policyVersion: 1,
                }],
                validations: [{
                    status: "PASS" as const,
                    summary: "Validated",
                    passedChecks: 5,
                    failedChecks: 0,
                    warningChecks: 0,
                    details: [],
                    adversarialReview: { question: "What could go wrong?", challenges: [], weaknesses: [] },
                    confidenceAfterValidation: ConfidenceLevel.MEDIUM,
                }],
                validation: { status: "PASS", summary: "Validated." },
                finalRecommendation: {
                    type: "SAVINGS_ALLOCATION" as const,
                    title: "Build emergency savings.",
                    scenarioIds: ["scenario-1" as EntityId],
                    policyVersion: 1,
                    recommendedAction: "Put $5,000 bonus into emergency savings",
                    why: "Building emergency fund",
                    alternatives: [{ title: "Pay down debt", reasoning: "Reduce debt burden" }],
                    impact: { cashFlowImpact: Money(0), wealthIncrease: Money(50000), debtReduction: Money(0), timeframeMonths: 1 },
                    assumptions: [],
                    risks: [],
                    evidence: [],
                    validation: {
                        status: "PASS" as const,
                        summary: "Validated",
                        passedChecks: 5,
                        failedChecks: 0,
                        warningChecks: 0,
                        details: [],
                        adversarialReview: { question: "What could go wrong?", challenges: [], weaknesses: [] },
                        confidenceAfterValidation: ConfidenceLevel.MEDIUM,
                    },
                    confidence: ConfidenceLevel.MEDIUM,
                    confidenceReasoning: "Reasonable allocation",
                    approvalRequired: false,
                } as any,
            } as any,
            presentedRecommendation: "Put the bonus into emergency savings.",
            groundingPassed: true,
            groundingViolations: [],
            advisorStyle: {
                key: "kitces_framework",
                label: "Retirement Planning",
                instruction: "Use a structured retirement-planning perspective.",
            },
            generatedAt: new Date("2026-09-11T10:01:00.000Z"),
        });

        providedContext.snapshot.cashCents = 0;
        toolData.monthlyExpensesCents = 999999;

        expect(entry.question).toBe("Where should my bonus go?");
        expect(entry.financialSnapshotId).toBe("snapshot-4");
        expect(entry.financialSnapshotVersion).toBe(4);
        expect(entry.householdPolicyVersion).toBe(2);
        expect(entry.currentFinancialState).toMatchObject({
            providedContext: { snapshot: { cashCents: 250000 } },
            toolResults: [{ data: { monthlyExpensesCents: 200000 } }],
        });
        expect(entry.alternatives).toEqual(["Pay down debt"]);
        expect(entry.confidence.level).toBe("MEDIUM");
        expect(entry.approvalState).toBe("PENDING");
    });
});