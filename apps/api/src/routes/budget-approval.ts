/**
 * Budget Approval Workflow Routes
 * 
 * Endpoints for:
 * - Creating budget proposals (from AI)
 * - Reviewing proposals
 * - Approving and persisting proposals
 * - Viewing proposal history
 */

import { Router, Request, Response, NextFunction } from "express";
import { EntityId } from "@house-fin/contracts";
import {
    CreateBudgetProposalRequest,
    ReviewBudgetProposalRequest,
    ApproveBudgetProposalRequest,
    BudgetProposalStatus,
    BudgetApprovalAuditEvent,
} from "@house-fin/contracts";
import { PgBudgetApprovalRepository } from "../db/repositories";
import { PgBudgetRepository } from "../db/repositories";
import { BudgetApprovalService } from "@house-fin/domain";
import { RouteContext } from "./types";
import { verifyHouseholdContext } from "../middleware/household-context";

interface ApiError extends Error {
    statusCode: number;
}

export function registerBudgetApprovalRoutes(context: RouteContext): void {
    const router = Router();
    const approvalRepo = context.budgetApprovalRepo;
    const budgetRepo = context.budgetRepo;
    const approvalService = context.budgetApprovalService;

    /**
     * POST /household/budget-proposals
     * Create a new budget proposal (AI-generated or user-initiated)
     */
    router.post(
        "/household/budget-proposals",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context.householdId;
                const userId = req.context.userId || "system";
                const body = req.body as CreateBudgetProposalRequest;

                // Validate request
                if (!body.periodYear || !body.periodMonth || !body.proposedChanges) {
                    const error = new Error("Missing required fields: periodYear, periodMonth, proposedChanges") as ApiError;
                    error.statusCode = 400;
                    throw error;
                }

                if (body.periodMonth < 1 || body.periodMonth > 12) {
                    const error = new Error("Invalid period month: must be 1-12") as ApiError;
                    error.statusCode = 400;
                    throw error;
                }

                // Create proposal
                const proposal = await approvalRepo.createProposal(
                    householdId as EntityId,
                    body.periodYear,
                    body.periodMonth,
                    body.proposedChanges,
                    userId as EntityId,
                    {
                        conversationId: body.conversationId,
                        financialSnapshotId: body.financialSnapshotId,
                        title: body.title,
                        description: body.description,
                    }
                );

                // Validate proposal
                const validation = approvalService.validateProposal(proposal);
                await approvalRepo.updateValidation(
                    proposal.id,
                    validation.status,
                    {
                        errors: validation.errors,
                        warnings: validation.warnings,
                        affectedCategories: validation.affectedCategories,
                    }
                );

                // Record audit event
                await approvalRepo.recordAuditEvent(
                    proposal.id,
                    householdId as EntityId,
                    BudgetApprovalAuditEvent.CREATED,
                    userId as EntityId,
                    {
                        newState: { status: BudgetProposalStatus.PROPOSED, changesCount: body.proposedChanges.length },
                        reason: body.title || "AI-generated proposal",
                    }
                );

                // Record validation event
                await approvalRepo.recordAuditEvent(
                    proposal.id,
                    householdId as EntityId,
                    BudgetApprovalAuditEvent.VALIDATED,
                    null,
                    {
                        newState: { validationStatus: validation.status },
                        reason: `Validation: ${validation.errors.length} errors, ${validation.warnings.length} warnings`,
                    }
                );

                res.status(201).json({
                    proposal: { ...proposal, validationStatus: validation.status },
                    validation,
                });
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /household/budget-proposals/:proposalId
     * Get a budget proposal with its audit trail
     */
    router.get(
        "/household/budget-proposals/:proposalId",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context.householdId;

                const proposal = await approvalRepo.findProposalById(req.params.proposalId as EntityId);
                if (!proposal || proposal.householdId !== householdId) {
                    const error = new Error("Proposal not found") as ApiError;
                    error.statusCode = 404;
                    throw error;
                }

                const auditTrail = await approvalRepo.findAuditTrail(proposal.id);

                res.json({
                    proposal,
                    auditTrail,
                });
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /household/budget-proposals
     * List all active proposals for a household
     */
    router.get(
        "/household/budget-proposals",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context.householdId;

                const proposals = await approvalRepo.findActiveProposalsByHousehold(householdId as EntityId);

                res.json({
                    proposals,
                    count: proposals.length,
                });
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * PATCH /household/budget-proposals/:proposalId/review
     * Move proposal to UNDER_REVIEW status and optionally update changes
     */
    router.patch(
        "/household/budget-proposals/:proposalId/review",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context.householdId;
                const userId = req.context.userId || "system";
                const body = req.body as ReviewBudgetProposalRequest;

                const proposal = await approvalRepo.findProposalById(req.params.proposalId as EntityId);
                if (!proposal || proposal.householdId !== householdId) {
                    const error = new Error("Proposal not found") as ApiError;
                    error.statusCode = 404;
                    throw error;
                }

                // Update status
                const updated = await approvalRepo.updateProposalStatus(
                    proposal.id,
                    BudgetProposalStatus.UNDER_REVIEW,
                    body.approvedChanges
                );

                // Record audit event for review
                await approvalRepo.recordAuditEvent(
                    proposal.id,
                    householdId as EntityId,
                    BudgetApprovalAuditEvent.USER_REVIEWED,
                    userId as EntityId,
                    {
                        previousState: { status: proposal.status },
                        newState: { status: BudgetProposalStatus.UNDER_REVIEW },
                        reason: body.comment || "User reviewing proposal",
                    }
                );

                // If user modified changes, record that too
                if (body.approvedChanges) {
                    await approvalRepo.recordAuditEvent(
                        proposal.id,
                        householdId as EntityId,
                        BudgetApprovalAuditEvent.USER_CHANGED,
                        userId as EntityId,
                        {
                            previousState: { proposedChanges: proposal.proposedChanges },
                            newState: { approvedChanges: body.approvedChanges },
                            reason: "User modified proposed changes",
                        }
                    );
                }

                res.json({ proposal: updated });
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * POST /household/budget-proposals/:proposalId/approve
     * Explicitly approve a proposal and persist as actual budgets
     * 
     * CRITICAL: This is the only way an AI proposal becomes a persisted budget
     * The LLM cannot call this endpoint directly (requires household member auth)
     */
    router.post(
        "/household/budget-proposals/:proposalId/approve",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context.householdId;
                const userId = req.context.userId || "system";
                const body = req.body as ApproveBudgetProposalRequest;

                const proposal = await approvalRepo.findProposalById(req.params.proposalId as EntityId);
                if (!proposal || proposal.householdId !== householdId) {
                    const error = new Error("Proposal not found") as ApiError;
                    error.statusCode = 404;
                    throw error;
                }

                // Verify approvable (state machine enforcement)
                const canApproveError = approvalService.canApprove(proposal);
                if (canApproveError) {
                    const error = new Error(canApproveError) as ApiError;
                    error.statusCode = 409;
                    throw error;
                }

                // Get current budgets for this period
                const currentBudgets = await budgetRepo.findByHouseholdAndPeriod(
                    householdId as EntityId,
                    proposal.periodYear,
                    proposal.periodMonth
                );

                // Create new budget versions from approved proposal
                const newBudgets = approvalService.createBudgetsFromApprovedProposal(
                    proposal,
                    currentBudgets,
                    userId as EntityId
                );

                // Persist new budgets (one by one, preserving previous versions)
                const persistedBudgets = [];
                for (const budget of newBudgets) {
                    const persisted = await budgetRepo.create(budget);
                    persistedBudgets.push(persisted);
                }

                // Create approval record
                const approval = await approvalRepo.createApproval(
                    proposal.id,
                    householdId as EntityId,
                    userId as EntityId,
                    body.comment
                );

                // Update proposal status to APPROVED then PERSISTED
                await approvalRepo.updateProposalStatus(
                    proposal.id,
                    BudgetProposalStatus.APPROVED,
                    body.approvedChanges || proposal.approvedChanges
                );

                await approvalRepo.updateProposalStatus(
                    proposal.id,
                    BudgetProposalStatus.PERSISTED
                );

                // Record approval events
                await approvalRepo.recordAuditEvent(
                    proposal.id,
                    householdId as EntityId,
                    BudgetApprovalAuditEvent.APPROVED,
                    userId as EntityId,
                    {
                        newState: { status: BudgetProposalStatus.APPROVED },
                        reason: body.comment || "User approved proposal",
                    }
                );

                await approvalRepo.recordAuditEvent(
                    proposal.id,
                    householdId as EntityId,
                    BudgetApprovalAuditEvent.PERSISTED,
                    userId as EntityId,
                    {
                        newState: {
                            status: BudgetProposalStatus.PERSISTED,
                            persistedBudgetCount: persistedBudgets.length,
                            approvalId: approval.id,
                        },
                        reason: "Approved changes persisted as new budget version",
                    }
                );

                res.status(201).json({
                    approval,
                    newBudgets: persistedBudgets,
                    previousBudgets: currentBudgets,
                    message: "Budget proposal approved and persisted successfully",
                });
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * POST /household/budget-proposals/:proposalId/reject
     * Reject a proposal (terminal state, cannot be approved later)
     */
    router.post(
        "/household/budget-proposals/:proposalId/reject",
        verifyHouseholdContext,
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context.householdId;
                const userId = req.context.userId || "system";
                const { reason } = req.body as { reason?: string };

                const proposal = await approvalRepo.findProposalById(req.params.proposalId as EntityId);
                if (!proposal || proposal.householdId !== householdId) {
                    const error = new Error("Proposal not found") as ApiError;
                    error.statusCode = 404;
                    throw error;
                }

                if (proposal.status === BudgetProposalStatus.PERSISTED) {
                    const error = new Error("Cannot reject a persisted proposal") as ApiError;
                    error.statusCode = 409;
                    throw error;
                }

                // Update status
                const updated = await approvalRepo.updateProposalStatus(
                    proposal.id,
                    BudgetProposalStatus.REJECTED
                );

                // Record audit event
                await approvalRepo.recordAuditEvent(
                    proposal.id,
                    householdId as EntityId,
                    BudgetApprovalAuditEvent.REJECTED,
                    userId as EntityId,
                    {
                        previousState: { status: proposal.status },
                        newState: { status: BudgetProposalStatus.REJECTED },
                        reason,
                    }
                );

                res.json({ proposal: updated });
            } catch (error) {
                next(error);
            }
        }
    );

    // Register all routes with the Express app
    context.app.use(router);
}
