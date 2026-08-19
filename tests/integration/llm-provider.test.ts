/**
 * LLM Provider Tests
 *
 * Tests for provider-neutral abstraction:
 * - Request validation
 * - Retry logic with exponential backoff
 * - Timeout handling
 * - Telemetry collection
 * - Error handling
 * - Tool call parsing
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { EntityId } from "@house-fin/contracts";
import {
    LLMProvider,
    LLMRequest,
    LLMResponse,
    LLMProviderError,
    LLMProviderConfig,
} from "@house-fin/ai";
import { BaseProvider } from "@house-fin/ai";
import {
    InMemoryTelemetryHandler,
    NoOpTelemetryHandler,
    createTelemetryHandler,
} from "@house-fin/ai";
import { getProviderFactory, setGlobalProviderFactory, DefaultLLMProviderFactory } from "@house-fin/ai";

/**
 * Mock provider for testing
 */
class MockProvider extends BaseProvider {
    public callCount = 0;
    public shouldFail = false;
    public failureCode = "TEST_ERROR";
    public failureRetryable = true;
    public responseDelay = 0;

    protected async generateResponseInternal(
        request: LLMRequest
    ): Promise<LLMResponse> {
        this.callCount++;

        // Simulate delay
        if (this.responseDelay > 0) {
            await new Promise((resolve) =>
                setTimeout(resolve, this.responseDelay)
            );
        }

        // Simulate failure
        if (this.shouldFail) {
            throw new LLMProviderError(
                "Mock failure",
                this.failureCode,
                this.failureRetryable
            );
        }

        // Return mock response
        return {
            content: "Mock response",
            usage: {
                inputTokens: 10,
                outputTokens: 20,
                totalTokens: 30,
            },
            generatedAt: new Date(),
        };
    }

    getName(): string {
        return "mock";
    }

    getMaxContextTokens(): number {
        return 100000;
    }
}

describe("LLM Provider Abstraction", () => {
    let provider: MockProvider;
    let telemetryHandler: InMemoryTelemetryHandler;

    beforeEach(() => {
        telemetryHandler = new InMemoryTelemetryHandler();
        provider = new MockProvider(
            {
                maxRetries: 3,
                initialRetryDelayMs: 10,
                maxRetryDelayMs: 100,
                retryBackoffMultiplier: 2,
                timeoutMs: 5000,
            },
            telemetryHandler
        );
    });

    describe("Request validation", () => {
        it("should reject empty messages", async () => {
            const request: LLMRequest = {
                correlationId: "test-123" as EntityId,
                messages: [],
            };

            expect(() => provider.validateRequest(request)).toThrow(
                LLMProviderError
            );
        });

        it("should reject missing correlationId", async () => {
            const request: any = {
                messages: [{ role: "user", content: "Hello" }],
            };

            expect(() => provider.validateRequest(request)).toThrow(
                LLMProviderError
            );
        });

        it("should reject requests exceeding context limit", async () => {
            const largeContent = "x".repeat(1000000); // Very large content
            const request: LLMRequest = {
                correlationId: "test-123" as EntityId,
                messages: [{ role: "user", content: largeContent }],
            };

            expect(() => provider.validateRequest(request)).toThrow(
                "exceeds maximum context"
            );
        });

        it("should validate successful request", async () => {
            const request: LLMRequest = {
                correlationId: "test-123" as EntityId,
                messages: [{ role: "user", content: "Hello" }],
            };

            expect(() => provider.validateRequest(request)).not.toThrow();
        });
    });

    describe("Successful responses", () => {
        it("should return response with correct structure", async () => {
            const request: LLMRequest = {
                correlationId: "test-123" as EntityId,
                messages: [{ role: "user", content: "Hello" }],
            };

            const response = await provider.generateResponse(request);

            expect(response).toHaveProperty("content");
            expect(response).toHaveProperty("usage");
            expect(response.usage).toHaveProperty("inputTokens");
            expect(response.usage).toHaveProperty("outputTokens");
            expect(response.usage).toHaveProperty("totalTokens");
            expect(response).toHaveProperty("generatedAt");
        });

        it("should record successful telemetry", async () => {
            const request: LLMRequest = {
                correlationId: "test-123" as EntityId,
                messages: [{ role: "user", content: "Hello" }],
            };

            await provider.generateResponse(request);

            const metrics = telemetryHandler.getAllMetrics();
            expect(metrics).toHaveLength(1);
            expect(metrics[0].success).toBe(true);
            expect(metrics[0].provider).toBe("mock");
            expect(metrics[0].totalTokens).toBe(30);
        });
    });

    describe("Retry logic with exponential backoff", () => {
        it("should retry on retryable errors", async () => {
            // Track retry attempts
            let attemptCount = 0;

            // Create a new provider that fails twice then succeeds
            class RetryTestProvider extends BaseProvider {
                protected async generateResponseInternal(
                    request: LLMRequest
                ): Promise<LLMResponse> {
                    attemptCount++;
                    if (attemptCount < 3) {
                        throw new LLMProviderError(
                            "Transient error",
                            "TRANSIENT_ERROR",
                            true
                        );
                    }
                    return {
                        content: "Mock response",
                        usage: {
                            inputTokens: 10,
                            outputTokens: 20,
                            totalTokens: 30,
                        },
                        generatedAt: new Date(),
                    };
                }

                getName(): string {
                    return "retry-test";
                }

                getMaxContextTokens(): number {
                    return 100000;
                }
            }

            const testProvider = new RetryTestProvider(
                {
                    maxRetries: 3,
                    initialRetryDelayMs: 10,
                    maxRetryDelayMs: 100,
                },
                telemetryHandler
            );

            const request: LLMRequest = {
                correlationId: "test-123" as EntityId,
                messages: [{ role: "user", content: "Hello" }],
            };

            const response = await testProvider.generateResponse(request);

            expect(response.content).toBe("Mock response");
            expect(attemptCount).toBe(3);
        });

        it("should not retry on non-retryable errors", async () => {
            provider.shouldFail = true;
            provider.failureRetryable = false;
            provider.failureCode = "AUTH_FAILED";

            const request: LLMRequest = {
                correlationId: "test-123" as EntityId,
                messages: [{ role: "user", content: "Hello" }],
            };

            await expect(provider.generateResponse(request)).rejects.toThrow(
                LLMProviderError
            );

            expect(provider.callCount).toBe(1); // No retries
        });

        it("should respect max retries", async () => {
            provider.shouldFail = true;
            provider.failureRetryable = true;

            const request: LLMRequest = {
                correlationId: "test-123" as EntityId,
                messages: [{ role: "user", content: "Hello" }],
            };

            await expect(provider.generateResponse(request)).rejects.toThrow(
                LLMProviderError
            );

            expect(provider.callCount).toBe(4); // 1 initial + 3 retries
        });
    });

    describe("Timeout handling", () => {
        it("should timeout on slow responses", async () => {
            provider.responseDelay = 1000; // 1 second delay

            const request: LLMRequest = {
                correlationId: "test-123" as EntityId,
                messages: [{ role: "user", content: "Hello" }],
                timeoutMs: 100, // 100ms timeout
            };

            await expect(provider.generateResponse(request)).rejects.toThrow(
                "timeout"
            );
        }, 10000); // Jest timeout

        it("should succeed within timeout", async () => {
            provider.responseDelay = 50; // 50ms delay

            const request: LLMRequest = {
                correlationId: "test-123" as EntityId,
                messages: [{ role: "user", content: "Hello" }],
                timeoutMs: 500, // 500ms timeout
            };

            const response = await provider.generateResponse(request);

            expect(response.content).toBe("Mock response");
        });
    });

    describe("Telemetry collection", () => {
        it("should collect usage metrics on success", async () => {
            const request: LLMRequest = {
                correlationId: "test-correlation-id" as EntityId,
                messages: [{ role: "user", content: "Hello" }],
            };

            await provider.generateResponse(request);

            const metrics = telemetryHandler.getAllMetrics();
            expect(metrics).toHaveLength(1);
            expect(metrics[0].success).toBe(true);
            expect(metrics[0].correlationId).toBe("test-correlation-id");
            expect(metrics[0].inputTokens).toBe(10);
            expect(metrics[0].outputTokens).toBe(20);
        });

        it("should collect metrics on failure", async () => {
            provider.shouldFail = true;
            provider.failureRetryable = false;

            const request: LLMRequest = {
                correlationId: "test-correlation-id" as EntityId,
                messages: [{ role: "user", content: "Hello" }],
            };

            try {
                await provider.generateResponse(request);
            } catch {
                // Expected to fail
            }

            const metrics = telemetryHandler.getAllMetrics();
            expect(metrics).toHaveLength(1);
            expect(metrics[0].success).toBe(false);
            expect(metrics[0].errorCode).toBe("TEST_ERROR");
        });

        it("should track retry count in telemetry", async () => {
            provider.shouldFail = true;
            provider.failureRetryable = false;

            const request: LLMRequest = {
                correlationId: "test-correlation-id" as EntityId,
                messages: [{ role: "user", content: "Hello" }],
            };

            try {
                await provider.generateResponse(request);
            } catch {
                // Expected to fail
            }

            const metrics = telemetryHandler.getAllMetrics();
            expect(metrics[0].retries).toBe(0); // No retries for non-retryable
        });
    });

    describe("Provider configuration", () => {
        it("should return config", () => {
            const config = provider.getConfig();

            expect(config).toHaveProperty("maxRetries");
            expect(config).toHaveProperty("timeoutMs");
            expect(config.maxRetries).toBe(3);
        });

        it("should get max context tokens", () => {
            const maxTokens = provider.getMaxContextTokens();

            expect(maxTokens).toBe(100000);
        });

        it("should get provider name", () => {
            const name = provider.getName();

            expect(name).toBe("mock");
        });
    });

    describe("Error mapping", () => {
        it("should map errors to LLMProviderError", async () => {
            provider.shouldFail = true;
            provider.failureRetryable = true;  // This error IS retryable
            provider.failureCode = "TRANSIENT_ERROR";

            const request: LLMRequest = {
                correlationId: "test-123" as EntityId,
                messages: [{ role: "user", content: "Hello" }],
            };

            try {
                await provider.generateResponse(request);
                fail("Should have thrown error");
            } catch (error) {
                expect(error instanceof LLMProviderError).toBe(true);
                if (error instanceof LLMProviderError) {
                    expect(error.code).toBe("TRANSIENT_ERROR");
                    expect(error.retryable).toBe(true);
                }
            }
        });
    });
});

describe("Provider Factory", () => {
    beforeEach(() => {
        // Reset to default factory
        setGlobalProviderFactory(new DefaultLLMProviderFactory());
    });

    it("should get supported providers", () => {
        const factory = getProviderFactory();
        const supported = factory.getSupportedProviders();

        expect(supported).toContain("anthropic");
        expect(supported.length).toBeGreaterThan(0);
    });

    it("should throw for unsupported provider", () => {
        const factory = getProviderFactory();

        expect(() => factory.createProvider("unsupported")).toThrow();
    });
});

describe("Telemetry Handlers", () => {
    it("should use noop handler when disabled", async () => {
        const handler = createTelemetryHandler(false);

        expect(handler instanceof NoOpTelemetryHandler).toBe(true);
    });

    it("should use memory handler by default", async () => {
        const handler = createTelemetryHandler(true);

        expect(handler instanceof InMemoryTelemetryHandler).toBe(true);
    });

    it("should calculate cost correctly", async () => {
        const handler = new InMemoryTelemetryHandler();

        await handler.recordUsage({
            timestamp: new Date(),
            correlationId: "test-123" as EntityId,
            provider: "anthropic",
            inputTokens: 1000000,
            outputTokens: 1000000,
            totalTokens: 2000000,
            durationMs: 100,
            success: true,
            retries: 0,
        });

        const stats = await handler.getUsageStats(
            "test-123" as EntityId,
            new Date(Date.now() - 1000000),
            new Date(Date.now() + 1000000)
        );

        // Cost for Anthropic: (1M * $3) + (1M * $15) = $18
        expect(stats.totalCost).toBeCloseTo(18, 0);
    });
});
