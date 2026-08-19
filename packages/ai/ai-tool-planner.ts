/**
 * AI Tool Planner — Determines which tools to execute based on workflow type.
 *
 * Purpose:
 * - Map user intent to specific tool workflows
 * - Plan multi-tool sequences for complex financial questions
 * - Ensure tools are ordered correctly for dependency resolution
 * - Provide execution context and ordering
 *
 * Design:
 * - Stateless: no side effects, pure planning logic
 * - Deterministic: same intent always produces same plan
 * - Flexible: supports multi-tool workflows and dynamic adjustments
 * - Auditable: every plan decision is logged
 */

import { AdvisorWorkflow } from "@house-fin/contracts";

/**
 * Represents a single tool in the execution plan
 */
export interface PlannedToolCall {
    /** Position in execution order (0-based) */
    sequence: number;
    /** Name of the tool to execute */
    toolName: string;
    /** Human description of why this tool is needed */
    rationale: string;
    /** Whether this tool's output is required for subsequent tools */
    isCritical: boolean;
    /** Other tools this depends on (by sequence number) */
    dependsOn: number[];
    /** Whether results should be passed to LLM context */
    passToLLM: boolean;
}

/**
 * Complete plan for executing tools for a user intent
 */
export interface ToolExecutionPlan {
    /** The workflow type that generated this plan */
    workflowType: AdvisorWorkflow;
    /** All tools to execute in order */
    tools: PlannedToolCall[];
    /** Overall description of the plan */
    description: string;
    /** Total estimated number of database queries */
    estimatedQueries: number;
}

/**
 * Planner for multi-tool workflows based on financial advisor intent
 */
export class AIToolPlanner {
    /**
     * Generate a tool execution plan based on workflow type
     */
    planToolExecution(workflowType: AdvisorWorkflow): ToolExecutionPlan {
        switch (workflowType) {
            // ─────────────────────────────────────────────────────────────
            // FINANCIAL_HEALTH: Overall financial status
            // ─────────────────────────────────────────────────────────────
            case AdvisorWorkflow.FINANCIAL_HEALTH:
                return {
                    workflowType,
                    description: "Get comprehensive financial health overview",
                    tools: [
                        {
                            sequence: 0,
                            toolName: "get_financial_snapshot",
                            rationale: "Overall financial health assessment",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 1,
                            toolName: "get_budget_status",
                            rationale: "Current budget performance",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 2,
                            toolName: "get_attention_items",
                            rationale: "Identify any concerns",
                            isCritical: false,
                            dependsOn: [],
                            passToLLM: true,
                        },
                    ],
                    estimatedQueries: 5,
                };

            // ─────────────────────────────────────────────────────────────
            // BUDGET_CREATE: Full financial picture for initial budget
            // ─────────────────────────────────────────────────────────────
            case AdvisorWorkflow.BUDGET_CREATE:
                return {
                    workflowType,
                    description: "Create an initial budget from scratch based on household financials",
                    tools: [
                        // Phase 1: Gather all financial data (parallel-friendly)
                        {
                            sequence: 0,
                            toolName: "get_financial_snapshot",
                            rationale: "Understand overall financial health and net worth",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 1,
                            toolName: "get_cash_flow",
                            rationale: "Determine sustainable income and expense levels",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 2,
                            toolName: "get_historical_budget_performance",
                            rationale: "Review past spending patterns to inform allocations",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 3,
                            toolName: "get_debt_summary",
                            rationale: "Account for debt obligations in budget planning",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 4,
                            toolName: "get_recurring_financial_items",
                            rationale: "Identify all recurring income and expenses",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 5,
                            toolName: "get_goal_status",
                            rationale: "Ensure budget supports financial goals",
                            isCritical: false,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 6,
                            toolName: "get_attention_items",
                            rationale: "Identify existing financial issues to address",
                            isCritical: false,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        // Phase 2: Create budget (depends on all data gathered)
                        {
                            sequence: 7,
                            toolName: "create_initial_budget",
                            rationale: "Generate budget proposal based on all gathered data",
                            isCritical: true,
                            dependsOn: [0, 1, 2, 4],
                            passToLLM: true,
                        },
                    ],
                    estimatedQueries: 12,
                };

            // ─────────────────────────────────────────────────────────────
            // BUDGET_DIAGNOSE: Why is budget variance happening?
            // ─────────────────────────────────────────────────────────────
            case AdvisorWorkflow.BUDGET_DIAGNOSE:
                return {
                    workflowType,
                    description: "Diagnose why household is over/under budget",
                    tools: [
                        {
                            sequence: 0,
                            toolName: "get_current_budget",
                            rationale: "Get current month's budget allocations",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 1,
                            toolName: "get_budget_status",
                            rationale: "Compare actual vs. budgeted spending",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 2,
                            toolName: "get_historical_budget_performance",
                            rationale: "Identify patterns across months",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 3,
                            toolName: "get_recurring_financial_items",
                            rationale: "Identify unbudgeted recurring expenses",
                            isCritical: false,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 4,
                            toolName: "analyze_budget_variance",
                            rationale: "Deep analysis of variance trends",
                            isCritical: true,
                            dependsOn: [0, 1, 2],
                            passToLLM: true,
                        },
                    ],
                    estimatedQueries: 10,
                };

            // ─────────────────────────────────────────────────────────────
            // BUDGET_REVISE: Help adjust next month's budget
            // ─────────────────────────────────────────────────────────────
            case AdvisorWorkflow.BUDGET_REVISE:
                return {
                    workflowType,
                    description: "Revise budget for upcoming month with known changes",
                    tools: [
                        {
                            sequence: 0,
                            toolName: "get_current_budget",
                            rationale: "Review current budget as baseline",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 1,
                            toolName: "get_cash_flow",
                            rationale: "Check current cash flow and income stability",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 2,
                            toolName: "get_recurring_financial_items",
                            rationale: "Account for recurring expenses in plan",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 3,
                            toolName: "get_goal_status",
                            rationale: "Ensure revised budget still supports goals",
                            isCritical: false,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 4,
                            toolName: "plan_next_month_budget",
                            rationale: "Propose revised budget with known changes",
                            isCritical: true,
                            dependsOn: [0, 1, 2],
                            passToLLM: true,
                        },
                    ],
                    estimatedQueries: 8,
                };

            // ─────────────────────────────────────────────────────────────
            // BUDGET_SCENARIO: Simulate what-if scenarios
            // ─────────────────────────────────────────────────────────────
            case AdvisorWorkflow.BUDGET_SCENARIO:
                return {
                    workflowType,
                    description: "Simulate scenario changes (e.g., car repair, income change)",
                    tools: [
                        {
                            sequence: 0,
                            toolName: "get_current_budget",
                            rationale: "Understand current budget context",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        // Simulation tools added dynamically based on user scenario
                        // (e.g., simulate_purchase, simulate_budget_change, simulate_income_change)
                    ],
                    estimatedQueries: 3,
                };

            // ─────────────────────────────────────────────────────────────
            // BUDGET_STATUS: What's our current budget status?
            // ─────────────────────────────────────────────────────────────
            case AdvisorWorkflow.BUDGET_STATUS:
                return {
                    workflowType,
                    description: "Get current budget status and performance",
                    tools: [
                        {
                            sequence: 0,
                            toolName: "get_budget_status",
                            rationale: "Show current budget vs. actual spending",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 1,
                            toolName: "get_attention_items",
                            rationale: "Highlight any budget-related issues",
                            isCritical: false,
                            dependsOn: [],
                            passToLLM: true,
                        },
                    ],
                    estimatedQueries: 3,
                };

            // ─────────────────────────────────────────────────────────────
            // CASH_FLOW: Understand cash flow
            // ─────────────────────────────────────────────────────────────
            case AdvisorWorkflow.CASH_FLOW:
                return {
                    workflowType,
                    description: "Analyze household cash flow",
                    tools: [
                        {
                            sequence: 0,
                            toolName: "get_cash_flow",
                            rationale: "Get comprehensive cash flow analysis",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 1,
                            toolName: "get_recurring_financial_items",
                            rationale: "Identify recurring income and expenses",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                    ],
                    estimatedQueries: 4,
                };

            // ─────────────────────────────────────────────────────────────
            // AFFORDABILITY: Can we afford something?
            // ─────────────────────────────────────────────────────────────
            case AdvisorWorkflow.AFFORDABILITY:
                return {
                    workflowType,
                    description: "Assess affordability of potential purchase or commitment",
                    tools: [
                        {
                            sequence: 0,
                            toolName: "get_financial_snapshot",
                            rationale: "Understand overall financial capacity",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 1,
                            toolName: "get_cash_flow",
                            rationale: "Check monthly cash flow impact",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 2,
                            toolName: "get_debt_summary",
                            rationale: "Account for existing debt obligations",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 3,
                            toolName: "get_goal_status",
                            rationale: "Ensure purchase doesn't jeopardize goals",
                            isCritical: false,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        // Simulation based on user's specific scenario
                        {
                            sequence: 4,
                            toolName: "simulate_purchase",
                            rationale: "Model impact of proposed purchase",
                            isCritical: true,
                            dependsOn: [0, 1],
                            passToLLM: true,
                        },
                    ],
                    estimatedQueries: 8,
                };

            // ─────────────────────────────────────────────────────────────
            // GOAL_STATUS: How are we doing on our goals?
            // ─────────────────────────────────────────────────────────────
            case AdvisorWorkflow.GOAL_STATUS:
                return {
                    workflowType,
                    description: "Review progress on financial goals",
                    tools: [
                        {
                            sequence: 0,
                            toolName: "get_goal_status",
                            rationale: "Show all goals and their progress",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 1,
                            toolName: "get_attention_items",
                            rationale: "Highlight any goals at risk",
                            isCritical: false,
                            dependsOn: [],
                            passToLLM: true,
                        },
                    ],
                    estimatedQueries: 3,
                };

            // ─────────────────────────────────────────────────────────────
            // DEBT_STATUS: How is our debt?
            // ─────────────────────────────────────────────────────────────
            case AdvisorWorkflow.DEBT_STATUS:
                return {
                    workflowType,
                    description: "Review debt status and health",
                    tools: [
                        {
                            sequence: 0,
                            toolName: "get_debt_summary",
                            rationale: "Comprehensive debt overview",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                        {
                            sequence: 1,
                            toolName: "get_attention_items",
                            rationale: "Highlight any debt concerns",
                            isCritical: false,
                            dependsOn: [],
                            passToLLM: true,
                        },
                    ],
                    estimatedQueries: 3,
                };

            // ─────────────────────────────────────────────────────────────
            // GENERAL_FINANCIAL_QUESTION: General financial question
            // ─────────────────────────────────────────────────────────────
            case AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION:
                return {
                    workflowType,
                    description: "Answer general financial questions",
                    tools: [
                        {
                            sequence: 0,
                            toolName: "get_financial_snapshot",
                            rationale: "Provide context for general questions",
                            isCritical: false,
                            dependsOn: [],
                            passToLLM: true,
                        },
                    ],
                    estimatedQueries: 1,
                };

            default:
                // Fallback for unknown workflow
                return {
                    workflowType,
                    description: `Handle ${workflowType}`,
                    tools: [
                        {
                            sequence: 0,
                            toolName: "get_financial_snapshot",
                            rationale: "Gather basic financial context",
                            isCritical: true,
                            dependsOn: [],
                            passToLLM: true,
                        },
                    ],
                    estimatedQueries: 1,
                };
        }
    }

    /**
     * Add dynamic tools for scenario-based workflows
     * Used when user specifies specific simulation (e.g., "what if car repair?")
     */
    addSimulationTool(
        plan: ToolExecutionPlan,
        toolName: "simulate_purchase" | "simulate_budget_change" | "simulate_income_change",
        rationale: string
    ): ToolExecutionPlan {
        const nextSequence = Math.max(...plan.tools.map(t => t.sequence)) + 1;
        const simulationTool: PlannedToolCall = {
            sequence: nextSequence,
            toolName,
            rationale,
            isCritical: true,
            dependsOn: [0], // Depends on first tool (usually financial snapshot or budget)
            passToLLM: true,
        };

        return {
            ...plan,
            tools: [...plan.tools, simulationTool],
            estimatedQueries: plan.estimatedQueries + 1,
        };
    }

    /**
     * Get human-readable description of the plan
     */
    describePlan(plan: ToolExecutionPlan): string {
        const toolList = plan.tools
            .map(t => `${t.sequence + 1}. ${t.toolName}: ${t.rationale}`)
            .join("\n");

        return `${plan.description}\n\nTools to execute:\n${toolList}`;
    }
}

/**
 * Singleton for tool planning
 */
let plannerInstance: AIToolPlanner | null = null;

export function getToolPlanner(): AIToolPlanner {
    if (!plannerInstance) {
        plannerInstance = new AIToolPlanner();
    }
    return plannerInstance;
}

export function setToolPlanner(planner: AIToolPlanner): void {
    plannerInstance = planner;
}
