/**
 * BudgetApprovalRepository — handles budget proposal and approval persistence.
 * 
 * Enforces the approval workflow:
 * 1. Proposals start in PROPOSED status
 * 2. Users review and can modify
 * 3. Only explicit approval persists to actual budgets
 * 4. Full audit trail maintained
 */

import { query } from "../connection";
import {
    EntityId,
    BudgetProposal,
    BudgetProposalStatus,
    BudgetApproval,
    BudgetApprovalAuditEntry,
    ProposedChange,
    Budget,
} from "@house-fin/contracts";

export class PgBudgetApprovalRepository {
    /**
     * Create a new budget proposal.
     * Starts in PROPOSED status, awaiting review and validation.
     */
    async createProposal(
        householdId: EntityId,
        periodYear: number,
        periodMonth: number,
        proposedChanges: ProposedChange[],
        createdBy: EntityId,
        options?: {
            conversationId?: EntityId;
            financialSnapshotId?: EntityId;
            snapshotVersion?: number;
            title?: string;
            description?: string;
        }
    ): Promise<BudgetProposal> {
        const result = await query(
            `INSERT INTO budget_proposals (
                household_id, period_year, period_month, 
                proposed_changes, created_by,
                conversation_id, financial_snapshot_id, snapshot_version,
                title, description, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id, household_id, conversation_id, period_year, period_month,
                      financial_snapshot_id, snapshot_version, status,
                      proposed_changes, approved_changes, 
                      validation_status, validation_notes,
                      title, description,
                      created_by, created_at, updated_at`,
            [
                householdId,
                periodYear,
                periodMonth,
                JSON.stringify(proposedChanges),
                createdBy,
                options?.conversationId || null,
                options?.financialSnapshotId || null,
                options?.snapshotVersion || null,
                options?.title || null,
                options?.description || null,
                BudgetProposalStatus.PROPOSED,
            ]
        );

        return this.mapProposalRow(result.rows[0]);
    }

    /**
     * Find a proposal by ID.
     */
    async findProposalById(proposalId: EntityId): Promise<BudgetProposal | null> {
        const result = await query(
            `SELECT id, household_id, conversation_id, period_year, period_month,
                    financial_snapshot_id, snapshot_version, status,
                    proposed_changes, approved_changes,
                    validation_status, validation_notes,
                    title, description,
                    created_by, created_at, updated_at
             FROM budget_proposals
             WHERE id = $1`,
            [proposalId]
        );

        return result.rows.length > 0 ? this.mapProposalRow(result.rows[0]) : null;
    }

    /**
     * Find all proposals for a household in a period.
     */
    async findProposalsByHouseholdAndPeriod(
        householdId: EntityId,
        periodYear: number,
        periodMonth: number
    ): Promise<BudgetProposal[]> {
        const result = await query(
            `SELECT id, household_id, conversation_id, period_year, period_month,
                    financial_snapshot_id, snapshot_version, status,
                    proposed_changes, approved_changes,
                    validation_status, validation_notes,
                    title, description,
                    created_by, created_at, updated_at
             FROM budget_proposals
             WHERE household_id = $1 AND period_year = $2 AND period_month = $3
             ORDER BY created_at DESC`,
            [householdId, periodYear, periodMonth]
        );

        return result.rows.map((row) => this.mapProposalRow(row));
    }

    /**
     * Find active (not yet rejected/persisted) proposals for a household.
     */
    async findActiveProposalsByHousehold(householdId: EntityId): Promise<BudgetProposal[]> {
        const result = await query(
            `SELECT id, household_id, conversation_id, period_year, period_month,
                    financial_snapshot_id, snapshot_version, status,
                    proposed_changes, approved_changes,
                    validation_status, validation_notes,
                    title, description,
                    created_by, created_at, updated_at
             FROM budget_proposals
             WHERE household_id = $1 AND status != $2 AND status != $3
             ORDER BY created_at DESC`,
            [householdId, BudgetProposalStatus.REJECTED, BudgetProposalStatus.PERSISTED]
        );

        return result.rows.map((row) => this.mapProposalRow(row));
    }

    /**
     * Update proposal status (PROPOSED → UNDER_REVIEW → APPROVED, etc).
     */
    async updateProposalStatus(
        proposalId: EntityId,
        newStatus: BudgetProposalStatus,
        approvedChanges?: ProposedChange[]
    ): Promise<BudgetProposal> {
        const result = await query(
            `UPDATE budget_proposals
             SET status = $1,
                 approved_changes = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
             RETURNING id, household_id, conversation_id, period_year, period_month,
                       financial_snapshot_id, snapshot_version, status,
                       proposed_changes, approved_changes,
                       validation_status, validation_notes,
                       title, description,
                       created_by, created_at, updated_at`,
            [
                newStatus,
                approvedChanges ? JSON.stringify(approvedChanges) : null,
                proposalId,
            ]
        );

        if (result.rows.length === 0) {
            throw new Error(`Proposal ${proposalId} not found`);
        }

        return this.mapProposalRow(result.rows[0]);
    }

    /**
     * Update validation results for a proposal.
     */
    async updateValidation(
        proposalId: EntityId,
        validationStatus: string,
        validationNotes?: Record<string, unknown>
    ): Promise<void> {
        await query(
            `UPDATE budget_proposals
             SET validation_status = $1,
                 validation_notes = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [
                validationStatus,
                validationNotes ? JSON.stringify(validationNotes) : null,
                proposalId,
            ]
        );
    }

    /**
     * Create an approval record (user approved a proposal).
     */
    async createApproval(
        proposalId: EntityId,
        householdId: EntityId,
        approvedBy: EntityId,
        comment?: string
    ): Promise<BudgetApproval> {
        const result = await query(
            `INSERT INTO budget_approvals (proposal_id, household_id, approved_by, comment)
             VALUES ($1, $2, $3, $4)
             RETURNING id, proposal_id, household_id, approved_by, approved_at, comment, created_budget_snapshot_id`,
            [proposalId, householdId, approvedBy, comment || null]
        );

        return this.mapApprovalRow(result.rows[0]);
    }

    /**
     * Find approval record for a proposal.
     */
    async findApprovalByProposal(proposalId: EntityId): Promise<BudgetApproval | null> {
        const result = await query(
            `SELECT id, proposal_id, household_id, approved_by, approved_at, comment, created_budget_snapshot_id
             FROM budget_approvals
             WHERE proposal_id = $1`,
            [proposalId]
        );

        return result.rows.length > 0 ? this.mapApprovalRow(result.rows[0]) : null;
    }

    /**
     * Record an audit event in the workflow.
     */
    async recordAuditEvent(
        proposalId: EntityId,
        householdId: EntityId,
        eventType: string,
        triggeredBy: EntityId | null,
        options?: {
            previousState?: Record<string, unknown>;
            newState?: Record<string, unknown>;
            reason?: string;
        }
    ): Promise<BudgetApprovalAuditEntry> {
        const result = await query(
            `INSERT INTO budget_approval_audit (
                proposal_id, household_id, event_type, triggered_by, 
                previous_state, new_state, reason
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, proposal_id, household_id, event_type, triggered_by,
                      previous_state, new_state, event_at, reason`,
            [
                proposalId,
                householdId,
                eventType,
                triggeredBy || null,
                options?.previousState ? JSON.stringify(options.previousState) : null,
                options?.newState ? JSON.stringify(options.newState) : null,
                options?.reason || null,
            ]
        );

        return this.mapAuditRow(result.rows[0]);
    }

    /**
     * Find audit trail for a proposal.
     */
    async findAuditTrail(proposalId: EntityId): Promise<BudgetApprovalAuditEntry[]> {
        const result = await query(
            `SELECT id, proposal_id, household_id, event_type, triggered_by,
                    previous_state, new_state, event_at, reason
             FROM budget_approval_audit
             WHERE proposal_id = $1
             ORDER BY event_at ASC`,
            [proposalId]
        );

        return result.rows.map((row) => this.mapAuditRow(row));
    }

    // Private helper methods
    private mapProposalRow(row: any): BudgetProposal {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            conversationId: row.conversation_id as EntityId | undefined,
            periodYear: row.period_year,
            periodMonth: row.period_month,
            financialSnapshotId: row.financial_snapshot_id as EntityId | undefined,
            snapshotVersion: row.snapshot_version,
            status: row.status,
            proposedChanges: row.proposed_changes || [],
            approvedChanges: row.approved_changes || undefined,
            validationStatus: row.validation_status,
            validationNotes: row.validation_notes,
            title: row.title,
            description: row.description,
            createdBy: row.created_by as EntityId,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
        };
    }

    private mapApprovalRow(row: any): BudgetApproval {
        return {
            id: row.id as EntityId,
            proposalId: row.proposal_id as EntityId,
            householdId: row.household_id as EntityId,
            approvedBy: row.approved_by as EntityId,
            approvedAt: new Date(row.approved_at),
            comment: row.comment,
            createdBudgetSnapshotId: row.created_budget_snapshot_id as EntityId | undefined,
        };
    }

    private mapAuditRow(row: any): BudgetApprovalAuditEntry {
        return {
            id: row.id as EntityId,
            proposalId: row.proposal_id as EntityId,
            householdId: row.household_id as EntityId,
            eventType: row.event_type,
            previousState: row.previous_state,
            newState: row.new_state,
            triggeredBy: row.triggered_by as EntityId | undefined,
            eventAt: new Date(row.event_at),
            reason: row.reason,
        };
    }
}
