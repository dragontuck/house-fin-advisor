/**
 * LLM Telemetry Handler
 *
 * Tracks LLM provider usage for:
 * - Cost monitoring
 * - Performance analytics
 * - Error tracking
 * - Rate limiting
 */

import { EntityId } from "@house-fin/contracts";
import {
    LLMTelemetryHandler,
    LLMUsageMetrics,
} from "./llm-provider";

/**
 * In-memory telemetry handler
 * Suitable for development and testing
 * For production, implement persistent storage
 */
export class InMemoryTelemetryHandler implements LLMTelemetryHandler {
    private metrics: LLMUsageMetrics[] = [];

    /**
     * Record usage metrics
     */
    async recordUsage(metrics: LLMUsageMetrics): Promise<void> {
        this.metrics.push(metrics);

        // Log summary
        console.log(
            `[LLM Usage] Provider: ${metrics.provider}, ` +
            `Tokens: ${metrics.totalTokens}, ` +
            `Duration: ${metrics.durationMs}ms, ` +
            `Success: ${metrics.success}${metrics.retries > 0 ? `, Retries: ${metrics.retries}` : ""}`
        );
    }

    /**
     * Get usage statistics
     */
    async getUsageStats(
        correlationId: EntityId,
        startTime: Date,
        endTime: Date
    ): Promise<{
        totalRequests: number;
        totalTokens: number;
        totalCost: number;
        averageLatencyMs: number;
    }> {
        const filtered = this.metrics.filter(
            (m) =>
                m.correlationId === correlationId &&
                m.timestamp >= startTime &&
                m.timestamp <= endTime
        );

        if (filtered.length === 0) {
            return {
                totalRequests: 0,
                totalTokens: 0,
                totalCost: 0,
                averageLatencyMs: 0,
            };
        }

        const totalTokens = filtered.reduce((sum, m) => sum + m.totalTokens, 0);
        const totalCost = this.calculateCost(filtered);
        const averageLatencyMs =
            filtered.reduce((sum, m) => sum + m.durationMs, 0) /
            filtered.length;

        return {
            totalRequests: filtered.length,
            totalTokens,
            totalCost,
            averageLatencyMs,
        };
    }

    /**
     * Calculate cost based on provider and token usage
     * Prices as of 2024 - update as needed
     */
    private calculateCost(metrics: LLMUsageMetrics[]): number {
        let totalCost = 0;

        for (const m of metrics) {
            if (!m.success) continue; // Don't charge for failed requests

            switch (m.provider.toLowerCase()) {
                case "anthropic":
                    // Anthropic Claude 3 pricing (per 1M tokens)
                    // Input: $3, Output: $15
                    totalCost +=
                        (m.inputTokens / 1000000) * 3 +
                        (m.outputTokens / 1000000) * 15;
                    break;

                case "openai":
                    // OpenAI GPT-4 pricing (per 1K tokens)
                    // Input: $0.03, Output: $0.06
                    totalCost +=
                        (m.inputTokens / 1000) * 0.03 +
                        (m.outputTokens / 1000) * 0.06;
                    break;

                case "gemini":
                    // Google Gemini pricing (per 1M tokens)
                    // Input: $0.5, Output: $1.50
                    totalCost +=
                        (m.inputTokens / 1000000) * 0.5 +
                        (m.outputTokens / 1000000) * 1.5;
                    break;

                // Ollama is free (self-hosted)
                case "ollama":
                default:
                    break;
            }
        }

        return totalCost;
    }

    /**
     * Get all metrics for debugging
     */
    getAllMetrics(): LLMUsageMetrics[] {
        return [...this.metrics];
    }

    /**
     * Clear metrics (useful for testing)
     */
    clearMetrics(): void {
        this.metrics = [];
    }
}

/**
 * No-op telemetry handler
 * Used when telemetry is disabled
 */
export class NoOpTelemetryHandler implements LLMTelemetryHandler {
    async recordUsage(_metrics: LLMUsageMetrics): Promise<void> {
        // No-op
    }

    async getUsageStats(
        _correlationId: EntityId,
        _startTime: Date,
        _endTime: Date
    ): Promise<{
        totalRequests: number;
        totalTokens: number;
        totalCost: number;
        averageLatencyMs: number;
    }> {
        return {
            totalRequests: 0,
            totalTokens: 0,
            totalCost: 0,
            averageLatencyMs: 0,
        };
    }
}

/**
 * Create telemetry handler based on configuration
 *
 * Environment variables:
 * - LLM_TELEMETRY_ENABLED: Enable telemetry (default: true)
 * - LLM_TELEMETRY_HANDLER: Handler type - "memory" or "noop" (default: "memory")
 */
export function createTelemetryHandler(
    enabled?: boolean
): LLMTelemetryHandler {
    const enabledFlag =
        enabled !== undefined
            ? enabled
            : process.env.LLM_TELEMETRY_ENABLED !== "false";

    if (!enabledFlag) {
        return new NoOpTelemetryHandler();
    }

    const handlerType = process.env.LLM_TELEMETRY_HANDLER || "memory";

    switch (handlerType.toLowerCase()) {
        case "memory":
            return new InMemoryTelemetryHandler();
        case "noop":
            return new NoOpTelemetryHandler();
        default:
            return new InMemoryTelemetryHandler();
    }
}
