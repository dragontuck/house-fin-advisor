"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SavingsGoalService = exports.SAVINGS_GOAL_CALCULATION_VERSION = void 0;
exports.createSavingsGoalService = createSavingsGoalService;
const contracts_1 = require("@house-fin/contracts");
exports.SAVINGS_GOAL_CALCULATION_VERSION = 1;
// ── Date helpers ──────────────────────────────────────────────────────────────
/** Whole calendar months from `from` to `to` (can be negative). */
function monthsBetween(from, to) {
    return ((to.getFullYear() - from.getFullYear()) * 12 +
        (to.getMonth() - from.getMonth()));
}
function addMonths(base, months) {
    const d = new Date(base);
    d.setMonth(d.getMonth() + months);
    return d;
}
// ── Goal calculation helpers ──────────────────────────────────────────────────
function calcStatus(goal, projectedCompletionDate, asOf) {
    if (goal.currentAmountCents >= goal.targetAmountCents)
        return contracts_1.GoalStatus.COMPLETED;
    const { targetDate, monthlyContributionCents } = goal;
    if (targetDate === null) {
        return monthlyContributionCents > 0 ? contracts_1.GoalStatus.ON_TRACK : contracts_1.GoalStatus.AT_RISK;
    }
    const monthsToTarget = monthsBetween(asOf, targetDate);
    if (monthsToTarget <= 0) {
        // Target date has passed without completion
        return monthlyContributionCents > 0 ? contracts_1.GoalStatus.BEHIND : contracts_1.GoalStatus.AT_RISK;
    }
    if (monthlyContributionCents <= 0)
        return contracts_1.GoalStatus.AT_RISK;
    if (projectedCompletionDate === null)
        return contracts_1.GoalStatus.AT_RISK;
    const monthsNeeded = monthsBetween(asOf, projectedCompletionDate);
    if (monthsNeeded > monthsToTarget * 1.20)
        return contracts_1.GoalStatus.AT_RISK;
    if (monthsNeeded > monthsToTarget)
        return contracts_1.GoalStatus.BEHIND;
    if (monthsNeeded < monthsToTarget * 0.90)
        return contracts_1.GoalStatus.AHEAD;
    return contracts_1.GoalStatus.ON_TRACK;
}
// ── Emergency fund helpers ────────────────────────────────────────────────────
function efStatus(coverageMonths, policy) {
    if (coverageMonths <= 0)
        return contracts_1.EmergencyFundStatus.CRITICAL;
    if (coverageMonths < policy.minimumMonths)
        return contracts_1.EmergencyFundStatus.WATCH;
    if (coverageMonths < policy.targetMonths)
        return contracts_1.EmergencyFundStatus.ADEQUATE;
    if (coverageMonths < policy.stretchMonths)
        return contracts_1.EmergencyFundStatus.ON_TARGET;
    return contracts_1.EmergencyFundStatus.FULLY_FUNDED;
}
function efStatusDescription(status, coverageMonths, policy) {
    const months = Math.round(coverageMonths * 10) / 10;
    switch (status) {
        case contracts_1.EmergencyFundStatus.CRITICAL:
            return "Your emergency fund is empty. You have no buffer for unexpected expenses.";
        case contracts_1.EmergencyFundStatus.WATCH:
            return (`Your emergency savings covers approximately ${months} month${months === 1 ? "" : "s"} ` +
                `of essential expenses and is below the household minimum of ${policy.minimumMonths} months.`);
        case contracts_1.EmergencyFundStatus.ADEQUATE:
            return (`Your emergency savings meets the household minimum of ${policy.minimumMonths} months. ` +
                `The preferred target is ${policy.targetMonths} months.`);
        case contracts_1.EmergencyFundStatus.ON_TARGET:
            return (`Your emergency savings covers ${months} months of essential expenses, ` +
                `meeting the preferred target of ${policy.targetMonths} months.`);
        case contracts_1.EmergencyFundStatus.FULLY_FUNDED:
            return (`Your emergency savings covers ${months} months of essential expenses, ` +
                `meeting the stretch target of ${policy.stretchMonths} months.`);
    }
}
function efTrend(status, activeContributionCents) {
    if (status === contracts_1.EmergencyFundStatus.FULLY_FUNDED)
        return contracts_1.EmergencyFundTrend.STABLE;
    if (activeContributionCents > 0)
        return contracts_1.EmergencyFundTrend.IMPROVING;
    if (status === contracts_1.EmergencyFundStatus.CRITICAL ||
        status === contracts_1.EmergencyFundStatus.WATCH) {
        return contracts_1.EmergencyFundTrend.DECLINING;
    }
    return contracts_1.EmergencyFundTrend.UNKNOWN;
}
// ── Public service ────────────────────────────────────────────────────────────
class SavingsGoalService {
    calculateGoal(input) {
        const { goal, asOf } = input;
        const { id, householdId, name, type, targetAmountCents, monthlyContributionCents, targetDate, } = goal;
        const currentAmountCents = goal.currentAmountCents;
        const remainingAmountCents = Math.max(0, targetAmountCents - currentAmountCents);
        const percentComplete = targetAmountCents > 0
            ? Math.min(100, Math.round((currentAmountCents / targetAmountCents) * 1000) / 10)
            : 0;
        // Projected completion: how many months at the current rate
        let projectedCompletionDate = null;
        if (currentAmountCents < targetAmountCents && monthlyContributionCents > 0) {
            const monthsNeeded = Math.ceil(remainingAmountCents / monthlyContributionCents);
            projectedCompletionDate = addMonths(asOf, monthsNeeded);
        }
        // Required monthly contribution to hit targetDate
        let requiredMonthlyContributionCents = 0;
        if (targetDate !== null && remainingAmountCents > 0) {
            const monthsToTarget = monthsBetween(asOf, targetDate);
            requiredMonthlyContributionCents =
                monthsToTarget > 0
                    ? Math.ceil(remainingAmountCents / monthsToTarget)
                    : remainingAmountCents; // overdue — full remaining is "required now"
        }
        const status = calcStatus(goal, projectedCompletionDate, asOf);
        return {
            goalId: id,
            householdId,
            name,
            type,
            targetAmountCents: targetAmountCents,
            currentAmountCents: currentAmountCents,
            percentComplete,
            remainingAmountCents,
            monthlyContributionCents: monthlyContributionCents,
            requiredMonthlyContributionCents,
            projectedCompletionDate,
            targetDate,
            status,
            calculatedAt: new Date(),
            calculationVersion: exports.SAVINGS_GOAL_CALCULATION_VERSION,
        };
    }
    analyzeEmergencyFund(input) {
        const { householdId, eligibleCashCents, essentialMonthlyExpensesCents, policy, activeMonthlyContributionCents, } = input;
        const minimumTargetCents = Math.round(essentialMonthlyExpensesCents * policy.minimumMonths);
        const preferredTargetCents = Math.round(essentialMonthlyExpensesCents * policy.targetMonths);
        const stretchTargetCents = Math.round(essentialMonthlyExpensesCents * policy.stretchMonths);
        const gapToMinimumCents = (eligibleCashCents - minimumTargetCents);
        const gapToPreferredCents = (eligibleCashCents - preferredTargetCents);
        // Guard: zero expenses — any positive cash is full coverage
        let currentCoverageMonths;
        let status;
        if (essentialMonthlyExpensesCents === 0) {
            currentCoverageMonths = eligibleCashCents > 0 ? Infinity : 0;
            status =
                eligibleCashCents > 0
                    ? contracts_1.EmergencyFundStatus.FULLY_FUNDED
                    : contracts_1.EmergencyFundStatus.CRITICAL;
        }
        else {
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
            eligibleCashCents: eligibleCashCents,
            essentialMonthlyExpensesCents: essentialMonthlyExpensesCents,
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
            calculationVersion: exports.SAVINGS_GOAL_CALCULATION_VERSION,
        };
    }
}
exports.SavingsGoalService = SavingsGoalService;
function createSavingsGoalService() {
    return new SavingsGoalService();
}
//# sourceMappingURL=savings-goal-service.js.map