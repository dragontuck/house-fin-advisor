/**
 * Unit tests for BudgetService
 *
 * Tests cover:
 * - Exact budget match
 * - Underspending (on track)
 * - Overspending (over budget)
 * - Zero budget with transactions
 * - Budget with no transactions (NO_SPENDING)
 * - Transactions with no budget (UNBUDGETED)
 * - Refund / credit transactions reducing actual spend
 * - Month boundary handling (past, current, future periods)
 * - Projected month-end calculations
 * - Multi-category result sets
 * - Determinism (same inputs → same outputs)
 */

import { BudgetService, BudgetTransaction, createBudgetService } from "@house-fin/domain";
import {
    Budget,
    BudgetStatus,
    EntityId,
    Money,
    MoneyFromDollars,
} from "@house-fin/contracts";

// ── helpers ──────────────────────────────────────────────────────────────────

const HH_ID = EntityId("f47ac10b-0000-0000-0000-000000000001");

function makeBudget(
    category: string,
    amountDollars: number,
    year = 2026,
    month = 8
): Budget {
    return {
        id: EntityId(`budget-${category}`),
        householdId: HH_ID,
        periodYear: year,
        periodMonth: month,
        category,
        amountCents: MoneyFromDollars(amountDollars),
        version: 1,
        createdAt: new Date("2026-08-01T00:00:00Z"),
        updatedAt: new Date("2026-08-01T00:00:00Z"),
    };
}

function makeTx(
    id: string,
    category: string | null,
    amountDollars: number,
    date = "2026-08-10"
): BudgetTransaction {
    return {
        id,
        category,
        amountCents: MoneyFromDollars(amountDollars),
        transactionDate: new Date(date),
    };
}

// asOf mid-month: day 16 of a 31-day month
const MID_AUGUST = new Date("2026-08-16T12:00:00Z");
// asOf on day 1
const FIRST_OF_AUGUST = new Date("2026-08-01T00:00:00Z");
// Period is fully in the past
const AFTER_AUGUST = new Date("2026-09-15T12:00:00Z");
// Period hasn't started yet
const BEFORE_AUGUST = new Date("2026-07-31T23:59:00Z");

// ── tests ─────────────────────────────────────────────────────────────────────

describe("BudgetService", () => {
    let service: BudgetService;

    beforeEach(() => {
        service = createBudgetService();
    });

    // ── exact match ──────────────────────────────────────────────────────────

    it("exact match: actual equals planned → ON_TRACK, zero variance", () => {
        const result = service.calculateResults({
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [makeBudget("GROCERIES", 400)],
            transactions: [makeTx("t1", "GROCERIES", 400)],
            asOf: AFTER_AUGUST,
        });

        const groceries = result.results.find(r => r.category === "GROCERIES")!;
        expect(groceries.actualCents).toBe(MoneyFromDollars(400));
        expect(groceries.plannedCents).toBe(MoneyFromDollars(400));
        expect(groceries.varianceCents).toBe(0);
        expect(groceries.remainingCents).toBe(0);
        expect(groceries.status).toBe(BudgetStatus.ON_TRACK);
        expect(groceries.hasBudget).toBe(true);
        expect(groceries.transactionCount).toBe(1);
    });

    // ── underspending ────────────────────────────────────────────────────────

    it("underspending: actual < planned → ON_TRACK, positive remaining", () => {
        const result = service.calculateResults({
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [makeBudget("DINING_OUT", 200)],
            transactions: [
                makeTx("t1", "DINING_OUT", 45),
                makeTx("t2", "DINING_OUT", 30),
            ],
            asOf: AFTER_AUGUST,
        });

        const dining = result.results.find(r => r.category === "DINING_OUT")!;
        expect(dining.actualCents).toBe(MoneyFromDollars(75));
        expect(dining.remainingCents).toBe(MoneyFromDollars(125));
        expect(dining.varianceCents).toBe(MoneyFromDollars(-125));
        expect(dining.variancePercent).toBeCloseTo(-62.5);
        expect(dining.status).toBe(BudgetStatus.ON_TRACK);
    });

    // ── overspending ─────────────────────────────────────────────────────────

    it("overspending: actual > planned → OVER_BUDGET, negative remaining", () => {
        const result = service.calculateResults({
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [makeBudget("ENTERTAINMENT", 50)],
            transactions: [
                makeTx("t1", "ENTERTAINMENT", 80),
                makeTx("t2", "ENTERTAINMENT", 40),
            ],
            asOf: AFTER_AUGUST,
        });

        const ent = result.results.find(r => r.category === "ENTERTAINMENT")!;
        expect(ent.actualCents).toBe(MoneyFromDollars(120));
        expect(ent.plannedCents).toBe(MoneyFromDollars(50));
        expect(ent.remainingCents).toBe(MoneyFromDollars(-70));
        expect(ent.varianceCents).toBe(MoneyFromDollars(70));
        expect(ent.variancePercent).toBeCloseTo(140);
        expect(ent.status).toBe(BudgetStatus.OVER_BUDGET);
    });

    // ── zero budget ──────────────────────────────────────────────────────────

    it("zero budget with transactions → OVER_BUDGET, variancePercent null", () => {
        const result = service.calculateResults({
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [makeBudget("CLOTHING", 0)],
            transactions: [makeTx("t1", "CLOTHING", 35)],
            asOf: AFTER_AUGUST,
        });

        const clothing = result.results.find(r => r.category === "CLOTHING")!;
        expect(clothing.plannedCents).toBe(0);
        expect(clothing.actualCents).toBe(MoneyFromDollars(35));
        expect(clothing.varianceCents).toBe(MoneyFromDollars(35));
        expect(clothing.variancePercent).toBeNull();
        expect(clothing.status).toBe(BudgetStatus.OVER_BUDGET);
    });

    // ── no transactions ──────────────────────────────────────────────────────

    it("budget defined, no transactions → NO_SPENDING", () => {
        const result = service.calculateResults({
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [makeBudget("HEALTHCARE", 150)],
            transactions: [],
            asOf: AFTER_AUGUST,
        });

        const health = result.results.find(r => r.category === "HEALTHCARE")!;
        expect(health.actualCents).toBe(0);
        expect(health.remainingCents).toBe(MoneyFromDollars(150));
        expect(health.varianceCents).toBe(MoneyFromDollars(-150));
        expect(health.status).toBe(BudgetStatus.NO_SPENDING);
        expect(health.transactionCount).toBe(0);
    });

    // ── unbudgeted category ──────────────────────────────────────────────────

    it("transactions present, no budget defined → UNBUDGETED, variancePercent null", () => {
        const result = service.calculateResults({
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [],
            transactions: [makeTx("t1", "FUEL", 65)],
            asOf: AFTER_AUGUST,
        });

        const fuel = result.results.find(r => r.category === "FUEL")!;
        expect(fuel.hasBudget).toBe(false);
        expect(fuel.plannedCents).toBe(0);
        expect(fuel.actualCents).toBe(MoneyFromDollars(65));
        expect(fuel.status).toBe(BudgetStatus.UNBUDGETED);
        expect(fuel.variancePercent).toBeNull();
    });

    // ── refund / credit transaction ──────────────────────────────────────────

    it("credit/refund transaction reduces actual spend", () => {
        const result = service.calculateResults({
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [makeBudget("CLOTHING", 100)],
            transactions: [
                makeTx("t1", "CLOTHING", 80),       // debit: positive
                makeTx("t2", "CLOTHING", -30),       // credit/refund: negative
            ],
            asOf: AFTER_AUGUST,
        });

        const clothing = result.results.find(r => r.category === "CLOTHING")!;
        // Net: 80 − 30 = 50
        expect(clothing.actualCents).toBe(MoneyFromDollars(50));
        expect(clothing.remainingCents).toBe(MoneyFromDollars(50));
        expect(clothing.status).toBe(BudgetStatus.ON_TRACK);
        expect(clothing.transactionCount).toBe(2);
    });

    // ── projected month-end ──────────────────────────────────────────────────

    it("projects month-end spend linearly when asOf is mid-month", () => {
        // Day 16 of August (31 days); $160 spent so far → project $310 by end
        // ceil(160 * 31 / 16) = ceil(310) = 310
        const result = service.calculateResults({
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [makeBudget("GROCERIES", 500)],
            transactions: [makeTx("t1", "GROCERIES", 160)],
            asOf: MID_AUGUST, // day 16
        });

        const groceries = result.results.find(r => r.category === "GROCERIES")!;
        expect(groceries.projectedMonthEndCents).toBe(MoneyFromDollars(310));
    });

    it("projectedMonthEnd equals actual when period is closed", () => {
        const result = service.calculateResults({
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [makeBudget("GROCERIES", 500)],
            transactions: [makeTx("t1", "GROCERIES", 420)],
            asOf: AFTER_AUGUST, // past period
        });

        const groceries = result.results.find(r => r.category === "GROCERIES")!;
        expect(groceries.projectedMonthEndCents).toBe(groceries.actualCents);
    });

    it("projectedMonthEnd equals actual when period has not yet started", () => {
        const result = service.calculateResults({
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [makeBudget("GROCERIES", 500)],
            transactions: [],
            asOf: BEFORE_AUGUST, // future period
        });

        const groceries = result.results.find(r => r.category === "GROCERIES")!;
        // zero actual → projection also zero
        expect(groceries.projectedMonthEndCents).toBe(0);
    });

    it("projectedMonthEnd on day 1 with no spend returns 0", () => {
        const result = service.calculateResults({
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [makeBudget("GROCERIES", 500)],
            transactions: [],
            asOf: FIRST_OF_AUGUST, // first day, nothing spent
        });

        const groceries = result.results.find(r => r.category === "GROCERIES")!;
        expect(groceries.projectedMonthEndCents).toBe(0);
    });

    // ── month boundary ───────────────────────────────────────────────────────

    it("transactions from other months are not included by caller convention", () => {
        // The service accepts whatever transactions the caller passes.
        // Caller is responsible for filtering by period. This tests that
        // a transaction passed in is always included, confirming no double-filtering.
        const result = service.calculateResults({
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [makeBudget("UTILITIES", 200)],
            transactions: [
                makeTx("t1", "UTILITIES", 120, "2026-08-05"),
                makeTx("t2", "UTILITIES", 85, "2026-08-28"),
            ],
            asOf: AFTER_AUGUST,
        });

        const util = result.results.find(r => r.category === "UTILITIES")!;
        expect(util.actualCents).toBe(MoneyFromDollars(205));
        expect(util.status).toBe(BudgetStatus.OVER_BUDGET);
    });

    // ── multi-category result set ────────────────────────────────────────────

    it("result set totals aggregate across all categories", () => {
        const result = service.calculateResults({
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [
                makeBudget("GROCERIES", 400),
                makeBudget("DINING_OUT", 200),
            ],
            transactions: [
                makeTx("t1", "GROCERIES", 350),
                makeTx("t2", "DINING_OUT", 250), // over budget
                makeTx("t3", "FUEL", 60),         // unbudgeted
            ],
            asOf: AFTER_AUGUST,
        });

        expect(result.totalPlannedCents).toBe(MoneyFromDollars(600));
        expect(result.totalActualCents).toBe(MoneyFromDollars(660));
        expect(result.totalVarianceCents).toBe(MoneyFromDollars(60));
        expect(result.totalRemainingCents).toBe(MoneyFromDollars(-60));
        expect(result.unbudgetedSpendingCents).toBe(MoneyFromDollars(60));
        expect(result.results).toHaveLength(3);
    });

    // ── determinism ──────────────────────────────────────────────────────────

    it("same inputs produce identical outputs (deterministic)", () => {
        const input = {
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [makeBudget("GROCERIES", 400)],
            transactions: [makeTx("t1", "GROCERIES", 300)],
            asOf: AFTER_AUGUST,
        };

        const r1 = service.calculateResults(input);
        const r2 = service.calculateResults(input);

        expect(r1.results[0].actualCents).toBe(r2.results[0].actualCents);
        expect(r1.results[0].varianceCents).toBe(r2.results[0].varianceCents);
        expect(r1.results[0].status).toBe(r2.results[0].status);
        expect(r1.totalPlannedCents).toBe(r2.totalPlannedCents);
    });

    // ── new transaction added after calculation ───────────────────────────────

    it("adding a transaction to inputs changes the result correctly", () => {
        const base = {
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [makeBudget("GROCERIES", 400)],
            transactions: [makeTx("t1", "GROCERIES", 200)],
            asOf: AFTER_AUGUST,
        };

        const before = service.calculateResults(base);
        const after = service.calculateResults({
            ...base,
            transactions: [...base.transactions, makeTx("t2", "GROCERIES", 250)],
        });

        const beforeResult = before.results.find(r => r.category === "GROCERIES")!;
        const afterResult = after.results.find(r => r.category === "GROCERIES")!;

        expect(beforeResult.actualCents).toBe(MoneyFromDollars(200));
        expect(afterResult.actualCents).toBe(MoneyFromDollars(450));
        expect(afterResult.status).toBe(BudgetStatus.OVER_BUDGET);
        expect(afterResult.transactionCount).toBe(2);
    });

    // ── validation ───────────────────────────────────────────────────────────

    it("validateBudget throws on invalid month", () => {
        expect(() => service.validateBudget(2026, 13, "GROCERIES", 10000)).toThrow("month");
        expect(() => service.validateBudget(2026, 0, "GROCERIES", 10000)).toThrow("month");
    });

    it("validateBudget throws on invalid year", () => {
        expect(() => service.validateBudget(1999, 8, "GROCERIES", 10000)).toThrow("year");
    });

    it("validateBudget throws on empty category", () => {
        expect(() => service.validateBudget(2026, 8, "   ", 10000)).toThrow("category");
    });

    it("validateBudget throws on negative amount", () => {
        expect(() => service.validateBudget(2026, 8, "GROCERIES", -1)).toThrow("non-negative");
    });

    it("validateBudget accepts zero amount (zero-based budget is valid)", () => {
        expect(() => service.validateBudget(2026, 8, "GROCERIES", 0)).not.toThrow();
    });

    // ── category ordering ─────────────────────────────────────────────────────

    it("results are sorted: budgeted categories first, then alphabetically", () => {
        const result = service.calculateResults({
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [
                makeBudget("UTILITIES", 200),
                makeBudget("GROCERIES", 400),
            ],
            transactions: [
                makeTx("t1", "GROCERIES", 100),
                makeTx("t2", "FUEL", 50),          // unbudgeted
                makeTx("t3", "CHILDCARE", 800),     // unbudgeted
                makeTx("t4", "UTILITIES", 150),
            ],
            asOf: AFTER_AUGUST,
        });

        const categories = result.results.map(r => r.category);
        // GROCERIES and UTILITIES are budgeted → first two (alphabetical: G < U)
        expect(categories[0]).toBe("GROCERIES");
        expect(categories[1]).toBe("UTILITIES");
        // Then unbudgeted: CHILDCARE < FUEL
        expect(categories[2]).toBe("CHILDCARE");
        expect(categories[3]).toBe("FUEL");
    });

    // ── null-category transactions ────────────────────────────────────────────

    it("transactions with null category are not matched to any budget", () => {
        const result = service.calculateResults({
            householdId: HH_ID,
            period: { year: 2026, month: 8 },
            budgets: [makeBudget("GROCERIES", 400)],
            transactions: [
                makeTx("t1", "GROCERIES", 200),
                makeTx("t2", null, 999), // uncategorized — should not appear in any category result
            ],
            asOf: AFTER_AUGUST,
        });

        const groceries = result.results.find(r => r.category === "GROCERIES")!;
        expect(groceries.actualCents).toBe(MoneyFromDollars(200));
        // Null-category transaction must not pollute any category
        const anyCategory = result.results.find(r => r.category === null || r.category === "");
        expect(anyCategory).toBeUndefined();
    });
});
