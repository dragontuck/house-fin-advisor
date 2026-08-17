/**
 * DebtIntelligenceService — deterministic debt analysis.
 *
 * Rules:
 * - All money arithmetic uses integer cents.
 * - Same inputs always produce identical outputs.
 * - A credit-card statement balance is NEVER automatically treated as revolving debt.
 *   revolvingBalanceCents must be explicitly provided or it stays null.
 * - weightedAverageRateBps is null when ANY debt account is missing interestRateBps.
 * - totalMinimumPaymentCents / totalScheduledPaymentCents are null when ANY
 *   active debt account is missing that field.
 * - debtToIncomeRatio is null when monthlyIncomeCents is zero or payments are unknown.
 * - Observations are factual sentences — no payoff recommendations.
 *
 * Status rules:
 *  HEALTHY  — no revolving balance, DTI < 0.28 or unknown, no high-rate revolving
 *  WATCH    — revolving balance exists and utilisation > 0.30, or DTI 0.28–0.36
 *  AT_RISK  — revolving utilisation > 0.50 on any card, or DTI 0.36–0.43
 *  CRITICAL — revolving utilisation > 0.75 on any card, or DTI > 0.43
 *
 * The highest applicable severity determines overall status.
 */
import { EntityId, Account, DebtAnalysis } from "@house-fin/contracts";
export declare const DEBT_INTELLIGENCE_VERSION = 1;
export interface AnalyzeDebtInput {
    householdId: EntityId;
    /** All accounts for the household (service filters to debt types). */
    accounts: Account[];
    /** Gross monthly income in cents; 0 when unknown. */
    monthlyIncomeCents: number;
    asOf: Date;
}
export declare class DebtIntelligenceService {
    analyze(input: AnalyzeDebtInput): DebtAnalysis;
}
export declare function createDebtIntelligenceService(): DebtIntelligenceService;
//# sourceMappingURL=debt-intelligence-service.d.ts.map