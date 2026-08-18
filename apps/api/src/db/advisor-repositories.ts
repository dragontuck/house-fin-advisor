/**
 * PostgreSQL implementation of Advisor repositories
 * For conversation, message, workflow state, and tool execution storage
 */

import { query } from "./connection";
import {
    EntityId,
    AdvisorConversation,
    AdvisorMessage,
    AdvisorMessageRole,
    WorkflowState,
    WorkflowStatus,
    ToolExecution,
    KnownActivity,
    ProposedChange,
    WorkflowAssumption,
} from "@house-fin/contracts";
import {
    AdvisorConversationRepository,
    AdvisorMessageRepository,
    WorkflowStateRepository,
    ToolExecutionRepository,
} from "@house-fin/domain";

// Type for database row objects
type DbRow = Record<string, unknown>;

/**
 * PostgreSQL AdvisorConversationRepository
 */
export class PgAdvisorConversationRepository implements AdvisorConversationRepository {
    async create(
        req: Omit<AdvisorConversation, "id" | "createdAt" | "updatedAt">
    ): Promise<AdvisorConversation> {
        const result = await query(
            `INSERT INTO finhouse.advisor_conversations 
             (household_id, member_id, title, status, message_count, last_message_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, household_id, member_id, title, status, current_workflow, current_workflow_id,
                       message_count, last_message_at, created_at, updated_at`,
            [
                req.householdId,
                req.memberId,
                req.title,
                req.status,
                req.messageCount || 0,
                req.lastMessageAt || new Date(),
            ]
        );
        return this.rowToConversation(result.rows[0]);
    }

    async findById(id: EntityId): Promise<AdvisorConversation | null> {
        const result = await query(
            `SELECT * FROM finhouse.advisor_conversations WHERE id = $1`,
            [id]
        );
        if (result.rows.length === 0) return null;
        return this.rowToConversation(result.rows[0]);
    }

    async findByHouseholdId(householdId: EntityId, limit = 50): Promise<AdvisorConversation[]> {
        const result = await query(
            `SELECT * FROM finhouse.advisor_conversations 
             WHERE household_id = $1 AND status = 'ACTIVE'
             ORDER BY last_message_at DESC LIMIT $2`,
            [householdId, limit]
        );
        return result.rows.map((row) => this.rowToConversation(row));
    }

    async update(id: EntityId, changes: Partial<AdvisorConversation>): Promise<AdvisorConversation> {
        const updates: string[] = [];
        const values: unknown[] = [];
        let p = 1;

        if (changes.title !== undefined) {
            updates.push(`title = $${p++}`);
            values.push(changes.title);
        }
        if (changes.status !== undefined) {
            updates.push(`status = $${p++}`);
            values.push(changes.status);
        }
        if (changes.messageCount !== undefined) {
            updates.push(`message_count = $${p++}`);
            values.push(changes.messageCount);
        }
        if (changes.lastMessageAt !== undefined) {
            updates.push(`last_message_at = $${p++}`);
            values.push(changes.lastMessageAt);
        }
        if (changes.currentWorkflow !== undefined) {
            updates.push(`current_workflow = $${p++}`);
            values.push(changes.currentWorkflow);
        }

        updates.push(`updated_at = NOW()`);
        values.push(id);

        const result = await query(
            `UPDATE finhouse.advisor_conversations SET ${updates.join(", ")} 
             WHERE id = $${p} RETURNING *`,
            values
        );
        return this.rowToConversation(result.rows[0]);
    }

    private rowToConversation(row: DbRow): AdvisorConversation {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            memberId: row.member_id as EntityId,
            title: row.title as string,
            status: row.status as "ACTIVE" | "ARCHIVED" | "DELETED",
            currentWorkflow: row.current_workflow as any,
            currentWorkflowId: row.current_workflow_id as EntityId | undefined,
            messageCount: row.message_count as number,
            lastMessageAt: row.last_message_at as Date,
            createdAt: row.created_at as Date,
            updatedAt: row.updated_at as Date,
        };
    }
}

/**
 * PostgreSQL AdvisorMessageRepository
 */
export class PgAdvisorMessageRepository implements AdvisorMessageRepository {
    async create(
        req: Omit<AdvisorMessage, "id" | "createdAt">
    ): Promise<AdvisorMessage> {
        const result = await query(
            `INSERT INTO finhouse.advisor_messages 
             (conversation_id, role, content, metadata)
             VALUES ($1, $2, $3, $4)
             RETURNING id, conversation_id, role, content, metadata, created_at`,
            [req.conversationId, req.role, req.content, req.metadata ? JSON.stringify(req.metadata) : null]
        );
        return this.rowToMessage(result.rows[0]);
    }

    async findById(id: EntityId): Promise<AdvisorMessage | null> {
        const result = await query(
            `SELECT * FROM finhouse.advisor_messages WHERE id = $1`,
            [id]
        );
        if (result.rows.length === 0) return null;
        return this.rowToMessage(result.rows[0]);
    }

    async findByConversationId(
        conversationId: EntityId,
        limit = 50,
        offset = 0
    ): Promise<AdvisorMessage[]> {
        const result = await query(
            `SELECT * FROM finhouse.advisor_messages 
             WHERE conversation_id = $1
             ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
            [conversationId, limit, offset]
        );
        return result.rows.map((row) => this.rowToMessage(row));
    }

    async findByRole(conversationId: EntityId, role: AdvisorMessageRole): Promise<AdvisorMessage[]> {
        const result = await query(
            `SELECT * FROM finhouse.advisor_messages 
             WHERE conversation_id = $1 AND role = $2
             ORDER BY created_at ASC`,
            [conversationId, role]
        );
        return result.rows.map((row) => this.rowToMessage(row));
    }

    private rowToMessage(row: DbRow): AdvisorMessage {
        return {
            id: row.id as EntityId,
            conversationId: row.conversation_id as EntityId,
            role: row.role as AdvisorMessageRole,
            content: row.content as string,
            metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
            createdAt: row.created_at as Date,
        };
    }
}

/**
 * PostgreSQL WorkflowStateRepository
 */
export class PgWorkflowStateRepository implements WorkflowStateRepository {
    async create(
        req: Omit<WorkflowState, "id" | "createdAt" | "updatedAt">
    ): Promise<WorkflowState> {
        const result = await query(
            `INSERT INTO finhouse.advisor_workflow_states 
             (household_id, conversation_id, workflow_type, status, planning_period, 
              current_scenario, known_activities, proposed_changes, assumptions, pending_questions,
              linked_financial_snapshot_id, linked_snapshot_version)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING id, household_id, conversation_id, workflow_type, status, planning_period,
                       current_scenario, known_activities, proposed_changes, assumptions, pending_questions,
                       linked_financial_snapshot_id, linked_snapshot_version, created_at, updated_at, completed_at`,
            [
                req.householdId,
                req.conversationId || null,
                req.workflowType,
                req.status,
                req.planningPeriod ? JSON.stringify(req.planningPeriod) : null,
                req.currentScenario ? JSON.stringify(req.currentScenario) : null,
                req.knownActivities ? JSON.stringify(req.knownActivities) : null,
                req.proposedChanges ? JSON.stringify(req.proposedChanges) : null,
                req.assumptions ? JSON.stringify(req.assumptions) : null,
                req.pendingQuestions ? JSON.stringify(req.pendingQuestions) : null,
                req.linkedFinancialSnapshotId || null,
                req.linkedSnapshotVersion || null,
            ]
        );
        return this.rowToWorkflow(result.rows[0]);
    }

    async findById(id: EntityId): Promise<WorkflowState | null> {
        const result = await query(
            `SELECT * FROM finhouse.advisor_workflow_states WHERE id = $1`,
            [id]
        );
        if (result.rows.length === 0) return null;
        return this.rowToWorkflow(result.rows[0]);
    }

    async findByConversationId(conversationId: EntityId): Promise<WorkflowState[]> {
        const result = await query(
            `SELECT * FROM finhouse.advisor_workflow_states 
             WHERE conversation_id = $1
             ORDER BY created_at DESC`,
            [conversationId]
        );
        return result.rows.map((row) => this.rowToWorkflow(row));
    }

    async update(id: EntityId, changes: Partial<WorkflowState>): Promise<WorkflowState> {
        const updates: string[] = [];
        const values: unknown[] = [];
        let p = 1;

        if (changes.status !== undefined) {
            updates.push(`status = $${p++}`);
            values.push(changes.status);
        }
        if (changes.planningPeriod !== undefined) {
            updates.push(`planning_period = $${p++}`);
            values.push(changes.planningPeriod ? JSON.stringify(changes.planningPeriod) : null);
        }
        if (changes.currentScenario !== undefined) {
            updates.push(`current_scenario = $${p++}`);
            values.push(changes.currentScenario ? JSON.stringify(changes.currentScenario) : null);
        }
        if (changes.knownActivities !== undefined) {
            updates.push(`known_activities = $${p++}`);
            values.push(changes.knownActivities ? JSON.stringify(changes.knownActivities) : null);
        }
        if (changes.proposedChanges !== undefined) {
            updates.push(`proposed_changes = $${p++}`);
            values.push(changes.proposedChanges ? JSON.stringify(changes.proposedChanges) : null);
        }
        if (changes.assumptions !== undefined) {
            updates.push(`assumptions = $${p++}`);
            values.push(changes.assumptions ? JSON.stringify(changes.assumptions) : null);
        }
        if (changes.pendingQuestions !== undefined) {
            updates.push(`pending_questions = $${p++}`);
            values.push(changes.pendingQuestions ? JSON.stringify(changes.pendingQuestions) : null);
        }
        if (changes.completedAt !== undefined) {
            updates.push(`completed_at = $${p++}`);
            values.push(changes.completedAt);
        }

        updates.push(`updated_at = NOW()`);
        values.push(id);

        const result = await query(
            `UPDATE finhouse.advisor_workflow_states SET ${updates.join(", ")} 
             WHERE id = $${p} RETURNING *`,
            values
        );
        return this.rowToWorkflow(result.rows[0]);
    }

    async findActive(householdId: EntityId): Promise<WorkflowState[]> {
        const result = await query(
            `SELECT * FROM finhouse.advisor_workflow_states 
             WHERE household_id = $1 AND status IN ('ACTIVE', 'WAITING_FOR_USER', 'READY_FOR_REVIEW')
             ORDER BY updated_at DESC`,
            [householdId]
        );
        return result.rows.map((row) => this.rowToWorkflow(row));
    }

    private rowToWorkflow(row: DbRow): WorkflowState {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            conversationId: (row.conversation_id as EntityId | null) || undefined,
            workflowType: row.workflow_type as any,
            planningPeriod: row.planning_period ? JSON.parse(row.planning_period as string) : undefined,
            currentScenario: row.current_scenario ? JSON.parse(row.current_scenario as string) : undefined,
            knownActivities: row.known_activities ? JSON.parse(row.known_activities as string) : undefined,
            proposedChanges: row.proposed_changes ? JSON.parse(row.proposed_changes as string) : undefined,
            assumptions: row.assumptions ? JSON.parse(row.assumptions as string) : undefined,
            pendingQuestions: row.pending_questions ? JSON.parse(row.pending_questions as string) : undefined,
            status: row.status as WorkflowStatus,
            linkedFinancialSnapshotId: (row.linked_financial_snapshot_id as EntityId | null) || undefined,
            linkedSnapshotVersion: row.linked_snapshot_version as number | undefined,
            createdAt: row.created_at as Date,
            updatedAt: row.updated_at as Date,
            completedAt: row.completed_at as Date | undefined,
        };
    }
}

/**
 * PostgreSQL ToolExecutionRepository
 */
export class PgToolExecutionRepository implements ToolExecutionRepository {
    async create(
        req: Omit<ToolExecution, "id" | "executedAt">
    ): Promise<ToolExecution> {
        const result = await query(
            `INSERT INTO finhouse.advisor_tool_executions 
             (conversation_id, message_id, tool_name, input_params, result, error_message, duration_ms, correlation_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, conversation_id, message_id, tool_name, input_params, result, error_message, 
                       duration_ms, executed_at, correlation_id`,
            [
                req.conversationId,
                req.messageId,
                req.toolName,
                JSON.stringify(req.inputParams),
                req.result ? JSON.stringify(req.result) : null,
                req.errorMessage,
                req.durationMs,
                req.correlationId,
            ]
        );
        return this.rowToExecution(result.rows[0]);
    }

    async findById(id: EntityId): Promise<ToolExecution | null> {
        const result = await query(
            `SELECT * FROM finhouse.advisor_tool_executions WHERE id = $1`,
            [id]
        );
        if (result.rows.length === 0) return null;
        return this.rowToExecution(result.rows[0]);
    }

    async findByConversationId(conversationId: EntityId): Promise<ToolExecution[]> {
        const result = await query(
            `SELECT * FROM finhouse.advisor_tool_executions 
             WHERE conversation_id = $1
             ORDER BY executed_at ASC`,
            [conversationId]
        );
        return result.rows.map((row) => this.rowToExecution(row));
    }

    async findByMessageId(messageId: EntityId): Promise<ToolExecution[]> {
        const result = await query(
            `SELECT * FROM finhouse.advisor_tool_executions 
             WHERE message_id = $1
             ORDER BY executed_at ASC`,
            [messageId]
        );
        return result.rows.map((row) => this.rowToExecution(row));
    }

    async findByCorrelationId(correlationId: EntityId): Promise<ToolExecution[]> {
        const result = await query(
            `SELECT * FROM finhouse.advisor_tool_executions 
             WHERE correlation_id = $1
             ORDER BY executed_at ASC`,
            [correlationId]
        );
        return result.rows.map((row) => this.rowToExecution(row));
    }

    private rowToExecution(row: DbRow): ToolExecution {
        return {
            id: row.id as EntityId,
            conversationId: row.conversation_id as EntityId,
            messageId: row.message_id as EntityId,
            toolName: row.tool_name as string,
            inputParams: JSON.parse(row.input_params as string),
            result: row.result ? JSON.parse(row.result as string) : undefined,
            errorMessage: row.error_message as string | undefined,
            durationMs: row.duration_ms as number,
            executionVersion: 1,
            correlationId: row.correlation_id as EntityId,
            executedAt: row.executed_at as Date,
        };
    }
}
