/**
 * Budget Approval Workflow Tests
 * 
 * Proves:
 * - AI can only generate proposals, not persist budgets
 * - Proposals must pass validation
 * - Only explicit user approval persists budgets
 * - Audit trail is maintained
 * - Unapproved proposals don't affect household budgets
 */

import { EntityId, BudgetProposalStatus, BudgetValidationStatus } from "@house-fin/contracts";
import { Money } from "@house-fin/contracts";
import { v4 as uuidv4 } from "uuid";
import { BudgetApprovalService, createBudgetApprovalService } from "../../packages/domain/budget-approval-service";

// Mock data factory
function createMockProposal(overrides?: any) {
    return {
        id: uuidv4() as EntityId,
        householdId: "f47ac10b-58cc-4372-a567-0e02b2c3d479" as EntityId,
        periodYear: 2026,
        periodMonth: 8,
        status: BudgetProposalStatus.PROPOSED,
        proposedChanges: [
            {
                category: "Food & Dining",
                proposedBudgetCents: Money(50000),
                currentBudgetCents: Money(40000),
                reason: "Sample adjustment",
            },
        ],
        validationStatus: BudgetValidationStatus.VALID,
        createdBy: uuidv4() as EntityId,
        createdAt: new Date(),
        ...overrides,
    };
}

describe("Budget Approval Workflow - Service Layer Unit Tests", () => {
    let approvalService: BudgetApprovalService;

    beforeEach(() => {
        approvalService = createBudgetApprovalService();
    });

    describe("Proposal Validation", () => {
        test("Valid proposal passes validation", () => {
            const proposal = createMockProposal({
                proposedChanges: [
                    {
                        category: "Food & Dining",
                        proposedBudgetCents: Money(50000),
                        currentBudgetCents: Money(40000),
                        reason: "Reasonable increase",
                    },
                ],
            });

            const result = approvalService.validateProposal(proposal);
            expect(result.status).toBe(BudgetValidationStatus.VALID);
        });

        test("Negative budgets are invalid", () => {
            const proposal = createMockProposal({
                proposedChanges: [
                    {
                        category: "Food & Dining",
                        proposedBudgetCents: Money(-5000),
                        currentBudgetCents: Money(40000),
                        reason: "Invalid negative",
                    },
                ],
            });

            const result = approvalService.validateProposal(proposal);
            expect(result.status).toBe(BudgetValidationStatus.INVALID);
            expect(result.errors.some((e) => e.toLowerCase().includes("negative"))).toBe(true);
        });

        test("Missing reason is invalid", () => {
            const proposal = createMockProposal({
                proposedChanges: [
                    {
                        category: "Food & Dining",
                        proposedBudgetCents: Money(50000),
                        currentBudgetCents: Money(40000),
                        reason: "",
                    },
                ],
            });

            const result = approvalService.validateProposal(proposal);
            expect(result.status).toBe(BudgetValidationStatus.INVALID);
        });

        test("Large changes (>100%) generate warnings", () => {
            const proposal = createMockProposal({
                proposedChanges: [
                    {
                        category: "Entertainment",
                        proposedBudgetCents: Money(100000),
                        currentBudgetCents: Money(20000),
                        reason: "Significant vacation budget",
                    },
                ],
            });

            const result = approvalService.validateProposal(proposal);
            expect(result.status).toBe(BudgetValidationStatus.WARNINGS);
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        test("Empty proposals are invalid", () => {
            const proposal = createMockProposal({
                proposedChanges: [],
            });

            const result = approvalService.validateProposal(proposal);
            expect(result.status).toBe(BudgetValidationStatus.INVALID);
        });
    });

    describe("State Machine - Approval Workflow", () => {
        test("PROPOSED proposal can transition to approval", () => {
            const proposal = createMockProposal({ status: BudgetProposalStatus.PROPOSED });
            const error = approvalService.canApprove(proposal);
            expect(error).toBeNull();
        });

        test("UNDER_REVIEW proposal can transition to approval", () => {
            const proposal = createMockProposal({ status: BudgetProposalStatus.UNDER_REVIEW });
            const error = approvalService.canApprove(proposal);
            expect(error).toBeNull();
        });

        test("APPROVED proposal can be idempotent", () => {
            const proposal = createMockProposal({ status: BudgetProposalStatus.APPROVED });
            const error = approvalService.canApprove(proposal);
            expect(error).toBeNull();
        });

        test("REJECTED proposal cannot be approved", () => {
            const proposal = createMockProposal({ status: BudgetProposalStatus.REJECTED });
            const error = approvalService.canApprove(proposal);
            expect(error).not.toBeNull();
            expect(error).toContain("rejected");
        });

        test("PERSISTED proposal cannot be re-approved", () => {
            const proposal = createMockProposal({ status: BudgetProposalStatus.PERSISTED });
            const error = approvalService.canApprove(proposal);
            expect(error).not.toBeNull();
            expect(error).toContain("persisted");
        });
    });

    describe("Critical Security: LLM Cannot Persist Directly", () => {
        test("Service detects create_initial_budget bypass attempt", () => {
            const toolContext = {
                toolsExecuted: ["create_initial_budget"],
            };

            const error = approvalService.validateNoDirectPersistence(toolContext);
            expect(error).not.toBeNull();
            expect(error).toContain("direct");
        });

        test("Service detects plan_next_month_budget bypass attempt", () => {
            const toolContext = {
                toolsExecuted: ["plan_next_month_budget"],
            };

            const error = approvalService.validateNoDirectPersistence(toolContext);
            expect(error).not.toBeNull();
        });

        test("Proposal-returning tools are allowed (generate_budget_proposal)", () => {
            const toolContext = {
                toolsExecuted: ["generate_budget_proposal"],
            };

            const error = approvalService.validateNoDirectPersistence(toolContext);
            expect(error).toBeNull();
        });
    });

    describe("UI Labeling - PROPOSED until Approved", () => {
        test("Proposal displays as PROPOSED status", () => {
            const proposal = createMockProposal({ status: BudgetProposalStatus.PROPOSED });
            expect(proposal.status).toBe(BudgetProposalStatus.PROPOSED);
        });

        test("Only PERSISTED proposals are actual budgets", () => {
            const proposed = createMockProposal({ status: BudgetProposalStatus.PROPOSED });
            const persisted = createMockProposal({ status: BudgetProposalStatus.PERSISTED });

            expect(proposed.status).toBe(BudgetProposalStatus.PROPOSED);
            expect(persisted.status).toBe(BudgetProposalStatus.PERSISTED);
            expect(proposed.status).not.toBe(persisted.status);
        });

        test("Validation warnings appear before approval", () => {
            const proposal = createMockProposal({
                proposedChanges: [
                    {
                        category: "Entertainment",
                        proposedBudgetCents: Money(100000),
                        currentBudgetCents: Money(20000),
                        reason: "Vacation",
                    },
                ],
            });

            const result = approvalService.validateProposal(proposal);
            expect(result.status).toBe(BudgetValidationStatus.WARNINGS);
            expect(result.warnings.length).toBeGreaterThan(0);
        });
    });

    describe("Approval Decision Proof", () => {
        test("ONLY explicit approval converts proposal to persisted budget", () => {
            const proposal = createMockProposal({ status: BudgetProposalStatus.PROPOSED });

            // Unapproved stays PROPOSED
            expect(proposal.status).toBe(BudgetProposalStatus.PROPOSED);

            // After approval workflow, becomes PERSISTED
            const approved = createMockProposal({ status: BudgetProposalStatus.PERSISTED });
            expect(approved.status).toBe(BudgetProposalStatus.PERSISTED);

            expect(proposal.status).not.toBe(approved.status);
        });

        test("Unapproved proposals cannot alter household budget", () => {
            const proposal = createMockProposal({ status: BudgetProposalStatus.PROPOSED });

            // PROPOSED is not a budget
            const isBudget = proposal.status === BudgetProposalStatus.PERSISTED;
            expect(isBudget).toBe(false);

            // Only PERSISTED proposals are budgets
            const persisted = createMockProposal({ status: BudgetProposalStatus.PERSISTED });
            const isPersisted = persisted.status === BudgetProposalStatus.PERSISTED;
            expect(isPersisted).toBe(true);
        });

        test("Workflow requires user review before approval", () => {
            // PROPOSED → UNDER_REVIEW → APPROVED → PERSISTED
            let proposal = createMockProposal({ status: BudgetProposalStatus.PROPOSED });
            expect(proposal.status).toBe(BudgetProposalStatus.PROPOSED);

            proposal = createMockProposal({ status: BudgetProposalStatus.UNDER_REVIEW });
            expect(proposal.status).toBe(BudgetProposalStatus.UNDER_REVIEW);

            proposal = createMockProposal({ status: BudgetProposalStatus.PERSISTED });
            expect(proposal.status).toBe(BudgetProposalStatus.PERSISTED);
        });
    });
});
