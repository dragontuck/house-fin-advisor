"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashFlowService = exports.ESSENTIAL_CATEGORIES = exports.CASHFLOW_CALCULATION_VERSION = void 0;
exports.createCashFlowService = createCashFlowService;
const contracts_1 = require("@house-fin/contracts");
exports.CASHFLOW_CALCULATION_VERSION = 1;
/** Categories considered essential expenses for essential/discretionary splitting. */
exports.ESSENTIAL_CATEGORIES = new Set([
    "HOUSING", "UTILITIES", "GROCERIES", "HEALTHCARE", "INSURANCE",
    "CHILDCARE", "EDUCATION", "TRANSPORTATION", "FUEL", "DEBT_PAYMENT",
]);
// ── Private helpers ──────────────────────────────────────────────────────────
function periodKey(year, month) {
    return `${year}-${month}`;
}
/** True when a transaction falls within the given calendar month. */
function inMonth(tx, year, month) {
    const d = tx.transactionDate;
    return d.getFullYear() === year && d.getMonth() + 1 === month;
}
/** True when the pattern's merchant has already appeared in currentMonthTxs for this month. */
function hasPatternFiredInMonth(pattern, currentMonthTxs, year, month) {
    const normTarget = normalizeMerchant(pattern.merchant);
    return currentMonthTxs.some(tx => tx.direction === pattern.direction &&
        inMonth(tx, year, month) &&
        normalizeMerchant(tx.merchant) === normTarget);
}
function normalizeMerchant(s) {
    return s.toLowerCase().trim().replace(/\s+/g, " ");
}
/** Split an expense amount into essential/discretionary using category info. */
function splitExpense(amountCents, category, settingsEssential, settingsDiscretionary) {
    if (category && exports.ESSENTIAL_CATEGORIES.has(category)) {
        return { essential: amountCents, discretionary: 0 };
    }
    if (category) {
        return { essential: 0, discretionary: amountCents };
    }
    // Uncategorized: split by settings ratio or default 70/30
    const total = settingsEssential + settingsDiscretionary;
    const ratio = total > 0 ? settingsEssential / total : 0.7;
    const essential = Math.round(amountCents * ratio);
    return { essential, discretionary: amountCents - essential };
}
function sumIncome(txs) {
    return txs
        .filter(t => t.direction === "CREDIT")
        .reduce((s, t) => s + Math.abs(t.amountCents), 0);
}
function sumExpenses(txs) {
    return txs
        .filter(t => t.direction === "DEBIT" && t.amountCents > 0)
        .reduce((s, t) => s + t.amountCents, 0);
}
function determineConfidence(historyMonthCount, patterns, usedSettings) {
    if (historyMonthCount < 2)
        return contracts_1.ForecastConfidence.LOW;
    const highConfidencePatterns = patterns.filter(p => p.confidence >= 0.6);
    const hasIncomePattern = highConfidencePatterns.some(p => p.direction === "CREDIT");
    const hasExpensePattern = highConfidencePatterns.some(p => p.direction === "DEBIT");
    if (historyMonthCount >= 3 && hasIncomePattern && hasExpensePattern && !usedSettings) {
        return contracts_1.ForecastConfidence.HIGH;
    }
    return contracts_1.ForecastConfidence.MEDIUM;
}
// ── Public service ────────────────────────────────────────────────────────────
class CashFlowService {
    /**
     * Summarise historical cash flow month-by-month.
     * Only complete calendar months are marked isComplete = true.
     */
    calculateHistory(input) {
        const { householdId, asOf, transactions } = input;
        const calculatedAt = new Date();
        // Bucket transactions by calendar month
        const byMonth = new Map();
        for (const tx of transactions) {
            const y = tx.transactionDate.getFullYear();
            const m = tx.transactionDate.getMonth() + 1;
            const k = periodKey(y, m);
            const bucket = byMonth.get(k);
            if (bucket)
                bucket.push(tx);
            else
                byMonth.set(k, [tx]);
        }
        const currentYear = asOf.getFullYear();
        const currentMonth = asOf.getMonth() + 1;
        const months = [...byMonth.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, txs]) => {
            const [y, m] = key.split("-").map(Number);
            const income = sumIncome(txs);
            const expenses = sumExpenses(txs);
            return {
                period: { year: y, month: m },
                incomeCents: income,
                expensesCents: expenses,
                surplusCents: (income - expenses),
                transactionCount: txs.length,
                isComplete: !(y === currentYear && m === currentMonth),
            };
        });
        const completedMonths = months.filter(m => m.isComplete);
        const count = completedMonths.length || 1;
        const avgIncome = Math.round(completedMonths.reduce((s, m) => s + m.incomeCents, 0) / count);
        const avgExpenses = Math.round(completedMonths.reduce((s, m) => s + m.expensesCents, 0) / count);
        return {
            householdId,
            months,
            averageMonthlyIncomeCents: avgIncome,
            averageMonthlyExpensesCents: avgExpenses,
            averageMonthlySurplusCents: (avgIncome - avgExpenses),
            calculatedAt,
        };
    }
    /**
     * Project the current calendar month's cash flow.
     * Uses confirmed transactions + recurring patterns + budget + settings (in that priority).
     */
    calculateCurrentProjection(input) {
        const { householdId, asOf, liquidCashCents, currentMonthTransactions, historicalPatterns, currentMonthBudgets, householdSettings, historyMonthCount, } = input;
        const year = asOf.getFullYear();
        const month = asOf.getMonth() + 1;
        const calculatedAt = new Date();
        const assumptions = [];
        const settingsEssential = householdSettings?.monthlyEssentialExpenses ?? 0;
        const settingsDiscretionary = householdSettings?.monthlyDiscretionaryExpenses ?? 0;
        // ── Confirmed amounts (already posted this month) ────────────────────
        const confirmedIncomeCents = sumIncome(currentMonthTransactions);
        let confirmedEssentialCents = 0;
        let confirmedDiscretionaryCents = 0;
        for (const tx of currentMonthTransactions.filter(t => t.direction === "DEBIT" && t.amountCents > 0)) {
            const { essential, discretionary } = splitExpense(tx.amountCents, tx.category, settingsEssential, settingsDiscretionary);
            confirmedEssentialCents += essential;
            confirmedDiscretionaryCents += discretionary;
        }
        // ── Expected remaining from recurring patterns ────────────────────────
        let patternRemainingIncome = 0;
        let patternRemainingEssential = 0;
        let patternRemainingDiscretionary = 0;
        let usedSettings = false;
        const actionablePatterns = historicalPatterns.filter(p => p.confidence >= 0.40);
        for (const pattern of actionablePatterns.filter(p => p.direction === "CREDIT")) {
            if (!hasPatternFiredInMonth(pattern, currentMonthTransactions, year, month)) {
                patternRemainingIncome += pattern.typicalAmountCents;
                assumptions.push({
                    field: "expectedIncomeCents",
                    source: "RECURRING_PATTERN",
                    description: `Recurring income from "${pattern.merchant}" not yet received this month`,
                    confidence: pattern.confidence,
                });
            }
        }
        for (const pattern of actionablePatterns.filter(p => p.direction === "DEBIT")) {
            if (!hasPatternFiredInMonth(pattern, currentMonthTransactions, year, month)) {
                const { essential, discretionary } = splitExpense(pattern.typicalAmountCents, pattern.mostCommonCategory, settingsEssential, settingsDiscretionary);
                patternRemainingEssential += essential;
                patternRemainingDiscretionary += discretionary;
                assumptions.push({
                    field: essential > 0 ? "expectedEssentialExpensesCents" : "expectedDiscretionaryExpensesCents",
                    source: "RECURRING_PATTERN",
                    description: `Recurring expense from "${pattern.merchant}" not yet incurred this month`,
                    confidence: pattern.confidence,
                });
            }
        }
        // ── Budget fallback ──────────────────────────────────────────────────
        const budgetTotalCents = currentMonthBudgets.reduce((s, b) => s + b.amountCents, 0);
        const budgetEssentialCents = currentMonthBudgets
            .filter(b => exports.ESSENTIAL_CATEGORIES.has(b.category))
            .reduce((s, b) => s + b.amountCents, 0);
        const budgetDiscretionaryCents = budgetTotalCents - budgetEssentialCents;
        let expectedEssential = confirmedEssentialCents + patternRemainingEssential;
        let expectedDiscretionary = confirmedDiscretionaryCents + patternRemainingDiscretionary;
        if (currentMonthBudgets.length > 0) {
            // If budget suggests higher spending than patterns, use budget as floor
            if (budgetEssentialCents > expectedEssential) {
                assumptions.push({
                    field: "expectedEssentialExpensesCents",
                    source: "EXPLICIT_BUDGET",
                    description: "Expected essential expenses raised to monthly budget plan",
                    confidence: 0.80,
                });
                expectedEssential = budgetEssentialCents;
            }
            if (budgetDiscretionaryCents > expectedDiscretionary) {
                assumptions.push({
                    field: "expectedDiscretionaryExpensesCents",
                    source: "EXPLICIT_BUDGET",
                    description: "Expected discretionary expenses raised to monthly budget plan",
                    confidence: 0.75,
                });
                expectedDiscretionary = budgetDiscretionaryCents;
            }
        }
        // ── Household settings fallback ───────────────────────────────────────
        let expectedIncome = confirmedIncomeCents + patternRemainingIncome;
        if (expectedIncome === 0 && householdSettings) {
            expectedIncome = householdSettings.monthlyIncome;
            usedSettings = true;
            assumptions.push({
                field: "expectedIncomeCents",
                source: "HOUSEHOLD_SETTINGS",
                description: "Income from household settings — no recurring income pattern detected",
                confidence: 0.30,
            });
        }
        if (expectedEssential === 0 && expectedDiscretionary === 0 && householdSettings) {
            expectedEssential = settingsEssential;
            expectedDiscretionary = settingsDiscretionary;
            usedSettings = true;
            assumptions.push({
                field: "expectedEssentialExpensesCents",
                source: "HOUSEHOLD_SETTINGS",
                description: "Expenses from household settings — no patterns or budget detected",
                confidence: 0.30,
            });
        }
        // ── Goals funding ─────────────────────────────────────────────────────
        const goalsFundingCents = currentMonthBudgets
            .filter(b => b.goalId)
            .reduce((s, b) => s + b.amountCents, 0);
        // ── Final projection ──────────────────────────────────────────────────
        const monthlySurplus = expectedIncome - expectedEssential - expectedDiscretionary;
        const confirmedExpenses = confirmedEssentialCents + confirmedDiscretionaryCents;
        const remainingIncome = expectedIncome - confirmedIncomeCents;
        const remainingExpenses = (expectedEssential + expectedDiscretionary) - confirmedExpenses;
        const projectedEndingCash = liquidCashCents + remainingIncome - remainingExpenses;
        const confidence = determineConfidence(historyMonthCount, historicalPatterns, usedSettings);
        return {
            householdId,
            asOf,
            period: { year, month },
            startingCashCents: liquidCashCents,
            confirmedIncomeCents: confirmedIncomeCents,
            expectedIncomeCents: expectedIncome,
            expectedEssentialExpensesCents: expectedEssential,
            expectedDiscretionaryExpensesCents: expectedDiscretionary,
            expectedGoalsFundingCents: goalsFundingCents,
            projectedEndingCashCents: projectedEndingCash,
            monthlySurplusCents: monthlySurplus,
            confidence,
            assumptions,
            calculatedAt,
            calculationVersion: exports.CASHFLOW_CALCULATION_VERSION,
        };
    }
    /**
     * Produce a short-term forecast for the next N calendar months
     * starting from the month following asOf's current month.
     */
    calculateForecast(input) {
        const { householdId, asOf, liquidCashCents, allTransactions, historicalPatterns, budgetsByMonth, householdSettings, historyMonthCount, forecastMonths, } = input;
        const calculatedAt = new Date();
        const currentYear = asOf.getFullYear();
        const currentMonth = asOf.getMonth() + 1;
        // Current month projection is month 0 of the series
        const currentMonthTxs = allTransactions.filter(tx => inMonth(tx, currentYear, currentMonth));
        const currentMonthBudgets = budgetsByMonth.get(periodKey(currentYear, currentMonth)) ?? [];
        const currentProjection = this.calculateCurrentProjection({
            householdId,
            asOf,
            liquidCashCents,
            currentMonthTransactions: currentMonthTxs,
            historicalPatterns,
            currentMonthBudgets,
            householdSettings,
            historyMonthCount,
        });
        const months = [currentProjection];
        let rollingCash = currentProjection.projectedEndingCashCents;
        for (let i = 1; i <= forecastMonths; i++) {
            // Advance the calendar month
            let fYear = currentYear;
            let fMonth = currentMonth + i;
            while (fMonth > 12) {
                fMonth -= 12;
                fYear++;
            }
            const futureBudgets = budgetsByMonth.get(periodKey(fYear, fMonth)) ?? [];
            const futureAsOf = new Date(fYear, fMonth - 1, 1); // first of month
            // For a future month, there are no confirmed transactions
            const projection = this.calculateCurrentProjection({
                householdId,
                asOf: futureAsOf,
                liquidCashCents: rollingCash,
                currentMonthTransactions: [], // no actuals yet
                historicalPatterns,
                currentMonthBudgets: futureBudgets,
                householdSettings,
                historyMonthCount,
            });
            months.push(projection);
            rollingCash = projection.projectedEndingCashCents;
        }
        // Overall confidence = worst confidence across all projected months
        const confidencePriority = {
            [contracts_1.ForecastConfidence.HIGH]: 2,
            [contracts_1.ForecastConfidence.MEDIUM]: 1,
            [contracts_1.ForecastConfidence.LOW]: 0,
        };
        const overallConfidence = months.reduce((worst, m) => {
            return confidencePriority[m.confidence] < confidencePriority[worst] ? m.confidence : worst;
        }, contracts_1.ForecastConfidence.HIGH);
        return {
            householdId,
            startingCashCents: liquidCashCents,
            months,
            overallConfidence,
            calculatedAt,
            calculationVersion: exports.CASHFLOW_CALCULATION_VERSION,
        };
    }
}
exports.CashFlowService = CashFlowService;
function createCashFlowService() {
    return new CashFlowService();
}
//# sourceMappingURL=cash-flow-service.js.map