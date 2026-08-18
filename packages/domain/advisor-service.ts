/**
 * AdvisorService — High-level orchestration for conversational financial planning workflows.
 *
 * Responsibilities:
 * - Classify user intent into AdvisorWorkflow types
 * - Initialize and manage WorkflowState throughout multi-turn interactions
 * - Coordinate calls to financial domain services (budget, cash flow, debt, etc.)
 * - Track conversation history with immutable message append-only log
 * - Audit trail of all tool executions
 *
 * Rules:
 * - Conversation history is immutable (append-only for audit)
 * - WorkflowState is mutable (tracks current planning/scenario state)
 * - Financial calculations always come from deterministic domain services
 * - LLM is never the system of record
 * - Every AI response must carry provenance (facts vs. assumptions vs. analysis)
 * - Workflow approval is explicit (never silent state changes)
 */

import {
    EntityId,
    AdvisorConversation,
    AdvisorMessage,
    AdvisorMessageRole,
    AdvisorWorkflow,
    WorkflowState,
    WorkflowStatus,
    AIResponse,
    ToolExecution,
    KnownActivity,
    CreateAdvisorConversationRequest,
    AddAdvisorMessageRequest,
    ApproveWorkflowRequest,
} from "@house-fin/contracts";

/**
 * Repository interface for advisor conversations
 */
export interface AdvisorConversationRepository {
    create(
        req: Omit<AdvisorConversation, "id" | "createdAt" | "updatedAt">
    ): Promise<AdvisorConversation>;
    findById(id: EntityId): Promise<AdvisorConversation | null>;
    findByHouseholdId(householdId: EntityId, limit?: number): Promise<AdvisorConversation[]>;
    update(id: EntityId, changes: Partial<AdvisorConversation>): Promise<AdvisorConversation>;
}

/**
 * Repository interface for advisor messages
 */
export interface AdvisorMessageRepository {
    create(
        req: Omit<AdvisorMessage, "id" | "createdAt">
    ): Promise<AdvisorMessage>;
    findById(id: EntityId): Promise<AdvisorMessage | null>;
    findByConversationId(
        conversationId: EntityId,
        limit?: number,
        offset?: number
    ): Promise<AdvisorMessage[]>;
    findByRole(
        conversationId: EntityId,
        role: AdvisorMessageRole
    ): Promise<AdvisorMessage[]>;
}

/**
 * Repository interface for workflow states
 */
export interface WorkflowStateRepository {
    create(
        req: Omit<WorkflowState, "id" | "createdAt" | "updatedAt">
    ): Promise<WorkflowState>;
    findById(id: EntityId): Promise<WorkflowState | null>;
    findByConversationId(conversationId: EntityId): Promise<WorkflowState[]>;
    update(id: EntityId, changes: Partial<WorkflowState>): Promise<WorkflowState>;
    findActive(householdId: EntityId): Promise<WorkflowState[]>;
}

/**
 * Repository interface for tool executions
 */
export interface ToolExecutionRepository {
    create(
        req: Omit<ToolExecution, "id" | "executedAt">
    ): Promise<ToolExecution>;
    findById(id: EntityId): Promise<ToolExecution | null>;
    findByConversationId(conversationId: EntityId): Promise<ToolExecution[]>;
    findByMessageId(messageId: EntityId): Promise<ToolExecution[]>;
    findByCorrelationId(correlationId: EntityId): Promise<ToolExecution[]>;
}

/**
 * Advisor service for managing conversational workflows
 */
export class AdvisorService {
    constructor(
        private conversationRepo: AdvisorConversationRepository,
        private messageRepo: AdvisorMessageRepository,
        private workflowRepo: WorkflowStateRepository,
        private toolExecutionRepo: ToolExecutionRepository
    ) { }

    /**
     * Create a new conversation
     */
    async createConversation(
        req: CreateAdvisorConversationRequest
    ): Promise<AdvisorConversation> {
        const conversation = await this.conversationRepo.create({
            householdId: req.householdId,
            memberId: req.memberId,
            title: req.title || "Financial Planning Discussion",
            status: "ACTIVE",
            messageCount: 0,
            lastMessageAt: new Date(),
        });

        // If initial message provided, add it
        if (req.initialMessage) {
            await this.messageRepo.create({
                conversationId: conversation.id,
                role: AdvisorMessageRole.USER,
                content: req.initialMessage,
            });

            // Increment message count
            conversation.messageCount = 1;
            conversation.lastMessageAt = new Date();
            await this.conversationRepo.update(conversation.id, conversation);
        }

        return conversation;
    }

    /**
     * Add a message to a conversation
     */
    async addMessage(
        req: AddAdvisorMessageRequest
    ): Promise<AdvisorMessage> {
        const message = await this.messageRepo.create({
            conversationId: req.conversationId,
            role: req.role,
            content: req.content,
            metadata: req.metadata,
        });

        // Update conversation metadata
        const conversation = await this.conversationRepo.findById(req.conversationId);
        if (conversation) {
            conversation.messageCount += 1;
            conversation.lastMessageAt = new Date();
            await this.conversationRepo.update(conversation.id, conversation);
        }

        return message;
    }

    /**
     * Record a tool execution
     */
    async recordToolExecution(
        conversationId: EntityId,
        messageId: EntityId,
        toolName: string,
        inputParams: Record<string, unknown>,
        result: Record<string, unknown> | undefined,
        errorMessage: string | undefined,
        durationMs: number,
        correlationId: EntityId
    ): Promise<ToolExecution> {
        return this.toolExecutionRepo.create({
            conversationId,
            messageId,
            toolName,
            inputParams,
            result,
            errorMessage,
            durationMs,
            executionVersion: 1,
            correlationId,
        });
    }

    /**
     * Create a new workflow (e.g., budget creation, scenario analysis)
     */
    async startWorkflow(
        householdId: EntityId,
        workflowType: AdvisorWorkflow,
        conversationId?: EntityId
    ): Promise<WorkflowState> {
        return this.workflowRepo.create({
            householdId,
            conversationId,
            workflowType,
            status: WorkflowStatus.ACTIVE,
        });
    }

    /**
     * Update workflow state (e.g., add known activities, update proposed changes)
     */
    async updateWorkflow(
        workflowId: EntityId,
        changes: Partial<WorkflowState>
    ): Promise<WorkflowState> {
        return this.workflowRepo.update(workflowId, changes);
    }

    /**
     * Approve a workflow (e.g., user approves a proposed budget)
     */
    async approveWorkflow(
        workflowId: EntityId,
        conversationId: EntityId
    ): Promise<WorkflowState> {
        const workflow = await this.workflowRepo.findById(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        const updated = await this.workflowRepo.update(workflowId, {
            status: WorkflowStatus.APPROVED,
            completedAt: new Date(),
        });

        // Add system message to conversation
        await this.messageRepo.create({
            conversationId,
            role: AdvisorMessageRole.SYSTEM,
            content: `Workflow ${workflow.workflowType} approved.`,
            metadata: { workflowId },
        });

        return updated;
    }

    /**
     * Cancel a workflow
     */
    async cancelWorkflow(
        workflowId: EntityId,
        conversationId: EntityId
    ): Promise<WorkflowState> {
        const workflow = await this.workflowRepo.findById(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        const updated = await this.workflowRepo.update(workflowId, {
            status: WorkflowStatus.CANCELLED,
            completedAt: new Date(),
        });

        // Add system message
        await this.messageRepo.create({
            conversationId,
            role: AdvisorMessageRole.SYSTEM,
            content: `Workflow ${workflow.workflowType} cancelled.`,
            metadata: { workflowId },
        });

        return updated;
    }

    /**
     * Get full conversation history (immutable append-only log)
     */
    async getConversationHistory(
        conversationId: EntityId
    ): Promise<AdvisorMessage[]> {
        return this.messageRepo.findByConversationId(conversationId);
    }

    /**
     * Get all active workflows for a household
     */
    async getActiveWorkflows(householdId: EntityId): Promise<WorkflowState[]> {
        return this.workflowRepo.findActive(householdId);
    }

    /**
     * Get tool execution audit trail for a conversation
     */
    async getToolExecutionHistory(conversationId: EntityId): Promise<ToolExecution[]> {
        return this.toolExecutionRepo.findByConversationId(conversationId);
    }
}

/**
 * Factory function to create AdvisorService
 */
export function createAdvisorService(
    conversationRepo: AdvisorConversationRepository,
    messageRepo: AdvisorMessageRepository,
    workflowRepo: WorkflowStateRepository,
    toolExecutionRepo: ToolExecutionRepository
): AdvisorService {
    return new AdvisorService(conversationRepo, messageRepo, workflowRepo, toolExecutionRepo);
}
