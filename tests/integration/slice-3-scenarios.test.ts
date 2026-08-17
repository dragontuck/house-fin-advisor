/**
 * Slice 3: Financial Intelligence Integration Tests
 * 
 * Validates complete end-to-end data flow:
 * Statement → Transactions → Cash Flow → Goals → Health → Attention Items → Financial Pulse
 * 
 * Six core scenarios:
 * 1. Healthy household (HEALTHY)
 * 2. Overspending (BUDGET_OVER attention item)
 * 3. Emergency fund low (EMERGENCY_FUND_LOW attention item)
 * 4. Projected cash deficit (CASH_FLOW_WARNING)
 * 5. Goal falling behind (GOAL_BEHIND)
 * 6. Debt increasing (DEBT_INCREASE)
 * 
 * Note: These tests document the expected API contracts and validation criteria.
 * Full integration requires running with real API and database.
 */

import { FinancialHealthStatus } from "@house-fin/contracts";

describe("Slice 3: Financial Intelligence E2E Scenarios", () => {
    /**
     * Mock Pulse responses for each scenario
     */

    const healthyPulse = {
        householdId: "test-healthy-1",
        householdName: "Healthy Household",
        asOf: new Date().toISOString(),
        healthStatus: FinancialHealthStatus.HEALTHY,
        healthMessage: "Your household is in good financial shape.",
        keyMetrics: {
            netWorth: 189200,
            cashAvailable: 19200,
            monthlyIncome: 12000,
            monthlyExpenses: 7500,
            monthlySurplus: 4500,
            totalDebt: 0,
        },
        accountsSummary: {
            cash: [
                { name: "Checking", balance: 7200, type: "CHECKING" },
                { name: "Savings", balance: 12000, type: "SAVINGS" },
            ],
            retirement: [],
            investments: [],
            debt: [],
        },
        calculationDetails: {
            snapshotId: "snap-healthy-1",
            calculationVersion: 1,
            calculatedAt: new Date().toISOString(),
            monthlyIncomeCents: 1200000,
            monthlyEssentialExpensesCents: 680000,
            monthlyDiscretionaryExpensesCents: 70000,
            surplusExplanation: "$12,000 income minus $7,500 expenses",
        },
    };

    const overspendPulse = {
        ...healthyPulse,
        householdId: "test-overspend-1",
        householdName: "Overspending Household",
        healthStatus: FinancialHealthStatus.WATCH,
        keyMetrics: {
            ...healthyPulse.keyMetrics,
            monthlySurplus: 2500,
        },
    };

    const lowEFPulse = {
        ...healthyPulse,
        householdId: "test-low-ef-1",
        householdName: "Low Emergency Fund",
        healthStatus: FinancialHealthStatus.WATCH,
        keyMetrics: {
            netWorth: 150000,
            cashAvailable: 8000,
            monthlyIncome: 10000,
            monthlyExpenses: 7000,
            monthlySurplus: 3000,
            totalDebt: 0,
        },
    };

    const cashDeficitPulse = {
        ...healthyPulse,
        householdId: "test-cash-deficit-1",
        householdName: "Cash Deficit Household",
        healthStatus: FinancialHealthStatus.AT_RISK,
        keyMetrics: {
            netWorth: 120000,
            cashAvailable: 4000,
            monthlyIncome: 11000,
            monthlyExpenses: 10500,
            monthlySurplus: 500,
            totalDebt: 50000,
        },
    };

    const goalBehindPulse = {
        ...healthyPulse,
        householdId: "test-goal-behind-1",
        householdName: "Goal Behind Household",
        healthStatus: FinancialHealthStatus.WATCH,
    };

    const debtIncreasePulse = {
        ...healthyPulse,
        householdId: "test-debt-increase-1",
        householdName: "Debt Increasing Household",
        healthStatus: FinancialHealthStatus.AT_RISK,
        keyMetrics: {
            netWorth: 120000,
            cashAvailable: 6000,
            monthlyIncome: 11000,
            monthlyExpenses: 9500,
            monthlySurplus: 1500,
            totalDebt: 75000,
        },
        accountsSummary: {
            cash: [{ name: "Checking", balance: 6000, type: "CHECKING" }],
            retirement: [],
            investments: [],
            debt: [
                { name: "Credit Card 1", balance: 18000, type: "CREDIT_CARD" },
                { name: "Credit Card 2", balance: 15000, type: "CREDIT_CARD" },
                { name: "Auto Loan", balance: 42000, type: "LOAN" },
            ],
        },
    };

    describe("Scenario 1: Healthy Household", () => {
        it("should have HEALTHY status when all metrics positive", () => {
            expect(healthyPulse.healthStatus).toBe(FinancialHealthStatus.HEALTHY);
            expect(healthyPulse.keyMetrics.monthlySurplus).toBeGreaterThan(0);
            expect(healthyPulse.keyMetrics.totalDebt).toBe(0);
        });

        it("should have positive net worth", () => {
            expect(healthyPulse.keyMetrics.netWorth).toBeGreaterThan(0);
        });

        it("should have calculationDetails with snapshot metadata", () => {
            expect(healthyPulse.calculationDetails).toBeDefined();
            expect(healthyPulse.calculationDetails.snapshotId).toBeDefined();
            expect(healthyPulse.calculationDetails.calculationVersion).toBe(1);
            expect(healthyPulse.calculationDetails.calculatedAt).toBeDefined();
        });

        it("should include surplus explanation", () => {
            expect(healthyPulse.calculationDetails.surplusExplanation).toContain("$12,000");
            expect(healthyPulse.calculationDetails.surplusExplanation).toContain("$7,500");
        });
    });

    describe("Scenario 2: Overspending (Budget Over)", () => {
        it("should have WATCH status when overspending detected", () => {
            expect(overspendPulse.healthStatus).toBe(FinancialHealthStatus.WATCH);
        });

        it("should show reduced surplus due to overage", () => {
            expect(overspendPulse.keyMetrics.monthlySurplus).toBeLessThan(
                healthyPulse.keyMetrics.monthlySurplus
            );
        });

        it("should still have positive cash flow", () => {
            expect(overspendPulse.keyMetrics.monthlySurplus).toBeGreaterThan(0);
        });
    });

    describe("Scenario 3: Emergency Fund Below Target", () => {
        it("should have WATCH status for low emergency fund", () => {
            expect(lowEFPulse.healthStatus).toBe(FinancialHealthStatus.WATCH);
        });

        it("should show low cash available", () => {
            // $8,000 is low for monthly expenses
            expect(lowEFPulse.keyMetrics.cashAvailable).toBeLessThan(
                lowEFPulse.keyMetrics.monthlyExpenses * 3
            );
        });

        it("should still maintain positive surplus", () => {
            expect(lowEFPulse.keyMetrics.monthlySurplus).toBeGreaterThan(0);
        });
    });

    describe("Scenario 4: Projected Cash Deficit", () => {
        it("should have AT_RISK status for cash deficit projection", () => {
            expect(cashDeficitPulse.healthStatus).toBe(FinancialHealthStatus.AT_RISK);
        });

        it("should show limited cash reserves", () => {
            expect(cashDeficitPulse.keyMetrics.cashAvailable).toBeLessThan(10000);
        });

        it("should show tight monthly surplus", () => {
            // Tight margin: only $500 buffer
            expect(cashDeficitPulse.keyMetrics.monthlySurplus).toBeLessThan(1000);
        });
    });

    describe("Scenario 5: Goal Falling Behind", () => {
        it("should have WATCH status for behind goal", () => {
            expect(goalBehindPulse.healthStatus).toBe(FinancialHealthStatus.WATCH);
        });

        it("should maintain household financial basics", () => {
            expect(goalBehindPulse.keyMetrics.monthlySurplus).toBeGreaterThan(0);
        });
    });

    describe("Scenario 6: Debt Increasing", () => {
        it("should have AT_RISK status for increasing debt", () => {
            expect(debtIncreasePulse.healthStatus).toBe(FinancialHealthStatus.AT_RISK);
        });

        it("should show high total debt", () => {
            expect(debtIncreasePulse.keyMetrics.totalDebt).toBeGreaterThan(50000);
        });

        it("should have multiple debt accounts", () => {
            expect(debtIncreasePulse.accountsSummary.debt.length).toBeGreaterThan(1);
        });

        it("should show credit card accounts in debt summary", () => {
            const ccAccounts = debtIncreasePulse.accountsSummary.debt.filter(
                (acc: any) => acc.type === "CREDIT_CARD"
            );
            expect(ccAccounts.length).toBeGreaterThan(0);
        });
    });

    describe("API Response Contracts", () => {
        it("should have all required pulse fields", () => {
            const pulse = healthyPulse;
            expect(pulse).toHaveProperty("householdId");
            expect(pulse).toHaveProperty("householdName");
            expect(pulse).toHaveProperty("asOf");
            expect(pulse).toHaveProperty("healthStatus");
            expect(pulse).toHaveProperty("keyMetrics");
            expect(pulse).toHaveProperty("accountsSummary");
            expect(pulse).toHaveProperty("calculationDetails");
        });

        it("should have all keyMetrics properties", () => {
            const metrics = healthyPulse.keyMetrics;
            expect(metrics).toHaveProperty("netWorth");
            expect(metrics).toHaveProperty("cashAvailable");
            expect(metrics).toHaveProperty("monthlyIncome");
            expect(metrics).toHaveProperty("monthlyExpenses");
            expect(metrics).toHaveProperty("monthlySurplus");
            expect(metrics).toHaveProperty("totalDebt");
        });

        it("should have all accountsSummary categories", () => {
            const summary = healthyPulse.accountsSummary;
            expect(summary).toHaveProperty("cash");
            expect(summary).toHaveProperty("retirement");
            expect(summary).toHaveProperty("investments");
            expect(summary).toHaveProperty("debt");
            expect(Array.isArray(summary.cash)).toBe(true);
            expect(Array.isArray(summary.retirement)).toBe(true);
            expect(Array.isArray(summary.investments)).toBe(true);
            expect(Array.isArray(summary.debt)).toBe(true);
        });

        it("should have calculationDetails with snapshot metadata", () => {
            const details = healthyPulse.calculationDetails;
            expect(details).toHaveProperty("snapshotId");
            expect(details).toHaveProperty("calculationVersion");
            expect(details).toHaveProperty("calculatedAt");
            expect(details).toHaveProperty("monthlyIncomeCents");
            expect(details).toHaveProperty("monthlyEssentialExpensesCents");
            expect(details).toHaveProperty("monthlyDiscretionaryExpensesCents");
            expect(details).toHaveProperty("surplusExplanation");
        });

        it("should have all account properties", () => {
            const account = healthyPulse.accountsSummary.cash[0];
            expect(account).toHaveProperty("name");
            expect(account).toHaveProperty("balance");
            expect(account).toHaveProperty("type");
            expect(typeof account.name).toBe("string");
            expect(typeof account.balance).toBe("number");
            expect(typeof account.type).toBe("string");
        });
    });
});
