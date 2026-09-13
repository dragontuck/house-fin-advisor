/**
 * OpenAI Provider Implementation
 *
 * Implements the LLMProvider interface for OpenAI's GPT API.
 *
 * Note: This file is intentionally minimalist to avoid exposing
 * OpenAI-specific types. All provider implementation details
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
    LLMToolCall,
} from "./llm-provider";

/**
 * OpenAI provider for GPT models
 *
 * Environment variables:
 * - OPENAI_API_KEY: API key for OpenAI
 * - OPENAI_MODEL: Model to use (default: gpt-4-turbo)
 * - OPENAI_ORG_ID: (Optional) OpenAI organization ID
 */
export class OpenAIProvider extends BaseProvider {
    private apiKey: string;
    private model: string;
    private orgId?: string;
    private apiBaseUrl: string = "https://api.openai.com/v1";

    constructor(
        config?: LLMProviderConfig,
        telemetryHandler?: LLMTelemetryHandler
    ) {
        super(config, telemetryHandler);

        // Get API key from environment
        this.apiKey = process.env.OPENAI_API_KEY || "";
        if (!this.apiKey) {
            throw new Error("OPENAI_API_KEY environment variable not set");
        }

        // Get model from environment or use default
        this.model = process.env.OPENAI_MODEL || "gpt-4-turbo";

        // Optional organization ID
        this.orgId = process.env.OPENAI_ORG_ID;

        // Set OpenAI-specific limits
        this.config.maxContextTokens = 128000; // GPT-4 Turbo context window
        this.config.maxOutputTokens = this.config.maxOutputTokens || 4096;
    }

    /**
     * Generate response using OpenAI API
     */
    protected async generateResponseInternal(
        request: LLMRequest
    ): Promise<LLMResponse> {
        const timeoutMs = request.timeoutMs || this.config.timeoutMs || 30000;

        // Build the request for OpenAI API
        const openaiRequest = {
            model: this.model,
            max_tokens: request.maxOutputTokens || this.config.maxOutputTokens || 4096,
            messages: request.messages.map((msg) => ({
                role: msg.role,
                content: msg.content,
            })),
            temperature: request.temperature || 0.7,
            ...(request.tools && request.tools.length > 0 && {
                tools: request.tools.map((tool) => ({
                    type: "function",
                    function: {
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.inputSchema,
                    },
                })),
            }),
        };

        try {
            const response = await this.callOpenAIAPI(openaiRequest, timeoutMs);
            return response;
        } catch (error) {
            throw this.mapOpenAIError(error);
        }
    }

    /**
     * Call the OpenAI API with timeout
     */
    private async callOpenAIAPI(
        request: any,
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
            this.makeOpenAIRequest(request)
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
     * Make the actual HTTP request to OpenAI
     */
    private async makeOpenAIRequest(request: any): Promise<LLMResponse> {
        // Using native fetch (Node.js 18+)
        const url = `${this.apiBaseUrl}/chat/completions`;

        const headers: Record<string, string> = {
            Authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
        };

        // Add organization ID if provided
        if (this.orgId) {
            headers["OpenAI-Organization"] = this.orgId;
        }

        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
        }

        interface OpenAITextContent { type: "text"; text: string }
        interface OpenAIToolUseContent { type: "function"; function: { name: string; arguments: string } }
        type OpenAIContentBlock = OpenAITextContent | OpenAIToolUseContent | { type: string };

        const data = (await response.json()) as {
            choices: Array<{
                message: {
                    content: string | null;
                    tool_calls?: Array<{
                        id: string;
                        type: string;
                        function: { name: string; arguments: string };
                    }>;
                };
                finish_reason?: string;
            }>;
            usage: { prompt_tokens: number; completion_tokens: number };
        };

        // Parse OpenAI response format
        const choice = data.choices[0];
        if (!choice || !choice.message) {
            throw new Error("Invalid OpenAI response: no message content");
        }

        let content = choice.message.content || "";
        const toolCalls: LLMToolCall[] = [];

        if (choice.message.tool_calls && Array.isArray(choice.message.tool_calls)) {
            for (const toolCall of choice.message.tool_calls) {
                toolCalls.push({
                    name: toolCall.function.name,
                    arguments: JSON.parse(toolCall.function.arguments),
                });
            }
        }

        return {
            content,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            usage: {
                inputTokens: data.usage.prompt_tokens,
                outputTokens: data.usage.completion_tokens,
                totalTokens: data.usage.prompt_tokens + data.usage.completion_tokens,
            },
            stopReason: choice.finish_reason,
            generatedAt: new Date(),
        };
    }

    /**
     * Map OpenAI API errors to our error format
     */
    private mapOpenAIError(error: any): LLMProviderError {
        const message = error instanceof Error ? error.message : String(error);

        // Check for specific OpenAI error patterns
        if (message.includes("401") || message.includes("Unauthorized")) {
            return new LLMProviderError(
                "OpenAI API authentication failed",
                "AUTH_FAILED",
                false,
                401
            );
        }

        if (message.includes("429")) {
            return new LLMProviderError(
                "OpenAI rate limit exceeded",
                "RATE_LIMIT",
                true,
                429
            );
        }

        if (message.includes("500") || message.includes("502") || message.includes("503")) {
            return new LLMProviderError(
                "OpenAI API server error",
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

        if (message.includes("context_length_exceeded")) {
            return new LLMProviderError(
                "Message exceeds context window",
                "CONTEXT_LENGTH_EXCEEDED",
                false,
                400
            );
        }

        if (message.includes("invalid") || message.includes("malformed")) {
            return new LLMProviderError(
                "Invalid request to OpenAI API",
                "INVALID_REQUEST",
                false,
                400
            );
        }

        // Default: assume retryable for transient errors
        return new LLMProviderError(message, "API_ERROR", true);
    }

    /**
     * Get provider name
     */
    getName(): string {
        return "openai";
    }

    /**
     * Get maximum context tokens for GPT-4 Turbo
     */
    getMaxContextTokens(): number {
        return 128000; // GPT-4 Turbo context window
    }
}
