/**
 * BudgetApprovalService — manages the approval workflow for AI-generated budget proposals.
 *
 * Ensures:
 * - AI generates proposals, not persisted budgets
 * - Proposals undergo financial validation
 * - Only explicit user approval persists budgets
 * - Complete audit trail maintained
 * - Previous budget versions preserved
 *
 * Workflow:
 * 1. AI generates proposal (PROPOSED status)
 * 2. System validates financially
 * 3. User reviews and optionally modifies
 * 4. User explicitly approves (APPROVED status)
 * 5. Service persists as new budget versions (PERSISTED status)
 */

import {
    EntityId,
    BudgetProposal,
    BudgetProposalStatus,
    BudgetValidationStatus,
    BudgetApprovalAuditEvent,
    ProposedChange,
    Money,
    Budget,
    BudgetApproval,
} from "@house-fin/contracts";

/**
 * Validation result for a budget proposal
 */
export interface BudgetValidationResult {
    status: BudgetValidationStatus;
    errors: string[];
    warnings: string[];
    affectedCategories: string[];
}

/**
 * Service for managing the budget approval workflow
 */
export class BudgetApprovalService {
    /**
     * Validate a proposed budget financially
     */
    validateProposal(proposal: BudgetProposal): BudgetValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        const affectedCategories: string[] = [];

        // Validate proposed changes
        if (!proposal.proposedChanges || proposal.proposedChanges.length === 0) {
            errors.push("Proposal contains no budget changes");
        }

        for (const change of proposal.proposedChanges || []) {
            affectedCategories.push(change.category);

            // Check for negative amounts
            if (change.proposedBudgetCents < 0) {
                errors.push(`Category "${change.category}": proposed budget cannot be negative`);
            }

            // Check for extreme changes (over 100% increase)
            if (change.currentBudgetCents > 0) {
                const percentChange = ((change.proposedBudgetCents - change.currentBudgetCents) / change.currentBudgetCents) * 100;
                if (Math.abs(percentChange) > 100) {
                    warnings.push(
                        `Category "${change.category}": ${Math.abs(percentChange).toFixed(0)}% change (from $${(change.currentBudgetCents / 100).toFixed(2)} to $${(change.proposedBudgetCents / 100).toFixed(2)})`
                    );
                }
            } else if (change.currentBudgetCents === 0 && change.proposedBudgetCents > 0) {
                warnings.push(`Category "${change.category}": new category being added (no prior budget)`);
            }

            // Validate reason is provided
            if (!change.reason || change.reason.trim().length === 0) {
                errors.push(`Category "${change.category}": reason for change required`);
            }
        }

        // Determine overall status
        const status = errors.length > 0
            ? BudgetValidationStatus.INVALID
            : warnings.length > 0
                ? BudgetValidationStatus.WARNINGS
                : BudgetValidationStatus.VALID;

        return {
            status,
            errors,
            warnings,
            affectedCategories,
        };
    }

    /**
     * Check if a proposal can be approved
     * Returns error message if not approvable, null if OK
     */
    canApprove(proposal: BudgetProposal): string | null {
        if (proposal.status === BudgetProposalStatus.REJECTED) {
            return "Cannot approve a rejected proposal";
        }
        if (proposal.status === BudgetProposalStatus.PERSISTED) {
            return "Proposal has already been persisted";
        }
        if (proposal.status === BudgetProposalStatus.PROPOSED || proposal.status === BudgetProposalStatus.UNDER_REVIEW || proposal.status === BudgetProposalStatus.APPROVED) {
            return null; // Can approve from these states
        }
        return `Cannot approve proposal in status: ${proposal.status}`;
    }

    /**
     * Convert approved changes to persisted budgets
     * Returns the set of budgets that were created/updated
     */
    createBudgetsFromApprovedProposal(
        proposal: BudgetProposal,
        currentBudgets: Budget[],
        approvingUserId: EntityId
    ): Budget[] {
        // Use approved changes if available, otherwise proposed changes
        const changesToApply = proposal.approvedChanges || proposal.proposedChanges;

        const newBudgets: Budget[] = [];
        const now = new Date();

        for (const change of changesToApply) {
            // Find existing budget for this category
            const existingBudget = currentBudgets.find(b => b.category === change.category);

            // Preserve parent budget link for audit trail
            const newBudget: Budget = {
                id: (`${Math.random().toString(36).substr(2, 9)}_${Date.now()}`) as EntityId, // placeholder - DB will assign real ID
                householdId: proposal.householdId,
                periodYear: proposal.periodYear,
                periodMonth: proposal.periodMonth,
                category: change.category,
                amountCents: change.proposedBudgetCents,
                version: 1,
                createdAt: now,
                updatedAt: now,
                // Note: approval_id will be set by repository after approval is persisted
            };

            // Copy optional fields if they exist in existing budget
            if (existingBudget) {
                if (existingBudget.notes) {
                    newBudget.notes = existingBudget.notes;
                }
                if (existingBudget.goalId) {
                    newBudget.goalId = existingBudget.goalId;
                }
            }

            newBudgets.push(newBudget);
        }

        return newBudgets;
    }

    /**
     * Check if LLM attempted to persist directly (security check)
     * Returns error message if violation detected
     */
    validateNoDirectPersistence(toolExecutionContext: Record<string, unknown>): string | null {
        // Check if create_budget or update_budget tools were called
        const attemptedTools = (toolExecutionContext.toolsExecuted as string[]) || [];

        for (const tool of attemptedTools) {
            if (tool === "create_initial_budget" || tool === "plan_next_month_budget") {
                return `LLM attempted to directly persist budget using "${tool}" tool. This is not allowed - proposals must go through user approval first.`;
            }
        }

        return null;
    }
}

/**
 * Factory function to create a budget approval service
 */
export function createBudgetApprovalService(): BudgetApprovalService {
    return new BudgetApprovalService();
}
