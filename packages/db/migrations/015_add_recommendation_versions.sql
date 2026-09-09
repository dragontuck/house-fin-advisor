-- Slice 5: Add Recommendation Versions Table
-- Date: 2026-09-09
-- Purpose: Track all versions of a recommendation (immutable audit trail)

CREATE TABLE recommendation_versions (
    id UUID PRIMARY KEY,
    recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE RESTRICT,
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL,
    
    -- What changed and why
    reason VARCHAR(50) NOT NULL, -- "INITIAL" | "ASSUMPTION_CHANGE" | "EVIDENCE_UPDATE" | etc.
    change_description TEXT,
    
    -- Complete snapshot of this version's recommendation (immutable copy)
    recommendation JSONB NOT NULL,
    
    -- Comparison to previous version
    previous_version_id UUID REFERENCES recommendation_versions(id) ON DELETE SET NULL,
    materially_different BOOLEAN NOT NULL DEFAULT false, -- Did core recommendation change?
    
    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES household_members(id) ON DELETE RESTRICT,
    
    -- Constraints
    CONSTRAINT valid_reason CHECK (
        reason IN (
            'INITIAL',
            'ASSUMPTION_CHANGE',
            'EVIDENCE_UPDATE',
            'VALIDATION_CHANGE',
            'POLICY_CHANGE',
            'DATA_REFRESH',
            'SUPERSEDED'
        )
    ),
    UNIQUE (recommendation_id, version)
);

-- Indexes for common queries
CREATE INDEX idx_recommendation_versions_recommendation_id ON recommendation_versions(recommendation_id);
CREATE INDEX idx_recommendation_versions_household_id ON recommendation_versions(household_id);
CREATE INDEX idx_recommendation_versions_version ON recommendation_versions(recommendation_id, version DESC);
CREATE INDEX idx_recommendation_versions_created_at ON recommendation_versions(created_at);
CREATE INDEX idx_recommendation_versions_materially_different ON recommendation_versions(materially_different) 
    WHERE materially_different = true;
