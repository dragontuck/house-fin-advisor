/**
 * Transaction Normalizer
 *
 * Converts parsed transaction candidates into canonical normalized transactions.
 * Preserves original raw values for audit trail and validation.
 *
 * Never silently overwrites or modifies source data.
 * All raw original values are preserved in the 'original' field.
 */
import { TransactionCandidate, ExtractedTransactionCandidate, NormalizedTransaction, EntityId } from "@house-fin/contracts";
/**
 * Normalize a single transaction candidate to canonical form
 * Preserves all original values for audit trail
 */
export declare function normalizeTransaction(candidate: TransactionCandidate | ExtractedTransactionCandidate, documentId: EntityId, accountId?: EntityId): NormalizedTransaction;
/**
 * Batch normalize multiple candidates
 */
export declare function normalizeBatch(candidates: (TransactionCandidate | ExtractedTransactionCandidate)[], documentId: EntityId, accountId?: EntityId): NormalizedTransaction[];
/**
 * Create normalized transaction from minimal input (for testing/manual entry)
 */
export declare function createNormalizedTransaction(input: {
    date: Date;
    amount: number;
    direction: "DEBIT" | "CREDIT";
    merchant: string;
    description: string;
    documentId: EntityId;
    accountId?: EntityId;
    rowNumber?: number;
    pageNumber?: number;
}): NormalizedTransaction;
//# sourceMappingURL=transaction-normalizer.d.ts.map