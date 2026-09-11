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
    ConversationTurn,
    extractNumericFacts,
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
 * UX presentation mode for a workflow. Drives which layout the web app renders -
 * never expose raw workflow/tool names to the user.
 */
type AdvisorUxMode = "INFORMATION" | "DIAGNOSIS" | "PLANNING" | "SCENARIO";

const UX_MODE_BY_WORKFLOW: Record<string, AdvisorUxMode> = {
    [AdvisorWorkflow.FINANCIAL_HEALTH]: "INFORMATION",
    [AdvisorWorkflow.BUDGET_STATUS]: "INFORMATION",
    [AdvisorWorkflow.CASH_FLOW]: "INFORMATION",
    [AdvisorWorkflow.GOAL_STATUS]: "INFORMATION",
    [AdvisorWorkflow.DEBT_STATUS]: "INFORMATION",
    [AdvisorWorkflow.BUDGET_DIAGNOSE]: "DIAGNOSIS",
    [AdvisorWorkflow.BUDGET_CREATE]: "PLANNING",
    [AdvisorWorkflow.BUDGET_REVISE]: "PLANNING",
    [AdvisorWorkflow.BUDGET_SCENARIO]: "SCENARIO",
    [AdvisorWorkflow.AFFORDABILITY]: "SCENARIO",
    [AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION]: "INFORMATION",
};

/**
 * Human-friendly, non-technical descriptions of what each tool is doing.
 * Shown to the user instead of tool names (e.g. "Checking your current cash flow..."
 * instead of "Executing get_cash_flow").
 */
const FRIENDLY_ACTIVITY_BY_TOOL: Record<string, string> = {
    get_financial_snapshot: "Reviewing your overall financial picture...",
    get_cash_flow: "Checking your current cash flow...",
    get_current_budget: "Looking at your current budget...",
    get_budget_status: "Comparing your budget to actual spending...",
    get_historical_budget_performance: "Reviewing past months for patterns...",
    get_goal_status: "Checking progress on your savings goals...",
    get_debt_summary: "Reviewing your debt obligations...",
    get_attention_items: "Looking for anything that needs your attention...",
    get_recurring_financial_items: "Identifying recurring bills and income...",
    simulate_purchase: "Running the numbers on this purchase...",
    simulate_budget_change: "Testing out that budget change...",
    analyze_budget_variance: "Digging into why spending differs from plan...",
    create_initial_budget: "Building your first budget...",
    plan_next_month_budget: "Building a proposed budget for next month...",
};

function getUxMode(workflowType: string): AdvisorUxMode {
    return UX_MODE_BY_WORKFLOW[workflowType] ?? "INFORMATION";
}

function getFriendlyActivity(toolName: string): string {
    return FRIENDLY_ACTIVITY_BY_TOOL[toolName] ?? "Gathering the information I need...";
}

/**
 * Register orchestrator routes
 */
export const registerOrchestratorRoutes: RouteRegistrar = (context: RouteContext) => {
    const { app, advisorService, conversationRepo, aiAuditLogRepo } = context;

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
                const { workflowType, financialContext, advisorPersonaKey } = req.body;

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
                const lastUserMessage = [...messages]
                    .reverse()
                    .find(m => m.role === AdvisorMessageRole.USER);

                if (!lastUserMessage) {
                    throw new OrchestratorError(
                        400,
                        "No user message found in conversation",
                        "NO_USER_MESSAGE"
                    );
                }

                // Prior turns only (excluding the message being processed) - used only to resolve
                // pronoun/elliptical follow-ups ("it", "what about $6,000 instead"). Contextual only,
                // never authoritative - every dollar figure still comes from live tool execution.
                const conversationHistory: ConversationTurn[] = messages
                    .filter(m => m.id !== lastUserMessage.id)
                    .map(m => ({
                        role: m.role.toLowerCase() as ConversationTurn["role"],
                        content: m.content,
                    }));

                // Merge numeric facts from every prior tool execution in this conversation, most
                // recent wins - used only to detect when a reused scenario's figures have gone stale.
                const priorToolExecutions = await advisorService.getToolExecutionHistory(
                    conversationId as EntityId
                );
                let priorScenarioFacts: Record<string, number> | undefined;
                for (const execution of priorToolExecutions) {
                    if (execution.result) {
                        priorScenarioFacts = {
                            ...priorScenarioFacts,
                            ...extractNumericFacts(execution.result),
                        };
                    }
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
                    conversationHistory,
                    priorScenarioFacts,
                    advisorPersonaKey: typeof advisorPersonaKey === "string" ? advisorPersonaKey : undefined,
                };

                // Get orchestrator instance and process request
                const orchestrator = getAIOrchestrator();
                const orchestratorResponse = await orchestrator.processRequest(orchestratorRequest);

                // Metadata-only audit record - never includes financial payloads (see
                // packages/db/migrations/012_add_ai_audit_log.sql). Recorded regardless of
                // success/failure so admins can see what the AI attempted either way.
                try {
                    await aiAuditLogRepo.record(orchestratorResponse.metadata.auditEntry);
                } catch (auditError) {
                    console.error("[AI_AUDIT_LOG_FAILED] Failed to record audit entry", {
                        correlationId,
                        errorMessage: auditError instanceof Error ? auditError.message : String(auditError),
                    });
                }

                // A graceful failure (LLM unavailable, privacy rejection, stale data, etc.) still
                // has a safe, user-facing message - store and return it rather than a 500. The
                // dashboard and rest of the app are unaffected either way.
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
                    mode: getUxMode(orchestratorResponse.metadata.workflowType),
                    success: orchestratorResponse.success,
                    failureCategory: orchestratorResponse.metadata.failureCategory,
                    retryable: orchestratorResponse.metadata.retryable ?? false,
                    metadata: {
                        workflowType: orchestratorResponse.metadata.workflowType,
                        toolsExecuted: orchestratorResponse.metadata.toolsExecuted,
                        totalDurationMs: orchestratorResponse.metadata.totalDurationMs,
                        llmTokensUsed: orchestratorResponse.metadata.llmTokensUsed,
                        continuity: orchestratorResponse.metadata.continuity,
                        research: orchestratorResponse.metadata.research,
                        recommendation: orchestratorResponse.metadata.recommendation,
                        advisorStyle: orchestratorResponse.metadata.advisorStyle,
                    },
                    toolResults: orchestratorResponse.toolResults.map(r => ({
                        friendlyActivity: getFriendlyActivity(r.toolName),
                        success: r.success,
                        durationMs: r.durationMs,
                        error: r.error,
                        data: r.success ? r.data : undefined,
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
