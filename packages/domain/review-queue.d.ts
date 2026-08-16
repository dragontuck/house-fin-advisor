/**
 * Review Queue Service
 * Manages the workflow for human review of statement-processing exceptions
 *
 * Key principles:
 * - Review items must not silently modify canonical financial data
 * - Every resolution creates an auditable decision record
 * - User-facing messages never include technical details or IDs
 */
import { EntityId, ReviewItem, ReviewType, ReviewSeverity, ReviewStatus, ReviewResolution, ReviewQueueStats } from "../contracts";
export interface CreateReviewItemInput {
    householdId: EntityId;
    type: ReviewType;
    severity: ReviewSeverity;
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
    transactionIds?: EntityId[];
    statementId?: EntityId;
}
export interface ResolveReviewItemInput {
    reviewItemId: EntityId;
    householdId: EntityId;
    chosenAction: string;
    reasoning: string;
    affectedTransactionIds?: EntityId[];
    resultingMetadata?: Record<string, any>;
    resolvedBy: string;
}
export declare class ReviewQueueService {
    private reviewRepository;
    constructor(reviewRepository: IReviewRepository);
    /**
     * Create a new review item
     * Does NOT automatically resolve - requires human decision
     */
    createReviewItem(input: CreateReviewItemInput): Promise<ReviewItem>;
    /**
     * Get a review item with full context
     */
    getReviewItem(reviewItemId: EntityId, householdId: EntityId): Promise<ReviewItem | null>;
    /**
     * List review items for a household
     */
    listReviewItems(householdId: EntityId, filters?: {
        status?: ReviewStatus;
        type?: ReviewType;
        severity?: ReviewSeverity;
    }): Promise<ReviewItem[]>;
    /**
     * Get next pending review item for household
     */
    getNextPendingItem(householdId: EntityId): Promise<ReviewItem | null>;
    /**
     * Resolve a review item with user decision
     * Creates an immutable resolution record (audit trail)
     * Updates review item status to RESOLVED
     */
    resolveReviewItem(input: ResolveReviewItemInput): Promise<ReviewResolution>;
    /**
     * Mark a review item as in-progress (user started reviewing)
     */
    markInProgress(reviewItemId: EntityId, householdId: EntityId): Promise<ReviewItem>;
    /**
     * Archive a review item (user deferred decision)
     */
    archiveReviewItem(reviewItemId: EntityId, householdId: EntityId): Promise<ReviewItem>;
    /**
     * Get statistics about review queue
     */
    getStats(householdId: EntityId): Promise<ReviewQueueStats>;
    /**
     * Validate that chosen action is appropriate for review type
     */
    private validateChosenAction;
    /**
     * Generate unique ID for review item
     */
    private generateId;
}
/**
 * Repository interface for review queue persistence
 */
export interface IReviewRepository {
    createReviewItem(item: ReviewItem): Promise<ReviewItem>;
    getReviewItem(id: EntityId): Promise<ReviewItem | null>;
    updateReviewItem(item: ReviewItem): Promise<ReviewItem>;
    listReviewItems(householdId: EntityId, filters?: {
        status?: ReviewStatus;
        type?: ReviewType;
        severity?: ReviewSeverity;
    }): Promise<ReviewItem[]>;
    createResolution(resolution: ReviewResolution): Promise<ReviewResolution>;
    getResolution(reviewItemId: EntityId): Promise<ReviewResolution | null>;
}
//# sourceMappingURL=review-queue.d.ts.map