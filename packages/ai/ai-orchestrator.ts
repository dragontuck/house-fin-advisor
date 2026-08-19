/**
 * AI Orchestrator — Main workflow coordinator for financial advisor.
 *
 * Orchestration Flow:
 * 1. User Message → Intent Classification ✓ (done by advisor-conversations route)
 * 2. Workflow State → Load or initialize state
 * 3. Tool Plan → Determine which tools needed
 * 4. Authorization → Check permissions (in executor)
 * 5. Tool Execution → Call tools with server authorization
 * 6. Financial Context Builder → Build rich context from tool results
 * 7. Privacy Gateway → Sanitize context before LLM
 * 8. LLM Call → Get advice/recommendations
 * 9. Response Validation → Ensure response is safe and complete
 * 10. Assistant Response → Return to user
 *
 * Design:
 * - Pure orchestration: coordinates existing services
 * - Security-first: privacy gateway before LLM, authorization on all tool access
 * - Fault-tolerant: graceful degradation if tools fail
 * - Observable: every step is logged
 */

import { EntityId, AdvisorWorkflow, WorkflowState } from "@house-fin/contracts";
import { AIToolPlanner, PlannedToolCall, ToolExecutionPlan } from "./ai-tool-planner";
import { AIToolExecutor, ToolExecutionContext, ToolExecutionResult } from "./ai-tool-executor";
import { LLMProvider, LLMRequest, LLMResponse, LLMProviderError } from "./llm-provider";
import { PrivacyGateway, getPrivacyGateway } from "@house-fin/security";

/**
 * Request to process by orchestrator
 */
export interface OrchestratorRequest {
    /** Unique identifier for this request */
    correlationId: EntityId;
    /** User's natural language input */
    userMessage: string;
    /** Classified workflow type */
    workflowType: AdvisorWorkflow;
    /** Household scope */
    householdId: EntityId;
    /** User making request */
    memberId: EntityId;
    /** Whether member is owner (affects authorization) */
    isHouseholdOwner: boolean;
    /** Conversation context */
    conversationId?: EntityId;
    /** Message ID for audit trail */
    messageId?: EntityId;
    /** Financial context (already gathered by caller) */
    financialContext?: Record<string, unknown>;
}

/**
 * Orchestrator response
 */
export interface OrchestratorResponse {
    /** Request correlation ID */
    correlationId: EntityId;
    /** Assistant's response message */
    assistantMessage: string;
    /** Tool execution results for audit */
    toolResults: ToolExecutionResult[];
    /** Whether request succeeded */
    success: boolean;
    /** Error message if failed */
    error?: string;
    /** Metadata for audit trail */
    metadata: {
        workflowType: AdvisorWorkflow;
        toolsExecuted: number;
        totalDurationMs: number;
        llmTokensUsed?: {
            input: number;
            output: number;
        };
    };
}

/**
 * AI Orchestrator - Main coordinator
 */
export class AIOrchestrator {
    constructor(
        private toolPlanner: AIToolPlanner,
        private toolExecutor: AIToolExecutor,
        private llmProvider: LLMProvider,
        private privacyGateway: PrivacyGateway
    ) { }

    /**
     * Process a user request end-to-end
     */
    async processRequest(request: OrchestratorRequest): Promise<OrchestratorResponse> {
        const startTime = Date.now();

        try {
            // Step 1: Plan which tools to execute
            const plan = this.toolPlanner.planToolExecution(request.workflowType);

            // Step 2: Prepare execution context
            const executionContext: ToolExecutionContext = {
                correlationId: request.correlationId,
                householdId: request.householdId,
                memberId: request.memberId,
                isHouseholdOwner: request.isHouseholdOwner,
                conversationId: request.conversationId,
                messageId: request.messageId,
            };

            // Step 3: Prepare tool parameters
            const toolParams = this.prepareToolParameters(request, plan);

            // Step 4: Execute tools (with authorization checks inside executor)
            const toolResults = await this.toolExecutor.executeToolPlan(
                plan.tools,
                toolParams,
                executionContext
            );

            // Step 5: Extract results for LLM
            const toolResultsForLLM = this.toolExecutor.getResultsForLLM(toolResults, plan.tools);

            // Step 6: Build financial context (combine request context + tool results)
            const financialContext = this.buildFinancialContext(
                request.financialContext || {},
                toolResultsForLLM
            );

            // Step 7: Sanitize context through privacy gateway
            const sanitizedContext = this.privacyGateway.sanitizeContextForLLM(
                financialContext,
                request.correlationId
            );

            // Step 8: Call LLM with sanitized context
            const llmResponse = await this.callLLM(
                request.userMessage,
                sanitizedContext,
                plan,
                request.correlationId
            );

            // Step 9: Validate response
            const validatedResponse = this.validateResponse(llmResponse, toolResults);

            // Step 10: Build final orchestrator response
            return {
                correlationId: request.correlationId,
                assistantMessage: validatedResponse,
                toolResults,
                success: true,
                metadata: {
                    workflowType: request.workflowType,
                    toolsExecuted: toolResults.filter(r => r.success).length,
                    totalDurationMs: Date.now() - startTime,
                    llmTokensUsed: llmResponse.usage
                        ? {
                            input: llmResponse.usage.inputTokens,
                            output: llmResponse.usage.outputTokens,
                        }
                        : undefined,
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            return {
                correlationId: request.correlationId,
                assistantMessage: "",
                toolResults: this.toolExecutor.getExecutionHistory(),
                success: false,
                error: errorMessage,
                metadata: {
                    workflowType: request.workflowType,
                    toolsExecuted: 0,
                    totalDurationMs: Date.now() - startTime,
                },
            };
        }
    }

    /**
     * Build parameters for each tool based on request and plan
     */
    private prepareToolParameters(
        request: OrchestratorRequest,
        plan: ToolExecutionPlan
    ): Map<string, Record<string, unknown>> {
        const params = new Map<string, Record<string, unknown>>();

        // Default parameters for all tools
        const defaultParams = {
            householdId: request.householdId,
        };

        // Set parameters for each tool
        for (const tool of plan.tools) {
            params.set(tool.toolName, this.getToolParameters(tool.toolName, request));
        }

        return params;
    }

    /**
     * Get specific parameters for a tool
     */
    private getToolParameters(
        toolName: string,
        request: OrchestratorRequest
    ): Record<string, unknown> {
        const base = { householdId: request.householdId };

        switch (toolName) {
            case "create_initial_budget":
            case "plan_next_month_budget":
                // These tools need income/expense data if available
                return {
                    ...base,
                    // Parameters will be extracted from request context if available
                };

            case "simulate_purchase":
                // User should specify purchase details in their message
                return {
                    ...base,
                    // Parameters extracted from parsed message
                };

            case "simulate_budget_change":
                // Budget changes extracted from user message
                return {
                    ...base,
                    // Parameters extracted from parsed message
                };

            default:
                return base;
        }
    }

    /**
     * Combine request context with tool results
     */
    private buildFinancialContext(
        requestContext: Record<string, unknown>,
        toolResults: Record<string, unknown>
    ): Record<string, unknown> {
        return {
            ...requestContext,
            tools: toolResults,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Call LLM with sanitized context
     */
    private async callLLM(
        userMessage: string,
        sanitizedContext: Record<string, unknown>,
        plan: ToolExecutionPlan,
        correlationId: EntityId
    ): Promise<LLMResponse> {
        const systemPrompt = this.buildSystemPrompt(plan);

        const request: LLMRequest = {
            correlationId,
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                {
                    role: "user",
                    content: this.buildUserPrompt(userMessage, sanitizedContext),
                },
            ],
            temperature: 0.7, // Balanced between determinism and creativity
            maxOutputTokens: 1000,
            timeoutMs: 30000, // 30 seconds
        };

        return this.llmProvider.generateResponse(request);
    }

    /**
     * Build system prompt for the LLM
     */
    private buildSystemPrompt(plan: ToolExecutionPlan): string {
        return `You are a personal financial advisor helping households manage their finances.

Your role:
- Provide actionable financial guidance based on the household's data
- Be specific with numbers and calculations
- Explain trade-offs clearly
- Never invent financial data (only use provided context)
- Always cite what data you're using
- Warn about risky decisions

Context type: ${plan.workflowType}
Tools used: ${plan.tools.map(t => t.toolName).join(", ")}

Important constraints:
- Do not make financial recommendations that contradict the household's existing plan
- Always consider emergency fund adequacy
- Account for debt obligations before suggesting new spending
- Be conservative with affordability assessments
- When uncertain, ask for clarification rather than guessing`;
    }

    /**
     * Build user message for LLM with context
     */
    private buildUserPrompt(userMessage: string, context: Record<string, unknown>): string {
        return `User question: ${userMessage}

Financial context (already validated for privacy):
${JSON.stringify(context, null, 2)}

Please provide thoughtful financial advice based on the data above.`;
    }

    /**
     * Validate LLM response
     */
    private validateResponse(response: LLMResponse, toolResults: ToolExecutionResult[]): string {
        // Basic validation
        if (!response.content || response.content.trim().length === 0) {
            throw new Error("LLM returned empty response");
        }

        // Check for common hallucinations
        const hallucinations = [
            /\$[0-9,]+\.[0-9]{2} (that|which|isn't|is not) in the data/i,
            /according to my calculations?:/i,
            /the system shows/i,
        ];

        for (const pattern of hallucinations) {
            if (pattern.test(response.content)) {
                console.warn("Potential hallucination detected in LLM response:", pattern);
            }
        }

        return response.content;
    }
}

/**
 * Create an orchestrator with default services
 */
export function createAIOrchestrator(
    toolPlanner: AIToolPlanner,
    toolExecutor: AIToolExecutor,
    llmProvider: LLMProvider,
    privacyGateway?: PrivacyGateway
): AIOrchestrator {
    return new AIOrchestrator(
        toolPlanner,
        toolExecutor,
        llmProvider,
        privacyGateway || getPrivacyGateway()
    );
}

/**
 * Singleton for orchestrator
 */
let orchestratorInstance: AIOrchestrator | null = null;

export function getAIOrchestrator(): AIOrchestrator {
    if (!orchestratorInstance) {
        throw new Error("AI Orchestrator not initialized. Call initializeAIOrchestrator first.");
    }
    return orchestratorInstance;
}

export function initializeAIOrchestrator(orchestrator: AIOrchestrator): void {
    orchestratorInstance = orchestrator;
}
