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
    ATTENTION = "ATTENTION",
    AT_RISK = "AT_RISK",
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
