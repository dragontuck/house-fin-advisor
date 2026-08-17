"use strict";
/**
 * Snapshot History — builds version-stamped historical views from persisted financial snapshots.
 *
 * Rule: historical values are NEVER recomputed from current rules.
 * Each SnapshotHistoryPoint carries the calculationVersion and calculatedAt of the
 * original snapshot so results remain reproducible as rules evolve.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SNAPSHOT_HISTORY_VERSION = void 0;
exports.buildSnapshotExplanation = buildSnapshotExplanation;
exports.buildSnapshotHistory = buildSnapshotHistory;
exports.buildSurplusExplanationText = buildSurplusExplanationText;
exports.SNAPSHOT_HISTORY_VERSION = 1;
// ── Local formatting helper (no external dependencies) ───────────────────────
function fmt(cents) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(cents / 100);
}
// ── Per-metric explanation builders ──────────────────────────────────────────
function buildIncomeExplanation(s) {
    return {
        summary: `${fmt(s.monthlyIncome)} household monthly income`,
        inputs: [{ label: "Monthly income", valueCents: s.monthlyIncome }],
        assumptions: ["Income is from household settings recorded at the time of this snapshot."],
        source: "financial_snapshot",
        calculationVersion: s.version,
        calculatedAt: s.calculatedAt,
        snapshotId: s.id,
    };
}
function buildExpensesExplanation(s) {
    return {
        summary: `${fmt(s.monthlyEssentialExpenses)} essential plus ${fmt(s.monthlyDiscretionaryExpenses)} discretionary spending`,
        inputs: [
            { label: "Essential expenses", valueCents: s.monthlyEssentialExpenses },
            { label: "Discretionary expenses", valueCents: s.monthlyDiscretionaryExpenses },
        ],
        assumptions: ["Expense values are from household settings recorded at the time of this snapshot."],
        source: "financial_snapshot",
        calculationVersion: s.version,
        calculatedAt: s.calculatedAt,
        snapshotId: s.id,
    };
}
function buildSurplusExplanation(s) {
    return {
        summary: `${fmt(s.monthlyIncome)} income minus ${fmt(s.monthlyEssentialExpenses)} essential and ${fmt(s.monthlyDiscretionaryExpenses)} discretionary spending`,
        inputs: [
            { label: "Monthly income", valueCents: s.monthlyIncome },
            { label: "Essential expenses", valueCents: s.monthlyEssentialExpenses },
            { label: "Discretionary expenses", valueCents: s.monthlyDiscretionaryExpenses },
        ],
        assumptions: ["All values are from household settings recorded at the time of this snapshot."],
        source: "financial_snapshot",
        calculationVersion: s.version,
        calculatedAt: s.calculatedAt,
        snapshotId: s.id,
    };
}
function buildDebtExplanation(s) {
    return {
        summary: `${fmt(s.debt)} total outstanding debt`,
        inputs: [{ label: "Total debt", valueCents: s.debt }],
        assumptions: [
            "Debt is the sum of balances on credit card, loan, and mortgage accounts at the time of this snapshot.",
        ],
        source: "financial_snapshot",
        calculationVersion: s.version,
        calculatedAt: s.calculatedAt,
        snapshotId: s.id,
    };
}
// ── Public exports ────────────────────────────────────────────────────────────
/**
 * Build full explainability for all metrics in a single snapshot.
 * Pure function — no side effects.
 */
function buildSnapshotExplanation(snapshot) {
    return {
        income: buildIncomeExplanation(snapshot),
        expenses: buildExpensesExplanation(snapshot),
        surplus: buildSurplusExplanation(snapshot),
        debt: buildDebtExplanation(snapshot),
    };
}
/**
 * Build a version-stamped history from an array of persisted snapshots.
 *
 * - One point per calendar month; when multiple snapshots share a month the
 *   most recently calculated one wins.
 * - Result is sorted ascending by period.
 * - calculationVersion and calculatedAt on each point come from the original
 *   snapshot and are NEVER replaced with current values.
 */
function buildSnapshotHistory(householdId, snapshots) {
    const byMonth = new Map();
    for (const s of snapshots) {
        const d = new Date(s.asOf);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        const existing = byMonth.get(key);
        // Prefer the snapshot calculated most recently within the month.
        if (!existing || new Date(s.calculatedAt) > new Date(existing.calculatedAt)) {
            byMonth.set(key, s);
        }
    }
    const months = Array.from(byMonth.values())
        .sort((a, b) => new Date(a.asOf).getTime() - new Date(b.asOf).getTime())
        .map(s => {
        const d = new Date(s.asOf);
        const period = { year: d.getFullYear(), month: d.getMonth() + 1 };
        return {
            snapshotId: s.id,
            period,
            asOf: s.asOf,
            calculationVersion: s.version,
            calculatedAt: s.calculatedAt,
            incomeCents: s.monthlyIncome,
            essentialExpensesCents: s.monthlyEssentialExpenses,
            discretionaryExpensesCents: s.monthlyDiscretionaryExpenses,
            surplusCents: s.monthlySurplus,
            debtCents: s.debt,
            netWorthCents: s.netWorth,
            cashCents: s.cash,
            explanation: buildSnapshotExplanation(s),
        };
    });
    return { householdId, months, calculatedAt: new Date() };
}
/**
 * Build the surplus explanation string used in the financial-pulse response.
 * Exported separately so server.ts can build it without importing the full history.
 */
function buildSurplusExplanationText(snapshot) {
    return buildSurplusExplanation(snapshot).summary;
}
//# sourceMappingURL=snapshot-history.js.map