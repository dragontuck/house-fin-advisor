import { AdvisorWorkflow, EntityId } from "@house-fin/contracts";
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
                durationMs: 5,
                retries: 0,
                executedAt: new Date("2026-09-11T10:00:00.000Z"),
            }],
            evidence: [],
            workflow: {
                scenarioConstruction: { sourceTools: ["simulate_budget_change"] },
                candidates: ["Build emergency savings.", "Pay down debt."],
                validation: { status: "PASS", summary: "Validated." },
                finalRecommendation: "Build emergency savings.",
            },
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
        expect(entry.alternatives).toEqual(["Pay down debt."]);
        expect(entry.confidence.level).toBe("NOT_ASSESSED");
        expect(entry.approvalState).toBe("PENDING");
    });
});