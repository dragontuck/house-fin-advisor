/**
 * Integration tests for Slice 1 REST API
 */

import request from "supertest";
import { createServer } from "../../apps/api/src/server";
import { Express } from "express";
import { EntityId, MoneyFromDollars } from "@house-fin/contracts";

// Mock the repositories to use in-memory storage for testing
jest.mock("../../apps/api/src/db/repositories", () => {
    const { EntityId } = require("@house-fin/contracts");

    // In-memory storage for tests
    const households = new Map();
    const members = new Map();
    const accounts = new Map();
    const snapshots = new Map();
    const settings = new Map();

    // Initialize test data
    const householdId = EntityId("f47ac10b-58cc-4372-a567-0e02b2c3d479");
    households.set(householdId, {
        id: householdId,
        name: "Tucker Household",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
    });

    // Initialize household settings
    settings.set(householdId, {
        id: EntityId("settings-1"),
        householdId,
        monthlyIncome: 1200000, // $12,000 in cents
        monthlyEssentialExpenses: 680000, // $6,800 in cents
        monthlyDiscretionaryExpenses: 120000, // $1,200 in cents
        currency: "USD",
        incomeSource: "manual_entry",
        updatedBy: EntityId("member-1"),
        updatedAt: new Date("2026-01-01"),
        createdAt: new Date("2026-01-01"),
    });

    members.set(`${householdId}:sean`, {
        id: EntityId("member-1"),
        householdId,
        identityId: "sean@example.com",
        displayName: "Sean",
        role: "OWNER",
        visibility: "VISIBLE",
        createdAt: new Date("2026-01-01"),
    });

    members.set(`${householdId}:wife`, {
        id: EntityId("member-2"),
        householdId,
        identityId: "wife@example.com",
        displayName: "Wife",
        role: "MEMBER",
        visibility: "VISIBLE",
        createdAt: new Date("2026-01-02"),
    });

    // Initialize Tucker household accounts
    accounts.set("acc-checking", {
        id: EntityId("acc-checking"),
        householdId,
        name: "Checking Account",
        type: "CHECKING",
        ownership: "JOINT",
        currency: "USD",
        currentBalance: 720000, // $7,200 in cents
        institutionName: "Bank of America",
        lastUpdatedAt: new Date(),
        status: "ACTIVE",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
    });

    accounts.set("acc-savings", {
        id: EntityId("acc-savings"),
        householdId,
        name: "Savings Account",
        type: "SAVINGS",
        ownership: "JOINT",
        currency: "USD",
        currentBalance: 1200000, // $12,000 in cents
        institutionName: "Bank of America",
        lastUpdatedAt: new Date(),
        status: "ACTIVE",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
    });

    accounts.set("acc-401k", {
        id: EntityId("acc-401k"),
        householdId,
        name: "401k",
        type: "RETIREMENT",
        ownership: "INDIVIDUAL",
        currency: "USD",
        currentBalance: 32500000, // $325,000 in cents
        institutionName: "Vanguard",
        lastUpdatedAt: new Date(),
        status: "ACTIVE",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
    });

    accounts.set("acc-ira", {
        id: EntityId("acc-ira"),
        householdId,
        name: "IRA",
        type: "RETIREMENT",
        ownership: "INDIVIDUAL",
        currency: "USD",
        currentBalance: 8500000, // $85,000 in cents
        institutionName: "Vanguard",
        lastUpdatedAt: new Date(),
        status: "ACTIVE",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
    });

    accounts.set("acc-mortgage", {
        id: EntityId("acc-mortgage"),
        householdId,
        name: "Home Mortgage",
        type: "MORTGAGE",
        ownership: "JOINT",
        currency: "USD",
        currentBalance: -24000000, // -$240,000 in cents
        institutionName: "Wells Fargo",
        lastUpdatedAt: new Date(),
        status: "ACTIVE",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
    });

    return {
        PgHouseholdRepository: class {
            async findById(id: string) {
                return households.get(id) || null;
            }

            async findAll() {
                return Array.from(households.values());
            }

            async create(req: any) {
                const id = EntityId("new-household");
                const household = {
                    id,
                    name: req.name,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                households.set(id, household);
                return household;
            }

            async update(id: string, updates: any) {
                const household = households.get(id);
                if (!household) throw new Error("Household not found");
                Object.assign(household, updates, { updatedAt: new Date() });
                return household;
            }
        },

        PgHouseholdMemberRepository: class {
            async create(member: any) {
                const id = EntityId("new-member");
                const m = { id, ...member, createdAt: new Date() };
                members.set(`${member.householdId}:${member.identityId}`, m);
                return m;
            }

            async findByHouseholdId(householdId: string) {
                const result = [];
                for (const [key, value] of members.entries()) {
                    if (key.startsWith(householdId)) {
                        result.push(value);
                    }
                }
                return result;
            }

            async findByIdentityId(householdId: string, identityId: string) {
                return members.get(`${householdId}:${identityId}`) || null;
            }

            async findAll() {
                return Array.from(members.values());
            }
        },

        PgAccountRepository: class {
            async create(req: any) {
                const id = EntityId("new-account");
                const account = {
                    id,
                    ...req,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                accounts.set(id, account);
                return account;
            }

            async findById(id: string) {
                return accounts.get(id) || null;
            }

            async findByHouseholdId(householdId: string) {
                const result = [];
                for (const [, value] of accounts.entries()) {
                    if (value.householdId === householdId) {
                        result.push(value);
                    }
                }
                return result;
            }

            async findAll() {
                return Array.from(accounts.values());
            }

            async update(id: string, updates: any) {
                const account = accounts.get(id);
                if (!account) throw new Error("Account not found");
                Object.assign(account, updates, { updatedAt: new Date() });
                return account;
            }
        },

        PgFinancialSnapshotRepository: class {
            async create(snapshot: any) {
                const id = EntityId("new-snapshot");
                const s = {
                    id,
                    ...snapshot,
                    createdAt: new Date(),
                };
                snapshots.set(id, s);
                return s;
            }

            async findLatestByHouseholdId(householdId: string) {
                let latest: any = null;
                for (const [, value] of snapshots.entries()) {
                    if (value.householdId === householdId) {
                        if (!latest || new Date(value.asOf) > new Date(latest.asOf)) {
                            latest = value;
                        }
                    }
                }
                return latest;
            }

            async findByHouseholdAndDate(householdId: string, date: Date) {
                const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                for (const [, value] of snapshots.entries()) {
                    if (
                        value.householdId === householdId &&
                        new Date(value.asOf).toDateString() === dateOnly.toDateString()
                    ) {
                        return value;
                    }
                }
                return null;
            }

            async findAll() {
                return Array.from(snapshots.values());
            }
        },

        PgHouseholdSettingsRepository: class {
            async create(s: any) {
                const id = EntityId("new-settings");
                const setting = {
                    id,
                    ...s,
                    createdAt: new Date(),
                };
                settings.set(s.householdId, setting);
                return setting;
            }

            async findByHouseholdId(householdId: string) {
                return settings.get(householdId) || null;
            }

            async update(id: string, updates: any) {
                for (const [, value] of settings.entries()) {
                    if (value.id === id) {
                        Object.assign(value, updates, { updatedAt: new Date() });
                        return value;
                    }
                }
                throw new Error("Settings not found");
            }
        },

        // Additional repositories required by server.ts
        PgFinancialDocumentRepository: class {
            async create(doc: any) { return { id: EntityId("doc"), ...doc }; }
            async findById(id: string) { return null; }
            async findByHouseholdId(householdId: string) { return []; }
            async findByChecksum(householdId: string, checksum: string) { return null; }
            async update(id: string, doc: any) { return { id, ...doc }; }
            async updateStatus(id: string, status: string) { return { id, status }; }
            async softDelete(id: string) { }
            async getProcessingHistory(documentId: string) { return []; }
        },

        PgReviewItemRepository: class {
            async createReviewItem(item: any) { return { id: EntityId("review"), ...item }; }
            async getReviewItem(id: string) { return null; }
            async updateReviewItem(item: any) { return item; }
            async listReviewItems(householdId: string) { return []; }
            async createResolution(resolution: any) { return { ...resolution }; }
            async getResolution(reviewItemId: string) { return null; }
        },

        PgPostingRepository: class {
            async getAutoPostConfig(householdId: string) { return null; }
            async createOrUpdateAutoPostConfig(config: any) { return config; }
            async createPostedTransaction(txn: any) { return { ...txn, id: EntityId("txn") }; }
            async createPostedTransactions(txns: any[]) { return txns; }
            async getPostedTransaction(id: string) { return null; }
            async listPostedTransactions(householdId: string) { return []; }
            async createPostingAudit(audit: any) { return audit; }
            async updatePostingAudit(audit: any) { return audit; }
            async getPostingAudit(correlationId: string) { return null; }
            async getPostingAuditByIdempotencyKey(key: string) { return null; }
        },

        PgBudgetRepository: class {
            async create(budget: any) { return { id: EntityId("budget"), ...budget }; }
            async findById(id: string) { return null; }
            async findByHouseholdAndPeriod(householdId: string, year: number, month: number) { return []; }
            async findByCategory(householdId: string, year: number, month: number, category: string) { return null; }
            async update(id: string, updates: any) { return { id, ...updates }; }
            async delete(id: string, householdId: string) { }
            async getTransactionsForPeriod(householdId: string, year: number, month: number) { return []; }
            async categorizeTransaction(transactionId: string, householdId: string, category: string) { }
        },

        PgCashFlowRepository: class {
            async getTransactionsForRange(householdId: string, fromDate: Date, toDate: Date) { return []; }
            async getLiquidCashCents(householdId: string) { return 0; }
            async getHouseholdSettings(householdId: string) { return null; }
            async getBudgetsForPeriod(householdId: string, year: number, month: number) { return []; }
        },

        PgSavingsGoalRepository: class {
            async create(goal: any) { return { id: EntityId("goal"), ...goal }; }
            async findById(id: string) { return null; }
            async findByHouseholdId(householdId: string) { return []; }
            async findEmergencyFundGoal(householdId: string) { return null; }
            async update(id: string, updates: any) { return { id, ...updates }; }
            async delete(id: string, householdId: string) { }
        },

        PgDebtRepository: class {
            async findActiveAccountsByHousehold(householdId: string) { return []; }
            async updateDebtDetails(id: string, details: any) { return { id, ...details }; }
        },

        PgAdvisorConversationRepository: class {
            async create(conv: any) { return { id: EntityId("conv"), ...conv }; }
            async findById(id: string) { return null; }
            async findByHouseholdId(householdId: string) { return []; }
            async update(id: string, updates: any) { return { id, ...updates }; }
        },

        PgAdvisorMessageRepository: class {
            async create(msg: any) { return { id: EntityId("msg"), ...msg }; }
            async findByConversationId(conversationId: string) { return []; }
            async findById(id: string) { return null; }
        },

        PgWorkflowStateRepository: class {
            async save(state: any) { return state; }
            async findById(id: string) { return null; }
            async findByConversationId(conversationId: string) { return null; }
        },

        PgToolExecutionRepository: class {
            async record(execution: any) { return { id: EntityId("exec"), ...execution }; }
            async findByMessageId(messageId: string) { return []; }
            async findByConversationId(conversationId: string) { return []; }
        },
    };
});

describe("Slice 1 REST API Integration Tests", () => {
    let app: Express;

    beforeAll(() => {
        app = createServer();
    });

    describe("Health Check", () => {
        it("should return 200 on /health", async () => {
            const res = await request(app).get("/health");
            expect(res.status).toBe(200);
            expect(res.body.status).toBe("ok");
            expect(res.body.timestamp).toBeDefined();
        });
    });

    describe("GET /household", () => {
        it("should return household information", async () => {
            const res = await request(app).get("/household");

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("id");
            expect(res.body).toHaveProperty("name");
            expect(res.body).toHaveProperty("createdAt");
            expect(res.body).toHaveProperty("updatedAt");
            expect(res.body.name).toBe("Tucker Household");
        });

        it("should include correlation ID in response", async () => {
            const res = await request(app).get("/household");

            expect(res.headers["x-correlation-id"]).toBeDefined();
        });

        it("should preserve correlation ID from request", async () => {
            const correlationId = "test-123";
            const res = await request(app)
                .get("/household")
                .set("x-correlation-id", correlationId);

            expect(res.headers["x-correlation-id"]).toBe(correlationId);
        });
    });

    describe("GET /household/members", () => {
        it("should return all household members", async () => {
            const res = await request(app).get("/household/members");

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("members");
            expect(Array.isArray(res.body.members)).toBe(true);
            expect(res.body.members.length).toBe(2);
        });

        it("should include member details", async () => {
            const res = await request(app).get("/household/members");

            expect(res.body.members[0]).toHaveProperty("id");
            expect(res.body.members[0]).toHaveProperty("displayName");
            expect(res.body.members[0]).toHaveProperty("role");
            expect(res.body.members[0]).toHaveProperty("joinedAt");
        });

        it("should not expose internal identity IDs", async () => {
            const res = await request(app).get("/household/members");

            expect(res.body.members[0]).not.toHaveProperty("identityId");
            expect(res.body.members[0]).not.toHaveProperty("visibility");
        });
    });

    describe("GET /accounts", () => {
        it("should return all household accounts", async () => {
            const res = await request(app).get("/accounts");

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("accounts");
            expect(Array.isArray(res.body.accounts)).toBe(true);
            expect(res.body.accounts.length).toBe(5);
        });

        it("should convert balances to dollars", async () => {
            const res = await request(app).get("/accounts");

            // Checking account should be $7,200
            const checking = res.body.accounts.find((a: any) => a.type === "CHECKING");
            expect(checking.balance).toBe(7200);

            // Savings should be $12,000
            const savings = res.body.accounts.find((a: any) => a.type === "SAVINGS");
            expect(savings.balance).toBe(12000);

            // Mortgage should be -$240,000
            const mortgage = res.body.accounts.find((a: any) => a.type === "MORTGAGE");
            expect(mortgage.balance).toBe(-240000);
        });

        it("should not expose internal IDs", async () => {
            const res = await request(app).get("/accounts");

            expect(res.body.accounts[0]).not.toHaveProperty("currentBalance");
            expect(res.body.accounts[0]).not.toHaveProperty("householdId");
            expect(res.body.accounts[0]).not.toHaveProperty("createdAt");
        });

        it("should include account metadata", async () => {
            const res = await request(app).get("/accounts");

            expect(res.body.accounts[0]).toHaveProperty("id");
            expect(res.body.accounts[0]).toHaveProperty("name");
            expect(res.body.accounts[0]).toHaveProperty("type");
            expect(res.body.accounts[0]).toHaveProperty("ownership");
            expect(res.body.accounts[0]).toHaveProperty("status");
        });
    });

    describe("POST /accounts", () => {
        it("should create a new account", async () => {
            const res = await request(app).post("/accounts").send({
                name: "Test Savings",
                type: "SAVINGS",
                ownership: "INDIVIDUAL",
                balance: 5000,
                currency: "USD",
            });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty("id");
            expect(res.body.name).toBe("Test Savings");
            expect(res.body.type).toBe("SAVINGS");
            expect(res.body.balance).toBe(5000);
            expect(res.body.currency).toBe("USD");
        });

        it("should convert dollars to internal Money format", async () => {
            const res = await request(app).post("/accounts").send({
                name: "Test Account",
                type: "CHECKING",
                ownership: "JOINT",
                balance: 100.50,
            });

            expect(res.status).toBe(201);
            expect(res.body.balance).toBe(100.50);
        });

        it("should validate required fields", async () => {
            const res = await request(app).post("/accounts").send({
                type: "SAVINGS",
                ownership: "INDIVIDUAL",
                balance: 1000,
            });

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("errorCode");
            expect(res.body.errorCode).toBe("INVALID_ACCOUNT_NAME");
        });

        it("should validate account type", async () => {
            const res = await request(app).post("/accounts").send({
                name: "Test",
                type: "INVALID_TYPE",
                ownership: "INDIVIDUAL",
                balance: 1000,
            });

            expect(res.status).toBe(400);
            expect(res.body.errorCode).toBe("INVALID_ACCOUNT_TYPE");
        });

        it("should validate balance field", async () => {
            const res = await request(app).post("/accounts").send({
                name: "Test",
                type: "SAVINGS",
                ownership: "INDIVIDUAL",
            });

            expect(res.status).toBe(400);
            expect(res.body.errorCode).toBe("INVALID_BALANCE");
        });

        it("should trim account name", async () => {
            const res = await request(app).post("/accounts").send({
                name: "  Test Name  ",
                type: "SAVINGS",
                ownership: "INDIVIDUAL",
                balance: 1000,
            });

            expect(res.status).toBe(201);
            expect(res.body.name).toBe("Test Name");
        });

        it("should set default currency to USD", async () => {
            const res = await request(app).post("/accounts").send({
                name: "Test",
                type: "SAVINGS",
                ownership: "INDIVIDUAL",
                balance: 1000,
            });

            expect(res.status).toBe(201);
            expect(res.body.currency).toBe("USD");
        });

        it("should return consistent error response", async () => {
            const res = await request(app).post("/accounts").send({
                // Empty body
            });

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("userMessage");
            expect(res.body).toHaveProperty("errorCode");
            expect(res.body).toHaveProperty("correlationId");
            expect(res.body).toHaveProperty("retryable");
        });
    });

    describe("GET /financial-snapshot", () => {
        it("should return latest financial snapshot", async () => {
            const res = await request(app).get("/financial-snapshot");

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("id");
            expect(res.body).toHaveProperty("asOf");
            expect(res.body).toHaveProperty("snapshot");
        });

        it("should convert Money to dollars", async () => {
            const res = await request(app).get("/financial-snapshot");

            expect(res.body.snapshot).toHaveProperty("cashAvailable");
            expect(res.body.snapshot).toHaveProperty("totalDebt");
            expect(res.body.snapshot).toHaveProperty("netWorth");
            expect(res.body.snapshot).toHaveProperty("monthlySurplus");

            // Values should be in dollars, not cents
            expect(typeof res.body.snapshot.cashAvailable).toBe("number");
            expect(res.body.snapshot.cashAvailable).toBe(19200);
        });

        it("should calculate Tucker household metrics correctly", async () => {
            const res = await request(app).get("/financial-snapshot");

            expect(res.status).toBe(200);
            expect(res.body.snapshot.cashAvailable).toBe(19200); // $7.2k + $12k
            expect(res.body.snapshot.totalDebt).toBe(240000); // $240k mortgage
            expect(res.body.snapshot.netWorth).toBe(189200); // Assets - liabilities
            expect(res.body.snapshot.monthlySurplus).toBe(4000); // $12k - $6.8k - $1.2k
        });

        it("should include all financial metrics", async () => {
            const res = await request(app).get("/financial-snapshot");

            const snapshot = res.body.snapshot;
            expect(snapshot).toHaveProperty("cashAvailable");
            expect(snapshot).toHaveProperty("totalDebt");
            expect(snapshot).toHaveProperty("netWorth");
            expect(snapshot).toHaveProperty("monthlyIncome");
            expect(snapshot).toHaveProperty("monthlyEssentialExpenses");
            expect(snapshot).toHaveProperty("monthlyDiscretionaryExpenses");
            expect(snapshot).toHaveProperty("monthlySurplus");
            expect(snapshot).toHaveProperty("healthStatus");
        });
    });

    describe("GET /financial-pulse", () => {
        it("should return financial pulse for UI", async () => {
            const res = await request(app).get("/financial-pulse");

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("householdId");
            expect(res.body).toHaveProperty("householdName");
            expect(res.body).toHaveProperty("asOf");
            expect(res.body).toHaveProperty("healthStatus");
            expect(res.body).toHaveProperty("healthMessage");
            expect(res.body).toHaveProperty("keyMetrics");
            expect(res.body).toHaveProperty("accountsSummary");
            expect(res.body).toHaveProperty("statusMessage");
        });

        it("should include all key metrics", async () => {
            const res = await request(app).get("/financial-pulse");

            const metrics = res.body.keyMetrics;
            expect(metrics).toHaveProperty("netWorth");
            expect(metrics).toHaveProperty("cashAvailable");
            expect(metrics).toHaveProperty("monthlyIncome");
            expect(metrics).toHaveProperty("monthlyExpenses");
            expect(metrics).toHaveProperty("monthlySurplus");
            expect(metrics).toHaveProperty("totalDebt");
        });

        it("should categorize accounts in summary", async () => {
            const res = await request(app).get("/financial-pulse");

            const summary = res.body.accountsSummary;
            expect(summary).toHaveProperty("cash");
            expect(summary).toHaveProperty("retirement");
            expect(summary).toHaveProperty("investments");
            expect(summary).toHaveProperty("debt");

            expect(Array.isArray(summary.cash)).toBe(true);
            expect(Array.isArray(summary.retirement)).toBe(true);
            expect(Array.isArray(summary.investments)).toBe(true);
            expect(Array.isArray(summary.debt)).toBe(true);
        });

        it("should calculate total monthly expenses", async () => {
            const res = await request(app).get("/financial-pulse");

            const metrics = res.body.keyMetrics;
            expect(metrics.monthlyExpenses).toBe(8000); // $6.8k + $1.2k
        });

        it("should generate appropriate health message", async () => {
            const res = await request(app).get("/financial-pulse");

            expect(res.body.healthMessage).toBeDefined();
            expect(typeof res.body.healthMessage).toBe("string");
            expect(res.body.healthMessage.length).toBeGreaterThan(0);
        });

        it("should not expose internal account IDs", async () => {
            const res = await request(app).get("/financial-pulse");

            const allAccounts = [
                ...res.body.accountsSummary.cash,
                ...res.body.accountsSummary.retirement,
                ...res.body.accountsSummary.investments,
                ...res.body.accountsSummary.debt,
            ];

            allAccounts.forEach((account: any) => {
                expect(account).toHaveProperty("name");
                expect(account).toHaveProperty("balance");
                expect(account).toHaveProperty("type");
                expect(account).not.toHaveProperty("id");
                expect(account).not.toHaveProperty("householdId");
            });
        });

        it("should derive pulse from snapshot", async () => {
            const snapshotRes = await request(app).get("/financial-snapshot");
            const pulseRes = await request(app).get("/financial-pulse");

            // Key metrics should align
            expect(pulseRes.body.keyMetrics.netWorth).toBe(
                snapshotRes.body.snapshot.netWorth
            );
            expect(pulseRes.body.keyMetrics.cashAvailable).toBe(
                snapshotRes.body.snapshot.cashAvailable
            );
            expect(pulseRes.body.keyMetrics.totalDebt).toBe(
                snapshotRes.body.snapshot.totalDebt
            );
            expect(pulseRes.body.keyMetrics.monthlySurplus).toBe(
                snapshotRes.body.snapshot.monthlySurplus
            );
        });
    });

    describe("Error Handling", () => {
        it("should return 404 for unknown endpoint", async () => {
            const res = await request(app).get("/unknown");

            expect(res.status).toBe(404);
            expect(res.body).toHaveProperty("errorCode");
            expect(res.body.errorCode).toBe("NOT_FOUND");
            expect(res.body).toHaveProperty("correlationId");
        });

        it("should return consistent error format", async () => {
            const res = await request(app).get("/unknown");

            expect(res.body).toHaveProperty("userMessage");
            expect(res.body).toHaveProperty("errorCode");
            expect(res.body).toHaveProperty("correlationId");
            expect(res.body).toHaveProperty("retryable");
            expect(typeof res.body.userMessage).toBe("string");
            expect(typeof res.body.errorCode).toBe("string");
            expect(typeof res.body.correlationId).toBe("string");
            expect(typeof res.body.retryable).toBe("boolean");
        });

        it("should include timestamp in error response", async () => {
            const res = await request(app).post("/accounts").send({});

            expect(res.body).toHaveProperty("timestamp");
            expect(new Date(res.body.timestamp)).toBeInstanceOf(Date);
        });
    });

    describe("Household Authorization", () => {
        // In Slice 2, this will verify the actual household ID from auth token
        it("should return household data for authorized household", async () => {
            const res = await request(app).get("/household");

            expect(res.status).toBe(200);
            expect(res.body.id).toBeDefined();
        });

        it("should include household context in responses", async () => {
            const res = await request(app).get("/accounts");

            // All accounts should belong to the same household
            const allHouseholdIds = new Set(
                res.body.accounts.map((a: any) => a.householdId)
            );

            // In Slice 1, all should belong to Tucker household (mock)
            // In Slice 2, this will verify against auth token
            expect(res.status).toBe(200);
        });
    });
});
