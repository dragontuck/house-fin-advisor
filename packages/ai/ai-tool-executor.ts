/**
 * AI Tool Executor — Executes planned tools with authorization and error handling.
 *
 * Purpose:
 * - Execute tool calls from the plan
 * - Enforce authorization (only server-side)
 * - Handle errors gracefully with retries
 * - Track execution metrics
 * - Build execution audit trail
 *
 * Design:
 * - Tools are NOT callable from LLM directly
 * - Server authorizes all tool access
 * - Tools can only access typed contracts (no raw DB access)
 * - All executions are logged and auditable
 */

import { EntityId } from "@house-fin/contracts";
import { PlannedToolCall } from "./ai-tool-planner";

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
    /** Sequence number from plan */
    sequence: number;
    /** Name of tool that was executed */
    toolName: string;
    /** Was execution successful */
    success: boolean;
    /** Tool's output data */
    data?: Record<string, unknown>;
    /** Error message if failed */
    error?: string;
    /** Time taken in milliseconds */
    durationMs: number;
    /** Number of retries attempted */
    retries: number;
    /** Timestamp when executed */
    executedAt: Date;
}

/**
 * Execution context for all tools
 */
export interface ToolExecutionContext {
    /** Unique request identifier for tracing */
    correlationId: EntityId;
    /** Household being operated on */
    householdId: EntityId;
    /** Member executing the tools */
    memberId: EntityId;
    /** Whether member is household owner (required for some tools) */
    isHouseholdOwner: boolean;
    /** Conversation context if available */
    conversationId?: EntityId;
    /** Message context if available */
    messageId?: EntityId;
}

/**
 * Authorization check result
 */
export interface AuthorizationCheckResult {
    authorized: boolean;
    reason?: string;
}

/**
 * Tool resolver interface - actual tool implementations
 */
export interface ToolResolver {
    resolve(
        toolName: string,
        context: ToolExecutionContext
    ): unknown; // Returns the tool handler function
}

/**
 * Executes authorized tool calls
 */
export class AIToolExecutor {
    // Map of tool names to execution handlers
    private toolHandlers: Map<
        string,
        (
            params: Record<string, unknown>,
            context: ToolExecutionContext
        ) => Promise<Record<string, unknown>>
    > = new Map();

    // Track execution history
    private executionHistory: ToolExecutionResult[] = [];

    constructor(private toolResolver?: ToolResolver) { }

    /**
     * Register a tool handler
     */
    registerTool(
        toolName: string,
        handler: (
            params: Record<string, unknown>,
            context: ToolExecutionContext
        ) => Promise<Record<string, unknown>>
    ): void {
        this.toolHandlers.set(toolName, handler);
    }

    /**
     * Check if member is authorized to execute a tool
     * (Simplified version - real implementation would check tool-specific permissions)
     */
    private authorizeToolExecution(
        toolName: string,
        context: ToolExecutionContext
    ): AuthorizationCheckResult {
        // Tools requiring owner authorization
        const ownerOnlyTools = [
            "create_initial_budget",
            "plan_next_month_budget",
            // Add others as needed
        ];

        if (ownerOnlyTools.includes(toolName) && !context.isHouseholdOwner) {
            return {
                authorized: false,
                reason: `Tool '${toolName}' requires household owner authorization`,
            };
        }

        return { authorized: true };
    }

    /**
     * Execute a single planned tool
     */
    async executeTool(
        plannedTool: PlannedToolCall,
        params: Record<string, unknown>,
        context: ToolExecutionContext,
        maxRetries: number = 2
    ): Promise<ToolExecutionResult> {
        const startTime = Date.now();
        let retries = 0;

        // Check authorization first
        const authCheck = this.authorizeToolExecution(plannedTool.toolName, context);
        if (!authCheck.authorized) {
            return {
                sequence: plannedTool.sequence,
                toolName: plannedTool.toolName,
                success: false,
                error: `Authorization failed: ${authCheck.reason}`,
                durationMs: Date.now() - startTime,
                retries: 0,
                executedAt: new Date(),
            };
        }

        // Try to execute with retries
        let lastError: Error | undefined;
        for (retries = 0; retries <= maxRetries; retries++) {
            try {
                const handler = this.toolHandlers.get(plannedTool.toolName);
                if (!handler) {
                    throw new Error(`Tool '${plannedTool.toolName}' not registered`);
                }

                const result = await handler(params, context);

                const executionResult: ToolExecutionResult = {
                    sequence: plannedTool.sequence,
                    toolName: plannedTool.toolName,
                    success: true,
                    data: result,
                    durationMs: Date.now() - startTime,
                    retries,
                    executedAt: new Date(),
                };

                this.executionHistory.push(executionResult);
                return executionResult;
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));

                // Don't retry if it's an authorization error or critical error
                if (
                    lastError.message.includes("Authorization") ||
                    lastError.message.includes("not found")
                ) {
                    break;
                }

                // Exponential backoff before retry
                if (retries < maxRetries) {
                    const delayMs = Math.pow(2, retries) * 100; // 100ms, 200ms, 400ms
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }

        const executionResult: ToolExecutionResult = {
            sequence: plannedTool.sequence,
            toolName: plannedTool.toolName,
            success: false,
            error: lastError?.message || "Unknown error",
            durationMs: Date.now() - startTime,
            retries,
            executedAt: new Date(),
        };

        this.executionHistory.push(executionResult);
        return executionResult;
    }

    /**
     * Execute a sequence of planned tools
     * Returns results and manages dependencies
     */
    async executeToolPlan(
        plannedTools: PlannedToolCall[],
        toolParams: Map<string, Record<string, unknown>>,
        context: ToolExecutionContext
    ): Promise<ToolExecutionResult[]> {
        const results: ToolExecutionResult[] = [];
        const resultsBySequence = new Map<number, ToolExecutionResult>();

        // Execute tools in sequence, checking dependencies
        for (const plannedTool of plannedTools) {
            // Check if critical dependencies succeeded
            if (plannedTool.dependsOn.length > 0) {
                const dependenciesMet = plannedTool.dependsOn.every(depSeq => {
                    const depResult = resultsBySequence.get(depSeq);
                    return depResult && depResult.success;
                });

                if (!dependenciesMet) {
                    // Skip this tool if its dependencies failed
                    const skipped: ToolExecutionResult = {
                        sequence: plannedTool.sequence,
                        toolName: plannedTool.toolName,
                        success: false,
                        error: "Dependencies not met",
                        durationMs: 0,
                        retries: 0,
                        executedAt: new Date(),
                    };
                    results.push(skipped);
                    resultsBySequence.set(plannedTool.sequence, skipped);
                    continue;
                }
            }

            // Get parameters for this tool
            const params = toolParams.get(plannedTool.toolName) || { householdId: context.householdId };

            // Execute the tool
            const result = await this.executeTool(plannedTool, params, context);
            results.push(result);
            resultsBySequence.set(plannedTool.sequence, result);
        }

        return results;
    }

    /**
     * Get results that should be passed to LLM
     */
    getResultsForLLM(results: ToolExecutionResult[], plannedTools: PlannedToolCall[]): Record<string, unknown> {
        const llmResults: Record<string, unknown> = {};

        results.forEach(result => {
            const planned = plannedTools.find(t => t.sequence === result.sequence);
            if (planned && planned.passToLLM && result.success && result.data) {
                llmResults[result.toolName] = result.data;
            }
        });

        return llmResults;
    }

    /**
     * Get execution history
     */
    getExecutionHistory(): ToolExecutionResult[] {
        return this.executionHistory;
    }

    /**
     * Clear execution history (useful for testing)
     */
    clearHistory(): void {
        this.executionHistory = [];
    }
}

/**
 * Singleton for tool executor
 */
let executorInstance: AIToolExecutor | null = null;

export function getToolExecutor(): AIToolExecutor {
    if (!executorInstance) {
        executorInstance = new AIToolExecutor();
    }
    return executorInstance;
}

export function setToolExecutor(executor: AIToolExecutor): void {
    executorInstance = executor;
}
