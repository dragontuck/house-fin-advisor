/**
 * Type contracts for the Financial Advisor domain
 * These types are shared across all layers (API, domain, UI)
 */
export type EntityId = string & {
    readonly __brand: "EntityId";
};
export declare const EntityId: (id: string) => EntityId;
export type Money = number & {
    readonly __brand: "Money";
};
export declare const Money: (cents: number) => Money;
export declare const MoneyFromDollars: (dollars: number) => Money;
export declare const MoneyToDollars: (money: Money) => number;
export declare enum HouseholdMemberRole {
    OWNER = "OWNER",
    MEMBER = "MEMBER"
}
export declare enum HouseholdMemberVisibility {
    VISIBLE = "VISIBLE",
    HIDDEN = "HIDDEN"
}
export declare enum AccountType {
    CHECKING = "CHECKING",
    SAVINGS = "SAVINGS",
    CREDIT_CARD = "CREDIT_CARD",
    LOAN = "LOAN",
    RETIREMENT = "RETIREMENT",
    INVESTMENT = "INVESTMENT",
    MORTGAGE = "MORTGAGE"
}
export declare enum AccountOwnership {
    INDIVIDUAL = "INDIVIDUAL",
    JOINT = "JOINT"
}
export declare enum AccountStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE",
    CLOSED = "CLOSED"
}
export declare enum FinancialHealthStatus {
    HEALTHY = "HEALTHY",
    ATTENTION = "ATTENTION",
    AT_RISK = "AT_RISK"
}
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
    sourceAccountIds: EntityId[];
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
export interface ErrorResponse {
    userMessage: string;
    errorCode: string;
    correlationId: string;
    retryable: boolean;
    timestamp?: Date;
}
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
export declare enum DocumentProcessingStatus {
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
    FAILED = "FAILED"
}
export declare enum DocumentSourceType {
    CSV = "CSV",
    PDF = "PDF",
    IMAGE = "IMAGE",
    MANUAL = "MANUAL"
}
export interface FinancialDocument {
    id: EntityId;
    householdId: EntityId;
    sourceType: DocumentSourceType;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    fileChecksum: string;
    objectStorageKey: string;
    accountId: EntityId | null;
    institutionName: string | null;
    statementType: string | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    openingBalanceCents: number | null;
    closingBalanceCents: number | null;
    processingStatus: DocumentProcessingStatus;
    processingVersion: number;
    uploadedBy: string;
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
export interface ParserInput {
    fileName: string;
    mimeType: string;
    sourceType: DocumentSourceType;
    fileContent: string | Buffer;
}
export interface ParserMatch {
    matches: boolean;
    confidence: number;
    reason: string;
}
export interface TransactionCandidate {
    sourceRowNumber: number;
    date: Date;
    description: string;
    amountCents: number;
    originalAmount: string;
    originalDate: string;
    balance?: number;
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
/**
 * Extraction method used to obtain transaction data from document
 */
export declare enum ExtractionMethod {
    TEXT = "TEXT",// Direct text extraction from PDF text layer
    TABLE = "TABLE",// Structured table detection and extraction
    OCR = "OCR",// Optical Character Recognition on scanned/image content
    HYBRID = "HYBRID"
}
/**
 * Source reference for an extracted element (for provenance)
 */
export interface SourceReference {
    pageNumber: number;
    region?: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    extractionMethod: ExtractionMethod;
    confidence: number;
}
/**
 * Extended transaction candidate with PDF/image specific metadata
 */
export interface ExtractedTransactionCandidate extends TransactionCandidate {
    sourceReference: SourceReference;
    institutionHint?: string;
    accountHints?: string[];
}
/**
 * Parsed statement from PDF or image with extraction metadata
 */
export interface ExtractedParsedStatement extends ParsedStatement {
    transactions: ExtractedTransactionCandidate[];
    extractionMethods: ExtractionMethod[];
    pageCount?: number;
    institutionDetected?: string;
    accountHints?: string[];
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
/**
 * Transaction normalized to canonical form
 * Preserves original raw values for validation
 */
export interface NormalizedTransaction {
    transactionDate: Date;
    amount: Money;
    direction: "DEBIT" | "CREDIT";
    merchant: string;
    description: string;
    descriptionRaw: string;
    accountId?: EntityId;
    sourceDocument: {
        documentId: EntityId;
        rowNumber?: number;
        pageNumber?: number;
        sourceReference?: SourceReference;
    };
    original: {
        dateString: string;
        amountString: string;
        description: string;
    };
    sourceTransactionId?: string;
    statementReference?: string;
    createdAt: Date;
}
/**
 * Transaction reconciliation state
 */
export declare enum ReconciliationState {
    NEW = "NEW",// No matches found
    MATCHED = "MATCHED",// Single clear match found
    POSSIBLE_DUPLICATE = "POSSIBLE_DUPLICATE",// Multiple possible matches
    CONFLICT = "CONFLICT"
}
/**
 * Reason why transactions matched
 */
export interface MatchReason {
    signal: "SOURCE_ID" | "STATEMENT_REFERENCE" | "ACCOUNT_MATCH" | "AMOUNT_EXACT" | "DATE_PROXIMITY" | "MERCHANT_SIMILARITY" | "DIRECTION" | "BALANCE_CONTEXT";
    strength: "DEFINITIVE" | "STRONG" | "MODERATE" | "WEAK";
    confidence: number;
    evidence?: string;
}
/**
 * Transaction reconciliation result
 */
export interface TransactionReconciliation {
    normalizedId: string;
    state: ReconciliationState;
    confidence: number;
    matchedTransactionId?: string;
    matchReasons: MatchReason[];
    possibleMatches?: Array<{
        transactionId: string;
        reasons: MatchReason[];
        confidence: number;
    }>;
    conflict?: {
        type: "BALANCE_MISMATCH" | "AMOUNT_VARIANCE" | "DATE_VARIANCE" | "SOURCE_CONFLICT";
        description: string;
        expected?: number;
        actual?: number;
    };
    sourceReferences: SourceReference[];
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
    involvedTransactions: string[];
    involvedDocuments: EntityId[];
    preservedObservations: Array<{
        source: string;
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
    idempotencyKey: string;
    processedAt: Date;
}
/**
 * Types of reviews that require human attention
 */
export declare enum ReviewType {
    AMBIGUOUS_TRANSACTION = "AMBIGUOUS_TRANSACTION",
    POSSIBLE_DUPLICATE = "POSSIBLE_DUPLICATE",
    RECONCILIATION_CONFLICT = "RECONCILIATION_CONFLICT",
    UNKNOWN_ACCOUNT = "UNKNOWN_ACCOUNT",
    UNKNOWN_STATEMENT_PERIOD = "UNKNOWN_STATEMENT_PERIOD",
    PARSE_WARNING = "PARSE_WARNING",
    BALANCE_MISMATCH = "BALANCE_MISMATCH"
}
/**
 * Severity level of a review item
 */
export declare enum ReviewSeverity {
    INFO = "INFO",
    WARNING = "WARNING",
    ERROR = "ERROR"
}
/**
 * Status of a review item
 */
export declare enum ReviewStatus {
    PENDING = "PENDING",
    IN_PROGRESS = "IN_PROGRESS",
    RESOLVED = "RESOLVED",
    ARCHIVED = "ARCHIVED"
}
/**
 * Resolution for a review item (audit trail)
 */
export interface ReviewResolution {
    reviewItemId: EntityId;
    chosenAction: string;
    reasoning: string;
    resolvedBy: string;
    resolvedAt: Date;
    affectedTransactionIds: EntityId[];
    resultingMetadata?: Record<string, any>;
}
/**
 * A review item requiring human attention
 */
export interface ReviewItem {
    id: EntityId;
    householdId: EntityId;
    statementId?: EntityId;
    transactionIds: EntityId[];
    type: ReviewType;
    severity: ReviewSeverity;
    status: ReviewStatus;
    title: string;
    userMessage: string;
    recommendedAction?: string;
    candidateValues: Array<{
        label: string;
        value: string;
        metadata?: Record<string, any>;
    }>;
    supportingEvidence: Array<{
        type: string;
        description: string;
        data: Record<string, any>;
    }>;
    resolution?: ReviewResolution;
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
    oldestPendingAge?: number;
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
    nextReviewItemId?: EntityId;
}
/**
 * Auto-post configuration per household
 * Defines confidence thresholds for automatic transaction posting
 */
export interface AutoPostConfig {
    id: EntityId;
    householdId: EntityId;
    confidenceThreshold: number;
    allowPartialPosting: boolean;
    updatedAt: Date;
    updatedBy: string;
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
    postedDate: Date;
    transactionDate: Date;
    amountCents: number;
    direction: "DEBIT" | "CREDIT";
    merchant: string;
    description: string;
    confidenceScore: number;
    sourceDocumentId: EntityId;
    sourceRowNumber?: number;
    sourcePageNumber?: number;
    reconciliationState: ReconciliationState;
    matchedTransactionId?: EntityId;
    statementReference?: string;
    sourceTransactionId?: string;
    originalAmountString?: string;
    originalDateString?: string;
    postedBy: string;
    postedAt: Date;
    postingCorrelationId: EntityId;
    calculationVersion: number;
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
    sourceDocumentId: EntityId;
    postingCorrelationId: EntityId;
    postingStatus: "STARTED" | "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
    highConfidenceCount: number;
    highConfidencePosted: number;
    lowConfidenceCount: number;
    lowConfidenceSkipped: number;
    totalCandidates: number;
    totalPosted: number;
    errorCode?: string;
    errorMessageUser?: string;
    errorDetails?: Record<string, any>;
    initiatedBy: string;
    processingDurationMs?: number;
    idempotencyKey: string;
    startedAt: Date;
    completedAt?: Date;
}
/**
 * Request to post a statement's reconciled transactions
 */
export interface PostStatementRequest {
    documentId: EntityId;
    accountId?: EntityId;
}
/**
 * Response from posting operation
 */
export interface PostStatementResponse {
    postingCorrelationId: EntityId;
    documentId: EntityId;
    postingStatus: "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
    highConfidencePosted: number;
    lowConfidenceSkipped: number;
    totalPosted: number;
    totalCandidates: number;
    reviewItemsCreated: EntityId[];
    errorCode?: string;
    errorMessageUser?: string;
    message: string;
    nextSteps?: string[];
}
/**
 * Response with posting statistics for a household
 */
export interface PostingStatisticsResponse {
    householdId: EntityId;
    totalTransactionsPosted: number;
    totalDocumentsProcessed: number;
    totalDocumentsFailed: number;
    lastPostedAt?: Date;
    lastPostedBy?: string;
    averageConfidenceScore: number;
    highConfidencePostings: number;
    partialPostings: number;
    autoPostConfig: AutoPostConfig;
}
//# sourceMappingURL=index.d.ts.map