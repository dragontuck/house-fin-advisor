/**
 * LLM Provider Abstraction
 *
 * Provider-neutral interface for Large Language Model interactions.
 * Ensures provider implementations are isolated and don't expose provider-specific types.
 *
 * Security: Providers receive only sanitized context:
 * - No database access
 * - No MinIO/storage access
 * - No credentials
 * - No raw financial statements
 * - No bank credentials
 * - Only explicitly exposed tools through type-safe adapters
 */

import { EntityId } from "@house-fin/contracts";

/**
 * Message role in a conversation
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * A single message in the conversation history
 */
export interface LLMMessage {
    role: MessageRole;
    content: string;
}

/**
 * Tool definition for structured LLM function calling
 */
export interface LLMToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, any>;
        required: string[];
    };
}

/**
 * Request to the LLM provider
 *
 * Contains:
 * - Conversation history (user, assistant, system messages)
 * - System instructions (role, constraints, available tools)
 * - Tool definitions for structured function calling
 * - Configuration (temperature, max tokens, etc.)
 * - Telemetry (correlation ID for tracing)
 */
export interface LLMRequest {
    /**
     * Unique identifier for correlating logs and traces
     */
    correlationId: EntityId;

    /**
     * Conversation history (most recent last)
     * System message should be first if present
     */
    messages: LLMMessage[];

    /**
     * Temperature: 0 (deterministic) to 1 (creative)
     * Default: 0.7
     */
    temperature?: number;

    /**
     * Maximum number of output tokens
     * Default: 1024
     */
    maxOutputTokens?: number;

    /**
     * Tool definitions for structured function calling
     * Optional: if not provided, no tool calling
     */
    tools?: LLMToolDefinition[];

    /**
     * Request timeout in milliseconds
     * Default: 30000 (30 seconds)
     */
    timeoutMs?: number;
}

/**
 * Tool invocation returned by the LLM
 */
export interface LLMToolCall {
    /**
     * Tool name (must match a tool in the request)
     */
    name: string;

    /**
     * Tool arguments (validated against inputSchema)
     */
    arguments: Record<string, any>;
}

/**
 * Response from the LLM provider
 */
export interface LLMResponse {
    /**
     * The assistant's text response
     */
    content: string;

    /**
     * Tool calls, if any (when tools are available)
     */
    toolCalls?: LLMToolCall[];

    /**
     * Usage statistics
     */
    usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
    };

    /**
     * Provider-specific stop reason (for debugging)
     */
    stopReason?: string;

    /**
     * Timestamp when response was generated
     */
    generatedAt: Date;
}

/**
 * Provider error with retry information
 */
export class LLMProviderError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly retryable: boolean = false,
        public readonly statusCode?: number
    ) {
        super(message);
        this.name = "LLMProviderError";
    }
}

/**
 * Configuration for LLM provider behavior
 */
export interface LLMProviderConfig {
    /**
     * Maximum number of retries on retryable errors
     * Default: 3
     */
    maxRetries?: number;

    /**
     * Initial retry delay in milliseconds
     * Default: 100
     */
    initialRetryDelayMs?: number;

    /**
     * Maximum retry delay in milliseconds
     * Default: 5000
     */
    maxRetryDelayMs?: number;

    /**
     * Exponential backoff multiplier
     * Default: 2
     */
    retryBackoffMultiplier?: number;

    /**
     * Maximum context window (tokens) for this provider
     * Request exceeding this will be rejected or truncated
     */
    maxContextTokens?: number;

    /**
     * Maximum output tokens for this provider
     * Default: 4096
     */
    maxOutputTokens?: number;

    /**
     * Request timeout in milliseconds
     * Default: 30000
     */
    timeoutMs?: number;

    /**
     * Enable usage telemetry collection
     * Default: true
     */
    telemetry?: boolean;
}

/**
 * Usage metrics for telemetry
 */
export interface LLMUsageMetrics {
    /**
     * Timestamp of the request
     */
    timestamp: Date;

    /**
     * Correlation ID for tracing
     */
    correlationId: EntityId;

    /**
     * Provider name
     */
    provider: string;

    /**
     * Input tokens used
     */
    inputTokens: number;

    /**
     * Output tokens used
     */
    outputTokens: number;

    /**
     * Total tokens used
     */
    totalTokens: number;

    /**
     * Request duration in milliseconds
     */
    durationMs: number;

    /**
     * Whether the request succeeded
     */
    success: boolean;

    /**
     * Error code if failed (null if success)
     */
    errorCode?: string;

    /**
     * Number of retries used
     */
    retries: number;

    /**
     * Provider-specific stop reason
     */
    stopReason?: string;
}

/**
 * Telemetry handler for LLM usage
 */
export interface LLMTelemetryHandler {
    /**
     * Record usage metrics
     */
    recordUsage(metrics: LLMUsageMetrics): Promise<void>;

    /**
     * Get usage statistics
     */
    getUsageStats(
        correlationId: EntityId,
        startTime: Date,
        endTime: Date
    ): Promise<{
        totalRequests: number;
        totalTokens: number;
        totalCost: number;
        averageLatencyMs: number;
    }>;
}

/**
 * Provider-neutral LLM interface
 *
 * All implementations must:
 * - Support both streaming and non-streaming responses
 * - Handle retries transparently
 * - Provide usage telemetry
 * - Never expose provider-specific types in public API
 */
export interface LLMProvider {
    /**
     * Generate a response to the user message
     *
     * @param request - The request with messages and configuration
     * @returns The LLM response with content and usage info
     * @throws LLMProviderError if the request fails after retries
     */
    generateResponse(request: LLMRequest): Promise<LLMResponse>;

    /**
     * Get the name of this provider
     */
    getName(): string;

    /**
     * Get provider configuration
     */
    getConfig(): LLMProviderConfig;

    /**
     * Get the maximum context size in tokens
     */
    getMaxContextTokens(): number;

    /**
     * Validate that a request is within provider limits
     * Throws LLMProviderError if validation fails
     */
    validateRequest(request: LLMRequest): void;
}

/**
 * Factory for creating LLM providers
 */
export interface LLMProviderFactory {
    /**
     * Create a provider instance
     * @param providerName - The provider to use (e.g., "anthropic", "openai")
     * @param config - Provider configuration
     * @param telemetryHandler - Optional telemetry handler
     */
    createProvider(
        providerName: string,
        config?: LLMProviderConfig,
        telemetryHandler?: LLMTelemetryHandler
    ): LLMProvider;

    /**
     * Get supported provider names
     */
    getSupportedProviders(): string[];
}
