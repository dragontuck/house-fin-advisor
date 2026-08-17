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
    WATCH = "WATCH",
    AT_RISK = "AT_RISK",
    CRITICAL = "CRITICAL"
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
    /** Emergency fund coverage thresholds in calendar months. Defaults: 3 / 6 / 9. */
    emergencyFundMinimumMonths?: number;
    emergencyFundTargetMonths?: number;
    emergencyFundStretchMonths?: number;
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
/** Standard spending categories. Stored as VARCHAR; custom strings are allowed. */
export declare enum BudgetCategory {
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
    OTHER = "OTHER"
}
export interface BudgetPeriod {
    year: number;
    month: number;
}
/** Household-defined spending plan for a single category in a single month. */
export interface Budget {
    id: EntityId;
    householdId: EntityId;
    periodYear: number;
    periodMonth: number;
    category: string;
    amountCents: Money;
    goalId?: EntityId;
    notes?: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
}
export declare enum BudgetStatus {
    ON_TRACK = "ON_TRACK",// spending ≤ planned
    OVER_BUDGET = "OVER_BUDGET",// spending > planned
    UNBUDGETED = "UNBUDGETED",// transactions present, no budget defined
    NO_SPENDING = "NO_SPENDING"
}
/** Calculated result for one category/period combination. */
export interface BudgetResult {
    category: string;
    period: BudgetPeriod;
    plannedCents: Money;
    actualCents: Money;
    remainingCents: Money;
    varianceCents: Money;
    variancePercent: number | null;
    projectedMonthEndCents: Money;
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
    unbudgetedSpendingCents: Money;
    asOf: Date;
    calculatedAt: Date;
    calculationVersion: number;
}
export interface CreateBudgetRequest {
    periodYear: number;
    periodMonth: number;
    category: string;
    amountCents: number;
    goalId?: string;
    notes?: string;
}
export interface UpdateBudgetRequest {
    amountCents?: number;
    notes?: string;
}
export interface CategorizationRequest {
    category: string;
}
export declare enum RecurringFrequency {
    WEEKLY = "WEEKLY",
    BIWEEKLY = "BIWEEKLY",
    MONTHLY = "MONTHLY",
    QUARTERLY = "QUARTERLY",
    ANNUAL = "ANNUAL",
    IRREGULAR = "IRREGULAR",
    UNKNOWN = "UNKNOWN"
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
export declare enum ForecastConfidence {
    HIGH = "HIGH",// ≥ 3 months history, recurring patterns confirmed
    MEDIUM = "MEDIUM",// 2–3 months history or patterns have moderate confidence
    LOW = "LOW"
}
/** Records what assumption underpins a projection field. */
export interface ForecastAssumption {
    field: string;
    source: "RECURRING_PATTERN" | "EXPLICIT_BUDGET" | "HOUSEHOLD_SETTINGS" | "HISTORICAL_AVERAGE";
    description: string;
    confidence: number;
}
/** Projected cash flow for a single calendar month. */
export interface CashFlowProjection {
    householdId: EntityId;
    asOf: Date;
    period: BudgetPeriod;
    startingCashCents: Money;
    confirmedIncomeCents: Money;
    expectedIncomeCents: Money;
    expectedEssentialExpensesCents: Money;
    expectedDiscretionaryExpensesCents: Money;
    expectedGoalsFundingCents: Money;
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
    incomeCents: Money;
    expensesCents: Money;
    surplusCents: Money;
    transactionCount: number;
    isComplete: boolean;
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
export declare enum GoalType {
    EMERGENCY_FUND = "EMERGENCY_FUND",
    VACATION = "VACATION",
    ENTERTAINMENT = "ENTERTAINMENT",
    PROJECT = "PROJECT",
    RETIREMENT = "RETIREMENT",
    CUSTOM = "CUSTOM"
}
export declare enum GoalStatus {
    ON_TRACK = "ON_TRACK",
    AHEAD = "AHEAD",
    BEHIND = "BEHIND",
    AT_RISK = "AT_RISK",
    COMPLETED = "COMPLETED"
}
export declare enum EmergencyFundStatus {
    CRITICAL = "CRITICAL",// no eligible cash
    WATCH = "WATCH",// below minimum threshold
    ADEQUATE = "ADEQUATE",// meets minimum, below target
    ON_TARGET = "ON_TARGET",// meets target, below stretch
    FULLY_FUNDED = "FULLY_FUNDED"
}
export declare enum EmergencyFundTrend {
    IMPROVING = "IMPROVING",
    STABLE = "STABLE",
    DECLINING = "DECLINING",
    UNKNOWN = "UNKNOWN"
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
export declare enum DebtHealthStatus {
    HEALTHY = "HEALTHY",
    WATCH = "WATCH",
    AT_RISK = "AT_RISK",
    CRITICAL = "CRITICAL"
}
/** Broad category used in debt rollup calculations. */
export declare enum DebtCategory {
    REVOLVING = "REVOLVING",// credit cards (balance being carried month-to-month)
    INSTALLMENT = "INSTALLMENT",// personal loans, auto loans
    MORTGAGE = "MORTGAGE",// real-estate secured
    UNKNOWN = "UNKNOWN"
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
    status: DebtHealthStatus;
    statusDescription: string;
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
export declare enum AttentionItemType {
    BUDGET_OVER = "BUDGET_OVER",
    CASH_FLOW_WARNING = "CASH_FLOW_WARNING",
    EMERGENCY_FUND_LOW = "EMERGENCY_FUND_LOW",
    GOAL_BEHIND = "GOAL_BEHIND",
    DEBT_INCREASE = "DEBT_INCREASE",
    DATA_STALE = "DATA_STALE",
    RECURRING_EXPENSE_CHANGE = "RECURRING_EXPENSE_CHANGE"
}
export declare enum AttentionSeverity {
    INFO = "INFO",
    WARNING = "WARNING",
    CRITICAL = "CRITICAL"
}
export declare enum AttentionItemStatus {
    ACTIVE = "ACTIVE",
    DISMISSED = "DISMISSED",
    RESOLVED = "RESOLVED"
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
//# sourceMappingURL=index.d.ts.map