/**
 * API Client for Financial Pulse
 * Provides type-safe access to backend endpoints
 */

export interface AccountBalance {
    name: string;
    balance: number;
    type: string;
}

export interface FinancialPulseData {
    householdId: string;
    householdName: string;
    asOf: string;
    healthStatus: "HEALTHY" | "ATTENTION" | "AT_RISK";
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
