/**
 * Tests for FinancialSimulator
 *
 * Validates deterministic purchase and financing scenario calculations
 */

import { FinancialSimulator, createFinancialSimulator } from "@house-fin/domain";
import { Money, FinancialSnapshot, FinancialHealthStatus } from "@house-fin/contracts";

describe("FinancialSimulator", () => {
    const policy = {
        emergencyFundMonths: 3,
    };
    const simulator = createFinancialSimulator(policy);

    // Sample snapshot for testing
    const snapshot: FinancialSnapshot = {
        id: "snap-1" as any,
        householdId: "hh-1" as any,
        version: 1,
        asOf: new Date("2026-09-13"),
        cash: 7000000 as Money, // $70,000 (well above emergency fund of $6,000)
        debt: 50000 as Money, // $500
        netWorth: 6950000 as Money, // Wealthy
        monthlyIncome: 500000 as Money, // $5,000
        monthlyEssentialExpenses: 200000 as Money, // $2,000
        monthlyDiscretionaryExpenses: 100000 as Money, // $1,000
        monthlySurplus: 200000 as Money, // $2,000
        financialHealthStatus: FinancialHealthStatus.HEALTHY,
        sourceAccountIds: [],
        calculatedAt: new Date("2026-09-13"),
        createdAt: new Date("2026-09-13"),
    };

    describe("simulatePurchase", () => {
        it("should calculate cash purchase impact correctly", () => {
            const purchaseAmount = 100000 as Money; // $1,000

            const result = simulator.simulatePurchase(snapshot, purchaseAmount, "cash");

            expect(result.currentCashCents).toBe(7000000);
            expect(result.projectedCashCents).toBe(6900000);
            expect(result.emergencyFundFloorCents).toBe(600000); // 3 months * $2,000
            expect(result.affordable).toBe(true); // Still well above emergency fund
            expect(result.monthlyPaymentCents).toBe(0);
            expect(result.emergencyFundStatus).toBe("healthy");
        });

        it("should detect emergency fund breach with cash purchase", () => {
            const purchaseAmount = 7000000 as Money; // $70,000 - too much

            const result = simulator.simulatePurchase(snapshot, purchaseAmount, "cash");

            expect(result.projectedCashCents).toBe(0); // All cash spent
            expect(result.affordable).toBe(false);
            expect(result.emergencyFundGapCents).toBeGreaterThan(0);
            expect(result.emergencyFundStatus).toBe("critical");
        });

        it("should calculate credit/loan purchase impact correctly", () => {
            const purchaseAmount = 600000 as Money; // $6,000

            const result = simulator.simulatePurchase(snapshot, purchaseAmount, "credit");

            expect(result.currentCashCents).toBe(7000000);
            expect(result.projectedCashCents).toBe(7000000); // No immediate cash impact
            expect(result.monthlyPaymentCents).toBeGreaterThan(0);
            expect(result.monthlyPaymentCents).toBeLessThanOrEqual(50000); // ~$6,000/12 months
            expect(result.affordable).toBe(true); // Payment fits in $2,000 surplus
        });

        it("should detect budget constraint with financed purchase", () => {
            // Use a snapshot with low surplus
            const lowSurplusSnapshot: FinancialSnapshot = {
                ...snapshot,
                monthlySurplus: 30000 as Money, // Only $300/month
            };

            const purchaseAmount = 600000 as Money; // $6,000 financing
            const result = simulator.simulatePurchase(lowSurplusSnapshot, purchaseAmount, "loan");

            // Monthly payment would be ~$500, exceeds $300 surplus
            expect(result.monthlyPaymentCents).toBeGreaterThan(30000);
            expect(result.affordable).toBe(false);
        });

        it("should calculate emergency fund status percentages correctly", () => {
            // Healthy: above 100%
            const healthyResult = simulator.simulatePurchase(snapshot, 0 as Money, "cash");
            expect(healthyResult.emergencyFundStatus).toBe("healthy");

            // Warning: 50-100%
            const mediumSnapshot: FinancialSnapshot = {
                ...snapshot,
                cash: 400000 as Money, // $4,000 (75% of $6,000 floor)
            };
            const warningResult = simulator.simulatePurchase(mediumSnapshot, 0 as Money, "cash");
            expect(warningResult.emergencyFundStatus).toBe("warning");

            // Critical: below 50%
            const lowSnapshot: FinancialSnapshot = {
                ...snapshot,
                cash: 200000 as Money, // $2,000 (33% of $6,000 floor)
            };
            const criticalResult = simulator.simulatePurchase(lowSnapshot, 0 as Money, "cash");
            expect(criticalResult.emergencyFundStatus).toBe("critical");
        });

        it("should provide clear affordability reasoning", () => {
            const result = simulator.simulatePurchase(snapshot, 50000 as Money, "cash");
            expect(result.reason).toContain("$500");
            expect(result.reason).toContain("emergency fund");
        });
    });

    describe("simulateFinancing", () => {
        it("should calculate monthly payment correctly using amortization", () => {
            const loanAmount = 300000 as Money; // $3,000
            const annualRate = 0.05; // 5% annual
            const termMonths = 24; // 2-year loan

            const result = simulator.simulateFinancing(snapshot, loanAmount, annualRate, termMonths);

            expect(result.loanAmountCents).toBe(300000);
            expect(result.monthlyPaymentCents).toBeGreaterThan(0);
            expect(result.monthlyPaymentCents).toBeLessThan(150000); // Less than loan/2
            expect(result.totalInterestCents).toBeGreaterThan(0);
            expect(result.totalCostCents).toBe(result.loanAmountCents + result.totalInterestCents);
        });

        it("should calculate total interest correctly", () => {
            const loanAmount = 100000 as Money; // $1,000
            const annualRate = 0.06; // 6% annual
            const termMonths = 12; // 1-year loan

            const result = simulator.simulateFinancing(snapshot, loanAmount, annualRate, termMonths);

            // Total interest should be reasonable (roughly 3% for 1-year simple estimate)
            expect(result.totalInterestCents).toBeGreaterThan(0);
            expect(result.totalInterestCents).toBeLessThan(10000); // Less than loan
        });

        it("should determine affordability within budget surplus", () => {
            const loanAmount = 300000 as Money; // $3,000
            const annualRate = 0.05; // 5%
            const termMonths = 24; // 2 years

            const result = simulator.simulateFinancing(snapshot, loanAmount, annualRate, termMonths);

            // Monthly payment should fit within $2,000 surplus
            expect(result.affordableWithinBudget).toBe(true);
        });

        it("should detect unaffordable loans", () => {
            const lowSurplusSnapshot: FinancialSnapshot = {
                ...snapshot,
                monthlySurplus: 30000 as Money, // Only $300/month
            };

            const loanAmount = 5000000 as Money; // $50,000 (much too large for $300/month surplus)
            const annualRate = 0.08; // 8%
            const termMonths = 24;

            const result = new FinancialSimulator(policy).simulateFinancing(
                lowSurplusSnapshot,
                loanAmount,
                annualRate,
                termMonths
            );

            // Payment will exceed $300 surplus
            expect(result.affordableWithinBudget).toBe(false);
        });

        it("should handle zero interest rate", () => {
            const loanAmount = 100000 as Money; // $1,000
            const annualRate = 0; // 0% interest
            const termMonths = 12; // 1-year loan

            const result = simulator.simulateFinancing(snapshot, loanAmount, annualRate, termMonths);

            // Monthly payment should be approximately loan/term
            const expectedMonthly = Math.round((loanAmount as unknown as number) / termMonths);
            expect(result.monthlyPaymentCents).toBe(expectedMonthly as Money);
            // Interest should be near zero (allowing for rounding)
            expect(result.totalInterestCents).toBeLessThanOrEqual(0 as Money);
            expect(result.totalInterestCents).toBeGreaterThanOrEqual(-1000 as Money);
        });

        it("should handle high interest rates", () => {
            const loanAmount = 100000 as Money; // $1,000
            const annualRate = 0.18; // 18% annual (high APR)
            const termMonths = 24;

            const result = simulator.simulateFinancing(snapshot, loanAmount, annualRate, termMonths);

            // Monthly payment should be notably higher than simple division
            expect(result.monthlyPaymentCents).toBeGreaterThan(Math.round(loanAmount / termMonths));
            expect(result.totalInterestCents).toBeGreaterThan(loanAmount * 0.18); // At least some interest
        });

        it("should provide clear financing reasoning", () => {
            const result = simulator.simulateFinancing(snapshot, 300000 as Money, 0.05, 24);
            expect(result.reason).toContain("$");
            expect(result.reason).toContain("month");
        });

        it("should calculate negative monthly impact correctly", () => {
            const result = simulator.simulateFinancing(snapshot, 100000 as Money, 0.05, 12);
            expect(result.monthlyImpactCents).toBeLessThan(0);
            expect(Math.abs(result.monthlyImpactCents)).toBe(result.monthlyPaymentCents);
        });
    });

    describe("Determinism", () => {
        it("should produce identical results for identical inputs (purchase)", () => {
            const purchaseAmount = 50000 as Money;

            const result1 = simulator.simulatePurchase(snapshot, purchaseAmount, "cash");
            const result2 = simulator.simulatePurchase(snapshot, purchaseAmount, "cash");

            expect(result1).toEqual(result2);
        });

        it("should produce identical results for identical inputs (financing)", () => {
            const result1 = simulator.simulateFinancing(snapshot, 300000 as Money, 0.05, 24);
            const result2 = simulator.simulateFinancing(snapshot, 300000 as Money, 0.05, 24);

            expect(result1).toEqual(result2);
        });

        it("should not be affected by call order (idempotent)", () => {
            const purchase1 = simulator.simulatePurchase(snapshot, 50000 as Money, "cash");
            const financing1 = simulator.simulateFinancing(snapshot, 100000 as Money, 0.05, 12);
            const purchase2 = simulator.simulatePurchase(snapshot, 50000 as Money, "cash");

            expect(purchase1).toEqual(purchase2);
        });
    });

    describe("Edge Cases", () => {
        it("should handle zero purchase amount", () => {
            const result = simulator.simulatePurchase(snapshot, 0 as Money, "cash");
            expect(result.affordable).toBe(true);
            expect(result.projectedCashCents).toBe(snapshot.cash);
        });

        it("should handle zero loan amount", () => {
            const result = simulator.simulateFinancing(snapshot, 0 as Money, 0.05, 12);
            expect(result.monthlyPaymentCents).toBe(0);
            expect(result.totalInterestCents).toBe(0);
        });

        it("should handle very long loan terms", () => {
            const result = simulator.simulateFinancing(snapshot, 500000 as Money, 0.05, 360); // 30 years
            expect(result.monthlyPaymentCents).toBeGreaterThan(0);
            expect(result.affordableWithinBudget).toBe(true); // Payment should be manageable
        });

        it("should handle very short loan terms", () => {
            const result = simulator.simulateFinancing(snapshot, 100000 as Money, 0.05, 1); // 1 month
            expect(result.monthlyPaymentCents).toBeGreaterThan(100000); // Payment plus interest
        });
    });
});
