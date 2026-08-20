/**
 * Type contracts for the Financial Advisor domain
 * These types are shared across all layers (API, domain, UI)
 */

// UUIDs for domain entities
export type EntityId = string & { readonly __brand: "EntityId" };
export const EntityId = (id: string): EntityId => id as EntityId;

// Money representation - always in cents to avoid float precision issues
export type Money = number & { readonly __brand: "Money" };
export const Money = (cents: number): Money => {
    if (!Number.isInteger(cents)) {
        throw new Error("Money must be an integer number of cents");
    }
    return cents as Money;
};

export const MoneyFromDollars = (dollars: number): Money => {
    return Money(Math.round(dollars * 100));
};

export const MoneyToDollars = (money: Money): number => {
    return money / 100;
};

// Enums
export enum HouseholdMemberRole {
    OWNER = "OWNER",
    MEMBER = "MEMBER",
}

export enum HouseholdMemberVisibility {
    VISIBLE = "VISIBLE",
    HIDDEN = "HIDDEN",
}

export enum AccountType {
    CHECKING = "CHECKING",
    SAVINGS = "SAVINGS",
    CREDIT_CARD = "CREDIT_CARD",
    LOAN = "LOAN",
    RETIREMENT = "RETIREMENT",
    INVESTMENT = "INVESTMENT",
    MORTGAGE = "MORTGAGE",
}

export enum AccountOwnership {
    INDIVIDUAL = "INDIVIDUAL",
    JOINT = "JOINT",
}

export enum AccountStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE",
    CLOSED = "CLOSED",
}

export enum FinancialHealthStatus {
    HEALTHY = "HEALTHY",
    WATCH = "WATCH",
    AT_RISK = "AT_RISK",
    CRITICAL = "CRITICAL",
}

// Domain objects
export interface Household {
    id: EntityId;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface HouseholdMember {
    id: EntityId;
    householdId: EntityId;
    identityId: string;
    displayName: string;
    role: HouseholdMemberRole;
    visibility: HouseholdMemberVisibility;
    createdAt: Date;
}

export interface Account {
    id: EntityId;
    householdId: EntityId;
    name: string;
    type: AccountType;
    ownership: AccountOwnership;
    currency: string;
    currentBalance: Money;
    institutionName?: string;
    lastUpdatedAt: Date;
    status: AccountStatus;
    createdAt: Date;
    updatedAt: Date;
    // Debt-specific optional fields (populated for CREDIT_CARD, LOAN, MORTGAGE)
    creditLimitCents?: number | null;
    interestRateBps?: number | null;
    minimumPaymentCents?: number | null;
    scheduledPaymentCents?: number | null;
    statementBalanceCents?: number | null;
    revolvingBalanceCents?: number | null;
}

export interface FinancialSnapshot {
    id: EntityId;
    householdId: EntityId;
    asOf: Date;
    version: number;
    cash: Money;
    debt: Money;
    netWorth: Money;
    monthlyIncome: Money;
    monthlyEssentialExpenses: Money;
    monthlyDiscretionaryExpenses: Money;
    monthlySurplus: Money;
    financialHealthStatus: FinancialHealthStatus;
    sourceAccountIds: EntityId[]; // Which accounts contributed to this snapshot (audit trail)
    calculatedAt: Date;
    createdAt: Date;
}

export interface HouseholdSettings {
    id: EntityId;
    householdId: EntityId;
    monthlyIncome: Money;
    monthlyEssentialExpenses: Money;
    monthlyDiscretionaryExpenses: Money;
    currency: string;
    incomeSource: "manual_entry" | "bank_feed" | "user_provided";
    updatedAt: Date;
    updatedBy: EntityId;
    /** Emergency fund coverage thresholds in calendar months. Defaults: 3 / 6 / 9. */
    emergencyFundMinimumMonths?: number;
    emergencyFundTargetMonths?: number;
    emergencyFundStretchMonths?: number;
}

// API Request/Response types
export interface CreateHouseholdRequest {
    name: string;
}

export interface CreateHouseholdMemberRequest {
    identityId: string;
    displayName: string;
    role: HouseholdMemberRole;
}

export interface CreateAccountRequest {
    householdId: EntityId;
    name: string;
    type: AccountType;
    ownership: AccountOwnership;
    currentBalance: Money;
    institutionName?: string;
    currency?: string;
}

export interface UpdateAccountRequest {
    name?: string;
    currentBalance?: Money;
    status?: AccountStatus;
}

// Error Response
export interface ErrorResponse {
    userMessage: string;
    errorCode: string;
    correlationId: string;
    retryable: boolean;
    timestamp?: Date;
}

// Financial Pulse - presentation-ready summary
export interface FinancialPulse {
    householdId: EntityId;
    householdName: string;
    asOf: Date;
    healthStatus: FinancialHealthStatus;
    healthMessage: string;
    keyMetrics: {
        netWorth: Money;
        cashAvailable: Money;
        monthlyIncome: Money;
        monthlyExpenses: Money;
        monthlySurplus: Money;
        totalDebt: Money;
    };
    accountsSummary: {
        cash: AccountBalance[];
        retirement: AccountBalance[];
        investments: AccountBalance[];
        debt: AccountBalance[];
    };
    statusMessage: string;
}

export interface AccountBalance {
    name: string;
    balance: Money;
    type: AccountType;
}

// Document/Statement types for Slice 2

export enum DocumentProcessingStatus {
    UPLOADED = "UPLOADED",
    VALIDATING = "VALIDATING",
    VALIDATION_FAILED = "VALIDATION_FAILED",
    IDENTIFYING = "IDENTIFYING",
    PARSING = "PARSING",
    PARSE_FAILED = "PARSE_FAILED",
    NORMALIZING = "NORMALIZING",
    RECONCILING = "RECONCILING",
    REVIEW_REQUIRED = "REVIEW_REQUIRED",
    READY_TO_POST = "READY_TO_POST",
    POSTING = "POSTING",
    COMPLETED = "COMPLETED",
    PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED",
    FAILED = "FAILED",
}

export enum DocumentSourceType {
    CSV = "CSV",
    PDF = "PDF",
    IMAGE = "IMAGE",
    MANUAL = "MANUAL",
}

export interface FinancialDocument {
    id: EntityId;
    householdId: EntityId;
    sourceType: DocumentSourceType;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    fileChecksum: string; // SHA-256 hex digest
    objectStorageKey: string; // Deterministic path in MinIO
    accountId: EntityId | null;
    institutionName: string | null;
    statementType: string | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    openingBalanceCents: number | null;
    closingBalanceCents: number | null;
    processingStatus: DocumentProcessingStatus;
    processingVersion: number;
    uploadedBy: string; // Keycloak user ID
    uploadedAt: Date;
    processedAt: Date | null;
    errorCode: string | null;
    errorMessageUser: string | null;
    correlationId: EntityId;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateDocumentUploadRequest {
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    sourceType: DocumentSourceType;
    accountId?: EntityId;
    institutionName?: string;
    statementType?: string;
    periodStart?: Date;
    periodEnd?: Date;
}

export interface DocumentUploadResponse {
    id: EntityId;
    correlationId: EntityId;
    objectStorageKey: string;
    status: DocumentProcessingStatus;
    message: string;
}

export interface DocumentStatusResponse {
    id: EntityId;
    fileName: string;
    sourceType: DocumentSourceType;
    processingStatus: DocumentProcessingStatus;
    uploadedAt: Date;
    processedAt: Date | null;
    errorCode: string | null;
    errorMessageUser: string | null;
}

// Parser types for statement ingestion
export interface ParserInput {
    fileName: string;
    mimeType: string;
    sourceType: DocumentSourceType;
    fileContent: string | Buffer; // CSV content as string, binary files as Buffer or base64 string
}

export interface ParserMatch {
    matches: boolean;
    confidence: number; // 0-1, 1 being certain
    reason: string;
}

export interface TransactionCandidate {
    sourceRowNumber: number; // 1-indexed row in CSV (excluding header)
    date: Date;
    description: string;
    amountCents: number; // Can be negative for debits/expenses
    originalAmount: string; // Preserve original representation for validation
    originalDate: string; // Preserve original date format
    balance?: number; // Optional running balance in cents
}

export interface ParsedStatement {
    fileName: string;
    sourceType: DocumentSourceType;
    detectedFormat: {
        hasDebitCreditColumns: boolean;
        hasSignedAmounts: boolean;
        hasRunningBalance: boolean;
        headerRowIndex: number;
        totalRows: number;
    };
    metadata: {
        periodStart?: Date;
        periodEnd?: Date;
        detectedCurrency?: string;
        detectedAccountType?: AccountType;
    };
    transactions: TransactionCandidate[];
    warnings: Array<{
        type: "ambiguous_column" | "skipped_row" | "date_format_unclear" | "amount_format_unclear";
        rowNumber?: number;
        message: string;
    }>;
    errors: Array<{
        message: string;
        rowNumber?: number;
    }>;
}

export interface StatementParser {
    /**
     * Determine if this parser can handle the given input
     */
    canParse(input: ParserInput): Promise<ParserMatch>;

    /**
     * Parse the input and return normalized transaction candidates
     * Throws if the input cannot be parsed or required fields are missing/ambiguous
     */
    parse(input: ParserInput): Promise<ParsedStatement>;
}

// PDF and Image parsing extensions

/**
 * Extraction method used to obtain transaction data from document
 */
export enum ExtractionMethod {
    TEXT = "TEXT",               // Direct text extraction from PDF text layer
    TABLE = "TABLE",             // Structured table detection and extraction
    OCR = "OCR",                 // Optical Character Recognition on scanned/image content
    HYBRID = "HYBRID",           // Combination of methods (e.g., text + table on same page)
}

/**
 * Source reference for an extracted element (for provenance)
 */
export interface SourceReference {
    pageNumber: number;          // 1-indexed page number
    region?: {                   // Bounding box (optional, for visualization)
        left: number;
        top: number;
        width: number;
        height: number;
    };
    extractionMethod: ExtractionMethod;
    confidence: number;          // 0-1, how confident is this extraction
}

/**
 * Extended transaction candidate with PDF/image specific metadata
 */
export interface ExtractedTransactionCandidate extends TransactionCandidate {
    sourceReference: SourceReference;  // Where in the document this came from
    institutionHint?: string;          // Bank name detected from document
    accountHints?: string[];           // Account identifier hints found
}

/**
 * Parsed statement from PDF or image with extraction metadata
 */
export interface ExtractedParsedStatement extends ParsedStatement {
    transactions: ExtractedTransactionCandidate[];
    extractionMethods: ExtractionMethod[];  // Which methods were used
    pageCount?: number;                     // For PDFs
    institutionDetected?: string;           // Institution name from document analysis
    accountHints?: string[];                // Account identifiers found
    openingBalance?: {
        amountCents: number;
        date: Date;
        confidence: number;
    };
    closingBalance?: {
        amountCents: number;
        date: Date;
        confidence: number;
    };
}

// Transaction Normalization Types

/**
 * Transaction normalized to canonical form
 * Preserves original raw values for validation
 */
export interface NormalizedTransaction {
    // Canonical normalized values
    transactionDate: Date;                  // ISO format normalized date
    amount: Money;                          // Always in cents, positive for debits/expenses
    direction: "DEBIT" | "CREDIT";          // Canonical direction
    merchant: string;                       // Normalized merchant name (trimmed, cased)
    description: string;                    // Normalized description
    descriptionRaw: string;                 // Original raw description (unchanged)
    accountId?: EntityId;                   // Associated account if known

    // Extraction metadata
    sourceDocument: {
        documentId: EntityId;               // Which document this came from
        rowNumber?: number;                 // For CSV
        pageNumber?: number;                // For PDF
        sourceReference?: SourceReference;  // For PDF/image extractions
    };

    // Provenance (preservation of originals)
    original: {
        dateString: string;                 // Original date representation
        amountString: string;               // Original amount representation
        description: string;                // Original description as parsed
    };

    // Optional matching hints
    sourceTransactionId?: string;           // Provider/bank transaction ID if available
    statementReference?: string;            // Reference within statement (e.g., check number)

    createdAt: Date;
}

/**
 * Transaction reconciliation state
 */
export enum ReconciliationState {
    NEW = "NEW",                            // No matches found
    MATCHED = "MATCHED",                    // Single clear match found
    POSSIBLE_DUPLICATE = "POSSIBLE_DUPLICATE", // Multiple possible matches
    CONFLICT = "CONFLICT",                  // Conflicting information from sources
}

/**
 * Reason why transactions matched
 */
export interface MatchReason {
    signal: "SOURCE_ID" | "STATEMENT_REFERENCE" | "ACCOUNT_MATCH" | "AMOUNT_EXACT" |
    "DATE_PROXIMITY" | "MERCHANT_SIMILARITY" | "DIRECTION" | "BALANCE_CONTEXT";
    strength: "DEFINITIVE" | "STRONG" | "MODERATE" | "WEAK";
    confidence: number;                     // 0-1
    evidence?: string;                      // Details about the match
}

/**
 * Transaction reconciliation result
 */
export interface TransactionReconciliation {
    normalizedId: string;                   // ID of normalized transaction
    state: ReconciliationState;
    confidence: number;                     // Overall confidence 0-1
    matchedTransactionId?: string;          // ID of matched existing transaction
    matchReasons: MatchReason[];            // Why it matched (if matched)
    possibleMatches?: Array<{
        transactionId: string;
        reasons: MatchReason[];
        confidence: number;
    }>;

    // For conflicts
    conflict?: {
        type: "BALANCE_MISMATCH" | "AMOUNT_VARIANCE" | "DATE_VARIANCE" | "SOURCE_CONFLICT";
        description: string;
        expected?: number;                  // Expected value (cents for amounts, timestamp for dates)
        actual?: number;                    // Actual value
    };

    sourceReferences: SourceReference[];    // All source references (for audit trail)
}

/**
 * Reconciliation issue (when transactions conflict or balance doesn't match)
 */
export interface ReconciliationIssue {
    id: EntityId;
    accountId: EntityId;
    type: "DUPLICATE" | "CONFLICT" | "BALANCE_DISCREPANCY" | "MISSING_COUNTERPART";
    severity: "INFO" | "WARNING" | "ERROR";
    description: string;
    involvedTransactions: string[];         // Transaction IDs involved
    involvedDocuments: EntityId[];          // Document IDs involved
    preservedObservations: Array<{
        source: string;                     // "CSV", "PDF", "Manual"
        value: any;
        timestamp: Date;
    }>;
    resolvedAt?: Date;
    resolutionNotes?: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Reconciliation batch result
 */
export interface ReconciliationBatch {
    batchId: EntityId;
    documentId: EntityId;
    householdId: EntityId;
    accountId?: EntityId;

    totalCandidates: number;
    results: TransactionReconciliation[];
    issues: ReconciliationIssue[];

    summary: {
        newTransactions: number;
        matchedTransactions: number;
        possibleDuplicates: number;
        conflicts: number;
    };

    idempotencyKey: string;                 // Hash of document + processing params for idempotency
    processedAt: Date;
}

// Review Queue Types

/**
 * Types of reviews that require human attention
 */
export enum ReviewType {
    AMBIGUOUS_TRANSACTION = "AMBIGUOUS_TRANSACTION",
    POSSIBLE_DUPLICATE = "POSSIBLE_DUPLICATE",
    RECONCILIATION_CONFLICT = "RECONCILIATION_CONFLICT",
    UNKNOWN_ACCOUNT = "UNKNOWN_ACCOUNT",
    UNKNOWN_STATEMENT_PERIOD = "UNKNOWN_STATEMENT_PERIOD",
    PARSE_WARNING = "PARSE_WARNING",
    BALANCE_MISMATCH = "BALANCE_MISMATCH",
}

/**
 * Severity level of a review item
 */
export enum ReviewSeverity {
    INFO = "INFO",
    WARNING = "WARNING",
    ERROR = "ERROR",
}

/**
 * Status of a review item
 */
export enum ReviewStatus {
    PENDING = "PENDING",
    IN_PROGRESS = "IN_PROGRESS",
    RESOLVED = "RESOLVED",
    ARCHIVED = "ARCHIVED",
}

/**
 * Resolution for a review item (audit trail)
 */
export interface ReviewResolution {
    reviewItemId: EntityId;
    chosenAction: string;              // The action taken (e.g., "USE_EXISTING", "KEEP_BOTH", "CATEGORIZE_AS_SHOPPING")
    reasoning: string;                 // User's explanation
    resolvedBy: string;                // Keycloak user ID
    resolvedAt: Date;
    affectedTransactionIds: EntityId[]; // Which transactions were affected by this resolution
    resultingMetadata?: Record<string, any>; // Additional metadata created by resolution
}

/**
 * A review item requiring human attention
 */
export interface ReviewItem {
    id: EntityId;
    householdId: EntityId;
    statementId?: EntityId;            // Optional reference to source statement/document
    transactionIds: EntityId[];        // Transactions involved in this review

    // Classification
    type: ReviewType;
    severity: ReviewSeverity;
    status: ReviewStatus;

    // Presentation
    title: string;                     // User-facing title (e.g., "Amazon — $147.83")
    userMessage: string;               // Explanation of what was found and why we're unsure
    recommendedAction?: string;        // Suggested resolution

    // Data for decision making
    candidateValues: Array<{
        label: string;                 // Choice label (e.g., "Shopping", "Amazon Purchase")
        value: string;                 // Value identifier
        metadata?: Record<string, any>; // Additional context
    }>;

    // Evidence and context
    supportingEvidence: Array<{
        type: string;                  // "transaction", "statement_data", "parsing_note"
        description: string;
        data: Record<string, any>;
    }>;

    // Resolution tracking
    resolution?: ReviewResolution;     // Set when status = RESOLVED

    // Timestamps
    createdAt: Date;
    updatedAt: Date;
    resolvedAt?: Date;
    resolvedBy?: string;
}

/**
 * Statistics about review queue
 */
export interface ReviewQueueStats {
    householdId: EntityId;
    totalItems: number;
    byStatus: Record<ReviewStatus, number>;
    byType: Record<ReviewType, number>;
    bySeverity: Record<ReviewSeverity, number>;
    oldestPendingAge?: number;         // Seconds for oldest pending item
}

/**
 * Request to resolve a review item
 */
export interface ResolveReviewItemRequest {
    chosenAction: string;
    reasoning: string;
    affectedTransactionIds?: EntityId[];
}

/**
 * Response when resolving a review item
 */
export interface ResolveReviewItemResponse {
    reviewItemId: EntityId;
    newStatus: ReviewStatus;
    affectedTransactionCount: number;
    nextReviewItemId?: EntityId;      // Next pending item (if any)
}

// Transaction Posting Types

/**
 * Auto-post configuration per household
 * Defines confidence thresholds for automatic transaction posting
 */
export interface AutoPostConfig {
    id: EntityId;
    householdId: EntityId;

    // Confidence threshold (0.0-1.0) for automatic posting
    // Transactions >= this confidence will post automatically
    confidenceThreshold: number;

    // If true: post high-confidence and create ReviewItems for low-confidence
    // If false: block entire statement if any low-confidence transactions
    allowPartialPosting: boolean;

    updatedAt: Date;
    updatedBy: string;              // Keycloak user ID
    createdAt: Date;
}

/**
 * Posted transaction (canonical ledger record)
 * Immutable transaction that has been posted to an account
 */
export interface PostedTransaction {
    id: EntityId;
    householdId: EntityId;
    accountId: EntityId;

    // Transaction data
    postedDate: Date;               // When posted to canonical ledger
    transactionDate: Date;          // When transaction occurred (bank statement date)
    amountCents: number;            // Positive for debits, negative for credits
    direction: "DEBIT" | "CREDIT";
    merchant: string;
    description: string;

    // Confidence from reconciliation
    confidenceScore: number;        // 0.0-1.0

    // Source provenance (audit trail)
    sourceDocumentId: EntityId;     // Which statement this came from
    sourceRowNumber?: number;       // Row in CSV if from parsed statement
    sourcePageNumber?: number;      // Page in PDF if from scanned document

    // Reconciliation state
    reconciliationState: ReconciliationState;
    matchedTransactionId?: EntityId; // If MATCHED, which existing transaction

    // Optional statement reference (e.g., check number)
    statementReference?: string;

    // Source IDs and metadata
    sourceTransactionId?: string;   // Provider/bank transaction ID
    originalAmountString?: string;  // Original representation for validation
    originalDateString?: string;    // Original date representation

    // Posting metadata
    postedBy: string;               // Keycloak user ID
    postedAt: Date;
    postingCorrelationId: EntityId; // Batch ID for related postings

    // Versioning
    calculationVersion: number;     // Version of calculation logic

    // Metadata
    metadata: Record<string, any>;

    createdAt: Date;
}

/**
 * Statement posting audit record
 * Immutable log of all posting operations
 */
export interface StatementPostingAudit {
    id: EntityId;
    householdId: EntityId;

    // Source
    sourceDocumentId: EntityId;
    postingCorrelationId: EntityId; // Links all transactions from this posting

    // Status
    postingStatus: "STARTED" | "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";

    // Counts
    highConfidenceCount: number;
    highConfidencePosted: number;
    lowConfidenceCount: number;
    lowConfidenceSkipped: number;   // Skipped due to below threshold
    totalCandidates: number;
    totalPosted: number;

    // Error tracking
    errorCode?: string;
    errorMessageUser?: string;      // User-facing error
    errorDetails?: Record<string, any>; // Technical details

    // Request info
    initiatedBy: string;            // Keycloak user ID
    processingDurationMs?: number;  // How long posting took

    // Idempotency
    idempotencyKey: string;         // Prevents duplicate posting on retry

    // Timestamps
    startedAt: Date;
    completedAt?: Date;
}

/**
 * Request to post a statement's reconciled transactions
 */
export interface PostStatementRequest {
    documentId: EntityId;           // Which statement to post
    // Optional: specific account to post to (if not already associated with statement)
    accountId?: EntityId;
}

/**
 * Response from posting operation
 */
export interface PostStatementResponse {
    postingCorrelationId: EntityId;
    documentId: EntityId;
    postingStatus: "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";

    // Summary
    highConfidencePosted: number;
    lowConfidenceSkipped: number;
    totalPosted: number;
    totalCandidates: number;

    // If partial, which items require review
    reviewItemsCreated: EntityId[];

    // Error if failed
    errorCode?: string;
    errorMessageUser?: string;

    // Next actions
    message: string;                // User-friendly status message
    nextSteps?: string[];           // Suggested next actions
}

/**
 * Response with posting statistics for a household
 */
export interface PostingStatisticsResponse {
    householdId: EntityId;

    // Overall
    totalTransactionsPosted: number;
    totalDocumentsProcessed: number;
    totalDocumentsFailed: number;

    // Recent postings
    lastPostedAt?: Date;
    lastPostedBy?: string;

    // Confidence breakdown
    averageConfidenceScore: number;
    highConfidencePostings: number;  // Posted with confidence >= threshold
    partialPostings: number;         // Had low-confidence items skipped

    // Configuration
    autoPostConfig: AutoPostConfig;
}

// ── Slice 3: Budget types ──────────────────────────────────────────────────

/** Standard spending categories. Stored as VARCHAR; custom strings are allowed. */
export enum BudgetCategory {
    HOUSING = "HOUSING",
    UTILITIES = "UTILITIES",
    GROCERIES = "GROCERIES",
    DINING_OUT = "DINING_OUT",
    TRANSPORTATION = "TRANSPORTATION",
    FUEL = "FUEL",
    INSURANCE = "INSURANCE",
    HEALTHCARE = "HEALTHCARE",
    SUBSCRIPTIONS = "SUBSCRIPTIONS",
    ENTERTAINMENT = "ENTERTAINMENT",
    CLOTHING = "CLOTHING",
    PERSONAL_CARE = "PERSONAL_CARE",
    EDUCATION = "EDUCATION",
    CHILDCARE = "CHILDCARE",
    SAVINGS_CONTRIBUTION = "SAVINGS_CONTRIBUTION",
    DEBT_PAYMENT = "DEBT_PAYMENT",
    OTHER = "OTHER",
}

export interface BudgetPeriod {
    year: number;
    month: number; // 1–12
}

/** Household-defined spending plan for a single category in a single month. */
export interface Budget {
    id: EntityId;
    householdId: EntityId;
    periodYear: number;
    periodMonth: number; // 1–12
    category: string;    // matches posted_transactions.category
    amountCents: Money;  // planned allowance; 0 is valid
    goalId?: EntityId;
    notes?: string;
    version: number;     // optimistic concurrency
    createdAt: Date;
    updatedAt: Date;
}

export enum BudgetStatus {
    ON_TRACK = "ON_TRACK",       // spending ≤ planned
    OVER_BUDGET = "OVER_BUDGET", // spending > planned
    UNBUDGETED = "UNBUDGETED",   // transactions present, no budget defined
    NO_SPENDING = "NO_SPENDING", // budget defined, no transactions yet
}

/** Calculated result for one category/period combination. */
export interface BudgetResult {
    category: string;
    period: BudgetPeriod;
    plannedCents: Money;           // 0 when hasBudget = false
    actualCents: Money;            // sum of debit − credit transactions in category/period
    remainingCents: Money;         // plannedCents − actualCents (negative when over budget)
    varianceCents: Money;          // actualCents − plannedCents (positive = over budget)
    variancePercent: number | null; // null when plannedCents = 0 and hasBudget = false
    projectedMonthEndCents: Money; // linear projection to period end; equals actual when period closed
    status: BudgetStatus;
    hasBudget: boolean;
    transactionCount: number;
    calculatedAt: Date;
    calculationVersion: number;
}

/** Full budget picture for a household in a given period. */
export interface BudgetResultSet {
    householdId: EntityId;
    period: BudgetPeriod;
    results: BudgetResult[];
    totalPlannedCents: Money;
    totalActualCents: Money;
    totalRemainingCents: Money;
    totalVarianceCents: Money;
    unbudgetedSpendingCents: Money; // actual spending with no matching budget
    asOf: Date;
    calculatedAt: Date;
    calculationVersion: number;
}

export interface CreateBudgetRequest {
    periodYear: number;
    periodMonth: number;
    category: string;
    amountCents: number; // plain number from API; service casts to Money
    goalId?: string;
    notes?: string;
}

export interface UpdateBudgetRequest {
    amountCents?: number;
    notes?: string;
}

// ── Budget Approval Workflow ──────────────────────────────────────────────

/**
 * Status of a budget proposal in the approval workflow.
 * Workflow: PROPOSED → UNDER_REVIEW → (APPROVED → PERSISTED) or REJECTED
 */
export enum BudgetProposalStatus {
    PROPOSED = "PROPOSED",           // AI generated, awaiting review
    UNDER_REVIEW = "UNDER_REVIEW",   // User reviewing or making changes
    APPROVED = "APPROVED",           // User approved, ready to persist
    REJECTED = "REJECTED",           // User rejected proposal
    PERSISTED = "PERSISTED",         // Approved proposal has been persisted as actual budgets
}

/**
 * Financial validation status for a proposed budget.
 */
export enum BudgetValidationStatus {
    VALID = "VALID",                 // Passes all validation rules
    INVALID = "INVALID",             // Fails validation - cannot be approved
    WARNINGS = "WARNINGS",           // Valid but has warnings user should know about
}

/**
 * Event type in the budget approval audit trail.
 */
export enum BudgetApprovalAuditEvent {
    CREATED = "CREATED",             // Proposal created
    VALIDATED = "VALIDATED",         // Financial validation run
    USER_REVIEWED = "USER_REVIEWED", // User viewed proposal
    USER_CHANGED = "USER_CHANGED",   // User modified proposed changes
    APPROVED = "APPROVED",           // User explicitly approved
    PERSISTED = "PERSISTED",         // Approved changes written to budgets table
    REJECTED = "REJECTED",           // User rejected proposal
}

/**
 * A proposed budget - NOT yet a persisted budget.
 * Awaits financial validation and explicit user approval.
 */
export interface BudgetProposal {
    id: EntityId;
    householdId: EntityId;
    conversationId?: EntityId;       // If AI-initiated, link to advisor conversation

    // Proposed period
    periodYear: number;
    periodMonth: number;

    // Financial context
    financialSnapshotId?: EntityId;
    snapshotVersion?: number;

    // Workflow state
    status: BudgetProposalStatus;

    // Changes: original proposal
    proposedChanges: ProposedChange[];

    // Changes: user's modifications (if any)
    approvedChanges?: ProposedChange[];

    // Validation results
    validationStatus?: BudgetValidationStatus;
    validationNotes?: Record<string, unknown>;

    // Display metadata
    title?: string;
    description?: string;

    // Audit trail
    createdBy: EntityId;             // Who initiated (AI user ID or actual user)
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Explicit approval decision - converts approved proposal to persisted budgets.
 */
export interface BudgetApproval {
    id: EntityId;
    proposalId: EntityId;
    householdId: EntityId;

    // Approval decision
    approvedBy: EntityId;
    approvedAt: Date;
    comment?: string;

    // Link to persisted budgets
    createdBudgetSnapshotId?: EntityId;
}

/**
 * Audit event in budget approval workflow.
 */
export interface BudgetApprovalAuditEntry {
    id: EntityId;
    proposalId: EntityId;
    householdId: EntityId;

    eventType: BudgetApprovalAuditEvent;
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;

    triggeredBy?: EntityId;
    eventAt: Date;
    reason?: string;
}

/**
 * Request to create a budget proposal.
 */
export interface CreateBudgetProposalRequest {
    periodYear: number;
    periodMonth: number;
    proposedChanges: ProposedChange[];
    title?: string;
    description?: string;
    financialSnapshotId?: EntityId;
    conversationId?: EntityId;
}

/**
 * Request to review and optionally modify a proposal.
 */
export interface ReviewBudgetProposalRequest {
    // User's optional modifications to proposed changes
    approvedChanges?: ProposedChange[];
    comment?: string;
}

/**
 * Request to explicitly approve a proposal and persist it as actual budgets.
 */
export interface ApproveBudgetProposalRequest {
    comment?: string;
    // Optional: if user modified the proposal during review
    approvedChanges?: ProposedChange[];
}

/**
 * Response containing the approval result and new budget version info.
 */
export interface ApproveBudgetProposalResponse {
    approval: BudgetApproval;
    newBudgets: Budget[];
    previousBudgets: Budget[];
}

export interface CategorizationRequest {
    category: string; // empty string clears the category
}

// ── Slice 3: Cash Flow & Recurring Detection types ─────────────────────────

export enum RecurringFrequency {
    WEEKLY = "WEEKLY",
    BIWEEKLY = "BIWEEKLY",
    MONTHLY = "MONTHLY",
    QUARTERLY = "QUARTERLY",
    ANNUAL = "ANNUAL",
    IRREGULAR = "IRREGULAR",
    UNKNOWN = "UNKNOWN",
}

/** A detected recurring transaction pattern derived from historical transactions. */
export interface RecurringPattern {
    merchant: string;
    direction: "DEBIT" | "CREDIT";
    frequency: RecurringFrequency;
    /** Median absolute amount in cents. */
    typicalAmountCents: number;
    /** Mean absolute amount in cents. */
    averageAmountCents: number;
    /** Max deviation from median as a fraction of median (0–1). */
    amountVariancePct: number;
    /** 0–1 composite score derived from occurrence count, amount consistency, and gap regularity. */
    confidence: number;
    occurrenceCount: number;
    mostCommonCategory: string | null;
    firstSeenDate: Date;
    lastSeenDate: Date;
    /** null for IRREGULAR / UNKNOWN — not enough information to project a date. */
    estimatedNextDate: Date | null;
    /** IDs of the source posted_transactions that make up this pattern. */
    sourceTransactionIds: string[];
}

export enum ForecastConfidence {
    HIGH = "HIGH",       // ≥ 3 months history, recurring patterns confirmed
    MEDIUM = "MEDIUM",   // 2–3 months history or patterns have moderate confidence
    LOW = "LOW",         // insufficient data; treat output as rough estimate
}

/** Records what assumption underpins a projection field. */
export interface ForecastAssumption {
    field: string;
    source: "RECURRING_PATTERN" | "EXPLICIT_BUDGET" | "HOUSEHOLD_SETTINGS" | "HISTORICAL_AVERAGE";
    description: string;
    confidence: number; // 0–1
}

/** Projected cash flow for a single calendar month. */
export interface CashFlowProjection {
    householdId: EntityId;
    asOf: Date;
    period: BudgetPeriod;
    startingCashCents: Money;
    confirmedIncomeCents: Money;               // already received this period
    expectedIncomeCents: Money;                // confirmed + expected remaining
    expectedEssentialExpensesCents: Money;
    expectedDiscretionaryExpensesCents: Money;
    expectedGoalsFundingCents: Money;          // budget entries linked to goals
    projectedEndingCashCents: Money;
    monthlySurplusCents: Money;
    confidence: ForecastConfidence;
    assumptions: ForecastAssumption[];
    calculatedAt: Date;
    calculationVersion: number;
}

/** Actual income / expense summary for one completed (or current) calendar month. */
export interface MonthlyCashFlow {
    period: BudgetPeriod;
    incomeCents: Money;      // total CREDIT transaction amounts
    expensesCents: Money;    // total DEBIT transaction amounts (positive)
    surplusCents: Money;     // income − expenses
    transactionCount: number;
    isComplete: boolean;     // false when the period is the current calendar month
}

/** Aggregated historical cash flow summary for a household. */
export interface CashFlowHistory {
    householdId: EntityId;
    months: MonthlyCashFlow[];
    averageMonthlyIncomeCents: Money;
    averageMonthlyExpensesCents: Money;
    averageMonthlySurplusCents: Money;
    calculatedAt: Date;
}

/** Multi-month forward-looking cash-flow forecast. */
export interface ShortTermForecast {
    householdId: EntityId;
    startingCashCents: Money;
    months: CashFlowProjection[];
    overallConfidence: ForecastConfidence;
    calculatedAt: Date;
    calculationVersion: number;
}

// ── Slice 3: Savings Goals & Emergency Fund ───────────────────────────────────

export enum GoalType {
    EMERGENCY_FUND = "EMERGENCY_FUND",
    VACATION = "VACATION",
    ENTERTAINMENT = "ENTERTAINMENT",
    PROJECT = "PROJECT",
    RETIREMENT = "RETIREMENT",
    CUSTOM = "CUSTOM",
}

export enum GoalStatus {
    ON_TRACK = "ON_TRACK",
    AHEAD = "AHEAD",
    BEHIND = "BEHIND",
    AT_RISK = "AT_RISK",
    COMPLETED = "COMPLETED",
}

export enum EmergencyFundStatus {
    CRITICAL = "CRITICAL",    // no eligible cash
    WATCH = "WATCH",       // below minimum threshold
    ADEQUATE = "ADEQUATE",    // meets minimum, below target
    ON_TARGET = "ON_TARGET",   // meets target, below stretch
    FULLY_FUNDED = "FULLY_FUNDED",// at or above stretch threshold
}

export enum EmergencyFundTrend {
    IMPROVING = "IMPROVING",
    STABLE = "STABLE",
    DECLINING = "DECLINING",
    UNKNOWN = "UNKNOWN",
}

export interface EmergencyFundPolicy {
    minimumMonths: number;
    targetMonths: number;
    stretchMonths: number;
}

/** A household savings target tracked over time. */
export interface SavingsGoal {
    id: EntityId;
    householdId: EntityId;
    name: string;
    type: GoalType;
    targetAmountCents: Money;
    currentAmountCents: Money;
    monthlyContributionCents: Money;
    targetDate: Date | null;
    startDate: Date;
    notes: string | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
}

/** Calculated result for a single savings goal. */
export interface GoalResult {
    goalId: EntityId;
    householdId: EntityId;
    name: string;
    type: GoalType;
    targetAmountCents: Money;
    currentAmountCents: Money;
    /** 0–100, one decimal place. */
    percentComplete: number;
    remainingAmountCents: Money;
    monthlyContributionCents: Money;
    /** Monthly contribution required to reach target by targetDate; 0 when no targetDate. */
    requiredMonthlyContributionCents: Money;
    projectedCompletionDate: Date | null;
    targetDate: Date | null;
    status: GoalStatus;
    calculatedAt: Date;
    calculationVersion: number;
}

/** Point-in-time emergency fund adequacy analysis. */
export interface EmergencyFundResult {
    householdId: EntityId;
    eligibleCashCents: Money;
    essentialMonthlyExpensesCents: Money;
    /** Months of essential expenses covered. Rounded to one decimal. */
    currentCoverageMonths: number;
    minimumTargetCents: Money;
    preferredTargetCents: Money;
    stretchTargetCents: Money;
    /** Negative = underfunded relative to minimum. */
    gapToMinimumCents: Money;
    gapToPreferredCents: Money;
    trend: EmergencyFundTrend;
    status: EmergencyFundStatus;
    /** Human-readable observation. Not a recommendation. */
    statusDescription: string;
    policy: EmergencyFundPolicy;
    calculatedAt: Date;
    calculationVersion: number;
}

export interface CreateSavingsGoalRequest {
    name: string;
    type: GoalType;
    targetAmountCents: number;
    currentAmountCents?: number;
    monthlyContributionCents?: number;
    /** ISO date string (YYYY-MM-DD). */
    targetDate?: string;
    notes?: string;
}

export interface UpdateSavingsGoalRequest {
    name?: string;
    targetAmountCents?: number;
    currentAmountCents?: number;
    monthlyContributionCents?: number;
    targetDate?: string | null;
    notes?: string | null;
}

// ── Debt Intelligence ─────────────────────────────────────────────────────────

export enum DebtHealthStatus {
    HEALTHY = "HEALTHY",
    WATCH = "WATCH",
    AT_RISK = "AT_RISK",
    CRITICAL = "CRITICAL",
}

/** Broad category used in debt rollup calculations. */
export enum DebtCategory {
    REVOLVING = "REVOLVING",    // credit cards (balance being carried month-to-month)
    INSTALLMENT = "INSTALLMENT",  // personal loans, auto loans
    MORTGAGE = "MORTGAGE",     // real-estate secured
    UNKNOWN = "UNKNOWN",      // type is known but debt detail is insufficient
}

/** Per-account detail emitted by the debt intelligence layer. */
export interface DebtAccountDetail {
    accountId: EntityId;
    accountName: string;
    accountType: AccountType;
    category: DebtCategory;

    /** Outstanding balance (positive cents). */
    currentBalanceCents: number;

    /** Credit limit for revolving accounts; null when not provided. */
    creditLimitCents: number | null;

    /** Utilisation ratio 0–1 for revolving accounts; null when limit unknown. */
    utilizationRatio: number | null;

    /** Annual interest rate in basis points (e.g. 1975 = 19.75 %); null when unknown. */
    interestRateBps: number | null;

    /** Minimum monthly payment due; null when unknown. */
    minimumPaymentCents: number | null;

    /** Scheduled/actual monthly payment amount; null when unknown. */
    scheduledPaymentCents: number | null;

    /**
     * Statement balance as of the last billing cycle.
     * Explicitly populated from account data — NOT derived from transactions.
     */
    statementBalanceCents: number | null;

    /**
     * Portion of the balance the household is carrying beyond the statement period.
     * Null means the data is insufficient to determine revolving status.
     */
    revolvingBalanceCents: number | null;
}

/** A single factual observation about the household's debt position. */
export interface DebtObservation {
    /** Machine-readable code for UI rendering. */
    code: string;
    /** Human-readable sentence — no recommendations, no prescriptions. */
    message: string;
}

export interface DebtAnalysis {
    householdId: EntityId;
    asOf: Date;
    calculationVersion: number;

    // ── Aggregates ────────────────────────────────────────────────────────────
    totalDebtCents: number;
    revolvingDebtCents: number;
    installmentDebtCents: number;
    mortgageDebtCents: number;

    /** Total minimum monthly payments across all debt accounts; null when any account is missing the field. */
    totalMinimumPaymentCents: number | null;

    /** Total scheduled monthly payments; null when any account is missing the field. */
    totalScheduledPaymentCents: number | null;

    /**
     * Weighted average interest rate in basis points.
     * Null when any debt account is missing an interest rate.
     */
    weightedAverageRateBps: number | null;

    /**
     * Debt-to-income ratio (monthly debt payments / monthly income).
     * Null when income or payments are unknown.
     */
    debtToIncomeRatio: number | null;

    // ── Status ────────────────────────────────────────────────────────────────
    status: DebtHealthStatus;
    statusDescription: string;

    // ── Per-account detail ────────────────────────────────────────────────────
    accounts: DebtAccountDetail[];

    /** Factual observations about the household's debt position. */
    observations: DebtObservation[];
}

export interface UpdateDebtAccountRequest {
    creditLimitCents?: number | null;
    /** Annual interest rate in basis points (e.g. 1975 = 19.75 %). */
    interestRateBps?: number | null;
    minimumPaymentCents?: number | null;
    scheduledPaymentCents?: number | null;
    statementBalanceCents?: number | null;
    revolvingBalanceCents?: number | null;
}

// ── Financial Health & Attention Engine ──────────────────────────────────────

export enum AttentionItemType {
    BUDGET_OVER = "BUDGET_OVER",
    CASH_FLOW_WARNING = "CASH_FLOW_WARNING",
    EMERGENCY_FUND_LOW = "EMERGENCY_FUND_LOW",
    GOAL_BEHIND = "GOAL_BEHIND",
    DEBT_INCREASE = "DEBT_INCREASE",
    DATA_STALE = "DATA_STALE",
    RECURRING_EXPENSE_CHANGE = "RECURRING_EXPENSE_CHANGE",
}

export enum AttentionSeverity {
    INFO = "INFO",
    WARNING = "WARNING",
    CRITICAL = "CRITICAL",
}

export enum AttentionItemStatus {
    ACTIVE = "ACTIVE",
    DISMISSED = "DISMISSED",
    RESOLVED = "RESOLVED",
}

export interface AttentionItemMetric {
    label: string;
    /** Numeric value behind the condition. */
    value: number;
    unit: string;
}

export interface AttentionItem {
    /** Deterministic: same condition always produces the same id. */
    id: EntityId;
    householdId: EntityId;
    severity: AttentionSeverity;
    type: AttentionItemType;
    title: string;
    /** Factual one-sentence description. No recommendations. */
    explanation: string;
    metric: AttentionItemMetric;
    /** Which sub-system generated this item (e.g. "budget", "emergency-fund"). */
    source: string;
    createdAt: Date;
    status: AttentionItemStatus;
    dismissedAt: Date | null;
    resolvedAt: Date | null;
}

/** Which rule fired and whether it contributed to the status. */
export interface HealthFactor {
    rule: string;
    triggered: boolean;
    severity: AttentionSeverity | null;
    detail: string;
}

export interface HealthAnalysis {
    householdId: EntityId;
    asOf: Date;
    calculationVersion: number;
    status: FinancialHealthStatus;
    statusDescription: string;
    /** Individual rule evaluation results for explainability. */
    factors: HealthFactor[];
    attentionItems: AttentionItem[];
}

// ── Historical Intelligence & Metric Explainability ──────────────────────────

/** Single labelled input value used in a calculation. */
export interface CalculationBreakdownItem {
    label: string;
    valueCents: number;
}

/**
 * Full provenance record for one calculated metric value.
 * Every metric exposed to the UI must carry one of these.
 */
export interface CalculationExplanation {
    /** Plain-language description of the formula applied. */
    summary: string;
    /** The concrete input values that produced this result. */
    inputs: CalculationBreakdownItem[];
    /** Assumptions the calculation relied on (human-readable). */
    assumptions: string[];
    /** Which system produced this value. */
    source: "financial_snapshot" | "budget_result" | "goal_setting";
    /** Version of the calculation rules that were applied. */
    calculationVersion: number;
    /** When this value was computed. */
    calculatedAt: Date;
    /** ID of the persisted snapshot that anchors this value, if applicable. */
    snapshotId: EntityId | null;
}

/** One month of financial state derived from a persisted financial snapshot. */
export interface SnapshotHistoryPoint {
    snapshotId: EntityId;
    period: BudgetPeriod;
    asOf: Date;
    /** Version of snapshot-calculator rules that produced this snapshot. */
    calculationVersion: number;
    /** Timestamp from the original calculation — never updated by later rule changes. */
    calculatedAt: Date;
    incomeCents: number;
    essentialExpensesCents: number;
    discretionaryExpensesCents: number;
    surplusCents: number;
    debtCents: number;
    netWorthCents: number;
    cashCents: number;
    explanation: {
        income: CalculationExplanation;
        expenses: CalculationExplanation;
        surplus: CalculationExplanation;
        debt: CalculationExplanation;
    };
}

/** Version-stamped history built exclusively from persisted financial snapshots. */
export interface SnapshotHistory {
    householdId: EntityId;
    /** Ordered ascending by period. */
    months: SnapshotHistoryPoint[];
    calculatedAt: Date;
}

/** Budget vs actual for one calendar month. */
export interface BudgetVariancePoint {
    period: BudgetPeriod;
    totalPlannedCents: number;
    totalActualCents: number;
    /** actualCents − plannedCents; positive = over budget. */
    varianceCents: number;
    calculationVersion: number;
    calculatedAt: Date;
}

/** Multi-month budget variance history. */
export interface BudgetVarianceHistory {
    householdId: EntityId;
    months: BudgetVariancePoint[];
    calculatedAt: Date;
}

/** Calculation metadata included in the financial-pulse response. */
export interface PulseCalculationDetails {
    snapshotId: EntityId;
    calculationVersion: number;
    calculatedAt: Date;
    monthlyIncomeCents: number;
    monthlyEssentialExpensesCents: number;
    monthlyDiscretionaryExpensesCents: number;
    surplusExplanation: string;
}

// ── AI Advisor Conversation & Workflow Types ──────────────────────────────────

/**
 * Known activity extracted from conversation (e.g., "car repair", "trip to coast").
 * Represents user-mentioned expenses/income with confidence level.
 */
export interface KnownActivity {
    id: string;
    description: string;
    estimatedAmountCents: Money;
    amountConfidence: "HIGH" | "MEDIUM" | "LOW";
    type: "ONE_TIME" | "RECURRING";
    sourceExtraction?: string;                       // What user said that led to this
}

/**
 * Assumption tracked during workflow (e.g., "Grocery spending is $600/month").
 * Allows reasoning about what we assumed vs. what we know for certain.
 */
export interface WorkflowAssumption {
    key: string;
    value: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    reasoning: string;
    impact: string;                                  // How does it affect our advice?
}

/**
 * Proposed budget change in a workflow (e.g., "Increase dining to $600").
 */
export interface ProposedChange {
    category: string;
    proposedBudgetCents: Money;
    currentBudgetCents: Money;
    reason: string;
}

/**
 * Primary workflow types the advisor can enter.
 * Each corresponds to a distinct user intent and AI behavior pattern.
 */
export enum AdvisorWorkflow {
    // Informational workflows (MODE A)
    FINANCIAL_HEALTH = "FINANCIAL_HEALTH",           // How are we doing?
    BUDGET_STATUS = "BUDGET_STATUS",                 // Am I over budget?
    CASH_FLOW = "CASH_FLOW",                         // Cash flow analysis
    GOAL_STATUS = "GOAL_STATUS",                     // Are goals on track?
    DEBT_STATUS = "DEBT_STATUS",                     // Debt summary

    // Diagnostic workflows (MODE B)
    BUDGET_DIAGNOSE = "BUDGET_DIAGNOSE",             // Why am I always over budget?

    // Planning workflows (MODE C)
    BUDGET_CREATE = "BUDGET_CREATE",                 // Help me create an initial budget
    BUDGET_REVISE = "BUDGET_REVISE",                 // Help me plan next month

    // Scenario workflows (MODE D)
    BUDGET_SCENARIO = "BUDGET_SCENARIO",             // What if we spend more on X?
    AFFORDABILITY = "AFFORDABILITY",                 // Can we afford this?

    // Fallback
    GENERAL_FINANCIAL_QUESTION = "GENERAL_FINANCIAL_QUESTION", // Anything else
}

/**
 * Status of an active workflow.
 * Workflow state transitions as user and AI interact.
 */
export enum WorkflowStatus {
    ACTIVE = "ACTIVE",                               // Workflow is ongoing
    WAITING_FOR_USER = "WAITING_FOR_USER",           // AI waiting for user input
    READY_FOR_REVIEW = "READY_FOR_REVIEW",           // Plan ready for user approval
    APPROVED = "APPROVED",                           // User approved the plan
    CANCELLED = "CANCELLED",                         // User cancelled workflow
    COMPLETED = "COMPLETED",                         // Workflow finished
}

/**
 * Role of a message in the conversation.
 */
export enum AdvisorMessageRole {
    USER = "USER",                                   // Human user
    ASSISTANT = "ASSISTANT",                         // AI advisor
    SYSTEM = "SYSTEM",                               // System (e.g., workflow transition)
    TOOL = "TOOL",                                   // Tool execution result
}

/**
 * A known upcoming activity that affects budget planning.
 * User-provided or AI-extracted from natural language.
 */
export interface KnownActivity {
    id: string;                                      // Deterministic ID (e.g., hash of description + amount)
    description: string;                             // User description (e.g., "car repair")
    estimatedAmountCents: Money;                     // Amount or estimate
    amountConfidence: "HIGH" | "MEDIUM" | "LOW";    // How sure are we?
    type: "ONE_TIME" | "RECURRING";                 // Activity classification
    sourceExtraction?: string;                       // Original text extracted from (for UX feedback)
}

/**
 * Stateful representation of an in-progress workflow.
 * Separates from conversation history — multiple messages can occur within one workflow state.
 * Used for multi-turn interactions where user refines a proposal.
 */
export interface WorkflowState {
    id: EntityId;
    householdId: EntityId;
    conversationId?: EntityId;                       // Optional: link to conversation if AI-initiated
    workflowType: AdvisorWorkflow;

    // Planning context
    planningPeriod?: {
        year: number;
        month: number;
    };

    // For scenario/affordability workflows
    currentScenario?: {
        type: "PURCHASE" | "SPENDING_CHANGE" | "INCOME_CHANGE" | "GOAL_ADJUSTMENT";
        description: string;
        affectedAmountCents?: Money;
        baselineScenario?: string;                   // Reference to prior scenario if building on it
    };

    // For budget planning workflows
    knownActivities?: KnownActivity[];               // Activities user mentioned
    proposedChanges?: ProposedChange[];               // Proposed budget/plan changes

    // Reasoning trail
    assumptions?: WorkflowAssumption[];               // Assumptions we're working with

    // User interaction state
    pendingQuestions?: Array<{
        id: string;
        question: string;
        why: string;                                 // Why this matters
        affectsWhat: string;                         // What changes if user answers
    }>;

    // Metadata
    status: WorkflowStatus;
    linkedFinancialSnapshotId?: EntityId;            // Snapshot this workflow is based on
    linkedSnapshotVersion?: number;                  // For reproducibility
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
}

/**
 * Structured AI response distinguishing facts, calculations, assumptions, analysis, and proposals.
 * Matches AGENTS.md section 5 Fact/Calculation/Assumption/Analysis/Proposal model.
 */
export interface AIResponse {
    // The direct answer to the user's question
    answer: string;

    // Factual observations from current financial data
    facts: Array<{
        statement: string;
        source: "SNAPSHOT" | "ACCOUNT" | "BUDGET" | "TRANSACTION_HISTORY";
        confidence: "CERTAIN" | "VERY_HIGH" | "HIGH";
    }>;

    // Values derived by financial domain services
    calculations: Array<{
        name: string;                                // e.g., "monthly surplus"
        valueCents: Money;
        formula: string;                            // e.g., "income - expenses"
        calculationVersion: number;
    }>;

    // Values not known with certainty
    assumptions: Array<{
        key: string;
        value: string;
        confidence: "HIGH" | "MEDIUM" | "LOW";
        reason: string;
        impact?: string;                             // How this affects the analysis
    }>;

    // Conclusions drawn from facts and calculations
    analysis: Array<{
        conclusion: string;
        basedOnFacts: string[];                      // Which facts support this
        basedOnCalculations: string[];               // Which calculations used
        confidence: "HIGH" | "MEDIUM" | "LOW";
    }>;

    // Suggested actions (NOT yet approved)
    proposal?: {
        title: string;
        description: string;
        rationale: string;
        tradeoffs?: string[];
        affectedCategories?: string[];
        estimatedImpactCents?: Money;
        estimatedImpactDirection: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
        approval_required: boolean;
    };

    // Audit trail
    toolsUsed: string[];                             // Names of financial tools called
    financialSnapshotVersion: number;                // Version of snapshot this is based on
    financialSnapshotAsOf: Date;                     // When snapshot was calculated

    // Quality signals
    confidence: "HIGH" | "MEDIUM" | "LOW";           // Overall confidence in response
    limitations?: string[];                         // Known limitations or gaps
}

/**
 * A single message in a conversation.
 * Immutable append-only for audit trail.
 */
export interface AdvisorMessage {
    id: EntityId;
    conversationId: EntityId;
    role: AdvisorMessageRole;
    content: string;                                 // Plain text or markdown
    createdAt: Date;

    // When role = TOOL, references the execution
    toolExecutionId?: EntityId;

    // Optional structured response (when role = ASSISTANT)
    aiResponse?: AIResponse;

    // Extra context (workflow state, citations, etc.)
    metadata?: {
        workflowId?: EntityId;                       // Workflow this message belongs to
        workflowType?: AdvisorWorkflow;
        relatedItems?: {
            type: "BUDGET" | "GOAL" | "ACCOUNT" | "SCENARIO";
            id: EntityId;
            name: string;
        }[];
        userFeedback?: "HELPFUL" | "UNHELPFUL" | "NEEDS_REVISION";
    };
}

/**
 * A recorded execution of a financial tool.
 * Immutable audit log for tracing AI decisions.
 */
export interface ToolExecution {
    id: EntityId;
    conversationId: EntityId;
    messageId: EntityId;                             // The message that triggered this
    toolName: string;                                // e.g., "get_financial_snapshot"
    inputParams: Record<string, unknown>;            // Tool parameters
    result?: Record<string, unknown>;                // Tool result
    errorMessage?: string;                           // If execution failed
    durationMs: number;                              // How long it took
    executionVersion: number;                        // Version for reproducibility
    executedAt: Date;
    correlationId: EntityId;                         // Trace ID
}

/**
 * A conversation between a household member and the financial advisor.
 * Immutable core fields; mutable only for status/title.
 */
export interface AdvisorConversation {
    id: EntityId;
    householdId: EntityId;
    memberId: EntityId;                              // Which household member is talking
    title: string;                                   // User-provided or AI-suggested topic
    status: "ACTIVE" | "ARCHIVED" | "DELETED";     // DELETED = soft-delete for audit trail
    currentWorkflow?: AdvisorWorkflow;               // Current workflow if active
    currentWorkflowId?: EntityId;                    // Link to WorkflowState
    createdAt: Date;
    updatedAt: Date;
    archivedAt?: Date;
    messageCount: number;                            // Denormalized for quick queries
    lastMessageAt: Date;                             // For sorting/ordering
}

/**
 * Request to create a new conversation.
 */
export interface CreateAdvisorConversationRequest {
    householdId: EntityId;
    memberId: EntityId;
    title?: string;                                  // Auto-generated if not provided
    initialMessage?: string;                         // First user message
}

/**
 * Request to add a message to a conversation.
 */
export interface AddAdvisorMessageRequest {
    conversationId: EntityId;
    role: AdvisorMessageRole;
    content: string;
    metadata?: Record<string, unknown>;
}

/**
 * Response from message addition (includes generated messages if AI responded).
 */
export interface AddAdvisorMessageResponse {
    messageId: EntityId;
    conversationId: EntityId;
    aiMessages?: AdvisorMessage[];                   // If AI auto-responded
    nextWorkflowAction?: {
        type: "ASK_QUESTION" | "PROPOSE_PLAN" | "SHOW_SCENARIO_RESULT" | "WAIT";
        data: Record<string, unknown>;
    };
}

/**
 * Request to approve a proposed plan/scenario result.
 */
export interface ApproveWorkflowRequest {
    workflowId: EntityId;
    conversationId: EntityId;
    approvalMessage?: string;                        // Optional user comment
}

/**
 * Response when a workflow is approved.
 */
export interface ApproveWorkflowResponse {
    workflowId: EntityId;
    status: "APPROVED";
    permanentId?: EntityId;                          // If plan was saved to persistent state
    nextMessage: string;                             // Advisor's confirmation
}

// ── AI Tool Contracts ──────────────────────────────────────────────────────────
export * from "./ai-tools";
