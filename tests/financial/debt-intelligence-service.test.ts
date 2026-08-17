/**
 * DebtIntelligenceService unit tests
 *
 * Covers:
 *  - no debt (empty accounts)
 *  - HEALTHY status
 *  - WATCH: revolving balance present, or utilisation > 30%
 *  - AT_RISK: utilisation > 50%, or DTI > 36%
 *  - CRITICAL: utilisation > 75%, or DTI > 43%
 *  - totalDebt, revolvingDebt, installmentDebt, mortgageDebt aggregates
 *  - weightedAverageRateBps (null when any account missing rate)
 *  - totalMinimumPaymentCents (null when any account missing field)
 *  - totalScheduledPaymentCents (null when any account missing field)
 *  - debtToIncomeRatio uses scheduledPayment when available, else minimum
 *  - debtToIncomeRatio null when income is 0 or payments unknown
 *  - revolvingBalanceCents NOT inferred from statement balance
 *  - revolvingBalanceCents null → REVOLVING_BALANCE_UNKNOWN observation
 *  - utilizationRatio null when creditLimit not provided
 *  - credit card payment, refund, and balance scenarios
 *  - APR disparity observation (card rate > other by >500 bps)
 *  - statusDescription is factual (no recommendation language)
 *  - observations codes and messages
 *  - INACTIVE accounts excluded
 *  - non-debt accounts excluded (CHECKING, SAVINGS)
 */

import {
    DebtIntelligenceService,
    AnalyzeDebtInput,
    createDebtIntelligenceService,
    DEBT_INTELLIGENCE_VERSION,
} from "@house-fin/domain";
import {
    Account,
    AccountType,
    AccountOwnership,
    AccountStatus,
    DebtHealthStatus,
    DebtCategory,
    EmergencyFundStatus,
    EntityId,
    Money,
} from "@house-fin/contracts";

// ── helpers ───────────────────────────────────────────────────────────────────

function id(s: string): EntityId { return s as EntityId; }
function money(cents: number): Money { return cents as Money; }
function date(y: number, m: number, d: number): Date { return new Date(y, m - 1, d); }

const HH = id("hh-1");
const AS_OF = date(2024, 6, 1);

function makeAccount(overrides: Partial<Account> & Pick<Account, "id" | "name" | "type">): Account {
    return {
        householdId: HH,
        ownership: AccountOwnership.JOINT,
        currency: "USD",
        currentBalance: money(0),
        lastUpdatedAt: AS_OF,
        status: AccountStatus.ACTIVE,
        createdAt: AS_OF,
        updatedAt: AS_OF,
        creditLimitCents: null,
        interestRateBps: null,
        minimumPaymentCents: null,
        scheduledPaymentCents: null,
        statementBalanceCents: null,
        revolvingBalanceCents: null,
        ...overrides,
    };
}

function makeInput(accounts: Account[], monthlyIncome = 0): AnalyzeDebtInput {
    return { householdId: HH, accounts, monthlyIncomeCents: monthlyIncome, asOf: AS_OF };
}

// ── DebtIntelligenceService.analyze ──────────────────────────────────────────

describe("DebtIntelligenceService", () => {
    let service: DebtIntelligenceService;
    beforeEach(() => { service = createDebtIntelligenceService(); });

    describe("factory", () => {
        it("createDebtIntelligenceService returns a DebtIntelligenceService", () => {
            expect(service).toBeInstanceOf(DebtIntelligenceService);
        });

        it("includes calculationVersion", () => {
            const result = service.analyze(makeInput([]));
            expect(result.calculationVersion).toBe(DEBT_INTELLIGENCE_VERSION);
        });
    });

    // ── No debt ───────────────────────────────────────────────────────────────

    describe("no debt", () => {
        it("HEALTHY when no accounts", () => {
            expect(service.analyze(makeInput([])).status).toBe(DebtHealthStatus.HEALTHY);
        });

        it("HEALTHY when only cash accounts", () => {
            const accounts = [
                makeAccount({ id: id("a1"), name: "Checking", type: AccountType.CHECKING, currentBalance: money(500000) }),
                makeAccount({ id: id("a2"), name: "Savings", type: AccountType.SAVINGS, currentBalance: money(200000) }),
            ];
            expect(service.analyze(makeInput(accounts)).status).toBe(DebtHealthStatus.HEALTHY);
        });

        it("all aggregates are zero when no debt", () => {
            const result = service.analyze(makeInput([]));
            expect(result.totalDebtCents).toBe(0);
            expect(result.revolvingDebtCents).toBe(0);
            expect(result.installmentDebtCents).toBe(0);
            expect(result.mortgageDebtCents).toBe(0);
        });

        it("emits NO_DEBT observation", () => {
            const result = service.analyze(makeInput([]));
            expect(result.observations.some(o => o.code === "NO_DEBT")).toBe(true);
        });
    });

    // ── Account filtering ────────────────────────────────────────────────────

    describe("account filtering", () => {
        it("excludes INACTIVE debt accounts", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Old Card", type: AccountType.CREDIT_CARD,
                    currentBalance: money(100000), status: AccountStatus.INACTIVE,
                }),
            ];
            const result = service.analyze(makeInput(accounts));
            expect(result.totalDebtCents).toBe(0);
        });

        it("excludes non-debt account types from totalDebt", () => {
            const accounts = [
                makeAccount({ id: id("a1"), name: "Checking", type: AccountType.CHECKING, currentBalance: money(999999) }),
                makeAccount({ id: id("c1"), name: "Card", type: AccountType.CREDIT_CARD, currentBalance: money(50000) }),
            ];
            const result = service.analyze(makeInput(accounts));
            expect(result.totalDebtCents).toBe(50000);
        });
    });

    // ── Aggregates ────────────────────────────────────────────────────────────

    describe("aggregate totals", () => {
        it("totalDebtCents sums all debt account balances", () => {
            const accounts = [
                makeAccount({ id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD, currentBalance: money(150000) }),
                makeAccount({ id: id("l1"), name: "Car Loan", type: AccountType.LOAN, currentBalance: money(2000000) }),
                makeAccount({ id: id("m1"), name: "Mortgage", type: AccountType.MORTGAGE, currentBalance: money(30000000) }),
            ];
            const result = service.analyze(makeInput(accounts));
            expect(result.totalDebtCents).toBe(32150000);
        });

        it("categorises revolving, installment, mortgage separately", () => {
            const accounts = [
                makeAccount({ id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD, currentBalance: money(150000) }),
                makeAccount({ id: id("l1"), name: "Car Loan", type: AccountType.LOAN, currentBalance: money(2000000) }),
                makeAccount({ id: id("m1"), name: "Mortgage", type: AccountType.MORTGAGE, currentBalance: money(30000000) }),
            ];
            const result = service.analyze(makeInput(accounts));
            expect(result.revolvingDebtCents).toBe(150000);
            expect(result.installmentDebtCents).toBe(2000000);
            expect(result.mortgageDebtCents).toBe(30000000);
        });
    });

    // ── Utilisation ──────────────────────────────────────────────────────────

    describe("utilisation ratio", () => {
        it("is null when creditLimitCents is null", () => {
            const accounts = [
                makeAccount({ id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD, currentBalance: money(50000) }),
            ];
            const detail = service.analyze(makeInput(accounts)).accounts[0];
            expect(detail.utilizationRatio).toBeNull();
        });

        it("is calculated when creditLimitCents is provided", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(50000), creditLimitCents: 200000
                }),
            ];
            const detail = service.analyze(makeInput(accounts)).accounts[0];
            expect(detail.utilizationRatio).toBeCloseTo(0.25, 5);
        });

        it("is capped at 1.0 when balance exceeds limit", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(250000), creditLimitCents: 200000
                }),
            ];
            const detail = service.analyze(makeInput(accounts)).accounts[0];
            expect(detail.utilizationRatio).toBe(1);
        });
    });

    // ── Revolving balance handling ────────────────────────────────────────────

    describe("revolving balance — data integrity", () => {
        it("statement balance does NOT automatically become revolving balance", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Amex", type: AccountType.CREDIT_CARD,
                    currentBalance: money(80000), statementBalanceCents: 80000,
                    revolvingBalanceCents: null
                }),
            ];
            const detail = service.analyze(makeInput(accounts)).accounts[0];
            expect(detail.revolvingBalanceCents).toBeNull();
        });

        it("emits REVOLVING_BALANCE_UNKNOWN when revolvingBalanceCents is null on a credit card", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Amex", type: AccountType.CREDIT_CARD,
                    currentBalance: money(80000), revolvingBalanceCents: null
                }),
            ];
            const obs = service.analyze(makeInput(accounts)).observations;
            expect(obs.some(o => o.code === "REVOLVING_BALANCE_UNKNOWN")).toBe(true);
        });

        it("emits NO_REVOLVING_BALANCE when all cards have revolvingBalanceCents=0", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Amex", type: AccountType.CREDIT_CARD,
                    currentBalance: money(80000), revolvingBalanceCents: 0
                }),
            ];
            const obs = service.analyze(makeInput(accounts)).observations;
            expect(obs.some(o => o.code === "NO_REVOLVING_BALANCE")).toBe(true);
        });

        it("emits REVOLVING_BALANCE when revolvingBalanceCents > 0", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Amex", type: AccountType.CREDIT_CARD,
                    currentBalance: money(80000), revolvingBalanceCents: 60000
                }),
            ];
            const obs = service.analyze(makeInput(accounts)).observations;
            expect(obs.some(o => o.code === "REVOLVING_BALANCE")).toBe(true);
        });

        it("REVOLVING_BALANCE message includes the dollar amount", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Amex", type: AccountType.CREDIT_CARD,
                    currentBalance: money(80000), revolvingBalanceCents: 60000
                }),
            ];
            const obs = service.analyze(makeInput(accounts)).observations;
            const o = obs.find(o => o.code === "REVOLVING_BALANCE")!;
            expect(o.message).toContain("$600");
        });
    });

    // ── Credit-card payment / refund / balance scenarios ─────────────────────

    describe("credit-card payment and refund scenarios", () => {
        it("paid-in-full card (currentBalance=0) has zero currentBalanceCents in detail", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Chase", type: AccountType.CREDIT_CARD,
                    currentBalance: money(0), creditLimitCents: 500000
                }),
            ];
            const detail = service.analyze(makeInput(accounts)).accounts[0];
            expect(detail.currentBalanceCents).toBe(0);
            expect(detail.utilizationRatio).toBe(0);
        });

        it("card with pending refund (balance negative stored — take abs)", () => {
            // Some institutions report credit balances as negative
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Chase", type: AccountType.CREDIT_CARD,
                    currentBalance: money(-5000), creditLimitCents: 500000
                }),
            ];
            const detail = service.analyze(makeInput(accounts)).accounts[0];
            expect(detail.currentBalanceCents).toBe(5000);
        });

        it("card balance does not count toward totalDebt if zero", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Chase", type: AccountType.CREDIT_CARD,
                    currentBalance: money(0)
                }),
            ];
            expect(service.analyze(makeInput(accounts)).totalDebtCents).toBe(0);
        });

        it("statement balance is exposed in detail but not used for revolving", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Chase", type: AccountType.CREDIT_CARD,
                    currentBalance: money(120000),
                    statementBalanceCents: 115000,
                    revolvingBalanceCents: null
                }),
            ];
            const detail = service.analyze(makeInput(accounts)).accounts[0];
            expect(detail.statementBalanceCents).toBe(115000);
            expect(detail.revolvingBalanceCents).toBeNull();
        });
    });

    // ── Weighted average rate ────────────────────────────────────────────────

    describe("weightedAverageRateBps", () => {
        it("is null when any account is missing interestRateBps", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(100000), interestRateBps: 1975
                }),
                makeAccount({
                    id: id("l1"), name: "Loan", type: AccountType.LOAN,
                    currentBalance: money(500000), interestRateBps: null
                }),
            ];
            expect(service.analyze(makeInput(accounts)).weightedAverageRateBps).toBeNull();
        });

        it("is computed correctly when all accounts have rates", () => {
            // $1000 at 20% + $9000 at 5% → weighted = (1000*2000 + 9000*500)/10000 = 650 bps
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Card", type: AccountType.CREDIT_CARD,
                    currentBalance: money(100000), interestRateBps: 2000
                }),
                makeAccount({
                    id: id("l1"), name: "Loan", type: AccountType.LOAN,
                    currentBalance: money(900000), interestRateBps: 500
                }),
            ];
            const result = service.analyze(makeInput(accounts));
            expect(result.weightedAverageRateBps).toBe(650);
        });

        it("excludes zero-balance accounts from weighted calculation", () => {
            // Zero-balance card shouldn't influence the weighted rate
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Card A", type: AccountType.CREDIT_CARD,
                    currentBalance: money(0), interestRateBps: 2500
                }),
                makeAccount({
                    id: id("c2"), name: "Card B", type: AccountType.CREDIT_CARD,
                    currentBalance: money(100000), interestRateBps: 1800
                }),
            ];
            const result = service.analyze(makeInput(accounts));
            expect(result.weightedAverageRateBps).toBe(1800);
        });

        it("is null when all accounts have zero balance", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Card", type: AccountType.CREDIT_CARD,
                    currentBalance: money(0), interestRateBps: 1900
                }),
            ];
            expect(service.analyze(makeInput(accounts)).weightedAverageRateBps).toBeNull();
        });
    });

    // ── Payment totals ───────────────────────────────────────────────────────

    describe("totalMinimumPaymentCents", () => {
        it("is null when any active account is missing minimumPaymentCents", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(50000), minimumPaymentCents: 2500
                }),
                makeAccount({
                    id: id("l1"), name: "Loan", type: AccountType.LOAN,
                    currentBalance: money(100000), minimumPaymentCents: null
                }),
            ];
            expect(service.analyze(makeInput(accounts)).totalMinimumPaymentCents).toBeNull();
        });

        it("sums minimum payments when all are provided", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(50000), minimumPaymentCents: 2500
                }),
                makeAccount({
                    id: id("l1"), name: "Loan", type: AccountType.LOAN,
                    currentBalance: money(100000), minimumPaymentCents: 45000
                }),
            ];
            expect(service.analyze(makeInput(accounts)).totalMinimumPaymentCents).toBe(47500);
        });

        it("is 0 when no debt accounts", () => {
            expect(service.analyze(makeInput([])).totalMinimumPaymentCents).toBe(0);
        });
    });

    describe("totalScheduledPaymentCents", () => {
        it("is null when any active account is missing scheduledPaymentCents", () => {
            const accounts = [
                makeAccount({
                    id: id("l1"), name: "Loan A", type: AccountType.LOAN,
                    currentBalance: money(100000), scheduledPaymentCents: 50000
                }),
                makeAccount({
                    id: id("l2"), name: "Loan B", type: AccountType.LOAN,
                    currentBalance: money(100000), scheduledPaymentCents: null
                }),
            ];
            expect(service.analyze(makeInput(accounts)).totalScheduledPaymentCents).toBeNull();
        });

        it("sums scheduled payments when all are provided", () => {
            const accounts = [
                makeAccount({ id: id("l1"), name: "Car", type: AccountType.LOAN, currentBalance: money(800000), scheduledPaymentCents: 35000 }),
                makeAccount({ id: id("m1"), name: "Home", type: AccountType.MORTGAGE, currentBalance: money(30000000), scheduledPaymentCents: 200000 }),
            ];
            expect(service.analyze(makeInput(accounts)).totalScheduledPaymentCents).toBe(235000);
        });
    });

    // ── DTI ──────────────────────────────────────────────────────────────────

    describe("debtToIncomeRatio", () => {
        it("is null when monthlyIncomeCents is 0", () => {
            const accounts = [
                makeAccount({
                    id: id("l1"), name: "Loan", type: AccountType.LOAN,
                    currentBalance: money(100000), scheduledPaymentCents: 50000
                }),
            ];
            expect(service.analyze(makeInput(accounts, 0)).debtToIncomeRatio).toBeNull();
        });

        it("is null when payments are unknown", () => {
            const accounts = [
                makeAccount({
                    id: id("l1"), name: "Loan", type: AccountType.LOAN,
                    currentBalance: money(100000)
                }),
            ];
            expect(service.analyze(makeInput(accounts, 1000000)).debtToIncomeRatio).toBeNull();
        });

        it("uses scheduledPaymentCents when available", () => {
            const accounts = [
                makeAccount({
                    id: id("l1"), name: "Loan", type: AccountType.LOAN,
                    currentBalance: money(100000),
                    scheduledPaymentCents: 50000,
                    minimumPaymentCents: 20000
                }),
            ];
            // 50000 / 1000000 = 0.05
            expect(service.analyze(makeInput(accounts, 1000000)).debtToIncomeRatio).toBeCloseTo(0.05, 5);
        });

        it("falls back to minimumPaymentCents when scheduledPaymentCents is null", () => {
            const accounts = [
                makeAccount({
                    id: id("l1"), name: "Loan", type: AccountType.LOAN,
                    currentBalance: money(100000),
                    scheduledPaymentCents: null,
                    minimumPaymentCents: 20000
                }),
            ];
            // 20000 / 1000000 = 0.02
            expect(service.analyze(makeInput(accounts, 1000000)).debtToIncomeRatio).toBeCloseTo(0.02, 5);
        });
    });

    // ── Status thresholds ────────────────────────────────────────────────────

    describe("status thresholds", () => {
        it("HEALTHY with no debt", () => {
            expect(service.analyze(makeInput([])).status).toBe(DebtHealthStatus.HEALTHY);
        });

        it("WATCH when utilisation is > 30%", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(40000), creditLimitCents: 100000
                }),
            ];
            expect(service.analyze(makeInput(accounts)).status).toBe(DebtHealthStatus.WATCH);
        });

        it("AT_RISK when utilisation is > 50%", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(60000), creditLimitCents: 100000
                }),
            ];
            expect(service.analyze(makeInput(accounts)).status).toBe(DebtHealthStatus.AT_RISK);
        });

        it("CRITICAL when utilisation is > 75%", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(80000), creditLimitCents: 100000
                }),
            ];
            expect(service.analyze(makeInput(accounts)).status).toBe(DebtHealthStatus.CRITICAL);
        });

        it("WATCH when DTI > 28%", () => {
            const accounts = [
                makeAccount({
                    id: id("l1"), name: "Loan", type: AccountType.LOAN,
                    currentBalance: money(100000), scheduledPaymentCents: 30000
                }),
            ];
            // DTI = 30000/100000 = 0.30 → WATCH
            expect(service.analyze(makeInput(accounts, 100000)).status).toBe(DebtHealthStatus.WATCH);
        });

        it("AT_RISK when DTI > 36%", () => {
            const accounts = [
                makeAccount({
                    id: id("l1"), name: "Loan", type: AccountType.LOAN,
                    currentBalance: money(100000), scheduledPaymentCents: 40000
                }),
            ];
            expect(service.analyze(makeInput(accounts, 100000)).status).toBe(DebtHealthStatus.AT_RISK);
        });

        it("CRITICAL when DTI > 43%", () => {
            const accounts = [
                makeAccount({
                    id: id("l1"), name: "Loan", type: AccountType.LOAN,
                    currentBalance: money(100000), scheduledPaymentCents: 50000
                }),
            ];
            expect(service.analyze(makeInput(accounts, 100000)).status).toBe(DebtHealthStatus.CRITICAL);
        });

        it("escalates to highest applicable status (CRITICAL beats AT_RISK)", () => {
            // DTI 40% → AT_RISK; utilisation 80% → CRITICAL → result is CRITICAL
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(80000), creditLimitCents: 100000,
                    scheduledPaymentCents: 40000
                }),
            ];
            expect(service.analyze(makeInput(accounts, 100000)).status).toBe(DebtHealthStatus.CRITICAL);
        });
    });

    // ── APR disparity observation ─────────────────────────────────────────────

    describe("APR disparity", () => {
        it("emits HIGH_CARD_APR when card APR is >500 bps above other debt", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(50000), interestRateBps: 2200
                }),
                makeAccount({
                    id: id("l1"), name: "Car", type: AccountType.LOAN,
                    currentBalance: money(200000), interestRateBps: 500
                }),
            ];
            const obs = service.analyze(makeInput(accounts)).observations;
            expect(obs.some(o => o.code === "HIGH_CARD_APR")).toBe(true);
        });

        it("does NOT emit HIGH_CARD_APR when difference is ≤500 bps", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(50000), interestRateBps: 1200
                }),
                makeAccount({
                    id: id("l1"), name: "Car", type: AccountType.LOAN,
                    currentBalance: money(200000), interestRateBps: 800
                }),
            ];
            const obs = service.analyze(makeInput(accounts)).observations;
            expect(obs.some(o => o.code === "HIGH_CARD_APR")).toBe(false);
        });

        it("APR disparity message includes both rates", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(50000), interestRateBps: 2200
                }),
                makeAccount({
                    id: id("l1"), name: "Car", type: AccountType.LOAN,
                    currentBalance: money(200000), interestRateBps: 500
                }),
            ];
            const obs = service.analyze(makeInput(accounts)).observations;
            const o = obs.find(o => o.code === "HIGH_CARD_APR")!;
            expect(o.message).toContain("22.00%");
            expect(o.message).toContain("5.00%");
        });
    });

    // ── Observation guardrails ────────────────────────────────────────────────

    describe("observation guardrails", () => {
        it("statusDescription does not contain recommendation language", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(80000), creditLimitCents: 100000
                }),
            ];
            const desc = service.analyze(makeInput(accounts)).statusDescription;
            expect(desc).not.toMatch(/you should|we recommend|pay off|transfer your/i);
        });

        it("DTI observation includes percentage", () => {
            const accounts = [
                makeAccount({
                    id: id("l1"), name: "Loan", type: AccountType.LOAN,
                    currentBalance: money(100000), scheduledPaymentCents: 30000
                }),
            ];
            const obs = service.analyze(makeInput(accounts, 100000)).observations;
            const o = obs.find(o => o.code === "DTI_RATIO");
            expect(o?.message).toContain("30%");
        });

        it("HIGH_UTILISATION observation is emitted for each card over 50%", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(60000), creditLimitCents: 100000
                }),
                makeAccount({
                    id: id("c2"), name: "Mastercard", type: AccountType.CREDIT_CARD,
                    currentBalance: money(15000), creditLimitCents: 100000
                }),
            ];
            const obs = service.analyze(makeInput(accounts)).observations;
            const highUtil = obs.filter(o => o.code === "HIGH_UTILISATION");
            expect(highUtil).toHaveLength(1);
            expect(highUtil[0].message).toContain("Visa");
        });

        it("WEIGHTED_RATE observation is present when all rates known", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(100000), interestRateBps: 1900
                }),
            ];
            const obs = service.analyze(makeInput(accounts)).observations;
            expect(obs.some(o => o.code === "WEIGHTED_RATE")).toBe(true);
        });

        it("WEIGHTED_RATE observation is absent when rates are unknown", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(100000), interestRateBps: null
                }),
            ];
            const obs = service.analyze(makeInput(accounts)).observations;
            expect(obs.some(o => o.code === "WEIGHTED_RATE")).toBe(false);
        });
    });

    // ── DebtAccountDetail fields ──────────────────────────────────────────────

    describe("DebtAccountDetail fields", () => {
        it("includes accountId, accountName, accountType", () => {
            const accounts = [
                makeAccount({
                    id: id("c1"), name: "My Visa", type: AccountType.CREDIT_CARD,
                    currentBalance: money(50000)
                }),
            ];
            const detail = service.analyze(makeInput(accounts)).accounts[0];
            expect(detail.accountId).toBe("c1");
            expect(detail.accountName).toBe("My Visa");
            expect(detail.accountType).toBe(AccountType.CREDIT_CARD);
            expect(detail.category).toBe(DebtCategory.REVOLVING);
        });

        it("LOAN maps to INSTALLMENT category", () => {
            const accounts = [
                makeAccount({ id: id("l1"), name: "Car", type: AccountType.LOAN, currentBalance: money(100000) }),
            ];
            expect(service.analyze(makeInput(accounts)).accounts[0].category).toBe(DebtCategory.INSTALLMENT);
        });

        it("MORTGAGE maps to MORTGAGE category", () => {
            const accounts = [
                makeAccount({ id: id("m1"), name: "Home", type: AccountType.MORTGAGE, currentBalance: money(30000000) }),
            ];
            expect(service.analyze(makeInput(accounts)).accounts[0].category).toBe(DebtCategory.MORTGAGE);
        });
    });
});
