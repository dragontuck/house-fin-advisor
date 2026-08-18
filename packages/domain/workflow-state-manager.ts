/**
 * Workflow State Manager
 *
 * Manages multi-turn conversational planning workflows.
 * Extracts activities, constraints, and assumptions from user messages
 * and maintains structured planning state across conversation turns.
 *
 * Example:
 * User: "Help me revise next month's budget."
 *   → Creates BUDGET_REVISE workflow
 *
 * User: "We have a $1,200 car repair, a $900 birthday celebration, and a $1,500 trip."
 *   → Extracts 3 KnownActivities, adds to workflow state
 *
 * User: "I don't want to reduce vacation savings."
 *   → Adds constraint assumption to workflow state
 */

import { EntityId, WorkflowState, WorkflowStatus, KnownActivity, WorkflowAssumption, AdvisorWorkflow } from "@house-fin/contracts";

/**
 * Parser for extracting structured planning data from natural language
 */
export interface PlanningExtractionResult {
    // New activities mentioned in this message
    activities: KnownActivity[];

    // New constraints or requirements stated
    constraints: WorkflowAssumption[];

    // Questions needing clarification
    clarifications: Array<{
        id: string;
        question: string;
        why: string;
    }>;

    // Changes to existing activities (e.g., "actually it's $1,300 not $1,200")
    updates: Array<{
        activityId: string;
        field: "estimatedAmountCents" | "description";
        oldValue: any;
        newValue: any;
    }>;
}

/**
 * Service for managing workflow state across conversation turns
 */
export class WorkflowStateManager {
    /**
     * Extract planning information from a user message
     *
     * This is a lightweight parser that identifies:
     * - Dollar amounts (activity costs)
     * - Descriptions (car repair, birthday, trip)
     * - Constraints (don't reduce vacation savings, keep emergency fund, etc.)
     *
     * In production, this would be enhanced with:
     * - Named entity recognition for activity types
     * - Machine learning for intent classification
     * - Grammar-based pattern matching
     *
     * For now, we use regex and heuristics.
     */
    static extractPlanningData(userMessage: string): PlanningExtractionResult {
        const activities: KnownActivity[] = [];
        const constraints: WorkflowAssumption[] = [];
        let match: RegExpExecArray | null;

        // Strategy: find all dollar amounts and extract descriptions around them
        // This is more reliable than trying to split the message first
        const amountRegex = /\$?([\d,]+(?:\.\d{2})?)/g;
        const amountMatches: Array<{ value: string; amount: number; index: number }> = [];
        
        while ((match = amountRegex.exec(userMessage)) !== null) {
            const amountStr = match[1].replace(/,/g, "");
            const amountCents = Math.round(parseFloat(amountStr) * 100);
            
            if (!isNaN(amountCents) && amountCents > 0 && amountCents < 100000000) {
                amountMatches.push({
                    value: match[0],
                    amount: amountCents,
                    index: match.index,
                });
            }
        }

        const processedDescriptions = new Set<string>();

        for (let i = 0; i < amountMatches.length; i++) {
            const currentAmount = amountMatches[i];
            const nextAmount = amountMatches[i + 1];
            
            // Extract text after current amount
            let endIndex: number;
            if (nextAmount) {
                // Extract until next amount
                endIndex = nextAmount.index;
            } else {
                // Extract until end of message
                endIndex = userMessage.length;
            }
            
            const textAfterAmount = userMessage.substring(
                currentAmount.index + currentAmount.value.length,
                endIndex
            ).trim();
            
            // Remove leading "for a" or "for", and extract description
            let description = textAfterAmount.replace(/^for\s+(?:a\s+)?/i, '').trim();
            
            // Remove trailing separators and punctuation
            description = description.replace(/\s*(?:,|and).*$/i, '').trim();
            description = description.replace(/[\.,;:!?]+$/, '').trim();
            
            // Skip if empty or already processed
            if (description && !processedDescriptions.has(description.toLowerCase())) {
                processedDescriptions.add(description.toLowerCase());
                
                // Capitalize first letter
                const capitalizedDesc = description.charAt(0).toUpperCase() + description.slice(1);
                
                activities.push({
                    id: this.generateActivityId(capitalizedDesc, currentAmount.amount),
                    description: capitalizedDesc,
                    estimatedAmountCents: currentAmount.amount as any,
                    amountConfidence: "HIGH",
                    type: "ONE_TIME",
                    sourceExtraction: `${currentAmount.value} ${description}`,
                });
            }
        }

        // Constraint patterns - case insensitive, with better boundary detection
        // The key is to stop at sentence boundaries but not mid-constraint
        const constraintPatterns = [
            /don'?t\s+(?:want\s+to\s+)?reduce\s+([a-z][a-z\s]*?)(?=(?:\s+and\s+(?:don't|keep|preserve|can't))|\.|,|$)/gi,
            /keep\s+([a-z][a-z\s]*?)(?:\s+(?:unchanged|constant|same|stable|at\s+current\s+levels))?(?=(?:\s+and\s+(?:don't|keep|preserve|can't))|\.|,|$)/gi,
            /preserve\s+([a-z][a-z\s]*?)(?=(?:\s+and\s+(?:don't|keep|preserve|can't))|\.|,|$)/gi,
            /can't\s+cut\s+([a-z][a-z\s]*?)(?=(?:\s+and\s+(?:don't|keep|preserve|can't))|\.|,|$)/gi,
            /don'?t\s+cut\s+([a-z][a-z\s]*?)(?=(?:\s+and\s+(?:don't|keep|preserve|can't))|\.|,|$)/gi,
        ];

        const processedConstraints = new Set<string>();

        for (const pattern of constraintPatterns) {
            while ((match = pattern.exec(userMessage)) !== null) {
                let constraint = match[1].trim();
                if (constraint.length > 0) {
                    // Remove trailing words that got captured (shouldn't happen with lookahead but just in case)
                    constraint = constraint.replace(/\s+(unchanged|constant|same|stable|at\s+current.*)$/i, '').trim();
                    
                    if (constraint.length > 0) {
                        const key = `preserve_${constraint.replace(/\s+/g, "_")}`;
                        
                        // Avoid duplicate constraints
                        if (!processedConstraints.has(key)) {
                            processedConstraints.add(key);
                            constraints.push({
                                key,
                                value: `Do not reduce or eliminate ${constraint}`,
                                confidence: "HIGH",
                                reasoning: `User explicitly stated this should be preserved`,
                                impact: `Proposed changes must keep ${constraint} at current or higher level`,
                            });
                        }
                    }
                }
            }
        }

        return {
            activities,
            constraints,
            clarifications: [],
            updates: [],
        };
    }

    /**
     * Update workflow state with new planning information
     *
     * Merges new information while preserving existing state:
     * - Adds new activities without removing old ones
     * - Combines constraints
     * - Tracks all assumptions
     */
    static updateWorkflowState(
        current: WorkflowState,
        extracted: PlanningExtractionResult
    ): Partial<WorkflowState> {
        // Merge activities (avoid duplicates by description)
        const existingActivities = current.knownActivities || [];
        const existingDescriptions = new Set(
            existingActivities.map((a) => a.description.toLowerCase())
        );

        const newActivities = [
            ...existingActivities,
            ...extracted.activities.filter(
                (a) => !existingDescriptions.has(a.description.toLowerCase())
            ),
        ];

        // Merge constraints (avoid duplicates by key)
        const existingConstraints = current.assumptions || [];
        const existingKeys = new Set(existingConstraints.map((a) => a.key));

        const newAssumptions = [
            ...existingConstraints,
            ...extracted.constraints.filter((c) => !existingKeys.has(c.key)),
        ];

        // Update status if we have new information
        const newStatus = current.status;

        return {
            knownActivities: newActivities,
            assumptions: newAssumptions,
            status: newStatus,
        };
    }

    /**
     * Calculate total impact of all known activities
     *
     * Useful for showing user "Total planned activities: $3,600"
     */
    static calculateTotalActivityCost(activities: KnownActivity[] = []): number {
        return activities.reduce((sum, activity) => sum + (activity.estimatedAmountCents as number), 0);
    }

    /**
     * Get human-readable summary of workflow state
     *
     * Returns a description the assistant can use in responses:
     * "Current planning state: Next month (August 2026). Known activities: Car repair ($1,200),
     *  Birthday celebration ($900), Trip ($1,500). Total: $3,600. Constraints: Keep vacation
     *  savings unchanged."
     */
    static describeWorkflowState(workflow: WorkflowState): string {
        const parts: string[] = [];

        if (workflow.workflowType === AdvisorWorkflow.BUDGET_REVISE) {
            parts.push("Budget planning mode:");
        }

        if (workflow.planningPeriod) {
            const monthNames = ["January", "February", "March", "April", "May", "June",
                               "July", "August", "September", "October", "November", "December"];
            const month = monthNames[workflow.planningPeriod.month - 1];
            parts.push(`Planning period: ${month} ${workflow.planningPeriod.year}`);
        }

        if (workflow.knownActivities && workflow.knownActivities.length > 0) {
            const activityList = workflow.knownActivities
                .map((a) => `${a.description} ($${((a.estimatedAmountCents as number) / 100).toFixed(2)})`)
                .join(", ");
            const total = (this.calculateTotalActivityCost(workflow.knownActivities) / 100).toFixed(2);
            parts.push(`Known activities: ${activityList}. Total: $${total}`);
        }

        if (workflow.assumptions && workflow.assumptions.length > 0) {
            const constraintList = workflow.assumptions
                .filter((a) => a.key.startsWith("preserve_"))
                .map((a) => a.value)
                .join(", ");
            if (constraintList) {
                parts.push(`Constraints: ${constraintList}`);
            }
        }

        return parts.join(". ");
    }

    /**
     * Generate a deterministic ID for an activity
     *
     * Used to identify activities consistently across turns
     */
    private static generateActivityId(description: string, amountCents: number): string {
        // Simple hash: description + amount
        // In production, could use crypto.subtle.digest
        const str = `${description.toLowerCase()}:${amountCents}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return `activity_${Math.abs(hash).toString(36)}`;
    }
}

/**
 * Factory for creating workflow state manager
 */
export function createWorkflowStateManager(): WorkflowStateManager {
    return new WorkflowStateManager();
}
