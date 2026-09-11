import { randomUUID } from "crypto";
import {
    CreateRecommendationRequest,
    DecisionJournalEntry,
    EntityId,
    Recommendation,
    RecommendationStatus,
    RecommendationType,
    RecommendationVersion,
    UpdateRecommendationStatusRequest,
} from "@house-fin/contracts";
import type { FinalRecommendation } from "@house-fin/domain";
import { getClient, query } from "../connection";

type DbRow = Record<string, unknown>;

function mapRecommendation(row: DbRow): Recommendation {
    return {
        id: row.id as EntityId,
        householdId: row.household_id as EntityId,
        memberId: row.member_id as EntityId,
        conversationId: (row.conversation_id as EntityId | null) ?? undefined,
        type: row.type as RecommendationType,
        title: row.title as string,
        summary: row.summary as string,
        recommendedAction: row.recommended_action as string,
        financialSnapshotId: row.financial_snapshot_id as EntityId,
        financialSnapshotVersion: Number(row.financial_snapshot_version),
        policyVersion: Number(row.policy_version),
        scenarioIds: (row.scenario_ids as EntityId[] | null) ?? [],
        alternatives: (row.alternatives as Recommendation["alternatives"] | null) ?? [],
        assumptions: (row.assumptions as Recommendation["assumptions"] | null) ?? [],
        risks: (row.risks as Recommendation["risks"] | null) ?? [],
        evidence: (row.evidence as Recommendation["evidence"] | null) ?? [],
        validation: (row.validation_result as Recommendation["validation"] | null) ?? undefined,
        confidence: row.confidence as Recommendation["confidence"],
        confidenceReasoning: row.confidence_reasoning as string,
        approval: {
            status: row.approval_status as RecommendationStatus,
            approvedAt: row.approved_at ? new Date(row.approved_at as string | Date) : undefined,
            approvedBy: (row.approved_by as EntityId | null) ?? undefined,
            approvalNotes: (row.approval_notes as string | null) ?? undefined,
            declinedAt: row.declined_at ? new Date(row.declined_at as string | Date) : undefined,
            declinedBy: (row.declined_by as EntityId | null) ?? undefined,
            declinationReason: (row.declination_reason as string | null) ?? undefined,
            expiresAt: row.expires_at ? new Date(row.expires_at as string | Date) : undefined,
        },
        approvalRequired: row.approval_required as boolean,
        version: Number(row.version),
        previousVersionId: (row.previous_version_id as EntityId | null) ?? undefined,
        createdAt: new Date(row.created_at as string | Date),
        createdBy: row.created_by as EntityId,
        updatedAt: new Date(row.updated_at as string | Date),
        correlationId: row.correlation_id as EntityId,
    };
}

function mapVersion(row: DbRow): RecommendationVersion {
    return {
        id: row.id as EntityId,
        recommendationId: row.recommendation_id as EntityId,
        householdId: row.household_id as EntityId,
        version: Number(row.version),
        reason: row.reason as RecommendationVersion["reason"],
        changeDescription: (row.change_description as string | null) ?? undefined,
        recommendation: row.recommendation as Recommendation,
        previousVersionId: (row.previous_version_id as EntityId | null) ?? undefined,
        materialllyDifferent: row.materially_different as boolean,
        createdAt: new Date(row.created_at as string | Date),
        createdBy: row.created_by as EntityId,
    };
}

export class PgRecommendationRepository {
    async recordGenerated(entry: DecisionJournalEntry, final: FinalRecommendation): Promise<Recommendation> {
        if (!entry.financialSnapshotId || entry.financialSnapshotVersion === undefined || entry.householdPolicyVersion === undefined) {
            throw new Error("Recommendation lineage requires snapshot and policy versions");
        }
        const client = await getClient();
        try {
            await client.query("BEGIN");
            const result = await client.query(
                `INSERT INTO finhouse.recommendations (
                    id, household_id, member_id, conversation_id, type, title, summary,
                    recommended_action, financial_snapshot_id, financial_snapshot_version,
                    policy_version, scenario_ids, alternatives, assumptions, risks, evidence,
                    validation_status, validation_result, confidence, confidence_reasoning,
                    approval_status, approval_required, version, created_by, correlation_id
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'PROPOSED',$21,1,$22,$23)
                ON CONFLICT (correlation_id) DO UPDATE SET correlation_id = EXCLUDED.correlation_id
                RETURNING *`,
                [
                    entry.recommendationId, entry.householdId, entry.memberId, entry.conversationId ?? null,
                    final.type, final.title, final.why, final.recommendedAction, entry.financialSnapshotId,
                    entry.financialSnapshotVersion, entry.householdPolicyVersion, JSON.stringify(final.scenarioIds),
                    JSON.stringify(final.alternatives), JSON.stringify(final.assumptions), JSON.stringify(final.risks),
                    JSON.stringify(final.evidence), final.validation.status, JSON.stringify(final.validation),
                    final.confidence, final.confidenceReasoning, final.approvalRequired, entry.memberId, entry.correlationId,
                ]
            );
            const recommendation = mapRecommendation(result.rows[0]);
            await client.query(
                `INSERT INTO finhouse.recommendation_versions (
                    id, recommendation_id, household_id, version, reason, recommendation,
                    materially_different, created_by
                ) VALUES ($1,$2,$3,1,'INITIAL',$4,false,$5)
                ON CONFLICT (recommendation_id, version) DO NOTHING`,
                [randomUUID(), recommendation.id, recommendation.householdId, JSON.stringify(recommendation), entry.memberId]
            );
            await client.query("COMMIT");
            return recommendation;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async findById(id: EntityId, householdId: EntityId): Promise<Recommendation | null> {
        const result = await query(
            "SELECT * FROM finhouse.recommendations WHERE id = $1 AND household_id = $2",
            [id, householdId]
        );
        return result.rows[0] ? mapRecommendation(result.rows[0]) : null;
    }

    async findByHouseholdId(
        householdId: EntityId,
        limit = 50,
        offset = 0,
        status?: RecommendationStatus,
        type?: RecommendationType
    ): Promise<Recommendation[]> {
        const result = await query(
            `SELECT * FROM finhouse.recommendations
             WHERE household_id = $1
               AND ($4::text IS NULL OR approval_status = $4)
               AND ($5::text IS NULL OR type = $5)
             ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
            [householdId, limit, offset, status ?? null, type ?? null]
        );
        return result.rows.map(mapRecommendation);
    }

    async findByConversationId(conversationId: EntityId, householdId: EntityId): Promise<Recommendation[]> {
        const result = await query(
            `SELECT * FROM finhouse.recommendations
             WHERE conversation_id = $1 AND household_id = $2 ORDER BY created_at`,
            [conversationId, householdId]
        );
        return result.rows.map(mapRecommendation);
    }

    async updateStatus(
        id: EntityId,
        householdId: EntityId,
        request: UpdateRecommendationStatusRequest,
        updatedBy: EntityId
    ): Promise<Recommendation> {
        const timestampField = request.status === "APPROVED" ? "approved_at = NOW(), approved_by = $4" :
            request.status === "DECLINED" ? "declined_at = NOW(), declined_by = $4" : "updated_at = NOW()";
        const result = await query(
            `UPDATE finhouse.recommendations SET approval_status = $3, ${timestampField},
                approval_notes = $5, declination_reason = $6, updated_at = NOW()
             WHERE id = $1 AND household_id = $2 RETURNING *`,
            [id, householdId, request.status, updatedBy, request.approvalNotes ?? null, request.declinationReason ?? null]
        );
        if (!result.rows[0]) throw new Error("Recommendation not found");
        return mapRecommendation(result.rows[0]);
    }

    async invalidateForChangedBasis(
        householdId: EntityId,
        financialSnapshotId: EntityId,
        policyVersion: number
    ): Promise<number> {
        const result = await query(
            `UPDATE finhouse.recommendations
             SET approval_status = 'INVALIDATED', updated_at = NOW()
             WHERE household_id = $1 AND approval_status IN ('PROPOSED', 'REVIEWED')
               AND (financial_snapshot_id <> $2 OR policy_version <> $3)`,
            [householdId, financialSnapshotId, policyVersion]
        );
        return result.rowCount ?? 0;
    }

    async expireOverdue(householdId: EntityId): Promise<number> {
        const result = await query(
            `UPDATE finhouse.recommendations
             SET approval_status = 'EXPIRED', updated_at = NOW()
             WHERE household_id = $1 AND approval_status IN ('PROPOSED', 'REVIEWED')
               AND expires_at IS NOT NULL AND expires_at <= NOW()`,
            [householdId]
        );
        return result.rowCount ?? 0;
    }
}

export class PgRecommendationVersionRepository {
    async findByVersion(
        recommendationId: EntityId,
        version: number,
        householdId: EntityId
    ): Promise<RecommendationVersion | null> {
        const result = await query(
            `SELECT * FROM finhouse.recommendation_versions
             WHERE recommendation_id = $1 AND version = $2 AND household_id = $3`,
            [recommendationId, version, householdId]
        );
        return result.rows[0] ? mapVersion(result.rows[0]) : null;
    }

    async findByRecommendationId(recommendationId: EntityId, householdId: EntityId): Promise<RecommendationVersion[]> {
        const result = await query(
            `SELECT * FROM finhouse.recommendation_versions
             WHERE recommendation_id = $1 AND household_id = $2 ORDER BY version`,
            [recommendationId, householdId]
        );
        return result.rows.map(mapVersion);
    }
}
