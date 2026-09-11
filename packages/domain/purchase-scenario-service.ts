import { EntityId, Money, SimulatePurchaseOutput } from "@house-fin/contracts";

export interface PurchaseScenarioInput {
    householdId: EntityId;
    purchaseAmountCents: Money;
    paymentMethod: "CASH" | "CREDIT_CARD" | "LOAN" | "SAVINGS";
    description: string;
    currentLiquidCashCents: Money;
    monthlyEssentialExpensesCents: Money;
    monthlySurplusCents: Money;
    emergencyFundMinimumMonths: number;
    category?: string;
}

export function calculatePurchaseScenario(input: PurchaseScenarioInput): SimulatePurchaseOutput {
    const emergencyFundFloorCents = Money(
        input.monthlyEssentialExpensesCents * input.emergencyFundMinimumMonths
    );
    const paysFromCash = input.paymentMethod === "CASH" || input.paymentMethod === "SAVINGS";
    const projectedLiquidCashCents = Money(
        paysFromCash
            ? input.currentLiquidCashCents - input.purchaseAmountCents
            : input.currentLiquidCashCents
    );
    const estimatedMonthlyPaymentCents = input.paymentMethod === "CASH" || input.paymentMethod === "SAVINGS"
        ? Money(0)
        : Money(Math.ceil(input.purchaseAmountCents / 12));
    const keepsEmergencyFundIntact = !paysFromCash || projectedLiquidCashCents >= emergencyFundFloorCents;
    const keepsSurplusPositive = input.monthlySurplusCents - estimatedMonthlyPaymentCents >= 0;
    const isAffordable = keepsEmergencyFundIntact && keepsSurplusPositive;

    const recommendations: string[] = [];
    if (!keepsEmergencyFundIntact) {
        recommendations.push(
            `Paying in cash would drop liquid savings below your ${input.emergencyFundMinimumMonths}-month emergency fund floor.`
        );
    }
    if (!keepsSurplusPositive) {
        recommendations.push("Estimated monthly payment would exceed your current monthly surplus.");
    }
    if (isAffordable) {
        recommendations.push("This purchase fits within your current cash position and emergency fund floor.");
    }

    return {
        householdId: input.householdId,
        scenario: {
            purchaseAmountCents: input.purchaseAmountCents,
            paymentMethod: input.paymentMethod,
            description: input.description,
        },
        projectedImpact: {
            currentLiquidCashCents: input.currentLiquidCashCents,
            projectedLiquidCashCents,
            affectsCashPosition: paysFromCash,
            affectsDebtLevel: input.paymentMethod === "CREDIT_CARD" || input.paymentMethod === "LOAN",
            affectsEmergencyFund: paysFromCash,
            budgetImpactCategory: input.category,
        },
        recommendations,
        isAffordable,
    };
}