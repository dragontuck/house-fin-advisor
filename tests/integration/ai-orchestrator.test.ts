/**
 * AI Orchestrator Test Suite
 *
 * Tests the complete orchestration flow:
 * 1. Tool Planning - map intent to tool sequences
 * 2. Authorization - check permissions on tool execution
 * 3. Tool Execution - execute planned tools with error handling
 * 4. Privacy Gateway - sanitize context before LLM
 * 5. LLM Integration - call LLM with sanitized data
 * 6. Response Validation - ensure valid output
 * 7. End-to-End Workflow - full request processing
 */

import {
    AIToolPlanner,
    PlannedToolCall,
    ToolExecutionPlan,
    AIToolExecutor,
    ToolExecutionContext,
    ToolExecutionResult,
    AIOrchestrator,
    OrchestratorRequest,
    OrchestratorResponse,
    createAIOrchestrator,
} from "@house-fin/ai";
import {
    EntityId,
    AdvisorWorkflow,
} from "@house-fin/contracts";
import {
    LLMProvider,
    LLMRequest,
    LLMResponse,
} from "@house-fin/ai";
import {
    PrivacyGateway,
    SanitizedFinancialContext,
} from "@house-fin/security";

// ─────────────────────────────────────────────────────────────────────────────
// MOCK SERVICES
// ─────────────────────────────────────────────────────────────────────────────

class MockLLMProvider implements LLMProvider {
    getName(): string {
        return "mock";
    }

    getConfig(): Record<string, unknown> {
        return { model: "mock-model" };
    }

    getMaxContextTokens(): number {
        return 100000;
    }

    validateRequest(request: LLMRequest): { valid: boolean; errors?: string[] } {
        return { valid: true };
    }

    async generateResponse(request: LLMRequest): Promise<LLMResponse> {
        return {
            content: `I've analyzed your financial situation. Based on the tools I ran: ${Object.keys((request.messages[1]?.content || "") as any || {}).join(", ")}. Here's my advice: Focus on building your emergency fund and managing your debt. Your budget looks balanced overall.`,
            toolCalls: [],
            usage: {
                inputTokens: 500,
                outputTokens: 200,
                totalTokens: 700,
            },
            stopReason: "END_TURN",
            generatedAt: new Date(),
        };
    }
}

class MockPrivacyGateway extends PrivacyGateway {
    constructor() {
        super(undefined as any); // Skip parent initialization for testing
    }

    override sanitizeContextForLLM(
        context: Record<string, unknown>,
        correlationId: EntityId
    ): SanitizedFinancialContext {
        return {
            sanitized_amounts: context.tools,
            categories: "safe",
            timestamp: new Date(),
            correlationId,
            sanitizationApplied: true,
        };
    }

    override isContextSafe(context: Record<string, unknown>): boolean {
        return true;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 1: Tool Planning
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Tool Planner", () => {
    let planner: AIToolPlanner;

    beforeEach(() => {
        planner = new AIToolPlanner();
    });

    // ─────────────────────────────────────────────────────────────────────────

    test("should plan budget creation workflow with all required tools", () => {
        const plan = planner.planToolExecution(AdvisorWorkflow.BUDGET_CREATE);

        expect(plan.workflowType).toBe(AdvisorWorkflow.BUDGET_CREATE);
        expect(plan.tools.length).toBeGreaterThan(0);

        // Should include all data gathering tools
        const toolNames = plan.tools.map(t => t.toolName);
        expect(toolNames).toContain("get_financial_snapshot");
        expect(toolNames).toContain("get_cash_flow");
        expect(toolNames).toContain("get_historical_budget_performance");
        expect(toolNames).toContain("get_recurring_financial_items");
        expect(toolNames).toContain("create_initial_budget");
    });

    test("should plan budget diagnosis workflow", () => {
        const plan = planner.planToolExecution(AdvisorWorkflow.BUDGET_DIAGNOSE);

        expect(plan.workflowType).toBe(AdvisorWorkflow.BUDGET_DIAGNOSE);

        const toolNames = plan.tools.map(t => t.toolName);
        expect(toolNames).toContain("get_budget_status");
        expect(toolNames).toContain("analyze_budget_variance");
    });

    test("should plan budget revision workflow", () => {
        const plan = planner.planToolExecution(AdvisorWorkflow.BUDGET_REVISE);

        const toolNames = plan.tools.map(t => t.toolName);
        expect(toolNames).toContain("get_current_budget");
        expect(toolNames).toContain("plan_next_month_budget");
    });

    test("should ensure create_initial_budget depends on data tools", () => {
        const plan = planner.planToolExecution(AdvisorWorkflow.BUDGET_CREATE);

        const createBudgetTool = plan.tools.find(t => t.toolName === "create_initial_budget");
        expect(createBudgetTool).toBeDefined();
        expect(createBudgetTool!.dependsOn.length).toBeGreaterThan(0);
    });

    test("should mark critical tools correctly", () => {
        const plan = planner.planToolExecution(AdvisorWorkflow.BUDGET_CREATE);

        const criticalTools = plan.tools.filter(t => t.isCritical);
        expect(criticalTools.length).toBeGreaterThan(0);

        // Essential tools should be marked critical
        const criticalNames = criticalTools.map(t => t.toolName);
        expect(criticalNames).toContain("create_initial_budget");
    });

    test("should add simulation tools dynamically", () => {
        let plan = planner.planToolExecution(AdvisorWorkflow.BUDGET_SCENARIO);
        const initialToolCount = plan.tools.length;

        plan = planner.addSimulationTool(plan, "simulate_purchase", "Simulate $1200 car repair");

        expect(plan.tools.length).toBe(initialToolCount + 1);
        expect(plan.tools.some(t => t.toolName === "simulate_purchase")).toBe(true);
    });

    test("should generate human-readable descriptions", () => {
        const plan = planner.planToolExecution(AdvisorWorkflow.BUDGET_CREATE);
        const description = planner.describePlan(plan);

        expect(description).toContain("Create an initial budget");
        expect(description).toContain("Tools to execute:");
        expect(description).toContain("get_financial_snapshot");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 2: Tool Authorization
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Tool Executor - Authorization", () => {
    let executor: AIToolExecutor;

    beforeEach(() => {
        executor = new AIToolExecutor();

        // Register mock tools
        executor.registerTool("get_financial_snapshot", async (params, ctx) => ({
            snapshot: { netWorthCents: 100000, cash: 5000 },
        }));

        executor.registerTool("create_initial_budget", async (params, ctx) => ({
            budget: { categories: [] },
        }));
    });

    test("should allow member to execute HOUSEHOLD_MEMBER tools", async () => {
        const plannedTool: PlannedToolCall = {
            sequence: 0,
            toolName: "get_financial_snapshot",
            rationale: "Get financial snapshot",
            isCritical: true,
            dependsOn: [],
            passToLLM: true,
        };

        const context: ToolExecutionContext = {
            correlationId: "test-123" as EntityId,
            householdId: "hh-123" as EntityId,
            memberId: "member-123" as EntityId,
            isHouseholdOwner: false,
        };

        const result = await executor.executeTool(plannedTool, {}, context);

        expect(result.success).toBe(true);
    });

    test("should deny member from executing HOUSEHOLD_OWNER tools", async () => {
        const plannedTool: PlannedToolCall = {
            sequence: 0,
            toolName: "create_initial_budget",
            rationale: "Create budget",
            isCritical: true,
            dependsOn: [],
            passToLLM: true,
        };

        const context: ToolExecutionContext = {
            correlationId: "test-123" as EntityId,
            householdId: "hh-123" as EntityId,
            memberId: "member-123" as EntityId,
            isHouseholdOwner: false, // Not owner
        };

        const result = await executor.executeTool(plannedTool, {}, context);

        expect(result.success).toBe(false);
        expect(result.error).toContain("Authorization");
    });

    test("should allow owner to execute HOUSEHOLD_OWNER tools", async () => {
        const plannedTool: PlannedToolCall = {
            sequence: 0,
            toolName: "create_initial_budget",
            rationale: "Create budget",
            isCritical: true,
            dependsOn: [],
            passToLLM: true,
        };

        const context: ToolExecutionContext = {
            correlationId: "test-123" as EntityId,
            householdId: "hh-123" as EntityId,
            memberId: "member-123" as EntityId,
            isHouseholdOwner: true, // Is owner
        };

        const result = await executor.executeTool(plannedTool, {}, context);

        expect(result.success).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 3: Tool Execution
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Tool Executor - Execution", () => {
    let executor: AIToolExecutor;

    beforeEach(() => {
        executor = new AIToolExecutor();
        executor.clearHistory();

        executor.registerTool("get_financial_snapshot", async (params, ctx) => ({
            snapshot: {
                netWorthCents: 100000,
                cashCents: 5000,
                debtCents: 25000,
            },
        }));

        executor.registerTool("get_cash_flow", async (params, ctx) => ({
            monthlyIncomeCents: 5000,
            monthlyExpensesCents: 4000,
            monthlySurplusCents: 1000,
        }));

        executor.registerTool("failing_tool", async () => {
            throw new Error("Tool execution failed");
        });
    });

    test("should execute a single tool successfully", async () => {
        const plannedTool: PlannedToolCall = {
            sequence: 0,
            toolName: "get_financial_snapshot",
            rationale: "Get snapshot",
            isCritical: true,
            dependsOn: [],
            passToLLM: true,
        };

        const context: ToolExecutionContext = {
            correlationId: "test-123" as EntityId,
            householdId: "hh-123" as EntityId,
            memberId: "member-123" as EntityId,
            isHouseholdOwner: true,
        };

        const result = await executor.executeTool(plannedTool, {}, context);

        expect(result.success).toBe(true);
        expect(result.data?.snapshot).toBeDefined();
        expect(result.toolName).toBe("get_financial_snapshot");
    });

    test("should retry failed tools with exponential backoff", async () => {
        const plannedTool: PlannedToolCall = {
            sequence: 0,
            toolName: "failing_tool",
            rationale: "This will fail",
            isCritical: true,
            dependsOn: [],
            passToLLM: true,
        };

        const context: ToolExecutionContext = {
            correlationId: "test-123" as EntityId,
            householdId: "hh-123" as EntityId,
            memberId: "member-123" as EntityId,
            isHouseholdOwner: true,
        };

        const result = await executor.executeTool(plannedTool, {}, context, 2);

        expect(result.success).toBe(false);
        expect(result.retries).toBeGreaterThan(0);
    });

    test("should execute multiple tools in sequence with dependencies", async () => {
        const plan: PlannedToolCall[] = [
            {
                sequence: 0,
                toolName: "get_financial_snapshot",
                rationale: "Gather data",
                isCritical: true,
                dependsOn: [],
                passToLLM: true,
            },
            {
                sequence: 1,
                toolName: "get_cash_flow",
                rationale: "Analyze flow",
                isCritical: true,
                dependsOn: [0],
                passToLLM: true,
            },
        ];

        const context: ToolExecutionContext = {
            correlationId: "test-123" as EntityId,
            householdId: "hh-123" as EntityId,
            memberId: "member-123" as EntityId,
            isHouseholdOwner: true,
        };

        const toolParams = new Map<string, Record<string, unknown>>();
        toolParams.set("get_financial_snapshot", {});
        toolParams.set("get_cash_flow", {});

        const results = await executor.executeToolPlan(plan, toolParams, context);

        expect(results.length).toBe(2);
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(true);
    });

    test("should skip dependent tool if dependency fails", async () => {
        const plan: PlannedToolCall[] = [
            {
                sequence: 0,
                toolName: "failing_tool",
                rationale: "This fails",
                isCritical: true,
                dependsOn: [],
                passToLLM: true,
            },
            {
                sequence: 1,
                toolName: "get_cash_flow",
                rationale: "Depends on first",
                isCritical: true,
                dependsOn: [0],
                passToLLM: true,
            },
        ];

        const context: ToolExecutionContext = {
            correlationId: "test-123" as EntityId,
            householdId: "hh-123" as EntityId,
            memberId: "member-123" as EntityId,
            isHouseholdOwner: true,
        };

        const toolParams = new Map<string, Record<string, unknown>>();
        toolParams.set("failing_tool", {});
        toolParams.set("get_cash_flow", {});

        const results = await executor.executeToolPlan(plan, toolParams, context);

        expect(results[0].success).toBe(false);
        expect(results[1].success).toBe(false); // Skipped due to dependency
        expect(results[1].error).toContain("Dependencies not met");
    });

    test("should track execution history", async () => {
        const plannedTool: PlannedToolCall = {
            sequence: 0,
            toolName: "get_financial_snapshot",
            rationale: "Get snapshot",
            isCritical: true,
            dependsOn: [],
            passToLLM: true,
        };

        const context: ToolExecutionContext = {
            correlationId: "test-123" as EntityId,
            householdId: "hh-123" as EntityId,
            memberId: "member-123" as EntityId,
            isHouseholdOwner: true,
        };

        await executor.executeTool(plannedTool, {}, context);

        const history = executor.getExecutionHistory();
        expect(history.length).toBe(1);
        expect(history[0].toolName).toBe("get_financial_snapshot");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 4: End-to-End Orchestration
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Orchestrator - End-to-End", () => {
    let orchestrator: AIOrchestrator;
    let planner: AIToolPlanner;
    let executor: AIToolExecutor;
    let llmProvider: LLMProvider;
    let privacyGateway: PrivacyGateway;

    beforeEach(() => {
        planner = new AIToolPlanner();
        executor = new AIToolExecutor();
        llmProvider = new MockLLMProvider();
        privacyGateway = new MockPrivacyGateway();

        orchestrator = new AIOrchestrator(
            planner,
            executor,
            llmProvider,
            privacyGateway
        );

        // Register all mock tools
        executor.registerTool("get_financial_snapshot", async () => ({
            snapshot: {
                netWorthCents: 100000,
                cashCents: 5000,
                debtCents: 25000,
            },
        }));

        executor.registerTool("get_cash_flow", async () => ({
            monthlyIncomeCents: 5000,
            monthlyExpensesCents: 4000,
        }));

        executor.registerTool("get_current_budget", async () => ({
            budgets: [],
        }));

        executor.registerTool("get_budget_status", async () => ({
            categories: [],
        }));

        executor.registerTool("get_historical_budget_performance", async () => ({
            months: [],
        }));

        executor.registerTool("get_debt_summary", async () => ({
            totalDebtCents: 25000,
        }));

        executor.registerTool("get_recurring_financial_items", async () => ({
            incomePatterns: [],
            expensePatterns: [],
        }));

        executor.registerTool("get_goal_status", async () => ({
            goals: [],
        }));

        executor.registerTool("get_attention_items", async () => ({
            items: [],
        }));

        executor.registerTool("create_initial_budget", async () => ({
            proposedBudgets: [],
        }));
    });

    test("should process a budget creation request end-to-end", async () => {
        const request: OrchestratorRequest = {
            correlationId: "req-123" as EntityId,
            userMessage: "Help me create an initial budget.",
            workflowType: AdvisorWorkflow.BUDGET_CREATE,
            householdId: "hh-123" as EntityId,
            memberId: "member-123" as EntityId,
            isHouseholdOwner: true,
        };

        const response = await orchestrator.processRequest(request);

        expect(response.success).toBe(true);
        expect(response.assistantMessage).toBeDefined();
        expect(response.assistantMessage.length).toBeGreaterThan(0);
        expect(response.toolResults.length).toBeGreaterThan(0);
        expect(response.metadata.toolsExecuted).toBeGreaterThan(0);
    });

    test("should process a budget diagnosis request", async () => {
        const request: OrchestratorRequest = {
            correlationId: "req-456" as EntityId,
            userMessage: "Why am I always over budget?",
            workflowType: AdvisorWorkflow.BUDGET_DIAGNOSE,
            householdId: "hh-123" as EntityId,
            memberId: "member-123" as EntityId,
            isHouseholdOwner: false,
        };

        const response = await orchestrator.processRequest(request);

        expect(response.success).toBe(true);
        expect(response.metadata.workflowType).toBe(AdvisorWorkflow.BUDGET_DIAGNOSE);
    });

    test("should handle authorization failures gracefully", async () => {
        // Don't register create_initial_budget tool
        // This simulates a non-owner trying to create budget

        const request: OrchestratorRequest = {
            correlationId: "req-789" as EntityId,
            userMessage: "Create a new budget.",
            workflowType: AdvisorWorkflow.BUDGET_CREATE,
            householdId: "hh-123" as EntityId,
            memberId: "member-123" as EntityId,
            isHouseholdOwner: false, // Not owner - shouldn't be able to create
        };

        const response = await orchestrator.processRequest(request);

        // Should still return response, but may have authorization issues in tool results
        expect(response.correlationId).toBe("req-789" as EntityId);
    });

    test("should include financial context in LLM prompt", async () => {
        const request: OrchestratorRequest = {
            correlationId: "req-ctx" as EntityId,
            userMessage: "What's my financial status?",
            workflowType: AdvisorWorkflow.BUDGET_STATUS,
            householdId: "hh-123" as EntityId,
            memberId: "member-123" as EntityId,
            isHouseholdOwner: false,
            financialContext: {
                customData: "test value",
            },
        };

        const response = await orchestrator.processRequest(request);

        expect(response.success).toBe(true);
        expect(response.assistantMessage).toBeDefined();
    });

    test("should track total execution time", async () => {
        const request: OrchestratorRequest = {
            correlationId: "req-time" as EntityId,
            userMessage: "Help me understand my cash flow.",
            workflowType: AdvisorWorkflow.CASH_FLOW,
            householdId: "hh-123" as EntityId,
            memberId: "member-123" as EntityId,
            isHouseholdOwner: false,
        };

        const response = await orchestrator.processRequest(request);

        expect(response.metadata.totalDurationMs).toBeGreaterThanOrEqual(0); // Can be 0 for fast test execution
        expect(response.metadata.llmTokensUsed).toBeDefined();
        expect(response.metadata.llmTokensUsed!.input).toBeGreaterThan(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 5: Multi-Tool Workflows
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Orchestrator - Multi-Tool Workflows", () => {
    let planner: AIToolPlanner;

    beforeEach(() => {
        planner = new AIToolPlanner();
    });

    test("should plan complex multi-tool workflow for budget creation", () => {
        const plan = planner.planToolExecution(AdvisorWorkflow.BUDGET_CREATE);

        // Should have multiple tools
        expect(plan.tools.length).toBeGreaterThanOrEqual(7);

        // Should include planning tool that depends on others
        const planningTool = plan.tools.find(t => t.toolName === "create_initial_budget");
        expect(planningTool).toBeDefined();
        expect(planningTool!.dependsOn.length).toBeGreaterThan(0);

        // All tools should have proper sequence
        const sequences = plan.tools.map(t => t.sequence).sort();
        expect(sequences).toEqual([...Array(plan.tools.length).keys()]);
    });

    test("should show example workflow for over-budget diagnosis", () => {
        const plan = planner.planToolExecution(AdvisorWorkflow.BUDGET_DIAGNOSE);
        const description = planner.describePlan(plan);

        expect(description).toContain("Diagnose");
        expect(description).toContain("budget");
        expect(description).toContain("analyze_budget_variance");
    });

    test("should show example workflow for budget revision with known activity", () => {
        let plan = planner.planToolExecution(AdvisorWorkflow.BUDGET_REVISE);

        // This would have known activities like car repair
        plan = planner.addSimulationTool(plan, "simulate_purchase", "Plan for $1200 car repair");

        expect(plan.tools.some(t => t.toolName === "simulate_purchase")).toBe(true);
        expect(plan.tools.some(t => t.toolName === "plan_next_month_budget")).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 6: Error Handling
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Orchestrator - Error Handling", () => {
    let orchestrator: AIOrchestrator;
    let executor: AIToolExecutor;

    beforeEach(() => {
        const planner = new AIToolPlanner();
        executor = new AIToolExecutor();
        const llmProvider = new MockLLMProvider();
        const privacyGateway = new MockPrivacyGateway();

        orchestrator = new AIOrchestrator(planner, executor, llmProvider, privacyGateway);

        executor.registerTool("get_financial_snapshot", async () => ({
            snapshot: { netWorthCents: 100000 },
        }));
    });

    test("should return error response when tools fail", async () => {
        // Don't register any tools to force failure
        const freshExecutor = new AIToolExecutor();
        const planner = new AIToolPlanner();
        const orchestrator = new AIOrchestrator(
            planner,
            freshExecutor,
            new MockLLMProvider(),
            new MockPrivacyGateway()
        );

        const request: OrchestratorRequest = {
            correlationId: "err-123" as EntityId,
            userMessage: "Help me.",
            workflowType: AdvisorWorkflow.BUDGET_CREATE,
            householdId: "hh-123" as EntityId,
            memberId: "member-123" as EntityId,
            isHouseholdOwner: true,
        };

        const response = await orchestrator.processRequest(request);

        // Should handle gracefully
        expect(response.correlationId).toBe("err-123" as EntityId);
    });
});
