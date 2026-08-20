-- Migration 011: Budget Approval Workflow
-- Implements the approval workflow for AI-generated budget proposals
-- 
-- Workflow:
-- 1. AI generates proposal (budget_proposals.status = PROPOSED)
-- 2. User reviews and optionally makes changes
-- 3. User explicitly approves (budget_approvals)
-- 4. System creates new budget version (budgets with version incremented)
-- 5. Audit trail recorded (budget_approval_audit)

SET search_path TO finhouse;

-- Proposed budgets - AI-generated plans awaiting approval
CREATE TABLE budget_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  conversation_id UUID,                          -- Reference to advisor conversation if AI-initiated
  
  -- Period: year + month (1-12) define the planning window
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  
  -- Source snapshot for reproducibility
  financial_snapshot_id UUID,
  snapshot_version INTEGER,
  
  -- Status: PROPOSED → APPROVED → PERSISTED or REJECTED
  status VARCHAR(50) NOT NULL DEFAULT 'PROPOSED',
  
  -- Proposed changes: JSON array of {category, proposedBudgetCents, currentBudgetCents, reason}
  proposed_changes JSONB NOT NULL,
  
  -- Optional user modifications during review (edited version of proposed_changes)
  approved_changes JSONB,
  
  -- Summary for UI display
  title VARCHAR(255),
  description TEXT,
  
  -- Validation results (from financial_validation service)
  validation_status VARCHAR(50),                 -- VALID, INVALID, WARNINGS
  validation_notes JSONB,
  
  -- Audit trail
  created_by UUID NOT NULL,                      -- Who initiated (AI system or user) - not constrained to household_members
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT check_period_month_valid CHECK (period_month >= 1 AND period_month <= 12),
  CONSTRAINT check_period_year_valid CHECK (period_year >= 2000 AND period_year <= 2100),
  CONSTRAINT check_status_valid CHECK (status IN ('PROPOSED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PERSISTED'))
);

CREATE INDEX idx_budget_proposals_household ON budget_proposals(household_id);
CREATE INDEX idx_budget_proposals_period ON budget_proposals(household_id, period_year, period_month);
CREATE INDEX idx_budget_proposals_status ON budget_proposals(status);
CREATE INDEX idx_budget_proposals_conversation ON budget_proposals(conversation_id) WHERE conversation_id IS NOT NULL;

CREATE TRIGGER budget_proposals_updated_at BEFORE UPDATE ON budget_proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Budget approvals - explicit user approval decision
CREATE TABLE budget_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES budget_proposals(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  
  -- Who approved it
  approved_by UUID NOT NULL REFERENCES household_members(id) ON DELETE RESTRICT,
  approved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Approval comment (optional)
  comment TEXT,
  
  -- Link to new budget version that was created
  created_budget_snapshot_id UUID                 -- Links to which budgets were persisted
);

CREATE INDEX idx_budget_approvals_proposal ON budget_approvals(proposal_id);
CREATE INDEX idx_budget_approvals_household ON budget_approvals(household_id);
CREATE INDEX idx_budget_approvals_approved_by ON budget_approvals(approved_by);
CREATE INDEX idx_budget_approvals_approved_at ON budget_approvals(approved_at DESC);

-- Audit trail - tracks all changes to budget through approval workflow
CREATE TABLE budget_approval_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES budget_proposals(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  
  -- Event: CREATED, VALIDATED, USER_REVIEWED, USER_CHANGED, APPROVED, PERSISTED, REJECTED
  event_type VARCHAR(50) NOT NULL,
  
  -- Previous state (what changed)
  previous_state JSONB,
  new_state JSONB,
  
  -- Who triggered the event
  triggered_by UUID REFERENCES household_members(id) ON DELETE SET NULL,
  
  -- When
  event_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Optional notes about why
  reason TEXT
);

CREATE INDEX idx_budget_approval_audit_proposal ON budget_approval_audit(proposal_id);
CREATE INDEX idx_budget_approval_audit_household ON budget_approval_audit(household_id);
CREATE INDEX idx_budget_approval_audit_event ON budget_approval_audit(event_type);
CREATE INDEX idx_budget_approval_audit_time ON budget_approval_audit(event_at DESC);

-- Add version tracking to budgets table to support budget versions
-- (if not already present from previous schema version)
ALTER TABLE budgets
ADD COLUMN IF NOT EXISTS parent_budget_id UUID REFERENCES budgets(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS approval_id UUID REFERENCES budget_approvals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_budgets_parent ON budgets(parent_budget_id);
CREATE INDEX IF NOT EXISTS idx_budgets_approval ON budgets(approval_id);

COMMENT ON TABLE budget_proposals IS 
  'AI-proposed budget plans awaiting user review and explicit approval. A proposal is NOT a budget until approved and persisted.';

COMMENT ON TABLE budget_approvals IS 
  'Explicit user approval decisions that convert a proposed budget into a persisted budget version.';

COMMENT ON TABLE budget_approval_audit IS 
  'Immutable audit trail of all state changes in the budget approval workflow.';

COMMENT ON COLUMN budget_proposals.status IS 
  'Workflow status: PROPOSED (AI generated), UNDER_REVIEW (user reviewing), APPROVED (user approved), REJECTED (user rejected), PERSISTED (converted to actual budget)';

COMMENT ON COLUMN budget_proposals.proposed_changes IS 
  'JSON array of proposed budget changes: [{category, proposedBudgetCents, currentBudgetCents, reason}]';

COMMENT ON COLUMN budget_proposals.approved_changes IS 
  'If user modified the proposal, this contains the final approved changes (same structure as proposed_changes)';

COMMENT ON COLUMN budget_approvals.created_budget_snapshot_id IS 
  'After approval, links to the set of budgets that were persisted (could query budgets.approval_id)';
