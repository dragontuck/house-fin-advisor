-- Slice 5: Add Recommendations Table
-- Date: 2026-09-09
-- Purpose: Store structured financial recommendations with complete lineage

CREATE TABLE recommendations (
    id UUID PRIMARY KEY,
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
    member_id UUID NOT NULL REFERENCES household_members(id) ON DELETE RESTRICT,
    conversation_id UUID REFERENCES advisor_conversations(id) ON DELETE SET NULL,
    
    -- Classification
    type VARCHAR(50) NOT NULL, -- RecommendationType enum
    title VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    
    -- Financial basis (immutable references)
    financial_snapshot_id UUID NOT NULL REFERENCES financial_snapshots(id) ON DELETE RESTRICT,
    financial_snapshot_version INTEGER NOT NULL,
    policy_version INTEGER NOT NULL,
    
    -- Related scenarios (stored as JSON array of UUIDs)
    scenario_ids JSONB DEFAULT '[]',
    
    -- Complex structures (stored as JSON for flexibility and future schema evolution)
    alternatives JSONB NOT NULL DEFAULT '[]', -- RecommendationAlternative[]
    assumptions JSONB NOT NULL DEFAULT '[]',  -- RecommendationAssumption[]
    risks JSONB NOT NULL DEFAULT '[]',        -- RecommendationRisk[]
    evidence JSONB NOT NULL DEFAULT '[]',     -- RecommendationEvidence[]
    
    -- Validation (populated by validation service, optional at creation)
    validation_status VARCHAR(30), -- "PASS" | "PASS_WITH_WARNINGS" | "FAIL" | "INSUFFICIENT_INFORMATION"
    validation_result JSONB,       -- RecommendationValidation
    
    -- Confidence
    confidence VARCHAR(20) NOT NULL, -- ConfidenceLevel enum
    confidence_reasoning TEXT NOT NULL,
    
    -- Approval workflow
    approval_status VARCHAR(20) NOT NULL DEFAULT 'PROPOSED', -- RecommendationStatus enum
    approval_required BOOLEAN NOT NULL DEFAULT true,
    approved_at TIMESTAMP,
    approved_by UUID REFERENCES household_members(id) ON DELETE SET NULL,
    approval_notes TEXT,
    declined_at TIMESTAMP,
    declined_by UUID REFERENCES household_members(id) ON DELETE SET NULL,
    declination_reason TEXT,
    expires_at TIMESTAMP,
    
    -- Versioning
    version INTEGER NOT NULL DEFAULT 1,
    previous_version_id UUID REFERENCES recommendations(id) ON DELETE SET NULL,
    
    -- Audit trail
    created_by UUID NOT NULL REFERENCES household_members(id) ON DELETE RESTRICT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    correlation_id UUID NOT NULL UNIQUE, -- Trace ID for all related operations
    
    -- Constraints
    CONSTRAINT valid_approval_status CHECK (
        approval_status IN ('PROPOSED', 'REVIEWED', 'APPROVED', 'DECLINED', 'EXPIRED', 'INVALIDATED')
    ),
    CONSTRAINT valid_confidence CHECK (
        confidence IN ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT_INFORMATION')
    ),
    CONSTRAINT valid_validation_status CHECK (
        validation_status IS NULL 
        OR validation_status IN ('PASS', 'PASS_WITH_WARNINGS', 'FAIL', 'INSUFFICIENT_INFORMATION')
    ),
    CONSTRAINT valid_type CHECK (
        type IN (
            'BUDGET_CHANGE',
            'SAVINGS_ALLOCATION',
            'EMERGENCY_FUND',
            'DEBT_ACTION',
            'WINDFALL_ALLOCATION',
            'SURPRISE_EXPENSE',
            'GOAL_PRIORITY',
            'CASH_MANAGEMENT',
            'CREDIT_CARD_DECISION',
            'FINANCIAL_INDEPENDENCE',
            'GENERAL_FINANCIAL_DECISION'
        )
    ),
    UNIQUE (id, household_id)
);

-- Indexes for common queries
CREATE INDEX idx_recommendations_household_id ON recommendations(household_id);
CREATE INDEX idx_recommendations_member_id ON recommendations(member_id);
CREATE INDEX idx_recommendations_approval_status ON recommendations(approval_status);
CREATE INDEX idx_recommendations_type ON recommendations(type);
CREATE INDEX idx_recommendations_created_at ON recommendations(created_at);
CREATE INDEX idx_recommendations_financial_snapshot_id ON recommendations(financial_snapshot_id);
CREATE INDEX idx_recommendations_expires_at ON recommendations(expires_at);
CREATE INDEX idx_recommendations_correlation_id ON recommendations(correlation_id);

-- Index for finding expired recommendations
CREATE INDEX idx_recommendations_status_expires ON recommendations(approval_status, expires_at) 
    WHERE approval_status = 'PROPOSED' AND expires_at IS NOT NULL;
