"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialSnapshotCalculator = void 0;
exports.createFinancialSnapshotCalculator = createFinancialSnapshotCalculator;
const contracts_1 = require("@house-fin/contracts");
/**
 * FinancialSnapshotCalculator - Calculate financial metrics deterministically
 */
class FinancialSnapshotCalculator {
    /**
     * Calculate financial snapshot for a household
     *
     * @param input - Calculation inputs
     * @returns Partial FinancialSnapshot (ready to persist, missing id/createdAt)
     * @throws Error if unsupported account types are encountered
     */
    calculate(input) {
        // Validate inputs
        this.validateAccounts(input.accounts);
        // Calculate derived metrics
        const cash = this.calculateCash(input.accounts);
        const debt = this.calculateDebt(input.accounts);
        const assets = this.calculateAssets(input.accounts);
        const netWorth = this.calculateNetWorth(input.accounts);
        const monthlySurplus = this.calculateMonthlySurplus(input.monthlyIncome, input.monthlyEssentialExpenses, input.monthlyDiscretionaryExpenses);
        // Build metrics for health status determination
        const metrics = {
            cash,
            debt,
            netWorth,
            monthlySurplus,
            monthlyIncome: input.monthlyIncome,
            assets,
            cashToDebtRatio: debt === 0 ? 0 : (0, contracts_1.MoneyToDollars)(cash) / (0, contracts_1.MoneyToDollars)(debt),
        };
        const financialHealthStatus = this.determineHealthStatus(metrics);
        // Collect active account IDs for audit trail
        const sourceAccountIds = input.accounts
            .filter(a => a.status === contracts_1.AccountStatus.ACTIVE)
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
    calculateCash(accounts) {
        let total = 0;
        for (const account of accounts) {
            if (account.status !== contracts_1.AccountStatus.ACTIVE) {
                continue; // Skip inactive/closed accounts
            }
            if (account.type === contracts_1.AccountType.CHECKING || account.type === contracts_1.AccountType.SAVINGS) {
                // Include all balances (zero and positive)
                // Note: negative checking/savings are unusual but we include them
                total += account.currentBalance;
            }
        }
        return Math.max(0, total); // Never negative cash
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
    calculateDebt(accounts) {
        let total = 0;
        for (const account of accounts) {
            if (account.status !== contracts_1.AccountStatus.ACTIVE) {
                continue; // Skip inactive/closed accounts
            }
            if (account.type === contracts_1.AccountType.CREDIT_CARD ||
                account.type === contracts_1.AccountType.LOAN ||
                account.type === contracts_1.AccountType.MORTGAGE) {
                // Only count negative balances as debt (positive balance = credit/overpayment)
                if (account.currentBalance < 0) {
                    total += Math.abs(account.currentBalance);
                }
            }
        }
        return total;
    }
    /**
     * Calculate assets: Cash + Retirement + Investment accounts
     *
     * @param accounts - All household accounts
     * @returns Assets total in Money
     */
    calculateAssets(accounts) {
        let total = 0;
        for (const account of accounts) {
            if (account.status !== contracts_1.AccountStatus.ACTIVE) {
                continue; // Skip inactive/closed accounts
            }
            if (account.type === contracts_1.AccountType.CHECKING ||
                account.type === contracts_1.AccountType.SAVINGS ||
                account.type === contracts_1.AccountType.RETIREMENT ||
                account.type === contracts_1.AccountType.INVESTMENT) {
                // Only include positive balances for assets
                total += Math.max(0, account.currentBalance);
            }
        }
        return total;
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
    calculateNetWorth(accounts) {
        let total = 0;
        for (const account of accounts) {
            if (account.status !== contracts_1.AccountStatus.ACTIVE) {
                continue; // Skip inactive/closed accounts
            }
            const contribution = this.getNetWorthContribution(account);
            total += contribution;
        }
        return total;
    }
    /**
     * Get the net worth contribution of an account
     *
     * @param account - Account to evaluate
     * @returns Contribution to net worth (positive for assets, negative for liabilities)
     */
    getNetWorthContribution(account) {
        switch (account.type) {
            case contracts_1.AccountType.CHECKING:
            case contracts_1.AccountType.SAVINGS:
            case contracts_1.AccountType.RETIREMENT:
            case contracts_1.AccountType.INVESTMENT:
                // Assets contribute their full balance (could be zero)
                return account.currentBalance;
            case contracts_1.AccountType.CREDIT_CARD:
            case contracts_1.AccountType.LOAN:
            case contracts_1.AccountType.MORTGAGE:
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
    calculateMonthlySurplus(monthlyIncome, monthlyEssentialExpenses, monthlyDiscretionaryExpenses) {
        return (monthlyIncome - monthlyEssentialExpenses - monthlyDiscretionaryExpenses);
    }
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
    determineHealthStatus(metrics) {
        const monthlyIncomeInDollars = (0, contracts_1.MoneyToDollars)(metrics.monthlyIncome);
        const monthlySurplusInDollars = (0, contracts_1.MoneyToDollars)(metrics.monthlySurplus);
        const cashInDollars = (0, contracts_1.MoneyToDollars)(metrics.cash);
        const debtInDollars = (0, contracts_1.MoneyToDollars)(metrics.debt);
        const netWorthInDollars = (0, contracts_1.MoneyToDollars)(metrics.netWorth);
        const annualIncome = monthlyIncomeInDollars * 12;
        const debtToIncomeRatio = annualIncome > 0 ? debtInDollars / annualIncome : 0;
        // AT_RISK conditions (highest priority)
        if (monthlySurplusInDollars < 0) {
            // Spending more than earning is critical
            return contracts_1.FinancialHealthStatus.AT_RISK;
        }
        if (netWorthInDollars < 0 && cashInDollars < Math.abs(netWorthInDollars) * 0.1) {
            // Negative net worth with very low cash reserves
            return contracts_1.FinancialHealthStatus.AT_RISK;
        }
        // HEALTHY conditions
        if (netWorthInDollars > 0 && // Positive net worth
            monthlySurplusInDollars > 0 && // Positive monthly surplus
            debtToIncomeRatio < 3 // Debt < 3x annual income
        ) {
            return contracts_1.FinancialHealthStatus.HEALTHY;
        }
        // ATTENTION: Everything else (stable but could improve)
        return contracts_1.FinancialHealthStatus.ATTENTION;
    }
    /**
     * Validate that all accounts have supported types
     *
     * @param accounts - Accounts to validate
     * @throws Error if any account has an unsupported type
     */
    validateAccounts(accounts) {
        const supportedTypes = new Set([
            contracts_1.AccountType.CHECKING,
            contracts_1.AccountType.SAVINGS,
            contracts_1.AccountType.CREDIT_CARD,
            contracts_1.AccountType.LOAN,
            contracts_1.AccountType.RETIREMENT,
            contracts_1.AccountType.INVESTMENT,
            contracts_1.AccountType.MORTGAGE,
        ]);
        for (const account of accounts) {
            if (!supportedTypes.has(account.type)) {
                throw new Error(`Unsupported account type: ${account.type}`);
            }
        }
    }
}
exports.FinancialSnapshotCalculator = FinancialSnapshotCalculator;
/**
 * Factory function to create a calculator instance
 */
function createFinancialSnapshotCalculator() {
    return new FinancialSnapshotCalculator();
}
//# sourceMappingURL=snapshot-calculator.js.map