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

import {
    EntityId,
    Money,
    GoalType,
    GoalStatus,
    GoalResult,
    SavingsGoal,
    EmergencyFundPolicy,
    EmergencyFundResult,
    EmergencyFundStatus,
    EmergencyFundTrend,
} from "@house-fin/contracts";

export const SAVINGS_GOAL_CALCULATION_VERSION = 1;

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

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Whole calendar months from `from` to `to` (can be negative). */
function monthsBetween(from: Date, to: Date): number {
    return (
        (to.getFullYear() - from.getFullYear()) * 12 +
        (to.getMonth() - from.getMonth())
    );
}

function addMonths(base: Date, months: number): Date {
    const d = new Date(base);
    d.setMonth(d.getMonth() + months);
    return d;
}

// ── Goal calculation helpers ──────────────────────────────────────────────────

function calcStatus(
    goal: SavingsGoal,
    projectedCompletionDate: Date | null,
    asOf: Date,
): GoalStatus {
    if (goal.currentAmountCents >= goal.targetAmountCents) return GoalStatus.COMPLETED;

    const { targetDate, monthlyContributionCents } = goal;

    if (targetDate === null) {
        return monthlyContributionCents > 0 ? GoalStatus.ON_TRACK : GoalStatus.AT_RISK;
    }

    const monthsToTarget = monthsBetween(asOf, targetDate);

    if (monthsToTarget <= 0) {
        // Target date has passed without completion
        return monthlyContributionCents > 0 ? GoalStatus.BEHIND : GoalStatus.AT_RISK;
    }

    if (monthlyContributionCents <= 0) return GoalStatus.AT_RISK;

    if (projectedCompletionDate === null) return GoalStatus.AT_RISK;

    const monthsNeeded = monthsBetween(asOf, projectedCompletionDate);

    if (monthsNeeded > monthsToTarget * 1.20) return GoalStatus.AT_RISK;
    if (monthsNeeded > monthsToTarget) return GoalStatus.BEHIND;
    if (monthsNeeded < monthsToTarget * 0.90) return GoalStatus.AHEAD;
    return GoalStatus.ON_TRACK;
}

// ── Emergency fund helpers ────────────────────────────────────────────────────

function efStatus(coverageMonths: number, policy: EmergencyFundPolicy): EmergencyFundStatus {
    if (coverageMonths <= 0) return EmergencyFundStatus.CRITICAL;
    if (coverageMonths < policy.minimumMonths) return EmergencyFundStatus.WATCH;
    if (coverageMonths < policy.targetMonths) return EmergencyFundStatus.ADEQUATE;
    if (coverageMonths < policy.stretchMonths) return EmergencyFundStatus.ON_TARGET;
    return EmergencyFundStatus.FULLY_FUNDED;
}

function efStatusDescription(
    status: EmergencyFundStatus,
    coverageMonths: number,
    policy: EmergencyFundPolicy,
): string {
    const months = Math.round(coverageMonths * 10) / 10;
    switch (status) {
        case EmergencyFundStatus.CRITICAL:
            return "Your emergency fund is empty. You have no buffer for unexpected expenses.";
        case EmergencyFundStatus.WATCH:
            return (
                `Your emergency savings covers approximately ${months} month${months === 1 ? "" : "s"} ` +
                `of essential expenses and is below the household minimum of ${policy.minimumMonths} months.`
            );
        case EmergencyFundStatus.ADEQUATE:
            return (
                `Your emergency savings meets the household minimum of ${policy.minimumMonths} months. ` +
                `The preferred target is ${policy.targetMonths} months.`
            );
        case EmergencyFundStatus.ON_TARGET:
            return (
                `Your emergency savings covers ${months} months of essential expenses, ` +
                `meeting the preferred target of ${policy.targetMonths} months.`
            );
        case EmergencyFundStatus.FULLY_FUNDED:
            return (
                `Your emergency savings covers ${months} months of essential expenses, ` +
                `meeting the stretch target of ${policy.stretchMonths} months.`
            );
    }
}

function efTrend(
    status: EmergencyFundStatus,
    activeContributionCents: number,
): EmergencyFundTrend {
    if (status === EmergencyFundStatus.FULLY_FUNDED) return EmergencyFundTrend.STABLE;
    if (activeContributionCents > 0) return EmergencyFundTrend.IMPROVING;
    if (
        status === EmergencyFundStatus.CRITICAL ||
        status === EmergencyFundStatus.WATCH
    ) {
        return EmergencyFundTrend.DECLINING;
    }
    return EmergencyFundTrend.UNKNOWN;
}

// ── Public service ────────────────────────────────────────────────────────────

export class SavingsGoalService {
    calculateGoal(input: CalculateGoalInput): GoalResult {
        const { goal, asOf } = input;
        const {
            id,
            householdId,
            name,
            type,
            targetAmountCents,
            monthlyContributionCents,
            targetDate,
        } = goal;

        const currentAmountCents = goal.currentAmountCents;
        const remainingAmountCents = Math.max(
            0,
            targetAmountCents - currentAmountCents,
        ) as Money;

        const percentComplete =
            targetAmountCents > 0
                ? Math.min(100, Math.round((currentAmountCents / targetAmountCents) * 1000) / 10)
                : 0;

        // Projected completion: how many months at the current rate
        let projectedCompletionDate: Date | null = null;
        if (currentAmountCents < targetAmountCents && monthlyContributionCents > 0) {
            const monthsNeeded = Math.ceil(remainingAmountCents / monthlyContributionCents);
            projectedCompletionDate = addMonths(asOf, monthsNeeded);
        }

        // Required monthly contribution to hit targetDate
        let requiredMonthlyContributionCents: Money = 0 as Money;
        if (targetDate !== null && remainingAmountCents > 0) {
            const monthsToTarget = monthsBetween(asOf, targetDate);
            requiredMonthlyContributionCents =
                monthsToTarget > 0
                    ? (Math.ceil(remainingAmountCents / monthsToTarget) as Money)
                    : remainingAmountCents; // overdue — full remaining is "required now"
        }

        const status = calcStatus(goal, projectedCompletionDate, asOf);

        return {
            goalId: id,
            householdId,
            name,
            type,
            targetAmountCents: targetAmountCents as Money,
            currentAmountCents: currentAmountCents as Money,
            percentComplete,
            remainingAmountCents,
            monthlyContributionCents: monthlyContributionCents as Money,
            requiredMonthlyContributionCents,
            projectedCompletionDate,
            targetDate,
            status,
            calculatedAt: new Date(),
            calculationVersion: SAVINGS_GOAL_CALCULATION_VERSION,
        };
    }

    analyzeEmergencyFund(input: AnalyzeEmergencyFundInput): EmergencyFundResult {
        const {
            householdId,
            eligibleCashCents,
            essentialMonthlyExpensesCents,
            policy,
            activeMonthlyContributionCents,
        } = input;

        const minimumTargetCents = Math.round(
            essentialMonthlyExpensesCents * policy.minimumMonths,
        ) as Money;
        const preferredTargetCents = Math.round(
            essentialMonthlyExpensesCents * policy.targetMonths,
        ) as Money;
        const stretchTargetCents = Math.round(
            essentialMonthlyExpensesCents * policy.stretchMonths,
        ) as Money;

        const gapToMinimumCents = (eligibleCashCents - minimumTargetCents) as Money;
        const gapToPreferredCents = (eligibleCashCents - preferredTargetCents) as Money;

        // Guard: zero expenses — any positive cash is full coverage
        let currentCoverageMonths: number;
        let status: EmergencyFundStatus;
        if (essentialMonthlyExpensesCents === 0) {
            currentCoverageMonths = eligibleCashCents > 0 ? Infinity : 0;
            status =
                eligibleCashCents > 0
                    ? EmergencyFundStatus.FULLY_FUNDED
                    : EmergencyFundStatus.CRITICAL;
        } else {
            currentCoverageMonths =
                Math.round((eligibleCashCents / essentialMonthlyExpensesCents) * 10) / 10;
            status = efStatus(currentCoverageMonths, policy);
        }

        const trend = efTrend(status, activeMonthlyContributionCents);
        const displayCoverage = Number.isFinite(currentCoverageMonths)
            ? currentCoverageMonths
            : policy.stretchMonths; // use stretch as display value for Infinity

        return {
            householdId,
            eligibleCashCents: eligibleCashCents as Money,
            essentialMonthlyExpensesCents: essentialMonthlyExpensesCents as Money,
            currentCoverageMonths: Number.isFinite(currentCoverageMonths)
                ? currentCoverageMonths
                : 0,
            minimumTargetCents,
            preferredTargetCents,
            stretchTargetCents,
            gapToMinimumCents,
            gapToPreferredCents,
            trend,
            status,
            statusDescription: efStatusDescription(status, displayCoverage, policy),
            policy,
            calculatedAt: new Date(),
            calculationVersion: SAVINGS_GOAL_CALCULATION_VERSION,
        };
    }
}

export function createSavingsGoalService(): SavingsGoalService {
    return new SavingsGoalService();
}
