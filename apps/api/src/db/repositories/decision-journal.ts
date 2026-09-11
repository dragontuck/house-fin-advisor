import {
    DecisionJournalDecision,
    DecisionJournalEntry,
    DecisionJournalRecord,
    EntityId,
    RecordDecisionJournalDecisionRequest,
} from "@house-fin/contracts";
import { query } from "../connection";

type DbRow = Record<string, unknown>;

function mapEntry(row: DbRow): DecisionJournalEntry {
    return {
        recommendationId: row.recommendation_id as EntityId,
        correlationId: row.correlation_id as EntityId,
        householdId: row.household_id as EntityId,
        memberId: row.member_id as EntityId,
        conversationId: (row.conversation_id as EntityId | null) ?? undefined,
        workflowType: row.workflow_type as DecisionJournalEntry["workflowType"],
        question: row.question as string,
        currentFinancialState: row.current_financial_state as Record<string, unknown>,
        financialSnapshotId: (row.financial_snapshot_id as EntityId | null) ?? undefined,
        financialSnapshotVersion: (row.financial_snapshot_version as number | null) ?? undefined,
        householdPolicyVersion: (row.household_policy_version as number | null) ?? undefined,
        scenarios: row.scenarios as DecisionJournalEntry["scenarios"],
        evidence: row.evidence as DecisionJournalEntry["evidence"],
        recommendation: row.recommendation as DecisionJournalEntry["recommendation"],
        alternatives: row.alternatives as string[],
        validation: row.validation as DecisionJournalEntry["validation"],
        confidence: row.confidence as DecisionJournalEntry["confidence"],
        personaUsed: row.persona_used as DecisionJournalEntry["personaUsed"],
        approvalState: "PENDING",
        generatedAt: row.generated_at as Date,
    };
}

function mapDecision(row: DbRow): DecisionJournalDecision {
    return {
        id: row.id as EntityId,
        recommendationId: row.recommendation_id as EntityId,
        householdId: row.household_id as EntityId,
        memberId: row.member_id as EntityId,
        decision: row.decision as DecisionJournalDecision["decision"],
        userChoice: (row.user_choice as string | null) ?? undefined,
        notes: (row.notes as string | null) ?? undefined,
        decidedAt: row.decided_at as Date,
    };
}

export class PgDecisionJournalRepository {
    async recordGeneration(entry: DecisionJournalEntry): Promise<DecisionJournalEntry> {
        const result = await query(
            `INSERT INTO decision_journal_entries (
                recommendation_id, correlation_id, household_id, member_id, conversation_id,
                workflow_type, question, current_financial_state, financial_snapshot_id,
                financial_snapshot_version, household_policy_version, scenarios, evidence,
                recommendation, alternatives, validation, confidence, persona_used,
                approval_state, generated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
            )
            ON CONFLICT (correlation_id) DO NOTHING
            RETURNING *`,
            [
                entry.recommendationId,
                entry.correlationId,
                entry.householdId,
                entry.memberId,
                entry.conversationId ?? null,
                entry.workflowType,
                entry.question,
                JSON.stringify(entry.currentFinancialState),
                entry.financialSnapshotId ?? null,
                entry.financialSnapshotVersion ?? null,
                entry.householdPolicyVersion ?? null,
                JSON.stringify(entry.scenarios),
                JSON.stringify(entry.evidence),
                JSON.stringify(entry.recommendation),
                JSON.stringify(entry.alternatives),
                JSON.stringify(entry.validation),
                JSON.stringify(entry.confidence),
                JSON.stringify(entry.personaUsed),
                entry.approvalState,
                entry.generatedAt,
            ]
        );

        if (result.rows.length > 0) return mapEntry(result.rows[0]);
        const existing = await this.findEntry(entry.recommendationId, entry.householdId);
        if (!existing) throw new Error("Decision journal generation could not be recorded");
        return existing;
    }

    async findByRecommendationId(
        recommendationId: EntityId,
        householdId: EntityId
    ): Promise<DecisionJournalRecord | null> {
        const entry = await this.findEntry(recommendationId, householdId);
        if (!entry) return null;

        const decisionsResult = await query(
            `SELECT * FROM decision_journal_decisions
             WHERE recommendation_id = $1 AND household_id = $2
             ORDER BY decided_at ASC`,
            [recommendationId, householdId]
        );
        const decisions = decisionsResult.rows.map(mapDecision);
        return {
            entry,
            decisions,
            currentApprovalState: decisions.at(-1)?.decision ?? entry.approvalState,
        };
    }

    async findByConversationId(
        conversationId: EntityId,
        householdId: EntityId
    ): Promise<DecisionJournalRecord[]> {
        const result = await query(
            `SELECT recommendation_id FROM decision_journal_entries
             WHERE conversation_id = $1 AND household_id = $2
             ORDER BY generated_at ASC`,
            [conversationId, householdId]
        );
        const records = await Promise.all(
            result.rows.map((row) => this.findByRecommendationId(row.recommendation_id as EntityId, householdId))
        );
        return records.filter((record): record is DecisionJournalRecord => record !== null);
    }

    async findRelevantByHouseholdId(
        householdId: EntityId,
        question: string,
        limit = 20
    ): Promise<DecisionJournalRecord[]> {
        const result = await query(
            `SELECT recommendation_id FROM decision_journal_entries
             WHERE household_id = $1
               AND to_tsvector('english', question || ' ' || recommendation::text)
                   @@ websearch_to_tsquery('english', $2)
             ORDER BY ts_rank(
                 to_tsvector('english', question || ' ' || recommendation::text),
                 websearch_to_tsquery('english', $2)
             ) DESC, generated_at DESC
             LIMIT $3`,
            [householdId, question, limit]
        );
        const records = await Promise.all(
            result.rows.map((row) => this.findByRecommendationId(row.recommendation_id as EntityId, householdId))
        );
        return records.filter((record): record is DecisionJournalRecord => record !== null);
    }

    async recordDecision(
        recommendationId: EntityId,
        householdId: EntityId,
        memberId: EntityId,
        request: RecordDecisionJournalDecisionRequest
    ): Promise<DecisionJournalDecision> {
        const result = await query(
            `INSERT INTO decision_journal_decisions (
                recommendation_id, household_id, member_id, decision, user_choice, notes
            )
            SELECT recommendation_id, household_id, $3, $4, $5, $6
            FROM decision_journal_entries
            WHERE recommendation_id = $1 AND household_id = $2
            RETURNING *`,
            [
                recommendationId,
                householdId,
                memberId,
                request.decision,
                request.userChoice ?? null,
                request.notes ?? null,
            ]
        );
        if (result.rows.length === 0) throw new Error("Decision journal entry not found");
        return mapDecision(result.rows[0]);
    }

    private async findEntry(
        recommendationId: EntityId,
        householdId: EntityId
    ): Promise<DecisionJournalEntry | null> {
        const result = await query(
            `SELECT * FROM decision_journal_entries
             WHERE recommendation_id = $1 AND household_id = $2`,
            [recommendationId, householdId]
        );
        return result.rows.length === 0 ? null : mapEntry(result.rows[0]);
    }
}