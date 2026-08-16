/**
 * Transaction Reconciler
 *
 * Reconciles normalized transactions against existing transactions using multiple matching signals.
 * Implements priority-based matching:
 * 1. Source transaction ID (provider/bank ID)
 * 2. Exact statement reference
 * 3. Account match
 * 4. Amount match
 * 5. Date proximity
 * 6. Merchant similarity
 * 7. Transaction direction
 * 8. Statement balance context
 *
 * Never guesses or overwrites existing data.
 * Preserves both observations when sources disagree.
 * Ensures idempotency - reprocessing same statement produces same result.
 */
import { NormalizedTransaction, TransactionReconciliation, ReconciliationBatch, Money, EntityId } from "@house-fin/contracts";
/**
 * In-memory transaction store for reconciliation
 * In production, would be a database query
 */
export interface ExistingTransaction {
    id: string;
    date: Date;
    amount: Money;
    direction: "DEBIT" | "CREDIT";
    merchant: string;
    description: string;
    accountId?: EntityId;
    sourceTransactionId?: string;
    statementReference?: string;
    createdAt: Date;
    lastUpdatedAt: Date;
    documentId?: EntityId;
}
/**
 * Reconciliation context holding existing transactions
 */
export interface ReconciliationContext {
    existingTransactions: ExistingTransaction[];
    accountId?: EntityId;
    statementBalances?: {
        date: Date;
        expectedBalance: Money;
        margin?: Money;
    };
}
/**
 * Reconcile a single normalized transaction against existing ones
 */
export declare function reconcileTransaction(normalized: NormalizedTransaction, context: ReconciliationContext, idempotencyKey?: string): TransactionReconciliation;
/**
 * Batch reconcile multiple transactions
 */
export declare function reconcileBatch(normalized: NormalizedTransaction[], context: ReconciliationContext, documentId: EntityId): ReconciliationBatch;
/**
 * Detect and report idempotency - has this been processed before?
 */
export declare function checkIdempotency(idempotencyKey: string, previousBatches: ReconciliationBatch[]): {
    isDuplicate: boolean;
    previousBatch?: ReconciliationBatch;
};
//# sourceMappingURL=transaction-reconciler.d.ts.map