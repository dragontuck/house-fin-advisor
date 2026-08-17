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

import {
    EntityId,
    Money,
    Budget,
    HouseholdSettings,
    BudgetPeriod,
    RecurringPattern,
    RecurringFrequency,
    CashFlowProjection,
    MonthlyCashFlow,
    CashFlowHistory,
    ShortTermForecast,
    ForecastConfidence,
    ForecastAssumption,
} from "@house-fin/contracts";
import { CashFlowTransaction } from "./recurring-detector";

export const CASHFLOW_CALCULATION_VERSION = 1;

/** Categories considered essential expenses for essential/discretionary splitting. */
export const ESSENTIAL_CATEGORIES = new Set([
    "HOUSING", "UTILITIES", "GROCERIES", "HEALTHCARE", "INSURANCE",
    "CHILDCARE", "EDUCATION", "TRANSPORTATION", "FUEL", "DEBT_PAYMENT",
]);

// ── Input types ──────────────────────────────────────────────────────────────

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
    forecastMonths: number; // how many months ahead to project (1–12)
}

// ── Private helpers ──────────────────────────────────────────────────────────

function periodKey(year: number, month: number): string {
    return `${year}-${month}`;
}

/** True when a transaction falls within the given calendar month. */
function inMonth(tx: CashFlowTransaction, year: number, month: number): boolean {
    const d = tx.transactionDate;
    return d.getFullYear() === year && d.getMonth() + 1 === month;
}

/** True when the pattern's merchant has already appeared in currentMonthTxs for this month. */
function hasPatternFiredInMonth(
    pattern: RecurringPattern,
    currentMonthTxs: CashFlowTransaction[],
    year: number,
    month: number,
): boolean {
    const normTarget = normalizeMerchant(pattern.merchant);
    return currentMonthTxs.some(tx =>
        tx.direction === pattern.direction &&
        inMonth(tx, year, month) &&
        normalizeMerchant(tx.merchant) === normTarget,
    );
}

function normalizeMerchant(s: string): string {
    return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Split an expense amount into essential/discretionary using category info. */
function splitExpense(
    amountCents: number,
    category: string | null,
    settingsEssential: number,
    settingsDiscretionary: number,
): { essential: number; discretionary: number } {
    if (category && ESSENTIAL_CATEGORIES.has(category)) {
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

function sumIncome(txs: CashFlowTransaction[]): number {
    return txs
        .filter(t => t.direction === "CREDIT")
        .reduce((s, t) => s + Math.abs(t.amountCents), 0);
}

function sumExpenses(txs: CashFlowTransaction[]): number {
    return txs
        .filter(t => t.direction === "DEBIT" && t.amountCents > 0)
        .reduce((s, t) => s + t.amountCents, 0);
}

function determineConfidence(
    historyMonthCount: number,
    patterns: RecurringPattern[],
    usedSettings: boolean,
): ForecastConfidence {
    if (historyMonthCount < 2) return ForecastConfidence.LOW;

    const highConfidencePatterns = patterns.filter(p => p.confidence >= 0.6);
    const hasIncomePattern = highConfidencePatterns.some(p => p.direction === "CREDIT");
    const hasExpensePattern = highConfidencePatterns.some(p => p.direction === "DEBIT");

    if (historyMonthCount >= 3 && hasIncomePattern && hasExpensePattern && !usedSettings) {
        return ForecastConfidence.HIGH;
    }
    return ForecastConfidence.MEDIUM;
}

// ── Public service ────────────────────────────────────────────────────────────

export class CashFlowService {
    /**
     * Summarise historical cash flow month-by-month.
     * Only complete calendar months are marked isComplete = true.
     */
    calculateHistory(input: HistoryCashFlowInput): CashFlowHistory {
        const { householdId, asOf, transactions } = input;
        const calculatedAt = new Date();

        // Bucket transactions by calendar month
        const byMonth = new Map<string, CashFlowTransaction[]>();
        for (const tx of transactions) {
            const y = tx.transactionDate.getFullYear();
            const m = tx.transactionDate.getMonth() + 1;
            const k = periodKey(y, m);
            const bucket = byMonth.get(k);
            if (bucket) bucket.push(tx);
            else byMonth.set(k, [tx]);
        }

        const currentYear = asOf.getFullYear();
        const currentMonth = asOf.getMonth() + 1;

        const months: MonthlyCashFlow[] = [...byMonth.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, txs]) => {
                const [y, m] = key.split("-").map(Number);
                const income = sumIncome(txs) as Money;
                const expenses = sumExpenses(txs) as Money;
                return {
                    period: { year: y, month: m },
                    incomeCents: income,
                    expensesCents: expenses,
                    surplusCents: (income - expenses) as Money,
                    transactionCount: txs.length,
                    isComplete: !(y === currentYear && m === currentMonth),
                };
            });

        const completedMonths = months.filter(m => m.isComplete);
        const count = completedMonths.length || 1;
        const avgIncome = Math.round(
            completedMonths.reduce((s, m) => s + m.incomeCents, 0) / count,
        ) as Money;
        const avgExpenses = Math.round(
            completedMonths.reduce((s, m) => s + m.expensesCents, 0) / count,
        ) as Money;

        return {
            householdId,
            months,
            averageMonthlyIncomeCents: avgIncome,
            averageMonthlyExpensesCents: avgExpenses,
            averageMonthlySurplusCents: (avgIncome - avgExpenses) as Money,
            calculatedAt,
        };
    }

    /**
     * Project the current calendar month's cash flow.
     * Uses confirmed transactions + recurring patterns + budget + settings (in that priority).
     */
    calculateCurrentProjection(input: CashFlowProjectionInput): CashFlowProjection {
        const {
            householdId,
            asOf,
            liquidCashCents,
            currentMonthTransactions,
            historicalPatterns,
            currentMonthBudgets,
            householdSettings,
            historyMonthCount,
        } = input;

        const year = asOf.getFullYear();
        const month = asOf.getMonth() + 1;
        const calculatedAt = new Date();
        const assumptions: ForecastAssumption[] = [];

        const settingsEssential = householdSettings?.monthlyEssentialExpenses ?? 0;
        const settingsDiscretionary = householdSettings?.monthlyDiscretionaryExpenses ?? 0;

        // ── Confirmed amounts (already posted this month) ────────────────────
        const confirmedIncomeCents = sumIncome(currentMonthTransactions);

        let confirmedEssentialCents = 0;
        let confirmedDiscretionaryCents = 0;
        for (const tx of currentMonthTransactions.filter(t => t.direction === "DEBIT" && t.amountCents > 0)) {
            const { essential, discretionary } = splitExpense(
                tx.amountCents, tx.category, settingsEssential, settingsDiscretionary,
            );
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
                const { essential, discretionary } = splitExpense(
                    pattern.typicalAmountCents,
                    pattern.mostCommonCategory,
                    settingsEssential,
                    settingsDiscretionary,
                );
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
            .filter(b => ESSENTIAL_CATEGORIES.has(b.category))
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
            startingCashCents: liquidCashCents as Money,
            confirmedIncomeCents: confirmedIncomeCents as Money,
            expectedIncomeCents: expectedIncome as Money,
            expectedEssentialExpensesCents: expectedEssential as Money,
            expectedDiscretionaryExpensesCents: expectedDiscretionary as Money,
            expectedGoalsFundingCents: goalsFundingCents as Money,
            projectedEndingCashCents: projectedEndingCash as Money,
            monthlySurplusCents: monthlySurplus as Money,
            confidence,
            assumptions,
            calculatedAt,
            calculationVersion: CASHFLOW_CALCULATION_VERSION,
        };
    }

    /**
     * Produce a short-term forecast for the next N calendar months
     * starting from the month following asOf's current month.
     */
    calculateForecast(input: ForecastInput): ShortTermForecast {
        const {
            householdId,
            asOf,
            liquidCashCents,
            allTransactions,
            historicalPatterns,
            budgetsByMonth,
            householdSettings,
            historyMonthCount,
            forecastMonths,
        } = input;

        const calculatedAt = new Date();
        const currentYear = asOf.getFullYear();
        const currentMonth = asOf.getMonth() + 1;

        // Current month projection is month 0 of the series
        const currentMonthTxs = allTransactions.filter(
            tx => inMonth(tx, currentYear, currentMonth),
        );
        const currentMonthBudgets = budgetsByMonth.get(
            periodKey(currentYear, currentMonth),
        ) ?? [];

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

        const months: CashFlowProjection[] = [currentProjection];
        let rollingCash = currentProjection.projectedEndingCashCents;

        for (let i = 1; i <= forecastMonths; i++) {
            // Advance the calendar month
            let fYear = currentYear;
            let fMonth = currentMonth + i;
            while (fMonth > 12) { fMonth -= 12; fYear++; }

            const futureBudgets = budgetsByMonth.get(periodKey(fYear, fMonth)) ?? [];
            const futureAsOf = new Date(fYear, fMonth - 1, 1); // first of month

            // For a future month, there are no confirmed transactions
            const projection = this.calculateCurrentProjection({
                householdId,
                asOf: futureAsOf,
                liquidCashCents: rollingCash,
                currentMonthTransactions: [],  // no actuals yet
                historicalPatterns,
                currentMonthBudgets: futureBudgets,
                householdSettings,
                historyMonthCount,
            });

            months.push(projection);
            rollingCash = projection.projectedEndingCashCents;
        }

        // Overall confidence = worst confidence across all projected months
        const confidencePriority: Record<ForecastConfidence, number> = {
            [ForecastConfidence.HIGH]: 2,
            [ForecastConfidence.MEDIUM]: 1,
            [ForecastConfidence.LOW]: 0,
        };
        const overallConfidence = months.reduce<ForecastConfidence>((worst, m) => {
            return confidencePriority[m.confidence] < confidencePriority[worst] ? m.confidence : worst;
        }, ForecastConfidence.HIGH);

        return {
            householdId,
            startingCashCents: liquidCashCents as Money,
            months,
            overallConfidence,
            calculatedAt,
            calculationVersion: CASHFLOW_CALCULATION_VERSION,
        };
    }
}

export function createCashFlowService(): CashFlowService {
    return new CashFlowService();
}
