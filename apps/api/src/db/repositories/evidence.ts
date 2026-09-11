import { randomUUID } from "crypto";
import {
    ConfidenceLevel,
    EntityId,
    Evidence,
    SourceAuthority,
    SourceTier,
} from "@house-fin/contracts";
import { EvidenceRepository } from "@house-fin/domain";
import { query } from "../connection";

type DbRow = Record<string, unknown>;

function mapEvidence(row: DbRow): Evidence {
    return {
        id: row.id as EntityId,
        householdId: row.household_id as EntityId,
        claim: row.claim as string,
        source: {
            name: row.source_name as string,
            type: row.source_type as Evidence["source"]["type"],
            tier: row.source_tier as SourceTier,
            authority: row.source_authority as SourceAuthority,
            url: (row.source_url as string | null) ?? undefined,
        },
        sourceUrl: (row.source_url as string | null) ?? undefined,
        sourceText: (row.source_text as string | null) ?? undefined,
        sourceQuote: (row.source_quote as string | null) ?? undefined,
        retrievalDate: new Date(row.retrieval_date as string | Date),
        expiresAt: row.expires_at ? new Date(row.expires_at as string | Date) : undefined,
        freshness: row.freshness as Evidence["freshness"],
        confidence: row.confidence as ConfidenceLevel,
        usedIn: (row.used_in as EntityId[] | null) ?? [],
        verificationStatus: row.verification_status as Evidence["verificationStatus"],
        createdAt: new Date(row.created_at as string | Date),
    };
}

export class PgEvidenceRepository implements EvidenceRepository {
    async create(evidence: Omit<Evidence, "id" | "createdAt">): Promise<Evidence> {
        const result = await query(
            `INSERT INTO finhouse.evidence (
                id, household_id, claim, source_name, source_tier, source_authority,
                source_type, source_url, retrieval_date, freshness, expires_at,
                confidence, source_text, source_quote, used_in, verification_status
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            RETURNING *`,
            [
                randomUUID(), evidence.householdId, evidence.claim, evidence.source.name,
                evidence.source.tier, evidence.source.authority, evidence.source.type,
                evidence.sourceUrl ?? evidence.source.url ?? null, evidence.retrievalDate,
                evidence.freshness, evidence.expiresAt ?? null, evidence.confidence,
                evidence.sourceText ?? null, evidence.sourceQuote ?? null,
                JSON.stringify(evidence.usedIn), evidence.verificationStatus,
            ]
        );
        return mapEvidence(result.rows[0]);
    }

    async findById(id: EntityId): Promise<Evidence | null> {
        const result = await query("SELECT * FROM finhouse.evidence WHERE id = $1", [id]);
        return result.rows[0] ? mapEvidence(result.rows[0]) : null;
    }

    async findByHouseholdId(householdId: EntityId, limit = 100): Promise<Evidence[]> {
        const result = await query(
            "SELECT * FROM finhouse.evidence WHERE household_id = $1 ORDER BY retrieval_date DESC LIMIT $2",
            [householdId, limit]
        );
        return result.rows.map(mapEvidence);
    }

    async findByRecommendationId(recommendationId: EntityId): Promise<Evidence[]> {
        const result = await query(
            "SELECT * FROM finhouse.evidence WHERE used_in @> $1::jsonb ORDER BY retrieval_date DESC",
            [JSON.stringify([recommendationId])]
        );
        return result.rows.map(mapEvidence);
    }

    async findBySource(householdId: EntityId, sourceName: string, sourceTier: string): Promise<Evidence[]> {
        const result = await query(
            `SELECT * FROM finhouse.evidence
             WHERE household_id = $1 AND source_name = $2 AND source_tier = $3
             ORDER BY retrieval_date DESC`,
            [householdId, sourceName, sourceTier]
        );
        return result.rows.map(mapEvidence);
    }

    async linkToRecommendation(evidenceId: EntityId, recommendationId: EntityId): Promise<Evidence> {
        const result = await query(
            `UPDATE finhouse.evidence
             SET used_in = CASE WHEN used_in @> $2::jsonb THEN used_in ELSE used_in || $2::jsonb END
             WHERE id = $1 RETURNING *`,
            [evidenceId, JSON.stringify([recommendationId])]
        );
        if (!result.rows[0]) throw new Error("Evidence not found");
        return mapEvidence(result.rows[0]);
    }

    async findStale(householdId?: EntityId): Promise<Evidence[]> {
        const result = await query(
            `SELECT * FROM finhouse.evidence
             WHERE ($1::uuid IS NULL OR household_id = $1)
               AND (freshness IN ('STALE', 'EXPIRED') OR expires_at <= NOW())
             ORDER BY retrieval_date DESC`,
            [householdId ?? null]
        );
        return result.rows.map(mapEvidence);
    }

    async findByTier(householdId: EntityId, tier: string): Promise<Evidence[]> {
        const result = await query(
            "SELECT * FROM finhouse.evidence WHERE household_id = $1 AND source_tier = $2 ORDER BY retrieval_date DESC",
            [householdId, tier]
        );
        return result.rows.map(mapEvidence);
    }
}
