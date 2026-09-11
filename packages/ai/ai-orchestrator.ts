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

import { EntityId, AdvisorWorkflow, AIAuditLogEntry, DecisionJournalEntry, DecisionJournalRecord, Evidence } from "@house-fin/contracts";
import type { FinalRecommendation } from "@house-fin/domain";
import { AIToolPlanner, ToolExecutionPlan } from "./ai-tool-planner";
import { AIToolExecutor, ToolExecutionContext, ToolExecutionResult } from "./ai-tool-executor";
import { LLMProvider, LLMRequest, LLMResponse } from "./llm-provider";
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
    classifyDirectPersistenceAttempt,
} from "./graceful-failure";
import { createBudgetApprovalService } from "@house-fin/domain";
import {
    ConversationTurn,
    resolveConversationalReference,
    detectStaleFinancialConflict,
    extractNumericFacts,
    extractDollarAmountCents,
    extractPaymentMethod,
    STALE_FINANCIAL_DATA_EXPLANATION,
} from "./conversation-continuity";
import { buildAuditLogEntry } from "./audit-log";
import {
    determineResearchRequirement,
    performRequiredResearch,
    RecommendationResearchProvider,
    ResearchRequirementLevel,
} from "./recommendation-research";
import {
    buildToolBackedRecommendationWorkflow,
    isRecommendationWorkflow,
    resolveAdvisorStyle,
    OrchestratedRecommendationWorkflow,
} from "./recommendation-workflow";
import { buildDecisionJournalEntry } from "./decision-journal";

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
    /** Prior conversation turns, oldest first, excluding the current message. Contextual only — never authoritative. */
    conversationHistory?: ConversationTurn[];
    /** Numeric financial facts ("*Cents" fields) from prior tool executions in this conversation. Contextual only — current data always wins. */
    priorScenarioFacts?: Record<string, number>;
    /** Presentation-only persona key. Never used for calculations, research, or validation. */
    advisorPersonaKey?: string;
    /** Version of the household policy applied to this recommendation. */
    householdPolicyVersion?: number;
    /** Whether the user is asking for the rationale behind a historical recommendation. */
    historicalRecommendationQuestion?: boolean;
    /** Household-scoped archived recommendation records; never reconstructed from current data. */
    historicalDecisionJournal?: DecisionJournalRecord[];
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
    /** Exact private recommendation context for durable household-scoped persistence. */
    decisionJournalEntry?: DecisionJournalEntry;
    /** Structured, independently validated recommendation. */
    recommendation?: FinalRecommendation;
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
        /** Whether current external facts were needed and whether they were verified. */
        research?: {
            requirement: ResearchRequirementLevel;
            status: "NOT_REQUIRED" | "VERIFIED" | "UNAVAILABLE" | "CONFLICTED";
            evidenceCount: number;
        };
        recommendation?: {
            recommendationId?: EntityId;
            candidateCount: number;
            validationStatus: OrchestratedRecommendationWorkflow["validation"]["status"];
            finalRecommendationProduced: boolean;
        };
        advisorStyle?: string;
        /** Conversational continuity classification for this turn */
        continuity?: {
            isFollowUp: boolean;
            isTopicSwitch: boolean;
            referencedSubject?: string;
            staleDataDetected?: boolean;
        };
        /** Metadata-only audit record for this request - never contains financial payloads. */
        auditEntry: AIAuditLogEntry;
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
        private privacyGateway: PrivacyGateway,
        private researchProvider?: RecommendationResearchProvider
    ) { }

    /**
     * Process a user request end-to-end
     */
    async processRequest(request: OrchestratorRequest): Promise<OrchestratorResponse> {
        const startTime = Date.now();
        let plan: ToolExecutionPlan | undefined;

        try {
            // Step 0: Resolve pronoun/elliptical follow-ups ("it", "what about $6,000 instead")
            // against prior turns. History only fills in a missing *subject* - it is never
            // authoritative, and every dollar figure still comes from this message / live data.
            const continuity = resolveConversationalReference(
                request.userMessage,
                request.conversationHistory ?? []
            );

            // Step 1: Plan which tools to execute
            plan = this.toolPlanner.planToolExecution(request.workflowType);

            // Step 2: Prepare execution context
            const executionContext: ToolExecutionContext = {
                correlationId: request.correlationId,
                householdId: request.householdId,
                memberId: request.memberId,
                isHouseholdOwner: request.isHouseholdOwner,
                conversationId: request.conversationId,
                messageId: request.messageId,
            };

            // Step 3: Prepare tool parameters, using the resolved (subject-filled-in) message
            const toolParams = this.prepareToolParameters(
                { ...request, userMessage: continuity.resolvedMessage },
                plan
            );

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
                return this.buildFailureResponse(request, plan, toolResults, preflightFailure, startTime);
            }

            // Step 4.6: Active guard against any tool that would directly persist financial
            // state - proposals must always go through explicit user approval first.
            const directPersistenceError = createBudgetApprovalService().validateNoDirectPersistence({
                toolsExecuted: toolResults.filter((r) => r.success).map((r) => r.toolName),
            });
            if (directPersistenceError) {
                console.error("[ADVISOR_DIRECT_PERSISTENCE_BLOCKED]", { correlationId: request.correlationId });
                return this.buildFailureResponse(request, plan, toolResults, classifyDirectPersistenceAttempt(), startTime);
            }

            if (request.historicalRecommendationQuestion && !request.historicalDecisionJournal?.length) {
                return this.buildFailureResponse(
                    request,
                    plan,
                    toolResults,
                    buildAdvisorFailure(AdvisorFailureCategory.HISTORICAL_CONTEXT_UNAVAILABLE),
                    startTime
                );
            }

            // Step 5: Extract results for LLM
            const toolResultsForLLM = this.toolExecutor.getResultsForLLM(toolResults, plan.tools);

            // Step 6: Build financial context (combine request context + tool results)
            const financialContext = this.buildFinancialContext(
                request.financialContext || {},
                toolResultsForLLM
            );

            // Step 6.5: Decide whether current external facts are material. Required research
            // must be verified before an explanation can be generated; absence is never treated
            // as evidence that the LLM can fill in from memory.
            const researchRequirement = request.historicalRecommendationQuestion
                ? {
                    level: "NOT_REQUIRED" as const,
                    reason: "Historical explanations use evidence preserved in the decision journal.",
                    queries: [],
                }
                : determineResearchRequirement(
                    continuity.resolvedMessage,
                    request.workflowType
                );
            const research = await performRequiredResearch(
                researchRequirement,
                this.researchProvider,
                {
                    correlationId: request.correlationId,
                    householdId: request.householdId,
                    memberId: request.memberId,
                }
            );
            if (researchRequirement.level === "REQUIRED" && research.status !== "VERIFIED") {
                return this.buildFailureResponse(
                    request,
                    plan,
                    toolResults,
                    buildAdvisorFailure(AdvisorFailureCategory.RESEARCH_UNAVAILABLE),
                    startTime,
                    {
                        requirement: researchRequirement.level,
                        status: research.status,
                        evidenceCount: 0,
                    }
                );
            }

            const contextWithResearch = {
                ...financialContext,
                research: {
                    requirement: researchRequirement.level,
                    reason: researchRequirement.reason,
                    status: research.status,
                    evidence: research.evidence.map((item) => ({
                        claim: item.claim,
                        sourceName: item.source.name,
                        sourceTier: item.source.tier,
                        sourceUrl: item.sourceUrl,
                        retrievalDate: item.retrievalDate,
                        freshness: item.freshness,
                    })),
                },
            };
            const recommendationWorkflow = isRecommendationWorkflow(request.workflowType, researchRequirement)
                ? buildToolBackedRecommendationWorkflow({
                    toolResults,
                    researchRequirement,
                    research,
                    workflowType: request.workflowType,
                    userMessage: continuity.resolvedMessage,
                    householdId: request.householdId,
                    memberId: request.memberId,
                    conversationId: request.conversationId,
                    policyVersion: request.householdPolicyVersion ?? 1,
                })
                : undefined;
            if (recommendationWorkflow && !recommendationWorkflow.finalRecommendation) {
                return this.buildFailureResponse(
                    request,
                    plan,
                    toolResults,
                    buildAdvisorFailure(AdvisorFailureCategory.RECOMMENDATION_UNAVAILABLE),
                    startTime,
                    {
                        requirement: researchRequirement.level,
                        status: research.status,
                        evidenceCount: research.evidence.length,
                    }
                );
            }
            const advisorStyle = resolveAdvisorStyle(request.advisorPersonaKey);
            const recommendationContext = {
                ...contextWithResearch,
                recommendationWorkflow,
                historicalDecisionJournal: request.historicalDecisionJournal,
                presentation: {
                    advisorStyle: advisorStyle.label,
                    instruction: advisorStyle.instruction,
                    presentationOnly: true,
                },
            };

            // Step 7: Sanitize context through privacy gateway
            let sanitizedContext: Record<string, unknown>;
            try {
                sanitizedContext = this.privacyGateway.sanitizeContextForLLM(
                    recommendationContext,
                    request.correlationId
                );
            } catch {
                // Never surface which privacy rule matched - only that the data can't be sent.
                return this.buildFailureResponse(request, plan, toolResults, classifyPrivacyError(), startTime);
            }

            // Step 8: Call LLM with sanitized context
            let llmResponse: LLMResponse;
            try {
                llmResponse = await this.callLLM(
                    request.userMessage,
                    sanitizedContext,
                    plan,
                    request.correlationId,
                    advisorStyle.instruction,
                    request.historicalRecommendationQuestion ?? false
                );
            } catch (error) {
                return this.buildFailureResponse(request, plan, toolResults, classifyLLMError(error), startTime);
            }

            if (!llmResponse.content || llmResponse.content.trim().length === 0) {
                return this.buildFailureResponse(
                    request,
                    plan,
                    toolResults,
                    buildAdvisorFailure(AdvisorFailureCategory.LLM_MALFORMED_RESPONSE),
                    startTime
                );
            }

            // Step 9: Validate response is grounded in tool results; substitute a safe,
            // deterministic fallback if the LLM said anything unsupported.
            const historicalToolResults = (request.historicalDecisionJournal ?? []).flatMap((record) => {
                const archived = record.entry.currentFinancialState.toolResults;
                return Array.isArray(archived) ? archived as ToolExecutionResult[] : [];
            });
            const historicalEvidence = (request.historicalDecisionJournal ?? [])
                .flatMap((record) => record.entry.evidence);
            const validated = this.validateResponse(
                llmResponse,
                [...toolResults, ...historicalToolResults],
                [...research.evidence, ...historicalEvidence]
            );

            if (recommendationWorkflow?.finalRecommendation && !validated.groundingPassed) {
                return this.buildFailureResponse(
                    request,
                    plan,
                    toolResults,
                    buildAdvisorFailure(AdvisorFailureCategory.RECOMMENDATION_UNAVAILABLE),
                    startTime,
                    {
                        requirement: researchRequirement.level,
                        status: research.status,
                        evidenceCount: research.evidence.length,
                    }
                );
            }

            // Step 9.5: If we reused a prior scenario, check whether the figures it relied on
            // have since changed. Current data always wins - disclose it rather than silently
            // giving a different-sounding answer.
            let staleCheck: { hasConflict: boolean; explanation?: string } = { hasConflict: false };
            if (continuity.isFollowUp && request.priorScenarioFacts) {
                const currentFacts: Record<string, number> = {};
                for (const result of toolResults) {
                    if (result.success) {
                        Object.assign(currentFacts, extractNumericFacts(result.data as Record<string, unknown>));
                    }
                }
                staleCheck = detectStaleFinancialConflict(request.priorScenarioFacts, currentFacts);
            }
            const assistantMessage = staleCheck.hasConflict
                ? `${STALE_FINANCIAL_DATA_EXPLANATION} ${validated.content}`
                : validated.content;

            // Step 10: Build final orchestrator response
            const llmProviderInfo = this.getLLMProviderInfo();
            const totalDurationMs = Date.now() - startTime;
            const decisionJournalEntry = recommendationWorkflow?.finalRecommendation
                ? buildDecisionJournalEntry({
                    request,
                    toolResults,
                    evidence: research.evidence,
                    workflow: recommendationWorkflow,
                    presentedRecommendation: assistantMessage,
                    groundingPassed: validated.groundingPassed,
                    groundingViolations: validated.violations.map((violation) => violation.type),
                    advisorStyle,
                    generatedAt: new Date(),
                })
                : undefined;
            return {
                correlationId: request.correlationId,
                assistantMessage,
                toolResults,
                success: true,
                decisionJournalEntry,
                recommendation: recommendationWorkflow?.finalRecommendation,
                metadata: {
                    workflowType: request.workflowType,
                    toolsExecuted: toolResults.filter(r => r.success).length,
                    totalDurationMs,
                    continuity: {
                        isFollowUp: continuity.isFollowUp,
                        isTopicSwitch: continuity.isTopicSwitch,
                        referencedSubject: continuity.referencedScenario?.subject,
                        staleDataDetected: staleCheck.hasConflict,
                    },
                    llmTokensUsed: llmResponse.usage
                        ? {
                            input: llmResponse.usage.inputTokens,
                            output: llmResponse.usage.outputTokens,
                        }
                        : undefined,
                    groundingPassed: validated.groundingPassed,
                    groundingViolations: validated.violations.map(v => v.type),
                    research: {
                        requirement: researchRequirement.level,
                        status: research.status,
                        evidenceCount: research.evidence.length,
                    },
                    recommendation: recommendationWorkflow ? {
                        recommendationId: decisionJournalEntry?.recommendationId,
                        candidateCount: recommendationWorkflow.candidates.length,
                        validationStatus: recommendationWorkflow.validation.status,
                        finalRecommendationProduced: recommendationWorkflow.finalRecommendation !== undefined,
                    } : undefined,
                    advisorStyle: advisorStyle.label,
                    auditEntry: buildAuditLogEntry({
                        request,
                        plan,
                        toolResults,
                        success: true,
                        totalDurationMs,
                        llmProvider: llmProviderInfo,
                        groundingPassed: validated.groundingPassed,
                    }),
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Unforeseen failure (e.g. unknown workflow type) - fall back to the most generic,
            // still-honest copy rather than ever showing a raw error to the user.
            const failure = buildAdvisorFailure(AdvisorFailureCategory.LLM_UNAVAILABLE);

            console.error("[ADVISOR_UNEXPECTED_FAILURE]", { correlationId: request.correlationId, errorMessage });

            const fallbackPlan: ToolExecutionPlan = plan ?? {
                workflowType: request.workflowType,
                tools: [],
                description: "",
                estimatedQueries: 0,
            };
            const totalDurationMs = Date.now() - startTime;
            const toolResults = this.toolExecutor.getExecutionHistory();
            return {
                correlationId: request.correlationId,
                assistantMessage: failure.userMessage,
                toolResults,
                success: false,
                error: errorMessage,
                metadata: {
                    workflowType: request.workflowType,
                    toolsExecuted: 0,
                    totalDurationMs,
                    failureCategory: failure.category,
                    retryable: failure.retryable,
                    auditEntry: buildAuditLogEntry({
                        request,
                        plan: fallbackPlan,
                        toolResults,
                        success: false,
                        totalDurationMs,
                        llmProvider: this.getLLMProviderInfo(),
                        failureCategory: failure.category,
                    }),
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
        plan: ToolExecutionPlan,
        toolResults: ToolExecutionResult[],
        failure: AdvisorFailure,
        startTime: number,
        research?: OrchestratorResponse["metadata"]["research"]
    ): OrchestratorResponse {
        console.warn("[ADVISOR_GRACEFUL_FAILURE]", {
            correlationId: request.correlationId,
            category: failure.category,
        });

        const totalDurationMs = Date.now() - startTime;
        return {
            correlationId: request.correlationId,
            assistantMessage: failure.userMessage,
            toolResults,
            success: false,
            error: failure.category,
            metadata: {
                workflowType: request.workflowType,
                toolsExecuted: toolResults.filter((r) => r.success).length,
                totalDurationMs,
                failureCategory: failure.category,
                retryable: failure.retryable,
                research,
                auditEntry: buildAuditLogEntry({
                    request,
                    plan,
                    toolResults,
                    success: false,
                    totalDurationMs,
                    llmProvider: this.getLLMProviderInfo(),
                    failureCategory: failure.category,
                }),
            },
        };
    }

    /** Provider/model metadata for the audit log - never affects control flow. */
    private getLLMProviderInfo(): { name: string; model?: string } {
        try {
            const name = this.llmProvider.getName();
            const config = this.llmProvider.getConfig() as Record<string, unknown>;
            const model = typeof config.model === "string" ? config.model : undefined;
            return { name, model };
        } catch {
            return { name: "unknown" };
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
        correlationId: EntityId,
        advisorStyleInstruction: string,
        historicalRecommendationQuestion: boolean
    ): Promise<LLMResponse> {
        const systemPrompt = this.buildSystemPrompt(
            plan,
            advisorStyleInstruction,
            historicalRecommendationQuestion
        );

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
    private buildSystemPrompt(
        plan: ToolExecutionPlan,
        advisorStyleInstruction: string,
        historicalRecommendationQuestion: boolean
    ): string {
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
Advisor style: ${advisorStyleInstruction}

Important constraints:
- Do not make financial recommendations that contradict the household's existing plan
- Always consider emergency fund adequacy
- Account for debt obligations before suggesting new spending
- Be conservative with affordability assessments
- Never claim research is current unless the supplied research status is VERIFIED
- If research is optional or not required, distinguish household calculations from general guidance
- If recommendation validation is INSUFFICIENT_INFORMATION, clearly state that no verified recommendation can be produced and provide only limited general guidance
- Use the advisor style only to frame the explanation; never change calculations, evidence, validation, or the final recommendation
- ${historicalRecommendationQuestion
                ? "Explain the past recommendation only from historicalDecisionJournal. Clearly distinguish its archived financial state and policy from current data."
                : "Do not claim to explain a past recommendation unless historicalDecisionJournal is supplied."}
- Do not imply that a named person or organization provided or endorsed the advice
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
        toolResults: ToolExecutionResult[],
        verifiedResearch: Evidence[] = []
    ): { content: string; groundingPassed: boolean; violations: GroundingViolation[] } {
        const grounding = validateGroundedResponse(
            response.content,
            toolResults,
            verifiedResearch.map((item) => ({
                claim: item.claim,
                retrievalDate: item.retrievalDate,
                sourceName: item.source.name,
                sourceUrl: item.sourceUrl,
            }))
        );
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
    privacyGateway?: PrivacyGateway,
    researchProvider?: RecommendationResearchProvider
): AIOrchestrator {
    return new AIOrchestrator(
        toolPlanner,
        toolExecutor,
        llmProvider,
        privacyGateway || getPrivacyGateway(),
        researchProvider
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
