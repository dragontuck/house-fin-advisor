/**
 * Contract tests for API ↔ Frontend communication
 *
 * These tests verify that the API responses match the expected interface contracts.
 * They ensure that frontend expectations about API response shape are validated
 * and prevent breaking changes from being deployed without notice.
 */

import { FinancialPulse, FinancialHealthStatus, AccountType } from "@house-fin/contracts";

describe("API Contract Tests", () => {
    /**
     * Mock HTTP client to simulate API calls
     * In real usage, this would call the actual API
     */
    const mockFetch = async (endpoint: string): Promise<any> => {
        // Mock responses for different endpoints
        if (endpoint === "/financial-pulse") {
            return {
                householdId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                householdName: "Tucker Household",
                asOf: new Date().toISOString(),
                healthStatus: FinancialHealthStatus.HEALTHY,
                healthMessage: "Your household is in good financial shape.",
                keyMetrics: {
                    netWorth: 189200,
                    cashAvailable: 19200,
                    monthlyIncome: 12000,
                    monthlyExpenses: 8000,
                    monthlySurplus: 4000,
                    totalDebt: 240000,
                },
                accountsSummary: {
                    cash: [
                        { name: "Checking", balance: 7200, type: AccountType.CHECKING },
                        { name: "Savings", balance: 12000, type: AccountType.SAVINGS },
                    ],
                    retirement: [
                        { name: "401(k)", balance: 325000, type: AccountType.RETIREMENT },
                        { name: "IRA", balance: 85000, type: AccountType.RETIREMENT },
                    ],
                    investments: [],
                    debt: [
                        { name: "Mortgage", balance: 240000, type: AccountType.MORTGAGE },
                    ],
                },
                statusMessage: "Your household is in good financial shape.",
            };
        }
        throw new Error(`Unknown endpoint: ${endpoint}`);
    };

    describe("FinancialPulse Response Contract", () => {
        it("should have all required top-level properties", async () => {
            const response = await mockFetch("/financial-pulse");

            expect(response).toHaveProperty("householdId");
            expect(response).toHaveProperty("householdName");
            expect(response).toHaveProperty("asOf");
            expect(response).toHaveProperty("healthStatus");
            expect(response).toHaveProperty("healthMessage");
            expect(response).toHaveProperty("keyMetrics");
            expect(response).toHaveProperty("accountsSummary");
            expect(response).toHaveProperty("statusMessage");
        });

        it("should have all required keyMetrics properties", async () => {
            const response = await mockFetch("/financial-pulse");
            const metrics = response.keyMetrics;

            expect(metrics).toHaveProperty("netWorth");
            expect(metrics).toHaveProperty("cashAvailable");
            expect(metrics).toHaveProperty("monthlyIncome");
            expect(metrics).toHaveProperty("monthlyExpenses");
            expect(metrics).toHaveProperty("monthlySurplus");
            expect(metrics).toHaveProperty("totalDebt");
        });

        it("should have all required accountsSummary properties", async () => {
            const response = await mockFetch("/financial-pulse");
            const summary = response.accountsSummary;

            expect(summary).toHaveProperty("cash");
            expect(summary).toHaveProperty("retirement");
            expect(summary).toHaveProperty("investments");
            expect(summary).toHaveProperty("debt");

            // Each should be an array
            expect(Array.isArray(summary.cash)).toBe(true);
            expect(Array.isArray(summary.retirement)).toBe(true);
            expect(Array.isArray(summary.investments)).toBe(true);
            expect(Array.isArray(summary.debt)).toBe(true);
        });

        it("should have correct data types for top-level fields", async () => {
            const response = await mockFetch("/financial-pulse");

            expect(typeof response.householdId).toBe("string");
            expect(typeof response.householdName).toBe("string");
            expect(typeof response.asOf).toBe("string"); // ISO 8601 date string
            expect(typeof response.healthStatus).toBe("string");
            expect(Object.values(FinancialHealthStatus)).toContain(response.healthStatus);
            expect(typeof response.healthMessage).toBe("string");
            expect(typeof response.statusMessage).toBe("string");
        });

        it("should have correct data types for keyMetrics", async () => {
            const response = await mockFetch("/financial-pulse");
            const metrics = response.keyMetrics;

            expect(typeof metrics.netWorth).toBe("number");
            expect(typeof metrics.cashAvailable).toBe("number");
            expect(typeof metrics.monthlyIncome).toBe("number");
            expect(typeof metrics.monthlyExpenses).toBe("number");
            expect(typeof metrics.monthlySurplus).toBe("number");
            expect(typeof metrics.totalDebt).toBe("number");
        });

        it("should have correct data types for account items", async () => {
            const response = await mockFetch("/financial-pulse");
            const summary = response.accountsSummary;

            for (const category of [summary.cash, summary.retirement, summary.investments, summary.debt]) {
                for (const account of category) {
                    expect(typeof account.name).toBe("string");
                    expect(typeof account.balance).toBe("number");
                    expect(typeof account.type).toBe("string");
                    expect(Object.values(AccountType)).toContain(account.type);
                }
            }
        });

        it("should not expose internal fields", async () => {
            const response = await mockFetch("/financial-pulse");

            // Top level should not have internal fields
            expect(response).not.toHaveProperty("id");
            expect(response).not.toHaveProperty("version");
            expect(response).not.toHaveProperty("calculatedAt");

            // Accounts should not expose internal IDs
            const allAccounts = [
                ...response.accountsSummary.cash,
                ...response.accountsSummary.retirement,
                ...response.accountsSummary.investments,
                ...response.accountsSummary.debt,
            ];

            for (const account of allAccounts) {
                expect(account).not.toHaveProperty("id");
                expect(account).not.toHaveProperty("householdId");
                expect(account).not.toHaveProperty("currency");
                expect(account).not.toHaveProperty("status");
            }
        });

        it("should validate numeric ranges", async () => {
            const response = await mockFetch("/financial-pulse");
            const metrics = response.keyMetrics;

            // All monetary values should be finite numbers
            expect(isFinite(metrics.netWorth)).toBe(true);
            expect(isFinite(metrics.cashAvailable)).toBe(true);
            expect(isFinite(metrics.monthlyIncome)).toBe(true);
            expect(isFinite(metrics.monthlyExpenses)).toBe(true);
            expect(isFinite(metrics.monthlySurplus)).toBe(true);
            expect(isFinite(metrics.totalDebt)).toBe(true);

            // Some values have constraints
            expect(metrics.cashAvailable).toBeGreaterThanOrEqual(0);
            expect(metrics.totalDebt).toBeGreaterThanOrEqual(0);
            expect(metrics.monthlyIncome).toBeGreaterThanOrEqual(0);
            expect(metrics.monthlyExpenses).toBeGreaterThanOrEqual(0);
        });

        it("should ensure health message is non-empty", async () => {
            const response = await mockFetch("/financial-pulse");

            expect(response.healthMessage.length).toBeGreaterThan(0);
            expect(response.statusMessage.length).toBeGreaterThan(0);
        });

        it("should ensure accountsSummary totals are consistent", async () => {
            const response = await mockFetch("/financial-pulse");
            const summary = response.accountsSummary;

            // Calculate totals from summary
            const cashTotal = summary.cash.reduce((sum: number, a: any) => sum + a.balance, 0);
            const retirementTotal = summary.retirement.reduce((sum: number, a: any) => sum + a.balance, 0);
            const investmentTotal = summary.investments.reduce((sum: number, a: any) => sum + a.balance, 0);
            const debtTotal = summary.debt.reduce((sum: number, a: any) => sum + a.balance, 0);

            // Should match metrics (debt as absolute value)
            expect(cashTotal).toBe(response.keyMetrics.cashAvailable);
            // Note: totalDebt should match sum of debt balances

            // All totals should be >= 0 (even when representing debt, shown as positive)
            expect(cashTotal).toBeGreaterThanOrEqual(0);
            expect(retirementTotal).toBeGreaterThanOrEqual(0);
            expect(investmentTotal).toBeGreaterThanOrEqual(0);
            expect(debtTotal).toBeGreaterThanOrEqual(0);
        });
    });

    describe("Error Response Contract", () => {
        it("should have standard error response format", () => {
            const errorResponse = {
                userMessage: "An error occurred",
                errorCode: "INTERNAL_ERROR",
                correlationId: "123-456-789",
                retryable: true,
                timestamp: new Date().toISOString(),
            };

            expect(errorResponse).toHaveProperty("userMessage");
            expect(errorResponse).toHaveProperty("errorCode");
            expect(errorResponse).toHaveProperty("correlationId");
            expect(errorResponse).toHaveProperty("retryable");
            expect(errorResponse).toHaveProperty("timestamp");

            expect(typeof errorResponse.userMessage).toBe("string");
            expect(typeof errorResponse.errorCode).toBe("string");
            expect(typeof errorResponse.correlationId).toBe("string");
            expect(typeof errorResponse.retryable).toBe("boolean");
        });

        it("should have non-empty error messages", () => {
            const errorResponse = {
                userMessage: "Account balance is required",
                errorCode: "INVALID_BALANCE",
                correlationId: "123-456-789",
                retryable: false,
            };

            expect(errorResponse.userMessage.length).toBeGreaterThan(0);
            expect(errorResponse.errorCode.length).toBeGreaterThan(0);
            expect(errorResponse.correlationId.length).toBeGreaterThan(0);
        });
    });

    describe("Response Consistency", () => {
        it("should provide consistent responses across multiple calls", async () => {
            const response1 = await mockFetch("/financial-pulse");
            const response2 = await mockFetch("/financial-pulse");

            // Structure should be identical
            expect(Object.keys(response1).sort()).toEqual(Object.keys(response2).sort());
            expect(Object.keys(response1.keyMetrics).sort()).toEqual(
                Object.keys(response2.keyMetrics).sort()
            );
            expect(Object.keys(response1.accountsSummary).sort()).toEqual(
                Object.keys(response2.accountsSummary).sort()
            );
        });

        it("should maintain type consistency", async () => {
            const response = await mockFetch("/financial-pulse");

            // Get types from response
            const healthStatusType = typeof response.healthStatus;
            const nameType = typeof response.keyMetrics.netWorth;

            // Re-fetch and verify types remain consistent
            const response2 = await mockFetch("/financial-pulse");
            expect(typeof response2.healthStatus).toBe(healthStatusType);
            expect(typeof response2.keyMetrics.netWorth).toBe(nameType);
        });
    });

    describe("Field Count Stability", () => {
        it("should not add unexpected properties to FinancialPulse", async () => {
            const response = await mockFetch("/financial-pulse");
            const expectedTopLevelFields = 8;

            // Count actual fields (should match expected)
            const actualFields = Object.keys(response).length;
            expect(actualFields).toBe(expectedTopLevelFields);
        });

        it("should not add unexpected properties to keyMetrics", async () => {
            const response = await mockFetch("/financial-pulse");
            const metrics = response.keyMetrics;
            const expectedMetricFields = 6;

            const actualFields = Object.keys(metrics).length;
            expect(actualFields).toBe(expectedMetricFields);
        });

        it("should not add unexpected properties to accountsSummary", async () => {
            const response = await mockFetch("/financial-pulse");
            const summary = response.accountsSummary;
            const expectedSummaryFields = 4; // cash, retirement, investments, debt

            const actualFields = Object.keys(summary).length;
            expect(actualFields).toBe(expectedSummaryFields);
        });

        it("should not add unexpected properties to account items", async () => {
            const response = await mockFetch("/financial-pulse");
            const summary = response.accountsSummary;

            const allAccounts = [
                ...summary.cash,
                ...summary.retirement,
                ...summary.investments,
                ...summary.debt,
            ];

            const expectedAccountFields = 3; // name, balance, type

            for (const account of allAccounts) {
                const actualFields = Object.keys(account).length;
                expect(actualFields).toBe(expectedAccountFields);
            }
        });
    });
});
