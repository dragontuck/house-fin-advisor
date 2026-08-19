/**
 * AI Orchestrator Routes
 * Handles tool planning, execution, privacy filtering, and LLM interaction
 *
 * Endpoint: POST /conversations/:conversationId/orchestrate
 * Processes user message through the complete AI pipeline
 */

import { Request, Response, NextFunction } from "express";
import { RouteContext, RouteRegistrar } from "./types";
import { EntityId, AdvisorMessageRole, AdvisorWorkflow } from "@house-fin/contracts";
import {
    AIOrchestrator,
    getAIOrchestrator,
    OrchestratorRequest,
    OrchestratorResponse,
} from "@house-fin/ai";

class OrchestratorError extends Error {
    constructor(
        public statusCode: number,
        public userMessage: string,
        public errorCode: string,
        message?: string
    ) {
        super(message || userMessage);
        this.name = "OrchestratorError";
    }
}

/**
 * Register orchestrator routes
 */
export const registerOrchestratorRoutes: RouteRegistrar = (context: RouteContext) => {
    const { app, advisorService, conversationRepo } = context;

    /**
     * POST /conversations/:conversationId/orchestrate
     *
     * Complete AI pipeline:
     * 1. Validate conversation and classification
     * 2. Plan which tools to execute
     * 3. Execute tools with authorization
     * 4. Build financial context
     * 5. Sanitize through privacy gateway
     * 6. Call LLM
     * 7. Validate response
     * 8. Store message and return
     */
    app.post(
        "/conversations/:conversationId/orchestrate",
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { conversationId } = req.params;
                const householdId = req.context!.householdId;
                const correlationId = req.context!.correlationId;
                const { workflowType, financialContext } = req.body;

                if (!workflowType) {
                    throw new OrchestratorError(
                        400,
                        "Workflow type is required",
                        "MISSING_WORKFLOW_TYPE"
                    );
                }

                // Verify conversation belongs to household
                const conversation = await conversationRepo.findById(conversationId as EntityId);
                if (!conversation || conversation.householdId !== householdId) {
                    throw new OrchestratorError(403, "Not authorized", "UNAUTHORIZED");
                }

                // Get the member ID from context (would come from auth)
                // For now, use placeholder - should come from JWT/session
                const memberId = req.headers["x-member-id"] as string || "default-member";
                const isHouseholdOwner = req.headers["x-is-owner"] === "true" || false;

                // Get the latest user message for context
                const messages = await advisorService.getConversationHistory(
                    conversationId as EntityId
                );
                const lastUserMessage = messages
                    .reverse()
                    .find(m => m.role === AdvisorMessageRole.USER);

                if (!lastUserMessage) {
                    throw new OrchestratorError(
                        400,
                        "No user message found in conversation",
                        "NO_USER_MESSAGE"
                    );
                }

                // Prepare orchestrator request
                const orchestratorRequest: OrchestratorRequest = {
                    correlationId: correlationId as EntityId,
                    userMessage: lastUserMessage.content,
                    workflowType: workflowType as AdvisorWorkflow,
                    householdId: householdId as EntityId,
                    memberId: memberId as EntityId,
                    isHouseholdOwner,
                    conversationId: conversationId as EntityId,
                    financialContext: financialContext || {},
                };

                // Get orchestrator instance and process request
                const orchestrator = getAIOrchestrator();
                const orchestratorResponse = await orchestrator.processRequest(orchestratorRequest);

                // Check if processing was successful
                if (!orchestratorResponse.success) {
                    throw new OrchestratorError(
                        500,
                        "Failed to process request through orchestrator",
                        "ORCHESTRATION_FAILED",
                        orchestratorResponse.error
                    );
                }

                // Store the assistant message in conversation
                const assistantMessage = await advisorService.addMessage({
                    conversationId: conversationId as EntityId,
                    role: AdvisorMessageRole.ASSISTANT,
                    content: orchestratorResponse.assistantMessage,
                    metadata: {
                        orchestratorMetadata: orchestratorResponse.metadata,
                        toolsExecuted: orchestratorResponse.toolResults.map(r => ({
                            toolName: r.toolName,
                            success: r.success,
                            sequence: r.sequence,
                        })),
                    },
                });

                // Log tool executions for audit trail
                for (const toolResult of orchestratorResponse.toolResults) {
                    if (toolResult.success) {
                        await advisorService.recordToolExecution(
                            conversationId as EntityId,
                            assistantMessage.id,
                            toolResult.toolName,
                            {}, // params would come from orchestrator
                            toolResult.data,
                            undefined,
                            toolResult.durationMs,
                            correlationId as EntityId
                        );
                    }
                }

                // Return response
                res.json({
                    messageId: assistantMessage.id,
                    assistantMessage: orchestratorResponse.assistantMessage,
                    metadata: {
                        workflowType: orchestratorResponse.metadata.workflowType,
                        toolsExecuted: orchestratorResponse.metadata.toolsExecuted,
                        totalDurationMs: orchestratorResponse.metadata.totalDurationMs,
                        llmTokensUsed: orchestratorResponse.metadata.llmTokensUsed,
                    },
                    toolResults: orchestratorResponse.toolResults.map(r => ({
                        toolName: r.toolName,
                        success: r.success,
                        durationMs: r.durationMs,
                        error: r.error,
                    })),
                });
            } catch (error) {
                // Handle different error types
                if (error instanceof OrchestratorError) {
                    return res.status(error.statusCode).json({
                        error: error.userMessage,
                        errorCode: error.errorCode,
                        details: error.message !== error.userMessage ? error.message : undefined,
                    });
                }

                next(error);
            }
        }
    );

    /**
     * GET /conversations/:conversationId/orchestration-status
     *
     * Check status of ongoing orchestration
     * Useful for long-running tool execution
     */
    app.get(
        "/conversations/:conversationId/orchestration-status",
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { conversationId } = req.params;
                const householdId = req.context!.householdId;

                // Verify conversation belongs to household
                const conversation = await conversationRepo.findById(conversationId as EntityId);
                if (!conversation || conversation.householdId !== householdId) {
                    throw new OrchestratorError(403, "Not authorized", "UNAUTHORIZED");
                }

                // Get conversation messages and tools to determine status
                const messages = await advisorService.getConversationHistory(
                    conversationId as EntityId
                );

                // Get last assistant message to check metadata
                const lastAssistantMessage = messages
                    .reverse()
                    .find(m => m.role === AdvisorMessageRole.ASSISTANT);

                const status = lastAssistantMessage
                    ? "complete"
                    : "waiting";

                res.json({
                    conversationId,
                    status,
                    lastUpdate: lastAssistantMessage?.createdAt,
                    messageCount: messages.length,
                });
            } catch (error) {
                next(error);
            }
        }
    );
};

/**
 * Error handler for orchestrator errors
 * Add to Express middleware chain after routes
 */
export const orchestratorErrorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (err instanceof OrchestratorError) {
        return res.status(err.statusCode).json({
            error: err.userMessage,
            errorCode: err.errorCode,
            details: err.message,
        });
    }

    // Pass to next error handler
    next(err);
};
