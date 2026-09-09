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
import { validateGroundedResponse, buildSafeFallback, GroundingViolation } from "./response-grounding";
import {
    AdvisorFailure,
    buildAdvisorFailure,
    AdvisorFailureCategory,
    classifyLLMError,
    classifyPrivacyError,
    classifyCriticalToolFailure,
    classifyStaleSnapshot,
} from "./graceful-failure";

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
        /** Whether the LLM response passed grounding validation as-is */
        groundingPassed?: boolean;
        /** Violation types detected, if grounding failed and a safe fallback was substituted */
        groundingViolations?: string[];
        /** Category of graceful failure, if the request could not be completed safely */
        failureCategory?: AdvisorFailureCategory;
        /** Whether the frontend should offer a [Try Again] action for this failure */
        retryable?: boolean;
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

            // Step 4.5: Never narrate around missing/broken critical data or stale figures -
            // stop here with a plain, honest message instead of calling the LLM at all.
            const preflightFailure =
                classifyCriticalToolFailure(plan.tools, toolResults) ?? classifyStaleSnapshot(toolResults);
            if (preflightFailure) {
                return this.buildFailureResponse(request, toolResults, preflightFailure, startTime);
            }

            // Step 5: Extract results for LLM
            const toolResultsForLLM = this.toolExecutor.getResultsForLLM(toolResults, plan.tools);

            // Step 6: Build financial context (combine request context + tool results)
            const financialContext = this.buildFinancialContext(
                request.financialContext || {},
                toolResultsForLLM
            );

            // Step 7: Sanitize context through privacy gateway
            let sanitizedContext: Record<string, unknown>;
            try {
                sanitizedContext = this.privacyGateway.sanitizeContextForLLM(
                    financialContext,
                    request.correlationId
                );
            } catch {
                // Never surface which privacy rule matched - only that the data can't be sent.
                return this.buildFailureResponse(request, toolResults, classifyPrivacyError(), startTime);
            }

            // Step 8: Call LLM with sanitized context
            let llmResponse: LLMResponse;
            try {
                llmResponse = await this.callLLM(
                    request.userMessage,
                    sanitizedContext,
                    plan,
                    request.correlationId
                );
            } catch (error) {
                return this.buildFailureResponse(request, toolResults, classifyLLMError(error), startTime);
            }

            if (!llmResponse.content || llmResponse.content.trim().length === 0) {
                return this.buildFailureResponse(
                    request,
                    toolResults,
                    buildAdvisorFailure(AdvisorFailureCategory.LLM_MALFORMED_RESPONSE),
                    startTime
                );
            }

            // Step 9: Validate response is grounded in tool results; substitute a safe,
            // deterministic fallback if the LLM said anything unsupported.
            const validated = this.validateResponse(llmResponse, toolResults);

            // Step 10: Build final orchestrator response
            return {
                correlationId: request.correlationId,
                assistantMessage: validated.content,
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
                    groundingPassed: validated.groundingPassed,
                    groundingViolations: validated.violations.map(v => v.type),
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Unforeseen failure (e.g. unknown workflow type) - fall back to the most generic,
            // still-honest copy rather than ever showing a raw error to the user.
            const failure = buildAdvisorFailure(AdvisorFailureCategory.LLM_UNAVAILABLE);

            console.error("[ADVISOR_UNEXPECTED_FAILURE]", { correlationId: request.correlationId, errorMessage });

            return {
                correlationId: request.correlationId,
                assistantMessage: failure.userMessage,
                toolResults: this.toolExecutor.getExecutionHistory(),
                success: false,
                error: errorMessage,
                metadata: {
                    workflowType: request.workflowType,
                    toolsExecuted: 0,
                    totalDurationMs: Date.now() - startTime,
                    failureCategory: failure.category,
                    retryable: failure.retryable,
                },
            };
        }
    }

    /**
     * Builds a graceful-failure OrchestratorResponse - never invents data, never leaks
     * internal details, always gives the user a plain, honest message to act on.
     */
    private buildFailureResponse(
        request: OrchestratorRequest,
        toolResults: ToolExecutionResult[],
        failure: AdvisorFailure,
        startTime: number
    ): OrchestratorResponse {
        console.warn("[ADVISOR_GRACEFUL_FAILURE]", {
            correlationId: request.correlationId,
            category: failure.category,
        });

        return {
            correlationId: request.correlationId,
            assistantMessage: failure.userMessage,
            toolResults,
            success: false,
            error: failure.category,
            metadata: {
                workflowType: request.workflowType,
                toolsExecuted: toolResults.filter((r) => r.success).length,
                totalDurationMs: Date.now() - startTime,
                failureCategory: failure.category,
                retryable: failure.retryable,
            },
        };
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

            case "simulate_purchase": {
                // Extract the purchase amount and payment method from the user's own words.
                // No amount is invented - if none is found, the tool receives 0 and reports it.
                const purchaseAmountCents = extractDollarAmountCents(request.userMessage);
                const paymentMethod = extractPaymentMethod(request.userMessage);
                return {
                    ...base,
                    purchaseAmountCents,
                    paymentMethod,
                    description: request.userMessage,
                };
            }

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
     * Validates the LLM response against the deterministic tool results before it can
     * reach the user. An ungrounded response (unsupported numbers, fabricated accounts,
     * fabricated research, unsupported assumptions, or contradictions with tool output)
     * is never shown - it's replaced with a safe fallback built only from tool results.
     * Empty/malformed responses are handled earlier in processRequest, before this runs.
     */
    private validateResponse(
        response: LLMResponse,
        toolResults: ToolExecutionResult[]
    ): { content: string; groundingPassed: boolean; violations: GroundingViolation[] } {
        const grounding = validateGroundedResponse(response.content, toolResults);
        if (grounding.valid) {
            return { content: response.content, groundingPassed: true, violations: [] };
        }

        console.warn("[RESPONSE_GROUNDING] Rejected ungrounded advisor response", {
            violations: grounding.violations.map((v) => `${v.type}: ${v.detail}`),
        });
        return { content: buildSafeFallback(toolResults), groundingPassed: false, violations: grounding.violations };
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

/**
 * Extracts a dollar amount (e.g. "$4,000" or "4000 dollars") from free text and
 * converts it to cents. Returns 0 if no amount is found - the tool must never guess.
 */
function extractDollarAmountCents(text: string): number {
    const match = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s?(?:dollars|usd)/i);
    const raw = match?.[1] ?? match?.[2];
    if (!raw) return 0;
    const dollars = parseFloat(raw.replace(/,/g, ""));
    return Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
}

/**
 * Infers the intended payment method from free text. Defaults to CASH when unspecified.
 */
function extractPaymentMethod(text: string): "CASH" | "CREDIT_CARD" | "LOAN" | "SAVINGS" {
    const lower = text.toLowerCase();
    if (/credit card|credit\b/.test(lower)) return "CREDIT_CARD";
    if (/loan|finance(d)?|financing/.test(lower)) return "LOAN";
    if (/savings/.test(lower)) return "SAVINGS";
    return "CASH";
}
