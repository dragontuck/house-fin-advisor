/**
 * API Client for Financial Pulse
 * Provides type-safe access to backend endpoints
 */

export function formatCents(cents: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(cents / 100);
}

export function formatDollars(dollars: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(dollars);
}

// ── Slice 3 types ─────────────────────────────────────────────────────────────

export type FinancialHealthStatus = "HEALTHY" | "WATCH" | "AT_RISK" | "CRITICAL";
export type AttentionSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AttentionItemType =
    | "BUDGET_OVER"
    | "CASH_FLOW_WARNING"
    | "EMERGENCY_FUND_LOW"
    | "GOAL_BEHIND"
    | "DEBT_INCREASE"
    | "DATA_STALE"
    | "RECURRING_EXPENSE_CHANGE";

export interface AttentionItemMetric {
    label: string;
    value: number;
    unit: string;
}

export interface AttentionItem {
    id: string;
    householdId: string;
    severity: AttentionSeverity;
    type: AttentionItemType;
    title: string;
    explanation: string;
    metric: AttentionItemMetric;
    source: string;
    createdAt: string;
    status: "ACTIVE" | "DISMISSED" | "RESOLVED";
    dismissedAt: string | null;
    resolvedAt: string | null;
}

export interface HealthFactor {
    rule: string;
    triggered: boolean;
    severity: AttentionSeverity | null;
    detail: string;
}

export interface HealthSummary {
    householdId: string;
    asOf: string;
    calculationVersion: number;
    status: FinancialHealthStatus;
    statusDescription: string;
    factors: HealthFactor[];
    attentionItems: AttentionItem[];
}

export type BudgetStatus = "ON_TRACK" | "OVER_BUDGET" | "UNDER_BUDGET" | "NO_BUDGET";

export interface BudgetResult {
    category: string;
    period: { year: number; month: number };
    plannedCents: number;
    actualCents: number;
    remainingCents: number;
    varianceCents: number;
    variancePercent: number | null;
    projectedMonthEndCents: number;
    status: BudgetStatus;
    hasBudget: boolean;
    transactionCount: number;
}

export interface BudgetResultSet {
    householdId: string;
    period: { year: number; month: number };
    results: BudgetResult[];
    totalPlannedCents: number;
    totalActualCents: number;
    totalRemainingCents: number;
    totalVarianceCents: number;
    unbudgetedSpendingCents: number;
    asOf: string;
    calculatedAt: string;
    calculationVersion: number;
}

export type GoalStatus = "ON_TRACK" | "AHEAD" | "BEHIND" | "AT_RISK" | "COMPLETED";
export type GoalType = "EMERGENCY_FUND" | "VACATION" | "ENTERTAINMENT" | "PROJECT" | "RETIREMENT" | "CUSTOM";

export interface GoalResult {
    goalId: string;
    householdId: string;
    name: string;
    type: GoalType;
    targetAmountCents: number;
    currentAmountCents: number;
    percentComplete: number;
    remainingAmountCents: number;
    monthlyContributionCents: number;
    requiredMonthlyContributionCents: number;
    projectedCompletionDate: string | null;
    targetDate: string | null;
    status: GoalStatus;
    calculatedAt: string;
    calculationVersion: number;
}

export type DebtHealthStatus = "HEALTHY" | "WATCH" | "AT_RISK" | "CRITICAL";

export interface DebtSummary {
    householdId: string;
    asOf: string;
    calculationVersion: number;
    totalDebtCents: number;
    revolvingDebtCents: number;
    installmentDebtCents: number;
    mortgageDebtCents: number;
    totalMinimumPaymentCents: number | null;
    totalScheduledPaymentCents: number | null;
    weightedAverageRateBps: number | null;
    debtToIncomeRatio: number | null;
    status: DebtHealthStatus;
    statusDescription: string;
    observations: Array<{ code: string; message: string }>;
}

export interface MonthlyCashFlow {
    period: { year: number; month: number };
    incomeCents: number;
    expensesCents: number;
    surplusCents: number;
    transactionCount: number;
    isComplete: boolean;
}

export interface CashFlowHistory {
    householdId: string;
    months: MonthlyCashFlow[];
    averageMonthlyIncomeCents: number;
    averageMonthlyExpensesCents: number;
    averageMonthlySurplusCents: number;
    calculatedAt: string;
}

export interface AccountBalance {
    name: string;
    balance: number;
    type: string;
}

export interface FinancialPulseData {
    householdId: string;
    householdName: string;
    asOf: string;
    healthStatus: FinancialHealthStatus;
    healthMessage: string;
    keyMetrics: {
        netWorth: number;
        cashAvailable: number;
        monthlyIncome: number;
        monthlyExpenses: number;
        monthlySurplus: number;
        totalDebt: number;
    };
    accountsSummary: {
        cash: AccountBalance[];
        retirement: AccountBalance[];
        investments: AccountBalance[];
        debt: AccountBalance[];
    };
    statusMessage: string;
    calculationDetails?: PulseCalculationDetails;
}

// ── Explainability types (mirrors contracts) ───────────────────────────────

export interface CalculationBreakdownItem {
    label: string;
    valueCents: number;
}

export interface CalculationExplanation {
    summary: string;
    inputs: CalculationBreakdownItem[];
    assumptions: string[];
    source: string;
    calculationVersion: number;
    calculatedAt: string;
    snapshotId: string | null;
}

export interface PulseCalculationDetails {
    snapshotId: string;
    calculationVersion: number;
    calculatedAt: string;
    monthlyIncomeCents: number;
    monthlyEssentialExpensesCents: number;
    monthlyDiscretionaryExpensesCents: number;
    surplusExplanation: string;
}

export interface SnapshotHistoryPoint {
    snapshotId: string;
    period: { year: number; month: number };
    asOf: string;
    calculationVersion: number;
    calculatedAt: string;
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

export interface SnapshotHistory {
    householdId: string;
    months: SnapshotHistoryPoint[];
    calculatedAt: string;
}

export interface BudgetVariancePoint {
    period: { year: number; month: number };
    totalPlannedCents: number;
    totalActualCents: number;
    varianceCents: number;
    calculationVersion: number;
    calculatedAt: string;
}

export interface BudgetVarianceHistory {
    householdId: string;
    months: BudgetVariancePoint[];
    calculatedAt: string;
}

// Statement/Document types
export type DocumentProcessingStatus =
    | "UPLOADED" | "VALIDATING" | "VALIDATION_FAILED" | "IDENTIFYING"
    | "PARSING" | "PARSE_FAILED" | "NORMALIZING" | "RECONCILING"
    | "REVIEW_REQUIRED" | "READY_TO_POST" | "POSTING"
    | "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";

export type DocumentSourceType = "CSV" | "PDF" | "IMAGE" | "MANUAL";

export interface DocumentStatusResponse {
    id: string;
    fileName: string;
    sourceType: DocumentSourceType;
    processingStatus: DocumentProcessingStatus;
    uploadedAt: string;
    processedAt: string | null;
    errorCode: string | null;
    errorMessageUser: string | null;
}

export interface StatementListItem extends DocumentStatusResponse {
    accountId?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    importedTransactionCount: number;
    reviewCount: number;
}

export interface StatementSummary {
    id: string;
    fileName: string;
    sourceType: DocumentSourceType;
    processingStatus: DocumentProcessingStatus;
    uploadedAt: string;
    processedAt: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    account?: {
        id: string;
        name: string;
        type: string;
    } | null;
    institutionName?: string | null;
    totalTransactionsFound: number;
    importedTransactionCount: number;
    duplicateCount: number;
    reviewItemCount: number;
    reviewItemsPending: number;
    reviewItemsResolved: number;
    errorCode: string | null;
    errorMessageUser: string | null;
}

export interface DocumentUploadResponse {
    id: string;
    correlationId: string;
    objectStorageKey: string;
    status: DocumentProcessingStatus;
    message: string;
}

// Use relative URL to leverage vite proxy in dev mode, or environment variable in production
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const HOUSEHOLD_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

/**
 * Common headers for all API requests
 * Includes householdId for context-aware operations
 */
function getApiHeaders(): HeadersInit {
    return {
        "Content-Type": "application/json",
        "x-household-id": HOUSEHOLD_ID,
    };
}

export async function fetchFinancialPulse(): Promise<FinancialPulseData> {
    try {
        const response = await fetch(`${API_BASE_URL}/financial-pulse`, {
            method: "GET",
            headers: getApiHeaders(),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.userMessage || "Failed to fetch financial pulse");
        }

        return await response.json();
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
}

export async function fetchHousehold() {
    try {
        const response = await fetch(`${API_BASE_URL}/household`, {
            method: "GET",
            headers: getApiHeaders(),
        });

        if (!response.ok) {
            throw new Error("Failed to fetch household");
        }

        return await response.json();
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
}

/**
 * Upload a financial statement/document
 * @param file The file to upload
 * @param sourceType Type of document (CSV, PDF, IMAGE, MANUAL)
 * @param accountId Optional account ID if known
 * @param institutionName Optional institution name
 * @returns Upload response with document ID and processing status
 */
export async function uploadStatement(
    file: File,
    sourceType: DocumentSourceType,
    accountId?: string,
    institutionName?: string
): Promise<DocumentUploadResponse> {
    try {
        // Read file as base64
        const fileContent = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]); // Remove data:image/... prefix
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        const response = await fetch(`${API_BASE_URL}/documents/upload`, {
            method: "POST",
            headers: getApiHeaders(),
            body: JSON.stringify({
                fileName: file.name,
                mimeType: file.type,
                fileSizeBytes: file.size,
                sourceType,
                fileContent,
                accountId,
                institutionName,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to upload statement");
        }

        return await response.json();
    } catch (error) {
        console.error("Upload Error:", error);
        throw error;
    }
}

/**
 * Poll for document processing status
 * @param documentId ID of the uploaded document
 * @returns Current processing status
 */
export async function getDocumentStatus(documentId: string): Promise<DocumentStatusResponse> {
    try {
        const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
            method: "GET",
            headers: getApiHeaders(),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to fetch document status");
        }

        return await response.json();
    } catch (error) {
        console.error("Status Error:", error);
        throw error;
    }
}

/**
 * List all documents for the household with summary information
 * @returns List of statements with transaction/review counts
 */
export async function listStatements(): Promise<StatementListItem[]> {
    try {
        const response = await fetch(`${API_BASE_URL}/documents`, {
            method: "GET",
            headers: getApiHeaders(),
        });

        if (!response.ok) {
            throw new Error("Failed to fetch statements");
        }

        return await response.json();
    } catch (error) {
        console.error("List Statements Error:", error);
        throw error;
    }
}

/**
 * Get detailed processing summary for a specific statement
 * @param documentId ID of the document
 * @returns Comprehensive statement processing summary
 */
export async function getStatementSummary(documentId: string): Promise<StatementSummary> {
    try {
        const response = await fetch(`${API_BASE_URL}/documents/${documentId}/summary`, {
            method: "GET",
            headers: getApiHeaders(),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to fetch statement summary");
        }

        return await response.json();
    } catch (error) {
        console.error("Statement Summary Error:", error);
        throw error;
    }
}

async function apiFetch<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method: "GET",
        headers: getApiHeaders(),
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.userMessage || body.message || `Request failed: ${path}`);
    }
    return response.json();
}

export async function fetchHealthSummary(): Promise<HealthSummary> {
    return apiFetch<HealthSummary>("/health/summary");
}

export async function fetchBudgetResults(year: number, month: number): Promise<BudgetResultSet> {
    return apiFetch<BudgetResultSet>(`/budgets/results?year=${year}&month=${month}`);
}

export async function fetchGoals(): Promise<GoalResult[]> {
    return apiFetch<GoalResult[]>("/goals");
}

export async function fetchDebtSummary(): Promise<DebtSummary> {
    return apiFetch<DebtSummary>("/debt/summary");
}

export async function fetchCashFlowHistory(months: number): Promise<CashFlowHistory> {
    return apiFetch<CashFlowHistory>(`/cash-flow/history?months=${months}`);
}

export async function fetchSnapshotHistory(months: number): Promise<SnapshotHistory> {
    return apiFetch<SnapshotHistory>(`/snapshots/history?months=${months}`);
}

export async function fetchBudgetVarianceHistory(months: number): Promise<BudgetVarianceHistory> {
    return apiFetch<BudgetVarianceHistory>(`/history/budget-variance?months=${months}`);
}
