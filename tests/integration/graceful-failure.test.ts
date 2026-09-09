/**
 * Graceful AI Failure Tests
 *
 * Verifies that every failure mode in the advisor pipeline (LLM unavailable, timeout,
 * rate limit, malformed response, invalid/unauthorized tool call, privacy rejection,
 * stale snapshot, financial engine unavailable) is classified correctly, produces a
 * safe non-technical message, and - critically - never invents data or reaches the LLM
 * when the underlying financial data itself can't be trusted.
 */

import { describe, it, expect } from "@jest/globals";
import { EntityId, AdvisorWorkflow } from "@house-fin/contracts";
import {
    AdvisorFailureCategory,
    classifyLLMError,
    classifyPrivacyError,
    classifyCriticalToolFailure,
    classifyStaleSnapshot,
    buildAdvisorFailure,
} from "@house-fin/ai";
import { LLMProviderError } from "@house-fin/ai";
import type { ToolExecutionResult, PlannedToolCall } from "@house-fin/ai";
import { AIOrchestrator } from "@house-fin/ai";
import { AIToolPlanner } from "@house-fin/ai";
import { AIToolExecutor } from "@house-fin/ai";
import { BaseProvider } from "@house-fin/ai";
import type { LLMRequest, LLMResponse } from "@house-fin/ai";
import { PrivacyGateway } from "@house-fin/security";

function toolResult(overrides: Partial<ToolExecutionResult> & { toolName: string }): ToolExecutionResult {
    return {
        sequence: 0,
        success: true,
        durationMs: 5,
        retries: 0,
        executedAt: new Date(),
        ...overrides,
    };
}

function plannedTool(overrides: Partial<PlannedToolCall> & { toolName: string; sequence: number }): PlannedToolCall {
    return {
        rationale: "test",
        isCritical: true,
        dependsOn: [],
        passToLLM: true,
        ...overrides,
    };
}

describe("classifyLLMError", () => {
    it("classifies a TIMEOUT provider error", () => {
        const failure = classifyLLMError(new LLMProviderError("timed out", "TIMEOUT", true, 408));
        expect(failure.category).toBe(AdvisorFailureCategory.LLM_TIMEOUT);
        expect(failure.retryable).toBe(true);
    });

    it("classifies a RATE_LIMIT provider error", () => {
        const failure = classifyLLMError(new LLMProviderError("too many requests", "RATE_LIMIT", true, 429));
        expect(failure.category).toBe(AdvisorFailureCategory.LLM_RATE_LIMITED);
    });

    it("classifies any other provider error as LLM unavailable", () => {
        const failure = classifyLLMError(new LLMProviderError("auth failed", "AUTH_FAILED", false, 401));
        expect(failure.category).toBe(AdvisorFailureCategory.LLM_UNAVAILABLE);
        expect(failure.userMessage).toBe(
            "Your financial information is available, but I couldn't generate the explanation right now."
        );
    });

    it("classifies a non-provider error as a malformed response", () => {
        const failure = classifyLLMError(new SyntaxError("Unexpected token in JSON"));
        expect(failure.category).toBe(AdvisorFailureCategory.LLM_MALFORMED_RESPONSE);
    });
});

describe("classifyPrivacyError", () => {
    it("never mentions the internal rule that was violated", () => {
        const failure = classifyPrivacyError();
        expect(failure.category).toBe(AdvisorFailureCategory.PRIVACY_REJECTED);
        expect(failure.userMessage).toBe(
            "The information required for this question can't currently be sent to the selected AI provider."
        );
        expect(failure.userMessage.toLowerCase()).not.toMatch(/rule|classif|restrict|ssn|account number/);
    });
});

describe("classifyCriticalToolFailure", () => {
    it("returns null when every critical tool succeeded", () => {
        const tools = [plannedTool({ toolName: "get_budget_status", sequence: 0, isCritical: true })];
        const results = [toolResult({ toolName: "get_budget_status", sequence: 0, success: true })];
        expect(classifyCriticalToolFailure(tools, results)).toBeNull();
    });

    it("ignores a failed non-critical tool", () => {
        const tools = [plannedTool({ toolName: "get_attention_items", sequence: 0, isCritical: false })];
        const results = [toolResult({ toolName: "get_attention_items", sequence: 0, success: false, error: "boom" })];
        expect(classifyCriticalToolFailure(tools, results)).toBeNull();
    });

    it("classifies an unregistered critical tool as an invalid tool call", () => {
        const tools = [plannedTool({ toolName: "made_up_tool", sequence: 0, isCritical: true })];
        const results = [
            toolResult({ toolName: "made_up_tool", sequence: 0, success: false, error: "Tool 'made_up_tool' not registered" }),
        ];
        expect(classifyCriticalToolFailure(tools, results)?.category).toBe(AdvisorFailureCategory.INVALID_TOOL_CALL);
    });

    it("classifies a critical authorization failure as an unauthorized tool call", () => {
        const tools = [plannedTool({ toolName: "create_initial_budget", sequence: 0, isCritical: true })];
        const results = [
            toolResult({
                toolName: "create_initial_budget",
                sequence: 0,
                success: false,
                error: "Authorization failed: Tool 'create_initial_budget' requires household owner authorization",
            }),
        ];
        expect(classifyCriticalToolFailure(tools, results)?.category).toBe(
            AdvisorFailureCategory.UNAUTHORIZED_TOOL_CALL
        );
    });

    it("classifies any other critical tool failure as the financial engine being unavailable", () => {
        const tools = [plannedTool({ toolName: "get_budget_status", sequence: 0, isCritical: true })];
        const results = [
            toolResult({ toolName: "get_budget_status", sequence: 0, success: false, error: "connection refused" }),
        ];
        const failure = classifyCriticalToolFailure(tools, results);
        expect(failure?.category).toBe(AdvisorFailureCategory.FINANCIAL_ENGINE_UNAVAILABLE);
        expect(failure?.userMessage).toBe(
            "I can't safely answer this financial question because the current calculation service is unavailable."
        );
    });
});

describe("classifyStaleSnapshot", () => {
    it("returns null when there is no dated data to judge", () => {
        expect(classifyStaleSnapshot([toolResult({ toolName: "get_debt_summary", data: { totalDebtCents: 100 } })])).toBeNull();
    });

    it("returns null when the freshest data is recent", () => {
        const recent = new Date();
        const results = [toolResult({ toolName: "get_cash_flow", data: { asOf: recent.toISOString() } })];
        expect(classifyStaleSnapshot(results, recent)).toBeNull();
    });

    it("flags stale data older than the freshness threshold", () => {
        const now = new Date("2027-03-01T00:00:00Z");
        const old = new Date("2027-01-01T00:00:00Z"); // ~59 days before `now`
        const results = [toolResult({ toolName: "get_financial_snapshot", data: { snapshot: { asOf: old } } })];
        const failure = classifyStaleSnapshot(results, now);
        expect(failure?.category).toBe(AdvisorFailureCategory.STALE_SNAPSHOT);
    });
});

/** Minimal, fully controllable LLM provider for orchestrator-level tests. */
class ScriptedProvider extends BaseProvider {
    public callCount = 0;
    constructor(private script: () => Promise<LLMResponse>) {
        super({ maxRetries: 0 });
    }
    protected async generateResponseInternal(_request: LLMRequest): Promise<LLMResponse> {
        this.callCount++;
        return this.script();
    }
    getName(): string {
        return "scripted";
    }
    getMaxContextTokens(): number {
        return 100000;
    }
}

function buildOrchestrator(provider: ScriptedProvider, registerTools: (executor: AIToolExecutor) => void) {
    const executor = new AIToolExecutor();
    registerTools(executor);
    return {
        orchestrator: new AIOrchestrator(new AIToolPlanner(), executor, provider, new PrivacyGateway()),
    };
}

function baseRequest(overrides: Partial<Parameters<AIOrchestrator["processRequest"]>[0]> = {}) {
    return {
        correlationId: "corr-1" as EntityId,
        userMessage: "How are we doing financially?",
        workflowType: AdvisorWorkflow.BUDGET_STATUS,
        householdId: "household-1" as EntityId,
        memberId: "member-1" as EntityId,
        isHouseholdOwner: true,
        financialContext: {},
        ...overrides,
    };
}

describe("AIOrchestrator graceful failure end-to-end", () => {
    it("succeeds normally when every step works", async () => {
        const provider = new ScriptedProvider(async () => ({
            content: "Your remaining budget this month is $100.",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            generatedAt: new Date(),
        }));
        const { orchestrator } = buildOrchestrator(provider, (executor) => {
            executor.registerTool("get_budget_status", async () => ({ status: "ON_TRACK", totalRemainingCents: 10000 }));
            executor.registerTool("get_attention_items", async () => ({ items: [] }));
        });

        const response = await orchestrator.processRequest(baseRequest());
        expect(response.success).toBe(true);
        expect(response.assistantMessage).toContain("$100");
        expect(provider.callCount).toBe(1);
    });

    it("handles an unavailable LLM without touching the tool data", async () => {
        const provider = new ScriptedProvider(async () => {
            throw new LLMProviderError("down", "SERVER_ERROR", false, 503);
        });
        const { orchestrator } = buildOrchestrator(provider, (executor) => {
            executor.registerTool("get_budget_status", async () => ({ status: "ON_TRACK" }));
            executor.registerTool("get_attention_items", async () => ({ items: [] }));
        });

        const response = await orchestrator.processRequest(baseRequest());
        expect(response.success).toBe(false);
        expect(response.metadata.failureCategory).toBe(AdvisorFailureCategory.LLM_UNAVAILABLE);
        expect(response.metadata.retryable).toBe(true);
        expect(response.assistantMessage).toBe(
            "Your financial information is available, but I couldn't generate the explanation right now."
        );
    });

    it("handles an LLM timeout", async () => {
        const provider = new ScriptedProvider(async () => {
            throw new LLMProviderError("timed out", "TIMEOUT", true, 408);
        });
        const { orchestrator } = buildOrchestrator(provider, (executor) => {
            executor.registerTool("get_budget_status", async () => ({ status: "ON_TRACK" }));
            executor.registerTool("get_attention_items", async () => ({ items: [] }));
        });

        const response = await orchestrator.processRequest(baseRequest());
        expect(response.metadata.failureCategory).toBe(AdvisorFailureCategory.LLM_TIMEOUT);
    });

    it("handles LLM rate limiting", async () => {
        const provider = new ScriptedProvider(async () => {
            throw new LLMProviderError("rate limited", "RATE_LIMIT", true, 429);
        });
        const { orchestrator } = buildOrchestrator(provider, (executor) => {
            executor.registerTool("get_budget_status", async () => ({ status: "ON_TRACK" }));
            executor.registerTool("get_attention_items", async () => ({ items: [] }));
        });

        const response = await orchestrator.processRequest(baseRequest());
        expect(response.metadata.failureCategory).toBe(AdvisorFailureCategory.LLM_RATE_LIMITED);
    });

    it("handles a malformed (empty) LLM response", async () => {
        const provider = new ScriptedProvider(async () => ({
            content: "",
            usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
            generatedAt: new Date(),
        }));
        const { orchestrator } = buildOrchestrator(provider, (executor) => {
            executor.registerTool("get_budget_status", async () => ({ status: "ON_TRACK" }));
            executor.registerTool("get_attention_items", async () => ({ items: [] }));
        });

        const response = await orchestrator.processRequest(baseRequest());
        expect(response.metadata.failureCategory).toBe(AdvisorFailureCategory.LLM_MALFORMED_RESPONSE);
    });

    it("stops before calling the LLM when the financial engine is unavailable, and never invents values", async () => {
        const provider = new ScriptedProvider(async () => ({
            content: "should never be reached",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            generatedAt: new Date(),
        }));
        const { orchestrator } = buildOrchestrator(provider, (executor) => {
            executor.registerTool("get_budget_status", async () => {
                throw new Error("relation \"budgets\" does not exist");
            });
            executor.registerTool("get_attention_items", async () => ({ items: [] }));
        });

        const response = await orchestrator.processRequest(baseRequest());
        expect(response.success).toBe(false);
        expect(response.metadata.failureCategory).toBe(AdvisorFailureCategory.FINANCIAL_ENGINE_UNAVAILABLE);
        expect(response.assistantMessage).toBe(
            "I can't safely answer this financial question because the current calculation service is unavailable."
        );
        expect(response.assistantMessage).not.toMatch(/\$/); // no invented figures
        expect(provider.callCount).toBe(0); // LLM was never called
    }, 10000);

    it("rejects privacy-restricted context before ever calling the LLM, without leaking why", async () => {
        const provider = new ScriptedProvider(async () => ({
            content: "should never be reached",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            generatedAt: new Date(),
        }));
        const { orchestrator } = buildOrchestrator(provider, (executor) => {
            executor.registerTool("get_budget_status", async () => ({ status: "ON_TRACK" }));
            executor.registerTool("get_attention_items", async () => ({ items: [] }));
        });

        const response = await orchestrator.processRequest(
            baseRequest({ financialContext: { ssn: "123-45-6789" } })
        );
        expect(response.success).toBe(false);
        expect(response.metadata.failureCategory).toBe(AdvisorFailureCategory.PRIVACY_REJECTED);
        expect(response.assistantMessage).toBe(
            "The information required for this question can't currently be sent to the selected AI provider."
        );
        expect(provider.callCount).toBe(0);
    });

    it("flags a stale snapshot before calling the LLM", async () => {
        const provider = new ScriptedProvider(async () => ({
            content: "should never be reached",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            generatedAt: new Date(),
        }));
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 120);
        const { orchestrator } = buildOrchestrator(provider, (executor) => {
            executor.registerTool("get_budget_status", async () => ({ status: "ON_TRACK", calculatedAt: oldDate }));
            executor.registerTool("get_attention_items", async () => ({ items: [] }));
        });

        const response = await orchestrator.processRequest(baseRequest());
        expect(response.metadata.failureCategory).toBe(AdvisorFailureCategory.STALE_SNAPSHOT);
        expect(provider.callCount).toBe(0);
    });
});
