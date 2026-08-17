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

import {
    Account,
    AccountStatus,
    AccountType,
    FinancialHealthStatus,
    FinancialSnapshot,
    Money,
    EntityId,
    MoneyToDollars,
} from "@house-fin/contracts";

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
 * Intermediate calculation results for health status determination
 */
interface CalculationMetrics {
    cash: Money;
    debt: Money;
    netWorth: Money;
    monthlySurplus: Money;
    monthlyIncome: Money;
    assets: Money;
    cashToDebtRatio: number; // avoid Money type since it's a ratio
}

/**
 * FinancialSnapshotCalculator - Calculate financial metrics deterministically
 */
export class FinancialSnapshotCalculator {
    /**
     * Calculate financial snapshot for a household
     *
     * @param input - Calculation inputs
     * @returns Partial FinancialSnapshot (ready to persist, missing id/createdAt)
     * @throws Error if unsupported account types are encountered
     */
    calculate(input: CalculateSnapshotInput): Omit<FinancialSnapshot, "id" | "createdAt"> {
        // Validate inputs
        this.validateAccounts(input.accounts);

        // Calculate derived metrics
        const cash = this.calculateCash(input.accounts);
        const debt = this.calculateDebt(input.accounts);
        const assets = this.calculateAssets(input.accounts);
        const netWorth = this.calculateNetWorth(input.accounts);
        const monthlySurplus = this.calculateMonthlySurplus(
            input.monthlyIncome,
            input.monthlyEssentialExpenses,
            input.monthlyDiscretionaryExpenses
        );

        // Build metrics for health status determination
        const metrics: CalculationMetrics = {
            cash,
            debt,
            netWorth,
            monthlySurplus,
            monthlyIncome: input.monthlyIncome,
            assets,
            cashToDebtRatio: debt === 0 ? 0 : MoneyToDollars(cash) / MoneyToDollars(debt),
        };

        const financialHealthStatus = this.determineHealthStatus(metrics);

        // Collect active account IDs for audit trail
        const sourceAccountIds = input.accounts
            .filter(a => a.status === AccountStatus.ACTIVE)
            .map(a => a.id);

        return {
            householdId: input.householdId,
            asOf: input.asOf,
            version: 1, // calculation_version
            cash,
            debt,
            netWorth,
            monthlyIncome: input.monthlyIncome,
            monthlyEssentialExpenses: input.monthlyEssentialExpenses,
            monthlyDiscretionaryExpenses: input.monthlyDiscretionaryExpenses,
            monthlySurplus,
            financialHealthStatus,
            sourceAccountIds,
            calculatedAt: new Date(),
        };
    }

    /**
     * Calculate cash: CHECKING + SAVINGS accounts with positive balance
     *
     * @param accounts - All household accounts
     * @returns Cash total in Money
     */
    private calculateCash(accounts: Account[]): Money {
        let total = 0;

        for (const account of accounts) {
            if (account.status !== AccountStatus.ACTIVE) {
                continue; // Skip inactive/closed accounts
            }

            if (account.type === AccountType.CHECKING || account.type === AccountType.SAVINGS) {
                // Include all balances (zero and positive)
                // Note: negative checking/savings are unusual but we include them
                total += account.currentBalance;
            }
        }

        return Math.max(0, total) as Money; // Never negative cash
    }

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
    private calculateDebt(accounts: Account[]): Money {
        let total = 0;

        for (const account of accounts) {
            if (account.status !== AccountStatus.ACTIVE) {
                continue; // Skip inactive/closed accounts
            }

            if (
                account.type === AccountType.CREDIT_CARD ||
                account.type === AccountType.LOAN ||
                account.type === AccountType.MORTGAGE
            ) {
                // Only count negative balances as debt (positive balance = credit/overpayment)
                if (account.currentBalance < 0) {
                    total += Math.abs(account.currentBalance);
                }
            }
        }

        return total as Money;
    }

    /**
     * Calculate assets: Cash + Retirement + Investment accounts
     *
     * @param accounts - All household accounts
     * @returns Assets total in Money
     */
    private calculateAssets(accounts: Account[]): Money {
        let total = 0;

        for (const account of accounts) {
            if (account.status !== AccountStatus.ACTIVE) {
                continue; // Skip inactive/closed accounts
            }

            if (
                account.type === AccountType.CHECKING ||
                account.type === AccountType.SAVINGS ||
                account.type === AccountType.RETIREMENT ||
                account.type === AccountType.INVESTMENT
            ) {
                // Only include positive balances for assets
                total += Math.max(0, account.currentBalance);
            }
        }

        return total as Money;
    }

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
    private calculateNetWorth(accounts: Account[]): Money {
        let total = 0;

        for (const account of accounts) {
            if (account.status !== AccountStatus.ACTIVE) {
                continue; // Skip inactive/closed accounts
            }

            const contribution = this.getNetWorthContribution(account);
            total += contribution;
        }

        return total as Money;
    }

    /**
     * Get the net worth contribution of an account
     *
     * @param account - Account to evaluate
     * @returns Contribution to net worth (positive for assets, negative for liabilities)
     */
    private getNetWorthContribution(account: Account): number {
        switch (account.type) {
            case AccountType.CHECKING:
            case AccountType.SAVINGS:
            case AccountType.RETIREMENT:
            case AccountType.INVESTMENT:
                // Assets contribute their full balance (could be zero)
                return account.currentBalance;

            case AccountType.CREDIT_CARD:
            case AccountType.LOAN:
            case AccountType.MORTGAGE:
                // Liabilities contribute their balance as-is (already negative)
                return account.currentBalance;

            default:
                // Should not reach here if validateAccounts() worked
                throw new Error(`Unsupported account type for net worth: ${account.type}`);
        }
    }

    /**
     * Calculate monthly surplus: Income - Essential Expenses - Discretionary Expenses
     *
     * @param monthlyIncome - Gross monthly income in Money
     * @param monthlyEssentialExpenses - Essential expenses (housing, food, etc.) in Money
     * @param monthlyDiscretionaryExpenses - Discretionary expenses (entertainment, etc.) in Money
     * @returns Monthly surplus in Money (could be negative)
     */
    private calculateMonthlySurplus(
        monthlyIncome: Money,
        monthlyEssentialExpenses: Money,
        monthlyDiscretionaryExpenses: Money
    ): Money {
        return (monthlyIncome - monthlyEssentialExpenses - monthlyDiscretionaryExpenses) as Money;
    }

    /**
     * Determine financial health status based on calculated metrics
     *
     * Health Status Rules:
     * - AT_RISK: Monthly deficit OR negative net worth with insufficient cash reserves
     * - HEALTHY: Positive net worth AND positive monthly surplus AND reasonable debt-to-income
     * - WATCH: Everything else
     *
     * @param metrics - Calculated metrics
     * @returns FinancialHealthStatus
     */
    private determineHealthStatus(metrics: CalculationMetrics): FinancialHealthStatus {
        const monthlyIncomeInDollars = MoneyToDollars(metrics.monthlyIncome);
        const monthlySurplusInDollars = MoneyToDollars(metrics.monthlySurplus);
        const cashInDollars = MoneyToDollars(metrics.cash);
        const debtInDollars = MoneyToDollars(metrics.debt);
        const netWorthInDollars = MoneyToDollars(metrics.netWorth);
        const annualIncome = monthlyIncomeInDollars * 12;
        const debtToIncomeRatio = annualIncome > 0 ? debtInDollars / annualIncome : 0;

        // AT_RISK conditions (highest priority)
        if (monthlySurplusInDollars < 0) {
            // Spending more than earning is critical
            return FinancialHealthStatus.AT_RISK;
        }

        if (netWorthInDollars < 0 && cashInDollars < Math.abs(netWorthInDollars) * 0.1) {
            // Negative net worth with very low cash reserves
            return FinancialHealthStatus.AT_RISK;
        }

        // HEALTHY conditions
        if (
            netWorthInDollars > 0 && // Positive net worth
            monthlySurplusInDollars > 0 && // Positive monthly surplus
            debtToIncomeRatio < 3 // Debt < 3x annual income
        ) {
            return FinancialHealthStatus.HEALTHY;
        }

        // WATCH: Everything else (stable but could improve)
        return FinancialHealthStatus.WATCH;
    }

    /**
     * Validate that all accounts have supported types
     *
     * @param accounts - Accounts to validate
     * @throws Error if any account has an unsupported type
     */
    private validateAccounts(accounts: Account[]): void {
        const supportedTypes = new Set([
            AccountType.CHECKING,
            AccountType.SAVINGS,
            AccountType.CREDIT_CARD,
            AccountType.LOAN,
            AccountType.RETIREMENT,
            AccountType.INVESTMENT,
            AccountType.MORTGAGE,
        ]);

        for (const account of accounts) {
            if (!supportedTypes.has(account.type)) {
                throw new Error(`Unsupported account type: ${account.type}`);
            }
        }
    }
}

/**
 * Factory function to create a calculator instance
 */
export function createFinancialSnapshotCalculator(): FinancialSnapshotCalculator {
    return new FinancialSnapshotCalculator();
}
