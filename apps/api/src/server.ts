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
} from "@house-fin/domain";
import {
    PgHouseholdRepository,
    PgHouseholdMemberRepository,
    PgAccountRepository,
    PgFinancialSnapshotRepository,
    PgHouseholdSettingsRepository,
    PgFinancialDocumentRepository,
    PgReviewItemRepository,
    PgPostingRepository,
} from "./db/repositories";
import { householdContextMiddleware, verifyHouseholdContext } from "./middleware/household-context";
import { uploadRateLimiter } from "./middleware/rate-limit";
import { ObjectStorageAdapter, createObjectStorageAdapter } from "./storage/object-storage";
import { getDocumentProcessingQueue, enqueueDocumentProcessing, closeDocumentProcessingQueue, getQueueStats } from "./queue/queue";
import { registerDocumentProcessingWorker } from "./queue/document-processor";

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

    // Initialize object storage adapter
    const storageAdapter = createObjectStorageAdapter();
    // Ensure bucket exists on startup
    storageAdapter.ensureBucket().catch((error) => {
        console.error("[STORAGE_INIT_FAILED] Failed to initialize object storage", {
            errorMessage: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
        });
    });

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
