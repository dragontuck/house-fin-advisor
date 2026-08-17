/**
 * Transaction Posting Service
 *
 * Orchestrates posting of reconciled transactions to canonical ledger.
 * Ensures transactional safety: either all transactions post or none.
 * Handles idempotency, retry safety, and audit trail.
 *
 * Processing flow:
 * 1. Load reconciliation results for document
 * 2. Separate high-confidence and low-confidence transactions
 * 3. Validate configuration (auto-post threshold)
 * 4. Start transactional posting operation
 * 5. Post high-confidence transactions to canonical ledger
 * 6. Create ReviewItems for low-confidence transactions
 * 7. Recalculate FinancialSnapshot with new transactions
 * 8. Update document status (COMPLETED or PARTIALLY_COMPLETED)
 * 9. Commit transaction or rollback on failure
 */
import { EntityId, PostedTransaction, StatementPostingAudit, PostStatementRequest, PostStatementResponse, AutoPostConfig, ReconciliationBatch, TransactionReconciliation, FinancialDocument, ReviewItem, DocumentProcessingStatus } from "@house-fin/contracts";
/**
 * Repository interfaces for posting operations
 */
export interface IPostingRepository {
    getAutoPostConfig(householdId: EntityId): Promise<AutoPostConfig | null>;
    createOrUpdateAutoPostConfig(config: Omit<AutoPostConfig, "id" | "createdAt">): Promise<AutoPostConfig>;
    createPostedTransaction(tx: Omit<PostedTransaction, "id" | "createdAt">): Promise<PostedTransaction>;
    createPostedTransactions(txs: Omit<PostedTransaction, "id" | "createdAt">[]): Promise<PostedTransaction[]>;
    getPostedTransaction(id: EntityId): Promise<PostedTransaction | null>;
    listPostedTransactions(householdId: EntityId, filters?: {
        accountId?: EntityId;
        fromDate?: Date;
        toDate?: Date;
        postingCorrelationId?: EntityId;
    }): Promise<PostedTransaction[]>;
    createPostingAudit(audit: Omit<StatementPostingAudit, "id">): Promise<StatementPostingAudit>;
    updatePostingAudit(id: EntityId, updates: Partial<StatementPostingAudit>): Promise<StatementPostingAudit>;
    getPostingAudit(correlationId: EntityId): Promise<StatementPostingAudit | null>;
    getPostingAuditByIdempotencyKey(key: string): Promise<StatementPostingAudit | null>;
}
/**
 * Financial snapshot calculator interface
 */
export interface IFinancialSnapshotCalculator {
    calculate(input: any): any;
}
/**
 * Review item creator interface
 */
export interface IReviewQueueService {
    createReviewItem(input: any): Promise<ReviewItem>;
}
/**
 * Financial document repository interface
 */
export interface IFinancialDocumentRepository {
    findById(id: EntityId): Promise<FinancialDocument | null>;
    updateStatus(id: EntityId, status: DocumentProcessingStatus, errorCode?: string, errorMessageUser?: string): Promise<FinancialDocument>;
}
/**
 * Reconciliation repository interface
 */
export interface IReconciliationRepository {
    getReconciliationBatch(documentId: EntityId): Promise<ReconciliationBatch | null>;
}
/**
 * Configuration for posting operation
 */
export interface PostingConfig {
    idempotencyKey: string;
    correlationId: EntityId;
    userId: string;
    skipReviewItems?: boolean;
}
/**
 * Posting context during operation
 */
export interface PostingContext {
    householdId: EntityId;
    documentId: EntityId;
    accountId: EntityId;
    reconciliationBatch: ReconciliationBatch;
    autoPostConfig: AutoPostConfig;
    highConfidenceTransactions: TransactionReconciliation[];
    lowConfidenceTransactions: TransactionReconciliation[];
    postedCount: number;
    reviewItemsCreated: EntityId[];
    errors: Array<{
        transaction: TransactionReconciliation;
        error: Error;
    }>;
}
/**
 * Transaction Posting Service
 *
 * Orchestrates the complete posting workflow:
 * - Validates configuration and reconciliation results
 * - Separates transactions by confidence threshold
 * - Posts high-confidence transactions transactionally
 * - Creates ReviewItems for low-confidence
 * - Recalculates financial snapshot
 * - Maintains audit trail
 * - Ensures idempotency
 */
export declare class TransactionPostingService {
    private postingRepo;
    private snapshotCalculator;
    private reviewQueueService;
    private documentRepo;
    private reconciliationRepo?;
    constructor(postingRepo: IPostingRepository, snapshotCalculator: IFinancialSnapshotCalculator, reviewQueueService: IReviewQueueService, documentRepo: IFinancialDocumentRepository, reconciliationRepo?: IReconciliationRepository);
    /**
     * Post a statement's reconciled transactions to canonical ledger
     *
     * Transactional operation: either all succeeds or nothing is written.
     * If partial posting is allowed and some transactions require review,
     * posts high-confidence and creates ReviewItems for others.
     *
     * @param request Statement to post
     * @param config Posting configuration (userId, idempotency key, etc.)
     * @returns Response with results and status
     */
    postStatement(request: PostStatementRequest, config: PostingConfig): Promise<PostStatementResponse>;
    /**
     * Post high-confidence transactions to canonical ledger
     * This operation should be transactional - all succeed or all fail
     */
    private postHighConfidenceTransactions;
    /**
     * Build user-friendly response message
     */
    private buildUserMessage;
    /**
     * Build suggested next steps
     */
    private buildNextSteps;
    /**
     * Build response from audit record
     */
    private buildResponse;
}
//# sourceMappingURL=posting-service.d.ts.map