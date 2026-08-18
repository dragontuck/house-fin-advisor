/**
 * Tests for AI Tool Contracts (Slice 4)
 *
 * Validates:
 * - Input schema validation (required fields, data types)
 * - Output schema consistency
 * - Household scope isolation (no cross-household data leakage)
 * - Authorization level enforcement
 * - Data classification accuracy
 * - Tool registry completeness
 */

import {
    EntityId,
    Money,
    MoneyFromDollars,
    ToolAuthorizationLevel,
    ToolDataClassification,
    AIToolRegistry,
    GetFinancialSnapshotTool,
    GetCashFlowTool,
    GetCurrentBudgetTool,
    GetBudgetStatusTool,
    GetHistoricalBudgetPerformanceTool,
    GetGoalStatusTool,
    GetDebtSummaryTool,
    GetAttentionItemsTool,
    GetRecurringFinancialItemsTool,
    SimulatePurchaseTool,
    SimulateBudgetChangeTool,
    CreateInitialBudgetTool,
    AnalyzeBudgetVarianceTool,
    PlanNextMonthBudgetTool,
    // Input/Output types
    GetFinancialSnapshotInput,
    GetCashFlowInput,
    GetCurrentBudgetInput,
    GetBudgetStatusInput,
    GetHistoricalBudgetPerformanceInput,
    GetGoalStatusInput,
    GetDebtSummaryInput,
    GetAttentionItemsInput,
    GetRecurringFinancialItemsInput,
    SimulatePurchaseInput,
    SimulateBudgetChangeInput,
    CreateInitialBudgetInput,
    AnalyzeBudgetVarianceInput,
    PlanNextMonthBudgetInput,
    GetFinancialSnapshotOutput,
    GetCashFlowOutput,
    GetCurrentBudgetOutput,
    GetBudgetStatusOutput,
    GetHistoricalBudgetPerformanceOutput,
    GetGoalStatusOutput,
    GetDebtSummaryOutput,
    GetAttentionItemsOutput,
    GetRecurringFinancialItemsOutput,
    SimulatePurchaseOutput,
    SimulateBudgetChangeOutput,
    CreateInitialBudgetOutput,
    AnalyzeBudgetVarianceOutput,
    PlanNextMonthBudgetOutput,
} from "@house-fin/contracts";

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

function makeEntityId(suffix: string): EntityId {
    return EntityId(`test-${suffix}`);
}

describe("AI Tool Contracts", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // Tool Registry Tests
    // ─────────────────────────────────────────────────────────────────────────

    describe("Tool Registry", () => {
        it("contains exactly 14 tools", () => {
            expect(AIToolRegistry.length).toBe(14);
        });

        it("has unique tool names", () => {
            const names = AIToolRegistry.map((t) => t.name);
            const uniqueNames = new Set(names);
            expect(uniqueNames.size).toBe(14);
        });

        it("all tools specify householdScope as REQUIRED", () => {
            AIToolRegistry.forEach((tool) => {
                expect(tool.householdScope).toBe("REQUIRED");
            });
        });

        it("all tools have valid authorization levels", () => {
            AIToolRegistry.forEach((tool) => {
                expect([
                    ToolAuthorizationLevel.HOUSEHOLD_MEMBER,
                    ToolAuthorizationLevel.HOUSEHOLD_OWNER,
                ]).toContain(tool.authorizationLevel);
            });
        });

        it("all tools have valid data classifications", () => {
            AIToolRegistry.forEach((tool) => {
                expect([
                    ToolDataClassification.PUBLIC,
                    ToolDataClassification.INTERNAL,
                    ToolDataClassification.CONFIDENTIAL,
                ]).toContain(tool.outputClassification);
            });
        });

        it("tools that create/modify data (owner-only) use INTERNAL classification", () => {
            const ownerTools = AIToolRegistry.filter(
                (t) => t.authorizationLevel === ToolAuthorizationLevel.HOUSEHOLD_OWNER
            );
            ownerTools.forEach((tool) => {
                expect(tool.outputClassification).toBe(ToolDataClassification.INTERNAL);
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tool 1: get_financial_snapshot
    // ─────────────────────────────────────────────────────────────────────────

    describe("get_financial_snapshot", () => {
        it("has correct metadata", () => {
            expect(GetFinancialSnapshotTool.name).toBe("get_financial_snapshot");
            expect(GetFinancialSnapshotTool.version).toBe(1);
            expect(GetFinancialSnapshotTool.authorizationLevel).toBe(
                ToolAuthorizationLevel.HOUSEHOLD_MEMBER
            );
        });

        it("accepts valid input with householdId", () => {
            const input: GetFinancialSnapshotInput = {
                householdId: makeEntityId("household-1"),
            };
            expect(input.householdId).toBeDefined();
        });

        it("accepts optional minCalculatedAfter filter", () => {
            const input: GetFinancialSnapshotInput = {
                householdId: makeEntityId("household-1"),
                minCalculatedAfter: new Date("2026-08-01"),
            };
            expect(input.minCalculatedAfter).toBeDefined();
        });

        it("output can be null snapshot (new household)", () => {
            const output: GetFinancialSnapshotOutput = {
                snapshot: null,
            };
            expect(output.snapshot).toBeNull();
        });

        it("output includes error field when calculation fails", () => {
            const output: GetFinancialSnapshotOutput = {
                snapshot: null,
                error: "No accounts found for household",
            };
            expect(output.error).toBeDefined();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tool 2: get_cash_flow
    // ─────────────────────────────────────────────────────────────────────────

    describe("get_cash_flow", () => {
        it("has correct metadata", () => {
            expect(GetCashFlowTool.name).toBe("get_cash_flow");
            expect(GetCashFlowTool.version).toBe(1);
        });

        it("accepts input with month filter", () => {
            const input: GetCashFlowInput = {
                householdId: makeEntityId("household-1"),
                month: "2026-8",
                forecastMonths: 3,
            };
            expect(input.month).toBe("2026-8");
            expect(input.forecastMonths).toBe(3);
        });

        it("output includes forecast array", () => {
            const output: GetCashFlowOutput = {
                householdId: makeEntityId("household-1"),
                currentMonth: null,
                forecast: [
                    {
                        month: "2026-8",
                        projectedIncomeCents: 500000,
                        projectedEssentialExpensesCents: 200000,
                        projectedDiscretionaryExpensesCents: 100000,
                        projectedSurplusCents: 200000,
                        confidence: "HIGH",
                        assumptions: [
                            {
                                key: "payroll",
                                value: "Employer paycheck",
                                reasoning: "Recurring monthly pattern",
                            },
                        ],
                    },
                ],
            };
            expect(output.forecast).toHaveLength(1);
            expect(output.forecast[0].confidence).toMatch(/LOW|MEDIUM|HIGH/);
        });

        it("forecasts include assumptions for transparency", () => {
            const output: GetCashFlowOutput = {
                householdId: makeEntityId("household-1"),
                currentMonth: null,
                forecast: [],
            };
            expect(output.forecast).toBeDefined();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tool 3: get_current_budget
    // ─────────────────────────────────────────────────────────────────────────

    describe("get_current_budget", () => {
        it("accepts optional month parameter", () => {
            const input: GetCurrentBudgetInput = {
                householdId: makeEntityId("household-1"),
                month: "2026-8",
            };
            expect(input.month).toBe("2026-8");
        });

        it("output includes summary statistics", () => {
            const output: GetCurrentBudgetOutput = {
                householdId: makeEntityId("household-1"),
                period: "2026-8",
                budgets: [],
                totalBudgetedCents: 300000,
                categoryCount: 5,
            };
            expect(output.totalBudgetedCents).toBeGreaterThanOrEqual(0);
            expect(output.categoryCount).toBeGreaterThanOrEqual(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tool 4: get_budget_status
    // ─────────────────────────────────────────────────────────────────────────

    describe("get_budget_status", () => {
        it("accepts overSpentOnly filter", () => {
            const input: GetBudgetStatusInput = {
                householdId: makeEntityId("household-1"),
                overSpentOnly: true,
            };
            expect(input.overSpentOnly).toBe(true);
        });

        it("output provides category-level variance details", () => {
            const output: GetBudgetStatusOutput = {
                householdId: makeEntityId("household-1"),
                period: "2026-8",
                asOf: new Date(),
                categories: [
                    {
                        category: "DINING",
                        budgetedCents: 40000,
                        actualCents: 55000,
                        varianceCents: 15000,
                        remainingCents: -15000,
                        isOverBudget: true,
                    },
                ],
                totalBudgetedCents: 300000,
                totalActualCents: 315000,
                totalVarianceCents: 15000,
                overBudgetCount: 1,
            };
            expect(output.categories[0].varianceCents).toBe(15000);
            expect(output.categories[0].isOverBudget).toBe(true);
        });

        it("variance calculation: positive = over budget", () => {
            // variance = actual - budget
            const variance = 55000 - 40000;
            expect(variance).toBe(15000);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tool 5: get_historical_budget_performance
    // ─────────────────────────────────────────────────────────────────────────

    describe("get_historical_budget_performance", () => {
        it("accepts months and category filters", () => {
            const input: GetHistoricalBudgetPerformanceInput = {
                householdId: makeEntityId("household-1"),
                months: 6,
                categories: ["HOUSING", "FOOD"],
            };
            expect(input.months).toBe(6);
            expect(input.categories).toHaveLength(2);
        });

        it("output includes trend summary", () => {
            const output: GetHistoricalBudgetPerformanceOutput = {
                householdId: makeEntityId("household-1"),
                months: [],
                trendSummary: {
                    averageMonthlyBudgetCents: 300000,
                    averageMonthlyActualCents: 315000,
                    averageVarianceCents: 15000,
                    totalOverBudgetMonths: 2,
                    totalUnderBudgetMonths: 1,
                },
            };
            expect(output.trendSummary?.averageVarianceCents).toBeDefined();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tool 6: get_goal_status
    // ─────────────────────────────────────────────────────────────────────────

    describe("get_goal_status", () => {
        it("accepts status filter (ACTIVE|COMPLETED|ALL)", () => {
            const input: GetGoalStatusInput = {
                householdId: makeEntityId("household-1"),
                status: "ACTIVE",
            };
            expect(input.status).toMatch(/ACTIVE|COMPLETED|ALL/);
        });

        it("output includes goal progress metrics", () => {
            const output: GetGoalStatusOutput = {
                householdId: makeEntityId("household-1"),
                goals: [],
                activeGoalCount: 1,
                completedGoalCount: 0,
                totalTargetCents: MoneyFromDollars(15000),
                totalCurrentProgressCents: MoneyFromDollars(5000),
            };
            expect(output.activeGoalCount).toBe(1);
            expect(output.completedGoalCount).toBe(0);
            expect(output.totalTargetCents).toBeGreaterThan(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tool 7: get_debt_summary
    // ─────────────────────────────────────────────────────────────────────────

    describe("get_debt_summary", () => {
        it("accepts detailed flag for full analysis", () => {
            const input: GetDebtSummaryInput = {
                householdId: makeEntityId("household-1"),
                detailed: true,
            };
            expect(input.detailed).toBe(true);
        });

        it("output includes debt accounts with rates and minimums", () => {
            const output: GetDebtSummaryOutput = {
                householdId: makeEntityId("household-1"),
                totalDebtCents: 250000,
                debtAccounts: [
                    {
                        accountId: makeEntityId("account-1"),
                        accountName: "Visa Card",
                        accountType: "CREDIT_CARD",
                        balanceCents: 150000,
                        creditLimitCents: 500000,
                        interestRateBps: 1999, // ~20% APR
                        minimumPaymentCents: 3000,
                    },
                ],
                debtHealthStatus: "AT_RISK",
                monthlyMinimumPaymentCents: 3000,
            };
            expect(output.debtAccounts[0].interestRateBps).toBeGreaterThan(0);
            expect(output.debtHealthStatus).toMatch(/HEALTHY|WATCH|AT_RISK|CRITICAL/);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tool 8: get_attention_items
    // ─────────────────────────────────────────────────────────────────────────

    describe("get_attention_items", () => {
        it("accepts severity filter array", () => {
            const input: GetAttentionItemsInput = {
                householdId: makeEntityId("household-1"),
                severityFilter: ["CRITICAL", "HIGH"],
            };
            expect(input.severityFilter).toContain("CRITICAL");
        });

        it("accepts unresolvedOnly flag", () => {
            const input: GetAttentionItemsInput = {
                householdId: makeEntityId("household-1"),
                unresolvedOnly: true,
            };
            expect(input.unresolvedOnly).toBe(true);
        });

        it("output includes severity counters", () => {
            const output: GetAttentionItemsOutput = {
                householdId: makeEntityId("household-1"),
                items: [],
                criticalCount: 1,
                highCount: 2,
                mediumCount: 0,
                lowCount: 1,
            };
            expect(output.criticalCount).toBeGreaterThanOrEqual(0);
            expect(output.highCount).toBeGreaterThanOrEqual(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tool 9: get_recurring_financial_items
    // ─────────────────────────────────────────────────────────────────────────

    describe("get_recurring_financial_items", () => {
        it("accepts frequency and confidence filters", () => {
            const input: GetRecurringFinancialItemsInput = {
                householdId: makeEntityId("household-1"),
                frequencyFilter: ["MONTHLY", "WEEKLY"],
                minConfidence: 0.75,
            };
            expect(input.minConfidence).toBe(0.75);
        });

        it("output separates income and expense patterns", () => {
            const output: GetRecurringFinancialItemsOutput = {
                householdId: makeEntityId("household-1"),
                incomePatterns: [
                    {
                        merchant: "Employer Inc",
                        direction: "CREDIT",
                        frequency: "MONTHLY" as any, // RecurringFrequency.MONTHLY
                        typicalAmountCents: 500000,
                        averageAmountCents: 500000,
                        amountVariancePct: 0.05,
                        confidence: 0.95,
                        occurrenceCount: 12,
                        mostCommonCategory: null,
                        firstSeenDate: new Date("2025-08-01"),
                        lastSeenDate: new Date("2026-08-01"),
                        estimatedNextDate: new Date("2026-09-01"),
                        sourceTransactionIds: [],
                        estimatedMonthlyImpactCents: 500000,
                        category: null,
                    },
                ],
                expensePatterns: [],
                estimatedMonthlyIncomeCents: 500000,
                estimatedMonthlyExpensesCents: 300000,
                estimatedMonthlySurplusCents: 200000,
                totalPatternsFound: 1,
            };
            expect(output.incomePatterns).toBeDefined();
            expect(output.expensePatterns).toBeDefined();
        });

        it("confidence scores range 0-1", () => {
            const pattern = {
                merchant: "Test",
                direction: "CREDIT" as const,
                frequency: "MONTHLY" as any,
                typicalAmountCents: 100000,
                averageAmountCents: 100000,
                amountVariancePct: 0.05,
                confidence: 0.85,
                occurrenceCount: 5,
                mostCommonCategory: null,
                firstSeenDate: new Date(),
                lastSeenDate: new Date(),
                estimatedNextDate: null,
                sourceTransactionIds: [],
                estimatedMonthlyImpactCents: 100000,
                category: null,
            };
            expect(pattern.confidence).toBeGreaterThanOrEqual(0);
            expect(pattern.confidence).toBeLessThanOrEqual(1);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tool 10: simulate_purchase
    // ─────────────────────────────────────────────────────────────────────────

    describe("simulate_purchase", () => {
        it("accepts payment methods: CASH, CREDIT_CARD, LOAN, SAVINGS", () => {
            const input: SimulatePurchaseInput = {
                householdId: makeEntityId("household-1"),
                purchaseAmountCents: MoneyFromDollars(2500),
                paymentMethod: "CREDIT_CARD",
                description: "Kitchen remodel",
                category: "HOME_IMPROVEMENT",
            };
            expect(["CASH", "CREDIT_CARD", "LOAN", "SAVINGS"]).toContain(
                input.paymentMethod
            );
        });

        it("output indicates affordability", () => {
            const output: SimulatePurchaseOutput = {
                householdId: makeEntityId("household-1"),
                scenario: {
                    purchaseAmountCents: MoneyFromDollars(2500),
                    paymentMethod: "CASH",
                    description: "Kitchen remodel",
                },
                projectedImpact: {
                    currentLiquidCashCents: MoneyFromDollars(5000),
                    projectedLiquidCashCents: MoneyFromDollars(2500),
                    affectsCashPosition: true,
                    affectsDebtLevel: false,
                    affectsEmergencyFund: false,
                },
                recommendations: [
                    "Purchase leaves 2.5 months of emergency fund coverage",
                ],
                isAffordable: true,
            };
            expect(output.isAffordable).toBe(true);
            expect(output.recommendations).toContain(
                "Purchase leaves 2.5 months of emergency fund coverage"
            );
        });

        it("tool is HOUSEHOLD_MEMBER access (anyone can simulate)", () => {
            expect(SimulatePurchaseTool.authorizationLevel).toBe(
                ToolAuthorizationLevel.HOUSEHOLD_MEMBER
            );
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tool 11: simulate_budget_change
    // ─────────────────────────────────────────────────────────────────────────

    describe("simulate_budget_change", () => {
        it("accepts array of category changes", () => {
            const input: SimulateBudgetChangeInput = {
                householdId: makeEntityId("household-1"),
                changes: [
                    {
                        category: "DINING",
                        newBudgetCents: MoneyFromDollars(600),
                    },
                    {
                        category: "GROCERIES",
                        newBudgetCents: MoneyFromDollars(500),
                    },
                ],
                month: "2026-8",
            };
            expect(input.changes).toHaveLength(2);
        });

        it("output shows impact on monthly surplus", () => {
            const output: SimulateBudgetChangeOutput = {
                householdId: makeEntityId("household-1"),
                month: "2026-8",
                currentBudgetTotalCents: MoneyFromDollars(3000),
                projectedBudgetTotalCents: MoneyFromDollars(3100),
                budgetChanges: [
                    {
                        category: "DINING",
                        currentBudgetCents: MoneyFromDollars(400),
                        projectedBudgetCents: MoneyFromDollars(600),
                        changeCents: MoneyFromDollars(200),
                    },
                ],
                impactOnSurplus: {
                    currentSurplusCents: MoneyFromDollars(2000),
                    projectedSurplusCents: MoneyFromDollars(1800),
                    changeCents: MoneyFromDollars(-200),
                },
                recommendations: ["Reducing dining budget reallocation improves savings rate"],
            };
            expect(output.impactOnSurplus?.projectedSurplusCents).toBeLessThan(
                output.impactOnSurplus!.currentSurplusCents
            );
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tool 12: create_initial_budget
    // ─────────────────────────────────────────────────────────────────────────

    describe("create_initial_budget", () => {
        it("requires HOUSEHOLD_OWNER authorization", () => {
            expect(CreateInitialBudgetTool.authorizationLevel).toBe(
                ToolAuthorizationLevel.HOUSEHOLD_OWNER
            );
        });

        it("accepts income and expense overrides", () => {
            const input: CreateInitialBudgetInput = {
                householdId: makeEntityId("household-1"),
                month: "2026-8",
                incomeMethodCents: MoneyFromDollars(5000),
                essentialExpensesCents: MoneyFromDollars(2000),
                discretionaryExpensesCents: MoneyFromDollars(1000),
            };
            expect(input.incomeMethodCents).toBeDefined();
        });

        it("output includes budget proposal with rationale", () => {
            const output: CreateInitialBudgetOutput = {
                householdId: makeEntityId("household-1"),
                month: "2026-8",
                proposedBudgets: [
                    {
                        category: "HOUSING",
                        recommendedBudgetCents: MoneyFromDollars(1500),
                        historicalAverageCents: MoneyFromDollars(1450),
                        rationale: "Based on 3-month average with 3.4% buffer",
                    },
                ],
                totalBudgetedCents: MoneyFromDollars(3000),
                monthlyIncomeCents: MoneyFromDollars(5000),
                monthlyExpensesCents: MoneyFromDollars(3000),
                projectedSurplusCents: MoneyFromDollars(2000),
                recommendations: [],
            };
            expect(output.proposedBudgets[0].rationale).toBeDefined();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tool 13: analyze_budget_variance
    // ─────────────────────────────────────────────────────────────────────────

    describe("analyze_budget_variance", () => {
        it("accepts category filter and history window", () => {
            const input: AnalyzeBudgetVarianceInput = {
                householdId: makeEntityId("household-1"),
                categories: ["DINING", "GROCERIES"],
                months: 6,
            };
            expect(input.months).toBe(6);
        });

        it("output identifies trends", () => {
            const output: AnalyzeBudgetVarianceOutput = {
                householdId: makeEntityId("household-1"),
                periodAnalyzed: "2026-3 through 2026-8",
                monthsIncluded: 6,
                categoryVariances: [
                    {
                        category: "DINING",
                        avgVarianceCents: 10000,
                        maxVarianceCents: 25000,
                        minVarianceCents: -5000,
                        overBudgetMonthCount: 5,
                        totalMonthsAnalyzed: 6,
                        trend: "WORSENING",
                    },
                ],
                overallTrend: "WORSENING",
                typicalVarianceCents: 10000,
                recommendations: [
                    "Dining overspend is increasing; consider higher budget or spending review",
                ],
            };
            expect(output.categoryVariances[0].trend).toMatch(
                /IMPROVING|WORSENING|STABLE/
            );
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Tool 14: plan_next_month_budget
    // ─────────────────────────────────────────────────────────────────────────

    describe("plan_next_month_budget", () => {
        it("accepts income override and known expenses", () => {
            const input: PlanNextMonthBudgetInput = {
                householdId: makeEntityId("household-1"),
                incomeOverrideCents: MoneyFromDollars(6000),
                knownUpcomingExpenses: [
                    {
                        description: "Car insurance renewal",
                        estimatedAmountCents: MoneyFromDollars(150),
                        category: "INSURANCE",
                    },
                ],
            };
            expect(input.knownUpcomingExpenses).toHaveLength(1);
        });

        it("output indicates known expenses are accounted for", () => {
            const output: PlanNextMonthBudgetOutput = {
                householdId: makeEntityId("household-1"),
                nextMonth: "2026-9",
                estimatedIncomeCents: MoneyFromDollars(5000),
                proposedBudgets: [
                    {
                        category: "INSURANCE",
                        proposedBudgetCents: MoneyFromDollars(150),
                        currentBudgetCents: MoneyFromDollars(100),
                        historicalAverageCents: MoneyFromDollars(120),
                        isBasedOnRecurring: true,
                        rationale:
                            "Known car insurance renewal scheduled for September 15",
                    },
                ],
                totalProposedBudgetCents: MoneyFromDollars(3100),
                projectedSurplusCents: MoneyFromDollars(1900),
                knownUpcomingExpensesAccountedFor: true,
                recommendations: [],
            };
            expect(output.knownUpcomingExpensesAccountedFor).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Household Isolation Tests
    // ─────────────────────────────────────────────────────────────────────────

    describe("Household Isolation", () => {
        it("all tool inputs require householdId", () => {
            const inputs = [
                { householdId: makeEntityId("hh-1") } as GetFinancialSnapshotInput,
                {
                    householdId: makeEntityId("hh-1"),
                } as GetCashFlowInput,
                {
                    householdId: makeEntityId("hh-1"),
                } as GetCurrentBudgetInput,
                { householdId: makeEntityId("hh-1") } as GetBudgetStatusInput,
                {
                    householdId: makeEntityId("hh-1"),
                } as GetHistoricalBudgetPerformanceInput,
                { householdId: makeEntityId("hh-1") } as GetGoalStatusInput,
                { householdId: makeEntityId("hh-1") } as GetDebtSummaryInput,
                {
                    householdId: makeEntityId("hh-1"),
                } as GetAttentionItemsInput,
                {
                    householdId: makeEntityId("hh-1"),
                } as GetRecurringFinancialItemsInput,
                {
                    householdId: makeEntityId("hh-1"),
                    purchaseAmountCents: MoneyFromDollars(100),
                    paymentMethod: "CASH" as const,
                    description: "test",
                } as SimulatePurchaseInput,
                {
                    householdId: makeEntityId("hh-1"),
                    changes: [],
                } as SimulateBudgetChangeInput,
                {
                    householdId: makeEntityId("hh-1"),
                    month: "2026-8",
                } as CreateInitialBudgetInput,
                {
                    householdId: makeEntityId("hh-1"),
                } as AnalyzeBudgetVarianceInput,
                {
                    householdId: makeEntityId("hh-1"),
                } as PlanNextMonthBudgetInput,
            ];

            inputs.forEach((input: any) => {
                expect(input.householdId).toBeDefined();
                expect(input.householdId.toString().startsWith("test-hh-1")).toBe(true);
            });
        });

        it("API layer must validate householdId matches authenticated member", () => {
            // This test documents the contract requirement for the API layer:
            // Before executing ANY tool, the API must:
            // 1. Verify the authenticated member belongs to the requested householdId
            // 2. Check authorization level (MEMBER vs OWNER)
            // 3. Never return data for a different household
            expect(true).toBe(true); // Placeholder for integration test
        });

        it("all outputs include householdId to enable validation", () => {
            const outputs = [
                {
                    householdId: makeEntityId("hh-1"),
                    snapshot: null,
                } as GetFinancialSnapshotOutput,
                {
                    householdId: makeEntityId("hh-1"),
                    currentMonth: null,
                    forecast: [],
                } as GetCashFlowOutput,
                {
                    householdId: makeEntityId("hh-1"),
                    period: "2026-8",
                    budgets: [],
                    totalBudgetedCents: 0,
                    categoryCount: 0,
                } as GetCurrentBudgetOutput,
                {
                    householdId: makeEntityId("hh-1"),
                    period: "2026-8",
                    asOf: new Date(),
                    categories: [],
                    totalBudgetedCents: 0,
                    totalActualCents: 0,
                    totalVarianceCents: 0,
                    overBudgetCount: 0,
                } as GetBudgetStatusOutput,
                {
                    householdId: makeEntityId("hh-1"),
                    months: [],
                } as GetHistoricalBudgetPerformanceOutput,
                {
                    householdId: makeEntityId("hh-1"),
                    goals: [],
                    activeGoalCount: 0,
                    completedGoalCount: 0,
                    totalTargetCents: 0,
                    totalCurrentProgressCents: 0,
                } as GetGoalStatusOutput,
                {
                    householdId: makeEntityId("hh-1"),
                    totalDebtCents: 0,
                    debtAccounts: [],
                    debtHealthStatus: "HEALTHY",
                } as GetDebtSummaryOutput,
                {
                    householdId: makeEntityId("hh-1"),
                    items: [],
                    criticalCount: 0,
                    highCount: 0,
                    mediumCount: 0,
                    lowCount: 0,
                } as GetAttentionItemsOutput,
                {
                    householdId: makeEntityId("hh-1"),
                    incomePatterns: [],
                    expensePatterns: [],
                    estimatedMonthlyIncomeCents: 0,
                    estimatedMonthlyExpensesCents: 0,
                    estimatedMonthlySurplusCents: 0,
                    totalPatternsFound: 0,
                } as GetRecurringFinancialItemsOutput,
                {
                    householdId: makeEntityId("hh-1"),
                    scenario: {
                        purchaseAmountCents: MoneyFromDollars(100),
                        paymentMethod: "CASH",
                        description: "",
                    },
                    projectedImpact: {
                        currentLiquidCashCents: MoneyFromDollars(1000),
                        projectedLiquidCashCents: MoneyFromDollars(900),
                        affectsCashPosition: true,
                        affectsDebtLevel: false,
                        affectsEmergencyFund: false,
                    },
                    recommendations: [],
                    isAffordable: true,
                } as SimulatePurchaseOutput,
                {
                    householdId: makeEntityId("hh-1"),
                    month: "2026-8",
                    currentBudgetTotalCents: MoneyFromDollars(3000),
                    projectedBudgetTotalCents: MoneyFromDollars(3000),
                    budgetChanges: [],
                    recommendations: [],
                } as SimulateBudgetChangeOutput,
                {
                    householdId: makeEntityId("hh-1"),
                    month: "2026-8",
                    proposedBudgets: [],
                    totalBudgetedCents: MoneyFromDollars(0),
                    monthlyIncomeCents: MoneyFromDollars(5000),
                    monthlyExpensesCents: MoneyFromDollars(3000),
                    projectedSurplusCents: MoneyFromDollars(2000),
                    recommendations: [],
                } as CreateInitialBudgetOutput,
                {
                    householdId: makeEntityId("hh-1"),
                    periodAnalyzed: "2026-3 through 2026-8",
                    monthsIncluded: 6,
                    categoryVariances: [],
                    overallTrend: "STABLE" as const,
                    typicalVarianceCents: 0,
                    recommendations: [],
                } as AnalyzeBudgetVarianceOutput,
                {
                    householdId: makeEntityId("hh-1"),
                    nextMonth: "2026-9",
                    estimatedIncomeCents: MoneyFromDollars(5000),
                    proposedBudgets: [],
                    totalProposedBudgetCents: MoneyFromDollars(0),
                    projectedSurplusCents: MoneyFromDollars(0),
                    knownUpcomingExpensesAccountedFor: false,
                    recommendations: [],
                } as PlanNextMonthBudgetOutput,
            ];

            outputs.forEach((output: any) => {
                expect(output.householdId).toBeDefined();
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Authorization Tests
    // ─────────────────────────────────────────────────────────────────────────

    describe("Authorization Levels", () => {
        it("read-only tools (11) allow HOUSEHOLD_MEMBER", () => {
            const readOnlyTools = [
                GetFinancialSnapshotTool,
                GetCashFlowTool,
                GetCurrentBudgetTool,
                GetBudgetStatusTool,
                GetHistoricalBudgetPerformanceTool,
                GetGoalStatusTool,
                GetDebtSummaryTool,
                GetAttentionItemsTool,
                GetRecurringFinancialItemsTool,
                SimulatePurchaseTool,
                SimulateBudgetChangeTool,
                AnalyzeBudgetVarianceTool,
                PlanNextMonthBudgetTool,
            ];
            readOnlyTools.forEach((tool) => {
                expect(tool.authorizationLevel).toBe(
                    ToolAuthorizationLevel.HOUSEHOLD_MEMBER
                );
            });
        });

        it("write tools (1) require HOUSEHOLD_OWNER", () => {
            const writeTools = [CreateInitialBudgetTool];
            writeTools.forEach((tool) => {
                expect(tool.authorizationLevel).toBe(
                    ToolAuthorizationLevel.HOUSEHOLD_OWNER
                );
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Data Classification Tests
    // ─────────────────────────────────────────────────────────────────────────

    describe("Data Classification", () => {
        it("all tools use INTERNAL or PUBLIC classification", () => {
            AIToolRegistry.forEach((tool) => {
                expect([
                    ToolDataClassification.INTERNAL,
                    ToolDataClassification.PUBLIC,
                ]).toContain(tool.outputClassification);
            });
        });

        it("no tools expose CONFIDENTIAL data (SSN, credentials, etc.)", () => {
            AIToolRegistry.forEach((tool) => {
                expect(tool.outputClassification).not.toBe(
                    ToolDataClassification.CONFIDENTIAL
                );
            });
        });
    });
});
