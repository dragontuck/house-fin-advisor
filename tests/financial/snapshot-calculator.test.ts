/**
 * Unit tests for FinancialSnapshotCalculator
 *
 * Tests cover:
 * - Normal calculations with Tucker Household data
 * - Edge cases (zero balances, negative balances, etc.)
 * - Error handling for unsupported account types
 * - Health status determination
 * - All metric calculations (cash, debt, assets, net worth, surplus)
 */

import {
    Account,
    AccountOwnership,
    AccountStatus,
    AccountType,
    EntityId,
    FinancialHealthStatus,
    Money,
    MoneyFromDollars,
    MoneyToDollars,
} from "@house-fin/contracts";
import {
    FinancialSnapshotCalculator,
    createFinancialSnapshotCalculator,
} from "@house-fin/domain";

describe("FinancialSnapshotCalculator", () => {
    let calculator: FinancialSnapshotCalculator;
    const householdId = EntityId("f47ac10b-58cc-4372-a567-0e02b2c3d479");
    const asOfDate = new Date("2026-08-12");

    beforeEach(() => {
        calculator = createFinancialSnapshotCalculator();
    });

    describe("Tucker Household - Expected Results", () => {
        /**
         * Tucker Household data:
         * - Checking: $7,200 (720,000 cents)
         * - Savings: $12,000 (1,200,000 cents)
         * - 401(k): $325,000 (32,500,000 cents)
         * - IRA: $85,000 (8,500,000 cents)
         * - Mortgage: -$240,000 (-24,000,000 cents)
         *
         * Expected results:
         * - Cash: $19,200
         * - Retirement: $410,000
         * - Debt: $240,000
         * - Net worth: $189,200
         * - Monthly income: $12,000
         * - Monthly expenses: $8,000
         * - Monthly surplus: $4,000
         */

        it("calculates cash correctly (CHECKING + SAVINGS)", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, MoneyFromDollars(7200)),
                createAccount("Savings", AccountType.SAVINGS, MoneyFromDollars(12000)),
                createAccount("401(k)", AccountType.RETIREMENT, MoneyFromDollars(325000)),
                createAccount("IRA", AccountType.RETIREMENT, MoneyFromDollars(85000)),
                createAccount("Mortgage", AccountType.MORTGAGE, MoneyFromDollars(-240000)),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(12000),
                monthlyEssentialExpenses: MoneyFromDollars(6800),
                monthlyDiscretionaryExpenses: MoneyFromDollars(1200),
                asOf: asOfDate,
            });

            // Cash should be checking + savings = 7,200 + 12,000 = 19,200
            expect(MoneyToDollars(snapshot.cash)).toBe(19200);
        });

        it("calculates debt correctly (MORTGAGE + LOAN + CREDIT_CARD as absolute value)", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, MoneyFromDollars(7200)),
                createAccount("Savings", AccountType.SAVINGS, MoneyFromDollars(12000)),
                createAccount("401(k)", AccountType.RETIREMENT, MoneyFromDollars(325000)),
                createAccount("IRA", AccountType.RETIREMENT, MoneyFromDollars(85000)),
                createAccount("Mortgage", AccountType.MORTGAGE, MoneyFromDollars(-240000)),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(12000),
                monthlyEssentialExpenses: MoneyFromDollars(6800),
                monthlyDiscretionaryExpenses: MoneyFromDollars(1200),
                asOf: asOfDate,
            });

            // Debt should be absolute value of mortgage = 240,000
            expect(MoneyToDollars(snapshot.debt)).toBe(240000);
        });

        it("calculates net worth correctly (all account balances summed)", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, MoneyFromDollars(7200)),
                createAccount("Savings", AccountType.SAVINGS, MoneyFromDollars(12000)),
                createAccount("401(k)", AccountType.RETIREMENT, MoneyFromDollars(325000)),
                createAccount("IRA", AccountType.RETIREMENT, MoneyFromDollars(85000)),
                createAccount("Mortgage", AccountType.MORTGAGE, MoneyFromDollars(-240000)),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(12000),
                monthlyEssentialExpenses: MoneyFromDollars(6800),
                monthlyDiscretionaryExpenses: MoneyFromDollars(1200),
                asOf: asOfDate,
            });

            // Net worth = 7,200 + 12,000 + 325,000 + 85,000 - 240,000 = 189,200
            expect(MoneyToDollars(snapshot.netWorth)).toBe(189200);
        });

        it("calculates monthly surplus correctly (income - essential - discretionary)", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, MoneyFromDollars(7200)),
                createAccount("Savings", AccountType.SAVINGS, MoneyFromDollars(12000)),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(12000),
                monthlyEssentialExpenses: MoneyFromDollars(6800),
                monthlyDiscretionaryExpenses: MoneyFromDollars(1200),
                asOf: asOfDate,
            });

            // Surplus = 12,000 - 6,800 - 1,200 = 4,000
            expect(MoneyToDollars(snapshot.monthlySurplus)).toBe(4000);
        });

        it("returns complete snapshot for Tucker Household", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, MoneyFromDollars(7200)),
                createAccount("Savings", AccountType.SAVINGS, MoneyFromDollars(12000)),
                createAccount("401(k)", AccountType.RETIREMENT, MoneyFromDollars(325000)),
                createAccount("IRA", AccountType.RETIREMENT, MoneyFromDollars(85000)),
                createAccount("Mortgage", AccountType.MORTGAGE, MoneyFromDollars(-240000)),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(12000),
                monthlyEssentialExpenses: MoneyFromDollars(6800),
                monthlyDiscretionaryExpenses: MoneyFromDollars(1200),
                asOf: asOfDate,
            });

            expect(MoneyToDollars(snapshot.cash)).toBe(19200);
            expect(MoneyToDollars(snapshot.debt)).toBe(240000);
            expect(MoneyToDollars(snapshot.netWorth)).toBe(189200);
            expect(MoneyToDollars(snapshot.monthlyIncome)).toBe(12000);
            expect(MoneyToDollars(snapshot.monthlyEssentialExpenses)).toBe(6800);
            expect(MoneyToDollars(snapshot.monthlyDiscretionaryExpenses)).toBe(1200);
            expect(MoneyToDollars(snapshot.monthlySurplus)).toBe(4000);
            expect(snapshot.householdId).toBe(householdId);
            expect(snapshot.asOf).toEqual(asOfDate);
            expect(snapshot.version).toBe(1);
            expect(snapshot.calculatedAt).toBeDefined();
            expect(snapshot.financialHealthStatus).toBeDefined();
        });
    });

    describe("Edge Cases - Zero and Empty Accounts", () => {
        it("handles empty account list", () => {
            const snapshot = calculator.calculate({
                householdId,
                accounts: [],
                monthlyIncome: MoneyFromDollars(5000),
                monthlyEssentialExpenses: MoneyFromDollars(3000),
                monthlyDiscretionaryExpenses: MoneyFromDollars(500),
                asOf: asOfDate,
            });

            expect(MoneyToDollars(snapshot.cash)).toBe(0);
            expect(MoneyToDollars(snapshot.debt)).toBe(0);
            expect(MoneyToDollars(snapshot.netWorth)).toBe(0);
        });

        it("handles zero-balance accounts", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, Money(0)),
                createAccount("Savings", AccountType.SAVINGS, Money(0)),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(5000),
                monthlyEssentialExpenses: MoneyFromDollars(3000),
                monthlyDiscretionaryExpenses: MoneyFromDollars(500),
                asOf: asOfDate,
            });

            expect(MoneyToDollars(snapshot.cash)).toBe(0);
            expect(MoneyToDollars(snapshot.debt)).toBe(0);
        });

        it("handles mixed positive and zero balances", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, MoneyFromDollars(5000)),
                createAccount("Savings", AccountType.SAVINGS, Money(0)),
                createAccount("Investment", AccountType.INVESTMENT, MoneyFromDollars(10000)),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(5000),
                monthlyEssentialExpenses: MoneyFromDollars(3000),
                monthlyDiscretionaryExpenses: MoneyFromDollars(500),
                asOf: asOfDate,
            });

            expect(MoneyToDollars(snapshot.cash)).toBe(5000);
            // Investment accounts included in net worth, not cash
            expect(MoneyToDollars(snapshot.netWorth)).toBe(15000);
        });
    });

    describe("Edge Cases - Liabilities and Negative Balances", () => {
        it("handles negative net worth (more debt than assets)", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, MoneyFromDollars(1000)),
                createAccount("Credit Card", AccountType.CREDIT_CARD, MoneyFromDollars(-50000)),
                createAccount("Loan", AccountType.LOAN, MoneyFromDollars(-100000)),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(3000),
                monthlyEssentialExpenses: MoneyFromDollars(2000),
                monthlyDiscretionaryExpenses: MoneyFromDollars(500),
                asOf: asOfDate,
            });

            expect(MoneyToDollars(snapshot.cash)).toBe(1000);
            expect(MoneyToDollars(snapshot.debt)).toBe(150000);
            expect(MoneyToDollars(snapshot.netWorth)).toBe(-149000);
        });

        it("handles multiple liability accounts correctly", () => {
            const accounts: Account[] = [
                createAccount("Credit Card", AccountType.CREDIT_CARD, MoneyFromDollars(-5000)),
                createAccount("Car Loan", AccountType.LOAN, MoneyFromDollars(-15000)),
                createAccount("Mortgage", AccountType.MORTGAGE, MoneyFromDollars(-200000)),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(5000),
                monthlyEssentialExpenses: MoneyFromDollars(3000),
                monthlyDiscretionaryExpenses: MoneyFromDollars(500),
                asOf: asOfDate,
            });

            // Debt should be sum of all absolute values: 5,000 + 15,000 + 200,000
            expect(MoneyToDollars(snapshot.debt)).toBe(220000);
        });

        it("handles positive balance in liability account (overpayment)", () => {
            // Positive credit card balance = credit/overpayment, not debt
            const accounts: Account[] = [
                createAccount("Credit Card", AccountType.CREDIT_CARD, MoneyFromDollars(500)), // Credit (positive)
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(3000),
                monthlyEssentialExpenses: MoneyFromDollars(2000),
                monthlyDiscretionaryExpenses: MoneyFromDollars(500),
                asOf: asOfDate,
            });

            // Positive credit card balance: no debt from this account, positive contribution to net worth
            expect(MoneyToDollars(snapshot.debt)).toBe(0);
            expect(MoneyToDollars(snapshot.netWorth)).toBe(500); // Positive balance counts as asset
        });
    });

    describe("Edge Cases - Inactive and Closed Accounts", () => {
        it("excludes inactive accounts from calculations", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, MoneyFromDollars(5000), AccountStatus.ACTIVE),
                createAccount(
                    "Old Savings",
                    AccountType.SAVINGS,
                    MoneyFromDollars(100000),
                    AccountStatus.INACTIVE
                ),
                createAccount("Mortgage", AccountType.MORTGAGE, MoneyFromDollars(-50000), AccountStatus.ACTIVE),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(5000),
                monthlyEssentialExpenses: MoneyFromDollars(3000),
                monthlyDiscretionaryExpenses: MoneyFromDollars(500),
                asOf: asOfDate,
            });

            // Should not include inactive savings
            expect(MoneyToDollars(snapshot.cash)).toBe(5000);
            expect(MoneyToDollars(snapshot.netWorth)).toBe(-45000);
        });

        it("excludes closed accounts from calculations", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, MoneyFromDollars(5000), AccountStatus.ACTIVE),
                createAccount("Closed Savings", AccountType.SAVINGS, MoneyFromDollars(50000), AccountStatus.CLOSED),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(5000),
                monthlyEssentialExpenses: MoneyFromDollars(3000),
                monthlyDiscretionaryExpenses: MoneyFromDollars(500),
                asOf: asOfDate,
            });

            expect(MoneyToDollars(snapshot.cash)).toBe(5000);
        });
    });

    describe("Edge Cases - Monthly Surplus", () => {
        it("calculates negative surplus correctly", () => {
            const snapshot = calculator.calculate({
                householdId,
                accounts: [],
                monthlyIncome: MoneyFromDollars(3000),
                monthlyEssentialExpenses: MoneyFromDollars(2000),
                monthlyDiscretionaryExpenses: MoneyFromDollars(1500),
                asOf: asOfDate,
            });

            // Surplus = 3,000 - 2,000 - 1,500 = -500
            expect(MoneyToDollars(snapshot.monthlySurplus)).toBe(-500);
        });

        it("handles zero surplus", () => {
            const snapshot = calculator.calculate({
                householdId,
                accounts: [],
                monthlyIncome: MoneyFromDollars(5000),
                monthlyEssentialExpenses: MoneyFromDollars(3000),
                monthlyDiscretionaryExpenses: MoneyFromDollars(2000),
                asOf: asOfDate,
            });

            expect(MoneyToDollars(snapshot.monthlySurplus)).toBe(0);
        });

        it("handles zero income and expenses", () => {
            const snapshot = calculator.calculate({
                householdId,
                accounts: [],
                monthlyIncome: Money(0),
                monthlyEssentialExpenses: Money(0),
                monthlyDiscretionaryExpenses: Money(0),
                asOf: asOfDate,
            });

            expect(MoneyToDollars(snapshot.monthlySurplus)).toBe(0);
        });
    });

    describe("Financial Health Status Determination", () => {
        it("marks household as HEALTHY with strong finances", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, MoneyFromDollars(50000)),
                createAccount("Savings", AccountType.SAVINGS, MoneyFromDollars(100000)),
                createAccount("401(k)", AccountType.RETIREMENT, MoneyFromDollars(500000)),
                createAccount("IRA", AccountType.RETIREMENT, MoneyFromDollars(200000)),
                createAccount("Mortgage", AccountType.MORTGAGE, MoneyFromDollars(-200000)),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(10000),
                monthlyEssentialExpenses: MoneyFromDollars(4000),
                monthlyDiscretionaryExpenses: MoneyFromDollars(1000),
                asOf: asOfDate,
            });

            // High net worth, low debt-to-income, positive surplus
            expect(snapshot.financialHealthStatus).toBe(FinancialHealthStatus.HEALTHY);
        });

        it("marks household as AT_RISK with negative surplus", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, MoneyFromDollars(1000)),
                createAccount("Credit Card", AccountType.CREDIT_CARD, MoneyFromDollars(-10000)),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(3000),
                monthlyEssentialExpenses: MoneyFromDollars(2000),
                monthlyDiscretionaryExpenses: MoneyFromDollars(1500), // Deficit
                asOf: asOfDate,
            });

            expect(snapshot.financialHealthStatus).toBe(FinancialHealthStatus.AT_RISK);
        });

        it("marks household as AT_RISK with negative net worth", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, MoneyFromDollars(5000)),
                createAccount("Credit Card", AccountType.CREDIT_CARD, MoneyFromDollars(-100000)),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(5000),
                monthlyEssentialExpenses: MoneyFromDollars(3000),
                monthlyDiscretionaryExpenses: MoneyFromDollars(500),
                asOf: asOfDate,
            });

            expect(snapshot.financialHealthStatus).toBe(FinancialHealthStatus.AT_RISK);
        });

        it("marks household as WATCH for moderate finances", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, MoneyFromDollars(10000)),
                createAccount("Savings", AccountType.SAVINGS, MoneyFromDollars(20000)),
                createAccount("Mortgage", AccountType.MORTGAGE, MoneyFromDollars(-150000)),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(5000),
                monthlyEssentialExpenses: MoneyFromDollars(3000),
                monthlyDiscretionaryExpenses: MoneyFromDollars(500),
                asOf: asOfDate,
            });

            // Moderate finances - not healthy, not at risk
            expect(snapshot.financialHealthStatus).toBe(FinancialHealthStatus.WATCH);
        });

        it("marks Tucker Household with correct status", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, MoneyFromDollars(7200)),
                createAccount("Savings", AccountType.SAVINGS, MoneyFromDollars(12000)),
                createAccount("401(k)", AccountType.RETIREMENT, MoneyFromDollars(325000)),
                createAccount("IRA", AccountType.RETIREMENT, MoneyFromDollars(85000)),
                createAccount("Mortgage", AccountType.MORTGAGE, MoneyFromDollars(-240000)),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(12000),
                monthlyEssentialExpenses: MoneyFromDollars(6800),
                monthlyDiscretionaryExpenses: MoneyFromDollars(1200),
                asOf: asOfDate,
            });

            // Tucker has positive surplus, decent net worth relative to income
            // Should be HEALTHY or ATTENTION
            expect([FinancialHealthStatus.HEALTHY, FinancialHealthStatus.WATCH]).toContain(
                snapshot.financialHealthStatus
            );
        });
    });

    describe("Error Handling - Unsupported Account Types", () => {
        it("throws error for unsupported account type", () => {
            const accounts: Account[] = [
                {
                    id: EntityId("test-id"),
                    householdId,
                    name: "Unknown",
                    type: "UNKNOWN_TYPE" as AccountType, // Force invalid type
                    ownership: AccountOwnership.INDIVIDUAL,
                    currency: "USD",
                    currentBalance: Money(0),
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
            ];

            expect(() => {
                calculator.calculate({
                    householdId,
                    accounts,
                    monthlyIncome: MoneyFromDollars(5000),
                    monthlyEssentialExpenses: MoneyFromDollars(3000),
                    monthlyDiscretionaryExpenses: MoneyFromDollars(500),
                    asOf: asOfDate,
                });
            }).toThrow("Unsupported account type");
        });
    });

    describe("Factory Function", () => {
        it("creates calculator instance", () => {
            const calc = createFinancialSnapshotCalculator();
            expect(calc).toBeInstanceOf(FinancialSnapshotCalculator);
        });
    });

    describe("Large Values and Precision", () => {
        it("handles large account balances without precision loss", () => {
            const accounts: Account[] = [
                createAccount("Checking", AccountType.CHECKING, MoneyFromDollars(999999999.99)),
                createAccount("Retirement", AccountType.RETIREMENT, MoneyFromDollars(1000000000)),
            ];

            const snapshot = calculator.calculate({
                householdId,
                accounts,
                monthlyIncome: MoneyFromDollars(50000),
                monthlyEssentialExpenses: MoneyFromDollars(20000),
                monthlyDiscretionaryExpenses: MoneyFromDollars(10000),
                asOf: asOfDate,
            });

            // Values should be preserved exactly
            expect(MoneyToDollars(snapshot.cash)).toBeCloseTo(999999999.99, 2);
            expect(MoneyToDollars(snapshot.netWorth)).toBeCloseTo(1999999999.99, 2);
        });
    });

    describe("Money Type Edge Cases", () => {
        it("rejects fractional cents when creating Money", () => {
            expect(() => {
                Money(123.456); // Fractional cents not allowed
            }).toThrow("Money must be an integer number of cents");
        });

        it("accepts integer cents", () => {
            expect(() => {
                Money(12345);
            }).not.toThrow();
        });

        it("accepts zero cents", () => {
            expect(() => {
                Money(0);
            }).not.toThrow();
        });

        it("accepts negative cents", () => {
            expect(() => {
                Money(-50000);
            }).not.toThrow();
        });

        it("converts dollars correctly to cents", () => {
            const money = MoneyFromDollars(100.5);
            // 100.5 dollars = 10050 cents
            expect(money).toBe(10050);
            expect(MoneyToDollars(money)).toBe(100.5);
        });

        it("rounds dollars to nearest cent on conversion", () => {
            // 123.456 dollars should round to 12346 cents
            const money = MoneyFromDollars(123.456);
            expect(money).toBe(12346);
            expect(MoneyToDollars(money)).toBeCloseTo(123.46, 2);
        });

        it("handles very large dollar amounts", () => {
            const largeAmount = MoneyFromDollars(1000000000); // 1 billion dollars
            expect(largeAmount).toBe(100000000000); // 100 billion cents
            expect(MoneyToDollars(largeAmount)).toBe(1000000000);
        });

        it("handles very small dollar amounts", () => {
            const smallAmount = MoneyFromDollars(0.01); // 1 cent
            expect(smallAmount).toBe(1);
            expect(MoneyToDollars(smallAmount)).toBe(0.01);
        });

        it("preserves precision in calculations with multiple operations", () => {
            // Test that multiple Money operations don't lose precision
            const m1 = MoneyFromDollars(100.25);
            const m2 = MoneyFromDollars(50.75);
            const sum = (m1 + m2) as Money;

            expect(MoneyToDollars(sum)).toBe(151);
        });

        it("handles subtraction without precision loss", () => {
            const m1 = MoneyFromDollars(500.99);
            const m2 = MoneyFromDollars(200.49);
            const diff = (m1 - m2) as Money;

            expect(MoneyToDollars(diff)).toBe(300.50);
        });
    });
});

// Helper function to create test account
function createAccount(
    name: string,
    type: AccountType,
    balance: Money,
    status: AccountStatus = AccountStatus.ACTIVE
): Account {
    return {
        id: EntityId(`${name}-id`),
        householdId: EntityId("test-household"),
        name,
        type,
        ownership: AccountOwnership.INDIVIDUAL,
        currency: "USD",
        currentBalance: balance,
        status,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUpdatedAt: new Date(),
    };
}
