/**
 * AIAuditLogRepository — persists metadata-only records of AI advisor interactions and
 * computes the operational metrics derived from them (plus related tables).
 *
 * Never stores or returns raw financial payloads - see packages/db/migrations/012_add_ai_audit_log.sql.
 */

import { query } from "../connection";
import {
    EntityId,
    AIAuditLogEntry,
    StoredAIAuditLogEntry,
    AIMetricsSnapshot,
    BudgetProposalStatus,
} from "@house-fin/contracts";

type DbRow = Record<string, unknown>;

function mapRow(row: DbRow): StoredAIAuditLogEntry {
    return {
        id: row.id as EntityId,
        correlationId: row.correlation_id as EntityId,
        conversationId: (row.conversation_id as EntityId | null) ?? undefined,
        householdId: row.household_id as EntityId,
        memberId: row.member_id as EntityId,
        workflow: row.workflow as AIAuditLogEntry["workflow"],
        intent: row.intent as AIAuditLogEntry["intent"],
        toolsRequested: (row.tools_requested as string[]) ?? [],
        toolsExecuted: (row.tools_executed as string[]) ?? [],
        toolVersions: (row.tool_versions as Record<string, number>) ?? {},
        financialSnapshotVersion: (row.financial_snapshot_version as number | null) ?? undefined,
        provider: (row.provider as string | null) ?? undefined,
        model: (row.model as string | null) ?? undefined,
        validationStatus: row.validation_status as AIAuditLogEntry["validationStatus"],
        approvalStatus: row.approval_status as AIAuditLogEntry["approvalStatus"],
        success: row.success as boolean,
        failureCategory: (row.failure_category as string | null) ?? undefined,
        totalDurationMs: row.total_duration_ms as number,
        createdAt: row.created_at as Date,
    };
}

export class PgAIAuditLogRepository {
    /** Records one audit entry. Append-only - callers never update or delete rows. */
    async record(entry: AIAuditLogEntry): Promise<StoredAIAuditLogEntry> {
        const result = await query(
            `INSERT INTO ai_audit_log (
                correlation_id, conversation_id, household_id, member_id,
                workflow, intent, tools_requested, tools_executed, tool_versions,
                financial_snapshot_version, provider, model,
                validation_status, approval_status, success, failure_category, total_duration_ms
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING id, correlation_id, conversation_id, household_id, member_id,
                      workflow, intent, tools_requested, tools_executed, tool_versions,
                      financial_snapshot_version, provider, model,
                      validation_status, approval_status, success, failure_category,
                      total_duration_ms, created_at`,
            [
                entry.correlationId,
                entry.conversationId ?? null,
                entry.householdId,
                entry.memberId,
                entry.workflow,
                entry.intent,
                JSON.stringify(entry.toolsRequested),
                JSON.stringify(entry.toolsExecuted),
                JSON.stringify(entry.toolVersions),
                entry.financialSnapshotVersion ?? null,
                entry.provider ?? null,
                entry.model ?? null,
                entry.validationStatus,
                entry.approvalStatus,
                entry.success,
                entry.failureCategory ?? null,
                entry.totalDurationMs,
            ]
        );
        return mapRow(result.rows[0]);
    }

    /** All audit entries for a conversation, oldest first - the "what did the AI do" trail. */
    async findByConversationId(conversationId: EntityId): Promise<StoredAIAuditLogEntry[]> {
        const result = await query(
            `SELECT id, correlation_id, conversation_id, household_id, member_id,
                    workflow, intent, tools_requested, tools_executed, tool_versions,
                    financial_snapshot_version, provider, model,
                    validation_status, approval_status, success, failure_category,
                    total_duration_ms, created_at
             FROM ai_audit_log
             WHERE conversation_id = $1
             ORDER BY created_at ASC`,
            [conversationId]
        );
        return result.rows.map(mapRow);
    }

    async findByCorrelationId(correlationId: EntityId): Promise<StoredAIAuditLogEntry[]> {
        const result = await query(
            `SELECT id, correlation_id, conversation_id, household_id, member_id,
                    workflow, intent, tools_requested, tools_executed, tool_versions,
                    financial_snapshot_version, provider, model,
                    validation_status, approval_status, success, failure_category,
                    total_duration_ms, created_at
             FROM ai_audit_log
             WHERE correlation_id = $1
             ORDER BY created_at ASC`,
            [correlationId]
        );
        return result.rows.map(mapRow);
    }

    /**
     * Computes the operational metrics for a time range across the audit log and the tables it
     * references. Every rate defaults to 0 when its denominator is 0 (never NaN/null).
     */
    async getMetrics(periodStart: Date, periodEnd: Date): Promise<AIMetricsSnapshot> {
        const auditStats = await query(
            `SELECT
                COUNT(*) AS request_count,
                COALESCE(AVG(total_duration_ms), 0) AS avg_duration_ms,
                COUNT(*) FILTER (WHERE failure_category LIKE 'LLM_%') AS llm_failures,
                COUNT(*) FILTER (WHERE validation_status = 'FAILED_SAFE_FALLBACK') AS validation_failures,
                COUNT(*) FILTER (WHERE validation_status != 'NOT_APPLICABLE') AS validation_attempts
             FROM ai_audit_log
             WHERE created_at >= $1 AND created_at <= $2`,
            [periodStart, periodEnd]
        );

        const toolStats = await query(
            `SELECT
                COUNT(*) FILTER (WHERE error_message IS NULL) AS tool_successes,
                COUNT(*) AS tool_total
             FROM advisor_tool_executions
             WHERE executed_at >= $1 AND executed_at <= $2`,
            [periodStart, periodEnd]
        );

        // Filtered by updated_at (last transition) rather than created_at, since we want workflows
        // that reached a terminal state within the window, not merely started within it.
        const workflowStats = await query(
            `SELECT
                COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
                COUNT(*) FILTER (WHERE status IN ('COMPLETED', 'CANCELLED')) AS terminal,
                COUNT(*) FILTER (WHERE status = 'CANCELLED' AND workflow_type LIKE 'BUDGET_%') AS budget_abandoned,
                COUNT(*) FILTER (WHERE status IN ('COMPLETED', 'CANCELLED') AND workflow_type LIKE 'BUDGET_%') AS budget_terminal
             FROM advisor_workflow_states
             WHERE updated_at >= $1 AND updated_at <= $2`,
            [periodStart, periodEnd]
        );

        // Filtered by updated_at since we want proposals decided within the window, not merely
        // proposed within it.
        const proposalStats = await query(
            `SELECT
                COUNT(*) FILTER (WHERE status IN ($1, $2)) AS approved,
                COUNT(*) FILTER (WHERE status != $3) AS decided
             FROM budget_proposals
             WHERE updated_at >= $4 AND updated_at <= $5`,
            [
                BudgetProposalStatus.APPROVED,
                BudgetProposalStatus.PERSISTED,
                BudgetProposalStatus.PROPOSED,
                periodStart,
                periodEnd,
            ]
        );

        const audit = auditStats.rows[0];
        const tools = toolStats.rows[0];
        const workflows = workflowStats.rows[0];
        const proposals = proposalStats.rows[0];

        const requestCount = Number(audit.request_count);
        const toolTotal = Number(tools.tool_total);
        const workflowTerminal = Number(workflows.terminal);
        const budgetTerminal = Number(workflows.budget_terminal);
        const proposalsDecided = Number(proposals.decided);

        const safeDivide = (numerator: number, denominator: number): number =>
            denominator === 0 ? 0 : numerator / denominator;

        return {
            periodStart,
            periodEnd,
            aiRequestCount: requestCount,
            toolSuccessRate: safeDivide(Number(tools.tool_successes), toolTotal),
            toolFailureRate: safeDivide(toolTotal - Number(tools.tool_successes), toolTotal),
            workflowCompletionRate: safeDivide(Number(workflows.completed), workflowTerminal),
            llmFailureRate: safeDivide(Number(audit.llm_failures), requestCount),
            responseValidationFailureRate: safeDivide(
                Number(audit.validation_failures),
                Number(audit.validation_attempts)
            ),
            proposalApprovalRate: safeDivide(Number(proposals.approved), proposalsDecided),
            budgetWorkflowAbandonmentRate: safeDivide(Number(workflows.budget_abandoned), budgetTerminal),
            averageResponseTimeMs: Number(audit.avg_duration_ms),
        };
    }
}

export function createAIAuditLogRepository(): PgAIAuditLogRepository {
    return new PgAIAuditLogRepository();
}
