/**
 * Advisor Context Service
 *
 * Integrates Financial Context Builder with advisor conversation workflows.
 * Builds context for each user request before tool invocation.
 */

import { EntityId, AdvisorWorkflow, WorkflowState } from "@house-fin/contracts";
import {
    FinancialContextBuilder,
    FinancialContext,
} from "@house-fin/ai";
import { WorkflowStateManager } from "./workflow-state-manager";

/**
 * Service for managing advisor context throughout a conversation
 */
export class AdvisorContextService {
    constructor(private contextBuilder: FinancialContextBuilder) { }

    /**
     * Build financial context for a user request within a workflow
     *
     * Usage:
     *   const context = await contextService.buildContextForRequest(
     *       householdId,
     *       userMessage,
     *       workflow
     *   );
     *
     * The returned context contains:
     * - Only data relevant to the workflow type (minimal context principle)
     * - Metadata for reproducibility (versions, timestamps, confidence)
     * - Tool requirements for the LLM
     * - Attention items requiring immediate action
     */
    async buildContextForRequest(
        householdId: EntityId,
        userMessage: string,
        workflow: WorkflowState
    ): Promise<FinancialContext> {
        return this.contextBuilder.buildContext(householdId, userMessage, workflow);
    }

    /**
     * Extract tool context from financial context
     *
     * Usage with LLM:
     *   const toolContext = contextService.extractToolContext(context);
     *   const prompt = buildPrompt(userMessage, toolContext, toolContext.toolsRequired);
     *   const response = await llm.chat([...messages], toolContext);
     */
    extractToolContext(context: FinancialContext): Record<string, any> {
        return {
            // Metadata for audit trail
            contextAsOf: context.asOf,
            contextVersions: context.contextVersions,

            // Financial data (varies by workflow type)
            budget: context.currentBudget,
            budgetPerformance: context.budgetPerformance,
            cashFlow: context.projectedCashFlow,
            recurringObligations: context.recurringObligations,
            debt: context.debt,
            goals: context.goals,
            snapshot: context.snapshot,

            // Attention items (what to focus on)
            attentionItems: context.attentionItems,

            // Tool requirements
            availableTools: context.toolsRequired,
        };
    }

    /**
     * Prepare context for LLM system prompt
     *
     * Returns a structured message that LLM uses to understand
     * the financial situation and available tools
     */
    buildSystemPrompt(context: FinancialContext): string {
        const sections: string[] = [];

        sections.push(`You are a financial advisor assistant for the household.`);
        sections.push(
            `Financial snapshot as of ${context.asOf.toISOString().split("T")[0]}.`
        );

        if (context.attentionItems && context.attentionItems.length > 0) {
            sections.push(
                `\nIMPORTANT ATTENTION ITEMS:\n` +
                context.attentionItems
                    .map(
                        (item) =>
                            `- [${item.severity}] ${item.description}: ${item.suggestedAction}`
                    )
                    .join("\n")
            );
        }

        if (context.currentBudget) {
            sections.push(`\nCURRENT BUDGET STATUS:\nMonth: ${context.currentBudget.period.year}-${context.currentBudget.period.month}`);
            sections.push(
                context.currentBudget.categories
                    .map(
                        (cat) =>
                            `- ${cat.category}: $${cat.budgetCents / 100} budgeted, $${cat.actualCents / 100} spent (${cat.percentSpent}%)`
                    )
                    .join("\n")
            );
        }

        if (context.projectedCashFlow) {
            const cf = context.projectedCashFlow;
            sections.push(
                `\nCASH FLOW (Next Month):\n` +
                `- Income: $${cf.projectedIncomeCents / 100}\n` +
                `- Expenses: $${cf.projectedExpensesCents / 100}\n` +
                `- Surplus: $${cf.projectedSurplusCents / 100}\n` +
                `- Confidence: ${cf.confidence}`
            );
        }

        if (context.recurringObligations) {
            sections.push(
                `\nRECURRING OBLIGATIONS:\n` +
                `- Total Monthly: $${context.recurringObligations.totalMonthlyProjectionCents / 100}`
            );
        }

        if (context.toolsRequired && context.toolsRequired.length > 0) {
            sections.push(
                `\nAVAILABLE TOOLS:\n${context.toolsRequired.map((t) => `- ${t}`).join("\n")}`
            );
        }

        sections.push(
            `\nWORKFLOW: ${context.workflowType}\n` +
            `Use the available tools to help the user with their financial question.`
        );

        return sections.join("\n\n");
    }

    /**
     * Build metadata for storing with conversation response
     *
     * Usage:
     *   const responseMetadata = contextService.buildResponseMetadata(context);
     *   await messageRepo.create({
     *       conversationId,
     *       role: "assistant",
     *       content: assistantMessage,
     *       metadata: {
     *           ...responseMetadata,
     *           toolsInvoked: [...],
     *           confidence: 0.92,
     *       }
     *   });
     */
    buildResponseMetadata(context: FinancialContext): Record<string, any> {
        return {
            contextAsOf: context.asOf,
            contextVersions: context.contextVersions,
            workflow: context.workflowType,
            toolsRequired: context.toolsRequired,
            attentionItemsCount: context.attentionItems?.length || 0,
            dataSourceMetadata: {
                budget: context.currentBudget?.metadata,
                performance: context.budgetPerformance?.metadata,
                cashFlow: context.projectedCashFlow?.calculatedAt,
            },
        };
    }

    /**
     * Validate that context is complete enough for the workflow
     *
     * Usage:
     *   if (!contextService.isContextSufficient(context)) {
     *       return "Not enough data available. Please provide budget information first.";
     *   }
     */
    isContextSufficient(context: FinancialContext, minRequiredData: string[] = []): boolean {
        const availableData = {
            budget: !!context.currentBudget,
            performance: !!context.budgetPerformance,
            cashFlow: !!context.projectedCashFlow,
            recurring: !!context.recurringObligations,
            debt: !!context.debt,
            goals: !!context.goals,
            snapshot: !!context.snapshot,
        };

        // If specific data is required, check for it
        if (minRequiredData.length > 0) {
            return minRequiredData.every((d) => availableData[d as keyof typeof availableData]);
        }

        // Default: at least some financial data is needed
        return Object.values(availableData).some((v) => v);
    }

    /**
     * Get user-friendly description of available context
     *
     * Usage for error messages/logging
     */
    describeContextAvailability(context: FinancialContext): string {
        const available: string[] = [];

        if (context.currentBudget) {
            available.push(
                `current budget (${context.currentBudget.period.year}-${context.currentBudget.period.month})`
            );
        }
        if (context.budgetPerformance) available.push("budget trends");
        if (context.projectedCashFlow) available.push("cash flow projection");
        if (context.recurringObligations) available.push("recurring obligations");
        if (context.debt) available.push("debt analysis");
        if (context.goals) available.push("savings goals");
        if (context.attentionItems?.length) {
            available.push(`${context.attentionItems.length} attention items`);
        }

        return available.length > 0 ? available.join(", ") : "no financial data";
    }

    /**
     * Update workflow state based on user message in multi-turn conversation
     *
     * Extracts planning information (activities, constraints) from user message
     * and updates the workflow state to accumulate planning context across turns.
     *
     * Example:
     *   User Turn 1: "Help me revise next month's budget."
     *     → Creates workflow with workflowType: BUDGET_REVISE
     *
     *   User Turn 2: "We have a $1,200 car repair, a $900 birthday celebration, and a $1,500 trip."
     *     → Extracts 3 activities, adds to workflow state
     *
     *   User Turn 3: "I don't want to reduce vacation savings."
     *     → Extracts constraint, adds to workflow state
     */
    updateWorkflowStateFromMessage(
        workflow: WorkflowState,
        userMessage: string
    ): Partial<WorkflowState> {
        // Extract planning data from message
        const extracted = WorkflowStateManager.extractPlanningData(userMessage);

        // Merge with existing workflow state
        const updated = WorkflowStateManager.updateWorkflowState(workflow, extracted);

        return updated;
    }

    /**
     * Get human-readable summary of current workflow planning state
     *
     * Returns a description the assistant can use in responses to acknowledge
     * what it has understood about the planning context.
     *
     * Example output:
     *   "Budget planning mode: Planning period: August 2026. Known activities: Car repair ($1,200),
     *    Birthday celebration ($900), Trip ($1,500). Total: $3,600. Constraints: Keep vacation
     *    savings unchanged."
     */
    describeWorkflowPlanning(workflow: WorkflowState): string {
        return WorkflowStateManager.describeWorkflowState(workflow);
    }

    /**
     * Calculate total cost of all known activities in workflow
     *
     * Useful for showing user impact of planned activities
     */
    calculateTotalActivityCost(workflow: WorkflowState): number {
        return WorkflowStateManager.calculateTotalActivityCost(workflow.knownActivities);
    }
}

/**
 * Factory function for creating advisor context service
 */
export function createAdvisorContextService(
    contextBuilder: FinancialContextBuilder
): AdvisorContextService {
    return new AdvisorContextService(contextBuilder);
}
