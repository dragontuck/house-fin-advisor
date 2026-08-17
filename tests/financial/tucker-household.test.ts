/**
 * Tucker Household Validation Test
 *
 * This test explicitly validates the FinancialSnapshotCalculator
 * using the seeded Tucker Household data against expected results.
 *
 * Expected Results:
 * - Cash: $19,200
 * - Debt: $240,000
 * - Net worth: $189,200
 * - Monthly income: $12,000
 * - Monthly essential expenses: $6,800
 * - Monthly discretionary expenses: $1,200
 * - Monthly surplus: $4,000
 * - Health status: HEALTHY or WATCH
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
import { FinancialSnapshotCalculator, createFinancialSnapshotCalculator } from "@house-fin/domain";

describe("Tucker Household - Complete Validation", () => {
    let calculator: FinancialSnapshotCalculator;

    // Tucker Household ID from seed data
    const TUCKER_HOUSEHOLD_ID = EntityId("f47ac10b-58cc-4372-a567-0e02b2c3d479");
    const CALCULATION_DATE = new Date("2026-08-12");

    // Expected values from requirements
    const EXPECTED = {
        cash: 19200, // dollars
        debt: 240000, // dollars
        netWorth: 189200, // dollars
        monthlyIncome: 12000, // dollars
        monthlyEssentialExpenses: 6800, // dollars
        monthlyDiscretionaryExpenses: 1200, // dollars
        monthlySurplus: 4000, // dollars (12000 - 6800 - 1200)
    };

    beforeEach(() => {
        calculator = createFinancialSnapshotCalculator();
    });

    describe("Tucker Household - Exact Calculation", () => {
        it("calculates all metrics correctly from seed data", () => {
            // Create Tucker Household accounts from seed data
            const accounts: Account[] = [
                // Cash accounts
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440003"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Checking",
                    type: AccountType.CHECKING,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(7200), // 720,000 cents
                    institutionName: "Main Bank",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440004"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Savings",
                    type: AccountType.SAVINGS,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(12000), // 1,200,000 cents
                    institutionName: "Main Bank",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },

                // Retirement accounts
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440005"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "401(k)",
                    type: AccountType.RETIREMENT,
                    ownership: AccountOwnership.INDIVIDUAL,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(325000), // 32,500,000 cents
                    institutionName: "Employer Plan",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440006"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "IRA",
                    type: AccountType.RETIREMENT,
                    ownership: AccountOwnership.INDIVIDUAL,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(85000), // 8,500,000 cents
                    institutionName: "Retirement Brokerage",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },

                // Liability accounts
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440007"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Mortgage",
                    type: AccountType.MORTGAGE,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(-240000), // -24,000,000 cents
                    institutionName: "Home Loan Bank",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
            ];

            // Calculate snapshot
            const snapshot = calculator.calculate({
                householdId: TUCKER_HOUSEHOLD_ID,
                accounts,
                monthlyIncome: MoneyFromDollars(EXPECTED.monthlyIncome),
                monthlyEssentialExpenses: MoneyFromDollars(EXPECTED.monthlyEssentialExpenses),
                monthlyDiscretionaryExpenses: MoneyFromDollars(EXPECTED.monthlyDiscretionaryExpenses),
                asOf: CALCULATION_DATE,
            });

            // Verify all calculations
            expect(MoneyToDollars(snapshot.cash)).toBe(EXPECTED.cash);
            expect(MoneyToDollars(snapshot.debt)).toBe(EXPECTED.debt);
            expect(MoneyToDollars(snapshot.netWorth)).toBe(EXPECTED.netWorth);
            expect(MoneyToDollars(snapshot.monthlyIncome)).toBe(EXPECTED.monthlyIncome);
            expect(MoneyToDollars(snapshot.monthlyEssentialExpenses)).toBe(
                EXPECTED.monthlyEssentialExpenses
            );
            expect(MoneyToDollars(snapshot.monthlyDiscretionaryExpenses)).toBe(
                EXPECTED.monthlyDiscretionaryExpenses
            );
            expect(MoneyToDollars(snapshot.monthlySurplus)).toBe(EXPECTED.monthlySurplus);
        });

        it("verifies Tucker Household health status", () => {
            const accounts: Account[] = [
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440003"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Checking",
                    type: AccountType.CHECKING,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(7200),
                    institutionName: "Main Bank",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440004"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Savings",
                    type: AccountType.SAVINGS,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(12000),
                    institutionName: "Main Bank",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440005"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "401(k)",
                    type: AccountType.RETIREMENT,
                    ownership: AccountOwnership.INDIVIDUAL,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(325000),
                    institutionName: "Employer Plan",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440006"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "IRA",
                    type: AccountType.RETIREMENT,
                    ownership: AccountOwnership.INDIVIDUAL,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(85000),
                    institutionName: "Retirement Brokerage",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440007"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Mortgage",
                    type: AccountType.MORTGAGE,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(-240000),
                    institutionName: "Home Loan Bank",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
            ];

            const snapshot = calculator.calculate({
                householdId: TUCKER_HOUSEHOLD_ID,
                accounts,
                monthlyIncome: MoneyFromDollars(EXPECTED.monthlyIncome),
                monthlyEssentialExpenses: MoneyFromDollars(EXPECTED.monthlyEssentialExpenses),
                monthlyDiscretionaryExpenses: MoneyFromDollars(EXPECTED.monthlyDiscretionaryExpenses),
                asOf: CALCULATION_DATE,
            });

            // Tucker has:
            // - Positive net worth ($189,200)
            // - Positive monthly surplus ($4,000)
            // - Debt-to-annual-income: $240,000 / $144,000 = 1.67 < 3
            // Should be HEALTHY
            expect(snapshot.financialHealthStatus).toBe(FinancialHealthStatus.HEALTHY);
        });

        it("includes all 5 Tucker Household accounts in net worth calculation", () => {
            const accounts: Account[] = [
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440003"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Checking",
                    type: AccountType.CHECKING,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(7200),
                    institutionName: "Main Bank",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440004"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Savings",
                    type: AccountType.SAVINGS,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(12000),
                    institutionName: "Main Bank",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440005"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "401(k)",
                    type: AccountType.RETIREMENT,
                    ownership: AccountOwnership.INDIVIDUAL,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(325000),
                    institutionName: "Employer Plan",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440006"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "IRA",
                    type: AccountType.RETIREMENT,
                    ownership: AccountOwnership.INDIVIDUAL,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(85000),
                    institutionName: "Retirement Brokerage",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440007"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Mortgage",
                    type: AccountType.MORTGAGE,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(-240000),
                    institutionName: "Home Loan Bank",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
            ];

            const snapshot = calculator.calculate({
                householdId: TUCKER_HOUSEHOLD_ID,
                accounts,
                monthlyIncome: MoneyFromDollars(EXPECTED.monthlyIncome),
                monthlyEssentialExpenses: MoneyFromDollars(EXPECTED.monthlyEssentialExpenses),
                monthlyDiscretionaryExpenses: MoneyFromDollars(EXPECTED.monthlyDiscretionaryExpenses),
                asOf: CALCULATION_DATE,
            });

            // Net worth = 7200 + 12000 + 325000 + 85000 - 240000 = 189200
            const expectedNetWorth =
                7200 + 12000 + 325000 + 85000 - 240000;
            expect(MoneyToDollars(snapshot.netWorth)).toBe(expectedNetWorth);
        });

        it("snapshot includes metadata and is ready for persistence", () => {
            const accounts: Account[] = [
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440003"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Checking",
                    type: AccountType.CHECKING,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(7200),
                    institutionName: "Main Bank",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440004"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Savings",
                    type: AccountType.SAVINGS,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(12000),
                    institutionName: "Main Bank",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440005"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "401(k)",
                    type: AccountType.RETIREMENT,
                    ownership: AccountOwnership.INDIVIDUAL,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(325000),
                    institutionName: "Employer Plan",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440006"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "IRA",
                    type: AccountType.RETIREMENT,
                    ownership: AccountOwnership.INDIVIDUAL,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(85000),
                    institutionName: "Retirement Brokerage",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("550e8400-e29b-41d4-a716-446655440007"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Mortgage",
                    type: AccountType.MORTGAGE,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(-240000),
                    institutionName: "Home Loan Bank",
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
            ];

            const snapshot = calculator.calculate({
                householdId: TUCKER_HOUSEHOLD_ID,
                accounts,
                monthlyIncome: MoneyFromDollars(EXPECTED.monthlyIncome),
                monthlyEssentialExpenses: MoneyFromDollars(EXPECTED.monthlyEssentialExpenses),
                monthlyDiscretionaryExpenses: MoneyFromDollars(EXPECTED.monthlyDiscretionaryExpenses),
                asOf: CALCULATION_DATE,
            });

            // Verify snapshot is ready for database persistence
            expect(snapshot.householdId).toBe(TUCKER_HOUSEHOLD_ID);
            expect(snapshot.asOf).toEqual(CALCULATION_DATE);
            expect(snapshot.version).toBe(1);
            expect(snapshot.calculatedAt).toBeInstanceOf(Date);
            expect(snapshot.financialHealthStatus).toBeDefined();

            // Should NOT have id or createdAt (added by repository)
            expect((snapshot as any).id).toBeUndefined();
            expect((snapshot as any).createdAt).toBeUndefined();
        });
    });

    describe("Tucker Household - Breakdown Analysis", () => {
        it("breaks down cash: checking + savings only", () => {
            const accounts: Account[] = [
                {
                    id: EntityId("checking-id"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Checking",
                    type: AccountType.CHECKING,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(7200),
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("savings-id"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Savings",
                    type: AccountType.SAVINGS,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(12000),
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("401k-id"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "401(k)",
                    type: AccountType.RETIREMENT,
                    ownership: AccountOwnership.INDIVIDUAL,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(325000),
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
            ];

            const snapshot = calculator.calculate({
                householdId: TUCKER_HOUSEHOLD_ID,
                accounts,
                monthlyIncome: MoneyFromDollars(1),
                monthlyEssentialExpenses: Money(0),
                monthlyDiscretionaryExpenses: Money(0),
                asOf: CALCULATION_DATE,
            });

            // Cash should be checking + savings only (retirement excluded)
            expect(MoneyToDollars(snapshot.cash)).toBe(7200 + 12000);
        });

        it("breaks down assets: all liquid and investment accounts", () => {
            const accounts: Account[] = [
                {
                    id: EntityId("checking-id"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Checking",
                    type: AccountType.CHECKING,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(7200),
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("savings-id"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "Savings",
                    type: AccountType.SAVINGS,
                    ownership: AccountOwnership.JOINT,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(12000),
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("401k-id"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "401(k)",
                    type: AccountType.RETIREMENT,
                    ownership: AccountOwnership.INDIVIDUAL,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(325000),
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
                {
                    id: EntityId("ira-id"),
                    householdId: TUCKER_HOUSEHOLD_ID,
                    name: "IRA",
                    type: AccountType.RETIREMENT,
                    ownership: AccountOwnership.INDIVIDUAL,
                    currency: "USD",
                    currentBalance: MoneyFromDollars(85000),
                    status: AccountStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    lastUpdatedAt: new Date(),
                },
            ];

            // Note: We don't have a direct assets field in FinancialSnapshot,
            // but we can verify through net worth calculation
            const snapshot = calculator.calculate({
                householdId: TUCKER_HOUSEHOLD_ID,
                accounts,
                monthlyIncome: MoneyFromDollars(1),
                monthlyEssentialExpenses: Money(0),
                monthlyDiscretionaryExpenses: Money(0),
                asOf: CALCULATION_DATE,
            });

            // Net worth should equal total assets (no liabilities)
            const expectedAssets = 7200 + 12000 + 325000 + 85000;
            expect(MoneyToDollars(snapshot.netWorth)).toBe(expectedAssets);
        });

        it("breaks down monthly cash flow components", () => {
            const accounts: Account[] = [];

            const snapshot = calculator.calculate({
                householdId: TUCKER_HOUSEHOLD_ID,
                accounts,
                monthlyIncome: MoneyFromDollars(12000),
                monthlyEssentialExpenses: MoneyFromDollars(6800),
                monthlyDiscretionaryExpenses: MoneyFromDollars(1200),
                asOf: CALCULATION_DATE,
            });

            // Verify each component matches input
            expect(MoneyToDollars(snapshot.monthlyIncome)).toBe(12000);
            expect(MoneyToDollars(snapshot.monthlyEssentialExpenses)).toBe(6800);
            expect(MoneyToDollars(snapshot.monthlyDiscretionaryExpenses)).toBe(1200);

            // Verify total expenses
            const totalExpenses = 6800 + 1200;
            expect(totalExpenses).toBe(8000);

            // Verify surplus calculation
            expect(MoneyToDollars(snapshot.monthlySurplus)).toBe(12000 - 8000);
        });
    });
});
