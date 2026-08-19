/**
 * Anthropic Provider Implementation
 *
 * Implements the LLMProvider interface for Anthropic's Claude API.
 * This is the initial external provider implementation.
 *
 * Note: This file is intentionally minimalist to avoid exposing
 * Anthropic-specific types. All provider implementation details
 * are internal to this module.
 */

import { EntityId } from "@house-fin/contracts";
import { BaseProvider } from "./base-provider";
import {
    LLMProviderConfig,
    LLMProviderError,
    LLMRequest,
    LLMResponse,
    LLMTelemetryHandler,
} from "./llm-provider";

/**
 * Anthropic provider for Claude models
 *
 * Environment variables:
 * - ANTHROPIC_API_KEY: API key for Anthropic
 * - ANTHROPIC_MODEL: Model to use (default: claude-3-sonnet-20240229)
 */
export class AnthropicProvider extends BaseProvider {
    private apiKey: string;
    private model: string;
    private apiBaseUrl: string = "https://api.anthropic.com/v1";

    constructor(
        config?: LLMProviderConfig,
        telemetryHandler?: LLMTelemetryHandler
    ) {
        super(config, telemetryHandler);

        // Get API key from environment
        this.apiKey = process.env.ANTHROPIC_API_KEY || "";
        if (!this.apiKey) {
            throw new Error("ANTHROPIC_API_KEY environment variable not set");
        }

        // Get model from environment or use default
        this.model = process.env.ANTHROPIC_MODEL || "claude-3-sonnet-20240229";

        // Set Anthropic-specific limits
        this.config.maxContextTokens = 200000; // Claude 3 context window
        this.config.maxOutputTokens = this.config.maxOutputTokens || 4096;
    }

    /**
     * Generate response using Anthropic API
     */
    protected async generateResponseInternal(
        request: LLMRequest
    ): Promise<LLMResponse> {
        const timeoutMs = request.timeoutMs || this.config.timeoutMs || 30000;

        // Build the request for Anthropic API
        const anthropicRequest = {
            model: this.model,
            max_tokens: request.maxOutputTokens || this.config.maxOutputTokens || 1024,
            messages: request.messages.map((msg) => ({
                role: msg.role === "system" ? "user" : msg.role, // Anthropic doesn't support system role in messages
                content: msg.content,
            })),
            temperature: request.temperature || 0.7,
            ...(request.tools && request.tools.length > 0 && {
                tools: request.tools.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    input_schema: tool.inputSchema,
                })),
            }),
        };

        // System message handling for Anthropic
        let systemMessage = "";
        const systemMsg = request.messages.find((msg) => msg.role === "system");
        if (systemMsg) {
            systemMessage = systemMsg.content;
        }

        try {
            const response = await this.callAnthropicAPI(
                anthropicRequest,
                systemMessage,
                timeoutMs
            );
            return response;
        } catch (error) {
            throw this.mapAnthropicError(error);
        }
    }

    /**
     * Call the Anthropic API with timeout
     */
    private async callAnthropicAPI(
        request: any,
        systemMessage: string,
        timeoutMs: number
    ): Promise<LLMResponse> {
        return new Promise((resolve, reject) => {
            // Set timeout
            const timeoutId = setTimeout(() => {
                reject(
                    new LLMProviderError(
                        `Request timeout after ${timeoutMs}ms`,
                        "TIMEOUT",
                        true,
                        408
                    )
                );
            }, timeoutMs);

            // Make the actual API call
            this.makeAnthropicRequest(request, systemMessage)
                .then((response) => {
                    clearTimeout(timeoutId);
                    resolve(response);
                })
                .catch((error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                });
        });
    }

    /**
     * Make the actual HTTP request to Anthropic
     */
    private async makeAnthropicRequest(
        request: any,
        systemMessage: string
    ): Promise<LLMResponse> {
        // Using native fetch (Node.js 18+)
        const url = `${this.apiBaseUrl}/messages`;

        const headers: Record<string, string> = {
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        };

        const body = {
            ...request,
            ...(systemMessage && { system: systemMessage }),
        };

        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Anthropic API error: ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();

        // Parse Anthropic response format
        let content = "";
        const toolCalls = [];

        for (const block of data.content) {
            if (block.type === "text") {
                content += block.text;
            } else if (block.type === "tool_use") {
                toolCalls.push({
                    name: block.name,
                    arguments: block.input,
                });
            }
        }

        return {
            content,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            usage: {
                inputTokens: data.usage.input_tokens,
                outputTokens: data.usage.output_tokens,
                totalTokens:
                    data.usage.input_tokens + data.usage.output_tokens,
            },
            stopReason: data.stop_reason,
            generatedAt: new Date(),
        };
    }

    /**
     * Map Anthropic API errors to our error format
     */
    private mapAnthropicError(error: any): LLMProviderError {
        const message = error instanceof Error ? error.message : String(error);

        // Check for specific Anthropic error patterns
        if (message.includes("401") || message.includes("Unauthorized")) {
            return new LLMProviderError(
                "Anthropic API authentication failed",
                "AUTH_FAILED",
                false,
                401
            );
        }

        if (message.includes("429")) {
            return new LLMProviderError(
                "Anthropic rate limit exceeded",
                "RATE_LIMIT",
                true,
                429
            );
        }

        if (message.includes("500")) {
            return new LLMProviderError(
                "Anthropic API server error",
                "SERVER_ERROR",
                true,
                500
            );
        }

        if (message.includes("timeout") || message.includes("TIMEOUT")) {
            return new LLMProviderError(
                "Request timeout",
                "TIMEOUT",
                true,
                408
            );
        }

        // Default: assume retryable for transient errors
        return new LLMProviderError(message, "API_ERROR", true);
    }

    /**
     * Get provider name
     */
    getName(): string {
        return "anthropic";
    }

    /**
     * Get maximum context tokens for Claude
     */
    getMaxContextTokens(): number {
        return 200000; // Claude 3 context window
    }
}
