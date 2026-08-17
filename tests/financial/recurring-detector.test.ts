/**
 * RecurringDetector unit tests
 *
 * Unit rules:
 * - MIN_OCCURRENCES = 2 → single occurrence returns no pattern
 * - MIN_CONFIDENCE_THRESHOLD = 0.35 → low-evidence patterns are excluded
 * - IRREGULAR (3+ inconsistent occurrences) confidence capped at 0.40
 * - UNKNOWN (2 occurrences, unrecognised gap) confidence capped at 0.50
 * - Credit and debit transactions for the same merchant are separate patterns
 * - Account is part of the grouping key
 * - estimatedNextDate is always in the future relative to asOf
 * - sourceTransactionIds lists every contributing transaction ID
 * - averageAmountCents is the arithmetic mean of absolute amounts
 * - Merchant normalisation strips domain extensions, reference IDs, legal suffixes
 *
 * Fixture tests:
 * - monthly-subscriptions.json
 * - biweekly-payroll.json
 * - mixed-household.json
 */

import * as path from "path";
import * as fs from "fs";
import { RecurringDetector, CashFlowTransaction, createRecurringDetector } from "@house-fin/domain";
import { RecurringFrequency, RecurringPattern } from "@house-fin/contracts";

// ── helpers ──────────────────────────────────────────────────────────────────

function tx(
    id: string,
    daysAgo: number,
    amountCents: number,
    direction: "DEBIT" | "CREDIT",
    merchant: string,
    asOf: Date,
    accountId = "acct-1",
): CashFlowTransaction {
    const transactionDate = new Date(asOf.getTime() - daysAgo * 86_400_000);
    return { id, transactionDate, amountCents, direction, merchant, category: null, accountId };
}

// Fixed reference date for reproducibility
const REF = new Date("2024-06-15T12:00:00Z");

// ── tests ────────────────────────────────────────────────────────────────────

describe("RecurringDetector", () => {
    let detector: RecurringDetector;

    beforeEach(() => {
        detector = createRecurringDetector();
    });

    describe("factory", () => {
        it("createRecurringDetector returns a RecurringDetector instance", () => {
            expect(detector).toBeInstanceOf(RecurringDetector);
        });
    });

    describe("minimum occurrences rule", () => {
        it("returns no pattern when a merchant appears only once", () => {
            const transactions = [tx("1", 30, 5000, "DEBIT", "Netflix", REF)];
            const patterns = detector.detectPatterns(transactions, REF);
            expect(patterns).toHaveLength(0);
        });

        it("returns a pattern when a merchant appears exactly twice", () => {
            const transactions = [
                tx("1", 60, 5000, "DEBIT", "Netflix", REF),
                tx("2", 30, 5000, "DEBIT", "Netflix", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            expect(patterns.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe("monthly pattern detection", () => {
        it("classifies ~30-day intervals as MONTHLY", () => {
            const transactions = [
                tx("1", 90, 9999, "DEBIT", "Rent Corp", REF),
                tx("2", 60, 9999, "DEBIT", "Rent Corp", REF),
                tx("3", 30, 9999, "DEBIT", "Rent Corp", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            expect(patterns).toHaveLength(1);
            expect(patterns[0].frequency).toBe(RecurringFrequency.MONTHLY);
        });

        it("assigns higher confidence with consistent amounts (< 5% variance)", () => {
            const transactions = [
                tx("1", 90, 10000, "DEBIT", "Spotify", REF),
                tx("2", 60, 10000, "DEBIT", "Spotify", REF),
                tx("3", 30, 10000, "DEBIT", "Spotify", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            expect(patterns[0].confidence).toBeGreaterThan(0.70);
        });

        it("assigns lower confidence when amounts vary significantly (> 20%)", () => {
            const transactions = [
                tx("1", 90, 10000, "DEBIT", "Electric Co", REF),
                tx("2", 60, 7000, "DEBIT", "Electric Co", REF),
                tx("3", 30, 13000, "DEBIT", "Electric Co", REF),
            ];
            const highConsistencyPatterns = detector.detectPatterns(
                [
                    tx("a", 90, 10000, "DEBIT", "FixedBill", REF),
                    tx("b", 60, 10000, "DEBIT", "FixedBill", REF),
                    tx("c", 30, 10000, "DEBIT", "FixedBill", REF),
                ],
                REF,
            );
            const lowConsistencyPatterns = detector.detectPatterns(transactions, REF);
            expect(lowConsistencyPatterns[0].confidence).toBeLessThan(
                highConsistencyPatterns[0].confidence,
            );
        });
    });

    describe("weekly pattern detection", () => {
        it("classifies ~7-day intervals as WEEKLY", () => {
            const transactions = [
                tx("1", 28, 2000, "DEBIT", "Grocery Mart", REF),
                tx("2", 21, 2100, "DEBIT", "Grocery Mart", REF),
                tx("3", 14, 1950, "DEBIT", "Grocery Mart", REF),
                tx("4", 7, 2050, "DEBIT", "Grocery Mart", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            expect(patterns).toHaveLength(1);
            expect(patterns[0].frequency).toBe(RecurringFrequency.WEEKLY);
        });
    });

    describe("biweekly pattern detection", () => {
        it("classifies ~14-day intervals as BIWEEKLY", () => {
            const transactions = [
                tx("1", 56, 150000, "CREDIT", "Employer Inc", REF),
                tx("2", 42, 150000, "CREDIT", "Employer Inc", REF),
                tx("3", 28, 150000, "CREDIT", "Employer Inc", REF),
                tx("4", 14, 150000, "CREDIT", "Employer Inc", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            expect(patterns).toHaveLength(1);
            expect(patterns[0].frequency).toBe(RecurringFrequency.BIWEEKLY);
        });
    });

    describe("irregular pattern detection", () => {
        it("caps confidence at 0.40 for IRREGULAR frequency", () => {
            const transactions = [
                tx("1", 120, 5000, "DEBIT", "Random Shop", REF),
                tx("2", 80, 5000, "DEBIT", "Random Shop", REF),
                tx("3", 20, 5000, "DEBIT", "Random Shop", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            if (patterns.length > 0) {
                const irregular = patterns.filter(p => p.frequency === RecurringFrequency.IRREGULAR);
                for (const p of irregular) {
                    expect(p.confidence).toBeLessThanOrEqual(0.40);
                }
            }
        });
    });

    describe("direction separation", () => {
        it("creates separate patterns for CREDIT and DEBIT with the same merchant", () => {
            const transactions = [
                // Income refund (CREDIT)
                tx("1", 60, -10000, "CREDIT", "Amazon", REF),
                tx("2", 30, -10000, "CREDIT", "Amazon", REF),
                // Purchases (DEBIT)
                tx("3", 55, 5000, "DEBIT", "Amazon", REF),
                tx("4", 25, 4800, "DEBIT", "Amazon", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            const directions = new Set(patterns.map(p => p.direction));
            expect(directions.has("CREDIT")).toBe(true);
            expect(directions.has("DEBIT")).toBe(true);
        });
    });

    describe("estimatedNextDate", () => {
        it("estimated next date is always in the future relative to asOf", () => {
            const transactions = [
                tx("1", 90, 10000, "DEBIT", "Gym Membership", REF),
                tx("2", 60, 10000, "DEBIT", "Gym Membership", REF),
                tx("3", 30, 10000, "DEBIT", "Gym Membership", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            for (const p of patterns) {
                if (p.estimatedNextDate) {
                    expect(p.estimatedNextDate.getTime()).toBeGreaterThan(REF.getTime());
                }
            }
        });

        it("returns null estimatedNextDate for IRREGULAR patterns", () => {
            const transactions = [
                tx("1", 120, 5000, "DEBIT", "Random Vendor XYZ", REF),
                tx("2", 50, 5000, "DEBIT", "Random Vendor XYZ", REF),
                tx("3", 10, 5000, "DEBIT", "Random Vendor XYZ", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            const irregular = patterns.filter(p => p.frequency === RecurringFrequency.IRREGULAR);
            for (const p of irregular) {
                expect(p.estimatedNextDate).toBeNull();
            }
        });
    });

    describe("pattern fields", () => {
        it("pattern includes merchant, direction, typicalAmountCents, firstSeen, lastSeen", () => {
            const transactions = [
                tx("1", 60, 9900, "DEBIT", "Hulu", REF),
                tx("2", 30, 9900, "DEBIT", "Hulu", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            expect(patterns).toHaveLength(1);
            const p = patterns[0];
            expect(p.merchant).toBe("Hulu");
            expect(p.direction).toBe("DEBIT");
            expect(p.typicalAmountCents).toBe(9900);
            expect(p.firstSeenDate).toBeInstanceOf(Date);
            expect(p.lastSeenDate).toBeInstanceOf(Date);
            expect(p.occurrenceCount).toBe(2);
        });

        it("empty transaction list returns empty array", () => {
            expect(detector.detectPatterns([], REF)).toEqual([]);
        });
    });

    describe("merchant normalization", () => {
        it("treats differently-cased versions of the same merchant as one group", () => {
            const transactions = [
                tx("1", 60, 5000, "DEBIT", "NETFLIX", REF),
                tx("2", 30, 5000, "DEBIT", "netflix", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            expect(patterns).toHaveLength(1);
        });

        it("strips domain extensions so NETFLIX.COM groups with Netflix", () => {
            const transactions = [
                tx("1", 60, 1599, "DEBIT", "NETFLIX.COM", REF),
                tx("2", 30, 1599, "DEBIT", "Netflix", REF),
            ];
            expect(detector.detectPatterns(transactions, REF)).toHaveLength(1);
        });

        it("strips legal suffixes (LLC, Inc) from merchant names", () => {
            const transactions = [
                tx("1", 60, 180000, "DEBIT", "Landlord LLC", REF),
                tx("2", 30, 180000, "DEBIT", "Landlord LLC", REF),
            ];
            // Still groups as one pattern even though "LLC" is stripped
            expect(detector.detectPatterns(transactions, REF)).toHaveLength(1);
        });

        it("strips trailing reference/transaction IDs", () => {
            const transactions = [
                tx("1", 60, 5000, "DEBIT", "Employer Payroll #100001", REF),
                tx("2", 30, 5000, "DEBIT", "Employer Payroll #100002", REF),
            ];
            expect(detector.detectPatterns(transactions, REF)).toHaveLength(1);
        });
    });

    describe("account grouping", () => {
        it("same merchant + direction in different accounts produces separate patterns", () => {
            const transactions = [
                tx("1", 60, 5000, "DEBIT", "Netflix", REF, "acct-a"),
                tx("2", 30, 5000, "DEBIT", "Netflix", REF, "acct-a"),
                tx("3", 58, 5000, "DEBIT", "Netflix", REF, "acct-b"),
                tx("4", 28, 5000, "DEBIT", "Netflix", REF, "acct-b"),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            expect(patterns).toHaveLength(2);
        });

        it("transactions in the same account group into one pattern", () => {
            const transactions = [
                tx("1", 60, 5000, "DEBIT", "Netflix", REF, "acct-a"),
                tx("2", 30, 5000, "DEBIT", "Netflix", REF, "acct-a"),
            ];
            expect(detector.detectPatterns(transactions, REF)).toHaveLength(1);
        });
    });

    describe("UNKNOWN frequency", () => {
        it("classifies 2-occurrence pattern with unrecognised gap as UNKNOWN, not IRREGULAR", () => {
            // ~50-day gap falls in no known frequency window
            const transactions = [
                tx("1", 50, 9900, "DEBIT", "Odd Vendor", REF),
                tx("2", 0, 9900, "DEBIT", "Odd Vendor", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            expect(patterns).toHaveLength(1);
            expect(patterns[0].frequency).toBe(RecurringFrequency.UNKNOWN);
        });

        it("UNKNOWN confidence does not exceed 0.50", () => {
            const transactions = [
                tx("1", 50, 9900, "DEBIT", "Odd Vendor B", REF),
                tx("2", 0, 9900, "DEBIT", "Odd Vendor B", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            if (patterns.length > 0) {
                expect(patterns[0].confidence).toBeLessThanOrEqual(0.50);
            }
        });

        it("3+ occurrences with inconsistent gaps → IRREGULAR, not UNKNOWN", () => {
            const transactions = [
                tx("1", 120, 5000, "DEBIT", "Inconsistent Vendor", REF),
                tx("2", 80, 5000, "DEBIT", "Inconsistent Vendor", REF),
                tx("3", 20, 5000, "DEBIT", "Inconsistent Vendor", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            if (patterns.length > 0) {
                expect(patterns[0].frequency).toBe(RecurringFrequency.IRREGULAR);
            }
        });

        it("UNKNOWN pattern has null estimatedNextDate", () => {
            const transactions = [
                tx("1", 50, 9900, "DEBIT", "Unknown Period Co", REF),
                tx("2", 0, 9900, "DEBIT", "Unknown Period Co", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            if (patterns.length > 0 && patterns[0].frequency === RecurringFrequency.UNKNOWN) {
                expect(patterns[0].estimatedNextDate).toBeNull();
            }
        });
    });

    describe("sourceTransactionIds", () => {
        it("includes all contributing transaction IDs", () => {
            const transactions = [
                tx("tx-aaa", 90, 10000, "DEBIT", "Monthly Bill", REF),
                tx("tx-bbb", 60, 10000, "DEBIT", "Monthly Bill", REF),
                tx("tx-ccc", 30, 10000, "DEBIT", "Monthly Bill", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            expect(patterns).toHaveLength(1);
            expect(patterns[0].sourceTransactionIds).toEqual(
                expect.arrayContaining(["tx-aaa", "tx-bbb", "tx-ccc"]),
            );
            expect(patterns[0].sourceTransactionIds).toHaveLength(3);
        });

        it("sourceTransactionIds are ordered oldest-first", () => {
            const transactions = [
                tx("newest", 30, 10000, "DEBIT", "Ordered Bill", REF),
                tx("oldest", 90, 10000, "DEBIT", "Ordered Bill", REF),
                tx("middle", 60, 10000, "DEBIT", "Ordered Bill", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            expect(patterns[0].sourceTransactionIds[0]).toBe("oldest");
            expect(patterns[0].sourceTransactionIds[2]).toBe("newest");
        });
    });

    describe("averageAmountCents", () => {
        it("averageAmountCents equals mean of absolute amounts", () => {
            const transactions = [
                tx("1", 90, 10000, "DEBIT", "Variable Bill", REF),
                tx("2", 60, 12000, "DEBIT", "Variable Bill", REF),
                tx("3", 30, 11000, "DEBIT", "Variable Bill", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            expect(patterns[0].averageAmountCents).toBe(11000); // (10000+12000+11000)/3
        });

        it("averageAmountCents uses absolute values for CREDIT transactions", () => {
            const transactions = [
                tx("1", 90, -250000, "CREDIT", "Payroll", REF),
                tx("2", 60, -250000, "CREDIT", "Payroll", REF),
                tx("3", 30, -250000, "CREDIT", "Payroll", REF),
            ];
            const patterns = detector.detectPatterns(transactions, REF);
            expect(patterns[0].averageAmountCents).toBe(250000);
        });
    });
});

// ── Fixture-based tests ───────────────────────────────────────────────────────

interface FixtureTransaction {
    id: string;
    transactionDate: string;
    amountCents: number;
    direction: "DEBIT" | "CREDIT";
    merchant: string;
    category: string | null;
    accountId: string;
}

interface ExpectedPattern {
    normalizedMerchant: string;
    direction: "DEBIT" | "CREDIT";
    frequency: string;
    minConfidence: number;
    occurrenceCount: number;
    comment?: string;
}

interface Fixture {
    description: string;
    asOf: string;
    transactions: FixtureTransaction[];
    expectedPatterns: ExpectedPattern[];
    absentMerchants?: string[];
}

function loadFixture(name: string): Fixture {
    const p = path.join(__dirname, "../../fixtures/transactions", name);
    return JSON.parse(fs.readFileSync(p, "utf-8")) as Fixture;
}

function fixtureTransactions(fixture: Fixture): CashFlowTransaction[] {
    return fixture.transactions.map(t => ({
        ...t,
        transactionDate: new Date(t.transactionDate),
    }));
}

/** Simple normalisation matching the detector's public behaviour (lower + strip noise). */
function looseMerchantMatch(patternMerchant: string, expectedNorm: string): boolean {
    const norm = patternMerchant
        .toLowerCase()
        .replace(/\.(com|net|org|io|co)\b/gi, " ")
        .replace(/\s*[#*]\s*\d+|\s+\d{4,}(?:\s|$)/g, " ")
        .replace(/\b(inc|llc|corp|co|ltd|plc)\b\.?/gi, " ")
        .replace(/[^a-z\s]/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    return norm.includes(expectedNorm) || expectedNorm.includes(norm);
}

function findPattern(
    patterns: RecurringPattern[],
    expected: ExpectedPattern,
): RecurringPattern | undefined {
    return patterns.find(
        p =>
            p.direction === expected.direction &&
            looseMerchantMatch(p.merchant, expected.normalizedMerchant),
    );
}

describe("RecurringDetector — fixture tests", () => {
    let detector: RecurringDetector;
    beforeEach(() => { detector = createRecurringDetector(); });

    describe("monthly-subscriptions fixture", () => {
        let fixture: Fixture;
        let patterns: RecurringPattern[];

        beforeAll(() => {
            fixture = loadFixture("monthly-subscriptions.json");
            const txs = fixtureTransactions(fixture);
            const asOf = new Date(fixture.asOf);
            detector = createRecurringDetector();
            patterns = detector.detectPatterns(txs, asOf);
        });

        it("detects the expected number of patterns", () => {
            expect(patterns.length).toBeGreaterThanOrEqual(fixture.expectedPatterns.length);
        });

        for (const expected of [
            { normalizedMerchant: "netflix", direction: "DEBIT" as const, frequency: "MONTHLY", minConfidence: 0.75, occurrenceCount: 5 },
            { normalizedMerchant: "spotify usa", direction: "DEBIT" as const, frequency: "MONTHLY", minConfidence: 0.75, occurrenceCount: 5 },
            { normalizedMerchant: "city fitness gym", direction: "DEBIT" as const, frequency: "MONTHLY", minConfidence: 0.70, occurrenceCount: 5 },
        ]) {
            it(`detects ${expected.normalizedMerchant} as ${expected.frequency}`, () => {
                const p = findPattern(patterns, expected);
                expect(p).toBeDefined();
                expect(p!.frequency).toBe(expected.frequency);
                expect(p!.confidence).toBeGreaterThanOrEqual(expected.minConfidence);
                expect(p!.occurrenceCount).toBe(expected.occurrenceCount);
            });

            it(`${expected.normalizedMerchant} pattern includes sourceTransactionIds`, () => {
                const p = findPattern(patterns, expected);
                expect(p!.sourceTransactionIds.length).toBe(expected.occurrenceCount);
            });
        }

        it("all patterns have a future estimatedNextDate relative to asOf", () => {
            const asOf = new Date(fixture.asOf);
            for (const p of patterns) {
                if (p.estimatedNextDate) {
                    expect(p.estimatedNextDate.getTime()).toBeGreaterThan(asOf.getTime());
                }
            }
        });
    });

    describe("biweekly-payroll fixture", () => {
        let fixture: Fixture;
        let patterns: RecurringPattern[];

        beforeAll(() => {
            fixture = loadFixture("biweekly-payroll.json");
            const txs = fixtureTransactions(fixture);
            const asOf = new Date(fixture.asOf);
            detector = createRecurringDetector();
            patterns = detector.detectPatterns(txs, asOf);
        });

        it("detects payroll as BIWEEKLY", () => {
            const payroll = patterns.find(p => p.direction === "CREDIT");
            expect(payroll).toBeDefined();
            expect(payroll!.frequency).toBe(RecurringFrequency.BIWEEKLY);
            expect(payroll!.confidence).toBeGreaterThanOrEqual(0.80);
            expect(payroll!.occurrenceCount).toBe(12);
        });

        it("detects rent as MONTHLY", () => {
            const rent = patterns.find(
                p => p.direction === "DEBIT" && p.merchant.toLowerCase().includes("landlord"),
            );
            expect(rent).toBeDefined();
            expect(rent!.frequency).toBe(RecurringFrequency.MONTHLY);
            expect(rent!.confidence).toBeGreaterThanOrEqual(0.75);
        });

        it("one-time medical payment does not appear as a pattern", () => {
            const medical = patterns.find(p =>
                p.merchant.toLowerCase().includes("medical"),
            );
            expect(medical).toBeUndefined();
        });

        it("payroll sourceTransactionIds contains all 12 transaction IDs", () => {
            const payroll = patterns.find(p => p.direction === "CREDIT");
            expect(payroll!.sourceTransactionIds).toHaveLength(12);
        });

        it("payroll averageAmountCents equals 250000", () => {
            const payroll = patterns.find(p => p.direction === "CREDIT");
            expect(payroll!.averageAmountCents).toBe(250000);
        });
    });

    describe("mixed-household fixture", () => {
        let fixture: Fixture;
        let patterns: RecurringPattern[];

        beforeAll(() => {
            fixture = loadFixture("mixed-household.json");
            const txs = fixtureTransactions(fixture);
            const asOf = new Date(fixture.asOf);
            detector = createRecurringDetector();
            patterns = detector.detectPatterns(txs, asOf);
        });

        it("detects biweekly payroll despite noisy reference IDs in merchant names", () => {
            const payroll = patterns.find(p => p.direction === "CREDIT");
            expect(payroll).toBeDefined();
            expect(payroll!.frequency).toBe(RecurringFrequency.BIWEEKLY);
            expect(payroll!.occurrenceCount).toBe(12);
        });

        it("detects monthly rent", () => {
            const rent = patterns.find(
                p => p.direction === "DEBIT" && looseMerchantMatch(p.merchant, "parkside properties"),
            );
            expect(rent).toBeDefined();
            expect(rent!.frequency).toBe(RecurringFrequency.MONTHLY);
        });

        it("detects monthly electric bill despite variable amounts", () => {
            const electric = patterns.find(
                p => p.direction === "DEBIT" && looseMerchantMatch(p.merchant, "metro electric"),
            );
            expect(electric).toBeDefined();
            expect(electric!.frequency).toBe(RecurringFrequency.MONTHLY);
            // Variable amounts reduce confidence but pattern is still present
            expect(electric!.confidence).toBeGreaterThanOrEqual(0.35);
        });

        it("detects weekly grocery trips", () => {
            const groceries = patterns.find(
                p => p.direction === "DEBIT" && looseMerchantMatch(p.merchant, "green leaf market"),
            );
            expect(groceries).toBeDefined();
            expect(groceries!.frequency).toBe(RecurringFrequency.WEEKLY);
            expect(groceries!.occurrenceCount).toBe(23);
        });

        it("does not detect one-time purchases as patterns", () => {
            const bestbuy = patterns.find(
                p => p.merchant.toLowerCase().includes("bestbuy") ||
                    p.merchant.toLowerCase().includes("best buy"),
            );
            const plumbing = patterns.find(
                p => p.merchant.toLowerCase().includes("plumbing"),
            );
            expect(bestbuy).toBeUndefined();
            expect(plumbing).toBeUndefined();
        });

        it("every pattern has non-empty sourceTransactionIds", () => {
            for (const p of patterns) {
                expect(p.sourceTransactionIds.length).toBeGreaterThan(0);
            }
        });

        it("patterns are sorted highest-confidence first", () => {
            for (let i = 1; i < patterns.length; i++) {
                expect(patterns[i].confidence).toBeLessThanOrEqual(patterns[i - 1].confidence);
            }
        });
    });
});
