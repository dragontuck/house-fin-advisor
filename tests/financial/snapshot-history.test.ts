/**
 * Tests for snapshot history domain logic.
 *
 * Rules enforced:
 * - Historical values are NEVER recomputed from current rules.
 * - calculationVersion and calculatedAt come from the original snapshot.
 * - Most recent snapshot per calendar month wins on deduplication.
 */

import { buildSnapshotExplanation, buildSnapshotHistory, SNAPSHOT_HISTORY_VERSION } from "../../packages/domain/snapshot-history";
import { FinancialSnapshot, FinancialHealthStatus } from "@house-fin/contracts";
import { EntityId } from "@house-fin/contracts";

// ── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSnapshot(overrides: Record<string, any> = {}): FinancialSnapshot {
    return {
        id: "snapshot-1" as EntityId,
        householdId: "household-1" as EntityId,
        asOf: "2024-01-31" as unknown as Date,
        version: 1,
        cash: 500000 as any,
        debt: 1000000 as any,
        netWorth: -500000 as any,
        monthlyIncome: 700000 as any,
        monthlyEssentialExpenses: 300000 as any,
        monthlyDiscretionaryExpenses: 150000 as any,
        monthlySurplus: 250000 as any,
        financialHealthStatus: FinancialHealthStatus.HEALTHY,
        calculatedAt: "2024-01-31T12:00:00Z" as unknown as Date,
        createdAt: "2024-01-31T12:00:00Z" as unknown as Date,
        ...overrides,
    } as FinancialSnapshot;
}

const HH_ID = "household-1" as EntityId;

// ── buildSnapshotExplanation ──────────────────────────────────────────────────

describe("buildSnapshotExplanation", () => {
    it("surplus summary contains income, essential and discretionary values", () => {
        const s = makeSnapshot({});
        const { surplus } = buildSnapshotExplanation(s);
        expect(surplus.summary).toContain("$7,000");   // income
        expect(surplus.summary).toContain("$3,000");   // essential
        expect(surplus.summary).toContain("$1,500");   // discretionary
    });

    it("income inputs has one entry for monthly income", () => {
        const s = makeSnapshot({});
        const { income } = buildSnapshotExplanation(s);
        expect(income.inputs).toHaveLength(1);
        expect(income.inputs[0].label).toBe("Monthly income");
        expect(income.inputs[0].valueCents).toBe(700000);
    });

    it("expenses inputs has two entries: essential and discretionary", () => {
        const s = makeSnapshot({});
        const { expenses } = buildSnapshotExplanation(s);
        expect(expenses.inputs).toHaveLength(2);
        expect(expenses.inputs[0].label).toBe("Essential expenses");
        expect(expenses.inputs[1].label).toBe("Discretionary expenses");
    });

    it("surplus inputs has three entries", () => {
        const s = makeSnapshot({});
        const { surplus } = buildSnapshotExplanation(s);
        expect(surplus.inputs).toHaveLength(3);
    });

    it("debt inputs has one entry for total debt", () => {
        const s = makeSnapshot({});
        const { debt } = buildSnapshotExplanation(s);
        expect(debt.inputs).toHaveLength(1);
        expect(debt.inputs[0].label).toBe("Total debt");
        expect(debt.inputs[0].valueCents).toBe(1000000);
    });

    it("source is always financial_snapshot", () => {
        const s = makeSnapshot({});
        const expl = buildSnapshotExplanation(s);
        expect(expl.income.source).toBe("financial_snapshot");
        expect(expl.expenses.source).toBe("financial_snapshot");
        expect(expl.surplus.source).toBe("financial_snapshot");
        expect(expl.debt.source).toBe("financial_snapshot");
    });

    it("preserves snapshot calculationVersion (not SNAPSHOT_HISTORY_VERSION)", () => {
        const s = makeSnapshot({ version: 42 });
        const expl = buildSnapshotExplanation(s);
        expect(expl.income.calculationVersion).toBe(42);
        expect(expl.surplus.calculationVersion).toBe(42);
        // Must not silently replace with current version
        expect(expl.income.calculationVersion).toBe(42);
        expect(42).not.toBe(SNAPSHOT_HISTORY_VERSION);
    });

    it("preserves snapshot calculatedAt timestamp", () => {
        const ts = "2023-06-15T08:30:00Z";
        const s = makeSnapshot({ calculatedAt: ts });
        const { surplus } = buildSnapshotExplanation(s);
        expect(surplus.calculatedAt).toBe(ts);
    });

    it("snapshotId matches the snapshot id", () => {
        const s = makeSnapshot({ id: "abc-123" });
        const { income } = buildSnapshotExplanation(s);
        expect(income.snapshotId).toBe("abc-123");
    });
});

// ── buildSnapshotHistory ──────────────────────────────────────────────────────

describe("buildSnapshotHistory", () => {
    it("empty array returns empty months list", () => {
        const result = buildSnapshotHistory(HH_ID, []);
        expect(result.months).toHaveLength(0);
        expect(result.householdId).toBe(HH_ID);
    });

    it("single snapshot produces one history point", () => {
        const result = buildSnapshotHistory(HH_ID, [makeSnapshot({})]);
        expect(result.months).toHaveLength(1);
    });

    it("sorts points ascending by period", () => {
        const a = makeSnapshot({ id: "a", asOf: "2024-03-31", calculatedAt: "2024-03-31T00:00:00Z" });
        const b = makeSnapshot({ id: "b", asOf: "2024-01-31", calculatedAt: "2024-01-31T00:00:00Z" });
        const c = makeSnapshot({ id: "c", asOf: "2024-02-28", calculatedAt: "2024-02-28T00:00:00Z" });
        const result = buildSnapshotHistory(HH_ID, [a, b, c]);
        const months = result.months.map(m => m.period.month);
        expect(months).toEqual([1, 2, 3]);
    });

    it("preserves original calculationVersion — v1 stays v1, v2 stays v2", () => {
        const s1 = makeSnapshot({ id: "s1", asOf: "2024-01-31", version: 1, calculatedAt: "2024-01-31T00:00:00Z" });
        const s2 = makeSnapshot({ id: "s2", asOf: "2024-02-28", version: 2, calculatedAt: "2024-02-28T00:00:00Z" });
        const result = buildSnapshotHistory(HH_ID, [s1, s2]);
        expect(result.months[0].calculationVersion).toBe(1);
        expect(result.months[1].calculationVersion).toBe(2);
    });

    it("does NOT replace any snapshot version with SNAPSHOT_HISTORY_VERSION", () => {
        const oldVersion = 99;
        const s = makeSnapshot({ version: oldVersion });
        const result = buildSnapshotHistory(HH_ID, [s]);
        expect(result.months[0].calculationVersion).toBe(oldVersion);
        // SNAPSHOT_HISTORY_VERSION is 1; oldVersion is 99 — they must differ
        expect(oldVersion).not.toBe(SNAPSHOT_HISTORY_VERSION);
    });

    it("deduplicates: two snapshots same month — most recently calculated wins", () => {
        const older = makeSnapshot({
            id: "older",
            asOf: "2024-01-15",
            calculatedAt: "2024-01-15T10:00:00Z",
            monthlyIncome: 600000 as any,
        });
        const newer = makeSnapshot({
            id: "newer",
            asOf: "2024-01-31",
            calculatedAt: "2024-01-31T18:00:00Z",
            monthlyIncome: 700000 as any,
        });
        const result = buildSnapshotHistory(HH_ID, [older, newer]);
        expect(result.months).toHaveLength(1);
        expect(result.months[0].snapshotId).toBe("newer");
        expect(result.months[0].incomeCents).toBe(700000);
    });

    it("deduplication: earlier calculatedAt does NOT win", () => {
        const early = makeSnapshot({
            id: "early",
            asOf: "2024-06-10",
            calculatedAt: "2024-06-01T00:00:00Z",
        });
        const late = makeSnapshot({
            id: "late",
            asOf: "2024-06-28",
            calculatedAt: "2024-06-28T23:59:59Z",
        });
        const result = buildSnapshotHistory(HH_ID, [early, late]);
        expect(result.months[0].snapshotId).toBe("late");
    });

    it("derives period year and month from asOf date", () => {
        const s = makeSnapshot({ asOf: "2023-11-15", calculatedAt: "2023-11-15T00:00:00Z" });
        const result = buildSnapshotHistory(HH_ID, [s]);
        expect(result.months[0].period.year).toBe(2023);
        expect(result.months[0].period.month).toBe(11);
    });

    it("maps metric values from snapshot correctly", () => {
        const s = makeSnapshot({
            monthlyIncome: 700000 as any,
            monthlyEssentialExpenses: 300000 as any,
            monthlyDiscretionaryExpenses: 150000 as any,
            monthlySurplus: 250000 as any,
            debt: 1000000 as any,
            netWorth: 2000000 as any,
            cash: 500000 as any,
        });
        const result = buildSnapshotHistory(HH_ID, [s]);
        const p = result.months[0];
        expect(p.incomeCents).toBe(700000);
        expect(p.essentialExpensesCents).toBe(300000);
        expect(p.discretionaryExpensesCents).toBe(150000);
        expect(p.surplusCents).toBe(250000);
        expect(p.debtCents).toBe(1000000);
        expect(p.netWorthCents).toBe(2000000);
        expect(p.cashCents).toBe(500000);
    });

    it("explanation.surplus.inputs has 3 entries per point", () => {
        const s = makeSnapshot({});
        const result = buildSnapshotHistory(HH_ID, [s]);
        expect(result.months[0].explanation.surplus.inputs).toHaveLength(3);
    });

    it("preserves calculatedAt from original snapshot — not overwritten", () => {
        const ts = "2023-07-01T06:00:00Z";
        const s = makeSnapshot({ calculatedAt: ts });
        const result = buildSnapshotHistory(HH_ID, [s]);
        expect(result.months[0].calculatedAt).toBe(ts);
    });

    it("VERSION CHANGE: v1 and v2 snapshots coexist with distinct versions", () => {
        const v1 = makeSnapshot({ id: "v1snap", asOf: "2024-01-31", version: 1, calculatedAt: "2024-01-31T00:00:00Z" });
        const v2 = makeSnapshot({ id: "v2snap", asOf: "2024-02-28", version: 2, calculatedAt: "2024-02-28T00:00:00Z" });
        const result = buildSnapshotHistory(HH_ID, [v1, v2]);
        const versions = result.months.map(m => m.calculationVersion);
        expect(versions).toContain(1);
        expect(versions).toContain(2);
    });
});
