/**
 * SavingsGoalService — deterministic savings goal and emergency fund calculations.
 *
 * Rules:
 * - All money arithmetic uses integer cents (Money type).
 * - Same inputs always produce identical outputs.
 * - percentComplete is capped at 100; a goal can never be >100% shown.
 * - projectedCompletionDate is null when monthlyContribution is zero.
 * - requiredMonthlyContribution is zero when no targetDate is set.
 * - Emergency fund analysis is an observation — it never recommends an action.
 * - Division by zero (zero essential expenses) returns FULLY_FUNDED status.
 *
 * Status rules:
 *  COMPLETED  — currentAmount >= targetAmount
 *  AT_RISK    — no contribution with a target date, or projected overrun > 20%
 *  BEHIND     — projected overrun <= 20%, or target date passed with active contribution
 *  AHEAD      — projected completion >= 10% earlier than target date
 *  ON_TRACK   — everything else, including goals with no target date + positive contribution
 */
import { EntityId, GoalResult, SavingsGoal, EmergencyFundPolicy, EmergencyFundResult } from "@house-fin/contracts";
export declare const SAVINGS_GOAL_CALCULATION_VERSION = 1;
export interface CalculateGoalInput {
    goal: SavingsGoal;
    asOf: Date;
}
export interface AnalyzeEmergencyFundInput {
    householdId: EntityId;
    eligibleCashCents: number;
    essentialMonthlyExpensesCents: number;
    policy: EmergencyFundPolicy;
    /** Monthly contribution currently going to the emergency fund; 0 if none. */
    activeMonthlyContributionCents: number;
    asOf: Date;
}
export declare class SavingsGoalService {
    calculateGoal(input: CalculateGoalInput): GoalResult;
    analyzeEmergencyFund(input: AnalyzeEmergencyFundInput): EmergencyFundResult;
}
export declare function createSavingsGoalService(): SavingsGoalService;
//# sourceMappingURL=savings-goal-service.d.ts.map