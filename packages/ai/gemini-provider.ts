/**
 * Google Gemini Provider Implementation
 *
 * Implements the LLMProvider interface for Google's Gemini API.
 *
 * Note: This file is intentionally minimalist to avoid exposing
 * Gemini-specific types. All provider implementation details
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
 * Google Gemini provider for Gemini models
 *
 * Environment variables:
 * - GEMINI_API_KEY: API key for Google Gemini
 * - GEMINI_MODEL: Model to use (default: gemini-1.5-pro)
 */
export class GeminiProvider extends BaseProvider {
    private apiKey: string;
    private model: string;
    private apiBaseUrl: string = "https://generativelanguage.googleapis.com/v1beta/openai";

    constructor(
        config?: LLMProviderConfig,
        telemetryHandler?: LLMTelemetryHandler
    ) {
        super(config, telemetryHandler);

        // Get API key from environment
        this.apiKey = process.env.GEMINI_API_KEY || "";
        if (!this.apiKey) {
            throw new Error("GEMINI_API_KEY environment variable not set");
        }

        // Get model from environment or use default
        this.model = process.env.GEMINI_MODEL || "gemini-1.5-pro";

        // Set Gemini-specific limits
        this.config.maxContextTokens = 1000000; // Gemini 1.5 context window
        this.config.maxOutputTokens = this.config.maxOutputTokens || 8192;
    }

    /**
     * Generate response using Google Gemini API
     */
    protected async generateResponseInternal(
        request: LLMRequest
    ): Promise<LLMResponse> {
        const timeoutMs = request.timeoutMs || this.config.timeoutMs || 30000;

        // Convert messages to Gemini format
        const contents = request.messages
            .filter((msg) => msg.role !== "system") // Gemini handles system differently
            .map((msg) => ({
                role: msg.role === "assistant" ? "model" : "user",
                parts: [{ text: msg.content }],
            }));

        // Build the request for Gemini API
        const geminiRequest = {
            contents,
            generationConfig: {
                temperature: request.temperature || 0.7,
                maxOutputTokens: request.maxOutputTokens || this.config.maxOutputTokens || 8192,
            },
            ...(request.tools && request.tools.length > 0 && {
                tools: [
                    {
                        googleSearch: {}, // Enable Google Search tool if available
                    },
                    {
                        functionDeclarations: request.tools.map((tool) => ({
                            name: tool.name,
                            description: tool.description,
                            parameters: {
                                type: "OBJECT",
                                properties: this.convertSchemaToGemini(tool.inputSchema),
                                required: this.extractRequiredFields(tool.inputSchema),
                            },
                        })),
                    },
                ],
            }),
        };

        // Handle system message separately for Gemini
        let systemInstruction = "";
        const systemMsg = request.messages.find((msg) => msg.role === "system");
        if (systemMsg) {
            systemInstruction = systemMsg.content;
        }

        try {
            const response = await this.callGeminiAPI(
                geminiRequest,
                systemInstruction,
                timeoutMs
            );
            return response;
        } catch (error) {
            throw this.mapGeminiError(error);
        }
    }

    /**
     * Convert JSON Schema to Gemini schema format
     */
    private convertSchemaToGemini(schema: any): Record<string, any> {
        if (!schema || !schema.properties) {
            return {};
        }

        const properties: Record<string, any> = {};
        for (const [key, value] of Object.entries(schema.properties)) {
            const prop = value as Record<string, any>;
            properties[key] = {
                type: this.mapJsonSchemaTypeToGemini(prop.type),
                description: prop.description,
            };
        }

        return properties;
    }

    /**
     * Map JSON Schema types to Gemini types
     */
    private mapJsonSchemaTypeToGemini(type: string): string {
        const typeMap: Record<string, string> = {
            string: "STRING",
            number: "NUMBER",
            integer: "INTEGER",
            boolean: "BOOLEAN",
            array: "ARRAY",
            object: "OBJECT",
        };

        return typeMap[type] || "STRING";
    }

    /**
     * Extract required fields from JSON schema
     */
    private extractRequiredFields(schema: any): string[] {
        return schema.required || [];
    }

    /**
     * Call the Google Gemini API with timeout
     */
    private async callGeminiAPI(
        request: any,
        systemInstruction: string,
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
            this.makeGeminiRequest(request, systemInstruction)
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
     * Make the actual HTTP request to Google Gemini
     */
    private async makeGeminiRequest(
        request: any,
        systemInstruction: string
    ): Promise<LLMResponse> {
        // Using Gemini API (compatible with OpenAI SDK)
        const url = `${this.apiBaseUrl}/chat/completions?key=${this.apiKey}`;

        const headers: Record<string, string> = {
            "content-type": "application/json",
        };

        const body = {
            model: this.model,
            ...request,
            ...(systemInstruction && { system: systemInstruction }),
        };

        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API error: ${JSON.stringify(errorData)}`);
        }

        interface GeminiTextContent { type: "text"; text: string }
        interface GeminiToolUseContent { type: "tool_use"; name: string; input: Record<string, unknown> }
        type GeminiContentBlock = GeminiTextContent | GeminiToolUseContent | { type: string };

        const data = (await response.json()) as {
            choices: Array<{
                message: {
                    content: string;
                    tool_calls?: Array<{
                        function: { name: string; arguments: string };
                    }>;
                };
            }>;
            usage: { prompt_tokens: number; completion_tokens: number };
        };

        // Parse Gemini response format
        const choice = data.choices[0];
        if (!choice || !choice.message) {
            throw new Error("Invalid Gemini response: no message content");
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
            stopReason: undefined,
            generatedAt: new Date(),
        };
    }

    /**
     * Map Google Gemini API errors to our error format
     */
    private mapGeminiError(error: any): LLMProviderError {
        const message = error instanceof Error ? error.message : String(error);

        // Check for specific Gemini error patterns
        if (message.includes("401") || message.includes("Unauthorized")) {
            return new LLMProviderError(
                "Gemini API authentication failed",
                "AUTH_FAILED",
                false,
                401
            );
        }

        if (message.includes("429")) {
            return new LLMProviderError(
                "Gemini rate limit exceeded",
                "RATE_LIMIT",
                true,
                429
            );
        }

        if (message.includes("500")) {
            return new LLMProviderError(
                "Gemini API server error",
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

        if (message.includes("invalid") || message.includes("malformed")) {
            return new LLMProviderError(
                "Invalid request to Gemini API",
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
        return "gemini";
    }

    /**
     * Get maximum context tokens for Gemini
     */
    getMaxContextTokens(): number {
        return 1000000; // Gemini 1.5 context window
    }
}
