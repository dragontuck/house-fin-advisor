/**
 * Express server for Slice 1 REST API
 * Household financial data and calculations
 */

import express, { Express, Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import {
    EntityId,
    Money,
    MoneyFromDollars,
    MoneyToDollars,
    FinancialHealthStatus,
    AccountType,
    AccountStatus,
    CreateAccountRequest,
    UpdateAccountRequest,
} from "@house-fin/contracts";
import {
    HouseholdService,
    createHouseholdService,
    createFinancialSnapshotCalculator,
    CalculateSnapshotInput,
} from "@house-fin/domain";
import {
    PgHouseholdRepository,
    PgHouseholdMemberRepository,
    PgAccountRepository,
    PgFinancialSnapshotRepository,
    PgHouseholdSettingsRepository,
} from "./db/repositories";
import { householdContextMiddleware, verifyHouseholdContext } from "./middleware/household-context";

/**
 * Error with context
 */
class ApiError extends Error {
    constructor(
        public statusCode: number,
        public userMessage: string,
        public errorCode: string,
        public retryable: boolean = false,
        message?: string
    ) {
        super(message || userMessage);
        this.name = "ApiError";
    }
}

/**
 * Request context with correlation ID and household ID
 */
interface RequestContext {
    correlationId: string;
    householdId: EntityId;
    userId?: EntityId;
    isAuthorized?: boolean;
}

declare global {
    namespace Express {
        interface Request {
            context: RequestContext;
        }
    }
}

/**
 * Create Express server with all middleware and routes
 */
export function createServer(): Express {
    const app = express();

    // Middleware: Parse JSON
    app.use(express.json());

    // Middleware: Add correlation ID and request context
    app.use((req: Request, res: Response, next: NextFunction) => {
        // Slice 1: Use hardcoded household ID or from header if provided
        const SLICE_1_HOUSEHOLD_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
        const headerHouseholdId = req.headers["x-household-id"] as string;

        req.context = {
            correlationId: req.headers["x-correlation-id"] as string || uuidv4(),
            householdId: (headerHouseholdId || SLICE_1_HOUSEHOLD_ID) as EntityId,
        };
        res.setHeader("x-correlation-id", req.context.correlationId);
        next();
    });

    // Middleware: Extract household context (hardcoded for Slice 1, will be auth-based in Slice 2)
    app.use(householdContextMiddleware);

    // Initialize domain services
    const householdRepo = new PgHouseholdRepository();
    const memberRepo = new PgHouseholdMemberRepository();
    const accountRepo = new PgAccountRepository();
    const snapshotRepo = new PgFinancialSnapshotRepository();
    const settingsRepo = new PgHouseholdSettingsRepository();

    const householdService = createHouseholdService(
        householdRepo,
        memberRepo,
        accountRepo,
        snapshotRepo,
        settingsRepo
    );

    const snapshotCalculator = createFinancialSnapshotCalculator();

    // Health check
    app.get("/health", (req: Request, res: Response) => {
        res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // ==================== HOUSEHOLD ENDPOINTS ====================

    /**
     * GET /household
     * Get household information
     */
    app.get("/household", verifyHouseholdContext, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;

            const household = await householdService.getHousehold(householdId);

            res.json({
                id: household.id,
                name: household.name,
                createdAt: household.createdAt,
                updatedAt: household.updatedAt,
            });
        } catch (error) {
            next(error);
        }
    });

    /**
     * GET /household/members
     * Get household members
     */
    app.get(
        "/household/members",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context!.householdId;

                const members = await householdService.getHouseholdMembers(householdId);

                res.json({
                    members: members.map((m) => ({
                        id: m.id,
                        displayName: m.displayName,
                        role: m.role,
                        joinedAt: m.createdAt,
                    })),
                });
            } catch (error) {
                next(error);
            }
        }
    );

    // ==================== ACCOUNTS ENDPOINTS ====================

    /**
     * GET /accounts
     * List all accounts for household
     */
    app.get("/accounts", verifyHouseholdContext, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;

            const accounts = await householdService.getHouseholdAccounts(householdId);

            res.json({
                accounts: accounts.map((a) => ({
                    id: a.id,
                    name: a.name,
                    type: a.type,
                    ownership: a.ownership,
                    balance: MoneyToDollars(a.currentBalance),
                    currency: a.currency,
                    status: a.status,
                    institution: a.institutionName || undefined,
                })),
            });
        } catch (error) {
            next(error);
        }
    });

    /**
     * POST /accounts
     * Create a new account
     */
    app.post("/accounts", verifyHouseholdContext, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;

            // Validate request body
            const { name, type, ownership, balance, currency, institution } = req.body;

            if (!name || typeof name !== "string" || name.trim().length === 0) {
                throw new ApiError(
                    400,
                    "Account name is required and must be non-empty",
                    "INVALID_ACCOUNT_NAME"
                );
            }

            if (!type || !Object.values(AccountType).includes(type)) {
                throw new ApiError(
                    400,
                    "Account type is required and must be valid",
                    "INVALID_ACCOUNT_TYPE"
                );
            }

            if (!ownership) {
                throw new ApiError(
                    400,
                    "Account ownership is required",
                    "INVALID_ACCOUNT_OWNERSHIP"
                );
            }

            if (balance === undefined || balance === null) {
                throw new ApiError(400, "Account balance is required", "INVALID_BALANCE");
            }

            if (typeof balance !== "number") {
                throw new ApiError(400, "Account balance must be a number", "INVALID_BALANCE");
            }

            // Convert dollars to Money type (cents)
            const currentBalance = MoneyFromDollars(balance);

            const createReq: CreateAccountRequest = {
                householdId,
                name: name.trim(),
                type,
                ownership,
                currentBalance,
                currency: currency || "USD",
                institutionName: institution || undefined,
            };

            const account = await householdService.addAccount(createReq);

            res.status(201).json({
                id: account.id,
                name: account.name,
                type: account.type,
                ownership: account.ownership,
                balance: MoneyToDollars(account.currentBalance),
                currency: account.currency,
                status: account.status,
                institution: account.institutionName || undefined,
                createdAt: account.createdAt,
            });
        } catch (error) {
            next(error);
        }
    });

    // ==================== FINANCIAL SNAPSHOT ENDPOINTS ====================

    /**
     * GET /financial-snapshot
     * Get latest financial snapshot for household
     */
    app.get(
        "/financial-snapshot",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context!.householdId;

                // Get household settings (income, expenses)
                const settings = await householdService.getHouseholdSettings(householdId);
                if (!settings) {
                    throw new ApiError(
                        404,
                        "Household settings not found. Please configure your financial settings.",
                        "SETTINGS_NOT_FOUND"
                    );
                }

                // Get household accounts to calculate snapshot
                const accounts = await householdService.getHouseholdAccounts(householdId);

                // Calculate snapshot using deterministic calculator
                const input: CalculateSnapshotInput = {
                    householdId,
                    accounts,
                    monthlyIncome: settings.monthlyIncome,
                    monthlyEssentialExpenses: settings.monthlyEssentialExpenses,
                    monthlyDiscretionaryExpenses: settings.monthlyDiscretionaryExpenses,
                    asOf: new Date(),
                };

                const snapshot = snapshotCalculator.calculate(input);

                // Try to get existing snapshot or create new one
                let saved = await householdService.getLatestSnapshot(householdId);

                if (!saved || new Date(saved.asOf).toDateString() !== new Date().toDateString()) {
                    saved = await householdService.saveSnapshot({
                        householdId,
                        asOf: new Date(),
                        version: 1,
                        cash: snapshot.cash,
                        debt: snapshot.debt,
                        netWorth: snapshot.netWorth,
                        monthlyIncome: snapshot.monthlyIncome,
                        monthlyEssentialExpenses: snapshot.monthlyEssentialExpenses,
                        monthlyDiscretionaryExpenses: snapshot.monthlyDiscretionaryExpenses,
                        monthlySurplus: snapshot.monthlySurplus,
                        financialHealthStatus: snapshot.financialHealthStatus,
                        sourceAccountIds: snapshot.sourceAccountIds,
                        calculatedAt: new Date(),
                    });
                }

                res.json({
                    id: saved.id,
                    asOf: saved.asOf,
                    snapshot: {
                        cashAvailable: MoneyToDollars(saved.cash),
                        totalDebt: MoneyToDollars(saved.debt),
                        netWorth: MoneyToDollars(saved.netWorth),
                        monthlyIncome: MoneyToDollars(saved.monthlyIncome),
                        monthlyEssentialExpenses: MoneyToDollars(saved.monthlyEssentialExpenses),
                        monthlyDiscretionaryExpenses: MoneyToDollars(
                            saved.monthlyDiscretionaryExpenses
                        ),
                        monthlySurplus: MoneyToDollars(saved.monthlySurplus),
                        healthStatus: saved.financialHealthStatus,
                    },
                });
            } catch (error) {
                next(error);
            }
        }
    );

    // ==================== FINANCIAL PULSE ENDPOINT ====================

    /**
     * GET /financial-pulse
     * Get financial pulse - combined household + snapshot for UI
     */
    app.get(
        "/financial-pulse",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context!.householdId;

                // Get household
                const household = await householdService.getHousehold(householdId);

                // Get household settings
                const settings = await householdService.getHouseholdSettings(householdId);
                if (!settings) {
                    throw new ApiError(
                        404,
                        "Household settings not found. Please configure your financial settings.",
                        "SETTINGS_NOT_FOUND"
                    );
                }

                // Get accounts
                const accounts = await householdService.getHouseholdAccounts(householdId);

                // Calculate snapshot
                const input: CalculateSnapshotInput = {
                    householdId,
                    accounts,
                    monthlyIncome: settings.monthlyIncome,
                    monthlyEssentialExpenses: settings.monthlyEssentialExpenses,
                    monthlyDiscretionaryExpenses: settings.monthlyDiscretionaryExpenses,
                    asOf: new Date(),
                };

                const snapshot = snapshotCalculator.calculate(input);

                // Save or get existing snapshot
                let saved = await householdService.getLatestSnapshot(householdId);

                if (!saved || new Date(saved.asOf).toDateString() !== new Date().toDateString()) {
                    saved = await householdService.saveSnapshot({
                        householdId,
                        asOf: new Date(),
                        version: 1,
                        cash: snapshot.cash,
                        debt: snapshot.debt,
                        netWorth: snapshot.netWorth,
                        monthlyIncome: snapshot.monthlyIncome,
                        monthlyEssentialExpenses: snapshot.monthlyEssentialExpenses,
                        monthlyDiscretionaryExpenses: snapshot.monthlyDiscretionaryExpenses,
                        monthlySurplus: snapshot.monthlySurplus,
                        financialHealthStatus: snapshot.financialHealthStatus,
                        sourceAccountIds: snapshot.sourceAccountIds,
                        calculatedAt: new Date(),
                    });
                }

                // Generate health message based on status
                let healthMessage = "";
                switch (saved.financialHealthStatus) {
                    case FinancialHealthStatus.HEALTHY:
                        healthMessage =
                            "Your household is in good financial shape. Keep maintaining this momentum!";
                        break;
                    case FinancialHealthStatus.ATTENTION:
                        healthMessage =
                            "Your finances are stable but there may be room for improvement. Consider reviewing your spending habits.";
                        break;
                    case FinancialHealthStatus.AT_RISK:
                        healthMessage =
                            "Your household shows financial stress. You may want to review your budget and debt management strategy.";
                        break;
                }

                // Build accounts summary by category
                const accountsSummary = {
                    cash: accounts
                        .filter(
                            (a) =>
                                (a.type === AccountType.CHECKING || a.type === AccountType.SAVINGS) &&
                                a.status === AccountStatus.ACTIVE
                        )
                        .map((a) => ({
                            name: a.name,
                            balance: MoneyToDollars(a.currentBalance),
                            type: a.type,
                        })),
                    retirement: accounts
                        .filter((a) => a.type === AccountType.RETIREMENT && a.status === AccountStatus.ACTIVE)
                        .map((a) => ({
                            name: a.name,
                            balance: MoneyToDollars(a.currentBalance),
                            type: a.type,
                        })),
                    investments: accounts
                        .filter(
                            (a) => a.type === AccountType.INVESTMENT && a.status === AccountStatus.ACTIVE
                        )
                        .map((a) => ({
                            name: a.name,
                            balance: MoneyToDollars(a.currentBalance),
                            type: a.type,
                        })),
                    debt: accounts
                        .filter(
                            (a) =>
                                (a.type === AccountType.CREDIT_CARD ||
                                    a.type === AccountType.LOAN ||
                                    a.type === AccountType.MORTGAGE) &&
                                a.status === AccountStatus.ACTIVE
                        )
                        .map((a) => ({
                            name: a.name,
                            balance: Math.abs(MoneyToDollars(a.currentBalance)),
                            type: a.type,
                        })),
                };

                // Return financial pulse
                res.json({
                    householdId,
                    householdName: household.name,
                    asOf: saved.asOf,
                    healthStatus: saved.financialHealthStatus,
                    healthMessage,
                    keyMetrics: {
                        netWorth: MoneyToDollars(saved.netWorth),
                        cashAvailable: MoneyToDollars(saved.cash),
                        monthlyIncome: MoneyToDollars(saved.monthlyIncome),
                        monthlyExpenses:
                            MoneyToDollars(saved.monthlyEssentialExpenses) +
                            MoneyToDollars(saved.monthlyDiscretionaryExpenses),
                        monthlySurplus: MoneyToDollars(saved.monthlySurplus),
                        totalDebt: MoneyToDollars(saved.debt),
                    },
                    accountsSummary,
                    statusMessage: healthMessage,
                });
            } catch (error) {
                next(error);
            }
        }
    );

    // ==================== ERROR HANDLING ====================

    /**
     * 404 handler
     */
    app.use((req: Request, res: Response) => {
        res.status(404).json({
            userMessage: "Endpoint not found",
            errorCode: "NOT_FOUND",
            correlationId: req.context.correlationId,
            retryable: false,
        });
    });

    /**
     * Global error handler
     */
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        const correlationId = req.context?.correlationId || uuidv4();

        // Log error (in production, would log to external service)
        console.error(`[${correlationId}] Error:`, err);

        // Handle known API errors
        if (err instanceof ApiError) {
            return res.status(err.statusCode).json({
                userMessage: err.userMessage,
                errorCode: err.errorCode,
                correlationId,
                retryable: err.retryable,
                timestamp: new Date().toISOString(),
            });
        }

        // Handle validation errors
        if (err.name === "ValidationError") {
            return res.status(400).json({
                userMessage: "Request validation failed",
                errorCode: "VALIDATION_ERROR",
                correlationId,
                retryable: false,
                timestamp: new Date().toISOString(),
            });
        }

        // Handle database errors
        if (err.name === "Error" && err.message.includes("not found")) {
            return res.status(404).json({
                userMessage: err.message,
                errorCode: "NOT_FOUND",
                correlationId,
                retryable: false,
                timestamp: new Date().toISOString(),
            });
        }

        // Generic error response (don't expose internals)
        res.status(500).json({
            userMessage:
                "An unexpected error occurred. Please try again or contact support.",
            errorCode: "INTERNAL_ERROR",
            correlationId,
            retryable: true,
            timestamp: new Date().toISOString(),
        });
    });

    return app;
}

/**
 * Start server
 */
export async function startServer(port: number = 6723): Promise<void> {
    const app = createServer();

    await new Promise<void>((resolve) => {
        app.listen(port, () => {
            console.log(`✓ API server listening on port ${port}`);
            resolve();
        });
    });
}

// Start if run directly
if (require.main === module) {
    startServer(6723).catch(console.error);
}
