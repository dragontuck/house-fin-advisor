/**
 * Integration tests for AI Tool Execution endpoints
 * 
 * Tests the 4 deterministic AI tools:
 * - create_initial_budget
 * - analyze_budget_variance
 * - plan_next_month_budget
 * - simulate_budget_change
 */

import request from "supertest";
import { createServer } from "../../apps/api/src/server";
import { Express } from "express";
import { EntityId, MoneyFromDollars, Budget, PostedTransaction, Money } from "@house-fin/contracts";

// Mock repositories for testing
jest.mock("../../apps/api/src/db/repositories", () => {
    const { EntityId, MoneyFromDollars } = require("@house-fin/contracts");

    // In-memory storage for tests
    const households = new Map();
    const budgets = new Map<string, any[]>();
    const transactions = new Map<string, any[]>();
    const settings = new Map();
    const recurringPatterns = new Map<string, any[]>();

    const householdId = EntityId("test-household-1");

    // Initialize test household
    households.set(householdId, {
        id: householdId,
        name: "Test Household",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
    });

    // Initialize household settings with income
    settings.set(householdId, {
        id: EntityId("settings-1"),
        householdId,
        monthlyIncome: MoneyFromDollars(5000), // $5,000/month
        monthlyEssentialExpenses: MoneyFromDollars(2000),
        monthlyDiscretionaryExpenses: MoneyFromDollars(800),
        currency: "USD",
        incomeSource: "manual_entry",
        updatedBy: EntityId("member-1"),
        updatedAt: new Date("2026-01-01"),
        createdAt: new Date("2026-01-01"),
    });

    // Initialize test budgets for June 2026
    const juneKey = `${householdId}:2026:6`;
    budgets.set(juneKey, [
        {
            id: EntityId("budget-1"),
            householdId,
            category: "Groceries",
            amountCents: MoneyFromDollars(400),
            year: 2026,
            month: 6,
            createdAt: new Date("2026-06-01"),
        },
        {
            id: EntityId("budget-2"),
            householdId,
            category: "Utilities",
            amountCents: MoneyFromDollars(150),
            year: 2026,
            month: 6,
            createdAt: new Date("2026-06-01"),
        },
        {
            id: EntityId("budget-3"),
            householdId,
            category: "Entertainment",
            amountCents: MoneyFromDollars(200),
            year: 2026,
            month: 6,
            createdAt: new Date("2026-06-01"),
        },
    ]);

    // Initialize budgets for May 2026
    const mayKey = `${householdId}:2026:5`;
    budgets.set(mayKey, [
        {
            id: EntityId("budget-4"),
            householdId,
            category: "Groceries",
            amountCents: MoneyFromDollars(380),
            year: 2026,
            month: 5,
            createdAt: new Date("2026-05-01"),
        },
        {
            id: EntityId("budget-5"),
            householdId,
            category: "Utilities",
            amountCents: MoneyFromDollars(140),
            year: 2026,
            month: 5,
            createdAt: new Date("2026-05-01"),
        },
    ]);

    // Initialize transactions for June 2026
    const juneTransKey = `${householdId}:2026:6`;
    transactions.set(juneTransKey, [
        {
            id: EntityId("trans-1"),
            householdId,
            accountId: EntityId("account-1"),
            category: "Groceries",
            amount: MoneyFromDollars(-420),
            postedDate: new Date("2026-06-05"),
            merchant: "Whole Foods",
            direction: "DEBIT",
            createdAt: new Date("2026-06-05"),
        },
        {
            id: EntityId("trans-2"),
            householdId,
            accountId: EntityId("account-1"),
            category: "Utilities",
            amount: MoneyFromDollars(-145),
            postedDate: new Date("2026-06-10"),
            merchant: "Electric Co",
            direction: "DEBIT",
            createdAt: new Date("2026-06-10"),
        },
        {
            id: EntityId("trans-3"),
            householdId,
            accountId: EntityId("account-1"),
            category: "Entertainment",
            amount: MoneyFromDollars(-85),
            postedDate: new Date("2026-06-15"),
            merchant: "Movie Theater",
            direction: "DEBIT",
            createdAt: new Date("2026-06-15"),
        },
        {
            id: EntityId("trans-4"),
            householdId,
            accountId: EntityId("account-1"),
            category: "Entertainment",
            amount: MoneyFromDollars(-110),
            postedDate: new Date("2026-06-20"),
            merchant: "Restaurant",
            direction: "DEBIT",
            createdAt: new Date("2026-06-20"),
        },
    ]);

    // Initialize transactions for May 2026
    const mayTransKey = `${householdId}:2026:5`;
    transactions.set(mayTransKey, [
        {
            id: EntityId("trans-5"),
            householdId,
            accountId: EntityId("account-1"),
            category: "Groceries",
            amount: MoneyFromDollars(-395),
            postedDate: new Date("2026-05-05"),
            merchant: "Whole Foods",
            direction: "DEBIT",
            createdAt: new Date("2026-05-05"),
        },
        {
            id: EntityId("trans-6"),
            householdId,
            accountId: EntityId("account-1"),
            category: "Utilities",
            amount: MoneyFromDollars(-135),
            postedDate: new Date("2026-05-10"),
            merchant: "Electric Co",
            direction: "DEBIT",
            createdAt: new Date("2026-05-10"),
        },
    ]);

    // Initialize recurring patterns
    const patternsKey = `${householdId}`;
    recurringPatterns.set(patternsKey, [
        {
            merchant: "Whole Foods",
            direction: "DEBIT",
            frequency: "WEEKLY",
            typicalAmountCents: MoneyFromDollars(100),
            averageAmountCents: MoneyFromDollars(105),
            amountVariancePct: 0.1,
            confidence: 0.85,
            occurrenceCount: 8,
            mostCommonCategory: "Groceries",
            firstSeenDate: new Date("2026-04-01"),
            lastSeenDate: new Date("2026-06-20"),
            estimatedNextDate: new Date("2026-06-27"),
            sourceTransactionIds: ["trans-1", "trans-5"],
        },
        {
            merchant: "Electric Co",
            direction: "DEBIT",
            frequency: "MONTHLY",
            typicalAmountCents: MoneyFromDollars(142),
            averageAmountCents: MoneyFromDollars(140),
            amountVariancePct: 0.05,
            confidence: 0.95,
            occurrenceCount: 2,
            mostCommonCategory: "Utilities",
            firstSeenDate: new Date("2026-05-01"),
            lastSeenDate: new Date("2026-06-10"),
            estimatedNextDate: new Date("2026-07-10"),
            sourceTransactionIds: ["trans-2", "trans-6"],
        },
    ]);

    return {
        createBudgetRepository: () => ({
            findByHouseholdAndPeriod: jest.fn(async (householdId, year, month) => {
                const key = `${householdId}:${year}:${month}`;
                return budgets.get(key) || [];
            }),
            getTransactionsForPeriod: jest.fn(async (householdId, year, month) => {
                const key = `${householdId}:${year}:${month}`;
                return transactions.get(key) || [];
            }),
        }),
        createCashFlowRepository: () => ({
            getTransactionsForRange: jest.fn(async (householdId, startDate, endDate) => {
                const allTransactions: any[] = [];
                for (const trans of transactions.values()) {
                    allTransactions.push(...trans);
                }
                return allTransactions.filter(
                    (t) =>
                        t.householdId === householdId &&
                        t.postedDate >= startDate &&
                        t.postedDate <= endDate
                );
            }),
        }),
        createSettingsRepository: () => ({
            findByHouseholdId: jest.fn(async (householdId) => {
                return settings.get(householdId) || null;
            }),
        }),
        createRecurringPatternsRepository: () => ({
            findByHouseholdId: jest.fn(async (householdId) => {
                const key = householdId;
                return recurringPatterns.get(key) || [];
            }),
        }),
    };
});

describe("Tool Execution API Endpoints", () => {
    let app: Express;
    const householdId = EntityId("test-household-1");

    beforeAll(async () => {
        app = await createServer();
    });

    describe("POST /tools/create_initial_budget", () => {
        it("should create initial budget from historical data", async () => {
            const response = await request(app)
                .post("/tools/create_initial_budget")
                .set("Authorization", `Bearer test-token-${householdId}`)
                .send({
                    month: "2026-7",
                })
                .expect(200);

            expect(response.body).toHaveProperty("householdId", householdId);
            expect(response.body).toHaveProperty("month", "2026-7");
            expect(response.body).toHaveProperty("proposedBudgets");
            expect(Array.isArray(response.body.proposedBudgets)).toBe(true);
            expect(response.body.proposedBudgets.length).toBeGreaterThan(0);

            // Check budget category structure
            const budget = response.body.proposedBudgets[0];
            expect(budget).toHaveProperty("category");
            expect(budget).toHaveProperty("recommendedBudgetCents");
            expect(budget).toHaveProperty("historicalAverageCents");
            expect(budget).toHaveProperty("rationale");

            // Verify determinism: all amounts are integers (cents)
            expect(Number.isInteger(budget.recommendedBudgetCents)).toBe(true);
            expect(Number.isInteger(budget.historicalAverageCents)).toBe(true);

            // Verify recommendations exist
            expect(Array.isArray(response.body.recommendations)).toBe(true);
        });

        it("should accept custom income override", async () => {
            const response = await request(app)
                .post("/tools/create_initial_budget")
                .set("Authorization", `Bearer test-token-${householdId}`)
                .send({
                    month: "2026-7",
                    incomeMethodCents: 600000, // $6,000
                })
                .expect(200);

            expect(response.body).toHaveProperty("monthlyIncomeCents", 600000);
        });

        it("should reject missing month parameter", async () => {
            const response = await request(app)
                .post("/tools/create_initial_budget")
                .set("Authorization", `Bearer test-token-${householdId}`)
                .send({})
                .expect(400);

            expect(response.body).toHaveProperty("userMessage");
            expect(response.body.userMessage).toContain("Month is required");
        });
    });

    describe("POST /tools/analyze_budget_variance", () => {
        it("should analyze budget variance patterns", async () => {
            const response = await request(app)
                .post("/tools/analyze_budget_variance")
                .set("Authorization", `Bearer test-token-${householdId}`)
                .send({
                    categories: ["Groceries", "Utilities"],
                    months: 2,
                })
                .expect(200);

            expect(response.body).toHaveProperty("householdId", householdId);
            expect(response.body).toHaveProperty("variances");
            expect(Array.isArray(response.body.variances)).toBe(true);

            // Verify variance structure
            if (response.body.variances.length > 0) {
                const variance = response.body.variances[0];
                expect(variance).toHaveProperty("category");
                expect(variance).toHaveProperty("avgVarianceCents");
                expect(variance).toHaveProperty("trend");
                expect(Number.isInteger(variance.avgVarianceCents)).toBe(true);
            }

            // Verify recommendations
            expect(Array.isArray(response.body.recommendations)).toBe(true);
        });

        it("should analyze all categories when not specified", async () => {
            const response = await request(app)
                .post("/tools/analyze_budget_variance")
                .set("Authorization", `Bearer test-token-${householdId}`)
                .send({
                    months: 1,
                })
                .expect(200);

            expect(response.body).toHaveProperty("variances");
            expect(Array.isArray(response.body.variances)).toBe(true);
        });
    });

    describe("POST /tools/plan_next_month_budget", () => {
        it("should plan next month budget using recurring patterns", async () => {
            const response = await request(app)
                .post("/tools/plan_next_month_budget")
                .set("Authorization", `Bearer test-token-${householdId}`)
                .send({})
                .expect(200);

            expect(response.body).toHaveProperty("householdId", householdId);
            expect(response.body).toHaveProperty("nextMonth");
            expect(response.body).toHaveProperty("proposedBudgets");
            expect(Array.isArray(response.body.proposedBudgets)).toBe(true);

            // Verify proposed budget structure
            const budget = response.body.proposedBudgets[0];
            expect(budget).toHaveProperty("category");
            expect(budget).toHaveProperty("proposedBudgetCents");
            expect(Number.isInteger(budget.proposedBudgetCents)).toBe(true);

            // Verify totals
            expect(response.body).toHaveProperty("totalProposedBudgetCents");
            expect(response.body).toHaveProperty("projectedSurplusCents");
            expect(Number.isInteger(response.body.totalProposedBudgetCents)).toBe(true);
            expect(Number.isInteger(response.body.projectedSurplusCents)).toBe(true);

            // Verify recommendations
            expect(Array.isArray(response.body.recommendations)).toBe(true);
        });

        it("should include known upcoming expenses", async () => {
            const response = await request(app)
                .post("/tools/plan_next_month_budget")
                .set("Authorization", `Bearer test-token-${householdId}`)
                .send({
                    knownUpcomingExpenses: [
                        {
                            category: "Car Maintenance",
                            description: "Oil change",
                            estimatedAmountCents: 50000, // $500
                        },
                    ],
                })
                .expect(200);

            expect(response.body.knownUpcomingExpensesAccountedFor).toBe(true);

            // Check if car maintenance is in proposed budgets
            const carMaintenance = response.body.proposedBudgets.find(
                (b: any) => b.category === "Car Maintenance"
            );
            expect(carMaintenance).toBeDefined();
            expect(carMaintenance.proposedBudgetCents).toBe(50000);
        });
    });

    describe("POST /tools/simulate_budget_change", () => {
        it("should simulate budget reallocations", async () => {
            const response = await request(app)
                .post("/tools/simulate_budget_change")
                .set("Authorization", `Bearer test-token-${householdId}`)
                .send({
                    changes: [
                        {
                            category: "Groceries",
                            newBudgetCents: 50000, // Increase to $500
                        },
                        {
                            category: "Entertainment",
                            newBudgetCents: 10000, // Reduce to $100
                        },
                    ],
                })
                .expect(200);

            expect(response.body).toHaveProperty("householdId", householdId);
            expect(response.body).toHaveProperty("simulatedBudget");
            expect(response.body).toHaveProperty("impact");

            // Verify impact structure
            const impact = response.body.impact;
            expect(impact).toHaveProperty("totalBudgetChange");
            expect(impact).toHaveProperty("surplusChange");
            expect(Number.isInteger(impact.totalBudgetChange)).toBe(true);
            expect(Number.isInteger(impact.surplusChange)).toBe(true);

            // Verify recommendations for changes
            expect(Array.isArray(response.body.recommendations)).toBe(true);
        });

        it("should reject missing changes array", async () => {
            const response = await request(app)
                .post("/tools/simulate_budget_change")
                .set("Authorization", `Bearer test-token-${householdId}`)
                .send({
                    month: "2026-7",
                })
                .expect(400);

            expect(response.body).toHaveProperty("userMessage");
            expect(response.body.userMessage).toContain("Budget changes array is required");
        });

        it("should handle empty changes array", async () => {
            const response = await request(app)
                .post("/tools/simulate_budget_change")
                .set("Authorization", `Bearer test-token-${householdId}`)
                .send({
                    changes: [],
                })
                .expect(200);

            expect(response.body).toHaveProperty("simulatedBudget");
        });
    });

    describe("Determinism verification", () => {
        it("should produce identical results for identical inputs", async () => {
            const request1 = await request(app)
                .post("/tools/create_initial_budget")
                .set("Authorization", `Bearer test-token-${householdId}`)
                .send({ month: "2026-8" });

            const request2 = await request(app)
                .post("/tools/create_initial_budget")
                .set("Authorization", `Bearer test-token-${householdId}`)
                .send({ month: "2026-8" });

            // Compare key fields (id and timestamp may differ)
            expect(request1.body.totalBudgetedCents).toBe(request2.body.totalBudgetedCents);
            expect(request1.body.monthlyIncomeCents).toBe(request2.body.monthlyIncomeCents);
            expect(request1.body.projectedSurplusCents).toBe(request2.body.projectedSurplusCents);

            // Category order should be deterministic
            const categories1 = request1.body.proposedBudgets.map((b: any) => b.category);
            const categories2 = request2.body.proposedBudgets.map((b: any) => b.category);
            expect(categories1).toEqual(categories2);
        });

        it("should use only integers for Money types", async () => {
            const response = await request(app)
                .post("/tools/plan_next_month_budget")
                .set("Authorization", `Bearer test-token-${householdId}`)
                .send({});

            const validateMoneyType = (obj: any, path: string = ""): string[] => {
                const errors: string[] = [];
                if (obj === null || obj === undefined) return errors;

                if (typeof obj === "number") {
                    if (!Number.isInteger(obj)) {
                        errors.push(`${path}: ${obj} is not an integer`);
                    }
                    return errors;
                }

                if (Array.isArray(obj)) {
                    obj.forEach((item, idx) => {
                        errors.push(...validateMoneyType(item, `${path}[${idx}]`));
                    });
                    return errors;
                }

                if (typeof obj === "object") {
                    for (const [key, value] of Object.entries(obj)) {
                        if (key.endsWith("Cents")) {
                            errors.push(...validateMoneyType(value, `${path}.${key}`));
                        }
                    }
                }

                return errors;
            };

            const errors = validateMoneyType(response.body);
            expect(errors).toEqual([]);
        });
    });

    describe("Error handling", () => {
        it("should handle invalid household context", async () => {
            const response = await request(app)
                .post("/tools/create_initial_budget")
                .send({ month: "2026-7" })
                .expect(401);
        });

        it("should return appropriate error messages", async () => {
            const response = await request(app)
                .post("/tools/simulate_budget_change")
                .set("Authorization", `Bearer test-token-${householdId}`)
                .send({ invalid: "payload" })
                .expect(400);

            expect(response.body).toHaveProperty("errorCode");
            expect(response.body).toHaveProperty("userMessage");
        });
    });
});
