/**
 * Transaction Normalizer
 * 
 * Converts parsed transaction candidates into canonical normalized transactions.
 * Preserves original raw values for audit trail and validation.
 * 
 * Never silently overwrites or modifies source data.
 * All raw original values are preserved in the 'original' field.
 */

import {
    TransactionCandidate,
    ExtractedTransactionCandidate,
    NormalizedTransaction,
    Money,
    EntityId,
    SourceReference,
    ExtractionMethod,
} from "@house-fin/contracts";

/**
 * Normalize a single transaction candidate to canonical form
 * Preserves all original values for audit trail
 */
export function normalizeTransaction(
    candidate: TransactionCandidate | ExtractedTransactionCandidate,
    documentId: EntityId,
    accountId?: EntityId
): NormalizedTransaction {
    // Parse and normalize date
    const transactionDate = normalizeDateCandid(candidate.date);

    // Determine direction and normalize amount
    let direction: "DEBIT" | "CREDIT";
    let normalizedAmount: Money;

    if (candidate.amountCents < 0) {
        // Negative amount = expense/debit
        direction = "DEBIT";
        normalizedAmount = Money(Math.abs(candidate.amountCents));
    } else {
        // Positive amount = income/credit
        direction = "CREDIT";
        normalizedAmount = Money(candidate.amountCents);
    }

    // Normalize merchant/description
    const merchant = normalizeMerchantName(candidate.description);
    const description = normalizeDescription(candidate.description);

    // Build normalized transaction
    const normalized: NormalizedTransaction = {
        transactionDate,
        amount: normalizedAmount,
        direction,
        merchant,
        description,
        descriptionRaw: candidate.description,
        accountId,
        sourceDocument: {
            documentId,
            rowNumber: candidate.sourceRowNumber,
            pageNumber: isExtractedCandidate(candidate) ? candidate.sourceReference?.pageNumber : undefined,
            sourceReference: isExtractedCandidate(candidate) ? candidate.sourceReference : undefined,
        },
        original: {
            dateString: candidate.originalDate,
            amountString: candidate.originalAmount,
            description: candidate.description,
        },
        sourceTransactionId: isExtractedCandidate(candidate) ? undefined : undefined,
        statementReference: undefined,
        createdAt: new Date(),
    };

    // Add optional hints if available (PDF/image extractions)
    if (isExtractedCandidate(candidate)) {
        if (candidate.institutionHint) {
            normalized.sourceTransactionId = candidate.institutionHint;
        }
    }

    return normalized;
}

/**
 * Normalize a date - ensure ISO format
 */
function normalizeDateCandid(date: Date): Date {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        throw new Error("Invalid date");
    }

    // Return a new Date object in UTC, normalized to midnight UTC
    const normalized = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        0,
        0,
        0,
        0
    ));

    return normalized;
}

/**
 * Normalize merchant name:
 * - Trim whitespace
 * - Remove extra spaces
 * - Normalize case (Title Case)
 * - Remove common suffixes and prefixes
 * - Handle special cases like "AMAZON COM" (meaning amazon.com)
 */
function normalizeMerchantName(description: string): string {
    let normalized = description.trim();

    // Remove extra whitespace
    normalized = normalized.replace(/\s+/g, " ");

    // Remove common transaction type indicators at start
    normalized = normalized
        .replace(/^(DEBIT|CREDIT|ACH|CHECK|TRANSFER|DEPOSIT|WITHDRAWAL|PURCHASE|PAYMENT|REFUND)\s+/i, "")
        .trim();

    // Handle special case: "AMAZON COM AMZN" -> "Amazon.com"
    // Look for pattern: WORD DOMAIN_EXT [SYMBOL]
    // Domain extensions: COM, NET, ORG, IO, CO, UK
    const parts = normalized.split(/\s+/);
    if (parts.length >= 2) {
        for (let i = 0; i < parts.length - 1; i++) {
            const nextPart = parts[i + 1].toUpperCase();
            if (/^(COM|NET|ORG|IO|CO|UK)$/.test(nextPart)) {
                // Found domain extension after current word
                const mainPart = parts[i].charAt(0).toUpperCase() + parts[i].slice(1).toLowerCase();
                const domain = nextPart.toLowerCase();
                return `${mainPart}.${domain}`;
            }
        }
    }

    // If name contains a dot (like AMAZON.COM), preserve it
    if (normalized.includes(".")) {
        const parts = normalized.split(/\s+/);
        let mainPart = parts[0];  // e.g., "AMAZON.COM"

        // Normalize case preserving dots
        const normalized_cased = mainPart
            .split(".")
            .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
            .join(".");

        return normalized_cased;
    }

    // Remove common legal suffixes at the end
    normalized = normalized
        .replace(/\s+(INC|LLC|LTD|CO|PLC|CORP|CORP\.|CORP'N|CORPORATION)$/i, "")
        .trim();

    // Remove known ticker symbols at the end (AMZN, AAPL, MSFT, GOOG, etc.)
    // Only 4-char symbols that look like tickers (not common names like JOHN)
    normalized = normalized
        .replace(/\s+(AMZN|AAPL|MSFT|GOOG|TSLA|NFLX|META|NVDA)$/i, "")
        .trim();

    // Extract likely merchant name (take significant parts)
    const cleanParts = normalized.split(/\s+/);

    if (cleanParts.length === 0) {
        return normalized;
    }

    // Take first 1-2 words (prefer words > 2 chars)
    let merchantParts: string[] = [];
    for (const part of cleanParts) {
        // Skip very short words (TO, AT, IN, OR, etc.) but accept longer words
        if (part.length > 2 && !/^(TO|AND|AT|THE|FOR|FROM|IN|OR|COM|NET|ORG)$/i.test(part)) {
            merchantParts.push(part);
            if (merchantParts.length >= 2) break;
        }
    }

    if (merchantParts.length === 0) {
        // No words > 2 chars found, just take the first non-trivial part
        for (const part of cleanParts) {
            if (!/^(TO|AND|AT|THE|FOR|FROM|IN|OR|COM|NET|ORG)$/i.test(part)) {
                merchantParts.push(part);
                break;
            }
        }
    }

    if (merchantParts.length === 0) {
        merchantParts = [cleanParts[0]];
    }

    // Normalize to title case
    normalized = merchantParts
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(" ");

    return normalized;
}

/**
 * Normalize description:
 * - Trim whitespace
 * - Remove extra spaces
 * - Preserve original meaning
 */
function normalizeDescription(description: string): string {
    let normalized = description.trim();

    // Remove extra whitespace
    normalized = normalized.replace(/\s+/g, " ");

    return normalized;
}

/**
 * Type guard to determine if candidate is extracted (has source reference)
 */
function isExtractedCandidate(candidate: any): candidate is ExtractedTransactionCandidate {
    return (candidate as ExtractedTransactionCandidate).sourceReference !== undefined;
}

/**
 * Batch normalize multiple candidates
 */
export function normalizeBatch(
    candidates: (TransactionCandidate | ExtractedTransactionCandidate)[],
    documentId: EntityId,
    accountId?: EntityId
): NormalizedTransaction[] {
    return candidates.map(candidate => normalizeTransaction(candidate, documentId, accountId));
}

/**
 * Create normalized transaction from minimal input (for testing/manual entry)
 */
export function createNormalizedTransaction(input: {
    date: Date;
    amount: number; // cents
    direction: "DEBIT" | "CREDIT";
    merchant: string;
    description: string;
    documentId: EntityId;
    accountId?: EntityId;
    rowNumber?: number;
    pageNumber?: number;
}): NormalizedTransaction {
    const amount = input.direction === "DEBIT"
        ? Money(Math.abs(input.amount))
        : Money(Math.abs(input.amount));

    const normalizedDate = normalizeDateCandid(input.date);

    return {
        transactionDate: normalizedDate,
        amount,
        direction: input.direction,
        merchant: normalizeMerchantName(input.merchant),
        description: normalizeDescription(input.description),
        descriptionRaw: input.description,
        accountId: input.accountId,
        sourceDocument: {
            documentId: input.documentId,
            rowNumber: input.rowNumber,
            pageNumber: input.pageNumber,
        },
        original: {
            dateString: input.date.toISOString(),
            amountString: `${input.direction === "DEBIT" ? "-" : ""}${input.amount}`,
            description: input.description,
        },
        createdAt: new Date(),
    };
}
