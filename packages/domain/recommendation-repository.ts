/**
 * Repository Interfaces for Recommendation Domain
 *
 * Defines contracts for data access, keeping domain logic separate from persistence.
 * Implementations will live in apps/api/src/db/
 */

import {
    EntityId,
    Recommendation,
    RecommendationVersion,
    Evidence,
    CreateRecommendationRequest,
    RecommendationStatus,
    RecommendationType,
    UpdateRecommendationStatusRequest,
} from "@house-fin/contracts";

/**
 * Repository for Recommendation entities
 *
 * Responsibilities:
 * - Persist recommendations
 * - Retrieve recommendations (single, by household, by status, etc.)
 * - Update recommendation status (approval workflow)
 * - Handle versioning automatically
 */
export interface RecommendationRepository {
    /**
     * Create a new recommendation and its initial version
     * Automatically creates RecommendationVersion with version=1
     */
    create(
        req: CreateRecommendationRequest,
        createdBy: EntityId
    ): Promise<{ recommendation: Recommendation; version: RecommendationVersion }>;

    /**
     * Get recommendation by ID
     */
    findById(id: EntityId): Promise<Recommendation | null>;

    /**
     * Get all recommendations for a household
     * @param limit Max results
     * @param offset For pagination
     * @param status Optional: filter by status
     * @param type Optional: filter by type
     */
    findByHouseholdId(
        householdId: EntityId,
        limit?: number,
        offset?: number,
        status?: RecommendationStatus,
        type?: RecommendationType
    ): Promise<Recommendation[]>;

    /**
     * Get recommendations for a conversation
     */
    findByConversationId(conversationId: EntityId): Promise<Recommendation[]>;

    /**
     * Get recommendations awaiting approval
     */
    findAwaitingApproval(householdId: EntityId): Promise<Recommendation[]>;

    /**
     * Update recommendation status (PROPOSED → REVIEWED → APPROVED/DECLINED)
     * Does NOT create a new version (status changes don't version)
     */
    updateStatus(
        id: EntityId,
        req: UpdateRecommendationStatusRequest,
        updatedBy: EntityId
    ): Promise<Recommendation>;

    /**
     * Create a new version of an existing recommendation
     * Used when material content changes (assumptions, evidence, risks, etc.)
     */
    createNewVersion(
        currentRecommendationId: EntityId,
        changes: Partial<Recommendation>,
        reason: string,
        changeDescription?: string,
        updatedBy?: EntityId
    ): Promise<{ recommendation: Recommendation; version: RecommendationVersion }>;

    /**
     * Find recommendations that have expired
     * (approval_status = PROPOSED AND expires_at < NOW())
     */
    findExpired(householdId?: EntityId): Promise<Recommendation[]>;

    /**
     * Mark a recommendation as EXPIRED
     */
    expire(id: EntityId): Promise<Recommendation>;

    /**
     * Mark a recommendation as INVALIDATED
     * (caused by data inconsistency or policy change)
     */
    invalidate(id: EntityId, reason: string): Promise<Recommendation>;

    /**
     * Get count of recommendations by status
     */
    countByStatus(householdId: EntityId): Promise<Record<RecommendationStatus, number>>;
}

/**
 * Repository for RecommendationVersion entities
 *
 * Responsibilities:
 * - Store all versions (append-only)
 * - Retrieve version history
 * - Compare versions
 */
export interface RecommendationVersionRepository {
    /**
     * Create a new version (called by RecommendationRepository.createNewVersion)
     */
    create(
        recommendationId: EntityId,
        householdId: EntityId,
        version: number,
        recommendation: Recommendation,
        reason: string,
        changeDescription: string | undefined,
        previousVersionId: EntityId | undefined,
        materialllyDifferent: boolean,
        createdBy: EntityId
    ): Promise<RecommendationVersion>;

    /**
     * Get specific version
     */
    findByVersion(recommendationId: EntityId, version: number): Promise<RecommendationVersion | null>;

    /**
     * Get all versions of a recommendation (in order)
     */
    findByRecommendationId(recommendationId: EntityId): Promise<RecommendationVersion[]>;

    /**
     * Get latest version of a recommendation
     */
    findLatest(recommendationId: EntityId): Promise<RecommendationVersion | null>;

    /**
     * Get version history for a household
     */
    findByHouseholdId(
        householdId: EntityId,
        limit?: number,
        offset?: number
    ): Promise<RecommendationVersion[]>;

    /**
     * Count versions where recommendation materially changed
     */
    countMaterialChanges(recommendationId: EntityId): Promise<number>;
}

/**
 * Repository for Evidence entities
 *
 * Responsibilities:
 * - Store evidence
 * - Link evidence to recommendations
 * - Track evidence freshness
 */
export interface EvidenceRepository {
    /**
     * Create evidence
     */
    create(evidence: Omit<Evidence, "id" | "createdAt">): Promise<Evidence>;

    /**
     * Get evidence by ID
     */
    findById(id: EntityId): Promise<Evidence | null>;

    /**
     * Get all evidence for a household
     */
    findByHouseholdId(householdId: EntityId, limit?: number): Promise<Evidence[]>;

    /**
     * Get evidence used in a recommendation
     */
    findByRecommendationId(recommendationId: EntityId): Promise<Evidence[]>;

    /**
     * Find evidence by source (for reuse)
     */
    findBySource(
        householdId: EntityId,
        sourceName: string,
        sourceTier: string
    ): Promise<Evidence[]>;

    /**
     * Update evidence usage (add recommendation to used_in array)
     */
    linkToRecommendation(
        evidenceId: EntityId,
        recommendationId: EntityId
    ): Promise<Evidence>;

    /**
     * Find stale evidence
     */
    findStale(householdId?: EntityId): Promise<Evidence[]>;

    /**
     * Get evidence by tier (for hierarchy-based research)
     */
    findByTier(householdId: EntityId, tier: string): Promise<Evidence[]>;
}

/**
 * Combined repository service for Slice 5 operations
 */
export interface RecommendationService {
    recommendations: RecommendationRepository;
    versions: RecommendationVersionRepository;
    evidence: EvidenceRepository;
}
