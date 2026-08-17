/**
 * BudgetService — deterministic budgeting calculations.
 *
 * Rules:
 * - All money arithmetic uses integer cents (Money type)
 * - Same inputs always produce identical outputs
 * - No side effects; repository interaction is the caller's responsibility
 * - Categories with only a budget but no transactions are valid (NO_SPENDING)
 * - Categories with only transactions but no budget are valid (UNBUDGETED)
 * - variance = actual − planned  (positive = over budget)
 * - remaining = planned − actual (negative = over budget)
 * - projectedMonthEnd uses linear interpolation based on days elapsed in the period
 */
import { EntityId, Budget, BudgetResultSet, BudgetPeriod } from "@house-fin/contracts";
export declare const BUDGET_CALCULATION_VERSION = 1;
/** Minimal transaction shape the service needs; avoids coupling to full PostedTransaction */
export interface BudgetTransaction {
    id: string;
    category: string | null;
    amountCents: number;
    transactionDate: Date;
}
export interface CalculateBudgetInput {
    householdId: EntityId;
    period: BudgetPeriod;
    budgets: Budget[];
    transactions: BudgetTransaction[];
    asOf: Date;
}
export declare class BudgetService {
    /**
     * Calculate budget results for every budgeted category plus every
     * uncategorized spending category that appears in the transaction set.
     */
    calculateResults(input: CalculateBudgetInput): BudgetResultSet;
    /** Validate a budget entry before persist. Throws on invalid input. */
    validateBudget(periodYear: number, periodMonth: number, category: string, amountCents: number): void;
}
export declare function createBudgetService(): BudgetService;
//# sourceMappingURL=budget-service.d.ts.map