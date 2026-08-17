"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BudgetService = exports.BUDGET_CALCULATION_VERSION = void 0;
exports.createBudgetService = createBudgetService;
const contracts_1 = require("@house-fin/contracts");
exports.BUDGET_CALCULATION_VERSION = 1;
function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate(); // month is 1-based; new Date(y, m, 0) gives last day of month m
}
/**
 * Returns the day-of-month of asOf if it falls within the period month,
 * or daysInMonth when the period is in the past, or 0 when the period is in the future.
 */
function daysElapsed(asOf, year, month) {
    const asOfYear = asOf.getFullYear();
    const asOfMonth = asOf.getMonth() + 1; // convert to 1-based
    if (asOfYear < year || (asOfYear === year && asOfMonth < month)) {
        return 0; // period hasn't started yet
    }
    if (asOfYear > year || (asOfYear === year && asOfMonth > month)) {
        return daysInMonth(year, month); // period is fully elapsed
    }
    return asOf.getDate(); // mid-period: return current day-of-month (1-based)
}
/**
 * Linear projection to end of period.
 * Returns actual when period is closed or no days have elapsed.
 */
function projectMonthEnd(actualCents, elapsed, totalDays) {
    if (elapsed === 0 || elapsed >= totalDays) {
        return actualCents;
    }
    return Math.ceil((actualCents * totalDays) / elapsed);
}
function computeStatus(hasBudget, plannedCents, actualCents) {
    if (!hasBudget)
        return contracts_1.BudgetStatus.UNBUDGETED;
    if (actualCents === 0)
        return contracts_1.BudgetStatus.NO_SPENDING;
    if (actualCents > plannedCents)
        return contracts_1.BudgetStatus.OVER_BUDGET;
    return contracts_1.BudgetStatus.ON_TRACK;
}
/** Calculate the budget result for a single category. */
function calculateCategoryResult(category, period, plannedCents, hasBudget, transactions, elapsed, totalDays, calculatedAt) {
    const relevant = transactions.filter(t => t.category === category);
    const actualCents = relevant.reduce((sum, t) => sum + t.amountCents, 0);
    const remainingCents = (plannedCents - actualCents);
    const varianceCents = (actualCents - plannedCents);
    const variancePercent = hasBudget && plannedCents > 0
        ? (varianceCents / plannedCents) * 100
        : hasBudget ? null // zero budget; variance % is undefined
            : null; // unbudgeted; no baseline to compute against
    return {
        category,
        period,
        plannedCents: plannedCents,
        actualCents,
        remainingCents,
        varianceCents,
        variancePercent,
        projectedMonthEndCents: projectMonthEnd(actualCents, elapsed, totalDays),
        status: computeStatus(hasBudget, plannedCents, actualCents),
        hasBudget,
        transactionCount: relevant.length,
        calculatedAt,
        calculationVersion: exports.BUDGET_CALCULATION_VERSION,
    };
}
class BudgetService {
    /**
     * Calculate budget results for every budgeted category plus every
     * uncategorized spending category that appears in the transaction set.
     */
    calculateResults(input) {
        const { householdId, period, budgets, transactions, asOf } = input;
        const calculatedAt = new Date();
        const total = daysInMonth(period.year, period.month);
        const elapsed = daysElapsed(asOf, period.year, period.month);
        // Collect all categories that need a result row
        const budgetByCategory = new Map(budgets.map(b => [b.category, b]));
        const transactionCategories = new Set(transactions
            .map(t => t.category)
            .filter((c) => c !== null && c !== ""));
        const allCategories = new Set([
            ...budgetByCategory.keys(),
            ...transactionCategories,
        ]);
        const results = [];
        for (const category of allCategories) {
            const budget = budgetByCategory.get(category);
            results.push(calculateCategoryResult(category, period, budget ? budget.amountCents : 0, budget !== undefined, transactions, elapsed, total, calculatedAt));
        }
        // Sort for deterministic output: budgeted categories first, then unbudgeted
        results.sort((a, b) => {
            if (a.hasBudget !== b.hasBudget)
                return a.hasBudget ? -1 : 1;
            return a.category.localeCompare(b.category);
        });
        const totalPlannedCents = results
            .filter(r => r.hasBudget)
            .reduce((s, r) => s + r.plannedCents, 0);
        const totalActualCents = results
            .reduce((s, r) => s + r.actualCents, 0);
        const totalRemainingCents = (totalPlannedCents - totalActualCents);
        const totalVarianceCents = (totalActualCents - totalPlannedCents);
        const unbudgetedSpendingCents = results
            .filter(r => !r.hasBudget)
            .reduce((s, r) => s + r.actualCents, 0);
        return {
            householdId,
            period,
            results,
            totalPlannedCents,
            totalActualCents,
            totalRemainingCents,
            totalVarianceCents,
            unbudgetedSpendingCents,
            asOf,
            calculatedAt,
            calculationVersion: exports.BUDGET_CALCULATION_VERSION,
        };
    }
    /** Validate a budget entry before persist. Throws on invalid input. */
    validateBudget(periodYear, periodMonth, category, amountCents) {
        if (!Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2100) {
            throw new Error("Budget year must be between 2000 and 2100");
        }
        if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
            throw new Error("Budget month must be between 1 and 12");
        }
        if (!category || category.trim().length === 0) {
            throw new Error("Budget category must not be empty");
        }
        if (!Number.isInteger(amountCents) || amountCents < 0) {
            throw new Error("Budget amount must be a non-negative integer number of cents");
        }
    }
}
exports.BudgetService = BudgetService;
function createBudgetService() {
    return new BudgetService();
}
//# sourceMappingURL=budget-service.js.map