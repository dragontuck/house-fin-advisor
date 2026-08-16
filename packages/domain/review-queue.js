"use strict";
/**
 * Review Queue Service
 * Manages the workflow for human review of statement-processing exceptions
 *
 * Key principles:
 * - Review items must not silently modify canonical financial data
 * - Every resolution creates an auditable decision record
 * - User-facing messages never include technical details or IDs
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewQueueService = void 0;
const contracts_1 = require("../contracts");
class ReviewQueueService {
    constructor(reviewRepository) {
        this.reviewRepository = reviewRepository;
    }
    /**
     * Create a new review item
     * Does NOT automatically resolve - requires human decision
     */
    async createReviewItem(input) {
        // Validate that we're not silently modifying data
        if (!input.userMessage || input.userMessage.trim().length === 0) {
            throw new Error("Review items must include clear user message (why we're unsure)");
        }
        if (input.candidateValues.length === 0) {
            throw new Error("Review items must provide candidate choices");
        }
        const reviewItem = {
            id: (0, contracts_1.EntityId)(this.generateId()),
            householdId: input.householdId,
            type: input.type,
            severity: input.severity,
            status: contracts_1.ReviewStatus.PENDING,
            title: input.title,
            userMessage: input.userMessage,
            recommendedAction: input.recommendedAction,
            candidateValues: input.candidateValues,
            supportingEvidence: input.supportingEvidence,
            transactionIds: input.transactionIds || [],
            statementId: input.statementId,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        return this.reviewRepository.createReviewItem(reviewItem);
    }
    /**
     * Get a review item with full context
     */
    async getReviewItem(reviewItemId, householdId) {
        const item = await this.reviewRepository.getReviewItem(reviewItemId);
        if (!item || item.householdId !== householdId) {
            return null; // Not found or access denied
        }
        return item;
    }
    /**
     * List review items for a household
     */
    async listReviewItems(householdId, filters) {
        return this.reviewRepository.listReviewItems(householdId, filters);
    }
    /**
     * Get next pending review item for household
     */
    async getNextPendingItem(householdId) {
        const items = await this.reviewRepository.listReviewItems(householdId, { status: contracts_1.ReviewStatus.PENDING });
        // Return highest severity first, then oldest first
        if (items.length === 0)
            return null;
        items.sort((a, b) => {
            const severityOrder = { ERROR: 0, WARNING: 1, INFO: 2 };
            const aSeverity = severityOrder[a.severity] ?? 3;
            const bSeverity = severityOrder[b.severity] ?? 3;
            if (aSeverity !== bSeverity) {
                return aSeverity - bSeverity;
            }
            return a.createdAt.getTime() - b.createdAt.getTime();
        });
        return items[0];
    }
    /**
     * Resolve a review item with user decision
     * Creates an immutable resolution record (audit trail)
     * Updates review item status to RESOLVED
     */
    async resolveReviewItem(input) {
        // Validate authorization
        const item = await this.reviewRepository.getReviewItem(input.reviewItemId);
        if (!item || item.householdId !== input.householdId) {
            throw new Error("Review item not found or access denied");
        }
        if (item.status !== contracts_1.ReviewStatus.PENDING) {
            throw new Error(`Cannot resolve review item with status ${item.status}`);
        }
        // Validate that chosen action is valid for this review type
        this.validateChosenAction(item.type, input.chosenAction);
        // Create resolution record
        const resolution = {
            reviewItemId: input.reviewItemId,
            chosenAction: input.chosenAction,
            reasoning: input.reasoning,
            resolvedBy: input.resolvedBy,
            resolvedAt: new Date(),
            affectedTransactionIds: input.affectedTransactionIds || [],
            resultingMetadata: input.resultingMetadata,
        };
        // Save resolution (creates audit trail)
        const savedResolution = await this.reviewRepository.createResolution(resolution);
        // Update review item status
        item.status = contracts_1.ReviewStatus.RESOLVED;
        item.resolution = savedResolution;
        item.resolvedAt = savedResolution.resolvedAt;
        item.resolvedBy = savedResolution.resolvedBy;
        item.updatedAt = new Date();
        await this.reviewRepository.updateReviewItem(item);
        return savedResolution;
    }
    /**
     * Mark a review item as in-progress (user started reviewing)
     */
    async markInProgress(reviewItemId, householdId) {
        const item = await this.reviewRepository.getReviewItem(reviewItemId);
        if (!item || item.householdId !== householdId) {
            throw new Error("Review item not found or access denied");
        }
        if (item.status !== contracts_1.ReviewStatus.PENDING) {
            throw new Error(`Cannot mark as in-progress: current status is ${item.status}`);
        }
        item.status = contracts_1.ReviewStatus.IN_PROGRESS;
        item.updatedAt = new Date();
        return this.reviewRepository.updateReviewItem(item);
    }
    /**
     * Archive a review item (user deferred decision)
     */
    async archiveReviewItem(reviewItemId, householdId) {
        const item = await this.reviewRepository.getReviewItem(reviewItemId);
        if (!item || item.householdId !== householdId) {
            throw new Error("Review item not found or access denied");
        }
        item.status = contracts_1.ReviewStatus.ARCHIVED;
        item.updatedAt = new Date();
        return this.reviewRepository.updateReviewItem(item);
    }
    /**
     * Get statistics about review queue
     */
    async getStats(householdId) {
        const items = await this.reviewRepository.listReviewItems(householdId);
        const stats = {
            householdId,
            totalItems: items.length,
            byStatus: {
                [contracts_1.ReviewStatus.PENDING]: 0,
                [contracts_1.ReviewStatus.IN_PROGRESS]: 0,
                [contracts_1.ReviewStatus.RESOLVED]: 0,
                [contracts_1.ReviewStatus.ARCHIVED]: 0,
            },
            byType: {
                [contracts_1.ReviewType.AMBIGUOUS_TRANSACTION]: 0,
                [contracts_1.ReviewType.POSSIBLE_DUPLICATE]: 0,
                [contracts_1.ReviewType.RECONCILIATION_CONFLICT]: 0,
                [contracts_1.ReviewType.UNKNOWN_ACCOUNT]: 0,
                [contracts_1.ReviewType.UNKNOWN_STATEMENT_PERIOD]: 0,
                [contracts_1.ReviewType.PARSE_WARNING]: 0,
                [contracts_1.ReviewType.BALANCE_MISMATCH]: 0,
            },
            bySeverity: {
                [contracts_1.ReviewSeverity.INFO]: 0,
                [contracts_1.ReviewSeverity.WARNING]: 0,
                [contracts_1.ReviewSeverity.ERROR]: 0,
            },
        };
        let oldestPendingTime = Infinity;
        for (const item of items) {
            // Count by status
            stats.byStatus[item.status] = (stats.byStatus[item.status] || 0) + 1;
            // Count by type
            stats.byType[item.type] = (stats.byType[item.type] || 0) + 1;
            // Count by severity
            stats.bySeverity[item.severity] = (stats.bySeverity[item.severity] || 0) + 1;
            // Track oldest pending
            if (item.status === contracts_1.ReviewStatus.PENDING) {
                const age = Date.now() - item.createdAt.getTime();
                oldestPendingTime = Math.min(oldestPendingTime, age);
            }
        }
        if (oldestPendingTime !== Infinity) {
            stats.oldestPendingAge = Math.floor(oldestPendingTime / 1000);
        }
        return stats;
    }
    /**
     * Validate that chosen action is appropriate for review type
     */
    validateChosenAction(type, action) {
        const validActions = {
            [contracts_1.ReviewType.AMBIGUOUS_TRANSACTION]: [
                "CATEGORIZE_SHOPPING",
                "CATEGORIZE_GROCERIES",
                "CATEGORIZE_ENTERTAINMENT",
                "CATEGORIZE_OTHER",
                "SKIP_FOR_NOW",
            ],
            [contracts_1.ReviewType.POSSIBLE_DUPLICATE]: [
                "USE_EXISTING",
                "KEEP_BOTH",
                "DELETE_NEW",
                "MERGE_TRANSACTIONS",
                "REVIEW_LATER",
            ],
            [contracts_1.ReviewType.RECONCILIATION_CONFLICT]: [
                "ACCEPT_CSV",
                "ACCEPT_BANK",
                "SPLIT_DIFFERENCE",
                "MANUAL_ENTRY",
                "INVESTIGATE_LATER",
            ],
            [contracts_1.ReviewType.UNKNOWN_ACCOUNT]: [
                "CREATE_NEW_ACCOUNT",
                "ASSIGN_TO_EXISTING",
                "SKIP_TRANSACTION",
                "MARK_AS_TRANSFER",
            ],
            [contracts_1.ReviewType.UNKNOWN_STATEMENT_PERIOD]: [
                "SET_PERIOD_START",
                "SET_PERIOD_END",
                "USE_DOCUMENT_DATE",
                "SKIP_STATEMENT",
            ],
            [contracts_1.ReviewType.PARSE_WARNING]: [
                "ACCEPT_PARSED",
                "PROVIDE_CORRECTION",
                "SKIP_ROWS",
                "REUPLOAD_DOCUMENT",
            ],
            [contracts_1.ReviewType.BALANCE_MISMATCH]: [
                "ACCEPT_DISCREPANCY",
                "INVESTIGATE",
                "ADJUST_OPENING_BALANCE",
                "MARK_AS_EXPECTED_DRIFT",
            ],
        };
        const allowed = validActions[type] || [];
        if (!allowed.includes(action)) {
            throw new Error(`Invalid action "${action}" for review type ${type}. Allowed: ${allowed.join(", ")}`);
        }
    }
    /**
     * Generate unique ID for review item
     */
    generateId() {
        return require("crypto").randomUUID();
    }
}
exports.ReviewQueueService = ReviewQueueService;
//# sourceMappingURL=review-queue.js.map