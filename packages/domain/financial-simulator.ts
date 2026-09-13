/**
 * Financial Simulator — deterministic simulation of financial scenarios
 *
 * Provides calculations for:
 * - Purchase affordability (cash position, emergency fund, budget impact)
 * - Financing scenarios (loan payments, total cost, monthly impact)
 *
 * All calculations are deterministic: same inputs always produce identical outputs.
 * No external APIs, no randomness, no assumptions beyond provided inputs.
 */

import { Money, FinancialSnapshot } from "@house-fin/contracts";

export interface HouseholdFinancialPolicy {
    /** Minimum months of expenses to maintain as emergency fund (e.g., 3) */
    emergencyFundMonths: number;
}

export interface PurchaseSimulationResult {
    /** Current liquid cash position */
    currentCashCents: Money;

    /** Projected cash position after purchase */
    projectedCashCents: Money;

    /** Current emergency fund floor requirement */
    emergencyFundFloorCents: Money;

    /** Gap to emergency fund if applicable (negative means surplus) */
    emergencyFundGapCents?: Money;

    /** Whether purchase is affordable */
    affordable: boolean;

    /** Why or why not the purchase is affordable */
    reason: string;

    /** Impact on cash flow if financed */
    monthlyPaymentCents: Money;

    /** Emergency fund status after purchase */
    emergencyFundStatus: "healthy" | "warning" | "critical";
}

export interface FinancingSimulationResult {
    /** Amount being financed */
    loanAmountCents: Money;

    /** Monthly payment required */
    monthlyPaymentCents: Money;

    /** Total interest over loan term */
    totalInterestCents: Money;

    /** Total amount paid (principal + interest) */
    totalCostCents: Money;

    /** Annual interest rate as decimal (0.05 = 5%) */
    annualInterestRate: number;

    /** Loan term in months */
    termMonths: number;

    /** Whether monthly payment fits within budget surplus */
    affordableWithinBudget: boolean;

    /** Why or why not the loan is affordable */
    reason: string;

    /** Impact on monthly cash flow */
    monthlyImpactCents: Money;
}

/**
 * FinancialSimulator provides deterministic financial scenario calculations
 */
export class FinancialSimulator {
    constructor(private policy: HouseholdFinancialPolicy) { }

    /**
     * Simulate a one-time purchase and its financial impact
     *
     * @param snapshot Current financial state
     * @param purchaseAmountCents Amount of purchase
     * @param paymentMethod How the purchase will be paid (cash, credit, loan)
     * @returns Simulation results including affordability assessment
     */
    simulatePurchase(
        snapshot: FinancialSnapshot,
        purchaseAmountCents: Money,
        paymentMethod: "cash" | "credit" | "loan"
    ): PurchaseSimulationResult {
        // Calculate emergency fund requirement from policy
        const monthlyExpensesCents = snapshot.monthlyEssentialExpenses;
        const emergencyFundFloorCents = (monthlyExpensesCents * this.policy.emergencyFundMonths) as Money;

        // Current cash position
        const currentCashCents = snapshot.cash;

        // Calculate projected cash after purchase
        let projectedCashCents: Money;
        let monthlyPaymentCents: Money = 0 as Money;

        if (paymentMethod === "cash") {
            projectedCashCents = (currentCashCents - purchaseAmountCents) as Money;
            monthlyPaymentCents = 0 as Money;
        } else if (paymentMethod === "credit" || paymentMethod === "loan") {
            // Credit card or loan: no immediate cash impact, but monthly payment
            projectedCashCents = currentCashCents;
            // Rough monthly estimate: spread cost over 12 months
            monthlyPaymentCents = Math.ceil((purchaseAmountCents as unknown as number) / 12) as Money;
        } else {
            projectedCashCents = currentCashCents;
        }

        // Check emergency fund impact
        const emergencyFundGapCents = Math.max(0, (emergencyFundFloorCents as unknown as number) - (projectedCashCents as unknown as number)) as Money;
        const keepsEmergencyFund = (projectedCashCents as unknown as number) >= (emergencyFundFloorCents as unknown as number);

        // Check budget impact
        const currentSurplusCents = snapshot.monthlySurplus;
        const keepsSurplusPositive = (currentSurplusCents as unknown as number) - (monthlyPaymentCents as unknown as number) >= 0;

        // Determine affordability
        const affordable = keepsEmergencyFund && keepsSurplusPositive;

        // Build reason
        let reason = "";
        if (paymentMethod === "cash") {
            if (!keepsEmergencyFund) {
                reason = `Paying ${this.formatMoney(purchaseAmountCents)} in cash would drop your liquid savings below your ${this.policy.emergencyFundMonths}-month emergency fund floor (gap: ${this.formatMoney(emergencyFundGapCents)}).`;
            } else if (affordable) {
                reason = `Paying ${this.formatMoney(purchaseAmountCents)} in cash keeps your emergency fund intact at ${this.formatMoney(projectedCashCents)}.`;
            }
        } else {
            if (!keepsSurplusPositive) {
                reason = `Estimated monthly payment of ${this.formatMoney(monthlyPaymentCents)} would exceed your current monthly surplus of ${this.formatMoney(currentSurplusCents)}.`;
            } else if (affordable) {
                reason = `Monthly payment of ${this.formatMoney(monthlyPaymentCents)} fits within your current surplus of ${this.formatMoney(currentSurplusCents)}.`;
            }
        }

        // Determine emergency fund status
        let emergencyFundStatus: "healthy" | "warning" | "critical";
        const fundPercentage = ((projectedCashCents as unknown as number) / (emergencyFundFloorCents as unknown as number)) * 100;
        if (fundPercentage >= 100) {
            emergencyFundStatus = "healthy";
        } else if (fundPercentage >= 50) {
            emergencyFundStatus = "warning";
        } else {
            emergencyFundStatus = "critical";
        }

        return {
            currentCashCents,
            projectedCashCents,
            emergencyFundFloorCents,
            emergencyFundGapCents: (emergencyFundGapCents as unknown as number) > 0 ? emergencyFundGapCents : undefined,
            affordable,
            reason,
            monthlyPaymentCents,
            emergencyFundStatus,
        };
    }

    /**
     * Simulate a financing decision (loan or credit financing)
     *
     * @param snapshot Current financial state (for surplus check)
     * @param loanAmountCents Amount being financed
     * @param annualInterestRate Annual rate as decimal (0.05 = 5%)
     * @param termMonths Loan term in months
     * @returns Simulation results including monthly payment and affordability
     */
    simulateFinancing(
        snapshot: FinancialSnapshot,
        loanAmountCents: Money,
        annualInterestRate: number,
        termMonths: number
    ): FinancingSimulationResult {
        // Use standard amortization formula to calculate monthly payment
        // M = P * [r(1+r)^n] / [(1+r)^n - 1]
        // where P = principal, r = monthly rate, n = number of payments

        const principalAmount = loanAmountCents as unknown as number;
        const monthlyRate = annualInterestRate / 12;

        let monthlyPaymentCents: Money;

        if (monthlyRate === 0 || monthlyRate < 0.00001) {
            // Zero or near-zero interest: simple division
            monthlyPaymentCents = Math.round(principalAmount / termMonths) as Money;
        } else {
            // Standard amortization formula
            const numerator = principalAmount * monthlyRate * Math.pow(1 + monthlyRate, termMonths);
            const denominator = Math.pow(1 + monthlyRate, termMonths) - 1;
            monthlyPaymentCents = Math.round(numerator / denominator) as Money;
        }

        // Calculate total paid and interest
        const totalPaidCents = (monthlyPaymentCents as unknown as number) * termMonths;
        const totalInterestCents = (totalPaidCents - principalAmount) as Money;
        const totalCostCents = (principalAmount + (totalInterestCents as unknown as number)) as Money;

        // Check if monthly payment fits within budget surplus
        const currentSurplusCents = snapshot.monthlySurplus;
        const affordableWithinBudget = (monthlyPaymentCents as unknown as number) <= (currentSurplusCents as unknown as number);

        // Build reason
        let reason = "";
        if (affordableWithinBudget) {
            reason = `Monthly payment of ${this.formatMoney(monthlyPaymentCents)} fits within your current surplus of ${this.formatMoney(currentSurplusCents)}. Total cost: ${this.formatMoney(totalCostCents)} over ${termMonths} months.`;
        } else {
            const shortfallCents = ((monthlyPaymentCents as unknown as number) - (currentSurplusCents as unknown as number)) as Money;
            reason = `Monthly payment of ${this.formatMoney(monthlyPaymentCents)} exceeds your current surplus of ${this.formatMoney(currentSurplusCents)} by ${this.formatMoney(shortfallCents)}.`;
        }

        const monthlyImpactCents = (-(monthlyPaymentCents as unknown as number)) as Money;

        return {
            loanAmountCents,
            monthlyPaymentCents,
            totalInterestCents,
            totalCostCents,
            annualInterestRate,
            termMonths,
            affordableWithinBudget,
            reason,
            monthlyImpactCents,
        };
    }

    /** Format money amount as currency string for display in reasons */
    private formatMoney(centsAmount: Money): string {
        const dollars = (centsAmount as unknown as number) / 100;
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(dollars);
    }
}

/**
 * Create a FinancialSimulator with default household policy
 */
export function createFinancialSimulator(
    policy?: Partial<HouseholdFinancialPolicy>
): FinancialSimulator {
    const defaultPolicy: HouseholdFinancialPolicy = {
        emergencyFundMonths: 3,
        ...policy,
    };
    return new FinancialSimulator(defaultPolicy);
}
