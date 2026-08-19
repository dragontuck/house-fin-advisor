/**
 * Base Provider Implementation
 *
 * Provides common functionality for all LLM providers:
 * - Retry logic with exponential backoff
 * - Timeout handling
 * - Request validation
 * - Telemetry collection
 */

import { EntityId } from "@house-fin/contracts";
import {
    LLMProvider,
    LLMProviderConfig,
    LLMProviderError,
    LLMRequest,
    LLMResponse,
    LLMTelemetryHandler,
    LLMUsageMetrics,
} from "./llm-provider";

/**
 * Base class for LLM provider implementations
 *
 * Subclasses must implement:
 * - generateResponseInternal() - the actual API call
 * - getName() - provider name
 * - getMaxContextTokens() - provider's context window
 */
export abstract class BaseProvider implements LLMProvider {
    protected config: LLMProviderConfig;
    protected telemetryHandler?: LLMTelemetryHandler;

    constructor(
        config?: LLMProviderConfig,
        telemetryHandler?: LLMTelemetryHandler
    ) {
        this.config = {
            maxRetries: 3,
            initialRetryDelayMs: 100,
            maxRetryDelayMs: 5000,
            retryBackoffMultiplier: 2,
            maxContextTokens: 200000,
            maxOutputTokens: 4096,
            timeoutMs: 30000,
            telemetry: true,
            ...config,
        };
        this.telemetryHandler = telemetryHandler;
    }

    /**
     * Generate response with automatic retries and telemetry
     */
    async generateResponse(request: LLMRequest): Promise<LLMResponse> {
        // Validate request
        this.validateRequest(request);

        const startTime = Date.now();
        let lastError: LLMProviderError | null = null;
        let retries = 0;

        // Retry loop with exponential backoff
        for (let attempt = 0; attempt <= (this.config.maxRetries || 3); attempt++) {
            try {
                if (attempt > 0) {
                    // Exponential backoff
                    const delayMs = Math.min(
                        (this.config.initialRetryDelayMs || 100) *
                        Math.pow(this.config.retryBackoffMultiplier || 2, attempt - 1),
                        this.config.maxRetryDelayMs || 5000
                    );
                    await this.delay(delayMs);
                    retries++;
                }

                // Call provider-specific implementation with timeout
                const timeoutMs = request.timeoutMs || this.config.timeoutMs || 30000;
                const response = await this.withTimeout(
                    this.generateResponseInternal(request),
                    timeoutMs
                );

                // Record successful telemetry
                if (this.telemetryHandler && this.config.telemetry) {
                    await this.recordTelemetry(
                        request.correlationId,
                        response,
                        Date.now() - startTime,
                        true,
                        null,
                        retries
                    );
                }

                return response;
            } catch (error) {
                lastError =
                    error instanceof LLMProviderError
                        ? error
                        : new LLMProviderError(
                            String(error),
                            "UNKNOWN_ERROR",
                            true
                        );

                // If not retryable or last attempt, throw
                if (!lastError.retryable || attempt === (this.config.maxRetries || 3)) {
                    // Record failed telemetry
                    if (this.telemetryHandler && this.config.telemetry) {
                        await this.recordTelemetry(
                            request.correlationId,
                            null,
                            Date.now() - startTime,
                            false,
                            lastError.code,
                            retries
                        );
                    }
                    throw lastError;
                }
            }
        }

        // Should not reach here, but ensure we throw
        if (lastError) {
            if (this.telemetryHandler && this.config.telemetry) {
                await this.recordTelemetry(
                    request.correlationId,
                    null,
                    Date.now() - startTime,
                    false,
                    lastError.code,
                    retries
                );
            }
            throw lastError;
        }

        throw new LLMProviderError(
            "Failed to generate response after retries",
            "MAX_RETRIES_EXCEEDED",
            false
        );
    }

    /**
     * Implementation-specific response generation
     * Must be implemented by subclasses
     */
    protected abstract generateResponseInternal(
        request: LLMRequest
    ): Promise<LLMResponse>;

    /**
     * Validate request within provider limits
     */
    validateRequest(request: LLMRequest): void {
        if (!request || !request.messages || request.messages.length === 0) {
            throw new LLMProviderError(
                "Request must have at least one message",
                "INVALID_REQUEST",
                false
            );
        }

        if (!request.correlationId) {
            throw new LLMProviderError(
                "Request must have correlationId",
                "MISSING_CORRELATION_ID",
                false
            );
        }

        // Estimate tokens (rough approximation: ~4 chars per token)
        const totalCharacters = request.messages.reduce(
            (sum, msg) => sum + msg.content.length,
            0
        );
        const estimatedTokens = Math.ceil(totalCharacters / 4);

        if (
            estimatedTokens > (this.config.maxContextTokens || 200000)
        ) {
            throw new LLMProviderError(
                `Request exceeds maximum context tokens (${estimatedTokens} > ${this.config.maxContextTokens})`,
                "CONTEXT_LIMIT_EXCEEDED",
                false
            );
        }

        if (
            request.maxOutputTokens &&
            request.maxOutputTokens > (this.config.maxOutputTokens || 4096)
        ) {
            throw new LLMProviderError(
                `maxOutputTokens exceeds provider limit (${request.maxOutputTokens} > ${this.config.maxOutputTokens})`,
                "OUTPUT_LIMIT_EXCEEDED",
                false
            );
        }
    }

    /**
     * Get provider configuration
     */
    getConfig(): LLMProviderConfig {
        return { ...this.config };
    }

    /**
     * Get maximum context tokens
     */
    abstract getMaxContextTokens(): number;

    /**
     * Get provider name
     */
    abstract getName(): string;

    /**
     * Record usage telemetry
     */
    protected async recordTelemetry(
        correlationId: EntityId,
        response: LLMResponse | null,
        durationMs: number,
        success: boolean,
        errorCode: string | null,
        retries: number
    ): Promise<void> {
        if (!this.telemetryHandler) return;

        const metrics: LLMUsageMetrics = {
            timestamp: new Date(),
            correlationId,
            provider: this.getName(),
            inputTokens: response?.usage.inputTokens || 0,
            outputTokens: response?.usage.outputTokens || 0,
            totalTokens: response?.usage.totalTokens || 0,
            durationMs,
            success,
            errorCode: errorCode || undefined,
            retries,
            stopReason: response?.stopReason,
        };

        try {
            await this.telemetryHandler.recordUsage(metrics);
        } catch (error) {
            console.error(
                `Failed to record telemetry for ${this.getName()}:`,
                error
            );
            // Don't throw - telemetry failure shouldn't break the request
        }
    }

    /**
     * Delay for retry backoff
     */
    protected delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Wrap a promise with a timeout
     */
    protected withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                setTimeout(() => {
                    reject(
                        new LLMProviderError(
                            `Request timeout after ${timeoutMs}ms`,
                            "TIMEOUT",
                            true,
                            408
                        )
                    );
                }, timeoutMs);
            }),
        ]);
    }
}
