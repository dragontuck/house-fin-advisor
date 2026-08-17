/**
 * HealthEngine — deterministic household financial health and attention analysis.
 *
 * Rules (HEALTH_ENGINE_VERSION = 1):
 *
 *  CRITICAL (any one of):
 *   - Monthly surplus is negative AND liquid cash covers < 1 month of essential expenses
 *   - Emergency fund coverage < 1 month (when essential expenses > 0)
 *   - Debt status is CRITICAL
 *
 *  AT_RISK (any one of):
 *   - Monthly surplus is negative
 *   - Emergency fund coverage < minimumCoverageMonths
 *   - Any budgeted category is over-budget by > 50%
 *   - Debt status is AT_RISK
 *
 *  WATCH (any one of):
 *   - Monthly surplus is positive but < 10% of monthly income
 *   - Emergency fund coverage < targetCoverageMonths (but >= minimum)
 *   - Any budgeted category is over-budget by > 20%
 *   - Debt status is WATCH
 *   - One or more goals are in BEHIND or AT_RISK status
 *
 *  HEALTHY:
 *   - None of the above triggered
 *
 * The overall status is the worst-case across all triggered rules.
 *
 * Attention items are factual condition descriptions — no recommendations.
 * They are generated deterministically; the same inputs always yield the same items.
 * DATA_STALE fires when lastTransactionDate is null or > 30 days before asOf.
 */
import { EntityId, DebtHealthStatus, GoalStatus, HealthAnalysis } from "@house-fin/contracts";
export declare const HEALTH_ENGINE_VERSION = 1;
export interface OverBudgetEntry {
    category: string;
    varianceCents: number;
    /** Positive percentage, e.g. 35 means 35% over. */
    variancePercent: number;
}
export interface GoalSummary {
    goalId: EntityId;
    name: string;
    status: GoalStatus;
    percentComplete: number;
    targetDate: Date | null;
}
export interface RecurringChangeEntry {
    merchant: string;
    previousAmountCents: number;
    currentAmountCents: number;
    /** Positive = increase, negative = decrease (percent of previous). */
    changePercent: number;
}
export interface HealthEngineInput {
    householdId: EntityId;
    asOf: Date;
    /** Positive = surplus, negative = deficit. */
    monthlySurplusCents: number;
    /** 0 when income is unknown. */
    monthlyIncomeCents: number;
    liquidCashCents: number;
    essentialMonthlyExpensesCents: number;
    /** null when essential expenses are zero or unknown. */
    emergencyFundCoverageMonths: number | null;
    emergencyFundMinimumMonths: number;
    emergencyFundTargetMonths: number;
    debtStatus: DebtHealthStatus;
    revolvingDebtCents: number;
    /** null when no prior period data. */
    previousRevolvingDebtCents: number | null;
    overBudgetResults: OverBudgetEntry[];
    goalResults: GoalSummary[];
    /** null when no transactions have ever been recorded. */
    lastTransactionDate: Date | null;
    recurringExpenseChanges: RecurringChangeEntry[];
}
export declare class HealthEngine {
    analyze(input: HealthEngineInput): HealthAnalysis;
}
export declare function createHealthEngine(): HealthEngine;
//# sourceMappingURL=health-engine.d.ts.map