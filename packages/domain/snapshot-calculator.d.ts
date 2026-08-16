/**
 * FinancialSnapshotCalculator - Deterministic financial metrics calculation
 *
 * Rules:
 * - All calculations use Money (cents) to avoid float precision issues
 * - Every derived value is reproducible and deterministic
 * - Unsupported account types raise errors (no silent failures)
 * - Negative liabilities are handled correctly
 * - Zero-balance accounts are included
 */
import { Account, FinancialSnapshot, Money, EntityId } from "@house-fin/contracts";
/**
 * Input parameters for snapshot calculation
 */
export interface CalculateSnapshotInput {
    householdId: EntityId;
    accounts: Account[];
    monthlyIncome: Money;
    monthlyEssentialExpenses: Money;
    monthlyDiscretionaryExpenses: Money;
    asOf: Date;
}
/**
 * FinancialSnapshotCalculator - Calculate financial metrics deterministically
 */
export declare class FinancialSnapshotCalculator {
    /**
     * Calculate financial snapshot for a household
     *
     * @param input - Calculation inputs
     * @returns Partial FinancialSnapshot (ready to persist, missing id/createdAt)
     * @throws Error if unsupported account types are encountered
     */
    calculate(input: CalculateSnapshotInput): Omit<FinancialSnapshot, "id" | "createdAt">;
    /**
     * Calculate cash: CHECKING + SAVINGS accounts with positive balance
     *
     * @param accounts - All household accounts
     * @returns Cash total in Money
     */
    private calculateCash;
    /**
     * Calculate debt: Sum of liabilities (credit cards, loans, mortgages)
     *
     * For these account types, we expect negative balances (debt).
     * We return the absolute value of only the negative balances as a positive debt amount.
     * Positive balances (overpayments/credits) are not counted as debt.
     *
     * @param accounts - All household accounts
     * @returns Debt total in Money (as positive value)
     */
    private calculateDebt;
    /**
     * Calculate assets: Cash + Retirement + Investment accounts
     *
     * @param accounts - All household accounts
     * @returns Assets total in Money
     */
    private calculateAssets;
    /**
     * Calculate net worth: Sum of all account balances (cash + retirement - debt)
     *
     * This is the sum of all accounts where:
     * - Asset accounts (CHECKING, SAVINGS, RETIREMENT, INVESTMENT) contribute positively
     * - Liability accounts (CREDIT_CARD, LOAN, MORTGAGE) contribute negatively
     *
     * @param accounts - All household accounts
     * @returns Net worth in Money
     */
    private calculateNetWorth;
    /**
     * Get the net worth contribution of an account
     *
     * @param account - Account to evaluate
     * @returns Contribution to net worth (positive for assets, negative for liabilities)
     */
    private getNetWorthContribution;
    /**
     * Calculate monthly surplus: Income - Essential Expenses - Discretionary Expenses
     *
     * @param monthlyIncome - Gross monthly income in Money
     * @param monthlyEssentialExpenses - Essential expenses (housing, food, etc.) in Money
     * @param monthlyDiscretionaryExpenses - Discretionary expenses (entertainment, etc.) in Money
     * @returns Monthly surplus in Money (could be negative)
     */
    private calculateMonthlySurplus;
    /**
     * Determine financial health status based on calculated metrics
     *
     * Health Status Rules:
     * - AT_RISK: Monthly deficit OR negative net worth with insufficient cash reserves
     * - HEALTHY: Positive net worth AND positive monthly surplus AND reasonable debt-to-income
     * - ATTENTION: Everything else
     *
     * @param metrics - Calculated metrics
     * @returns FinancialHealthStatus
     */
    private determineHealthStatus;
    /**
     * Validate that all accounts have supported types
     *
     * @param accounts - Accounts to validate
     * @throws Error if any account has an unsupported type
     */
    private validateAccounts;
}
/**
 * Factory function to create a calculator instance
 */
export declare function createFinancialSnapshotCalculator(): FinancialSnapshotCalculator;
//# sourceMappingURL=snapshot-calculator.d.ts.map