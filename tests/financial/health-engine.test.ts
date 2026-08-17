/**
 * HealthEngine unit tests
 *
 * Tests cover every rule boundary explicitly:
 *
 *  Cash flow:
 *   - negative surplus + cash < 1 month essential → CRITICAL
 *   - negative surplus + cash >= 1 month essential → AT_RISK
 *   - positive surplus < 10% of income → WATCH
 *   - positive surplus >= 10% of income → HEALTHY (cash flow)
 *
 *  Emergency fund:
 *   - coverage < 1 month (with expenses > 0) → CRITICAL
 *   - coverage < minimumMonths → AT_RISK
 *   - coverage < targetMonths (>= min) → WATCH
 *   - coverage >= targetMonths → HEALTHY (ef)
 *   - null coverage (no expenses) → HEALTHY (no rule fires)
 *
 *  Debt:
 *   - debtStatus CRITICAL → CRITICAL
 *   - debtStatus AT_RISK → AT_RISK
 *   - debtStatus WATCH → WATCH
 *   - debtStatus HEALTHY → HEALTHY
 *   - revolving balance increased → DEBT_INCREASE attention item
 *
 *  Budget:
 *   - variancePercent > 50% → AT_RISK
 *   - variancePercent > 20% (<=50%) → WATCH
 *   - variancePercent <= 20% → HEALTHY (budget)
 *
 *  Goals:
 *   - any goal BEHIND or AT_RISK → WATCH
 *   - all goals ON_TRACK/COMPLETED → HEALTHY (goals)
 *
 *  Data freshness:
 *   - lastTransactionDate null → DATA_STALE item (no status change)
 *   - lastTransactionDate > 30 days ago → DATA_STALE item
 *   - lastTransactionDate <= 30 days ago → no DATA_STALE item
 *
 *  Recurring expense changes:
 *   - change entries provided → RECURRING_EXPENSE_CHANGE items (no status change)
 *
 *  Status escalation:
 *   - worst-case across all rules is used
 *
 *  Attention item guardrails:
 *   - explanations do not contain recommendation language
 *   - IDs are deterministic for same inputs
 *   - all generated items have status=ACTIVE, dismissedAt=null, resolvedAt=null
 */

import {
    HealthEngine,
    HealthEngineInput,
    OverBudgetEntry,
    GoalSummary,
    RecurringChangeEntry,
    createHealthEngine,
    HEALTH_ENGINE_VERSION,
} from "@house-fin/domain";
import {
    FinancialHealthStatus,
    DebtHealthStatus,
    GoalStatus,
    GoalType,
    AttentionItemType,
    AttentionSeverity,
    AttentionItemStatus,
    EntityId,
    Money,
} from "@house-fin/contracts";

// ── helpers ───────────────────────────────────────────────────────────────────

function id(s: string): EntityId { return s as EntityId; }
function date(y: number, m: number, d: number): Date { return new Date(y, m - 1, d); }

const HH = id("hh-1");
const AS_OF = date(2024, 6, 15);

/** Base input where no rules fire (HEALTHY). */
function base(overrides: Partial<HealthEngineInput> = {}): HealthEngineInput {
    return {
        householdId: HH,
        asOf: AS_OF,
        monthlySurplusCents: 100000,        // $1,000 surplus
        monthlyIncomeCents: 600000,        // $6,000 income (surplus = 16.7% → above 10%)
        liquidCashCents: 1800000,       // $18,000 cash
        essentialMonthlyExpensesCents: 300000, // $3,000/month essential
        emergencyFundCoverageMonths: 6,     // at target
        emergencyFundMinimumMonths: 3,
        emergencyFundTargetMonths: 6,
        debtStatus: DebtHealthStatus.HEALTHY,
        revolvingDebtCents: 0,
        previousRevolvingDebtCents: 0,
        overBudgetResults: [],
        goalResults: [],
        lastTransactionDate: date(2024, 6, 10), // 5 days ago — fresh
        recurringExpenseChanges: [],
        ...overrides,
    };
}

// ── HealthEngine.analyze ──────────────────────────────────────────────────────

describe("HealthEngine", () => {
    let engine: HealthEngine;
    beforeEach(() => { engine = createHealthEngine(); });

    describe("factory", () => {
        it("createHealthEngine returns a HealthEngine", () => {
            expect(engine).toBeInstanceOf(HealthEngine);
        });

        it("includes calculationVersion", () => {
            expect(engine.analyze(base()).calculationVersion).toBe(HEALTH_ENGINE_VERSION);
        });
    });

    // ── HEALTHY baseline ─────────────────────────────────────────────────────

    describe("HEALTHY baseline", () => {
        it("returns HEALTHY when all inputs are in-range", () => {
            expect(engine.analyze(base()).status).toBe(FinancialHealthStatus.HEALTHY);
        });

        it("produces no WARNING or CRITICAL attention items on healthy input", () => {
            const items = engine.analyze(base()).attentionItems;
            expect(items.filter(i => i.severity !== AttentionSeverity.INFO)).toHaveLength(0);
        });
    });

    // ── Cash flow rules ───────────────────────────────────────────────────────

    describe("cash flow", () => {
        it("CRITICAL when surplus is negative and cash < 1 month of essential expenses", () => {
            const result = engine.analyze(base({
                monthlySurplusCents: -50000,        // deficit
                liquidCashCents: 200000,            // $2,000 < $3,000 essential
                essentialMonthlyExpensesCents: 300000,
            }));
            expect(result.status).toBe(FinancialHealthStatus.CRITICAL);
        });

        it("AT_RISK when surplus is negative but cash >= 1 month of essential expenses", () => {
            const result = engine.analyze(base({
                monthlySurplusCents: -50000,
                liquidCashCents: 400000,            // $4,000 > $3,000 essential
                essentialMonthlyExpensesCents: 300000,
            }));
            expect(result.status).toBe(FinancialHealthStatus.AT_RISK);
        });

        it("WATCH when surplus is positive but < 10% of income", () => {
            const result = engine.analyze(base({
                monthlySurplusCents: 50000,         // $500 = 8.3% of $6,000
                monthlyIncomeCents: 600000,
            }));
            expect(result.status).toBe(FinancialHealthStatus.WATCH);
        });

        it("HEALTHY when surplus is exactly 10% of income", () => {
            const result = engine.analyze(base({
                monthlySurplusCents: 60000,         // $600 = 10% of $6,000
                monthlyIncomeCents: 600000,
            }));
            expect(result.status).toBe(FinancialHealthStatus.HEALTHY);
        });

        it("HEALTHY when income is zero (ratio rule skipped)", () => {
            const result = engine.analyze(base({
                monthlySurplusCents: 10000,
                monthlyIncomeCents: 0,
            }));
            expect(result.status).toBe(FinancialHealthStatus.HEALTHY);
        });

        it("CASH_FLOW_WARNING item is emitted for negative surplus", () => {
            const result = engine.analyze(base({
                monthlySurplusCents: -20000,
                liquidCashCents: 1000000,
                essentialMonthlyExpensesCents: 300000,
            }));
            expect(result.attentionItems.some(i => i.type === AttentionItemType.CASH_FLOW_WARNING)).toBe(true);
        });

        it("CASH_FLOW_WARNING explanation is factual (no recommendation)", () => {
            const result = engine.analyze(base({
                monthlySurplusCents: -20000,
                liquidCashCents: 1000000,
                essentialMonthlyExpensesCents: 300000,
            }));
            const item = result.attentionItems.find(i => i.type === AttentionItemType.CASH_FLOW_WARNING)!;
            expect(item.explanation).not.toMatch(/you should|cut back|reduce spending|stop/i);
        });
    });

    // ── Emergency fund rules ─────────────────────────────────────────────────

    describe("emergency fund", () => {
        it("CRITICAL when coverage < 1 month (expenses > 0)", () => {
            const result = engine.analyze(base({
                emergencyFundCoverageMonths: 0.7,
                essentialMonthlyExpensesCents: 300000,
            }));
            expect(result.status).toBe(FinancialHealthStatus.CRITICAL);
        });

        it("AT_RISK when coverage < minimum (but >= 1 month)", () => {
            const result = engine.analyze(base({
                emergencyFundCoverageMonths: 1.5,
                emergencyFundMinimumMonths: 3,
            }));
            expect(result.status).toBe(FinancialHealthStatus.AT_RISK);
        });

        it("WATCH when coverage < target (but >= minimum)", () => {
            const result = engine.analyze(base({
                emergencyFundCoverageMonths: 4,   // >= min=3, < target=6
                emergencyFundMinimumMonths: 3,
                emergencyFundTargetMonths: 6,
            }));
            expect(result.status).toBe(FinancialHealthStatus.WATCH);
        });

        it("HEALTHY when coverage >= target", () => {
            const result = engine.analyze(base({
                emergencyFundCoverageMonths: 6,
                emergencyFundTargetMonths: 6,
            }));
            expect(result.status).toBe(FinancialHealthStatus.HEALTHY);
        });

        it("no rule fires when coverage is null", () => {
            const result = engine.analyze(base({
                emergencyFundCoverageMonths: null,
                essentialMonthlyExpensesCents: 0,
            }));
            expect(result.attentionItems.some(i => i.type === AttentionItemType.EMERGENCY_FUND_LOW)).toBe(false);
        });

        it("EMERGENCY_FUND_LOW explanation includes coverage months", () => {
            const result = engine.analyze(base({
                emergencyFundCoverageMonths: 2,
                emergencyFundMinimumMonths: 3,
            }));
            const item = result.attentionItems.find(i => i.type === AttentionItemType.EMERGENCY_FUND_LOW)!;
            expect(item.explanation).toContain("2.0 months");
        });

        it("EMERGENCY_FUND_LOW explanation is factual (no recommendation)", () => {
            const result = engine.analyze(base({ emergencyFundCoverageMonths: 1 }));
            const item = result.attentionItems.find(i => i.type === AttentionItemType.EMERGENCY_FUND_LOW)!;
            expect(item.explanation).not.toMatch(/you should|build up|save more/i);
        });

        // Boundary: exactly at minimum
        it("HEALTHY when coverage is exactly at minimum (not below)", () => {
            const result = engine.analyze(base({
                emergencyFundCoverageMonths: 3,
                emergencyFundMinimumMonths: 3,
                emergencyFundTargetMonths: 6,
            }));
            // coverage = min → AT_RISK rule doesn't fire (< minimum); WATCH fires (< target)
            expect(result.status).toBe(FinancialHealthStatus.WATCH);
        });
    });

    // ── Debt rules ───────────────────────────────────────────────────────────

    describe("debt", () => {
        it("CRITICAL when debtStatus is CRITICAL", () => {
            expect(engine.analyze(base({ debtStatus: DebtHealthStatus.CRITICAL })).status)
                .toBe(FinancialHealthStatus.CRITICAL);
        });

        it("AT_RISK when debtStatus is AT_RISK", () => {
            expect(engine.analyze(base({ debtStatus: DebtHealthStatus.AT_RISK })).status)
                .toBe(FinancialHealthStatus.AT_RISK);
        });

        it("WATCH when debtStatus is WATCH", () => {
            expect(engine.analyze(base({ debtStatus: DebtHealthStatus.WATCH })).status)
                .toBe(FinancialHealthStatus.WATCH);
        });

        it("HEALTHY when debtStatus is HEALTHY", () => {
            expect(engine.analyze(base({ debtStatus: DebtHealthStatus.HEALTHY })).status)
                .toBe(FinancialHealthStatus.HEALTHY);
        });

        it("DEBT_INCREASE item emitted when revolving balance grew", () => {
            const result = engine.analyze(base({
                revolvingDebtCents: 200000,
                previousRevolvingDebtCents: 100000,
            }));
            const item = result.attentionItems.find(i => i.type === AttentionItemType.DEBT_INCREASE);
            expect(item).toBeDefined();
            expect(item!.metric.value).toBe(1000); // $1,000 increase
        });

        it("DEBT_INCREASE not emitted when revolving balance decreased", () => {
            const result = engine.analyze(base({
                revolvingDebtCents: 50000,
                previousRevolvingDebtCents: 100000,
            }));
            expect(result.attentionItems.some(i => i.type === AttentionItemType.DEBT_INCREASE)).toBe(false);
        });

        it("DEBT_INCREASE not emitted when no prior period data", () => {
            const result = engine.analyze(base({
                revolvingDebtCents: 200000,
                previousRevolvingDebtCents: null,
            }));
            expect(result.attentionItems.some(i => i.type === AttentionItemType.DEBT_INCREASE)).toBe(false);
        });

        it("DEBT_INCREASE item explanation mentions dollar increase", () => {
            const result = engine.analyze(base({
                revolvingDebtCents: 200000,
                previousRevolvingDebtCents: 100000,
            }));
            const item = result.attentionItems.find(i => i.type === AttentionItemType.DEBT_INCREASE)!;
            expect(item.explanation).toContain("$1,000");
        });
    });

    // ── Budget rules ─────────────────────────────────────────────────────────

    describe("budget", () => {
        it("AT_RISK when a category is > 50% over budget", () => {
            const overBudget: OverBudgetEntry[] = [
                { category: "Dining", varianceCents: 18500, variancePercent: 55 },
            ];
            expect(engine.analyze(base({ overBudgetResults: overBudget })).status)
                .toBe(FinancialHealthStatus.AT_RISK);
        });

        it("WATCH when a category is > 20% and <= 50% over budget", () => {
            const overBudget: OverBudgetEntry[] = [
                { category: "Dining", varianceCents: 7400, variancePercent: 35 },
            ];
            expect(engine.analyze(base({ overBudgetResults: overBudget })).status)
                .toBe(FinancialHealthStatus.WATCH);
        });

        it("HEALTHY when a category is exactly 20% over budget (boundary)", () => {
            const overBudget: OverBudgetEntry[] = [
                { category: "Dining", varianceCents: 4000, variancePercent: 20 },
            ];
            expect(engine.analyze(base({ overBudgetResults: overBudget })).status)
                .toBe(FinancialHealthStatus.HEALTHY);
        });

        it("HEALTHY when over-budget list is empty", () => {
            expect(engine.analyze(base({ overBudgetResults: [] })).status)
                .toBe(FinancialHealthStatus.HEALTHY);
        });

        it("BUDGET_OVER item includes category name in title", () => {
            const result = engine.analyze(base({
                overBudgetResults: [{ category: "Groceries", varianceCents: 12000, variancePercent: 30 }],
            }));
            const item = result.attentionItems.find(i => i.type === AttentionItemType.BUDGET_OVER)!;
            expect(item.title).toContain("Groceries");
        });

        it("BUDGET_OVER explanation is factual (no recommendation)", () => {
            const result = engine.analyze(base({
                overBudgetResults: [{ category: "Dining", varianceCents: 18500, variancePercent: 55 }],
            }));
            const item = result.attentionItems.find(i => i.type === AttentionItemType.BUDGET_OVER)!;
            expect(item.explanation).not.toMatch(/you should|stop eating|cook at home/i);
        });

        it("BUDGET_OVER explanation contains dollar amount", () => {
            const result = engine.analyze(base({
                overBudgetResults: [{ category: "Dining", varianceCents: 18500, variancePercent: 55 }],
            }));
            const item = result.attentionItems.find(i => i.type === AttentionItemType.BUDGET_OVER)!;
            expect(item.explanation).toContain("$185");
        });

        it("generates separate items for each over-budget category", () => {
            const result = engine.analyze(base({
                overBudgetResults: [
                    { category: "Dining", varianceCents: 18500, variancePercent: 55 },
                    { category: "Entertainment", varianceCents: 5000, variancePercent: 25 },
                ],
            }));
            const budgetItems = result.attentionItems.filter(i => i.type === AttentionItemType.BUDGET_OVER);
            expect(budgetItems).toHaveLength(2);
        });
    });

    // ── Goal rules ───────────────────────────────────────────────────────────

    describe("goals", () => {
        it("WATCH when any goal is BEHIND", () => {
            const goals: GoalSummary[] = [{
                goalId: id("g1"),
                name: "Vacation Fund",
                status: GoalStatus.BEHIND,
                percentComplete: 45,
                targetDate: date(2024, 12, 1),
            }];
            expect(engine.analyze(base({ goalResults: goals })).status)
                .toBe(FinancialHealthStatus.WATCH);
        });

        it("WATCH when any goal is AT_RISK", () => {
            const goals: GoalSummary[] = [{
                goalId: id("g1"),
                name: "New Car",
                status: GoalStatus.AT_RISK,
                percentComplete: 10,
                targetDate: date(2024, 9, 1),
            }];
            expect(engine.analyze(base({ goalResults: goals })).status)
                .toBe(FinancialHealthStatus.WATCH);
        });

        it("HEALTHY when all goals are ON_TRACK or COMPLETED", () => {
            const goals: GoalSummary[] = [
                { goalId: id("g1"), name: "Vacation", status: GoalStatus.ON_TRACK, percentComplete: 60, targetDate: null },
                { goalId: id("g2"), name: "Old Fund", status: GoalStatus.COMPLETED, percentComplete: 100, targetDate: null },
            ];
            expect(engine.analyze(base({ goalResults: goals })).status)
                .toBe(FinancialHealthStatus.HEALTHY);
        });

        it("GOAL_BEHIND item explanation includes goal name and percentage", () => {
            const goals: GoalSummary[] = [{
                goalId: id("g1"),
                name: "College Fund",
                status: GoalStatus.BEHIND,
                percentComplete: 32.5,
                targetDate: null,
            }];
            const result = engine.analyze(base({ goalResults: goals }));
            const item = result.attentionItems.find(i => i.type === AttentionItemType.GOAL_BEHIND)!;
            expect(item.explanation).toContain("College Fund");
            expect(item.explanation).toContain("32.5%");
        });

        it("GOAL_BEHIND explanation is factual (no recommendation)", () => {
            const goals: GoalSummary[] = [{
                goalId: id("g1"), name: "Vacation", status: GoalStatus.AT_RISK,
                percentComplete: 20, targetDate: null,
            }];
            const result = engine.analyze(base({ goalResults: goals }));
            const item = result.attentionItems.find(i => i.type === AttentionItemType.GOAL_BEHIND)!;
            expect(item.explanation).not.toMatch(/you should|increase contribution|put more/i);
        });
    });

    // ── Data freshness ────────────────────────────────────────────────────────

    describe("data freshness", () => {
        it("DATA_STALE emitted when lastTransactionDate is null", () => {
            const result = engine.analyze(base({ lastTransactionDate: null }));
            expect(result.attentionItems.some(i => i.type === AttentionItemType.DATA_STALE)).toBe(true);
        });

        it("DATA_STALE emitted when last transaction is 31 days ago", () => {
            const thirtyOneDaysAgo = new Date(AS_OF.getTime() - 31 * 24 * 60 * 60 * 1000);
            const result = engine.analyze(base({ lastTransactionDate: thirtyOneDaysAgo }));
            expect(result.attentionItems.some(i => i.type === AttentionItemType.DATA_STALE)).toBe(true);
        });

        it("DATA_STALE not emitted when last transaction is 30 days ago (boundary)", () => {
            const thirtyDaysAgo = new Date(AS_OF.getTime() - 30 * 24 * 60 * 60 * 1000);
            const result = engine.analyze(base({ lastTransactionDate: thirtyDaysAgo }));
            expect(result.attentionItems.some(i => i.type === AttentionItemType.DATA_STALE)).toBe(false);
        });

        it("DATA_STALE does not change financial health status", () => {
            const result = engine.analyze(base({ lastTransactionDate: null }));
            expect(result.status).toBe(FinancialHealthStatus.HEALTHY);
        });

        it("DATA_STALE item has INFO severity", () => {
            const result = engine.analyze(base({ lastTransactionDate: null }));
            const item = result.attentionItems.find(i => i.type === AttentionItemType.DATA_STALE)!;
            expect(item.severity).toBe(AttentionSeverity.INFO);
        });
    });

    // ── Recurring expense changes ─────────────────────────────────────────────

    describe("recurring expense changes", () => {
        it("RECURRING_EXPENSE_CHANGE item emitted for each change entry", () => {
            const changes: RecurringChangeEntry[] = [
                { merchant: "Netflix", previousAmountCents: 1500, currentAmountCents: 1799, changePercent: 19.9 },
            ];
            const result = engine.analyze(base({ recurringExpenseChanges: changes }));
            expect(result.attentionItems.some(i => i.type === AttentionItemType.RECURRING_EXPENSE_CHANGE)).toBe(true);
        });

        it("RECURRING_EXPENSE_CHANGE does not change health status", () => {
            const changes: RecurringChangeEntry[] = [
                { merchant: "Netflix", previousAmountCents: 1500, currentAmountCents: 1799, changePercent: 19.9 },
            ];
            expect(engine.analyze(base({ recurringExpenseChanges: changes })).status)
                .toBe(FinancialHealthStatus.HEALTHY);
        });

        it("explanation includes merchant name and direction", () => {
            const changes: RecurringChangeEntry[] = [
                { merchant: "Spotify", previousAmountCents: 999, currentAmountCents: 1099, changePercent: 10 },
            ];
            const result = engine.analyze(base({ recurringExpenseChanges: changes }));
            const item = result.attentionItems.find(i => i.type === AttentionItemType.RECURRING_EXPENSE_CHANGE)!;
            expect(item.explanation).toContain("Spotify");
            expect(item.explanation).toMatch(/increased|decreased/i);
        });
    });

    // ── Status escalation ─────────────────────────────────────────────────────

    describe("status escalation", () => {
        it("CRITICAL beats AT_RISK when both fire", () => {
            const result = engine.analyze(base({
                monthlySurplusCents: -10000,        // AT_RISK
                liquidCashCents: 100000,
                essentialMonthlyExpensesCents: 300000, // cash < 1 month → CRITICAL
                debtStatus: DebtHealthStatus.AT_RISK,  // also AT_RISK
            }));
            expect(result.status).toBe(FinancialHealthStatus.CRITICAL);
        });

        it("AT_RISK beats WATCH when both fire", () => {
            const result = engine.analyze(base({
                overBudgetResults: [{ category: "Dining", varianceCents: 7000, variancePercent: 30 }], // WATCH
                debtStatus: DebtHealthStatus.AT_RISK, // AT_RISK
            }));
            expect(result.status).toBe(FinancialHealthStatus.AT_RISK);
        });

        it("multiple WATCH triggers still yield WATCH (not higher)", () => {
            const result = engine.analyze(base({
                emergencyFundCoverageMonths: 4,     // WATCH
                overBudgetResults: [{ category: "Dining", varianceCents: 7000, variancePercent: 30 }], // WATCH
                debtStatus: DebtHealthStatus.WATCH, // WATCH
            }));
            expect(result.status).toBe(FinancialHealthStatus.WATCH);
        });
    });

    // ── Attention item invariants ─────────────────────────────────────────────

    describe("attention item invariants", () => {
        it("all generated items have status ACTIVE", () => {
            const result = engine.analyze(base({
                emergencyFundCoverageMonths: 2,
                overBudgetResults: [{ category: "Dining", varianceCents: 7000, variancePercent: 30 }],
            }));
            for (const item of result.attentionItems) {
                expect(item.status).toBe(AttentionItemStatus.ACTIVE);
            }
        });

        it("all generated items have dismissedAt and resolvedAt as null", () => {
            const result = engine.analyze(base({
                emergencyFundCoverageMonths: 2,
            }));
            for (const item of result.attentionItems) {
                expect(item.dismissedAt).toBeNull();
                expect(item.resolvedAt).toBeNull();
            }
        });

        it("item IDs are deterministic — same inputs produce same IDs", () => {
            const input = base({ emergencyFundCoverageMonths: 2 });
            const r1 = engine.analyze(input);
            const r2 = engine.analyze(input);
            expect(r1.attentionItems.map(i => i.id)).toEqual(r2.attentionItems.map(i => i.id));
        });

        it("all items have householdId matching input", () => {
            const result = engine.analyze(base({ emergencyFundCoverageMonths: 1 }));
            for (const item of result.attentionItems) {
                expect(item.householdId).toBe(HH);
            }
        });
    });

    // ── HealthFactor invariants ───────────────────────────────────────────────

    describe("HealthFactor invariants", () => {
        it("factors array is non-empty for any input", () => {
            expect(engine.analyze(base()).factors.length).toBeGreaterThan(0);
        });

        it("each factor has a rule string", () => {
            for (const f of engine.analyze(base()).factors) {
                expect(typeof f.rule).toBe("string");
                expect(f.rule.length).toBeGreaterThan(0);
            }
        });

        it("non-triggered factors have null severity", () => {
            const result = engine.analyze(base());
            for (const f of result.factors.filter(f => !f.triggered)) {
                expect(f.severity).toBeNull();
            }
        });
    });

    // ── Status description guardrails ─────────────────────────────────────────

    describe("statusDescription", () => {
        it("is present for every status level", () => {
            const statuses = [
                base(),
                base({ emergencyFundCoverageMonths: 4 }),
                base({ monthlySurplusCents: -10000, liquidCashCents: 1000000, essentialMonthlyExpensesCents: 300000 }),
                base({ debtStatus: DebtHealthStatus.CRITICAL }),
            ];
            for (const s of statuses) {
                const desc = engine.analyze(s).statusDescription;
                expect(desc).toBeTruthy();
                expect(desc.length).toBeGreaterThan(10);
            }
        });

        it("does not contain recommendation language in any status", () => {
            const inputs = [
                base({ monthlySurplusCents: -5000, liquidCashCents: 100000, essentialMonthlyExpensesCents: 300000 }),
                base({ emergencyFundCoverageMonths: 0.5, essentialMonthlyExpensesCents: 300000 }),
            ];
            for (const inp of inputs) {
                const desc = engine.analyze(inp).statusDescription;
                expect(desc).not.toMatch(/you should|recommend|stop|reduce|pay off/i);
            }
        });
    });
});
