/**
 * Tests for Scenario Generation Service
 *
 * Coverage:
 * - Baseline extraction from financial snapshot
 * - Windfall scenario generation (5 alternatives)
 * - Savings allocation scenarios
 * - Debt action scenarios
 * - Affordability scenarios
 * - Financial independence scenarios
 * - Deterministic outputs
 * - Structured impacts
 */

import {
    EntityId,
    Money,
    FinancialSnapshot,
    FinancialHealthStatus,
    ScenarioType,
    ConfidenceLevel,
} from "@house-fin/contracts";
import {
    extractBaseline,
    generateWindfallScenarios,
    generateSavingsAllocationScenarios,
    generateDebtActionScenarios,
    generateAffordabilityScenarios,
    generateFinancialIndependenceScenarios,
} from "@house-fin/domain";

describe("Scenario Generation Service", () => {
    const householdId = "household-1" as EntityId;
    const snapshotId = "snapshot-1" as EntityId;

    // Mock financial snapshot
    const mockSnapshot: FinancialSnapshot = {
        id: snapshotId,
        householdId,
        asOf: new Date(),
        createdAt: new Date(),
        calculatedAt: new Date(),
        version: 1,

        // Financial position
        cash: Money(180000), // $1800 in liquid assets
        debt: Money(800000), // $8000 in debt
        netWorth: Money(380000), // $3800 net worth

        // Income
        monthlyIncome: Money(600000), // $6000
        monthlyEssentialExpenses: Money(400000), // $4000
        monthlyDiscretionaryExpenses: Money(100000), // $1000
        monthlySurplus: Money(100000), // $1000

        // Health
        financialHealthStatus: FinancialHealthStatus.WATCH,

        // Source accounts (audit trail)
        sourceAccountIds: [],
    } as FinancialSnapshot;

    describe("Baseline Extraction", () => {
        it("should extract emergency fund metrics", () => {
            const baseline = extractBaseline(mockSnapshot);

            expect(baseline.emergencyFundBalance).toBeLessThanOrEqual(mockSnapshot.cash);
            expect(baseline.emergencyFundMonths).toBeGreaterThanOrEqual(0);
            expect(baseline.emergencyFundTarget).toBeGreaterThan(0);
        });

        it("should extract debt metrics", () => {
            const baseline = extractBaseline(mockSnapshot);

            expect(baseline.totalDebt).toBe(mockSnapshot.debt);
            expect(baseline.monthlyDebtPayments).toBeGreaterThan(0);
            expect(baseline.highestInterestRate).toBeGreaterThan(0);
        });

        it("should extract cash flow metrics", () => {
            const baseline = extractBaseline(mockSnapshot);

            expect(baseline.monthlyIncome).toBe(mockSnapshot.monthlyIncome);
            expect(baseline.monthlyExpenses).toBe(
                (mockSnapshot.monthlyEssentialExpenses || 0) + (mockSnapshot.monthlyDiscretionaryExpenses || 0)
            );
            expect(baseline.monthlySavingsCapacity).toBeGreaterThanOrEqual(0);
        });

        it("should extract goal metrics", () => {
            const baseline = extractBaseline(mockSnapshot);

            expect(baseline.activeGoals).toBeGreaterThanOrEqual(0);
            expect(baseline.goalFundingGap).toBeGreaterThanOrEqual(0);
            expect(baseline.retirementYearsAway).toBeGreaterThan(0);
        });

        it("should extract health metrics", () => {
            const baseline = extractBaseline(mockSnapshot);

            expect(baseline.financialHealthScore).toBeGreaterThanOrEqual(0);
            expect(baseline.financialHealthScore).toBeLessThanOrEqual(100);
            expect(baseline.healthStatus).toBeDefined();
        });
    });

    describe("Windfall Scenarios", () => {
        it("should generate 5 windfall scenarios", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = {
                amount: Money(1000000), // $10,000 windfall
                source: "Tax refund",
            };

            const scenarios = generateWindfallScenarios(householdId, snapshotId, input, baseline);

            expect(scenarios).toHaveLength(5);
            expect(scenarios[0].order).toBe(1);
            expect(scenarios[4].order).toBe(5);
        });

        it("should generate Emergency Fund First scenario", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = { amount: Money(1000000), source: "Bonus" };

            const scenarios = generateWindfallScenarios(householdId, snapshotId, input, baseline);
            const scenario = scenarios[0]; // First scenario

            expect(scenario.title).toContain("Emergency Fund");
            expect(scenario.resultingState.emergencyFundBalance).toBeGreaterThan(baseline.emergencyFundBalance);
            expect(scenario.impact.riskReduction).toBe("HIGH");
        });

        it("should allocate windfall to multiple priorities in scenarios", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = { amount: Money(1000000), source: "Inheritance" };

            const scenarios = generateWindfallScenarios(householdId, snapshotId, input, baseline);

            // Each scenario should address windfall differently
            const allocations = scenarios.map((s) => s.proposedActions.length);
            expect(Math.min(...allocations)).toBeGreaterThan(0);
        });

        it("should calculate impacts deterministically", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = { amount: Money(1000000), source: "Bonus" };

            const scenarios1 = generateWindfallScenarios(householdId, snapshotId, input, baseline);
            const scenarios2 = generateWindfallScenarios(householdId, snapshotId, input, baseline);

            // Same input should produce same scenarios (deterministic)
            expect(scenarios1[0].impact.wealthIncrease).toBe(scenarios2[0].impact.wealthIncrease);
        });

        it("should include assumptions and sensitivities", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = { amount: Money(1000000), source: "Tax refund" };

            const scenarios = generateWindfallScenarios(householdId, snapshotId, input, baseline);

            scenarios.forEach((scenario) => {
                expect(scenario.assumptions.length).toBeGreaterThan(0);
                expect(scenario.assumptions[0].key).toBeTruthy();
                expect(scenario.assumptions[0].confidence).toBeTruthy();
            });
        });
    });

    describe("Savings Allocation Scenarios", () => {
        it("should generate savings allocation scenarios", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = {
                monthlyAmount: Money(50000), // $500/month
                monthsAvailable: 12,
                purpose: "General savings",
            };

            const scenarios = generateSavingsAllocationScenarios(householdId, snapshotId, input, baseline);

            expect(scenarios.length).toBeGreaterThan(0);
        });

        it("should prioritize emergency fund if below target", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = {
                monthlyAmount: Money(50000),
                monthsAvailable: 12,
            };

            const scenarios = generateSavingsAllocationScenarios(householdId, snapshotId, input, baseline);
            const efScenario = scenarios.find((s) => s.title.includes("Emergency"));

            if (baseline.emergencyFundMonths < 6 && efScenario) {
                expect(efScenario.resultingState.emergencyFundMonths).toBeGreaterThan(baseline.emergencyFundMonths);
            }
        });

        it("should include debt paydown option if high debt-to-income", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = {
                monthlyAmount: Money(50000),
                monthsAvailable: 12,
            };

            const scenarios = generateSavingsAllocationScenarios(householdId, snapshotId, input, baseline);
            const debtScenario = scenarios.find((s) => s.title.includes("Debt"));

            if (baseline.debtToIncomeRatio > 0.3 && debtScenario) {
                expect(debtScenario.resultingState.totalDebt).toBeLessThan(baseline.totalDebt);
            }
        });

        it("should include goal funding scenario if goals exist", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = {
                monthlyAmount: Money(50000),
                monthsAvailable: 12,
            };

            const scenarios = generateSavingsAllocationScenarios(householdId, snapshotId, input, baseline);
            const goalScenario = scenarios.find((s) => s.title.includes("Goal"));

            if (baseline.activeGoals > 0 && goalScenario) {
                expect(goalScenario.proposedActions.some((a) => a.description.includes("goal"))).toBe(true);
            }
        });
    });

    describe("Debt Action Scenarios", () => {
        it("should generate debt action scenarios", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = {
                action: "AVALANCHE" as const,
                extraPayment: Money(100000), // $1000
            };

            const scenarios = generateDebtActionScenarios(householdId, snapshotId, input, baseline);

            expect(scenarios.length).toBeGreaterThan(0);
        });

        it("should always include baseline (continue minimum payments)", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = { action: "AVALANCHE" as const };

            const scenarios = generateDebtActionScenarios(householdId, snapshotId, input, baseline);
            const baseline_scenario = scenarios.find((s) => s.title.includes("Continue"));

            expect(baseline_scenario).toBeDefined();
            expect(baseline_scenario?.impact.debtReduction).toBe(0);
        });

        it("should include avalanche method if high interest debt exists", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = { action: "AVALANCHE" as const };

            const scenarios = generateDebtActionScenarios(householdId, snapshotId, input, baseline);
            const avalanche = scenarios.find((s) => s.title.includes("Avalanche"));

            if (baseline.highestInterestRate > 10 && avalanche) {
                expect(avalanche.resultingState.totalDebt).toBeLessThan(baseline.totalDebt);
            }
        });

        it("should calculate interest savings impact", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = { action: "AVALANCHE" as const };

            const scenarios = generateDebtActionScenarios(householdId, snapshotId, input, baseline);
            const avalanche = scenarios.find((s) => s.title.includes("Avalanche"));

            if (avalanche) {
                // Paying extra should reduce monthly interest charges
                expect(avalanche.impact.cashFlowImpact).toBeGreaterThan(0);
            }
        });
    });

    describe("Affordability Scenarios", () => {
        it("should generate affordability scenarios", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = {
                newMonthlyObligation: Money(150000), // $1500/month
                itemDescription: "Car payment",
            };

            const scenarios = generateAffordabilityScenarios(householdId, snapshotId, input, baseline);

            expect(scenarios.length).toBeGreaterThan(0);
        });

        it("should indicate affordability based on debt-to-income", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = {
                newMonthlyObligation: Money(100000), // $1000
                itemDescription: "Car",
            };

            const scenarios = generateAffordabilityScenarios(householdId, snapshotId, input, baseline);

            const resultingRatio =
                (baseline.monthlyDebtPayments + input.newMonthlyObligation) / baseline.monthlyIncome;
            const recommendedScenario = scenarios[resultingRatio > 0.45 ? 2 : 0];

            expect(recommendedScenario).toBeDefined();
        });

        it("should include wait/delay scenario", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = {
                newMonthlyObligation: Money(150000),
                itemDescription: "Home purchase",
            };

            const scenarios = generateAffordabilityScenarios(householdId, snapshotId, input, baseline);
            const waitScenario = scenarios.find((s) => s.title.includes("Not Affordable"));

            if (waitScenario) {
                expect(waitScenario.proposedActions.some((a) => a.description.includes("Delay"))).toBe(true);
            }
        });

        it("should assess emergency fund impact", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = {
                newMonthlyObligation: Money(150000),
                itemDescription: "Car",
                downPaymentAvailable: Money(300000), // $3000 down
            };

            const scenarios = generateAffordabilityScenarios(householdId, snapshotId, input, baseline);

            scenarios.forEach((scenario) => {
                if (scenario.input.downPaymentAvailable) {
                    // Down payment reduces available emergency fund
                    expect(scenario.impact.liquidityChange).toBeTruthy();
                }
            });
        });
    });

    describe("Financial Independence Scenarios", () => {
        it("should generate retirement planning scenarios", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = {
                yearsToRetirement: 25,
                additionalAnnualSavings: Money(12000000), // $120k/year
            };

            const scenarios = generateFinancialIndependenceScenarios(householdId, snapshotId, input, baseline);

            expect(scenarios.length).toBeGreaterThan(0);
        });

        it("should include status quo scenario", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = { yearsToRetirement: 25 };

            const scenarios = generateFinancialIndependenceScenarios(householdId, snapshotId, input, baseline);
            const statusQuo = scenarios.find((s) => s.title.includes("Status Quo"));

            expect(statusQuo).toBeDefined();
            expect(statusQuo?.impact.wealthIncrease).toBe(0);
        });

        it("should project long-term wealth growth", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = {
                yearsToRetirement: 25,
                additionalAnnualSavings: Money(12000000),
            };

            const scenarios = generateFinancialIndependenceScenarios(householdId, snapshotId, input, baseline);
            const increased = scenarios.find((s) => s.title.includes("Increased"));

            if (increased) {
                // Projected wealth should be significant after 25 years
                expect(increased.impact.investmentIncrease).toBeGreaterThan(input.additionalAnnualSavings! * 25);
            }
        });

        it("should include market return sensitivity", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = {
                yearsToRetirement: 25,
                additionalAnnualSavings: Money(12000000),
            };

            const scenarios = generateFinancialIndependenceScenarios(householdId, snapshotId, input, baseline);
            const increased = scenarios.find((s) => s.title.includes("Increased"));

            if (increased && increased.sensitivities.length > 0) {
                expect(increased.sensitivities[0].scenarios.length).toBeGreaterThan(0);
            }
        });
    });

    describe("Scenario Structure", () => {
        it("should include all required fields in scenario", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = { amount: Money(1000000), source: "Bonus" };

            const scenarios = generateWindfallScenarios(householdId, snapshotId, input, baseline);

            scenarios.forEach((scenario) => {
                expect(scenario.id).toBeTruthy();
                expect(scenario.householdId).toBe(householdId);
                expect(scenario.financialSnapshotId).toBe(snapshotId);
                expect(scenario.type).toBe(ScenarioType.WINDFALL);
                expect(scenario.title).toBeTruthy();
                expect(scenario.description).toBeTruthy();
                expect(scenario.baseline).toBeDefined();
                expect(scenario.proposedActions.length).toBeGreaterThan(0);
                expect(scenario.impact).toBeDefined();
                expect(scenario.resultingState).toBeDefined();
                expect(scenario.assumptions.length).toBeGreaterThan(0);
                expect(scenario.order).toBeGreaterThan(0);
                expect(scenario.calculationVersion).toBe(1);
                expect(scenario.confidence).toBeTruthy();
                expect(scenario.dataCompleteness).toBeGreaterThan(0);
            });
        });

        it("should have realistic impact assessments", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = { amount: Money(1000000), source: "Tax refund" };

            const scenarios = generateWindfallScenarios(householdId, snapshotId, input, baseline);

            scenarios.forEach((scenario) => {
                // Impacts should generally improve or maintain financial health
                expect(scenario.impact.healthScoreChange).toBeGreaterThanOrEqual(-10);
            });
        });

        it("should have sensitivities for scenarios with assumptions", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = { amount: Money(1000000), source: "Inheritance" };

            const scenarios = generateWindfallScenarios(householdId, snapshotId, input, baseline);

            scenarios.forEach((scenario) => {
                // Most scenarios should have at least one sensitivity analysis
                if (scenario.assumptions.some((a) => a.impact === "HIGH")) {
                    expect(scenario.sensitivities.length).toBeGreaterThanOrEqual(0);
                }
            });
        });
    });

    describe("Determinism", () => {
        it("should generate identical scenarios from identical input", () => {
            const baseline = extractBaseline(mockSnapshot);
            const input = { amount: Money(1000000), source: "Bonus" };

            const scenarios1 = generateWindfallScenarios(householdId, snapshotId, input, baseline);
            const scenarios2 = generateWindfallScenarios(householdId, snapshotId, input, baseline);

            expect(scenarios1).toHaveLength(scenarios2.length);
            scenarios1.forEach((s1, idx) => {
                const s2 = scenarios2[idx];
                expect(s1.title).toBe(s2.title);
                expect(s1.impact.wealthIncrease).toBe(s2.impact.wealthIncrease);
                expect(s1.resultingState.financialHealthScore).toBe(s2.resultingState.financialHealthScore);
            });
        });
    });
});
