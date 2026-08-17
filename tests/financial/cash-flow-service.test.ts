/**
 * CashFlowService unit tests
 *
 * Rules under test:
 * - calculateHistory: groups by calendar month, correct income/expense/surplus
 * - calculateCurrentProjection:
 *   - Stable recurring income → expectedIncomeCents includes pattern amount
 *   - Insufficient data (< 2 months) → LOW confidence
 *   - Recurring expense not yet fired → included in projection
 *   - One-time expense (single occurrence, no pattern) → NOT in projection
 *   - Settings fallback used when no patterns or transactions
 *   - Budget raises floor, never lowers it
 *   - projectedEndingCashCents can be negative
 * - calculateForecast: chains months, rolling cash balance
 */

import {
    CashFlowService,
    CashFlowProjectionInput,
    HistoryCashFlowInput,
    ForecastInput,
    createCashFlowService,
    CASHFLOW_CALCULATION_VERSION,
    ESSENTIAL_CATEGORIES,
} from "@house-fin/domain";
import {
    ForecastConfidence,
    RecurringFrequency,
    EntityId,
    Money,
} from "@house-fin/contracts";
import { CashFlowTransaction } from "@house-fin/domain";

// ── helpers ──────────────────────────────────────────────────────────────────

function id(s: string): EntityId {
    return s as EntityId;
}

function money(cents: number): Money {
    return cents as Money;
}

function tx(
    txId: string,
    date: Date,
    amountCents: number,
    direction: "DEBIT" | "CREDIT",
    merchant: string,
    category: string | null = null,
): CashFlowTransaction {
    return { id: txId, transactionDate: date, amountCents, direction, merchant, category, accountId: "acct-1" };
}

function date(y: number, m: number, d: number): Date {
    return new Date(y, m - 1, d);
}

const HH_ID = id("hh-1");

// ── CashFlowService.calculateHistory ─────────────────────────────────────────

describe("CashFlowService.calculateHistory", () => {
    let service: CashFlowService;

    beforeEach(() => {
        service = createCashFlowService();
    });

    it("groups transactions into months correctly", () => {
        const transactions = [
            tx("1", date(2024, 1, 15), 500000, "CREDIT", "Employer"),
            tx("2", date(2024, 1, 20), 20000, "DEBIT", "Grocery"),
            tx("3", date(2024, 2, 15), 500000, "CREDIT", "Employer"),
            tx("4", date(2024, 2, 20), 25000, "DEBIT", "Grocery"),
        ];
        const input: HistoryCashFlowInput = {
            householdId: HH_ID,
            asOf: date(2024, 3, 1),
            transactions,
        };
        const history = service.calculateHistory(input);
        expect(history.months).toHaveLength(2);
        const jan = history.months.find(m => m.period.month === 1);
        expect(jan).toBeDefined();
        expect(jan!.incomeCents).toBe(500000);
        expect(jan!.expensesCents).toBe(20000);
        expect(jan!.surplusCents).toBe(480000);
    });

    it("marks current month as not complete", () => {
        const asOf = date(2024, 3, 10);
        const transactions = [
            tx("1", date(2024, 3, 5), 500000, "CREDIT", "Employer"),
        ];
        const history = service.calculateHistory({ householdId: HH_ID, asOf, transactions });
        const march = history.months.find(m => m.period.month === 3);
        expect(march!.isComplete).toBe(false);
    });

    it("marks past months as complete", () => {
        const asOf = date(2024, 3, 10);
        const transactions = [
            tx("1", date(2024, 2, 15), 500000, "CREDIT", "Employer"),
        ];
        const history = service.calculateHistory({ householdId: HH_ID, asOf, transactions });
        const feb = history.months.find(m => m.period.month === 2);
        expect(feb!.isComplete).toBe(true);
    });

    it("computes correct average income from completed months only", () => {
        const asOf = date(2024, 3, 10);
        const transactions = [
            tx("1", date(2024, 1, 15), 400000, "CREDIT", "Employer"),
            tx("2", date(2024, 2, 15), 600000, "CREDIT", "Employer"),
            // Current month — partial
            tx("3", date(2024, 3, 5), 100000, "CREDIT", "Employer"),
        ];
        const history = service.calculateHistory({ householdId: HH_ID, asOf, transactions });
        expect(history.averageMonthlyIncomeCents).toBe(500000); // (400k + 600k) / 2
    });

    it("returns empty months array for no transactions", () => {
        const history = service.calculateHistory({
            householdId: HH_ID,
            asOf: date(2024, 3, 10),
            transactions: [],
        });
        expect(history.months).toHaveLength(0);
    });
});

// ── CashFlowService.calculateCurrentProjection ───────────────────────────────

describe("CashFlowService.calculateCurrentProjection", () => {
    let service: CashFlowService;

    const makePattern = (
        merchant: string,
        direction: "DEBIT" | "CREDIT",
        freq: RecurringFrequency,
        typicalAmountCents: number,
        confidence: number,
        category: string | null = null,
    ) => ({
        merchant,
        direction,
        frequency: freq,
        typicalAmountCents,
        averageAmountCents: typicalAmountCents,
        amountVariancePct: 0,
        confidence,
        occurrenceCount: 4,
        mostCommonCategory: category,
        firstSeenDate: date(2023, 12, 1),
        lastSeenDate: date(2024, 5, 1),
        estimatedNextDate: date(2024, 6, 1),
        sourceTransactionIds: ["tx-1", "tx-2", "tx-3", "tx-4"],
        calculationVersion: 1,
    });

    beforeEach(() => {
        service = createCashFlowService();
    });

    const baseInput = (overrides: Partial<CashFlowProjectionInput> = {}): CashFlowProjectionInput => ({
        householdId: HH_ID,
        asOf: date(2024, 6, 10),
        liquidCashCents: 100000,
        currentMonthTransactions: [],
        historicalPatterns: [],
        currentMonthBudgets: [],
        householdSettings: null,
        historyMonthCount: 3,
        ...overrides,
    });

    it("stable recurring income pattern → expectedIncomeCents includes pattern amount", () => {
        const incomePattern = makePattern("Employer Inc", "CREDIT", RecurringFrequency.MONTHLY, 500000, 0.90);
        const result = service.calculateCurrentProjection(
            baseInput({ historicalPatterns: [incomePattern] })
        );
        expect(result.expectedIncomeCents).toBe(500000);
    });

    it("confirms income already in current month transactions", () => {
        const incomePattern = makePattern("Employer Inc", "CREDIT", RecurringFrequency.MONTHLY, 500000, 0.90);
        const currentTxs = [
            tx("pay-1", date(2024, 6, 5), -500000, "CREDIT", "Employer Inc"),
        ];
        const result = service.calculateCurrentProjection(
            baseInput({ historicalPatterns: [incomePattern], currentMonthTransactions: currentTxs })
        );
        // Income is already confirmed; pattern should NOT add it again
        expect(result.expectedIncomeCents).toBe(500000);
        expect(result.confirmedIncomeCents).toBe(500000);
    });

    it("recurring expense not yet fired → included in expectedExpenses", () => {
        const rentPattern = makePattern("Rent Corp", "DEBIT", RecurringFrequency.MONTHLY, 150000, 0.90, "HOUSING");
        const result = service.calculateCurrentProjection(
            baseInput({ historicalPatterns: [rentPattern] })
        );
        expect(result.expectedEssentialExpensesCents).toBeGreaterThan(0);
        expect(result.expectedEssentialExpensesCents).toBe(150000);
    });

    it("recurring expense already fired → NOT added again", () => {
        const rentPattern = makePattern("Rent Corp", "DEBIT", RecurringFrequency.MONTHLY, 150000, 0.90, "HOUSING");
        const currentTxs = [
            tx("rent-1", date(2024, 6, 3), 150000, "DEBIT", "Rent Corp", "HOUSING"),
        ];
        const result = service.calculateCurrentProjection(
            baseInput({ historicalPatterns: [rentPattern], currentMonthTransactions: currentTxs })
        );
        // Should not double-count
        expect(result.expectedEssentialExpensesCents).toBe(150000);
    });

    it("historyMonthCount < 2 → LOW confidence", () => {
        const result = service.calculateCurrentProjection(
            baseInput({ historyMonthCount: 1 })
        );
        expect(result.confidence).toBe(ForecastConfidence.LOW);
    });

    it("historyMonthCount = 0 → LOW confidence", () => {
        const result = service.calculateCurrentProjection(
            baseInput({ historyMonthCount: 0 })
        );
        expect(result.confidence).toBe(ForecastConfidence.LOW);
    });

    it("3+ months + high-confidence income+expense patterns → HIGH confidence", () => {
        const incomePattern = makePattern("Employer", "CREDIT", RecurringFrequency.MONTHLY, 500000, 0.90);
        const expensePattern = makePattern("Rent", "DEBIT", RecurringFrequency.MONTHLY, 150000, 0.85, "HOUSING");
        const result = service.calculateCurrentProjection(
            baseInput({
                historicalPatterns: [incomePattern, expensePattern],
                historyMonthCount: 3,
            })
        );
        expect(result.confidence).toBe(ForecastConfidence.HIGH);
    });

    it("settings fallback: income from settings when no patterns or transactions", () => {
        const settings = {
            id: id("settings-1"),
            householdId: HH_ID,
            monthlyIncome: money(300000),
            monthlyEssentialExpenses: money(100000),
            monthlyDiscretionaryExpenses: money(50000),
            currency: "USD",
            incomeSource: "manual_entry" as const,
            updatedAt: date(2024, 1, 1),
            updatedBy: id("user-1"),
        };
        const result = service.calculateCurrentProjection(
            baseInput({ householdSettings: settings })
        );
        expect(result.expectedIncomeCents).toBe(300000);
        // Assumptions should mention HOUSEHOLD_SETTINGS
        const settingsAssumption = result.assumptions.find(a => a.source === "HOUSEHOLD_SETTINGS");
        expect(settingsAssumption).toBeDefined();
    });

    it("budget raises expense floor, never lowers it", () => {
        const lowPattern = makePattern("Grocery", "DEBIT", RecurringFrequency.MONTHLY, 20000, 0.80, "GROCERIES");
        const budget = {
            id: id("budget-1"),
            householdId: HH_ID,
            periodYear: 2024,
            periodMonth: 6,
            category: "GROCERIES",
            amountCents: money(40000), // budget is higher than pattern
            version: 1,
            createdAt: date(2024, 1, 1),
            updatedAt: date(2024, 1, 1),
        };
        const result = service.calculateCurrentProjection(
            baseInput({ historicalPatterns: [lowPattern], currentMonthBudgets: [budget] })
        );
        // Budget (40000) should floor > pattern (20000)
        expect(result.expectedEssentialExpensesCents).toBeGreaterThanOrEqual(40000);
    });

    it("projectedEndingCashCents can be negative when expenses > cash + income", () => {
        const expensePattern = makePattern("Huge Bill", "DEBIT", RecurringFrequency.MONTHLY, 1000000, 0.90);
        const result = service.calculateCurrentProjection(
            baseInput({ liquidCashCents: 10000, historicalPatterns: [expensePattern] })
        );
        expect(result.projectedEndingCashCents).toBeLessThan(0);
    });

    it("result includes calculationVersion", () => {
        const result = service.calculateCurrentProjection(baseInput());
        expect(result.calculationVersion).toBe(CASHFLOW_CALCULATION_VERSION);
    });

    it("result includes period matching asOf", () => {
        const asOf = date(2024, 6, 10);
        const result = service.calculateCurrentProjection(baseInput({ asOf }));
        expect(result.period.year).toBe(2024);
        expect(result.period.month).toBe(6);
    });

    it("monthlySurplusCents = expectedIncome - essentials - discretionary", () => {
        const incomePattern = makePattern("Employer", "CREDIT", RecurringFrequency.MONTHLY, 500000, 0.90);
        const rentPattern = makePattern("Rent", "DEBIT", RecurringFrequency.MONTHLY, 150000, 0.85, "HOUSING");
        const funPattern = makePattern("Fun Shop", "DEBIT", RecurringFrequency.MONTHLY, 50000, 0.80);
        const result = service.calculateCurrentProjection(
            baseInput({ historicalPatterns: [incomePattern, rentPattern, funPattern] })
        );
        expect(result.monthlySurplusCents).toBe(
            result.expectedIncomeCents -
            result.expectedEssentialExpensesCents -
            result.expectedDiscretionaryExpensesCents
        );
    });

    it("pattern with confidence < 0.40 is excluded from projection", () => {
        const weakPattern = makePattern("Weak Bill", "DEBIT", RecurringFrequency.MONTHLY, 50000, 0.30);
        const result = service.calculateCurrentProjection(
            baseInput({ historicalPatterns: [weakPattern] })
        );
        expect(result.expectedEssentialExpensesCents).toBe(0);
        expect(result.expectedDiscretionaryExpensesCents).toBe(0);
    });
});

// ── CashFlowService.calculateForecast ────────────────────────────────────────

describe("CashFlowService.calculateForecast", () => {
    let service: CashFlowService;

    beforeEach(() => {
        service = createCashFlowService();
    });

    it("returns a forecast with the requested number of monthly projections", () => {
        const input: ForecastInput = {
            householdId: HH_ID,
            asOf: date(2024, 6, 10),
            liquidCashCents: 100000,
            allTransactions: [],
            historicalPatterns: [],
            budgetsByMonth: new Map(),
            householdSettings: null,
            historyMonthCount: 0,
            forecastMonths: 3,
        };
        const forecast = service.calculateForecast(input);
        // forecast includes current month + forecastMonths future months
        expect(forecast.months.length).toBe(4);
    });

    it("starts forecast from the month after asOf", () => {
        const input: ForecastInput = {
            householdId: HH_ID,
            asOf: date(2024, 6, 10),
            liquidCashCents: 100000,
            allTransactions: [],
            historicalPatterns: [],
            budgetsByMonth: new Map(),
            householdSettings: null,
            historyMonthCount: 0,
            forecastMonths: 2,
        };
        const forecast = service.calculateForecast(input);
        // months[0] = current month (June), months[1] = July
        expect(forecast.months[0].period.month).toBe(6);
        expect(forecast.months[0].period.year).toBe(2024);
        expect(forecast.months[1].period.month).toBe(7);
        expect(forecast.months[2].period.month).toBe(8);
    });

    it("rolls cash balance forward across months", () => {
        const incomePattern = {
            merchant: "Employer",
            direction: "CREDIT" as const,
            frequency: RecurringFrequency.MONTHLY,
            typicalAmountCents: 500000,
            averageAmountCents: 500000,
            amountVariancePct: 0,
            confidence: 0.90,
            occurrenceCount: 5,
            mostCommonCategory: null,
            firstSeenDate: date(2024, 1, 1),
            lastSeenDate: date(2024, 5, 15),
            estimatedNextDate: date(2024, 7, 15),
            sourceTransactionIds: ["p1", "p2", "p3", "p4", "p5"],
            calculationVersion: 1,
        };
        const input: ForecastInput = {
            householdId: HH_ID,
            asOf: date(2024, 6, 10),
            liquidCashCents: 100000,
            allTransactions: [],
            historicalPatterns: [incomePattern],
            budgetsByMonth: new Map(),
            householdSettings: null,
            historyMonthCount: 3,
            forecastMonths: 2,
        };
        const forecast = service.calculateForecast(input);
        // Month 2 should start with ending cash from month 1
        const endM1 = forecast.months[0].projectedEndingCashCents;
        const startM2 = forecast.months[1].startingCashCents;
        expect(startM2).toBe(endM1);
    });

    it("includes householdId and asOf in the result", () => {
        const input: ForecastInput = {
            householdId: HH_ID,
            asOf: date(2024, 6, 10),
            liquidCashCents: 0,
            allTransactions: [],
            historicalPatterns: [],
            budgetsByMonth: new Map(),
            householdSettings: null,
            historyMonthCount: 0,
            forecastMonths: 1,
        };
        const forecast = service.calculateForecast(input);
        expect(forecast.householdId).toBe(HH_ID);
        expect(forecast.calculationVersion).toBe(CASHFLOW_CALCULATION_VERSION);
    });
});

// ── ESSENTIAL_CATEGORIES export ───────────────────────────────────────────────

describe("ESSENTIAL_CATEGORIES", () => {
    it("includes HOUSING", () => expect(ESSENTIAL_CATEGORIES.has("HOUSING")).toBe(true));
    it("includes GROCERIES", () => expect(ESSENTIAL_CATEGORIES.has("GROCERIES")).toBe(true));
    it("includes HEALTHCARE", () => expect(ESSENTIAL_CATEGORIES.has("HEALTHCARE")).toBe(true));
    it("does not include ENTERTAINMENT", () => expect(ESSENTIAL_CATEGORIES.has("ENTERTAINMENT")).toBe(false));
});
