/**
 * CashFlowService — deterministic cash-flow projection engine.
 *
 * Rules:
 * - No future income or expense is assumed unless supported by a recurring
 *   pattern, an explicit budget entry, or household settings.
 * - Every assumption is recorded in ForecastAssumption[].
 * - Confidence is LOW when historical data is insufficient (< 2 months).
 * - projectedEndingCash can legitimately be negative.
 * - All money uses integer cents (Money convention).
 */
import { EntityId, Budget, HouseholdSettings, RecurringPattern, CashFlowProjection, CashFlowHistory, ShortTermForecast } from "@house-fin/contracts";
import { CashFlowTransaction } from "./recurring-detector";
export declare const CASHFLOW_CALCULATION_VERSION = 1;
/** Categories considered essential expenses for essential/discretionary splitting. */
export declare const ESSENTIAL_CATEGORIES: Set<string>;
export interface CashFlowProjectionInput {
    householdId: EntityId;
    asOf: Date;
    /** Current liquid balance (CHECKING + SAVINGS). */
    liquidCashCents: number;
    /** Transactions that have posted in the current calendar month. */
    currentMonthTransactions: CashFlowTransaction[];
    /** Recurring patterns derived from historical transactions. */
    historicalPatterns: RecurringPattern[];
    /** Budget entries for the current month (may be empty). */
    currentMonthBudgets: Budget[];
    householdSettings: HouseholdSettings | null;
    /** How many distinct calendar months exist in the transaction history. */
    historyMonthCount: number;
}
export interface HistoryCashFlowInput {
    householdId: EntityId;
    asOf: Date;
    /** All transactions across the history window, any order. */
    transactions: CashFlowTransaction[];
}
export interface ForecastInput {
    householdId: EntityId;
    asOf: Date;
    liquidCashCents: number;
    /** All historical transactions (used for history count + current month). */
    allTransactions: CashFlowTransaction[];
    historicalPatterns: RecurringPattern[];
    /** Budget entries keyed by month: Map<"YYYY-M", Budget[]> */
    budgetsByMonth: Map<string, Budget[]>;
    householdSettings: HouseholdSettings | null;
    historyMonthCount: number;
    forecastMonths: number;
}
export declare class CashFlowService {
    /**
     * Summarise historical cash flow month-by-month.
     * Only complete calendar months are marked isComplete = true.
     */
    calculateHistory(input: HistoryCashFlowInput): CashFlowHistory;
    /**
     * Project the current calendar month's cash flow.
     * Uses confirmed transactions + recurring patterns + budget + settings (in that priority).
     */
    calculateCurrentProjection(input: CashFlowProjectionInput): CashFlowProjection;
    /**
     * Produce a short-term forecast for the next N calendar months
     * starting from the month following asOf's current month.
     */
    calculateForecast(input: ForecastInput): ShortTermForecast;
}
export declare function createCashFlowService(): CashFlowService;
//# sourceMappingURL=cash-flow-service.d.ts.map