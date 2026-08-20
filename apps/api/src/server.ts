/**
 * Express server for Slice 1 REST API
 * Household financial data and calculations
 */

import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
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
    DocumentProcessingStatus,
    DocumentSourceType,
    DocumentUploadResponse,
    DocumentStatusResponse,
    PostStatementRequest,
    PostStatementResponse,
    CreateBudgetRequest,
    UpdateBudgetRequest,
    CategorizationRequest,
    Budget,
    CreateSavingsGoalRequest,
    UpdateSavingsGoalRequest,
    GoalType,
    UpdateDebtAccountRequest,
    PulseCalculationDetails,
} from "@house-fin/contracts";
import {
    HouseholdService,
    createHouseholdService,
    createFinancialSnapshotCalculator,
    CalculateSnapshotInput,
    validateDocumentUpload,
    validateFileContent,
    calculateFileChecksum,
    generateObjectStorageKey,
    ReviewQueueService,
    TransactionPostingService,
    createBudgetService,
    createRecurringDetector,
    createCashFlowService,
    createSavingsGoalService,
    createDebtIntelligenceService,
    createHealthEngine,
    buildSnapshotHistory,
    buildSurplusExplanationText,
    AdvisorService,
    AdvisorContextService,
    createAdvisorContextService,
    BudgetApprovalService,
    createBudgetApprovalService,
} from "@house-fin/domain";
import {
    AIToolPlanner,
    AIToolExecutor,
    AIOrchestrator,
    FinancialContextBuilder,
    createFinancialContextBuilder,
    createDefaultLLMProvider,
    initializeAIOrchestrator,
} from "@house-fin/ai";
import {
    PrivacyGateway,
    setPrivacyGateway,
} from "@house-fin/security";
import {
    PgHouseholdRepository,
    PgHouseholdMemberRepository,
    PgAccountRepository,
    PgFinancialSnapshotRepository,
    PgHouseholdSettingsRepository,
    PgFinancialDocumentRepository,
    PgReviewItemRepository,
    PgPostingRepository,
    PgBudgetRepository,
    PgBudgetApprovalRepository,
    PgCashFlowRepository,
    PgSavingsGoalRepository,
    PgDebtRepository,
    PgAdvisorConversationRepository,
    PgAdvisorMessageRepository,
    PgWorkflowStateRepository,
    PgToolExecutionRepository,
} from "./db/repositories";
import { householdContextMiddleware, verifyHouseholdContext } from "./middleware/household-context";
import { uploadRateLimiter } from "./middleware/rate-limit";
import { ObjectStorageAdapter, createObjectStorageAdapter } from "./storage/object-storage";
import { getDocumentProcessingQueue, enqueueDocumentProcessing, closeDocumentProcessingQueue, getQueueStats } from "./queue/queue";
import { registerDocumentProcessingWorker } from "./queue/document-processor";
import { registerBudgetApprovalRoutes } from "./routes/budget-approval";

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

    // Middleware: CORS - Allow requests from web app
    app.use(cors({
        origin: process.env.CORS_ORIGIN || 'http://localhost:6173',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-household-id', 'x-correlation-id'],
        exposedHeaders: ['x-correlation-id']
    }));

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
    const documentRepo = new PgFinancialDocumentRepository();
    const reviewItemRepo = new PgReviewItemRepository();
    const postingRepo = new PgPostingRepository();

    // Advisor conversation repositories
    const conversationRepo = new PgAdvisorConversationRepository();
    const messageRepo = new PgAdvisorMessageRepository();
    const workflowRepo = new PgWorkflowStateRepository();
    const toolExecutionRepo = new PgToolExecutionRepository();

    const budgetRepo = new PgBudgetRepository();
    const budgetService = createBudgetService();

    // Budget approval workflow
    const budgetApprovalRepo = new PgBudgetApprovalRepository();
    const budgetApprovalService = createBudgetApprovalService();

    const cashFlowRepo = new PgCashFlowRepository();
    const recurringDetector = createRecurringDetector();
    const cashFlowService = createCashFlowService();
    const savingsGoalRepo = new PgSavingsGoalRepository();
    const savingsGoalService = createSavingsGoalService();
    const debtRepo = new PgDebtRepository();
    const debtService = createDebtIntelligenceService();
    const healthEngine = createHealthEngine();

    const householdService = createHouseholdService(
        householdRepo,
        memberRepo,
        accountRepo,
        snapshotRepo,
        settingsRepo
    );

    const snapshotCalculator = createFinancialSnapshotCalculator();
    const reviewQueueService = new ReviewQueueService(reviewItemRepo);
    const postingService = new TransactionPostingService(
        postingRepo,
        snapshotCalculator,
        reviewQueueService,
        documentRepo
    );

    // Advisor service for conversation orchestration
    const advisorService = new AdvisorService(
        conversationRepo,
        messageRepo,
        workflowRepo,
        toolExecutionRepo
    );

    // Initialize object storage adapter
    const storageAdapter = createObjectStorageAdapter();
    // Ensure bucket exists on startup
    storageAdapter.ensureBucket().catch((error) => {
        console.error("[STORAGE_INIT_FAILED] Failed to initialize object storage", {
            errorMessage: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
        });
    });

    // ==================== AI ORCHESTRATOR INITIALIZATION ====================

    // Initialize financial context builder
    const contextBuilder = createFinancialContextBuilder({
        budgetRepo: {
            findByHouseholdAndPeriod: (householdId: EntityId, year: number, month: number) =>
                budgetRepo.findByHouseholdAndPeriod(householdId, year, month),
            findByHouseholdIdRange: async (householdId: EntityId, startYear: number, startMonth: number, endYear: number, endMonth: number) => {
                const results = [];
                for (let y = startYear; y <= endYear; y++) {
                    for (let m = startMonth; m <= (y === endYear ? endMonth : 12); m++) {
                        const budgets = await budgetRepo.findByHouseholdAndPeriod(householdId, y, m);
                        results.push(...budgets);
                    }
                }
                return results;
            },
        },
        transactionRepo: {
            findByHouseholdAndPeriod: async (householdId: EntityId, year: number, month: number) => {
                const fromDate = new Date(year, month - 1, 1);
                const toDate = new Date(year, month, 1);
                const transactions = await cashFlowRepo.getTransactionsForRange(householdId, fromDate, toDate);
                return transactions.map(t => ({
                    id: t.id,
                    category: t.category,
                    amountCents: t.amountCents,
                    transactionDate: t.transactionDate,
                }));
            },
            findByHouseholdDateRange: async (householdId: EntityId, startDate: Date, endDate: Date) => {
                const transactions = await cashFlowRepo.getTransactionsForRange(householdId, startDate, endDate);
                return transactions.map(t => ({
                    id: t.id,
                    category: t.category,
                    amountCents: t.amountCents,
                    transactionDate: t.transactionDate,
                }));
            },
        },
        settingsRepo: {
            findByHouseholdId: (householdId: EntityId) => {
                // Placeholder - would need to implement actual settings repo
                return Promise.resolve(null);
            },
        },
        recurringPatternsRepo: {
            findByHouseholdId: async (householdId: EntityId) => {
                // Placeholder - would need to implement recurring patterns detection
                return [];
            },
        },
        snapshotRepo: {
            findLatest: (householdId: EntityId) => snapshotRepo.findLatestByHouseholdId(householdId),
        },
        debtRepo: {
            findByHouseholdId: async (householdId: EntityId) => {
                // Placeholder - would need to implement debt analysis
                return null;
            },
        },
        goalsRepo: {
            findByHouseholdId: (householdId: EntityId) => savingsGoalRepo.findByHouseholdId(householdId),
        },
    });

    // Initialize advisor context service for sanitization
    const contextService = createAdvisorContextService(contextBuilder);

    // Initialize privacy gateway
    const privacyGateway = new PrivacyGateway();
    setPrivacyGateway(privacyGateway);

    // Initialize LLM provider - only if API key is configured
    let llmProvider: any = null;
    try {
        if (process.env.ANTHROPIC_API_KEY) {
            llmProvider = createDefaultLLMProvider();
        } else {
            // For testing environments without API key, use a no-op provider
            console.warn("[AI_ORCHESTRATOR] No ANTHROPIC_API_KEY - AI features will be limited");
            llmProvider = {
                getName: () => "noop",
                getConfig: () => ({}),
                getMaxContextTokens: () => 100000,
                validateRequest: () => true,
                generateResponse: async () => ({
                    correlationId: "",
                    message: "AI features not available",
                    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                }),
            };
        }
    } catch (error) {
        console.error("[AI_ORCHESTRATOR_INIT] Failed to initialize LLM provider", error);
        throw error;
    }

    // Initialize AI tool planner
    const toolPlanner = new AIToolPlanner();

    // Initialize AI tool executor
    const toolExecutor = new AIToolExecutor();

    // Register tool handlers with executor
    // These are placeholder implementations - real implementations should fetch from repositories
    toolExecutor.registerTool("get_financial_snapshot", async (params: Record<string, unknown>, context) => {
        const householdId = context.householdId;
        const snapshot = await snapshotRepo.findLatestByHouseholdId(householdId);
        return snapshot ? { snapshot } : { error: "No snapshot found" };
    });

    toolExecutor.registerTool("get_cash_flow", async (params: Record<string, unknown>, context) => {
        const householdId = context.householdId;
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const transactions = await cashFlowRepo.getTransactionsForRange(householdId, thirtyDaysAgo, now);
        return { transactions };
    });

    toolExecutor.registerTool("get_current_budget", async (params: Record<string, unknown>, context) => {
        const householdId = context.householdId;
        const now = new Date();
        const budgets = await budgetRepo.findByHouseholdAndPeriod(householdId, now.getFullYear(), now.getMonth() + 1);
        return budgets.length > 0 ? { budgets } : { error: "No current budget found" };
    });

    toolExecutor.registerTool("get_budget_status", async (params: Record<string, unknown>, context) => {
        const householdId = context.householdId;
        const now = new Date();
        const budgets = await budgetRepo.findByHouseholdAndPeriod(householdId, now.getFullYear(), now.getMonth() + 1);

        const transactions = await cashFlowRepo.getTransactionsForRange(
            householdId,
            new Date(now.getFullYear(), now.getMonth(), 1),
            new Date(now.getFullYear(), now.getMonth() + 1, 1)
        );

        return {
            status: "ok",
            budgets,
            transactions,
        };
    });

    toolExecutor.registerTool("get_historical_budget_performance", async (params: Record<string, unknown>, context) => {
        const householdId = context.householdId;
        const now = new Date();
        // Get budgets for the last 12 months
        const history = [];
        for (let i = 0; i < 12; i++) {
            const month = now.getMonth() - i + 1;
            const year = now.getFullYear() + Math.floor((month - 1) / 12);
            const adjustedMonth = ((month - 1) % 12) + 1;
            const budgets = await budgetRepo.findByHouseholdAndPeriod(householdId, year, adjustedMonth);
            if (budgets.length > 0) history.push({ month: adjustedMonth, year, budgets });
        }
        return { history };
    });

    toolExecutor.registerTool("get_goal_status", async (params: Record<string, unknown>, context) => {
        const householdId = context.householdId;
        const goals = await savingsGoalRepo.findByHouseholdId(householdId);
        return { goals };
    });

    toolExecutor.registerTool("get_debt_summary", async (params: Record<string, unknown>, context) => {
        const householdId = context.householdId;
        const debtAccounts = await debtRepo.findActiveAccountsByHousehold(householdId);
        return { debtAccounts };
    });

    toolExecutor.registerTool("get_attention_items", async (params: Record<string, unknown>, context) => {
        const householdId = context.householdId;
        const items = await reviewItemRepo.listReviewItems(householdId);
        return { items };
    });

    toolExecutor.registerTool("get_recurring_financial_items", async (params: Record<string, unknown>, context) => {
        const householdId = context.householdId;
        const snapshot = await snapshotRepo.findLatestByHouseholdId(householdId);
        return snapshot ? { recurringItems: [] } : { recurringItems: [] };
    });

    toolExecutor.registerTool("simulate_purchase", async (params: Record<string, unknown>, context) => {
        const { amount } = params;
        return { simulationResult: { amount, impactedAccounts: [] } };
    });

    toolExecutor.registerTool("simulate_budget_change", async (params: Record<string, unknown>, context) => {
        const { changes } = params;
        return { simulationResult: { changes, projectedImpact: {} } };
    });

    toolExecutor.registerTool("analyze_budget_variance", async (params: Record<string, unknown>, context) => {
        const householdId = context.householdId;
        const now = new Date();
        const budgets = await budgetRepo.findByHouseholdAndPeriod(householdId, now.getFullYear(), now.getMonth() + 1);
        return budgets.length > 0 ? { variance: {} } : { error: "No budget found" };
    });

    toolExecutor.registerTool("plan_next_month_budget", async (params: Record<string, unknown>, context) => {
        const householdId = context.householdId;
        return { plan: { householdId, month: new Date() } };
    });

    toolExecutor.registerTool("create_initial_budget", async (params: Record<string, unknown>, context) => {
        if (!context.isHouseholdOwner) {
            throw new Error("Only household owners can create budgets");
        }
        const householdId = context.householdId;
        return { budgetId: "new-budget-id", created: true };
    });

    // Initialize AI Orchestrator
    const orchestrator = new AIOrchestrator(
        toolPlanner,
        toolExecutor,
        llmProvider,
        privacyGateway
    );

    // Initialize the singleton
    initializeAIOrchestrator(orchestrator);

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
                    case FinancialHealthStatus.WATCH:
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
                const calculationDetails: PulseCalculationDetails = {
                    snapshotId: saved.id,
                    calculationVersion: saved.version,
                    calculatedAt: saved.calculatedAt,
                    monthlyIncomeCents: saved.monthlyIncome,
                    monthlyEssentialExpensesCents: saved.monthlyEssentialExpenses,
                    monthlyDiscretionaryExpensesCents: saved.monthlyDiscretionaryExpenses,
                    surplusExplanation: buildSurplusExplanationText(saved),
                };

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
                        monthlyExpenses: MoneyToDollars(
                            (saved.monthlyEssentialExpenses + saved.monthlyDiscretionaryExpenses) as Money
                        ),
                        monthlySurplus: MoneyToDollars(saved.monthlySurplus),
                        totalDebt: MoneyToDollars(saved.debt),
                    },
                    accountsSummary,
                    statusMessage: healthMessage,
                    calculationDetails,
                });
            } catch (error) {
                next(error);
            }
        }
    );

    // ==================== DOCUMENT/STATEMENT ENDPOINTS ====================

    /**
    /**
     * POST /documents/upload
     * Upload a financial statement/document
     * Body: multipart/form-data with file and metadata
     */
    app.post(
        "/documents/upload",
        verifyHouseholdContext,
        uploadRateLimiter,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context!.householdId;
                const correlationId = req.context!.correlationId;

                // For now, expect JSON body with base64 file content
                // In production, would use multer middleware for multipart/form-data
                const {
                    fileName,
                    mimeType,
                    fileSize,
                    sourceType,
                    fileContent, // Base64 encoded file content
                    accountId,
                    institutionName,
                    statementType,
                    periodStart,
                    periodEnd,
                } = req.body;

                // Validate required fields
                if (!fileName || !mimeType || !fileSize || !sourceType || !fileContent) {
                    throw new ApiError(
                        400,
                        "Missing required fields: fileName, mimeType, fileSize, sourceType, fileContent",
                        "UPLOAD_INVALID_REQUEST",
                        false
                    );
                }

                // Validate source type
                if (!Object.values(DocumentSourceType).includes(sourceType)) {
                    throw new ApiError(
                        400,
                        `Invalid source type. Allowed: ${Object.values(DocumentSourceType).join(", ")}`,
                        "UPLOAD_INVALID_SOURCE_TYPE",
                        false
                    );
                }

                // Validate document upload
                const validationError = validateDocumentUpload(fileName, mimeType, fileSize);
                if (validationError) {
                    throw new ApiError(
                        400,
                        validationError.userMessage,
                        validationError.errorCode,
                        false
                    );
                }

                // Decode file content from base64
                let fileBuffer: Buffer;
                try {
                    fileBuffer = Buffer.from(fileContent, "base64");
                } catch (error) {
                    throw new ApiError(
                        400,
                        "Invalid file content encoding",
                        "UPLOAD_INVALID_ENCODING",
                        false
                    );
                }

                // Verify decoded size matches claim
                if (fileBuffer.length !== fileSize) {
                    throw new ApiError(
                        400,
                        "File size mismatch after decoding",
                        "UPLOAD_SIZE_MISMATCH",
                        false
                    );
                }

                // Validate file content matches claimed MIME type
                const contentValidationError = validateFileContent(fileBuffer, mimeType);
                if (contentValidationError) {
                    throw new ApiError(
                        400,
                        contentValidationError.userMessage,
                        contentValidationError.errorCode,
                        false
                    );
                }

                // Calculate checksum
                const fileChecksum = calculateFileChecksum(fileBuffer);

                // Check for duplicate file in this household
                const existingDoc = await documentRepo.findByChecksum(householdId, fileChecksum);
                if (existingDoc) {
                    // Return idempotent response - same checksum = same file
                    const statusResponse: DocumentStatusResponse = {
                        id: existingDoc.id,
                        fileName: existingDoc.fileName,
                        sourceType: existingDoc.sourceType,
                        processingStatus: existingDoc.processingStatus,
                        uploadedAt: existingDoc.uploadedAt,
                        processedAt: existingDoc.processedAt,
                        errorCode: existingDoc.errorCode,
                        errorMessageUser: existingDoc.errorMessageUser,
                    };
                    return res.status(200).json(statusResponse);
                }

                // Create document ID
                const documentId = EntityId(uuidv4());

                // Generate deterministic object storage key
                const objectStorageKey = generateObjectStorageKey(householdId, documentId, fileName);

                // Upload file to object storage
                await storageAdapter.uploadFile(objectStorageKey, fileBuffer, mimeType);

                // Create document record in database with cleanup on failure
                let document;
                try {
                    document = await documentRepo.create({
                        householdId,
                        sourceType: sourceType as DocumentSourceType,
                        fileName,
                        mimeType,
                        fileSizeBytes: fileSize,
                        fileChecksum,
                        objectStorageKey,
                        accountId: accountId ? (accountId as EntityId) : undefined,
                        institutionName: institutionName || undefined,
                        statementType: statementType || undefined,
                        periodStart: periodStart ? new Date(periodStart) : undefined,
                        periodEnd: periodEnd ? new Date(periodEnd) : undefined,
                        processingStatus: DocumentProcessingStatus.UPLOADED,
                        processingVersion: 1,
                        uploadedBy: "system", // TODO: Extract from OAuth token in Slice 2
                        uploadedAt: new Date(),
                        correlationId: EntityId(correlationId),
                    });
                } catch (dbError) {
                    // Database failed - clean up uploaded file to prevent orphans
                    try {
                        await storageAdapter.deleteFile(objectStorageKey);
                        console.error("[UPLOAD_CLEANUP] Deleted orphaned file after database failure", {
                            correlationId,
                            objectStorageKey,
                            householdId
                        });
                    } catch (cleanupError) {
                        // Log cleanup failure but don't mask original error
                        console.error("[UPLOAD_CLEANUP_FAILED] Failed to delete orphaned file", {
                            correlationId,
                            objectStorageKey,
                            householdId,
                            cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
                        });
                    }
                    // Re-throw original database error
                    throw dbError;
                }

                // Enqueue document for background processing
                try {
                    const documentQueue = getDocumentProcessingQueue();
                    await enqueueDocumentProcessing(document.id, householdId, correlationId);
                } catch (queueError) {
                    // Structured logging - no PII exposure
                    console.error("[QUEUE_ENQUEUE_FAILED] Failed to enqueue document for processing", {
                        correlationId,
                        documentId: document.id,
                        householdId,
                        errorMessage: queueError instanceof Error ? queueError.message : String(queueError)
                    });
                    // Don't fail the upload - queue error shouldn't block upload response
                    // Client can still check status via polling
                }

                const response: DocumentUploadResponse = {
                    id: document.id,
                    correlationId: document.correlationId,
                    objectStorageKey: document.objectStorageKey, // Don't expose in final version
                    status: document.processingStatus,
                    message: `Document uploaded successfully. Processing will begin shortly.`,
                };

                res.status(202).json(response); // 202 Accepted - async processing
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /documents/:id
     * Get document status and metadata
     */
    app.get(
        "/documents/:id",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context!.householdId;
                const documentId = req.params.id as EntityId;

                const document = await documentRepo.findById(documentId);
                if (!document) {
                    throw new ApiError(
                        404,
                        "Document not found",
                        "DOCUMENT_NOT_FOUND",
                        false
                    );
                }

                // Verify document belongs to household
                if (document.householdId !== householdId) {
                    throw new ApiError(
                        403,
                        "You do not have permission to access this document",
                        "DOCUMENT_ACCESS_DENIED",
                        false
                    );
                }

                const response: DocumentStatusResponse = {
                    id: document.id,
                    fileName: document.fileName,
                    sourceType: document.sourceType,
                    processingStatus: document.processingStatus,
                    uploadedAt: document.uploadedAt,
                    processedAt: document.processedAt,
                    errorCode: document.errorCode,
                    errorMessageUser: document.errorMessageUser,
                };

                res.json(response);
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /documents
     * List documents for household with summary stats
     */
    app.get(
        "/documents",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context!.householdId;

                const documents = await documentRepo.findByHouseholdId(householdId);

                // Fetch review items to count by statement
                const reviewItems = await reviewQueueService.listReviewItems(householdId);
                const reviewsByStatement = new Map<string, number>();
                for (const item of reviewItems) {
                    if (item.statementId) {
                        reviewsByStatement.set(
                            item.statementId,
                            (reviewsByStatement.get(item.statementId) || 0) + 1
                        );
                    }
                }

                const responses = await Promise.all(
                    documents.map(async (doc) => {
                        // Get posted transaction count for this document
                        const postedTxs = await postingRepo.listPostedTransactions(
                            householdId,
                            { sourceDocumentId: doc.id }
                        );

                        return {
                            id: doc.id,
                            fileName: doc.fileName,
                            sourceType: doc.sourceType,
                            processingStatus: doc.processingStatus,
                            uploadedAt: doc.uploadedAt,
                            processedAt: doc.processedAt,
                            errorCode: doc.errorCode,
                            errorMessageUser: doc.errorMessageUser,
                            // Extended fields for list view
                            accountId: doc.accountId,
                            periodStart: doc.periodStart,
                            periodEnd: doc.periodEnd,
                            importedTransactionCount: postedTxs.length,
                            reviewCount: reviewsByStatement.get(doc.id) || 0,
                        };
                    })
                );

                res.json(responses);
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /documents/:id/summary
     * Get detailed statement processing summary with counts and metrics
     */
    app.get(
        "/documents/:id/summary",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context!.householdId;
                const documentId = req.params.id as EntityId;

                const document = await documentRepo.findById(documentId);
                if (!document) {
                    throw new ApiError(404, "Document not found", "DOCUMENT_NOT_FOUND", false);
                }

                if (document.householdId !== householdId) {
                    throw new ApiError(
                        403,
                        "You do not have permission to access this document",
                        "DOCUMENT_ACCESS_DENIED",
                        false
                    );
                }

                // Get posted transactions for this document
                const postedTxs = await postingRepo.listPostedTransactions(householdId, {
                    sourceDocumentId: documentId,
                });

                // Get review items for this statement
                const reviewItems = await reviewQueueService.listReviewItems(householdId);
                const statementReviews = reviewItems.filter(
                    (item) => item.statementId === documentId
                );

                // Count duplicates (transactions with POSSIBLE_DUPLICATE state)
                const duplicateCount = postedTxs.filter(
                    (tx) => tx.reconciliationState === "POSSIBLE_DUPLICATE"
                ).length;

                // Get account details if available
                let accountInfo = null;
                if (document.accountId) {
                    const account = await accountRepo.findById(document.accountId);
                    if (account) {
                        accountInfo = {
                            id: account.id,
                            name: account.name,
                            type: account.type,
                        };
                    }
                }

                res.json({
                    id: document.id,
                    fileName: document.fileName,
                    sourceType: document.sourceType,
                    processingStatus: document.processingStatus,
                    uploadedAt: document.uploadedAt,
                    processedAt: document.processedAt,
                    periodStart: document.periodStart,
                    periodEnd: document.periodEnd,
                    account: accountInfo,
                    institutionName: document.institutionName,
                    // Processing metrics
                    totalTransactionsFound:
                        postedTxs.length +
                        (statementReviews.filter((r) => r.status === "PENDING").length || 0),
                    importedTransactionCount: postedTxs.length,
                    duplicateCount: duplicateCount,
                    reviewItemCount: statementReviews.length,
                    reviewItemsPending: statementReviews.filter(
                        (r) => r.status === "PENDING"
                    ).length,
                    reviewItemsResolved: statementReviews.filter(
                        (r) => r.status === "RESOLVED"
                    ).length,
                    // Error info
                    errorCode: document.errorCode,
                    errorMessageUser: document.errorMessageUser,
                });
            } catch (error) {
                next(error);
            }
        }
    );

    // ==================== REVIEW QUEUE ENDPOINTS ====================

    /**
     * GET /review-queue
     * Get review queue statistics for household
     */
    app.get(
        "/review-queue",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context!.householdId;
                const stats = await reviewQueueService.getStats(householdId);

                res.json({
                    householdId: stats.householdId,
                    totalItems: stats.totalItems,
                    byStatus: stats.byStatus,
                    byType: stats.byType,
                    bySeverity: stats.bySeverity,
                    oldestPendingAge: stats.oldestPendingAge,
                });
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /review-queue/items
     * List review items for household (with optional filtering)
     */
    app.get(
        "/review-queue/items",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context!.householdId;
                const { status, type, severity } = req.query;

                const filters: any = {};
                if (status) filters.status = status;
                if (type) filters.type = type;
                if (severity) filters.severity = severity;

                const items = await reviewQueueService.listReviewItems(householdId, filters);

                res.json({
                    items: items.map((item) => ({
                        id: item.id,
                        type: item.type,
                        severity: item.severity,
                        status: item.status,
                        title: item.title,
                        userMessage: item.userMessage,
                        recommendedAction: item.recommendedAction,
                        createdAt: item.createdAt,
                        resolvedAt: item.resolvedAt,
                    })),
                });
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /review-queue/items/next
     * Get next pending review item (highest severity, oldest first)
     */
    app.get(
        "/review-queue/items/next",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context!.householdId;
                const item = await reviewQueueService.getNextPendingItem(householdId);

                if (!item) {
                    return res.json({ item: null });
                }

                // Mark as in-progress when fetched
                await reviewQueueService.markInProgress(item.id, householdId);

                res.json({
                    item: {
                        id: item.id,
                        type: item.type,
                        severity: item.severity,
                        status: item.status,
                        title: item.title,
                        userMessage: item.userMessage,
                        recommendedAction: item.recommendedAction,
                        candidateValues: item.candidateValues,
                        supportingEvidence: item.supportingEvidence,
                        transactionIds: item.transactionIds,
                        createdAt: item.createdAt,
                    },
                });
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /review-queue/items/:itemId
     * Get detailed view of a review item
     */
    app.get(
        "/review-queue/items/:itemId",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context!.householdId;
                const { itemId } = req.params;

                const item = await reviewQueueService.getReviewItem(
                    itemId as EntityId,
                    householdId
                );

                if (!item) {
                    throw new ApiError(404, "Review item not found", "REVIEW_ITEM_NOT_FOUND", false);
                }

                res.json({
                    id: item.id,
                    type: item.type,
                    severity: item.severity,
                    status: item.status,
                    title: item.title,
                    userMessage: item.userMessage,
                    recommendedAction: item.recommendedAction,
                    candidateValues: item.candidateValues,
                    supportingEvidence: item.supportingEvidence,
                    transactionIds: item.transactionIds,
                    resolution: item.resolution ? {
                        chosenAction: item.resolution.chosenAction,
                        reasoning: item.resolution.reasoning,
                        resolvedAt: item.resolution.resolvedAt,
                        resolvedBy: item.resolution.resolvedBy,
                    } : null,
                    createdAt: item.createdAt,
                    resolvedAt: item.resolvedAt,
                });
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * POST /review-queue/items/:itemId/resolve
     * Resolve a review item with user's decision
     */
    app.post(
        "/review-queue/items/:itemId/resolve",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context!.householdId;
                const { itemId } = req.params;
                const { chosenAction, reasoning, affectedTransactionIds } = req.body;

                // Validate request
                if (!chosenAction || !reasoning) {
                    throw new ApiError(
                        400,
                        "chosenAction and reasoning are required",
                        "INVALID_REQUEST",
                        false
                    );
                }

                // Get user ID from context (would come from auth in production)
                const userId = req.headers["x-user-id"] as string || "system";

                // Resolve the item
                const resolution = await reviewQueueService.resolveReviewItem({
                    reviewItemId: itemId as EntityId,
                    householdId,
                    chosenAction,
                    reasoning,
                    affectedTransactionIds: affectedTransactionIds || [],
                    resolvedBy: userId,
                });

                // Get updated item to send back
                const updatedItem = await reviewQueueService.getReviewItem(
                    itemId as EntityId,
                    householdId
                );

                // Get next pending item
                const nextItem = await reviewQueueService.getNextPendingItem(householdId);

                res.json({
                    reviewItemId: updatedItem!.id,
                    newStatus: updatedItem!.status,
                    affectedTransactionCount: resolution.affectedTransactionIds.length,
                    nextReviewItemId: nextItem?.id || null,
                    message: "Review item resolved successfully",
                });
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * POST /review-queue/items/:itemId/archive
     * Archive a review item (defer decision)
     */
    app.post(
        "/review-queue/items/:itemId/archive",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context!.householdId;
                const { itemId } = req.params;

                const item = await reviewQueueService.archiveReviewItem(
                    itemId as EntityId,
                    householdId
                );

                res.json({
                    reviewItemId: item.id,
                    newStatus: item.status,
                    message: "Review item archived",
                });
            } catch (error) {
                next(error);
            }
        }
    );

    // ==================== STATEMENT POSTING ENDPOINTS ====================

    /**
     * POST /statement/:documentId/post
     * Post reconciled transactions from statement to canonical ledger
     */
    app.post(
        "/statement/:documentId/post",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { documentId } = req.params;
                const { accountId } = req.body;
                const correlationId = req.context.correlationId;
                const userId = req.context.userId || "system";

                // For idempotency, create a key from document + user + timestamp (rounded to minute)
                const minute = Math.floor(Date.now() / 60000);
                const idempotencyKey = `post-${documentId}-${userId}-${minute}`;

                const response = await postingService.postStatement(
                    { documentId: documentId as EntityId, accountId: accountId as EntityId | undefined },
                    {
                        idempotencyKey,
                        correlationId: correlationId as EntityId,
                        userId,
                    }
                );

                const statusCode = response.postingStatus === "FAILED" ? 400 : 200;
                res.status(statusCode).json(response);
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /posting-statistics
     * Get posting statistics and configuration
     */
    app.get(
        "/posting-statistics",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context.householdId;

                // Get auto-post config
                const config = await postingRepo.getAutoPostConfig(householdId);

                // Get posted transactions count and statistics
                const postedTransactions = await postingRepo.listPostedTransactions(householdId);

                const stats = {
                    householdId,
                    totalTransactionsPosted: postedTransactions.length,
                    autoPostConfig: config
                        ? {
                            confidenceThreshold: config.confidenceThreshold,
                            allowPartialPosting: config.allowPartialPosting,
                            updatedAt: config.updatedAt,
                        }
                        : null,
                    lastPostedAt: postedTransactions.length > 0
                        ? new Date(Math.max(...postedTransactions.map(t => t.postedAt.getTime())))
                        : null,
                    averageConfidenceScore: postedTransactions.length > 0
                        ? postedTransactions.reduce((sum, t) => sum + t.confidenceScore, 0) / postedTransactions.length
                        : 0,
                    highConfidenceCount: postedTransactions.filter(t => t.confidenceScore >= 0.9).length,
                    partialPostingCount: postedTransactions.filter(t => t.reconciliationState === "POSSIBLE_DUPLICATE").length,
                };

                res.json(stats);
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /posting-audit/:correlationId
     * View posting audit trail for a batch
     */
    app.get(
        "/posting-audit/:correlationId",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { correlationId } = req.params;

                const audit = await postingRepo.getPostingAudit(correlationId as EntityId);
                if (!audit) {
                    return res.status(404).json({
                        userMessage: "Posting audit not found",
                        errorCode: "NOT_FOUND",
                        correlationId: req.context.correlationId,
                    });
                }

                // Verify household access
                if (audit.householdId !== req.context.householdId) {
                    return res.status(403).json({
                        userMessage: "Access denied",
                        errorCode: "FORBIDDEN",
                        correlationId: req.context.correlationId,
                    });
                }

                res.json({
                    postingCorrelationId: audit.postingCorrelationId,
                    postingStatus: audit.postingStatus,
                    sourceDocumentId: audit.sourceDocumentId,
                    summary: {
                        highConfidenceCount: audit.highConfidenceCount,
                        highConfidencePosted: audit.highConfidencePosted,
                        lowConfidenceCount: audit.lowConfidenceCount,
                        lowConfidenceSkipped: audit.lowConfidenceSkipped,
                        totalCandidates: audit.totalCandidates,
                        totalPosted: audit.totalPosted,
                    },
                    timing: {
                        startedAt: audit.startedAt,
                        completedAt: audit.completedAt,
                        durationMs: audit.processingDurationMs,
                    },
                    error: audit.errorCode
                        ? {
                            errorCode: audit.errorCode,
                            errorMessage: audit.errorMessageUser,
                            details: audit.errorDetails,
                        }
                        : null,
                    initiatedBy: audit.initiatedBy,
                });
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /queue/stats
     * Get background job queue statistics (monitoring endpoint)
     */
    app.get(
        "/queue/stats",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const stats = await getQueueStats();
                res.json({
                    status: "ok",
                    queue: "document-processing",
                    ...stats,
                });
            } catch (error) {
                next(error);
            }
        }
    );

    // ==================== ERROR HANDLING ====================

    // ==================== BUDGET ENDPOINTS ====================

    /**
     * GET /budgets?year=&month=
     * List budget entries for a period
     */
    app.get(
        "/budgets",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId, correlationId } = req.context;
                const year = parseInt(req.query.year as string, 10);
                const month = parseInt(req.query.month as string, 10);

                if (!year || !month || month < 1 || month > 12) {
                    return res.status(400).json({
                        userMessage: "Provide valid year and month (1–12) as query parameters.",
                        errorCode: "INVALID_PERIOD",
                        correlationId,
                        retryable: false,
                    });
                }

                const budgets = await budgetRepo.findByHouseholdAndPeriod(householdId, year, month);
                res.json(budgets.map(b => ({
                    id: b.id,
                    category: b.category,
                    period: { year: b.periodYear, month: b.periodMonth },
                    amountCents: b.amountCents,
                    goalId: b.goalId ?? null,
                    notes: b.notes ?? null,
                    version: b.version,
                    createdAt: b.createdAt,
                    updatedAt: b.updatedAt,
                })));
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /budgets/results?year=&month=
     * Calculate and return BudgetResultSet for a period
     */
    app.get(
        "/budgets/results",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId, correlationId } = req.context;
                const year = parseInt(req.query.year as string, 10);
                const month = parseInt(req.query.month as string, 10);

                if (!year || !month || month < 1 || month > 12) {
                    return res.status(400).json({
                        userMessage: "Provide valid year and month (1–12) as query parameters.",
                        errorCode: "INVALID_PERIOD",
                        correlationId,
                        retryable: false,
                    });
                }

                const [budgets, transactions] = await Promise.all([
                    budgetRepo.findByHouseholdAndPeriod(householdId, year, month),
                    budgetRepo.getTransactionsForPeriod(householdId, year, month),
                ]);

                const resultSet = budgetService.calculateResults({
                    householdId,
                    period: { year, month },
                    budgets,
                    transactions,
                    asOf: new Date(),
                });

                res.json(resultSet);
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * POST /budgets
     * Create a budget entry for a category/period
     */
    app.post(
        "/budgets",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId, correlationId } = req.context;
                const body = req.body as CreateBudgetRequest;

                if (!body || typeof body !== "object") {
                    return res.status(400).json({
                        userMessage: "Request body is required.",
                        errorCode: "MISSING_BODY",
                        correlationId,
                        retryable: false,
                    });
                }

                try {
                    budgetService.validateBudget(
                        body.periodYear,
                        body.periodMonth,
                        body.category,
                        body.amountCents,
                    );
                } catch (validationError) {
                    return res.status(400).json({
                        userMessage: validationError instanceof Error ? validationError.message : "Invalid budget data.",
                        errorCode: "VALIDATION_ERROR",
                        correlationId,
                        retryable: false,
                    });
                }

                const existing = await budgetRepo.findByCategory(
                    householdId,
                    body.periodYear,
                    body.periodMonth,
                    body.category,
                );
                if (existing) {
                    return res.status(409).json({
                        userMessage: `A budget for ${body.category} in ${body.periodYear}-${String(body.periodMonth).padStart(2, "0")} already exists. Use PUT to update it.`,
                        errorCode: "BUDGET_ALREADY_EXISTS",
                        correlationId,
                        retryable: false,
                    });
                }

                const budget = await budgetRepo.create({
                    householdId,
                    periodYear: body.periodYear,
                    periodMonth: body.periodMonth,
                    category: body.category.trim(),
                    amountCents: body.amountCents as Money,
                    goalId: body.goalId as EntityId | undefined,
                    notes: body.notes,
                });

                res.status(201).json(budget);
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * PUT /budgets/:id
     * Update a budget entry (optimistic concurrency via version field)
     */
    app.put(
        "/budgets/:id",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId, correlationId } = req.context;
                const budgetId = req.params.id as EntityId;
                const body = req.body as UpdateBudgetRequest & { version: number };

                if (typeof body.version !== "number") {
                    return res.status(400).json({
                        userMessage: "Include the current version number to prevent conflicting updates.",
                        errorCode: "MISSING_VERSION",
                        correlationId,
                        retryable: false,
                    });
                }

                const existing = await budgetRepo.findById(budgetId);
                if (!existing || existing.householdId !== householdId) {
                    return res.status(404).json({
                        userMessage: "Budget not found.",
                        errorCode: "BUDGET_NOT_FOUND",
                        correlationId,
                        retryable: false,
                    });
                }

                if (body.amountCents !== undefined) {
                    try {
                        budgetService.validateBudget(
                            existing.periodYear,
                            existing.periodMonth,
                            existing.category,
                            body.amountCents,
                        );
                    } catch (validationError) {
                        return res.status(400).json({
                            userMessage: validationError instanceof Error ? validationError.message : "Invalid amount.",
                            errorCode: "VALIDATION_ERROR",
                            correlationId,
                            retryable: false,
                        });
                    }
                }

                const updated = await budgetRepo.update(budgetId, {
                    amountCents: body.amountCents,
                    notes: body.notes,
                }, body.version);

                res.json(updated);
            } catch (error) {
                if (error instanceof Error && error.message.includes("version conflict")) {
                    return res.status(409).json({
                        userMessage: "This budget was updated by someone else. Please reload and try again.",
                        errorCode: "VERSION_CONFLICT",
                        correlationId: req.context.correlationId,
                        retryable: false,
                    });
                }
                next(error);
            }
        }
    );

    /**
     * DELETE /budgets/:id
     * Remove a budget entry
     */
    app.delete(
        "/budgets/:id",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId, correlationId } = req.context;
                const budgetId = req.params.id as EntityId;

                const existing = await budgetRepo.findById(budgetId);
                if (!existing || existing.householdId !== householdId) {
                    return res.status(404).json({
                        userMessage: "Budget not found.",
                        errorCode: "BUDGET_NOT_FOUND",
                        correlationId,
                        retryable: false,
                    });
                }

                await budgetRepo.delete(budgetId, householdId);
                res.status(204).send();
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * PUT /transactions/:id/category
     * Assign or clear a spending category on a posted transaction
     */
    app.put(
        "/transactions/:id/category",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId, correlationId } = req.context;
                const transactionId = req.params.id;
                const body = req.body as CategorizationRequest;

                if (!body || typeof body.category !== "string") {
                    return res.status(400).json({
                        userMessage: "Provide a \"category\" string in the request body. Use an empty string to clear the category.",
                        errorCode: "MISSING_CATEGORY",
                        correlationId,
                        retryable: false,
                    });
                }

                await budgetRepo.categorizeTransaction(transactionId, householdId, body.category);
                res.status(204).send();
            } catch (error) {
                if (error instanceof Error && error.message === "Transaction not found") {
                    return res.status(404).json({
                        userMessage: "Transaction not found.",
                        errorCode: "TRANSACTION_NOT_FOUND",
                        correlationId: req.context.correlationId,
                        retryable: false,
                    });
                }
                next(error);
            }
        }
    );

    // ==================== CASH FLOW ENDPOINTS ====================

    /** Shared helper: build a date range for N calendar months ending at asOf. */
    function historyWindow(asOf: Date, months: number): { from: Date; to: Date } {
        const to = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1); // first of next month
        const from = new Date(to.getFullYear(), to.getMonth() - months, 1);
        return { from, to };
    }

    /**
     * GET /cash-flow/history?months=6
     * Historical monthly cash flow summary
     */
    app.get(
        "/cash-flow/history",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId } = req.context;
                const months = Math.min(parseInt(req.query.months as string || "6", 10) || 6, 24);
                const asOf = new Date();
                const { from, to } = historyWindow(asOf, months);
                const transactions = await cashFlowRepo.getTransactionsForRange(householdId, from, to);
                const history = cashFlowService.calculateHistory({ householdId, asOf, transactions });
                res.json(history);
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /cash-flow/current
     * Current-month cash-flow projection
     */
    app.get(
        "/cash-flow/current",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId } = req.context;
                const asOf = new Date();
                const { from, to } = historyWindow(asOf, 6);

                const [transactions, liquidCash, settings, currentBudgets] = await Promise.all([
                    cashFlowRepo.getTransactionsForRange(householdId, from, to),
                    cashFlowRepo.getLiquidCashCents(householdId),
                    cashFlowRepo.getHouseholdSettings(householdId),
                    cashFlowRepo.getBudgetsForPeriod(householdId, asOf.getFullYear(), asOf.getMonth() + 1),
                ]);

                const patterns = recurringDetector.detectPatterns(transactions, asOf);

                // Count distinct months in history for confidence scoring
                const monthSet = new Set(
                    transactions.map(tx => {
                        const d = tx.transactionDate;
                        return `${d.getFullYear()}-${d.getMonth() + 1}`;
                    })
                );

                const currentMonthKey = `${asOf.getFullYear()}-${asOf.getMonth() + 1}`;
                const currentMonthTxs = transactions.filter(tx => {
                    const d = tx.transactionDate;
                    return d.getFullYear() === asOf.getFullYear() && d.getMonth() + 1 === asOf.getMonth() + 1;
                });

                const projection = cashFlowService.calculateCurrentProjection({
                    householdId,
                    asOf,
                    liquidCashCents: liquidCash,
                    currentMonthTransactions: currentMonthTxs,
                    historicalPatterns: patterns,
                    currentMonthBudgets: currentBudgets,
                    householdSettings: settings,
                    historyMonthCount: monthSet.size,
                });

                res.json(projection);
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /cash-flow/patterns
     * Detected recurring transaction patterns (income and expenses)
     */
    app.get(
        "/cash-flow/patterns",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId } = req.context;
                const asOf = new Date();
                const { from, to } = historyWindow(asOf, 6);
                const transactions = await cashFlowRepo.getTransactionsForRange(householdId, from, to);
                const patterns = recurringDetector.detectPatterns(transactions, asOf);
                res.json(patterns);
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /cash-flow/forecast?months=3
     * Short-term cash-flow forecast
     */
    app.get(
        "/cash-flow/forecast",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId } = req.context;
                const forecastMonths = Math.min(parseInt(req.query.months as string || "3", 10) || 3, 12);
                const asOf = new Date();
                const { from, to } = historyWindow(asOf, 6);

                const [transactions, liquidCash, settings] = await Promise.all([
                    cashFlowRepo.getTransactionsForRange(householdId, from, to),
                    cashFlowRepo.getLiquidCashCents(householdId),
                    cashFlowRepo.getHouseholdSettings(householdId),
                ]);

                const patterns = recurringDetector.detectPatterns(transactions, asOf);

                // Build budget map for current + future months
                const budgetsByMonth = new Map<string, Budget[]>();
                const monthsNeeded = forecastMonths + 1;
                await Promise.all(
                    Array.from({ length: monthsNeeded }, (_, i) => {
                        let y = asOf.getFullYear();
                        let m = asOf.getMonth() + 1 + i;
                        while (m > 12) { m -= 12; y++; }
                        return cashFlowRepo.getBudgetsForPeriod(householdId, y, m).then(budgets => {
                            budgetsByMonth.set(`${y}-${m}`, budgets as any);
                        });
                    })
                );

                const monthSet = new Set(
                    transactions.map(tx => {
                        const d = tx.transactionDate;
                        return `${d.getFullYear()}-${d.getMonth() + 1}`;
                    })
                );

                const forecast = cashFlowService.calculateForecast({
                    householdId,
                    asOf,
                    liquidCashCents: liquidCash,
                    allTransactions: transactions,
                    historicalPatterns: patterns,
                    budgetsByMonth: budgetsByMonth as Map<string, any>,
                    householdSettings: settings,
                    historyMonthCount: monthSet.size,
                    forecastMonths,
                });

                res.json(forecast);
            } catch (error) {
                next(error);
            }
        }
    );

    // ==================== SAVINGS GOAL ENDPOINTS ====================

    /**
     * GET /goals — list all savings goals with calculated results
     */
    app.get(
        "/goals",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId } = req.context;
                const asOf = new Date();
                const goals = await savingsGoalRepo.findByHouseholdId(householdId);
                const results = goals.map(goal =>
                    savingsGoalService.calculateGoal({ goal, asOf }),
                );
                res.json(results);
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * POST /goals — create a new savings goal
     */
    app.post(
        "/goals",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId } = req.context;
                const body = req.body as CreateSavingsGoalRequest;

                if (!body.name?.trim()) {
                    return res.status(400).json({
                        userMessage: "Goal name is required.",
                        errorCode: "MISSING_GOAL_NAME",
                        correlationId: req.context.correlationId,
                        retryable: false,
                    });
                }
                if (!body.targetAmountCents || body.targetAmountCents <= 0) {
                    return res.status(400).json({
                        userMessage: "Target amount must be greater than zero.",
                        errorCode: "INVALID_TARGET_AMOUNT",
                        correlationId: req.context.correlationId,
                        retryable: false,
                    });
                }
                if (!Object.values(GoalType).includes(body.type)) {
                    return res.status(400).json({
                        userMessage: "Invalid goal type.",
                        errorCode: "INVALID_GOAL_TYPE",
                        correlationId: req.context.correlationId,
                        retryable: false,
                    });
                }

                const goal = await savingsGoalRepo.create({
                    householdId,
                    name: body.name.trim(),
                    type: body.type,
                    targetAmountCents: body.targetAmountCents as Money,
                    currentAmountCents: (body.currentAmountCents ?? 0) as Money,
                    monthlyContributionCents: (body.monthlyContributionCents ?? 0) as Money,
                    targetDate: body.targetDate ? new Date(body.targetDate) : null,
                    startDate: new Date(),
                    notes: body.notes ?? null,
                });
                const result = savingsGoalService.calculateGoal({ goal, asOf: new Date() });
                res.status(201).json(result);
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * PUT /goals/:id — update a savings goal
     */
    app.put(
        "/goals/:id",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId } = req.context;
                const goalId = req.params.id as EntityId;
                const body = req.body as UpdateSavingsGoalRequest & { version: number };

                const existing = await savingsGoalRepo.findById(goalId);
                if (!existing || existing.householdId !== householdId) {
                    return res.status(404).json({
                        userMessage: "Savings goal not found.",
                        errorCode: "GOAL_NOT_FOUND",
                        correlationId: req.context.correlationId,
                        retryable: false,
                    });
                }

                const updated = await savingsGoalRepo.update(
                    goalId,
                    {
                        name: body.name,
                        targetAmountCents: body.targetAmountCents,
                        currentAmountCents: body.currentAmountCents,
                        monthlyContributionCents: body.monthlyContributionCents,
                        targetDate: body.targetDate !== undefined
                            ? (body.targetDate ? new Date(body.targetDate) : null)
                            : undefined,
                        notes: body.notes,
                    },
                    body.version ?? existing.version,
                );
                const result = savingsGoalService.calculateGoal({ goal: updated, asOf: new Date() });
                res.json(result);
            } catch (error) {
                if (error instanceof Error && error.message.includes("version conflict")) {
                    return res.status(409).json({
                        userMessage: "This goal was updated by someone else. Reload and try again.",
                        errorCode: "VERSION_CONFLICT",
                        correlationId: req.context.correlationId,
                        retryable: true,
                    });
                }
                next(error);
            }
        }
    );

    /**
     * DELETE /goals/:id
     */
    app.delete(
        "/goals/:id",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId } = req.context;
                const goalId = req.params.id as EntityId;

                const existing = await savingsGoalRepo.findById(goalId);
                if (!existing || existing.householdId !== householdId) {
                    return res.status(404).json({
                        userMessage: "Savings goal not found.",
                        errorCode: "GOAL_NOT_FOUND",
                        correlationId: req.context.correlationId,
                        retryable: false,
                    });
                }

                await savingsGoalRepo.delete(goalId, householdId);
                res.status(204).send();
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /goals/emergency-fund — emergency fund adequacy analysis
     */
    app.get(
        "/goals/emergency-fund",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId } = req.context;

                const [settings, liquidCash, efGoal] = await Promise.all([
                    cashFlowRepo.getHouseholdSettings(householdId),
                    cashFlowRepo.getLiquidCashCents(householdId),
                    savingsGoalRepo.findEmergencyFundGoal(householdId),
                ]);

                if (!settings) {
                    return res.status(422).json({
                        userMessage: "Household settings have not been configured. Set up your income and expenses first.",
                        errorCode: "SETTINGS_NOT_CONFIGURED",
                        correlationId: req.context.correlationId,
                        retryable: false,
                    });
                }

                const policy = {
                    minimumMonths: settings.emergencyFundMinimumMonths ?? 3,
                    targetMonths: settings.emergencyFundTargetMonths ?? 6,
                    stretchMonths: settings.emergencyFundStretchMonths ?? 9,
                };

                const result = savingsGoalService.analyzeEmergencyFund({
                    householdId,
                    eligibleCashCents: liquidCash,
                    essentialMonthlyExpensesCents: settings.monthlyEssentialExpenses,
                    policy,
                    activeMonthlyContributionCents: efGoal?.monthlyContributionCents ?? 0,
                    asOf: new Date(),
                });

                res.json(result);
            } catch (error) {
                next(error);
            }
        }
    );

    // ==================== DEBT INTELLIGENCE ENDPOINTS ====================

    /**
     * GET /debt/summary — full debt analysis for the household
     */
    app.get(
        "/debt/summary",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId } = req.context;
                const [accounts, settings] = await Promise.all([
                    debtRepo.findActiveAccountsByHousehold(householdId),
                    cashFlowRepo.getHouseholdSettings(householdId),
                ]);
                const monthlyIncomeCents = settings?.monthlyIncome ?? 0;
                const result = debtService.analyze({
                    householdId,
                    accounts,
                    monthlyIncomeCents,
                    asOf: new Date(),
                });
                res.json(result);
            } catch (error) {
                next(error);
            }
        },
    );

    /**
     * PATCH /debt/accounts/:id — update debt-specific fields for an account
     */
    app.patch(
        "/debt/accounts/:id",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId } = req.context;
                const accountId = req.params.id as EntityId;
                const body = req.body as UpdateDebtAccountRequest;

                // Validate basis points range when provided
                if (
                    body.interestRateBps !== undefined &&
                    body.interestRateBps !== null &&
                    (body.interestRateBps < 0 || body.interestRateBps > 100000)
                ) {
                    return res.status(400).json({
                        userMessage: "Interest rate must be between 0 and 100,000 basis points (0%–1000%).",
                        errorCode: "INVALID_INTEREST_RATE",
                        correlationId: req.context.correlationId,
                        retryable: false,
                    });
                }

                const updated = await debtRepo.updateDebtDetails(accountId, householdId, {
                    creditLimitCents: body.creditLimitCents,
                    interestRateBps: body.interestRateBps,
                    minimumPaymentCents: body.minimumPaymentCents,
                    scheduledPaymentCents: body.scheduledPaymentCents,
                    statementBalanceCents: body.statementBalanceCents,
                    revolvingBalanceCents: body.revolvingBalanceCents,
                });
                res.json(updated);
            } catch (error) {
                if (error instanceof Error && error.message === "Account not found") {
                    return res.status(404).json({
                        userMessage: "Account not found.",
                        errorCode: "ACCOUNT_NOT_FOUND",
                        correlationId: req.context.correlationId,
                        retryable: false,
                    });
                }
                next(error);
            }
        },
    );

    // ==================== HEALTH & ATTENTION ENDPOINTS ====================

    /**
     * GET /health/summary — household financial health and attention items
     */
    app.get(
        "/health/summary",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId } = req.context;
                const now = new Date();
                const year = now.getFullYear();
                const month = now.getMonth() + 1;

                // Gather all inputs in parallel
                const [settings, liquidCash, accounts, goalList, budgets, transactions, lastTxRow] =
                    await Promise.all([
                        cashFlowRepo.getHouseholdSettings(householdId),
                        cashFlowRepo.getLiquidCashCents(householdId),
                        debtRepo.findActiveAccountsByHousehold(householdId),
                        savingsGoalRepo.findByHouseholdId(householdId),
                        budgetRepo.findByHouseholdAndPeriod(householdId, year, month),
                        budgetRepo.getTransactionsForPeriod(householdId, year, month),
                        cashFlowRepo.getTransactionsForRange(
                            householdId,
                            new Date(now.getFullYear(), now.getMonth(), 1),
                            now,
                        ),
                    ]);

                const monthlyIncomeCents = settings?.monthlyIncome ?? 0;
                const essentialExpensesCents = settings?.monthlyEssentialExpenses ?? 0;
                const monthlySurplusCents = monthlyIncomeCents - essentialExpensesCents - (settings?.monthlyDiscretionaryExpenses ?? 0);

                // Emergency fund coverage
                const efPolicy = {
                    minimumMonths: settings?.emergencyFundMinimumMonths ?? 3,
                    targetMonths: settings?.emergencyFundTargetMonths ?? 6,
                    stretchMonths: settings?.emergencyFundStretchMonths ?? 9,
                };
                const efGoal = await savingsGoalRepo.findEmergencyFundGoal(householdId);
                const efResult = savingsGoalService.analyzeEmergencyFund({
                    householdId,
                    eligibleCashCents: liquidCash,
                    essentialMonthlyExpensesCents: essentialExpensesCents,
                    policy: efPolicy,
                    activeMonthlyContributionCents: efGoal?.monthlyContributionCents ?? 0,
                    asOf: now,
                });

                // Debt analysis
                const debtResult = debtService.analyze({
                    householdId,
                    accounts,
                    monthlyIncomeCents,
                    asOf: now,
                });

                // Budget results — only OVER_BUDGET categories with variancePercent > 0
                const budgetResultSet = budgetService.calculateResults({
                    householdId,
                    period: { year, month },
                    budgets,
                    transactions,
                    asOf: now,
                });
                const overBudget = budgetResultSet.results
                    .filter(r => r.varianceCents > 0 && r.variancePercent !== null && r.variancePercent > 0)
                    .map(r => ({
                        category: r.category,
                        varianceCents: r.varianceCents as number,
                        variancePercent: r.variancePercent!,
                    }));

                // Goal summaries
                const goalSummaries = goalList.map(g => {
                    const gr = savingsGoalService.calculateGoal({ goal: g, asOf: now });
                    return { goalId: g.id, name: g.name, status: gr.status, percentComplete: gr.percentComplete, targetDate: g.targetDate };
                });

                // Last transaction date from this month's data (rough freshness check)
                const lastTxDate = lastTxRow.length > 0
                    ? lastTxRow.reduce((latest, t) => t.transactionDate > latest ? t.transactionDate : latest, lastTxRow[0].transactionDate)
                    : null;

                // Query prior month's snapshot to detect debt increase trends
                const priorMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const priorSnapshots = await snapshotRepo.findByHouseholdIdSince(householdId, priorMonthDate);
                let previousRevolvingDebtCents: number | null = null;
                if (priorSnapshots.length > 0) {
                    // Get the most recent snapshot from prior month
                    const priorSnapshot = priorSnapshots.reduce((latest, s) =>
                        new Date(s.calculatedAt) > new Date(latest.calculatedAt) ? s : latest
                    );
                    // Query accounts from the source to analyze prior debt
                    const priorAccounts = accounts; // Use current accounts; could enhance by querying historical account states
                    try {
                        const priorDebtResult = debtService.analyze({
                            householdId,
                            accounts: priorAccounts,
                            monthlyIncomeCents,
                            asOf: new Date(priorSnapshot.asOf),
                        });
                        previousRevolvingDebtCents = priorDebtResult.revolvingDebtCents;
                    } catch (error) {
                        // If prior analysis fails, leave as null (no prior data)
                        console.warn("[HEALTH_SUMMARY] Failed to analyze prior debt:", error instanceof Error ? error.message : String(error));
                    }
                }

                const analysis = healthEngine.analyze({
                    householdId,
                    asOf: now,
                    monthlySurplusCents,
                    monthlyIncomeCents,
                    liquidCashCents: liquidCash,
                    essentialMonthlyExpensesCents: essentialExpensesCents,
                    emergencyFundCoverageMonths: essentialExpensesCents > 0 ? efResult.currentCoverageMonths : null,
                    emergencyFundMinimumMonths: efPolicy.minimumMonths,
                    emergencyFundTargetMonths: efPolicy.targetMonths,
                    debtStatus: debtResult.status,
                    revolvingDebtCents: debtResult.revolvingDebtCents,
                    previousRevolvingDebtCents,
                    overBudgetResults: overBudget,
                    goalResults: goalSummaries,
                    lastTransactionDate: lastTxDate,
                    recurringExpenseChanges: [],
                });

                res.json(analysis);
            } catch (error) {
                next(error);
            }
        },
    );

    // ==================== HISTORICAL INTELLIGENCE ENDPOINTS ====================

    /**
     * GET /snapshots/history?months=N
     * Version-stamped history from persisted financial snapshots.
     * Each point carries the calculationVersion and calculatedAt of the
     * original snapshot — results never change when rules are updated.
     */
    app.get(
        "/snapshots/history",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId } = req.context;
                const months = Math.min(parseInt(req.query.months as string || "12", 10) || 12, 24);
                const since = new Date();
                since.setMonth(since.getMonth() - months);
                const snapshots = await snapshotRepo.findByHouseholdIdSince(householdId, since);
                res.json(buildSnapshotHistory(householdId, snapshots));
            } catch (error) {
                next(error);
            }
        },
    );

    /**
     * GET /history/budget-variance?months=N
     * Budget vs actual variance per month for the last N months.
     * Computed from immutable transaction + budget data; stamped with
     * the budget service calculation version.
     */
    app.get(
        "/history/budget-variance",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { householdId } = req.context;
                const months = Math.min(parseInt(req.query.months as string || "12", 10) || 12, 24);
                const now = new Date();

                const periods: Array<{ year: number; month: number }> = [];
                for (let i = months - 1; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    periods.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
                }

                const variancePoints = await Promise.all(
                    periods.map(async ({ year, month }) => {
                        const [budgets, transactions] = await Promise.all([
                            budgetRepo.findByHouseholdAndPeriod(householdId, year, month),
                            budgetRepo.getTransactionsForPeriod(householdId, year, month),
                        ]);
                        const resultSet = budgetService.calculateResults({
                            householdId,
                            period: { year, month },
                            budgets,
                            transactions,
                            asOf: now,
                        });
                        return {
                            period: { year, month },
                            totalPlannedCents: resultSet.totalPlannedCents,
                            totalActualCents: resultSet.totalActualCents,
                            varianceCents: resultSet.totalVarianceCents,
                            calculationVersion: resultSet.calculationVersion,
                            calculatedAt: resultSet.calculatedAt,
                        };
                    }),
                );

                res.json({ householdId, months: variancePoints, calculatedAt: now });
            } catch (error) {
                next(error);
            }
        },
    );

    // ==================== BUDGET APPROVAL WORKFLOW ROUTES ====================

    // Create route context for budget approval routes
    const approvalRouteContext = {
        app,
        householdService,
        reviewQueueService,
        postingService,
        advisorService,
        contextBuilder,
        contextService,
        budgetApprovalService,
        householdRepo,
        memberRepo,
        accountRepo,
        snapshotRepo,
        settingsRepo,
        documentRepo,
        reviewItemRepo,
        postingRepo,
        budgetRepo,
        budgetApprovalRepo,
        cashFlowRepo,
        savingsGoalRepo,
        debtRepo,
        conversationRepo,
        messageRepo,
        workflowRepo,
        toolExecutionRepo,
        storageAdapter,
    };

    registerBudgetApprovalRoutes(approvalRouteContext);

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
     * Uses structured logging to prevent PII exposure in logs
     */
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        const correlationId = req.context?.correlationId || uuidv4();

        // Structured error logging - no raw error objects or stack traces
        console.error("[REQUEST_ERROR] API error occurred", {
            correlationId,
            errorType: err.constructor?.name || 'Unknown',
            errorMessage: err instanceof Error ? err.message : String(err),
            statusCode: err.statusCode || 500,
            errorCode: err.errorCode || 'INTERNAL_ERROR',
            path: req.path,
            method: req.method,
            householdId: req.context?.householdId || 'anonymous',
            timestamp: new Date().toISOString()
        });

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

    // Initialize document repository for worker
    const documentRepo = new PgFinancialDocumentRepository();

    // Initialize document processing queue
    const documentQueue = getDocumentProcessingQueue();
    registerDocumentProcessingWorker(documentQueue, documentRepo);

    await new Promise<void>((resolve) => {
        app.listen(port, () => {
            console.log(`✓ API server listening on port ${port}`);
            console.log(`✓ Document processing queue initialized`);
            resolve();
        });
    });

    // Handle graceful shutdown
    process.on("SIGTERM", async () => {
        console.log("SIGTERM received, closing document processing queue...");
        await closeDocumentProcessingQueue();
        process.exit(0);
    });
}

// Start if run directly
if (require.main === module) {
    startServer(6723).catch(console.error);
}
