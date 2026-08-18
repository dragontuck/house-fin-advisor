/**
 * Integration Tests for Financial Context Builder
 * 
 * Tests the workflow-aware context building system
 */

import {
    EntityId,
    MoneyFromDollars,
    Budget,
    PostedTransaction,
    Money,
    RecurringFrequency,
    AdvisorWorkflow,
} from "@house-fin/contracts";
import {
    createFinancialContextBuilder,
    FinancialContextBuilder,
} from "../../packages/ai/financial-context-builder";

describe("Financial Context Builder Integration Tests", () => {
    let builder: FinancialContextBuilder;
    const householdId = EntityId("test-household-1");

    beforeEach(() => {
        // Create mock repositories
        const repos = {
            budgetRepo: {
                findByHouseholdAndPeriod: async (hid: EntityId, year: number, month: number) => {
                    if (month === 8 && year === 2026) {
                        return [
                            {
                                id: EntityId("budget-1"),
                                householdId: hid,
                                category: "Groceries",
                                amountCents: MoneyFromDollars(400),
                                periodYear: 2026,
                                periodMonth: 8,
                                version: 1,
                                createdAt: new Date("2026-08-01"),
                                updatedAt: new Date("2026-08-01"),
                            },
                            {
                                id: EntityId("budget-2"),
                                householdId: hid,
                                category: "Utilities",
                                amountCents: MoneyFromDollars(150),
                                periodYear: 2026,
                                periodMonth: 8,
                                version: 1,
                                createdAt: new Date("2026-08-01"),
                                updatedAt: new Date("2026-08-01"),
                            },
                        ];
                    }
                    return [];
                },
                findByHouseholdIdRange: async () => [],
            },
            transactionRepo: {
                findByHouseholdAndPeriod: async (hid: EntityId, year: number, month: number) => {
                    if (month === 8 && year === 2026) {
                        return [
                            {
                                id: EntityId("txn-1"),
                                householdId: hid,
                                accountId: EntityId("account-1"),
                                postedDate: new Date("2026-08-05"),
                                transactionDate: new Date("2026-08-05"),
                                amountCents: 12000,
                                direction: "DEBIT",
                                merchant: "Whole Foods",
                                description: "Groceries",
                                confidenceScore: 0.95,
                                sourceDocumentId: EntityId("doc-1"),
                            },
                        ];
                    }
                    return [];
                },
            },
            settingsRepo: {
                findByHouseholdId: async () => ({
                    id: EntityId("settings-1"),
                    householdId,
                    monthlyIncome: MoneyFromDollars(5000),
                    monthlyEssentialExpenses: MoneyFromDollars(2000),
                    monthlyDiscretionaryExpenses: MoneyFromDollars(800),
                    currency: "USD",
                    incomeSource: "manual_entry",
                    updatedBy: EntityId("member-1"),
                    updatedAt: new Date("2026-08-01"),
                    createdAt: new Date("2026-01-01"),
                }),
            },
            recurringPatternsRepo: {
                findByHouseholdId: async () => [
                    {
                        id: EntityId("pattern-1"),
                        householdId,
                        mostCommonCategory: "Groceries",
                        frequency: RecurringFrequency.WEEKLY,
                        typicalAmountCents: 12000 as Money,
                        occurrencesInPeriod: 4,
                        lastOccurrenceDate: new Date("2026-08-15"),
                        confidence: 0.95,
                        createdAt: new Date("2026-07-01"),
                    },
                ],
            },
            snapshotRepo: {
                findLatest: async () => ({
                    id: EntityId("snapshot-1"),
                    householdId,
                    asOf: new Date("2026-08-18"),
                    totalAssetsIncome: MoneyFromDollars(5000),
                    totalExpenses: MoneyFromDollars(2800),
                    netCashFlow: MoneyFromDollars(2200),
                    savingsBalance: MoneyFromDollars(10000),
                    emergencyFundTarget: MoneyFromDollars(15000),
                    emergencyFundPercentage: 66.7,
                    createdAt: new Date("2026-08-18"),
                }),
            },
            debtRepo: {
                findByHouseholdId: async () => [],
            },
            goalsRepo: {
                findByHouseholdId: async () => [],
            },
        };

        builder = createFinancialContextBuilder(repos as any);
    });

    describe("Context Profiles by Workflow Type", () => {
        it("BUDGET_CREATE: Should retrieve context with current budget", async () => {
            const context = await builder.buildContext(
                householdId,
                "Help me create a budget",
                {
                    householdId: householdId,
                    workflowType: AdvisorWorkflow.BUDGET_CREATE,
                    state: {},
                    status: "ACTIVE",
                    createdAt: new Date(),
                } as any
            );

            expect(context).toBeDefined();
            expect(context.householdId).toBe(householdId);
            expect(context.workflowType).toBe(AdvisorWorkflow.BUDGET_CREATE);
            expect(context.toolsRequired).toBeDefined();
            expect(context.toolsRequired.length).toBeGreaterThan(0);
        });

        it("BUDGET_SCENARIO: Should retrieve only current budget", async () => {
            const context = await builder.buildContext(
                householdId,
                "What if I cut groceries?",
                {
                    householdId: householdId,
                    workflowType: AdvisorWorkflow.BUDGET_SCENARIO,
                    state: {},
                    status: "ACTIVE",
                    createdAt: new Date(),
                } as any
            );

            expect(context).toBeDefined();
            expect(context.currentBudget).toBeDefined();
        });

        it("AFFORDABILITY: Should retrieve cash flow context", async () => {
            const context = await builder.buildContext(
                householdId,
                "Can I afford this purchase?",
                {
                    householdId: householdId,
                    workflowType: AdvisorWorkflow.AFFORDABILITY,
                    state: {},
                    status: "ACTIVE",
                    createdAt: new Date(),
                } as any
            );

            expect(context).toBeDefined();
            expect(context.projectedCashFlow).toBeDefined();
        });
    });

    describe("Context Metadata", () => {
        it("Should include contextVersions and asOf timestamp", async () => {
            const context = await builder.buildContext(
                householdId,
                "Help me budget",
                {
                    householdId: householdId,
                    workflowType: AdvisorWorkflow.BUDGET_CREATE,
                    state: {},
                    status: "ACTIVE",
                    createdAt: new Date(),
                } as any
            );

            expect(context.contextVersions).toBeDefined();
            expect(context.asOf).toBeDefined();
            expect(context.asOf).toBeInstanceOf(Date);
        });

        it("Should include metadata in each context section", async () => {
            const context = await builder.buildContext(
                householdId,
                "Help me budget",
                {
                    householdId: householdId,
                    workflowType: AdvisorWorkflow.BUDGET_CREATE,
                    state: {},
                    status: "ACTIVE",
                    createdAt: new Date(),
                } as any
            );

            if (context.currentBudget) {
                expect(context.currentBudget.metadata).toBeDefined();
                expect(context.currentBudget.metadata.version).toBeDefined();
                expect(context.currentBudget.metadata.calculatedAt).toBeDefined();
                expect(context.currentBudget.metadata.confidence).toBeDefined();
            }
        });
    });

    describe("Tool Requirement Mapping", () => {
        it("BUDGET_CREATE should include create_initial_budget tool", async () => {
            const context = await builder.buildContext(
                householdId,
                "Help me create a budget",
                {
                    householdId: householdId,
                    workflowType: AdvisorWorkflow.BUDGET_CREATE,
                    state: {},
                    status: "ACTIVE",
                    createdAt: new Date(),
                } as any
            );

            expect(context.toolsRequired).toContain("create_initial_budget");
        });

        it("BUDGET_DIAGNOSE should include analyze_budget_variance tool", async () => {
            const context = await builder.buildContext(
                householdId,
                "Why is my budget over?",
                {
                    householdId: householdId,
                    workflowType: AdvisorWorkflow.BUDGET_DIAGNOSE,
                    state: {},
                    status: "ACTIVE",
                    createdAt: new Date(),
                } as any
            );

            expect(context.toolsRequired).toContain("analyze_budget_variance");
        });

        it("BUDGET_SCENARIO should include simulate_budget_change when scenario is active", async () => {
            const context = await builder.buildContext(
                householdId,
                "What if I cut groceries?",
                {
                    id: EntityId("workflow-1"),
                    householdId: householdId,
                    workflowType: AdvisorWorkflow.BUDGET_SCENARIO,
                    state: {},
                    status: "ACTIVE",
                    createdAt: new Date(),
                    currentScenario: {
                        type: "SPENDING_CHANGE",
                        description: "Cut groceries",
                    },
                } as any
            );

            expect(context.toolsRequired).toContain("simulate_budget_change");
        });
    });

    describe("Attention Item Detection", () => {
        it("Should detect attention items when present", async () => {
            const context = await builder.buildContext(
                householdId,
                "Help me budget",
                {
                    householdId: householdId,
                    workflowType: AdvisorWorkflow.BUDGET_CREATE,
                    state: {},
                    status: "ACTIVE",
                    createdAt: new Date(),
                } as any
            );

            // attention items may or may not be present depending on data
            if (context.attentionItems) {
                context.attentionItems.forEach((item) => {
                    expect(item.id).toBeDefined();
                    expect(item.type).toBeDefined();
                    expect(item.severity).toBeDefined();
                    expect(["HIGH", "MEDIUM", "LOW"]).toContain(item.severity);
                    expect(item.description).toBeDefined();
                    expect(item.suggestedAction).toBeDefined();
                });
            }
        });
    });

    describe("Cash Flow Projection", () => {
        it("Should calculate projected income from settings", async () => {
            const context = await builder.buildContext(
                householdId,
                "Help me budget",
                {
                    householdId: householdId,
                    workflowType: AdvisorWorkflow.BUDGET_CREATE,
                    state: {},
                    status: "ACTIVE",
                    createdAt: new Date(),
                } as any
            );

            if (context.projectedCashFlow) {
                expect(context.projectedCashFlow.projectedIncomeCents).toBe(MoneyFromDollars(5000));
            }
        });

        it("Should include cash flow metadata", async () => {
            const context = await builder.buildContext(
                householdId,
                "Help me budget",
                {
                    householdId: householdId,
                    workflowType: AdvisorWorkflow.BUDGET_CREATE,
                    state: {},
                    status: "ACTIVE",
                    createdAt: new Date(),
                } as any
            );

            if (context.projectedCashFlow) {
                expect(context.projectedCashFlow.confidence).toBeDefined();
                expect(context.projectedCashFlow.assumptions).toBeDefined();
                expect(context.projectedCashFlow.calculatedAt).toBeDefined();
            }
        });
    });

    describe("Recurring Obligations", () => {
        it("Should project recurring obligations from patterns", async () => {
            const context = await builder.buildContext(
                householdId,
                "Help me budget",
                {
                    householdId: householdId,
                    workflowType: AdvisorWorkflow.BUDGET_CREATE,
                    state: {},
                    status: "ACTIVE",
                    createdAt: new Date(),
                } as any
            );

            if (context.recurringObligations) {
                expect(context.recurringObligations.totalMonthlyProjectionCents).toBeGreaterThanOrEqual(0);
                expect(context.recurringObligations.patterns).toBeDefined();
                expect(context.recurringObligations.metadata).toBeDefined();
            }
        });
    });

    describe("All Workflow Types", () => {
        const workflowTypes = [
            AdvisorWorkflow.BUDGET_CREATE,
            AdvisorWorkflow.BUDGET_DIAGNOSE,
            AdvisorWorkflow.BUDGET_REVISE,
            AdvisorWorkflow.BUDGET_SCENARIO,
            AdvisorWorkflow.BUDGET_STATUS,
            AdvisorWorkflow.CASH_FLOW,
            AdvisorWorkflow.GOAL_STATUS,
            AdvisorWorkflow.DEBT_STATUS,
            AdvisorWorkflow.AFFORDABILITY,
            AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION,
        ];

        workflowTypes.forEach((workflow) => {
            it(`Should build valid context for ${workflow}`, async () => {
                const context = await builder.buildContext(
                    householdId,
                    "Test question",
                    {
                        householdId: householdId,
                        workflowType: workflow,
                        state: {},
                        status: "ACTIVE",
                        createdAt: new Date(),
                    } as any
                );

                expect(context).toBeDefined();
                expect(context.workflowType).toBe(workflow);
                expect(context.contextVersions).toBeDefined();
                expect(context.toolsRequired).toBeDefined();
                expect(context.toolsRequired).toBeInstanceOf(Array);
            });
        });
    });
});
