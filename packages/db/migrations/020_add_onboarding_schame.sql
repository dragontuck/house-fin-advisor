-- Migration: 001_add_onboarding_schema.sql
-- Description: Creates tables for tracking household onboarding progress, checkpoints, income/expense detections, and related analytics views.

BEGIN;

-- ============================================================================
-- UP MIGRATION
-- ============================================================================

-- 1. Create onboarding_progress table
CREATE TABLE IF NOT EXISTS onboarding_progress (
    id UUID PRIMARY KEY,
    household_id UUID NOT NULL UNIQUE,
    current_phase INT NOT NULL DEFAULT 1,
    current_state VARCHAR(50) NOT NULL DEFAULT 'NOT_STARTED',
    
    -- Completion status per phase
    phase_1_completed_at TIMESTAMPTZ NULL,
    phase_2_completed_at TIMESTAMPTZ NULL,
    phase_3_completed_at TIMESTAMPTZ NULL,
    phase_4_completed_at TIMESTAMPTZ NULL,
    phase_5_completed_at TIMESTAMPTZ NULL,
    phase_6_completed_at TIMESTAMPTZ NULL,
    
    -- Timing metrics
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ NULL,
    total_time_seconds INT NULL,
    
    -- Data storage
    phase_1_data JSONB NULL,
    phase_2_data JSONB NULL,
    phase_3_data JSONB NULL,
    phase_4_data JSONB NULL,
    phase_5_data JSONB NULL,
    phase_6_data JSONB NULL,
    
    -- Audit trail
    created_by VARCHAR(255) NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys & Constraints
    CONSTRAINT fk_onboarding_progress_household 
        FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
    CONSTRAINT chk_current_phase 
        CHECK (current_phase BETWEEN 1 AND 6)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_progress_household_phase 
    ON onboarding_progress (household_id, current_phase);
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_started_at 
    ON onboarding_progress (started_at);


-- 2. Create onboarding_checkpoints table
CREATE TABLE IF NOT EXISTS onboarding_checkpoints (
    id UUID PRIMARY KEY,
    household_id UUID NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    phase INT NOT NULL,
    checkpoint_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    CONSTRAINT fk_onboarding_checkpoints_household 
        FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_onboarding_checkpoints_household_session 
    ON onboarding_checkpoints (household_id, session_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_checkpoints_created_at 
    ON onboarding_checkpoints (created_at);


-- 3. Extend existing tables
ALTER TABLE accounts 
    ADD COLUMN IF NOT EXISTS onboarding_declaration_id VARCHAR(255) NULL;

ALTER TABLE financial_documents 
    ADD COLUMN IF NOT EXISTS onboarding_phase_id INT NULL,
    ADD COLUMN IF NOT EXISTS onboarding_order INT NULL;


-- 4. Create onboarding_income_detection table
CREATE TABLE IF NOT EXISTS onboarding_income_detection (
    id UUID PRIMARY KEY,
    household_id UUID NOT NULL,
    onboarding_id UUID NOT NULL,
    
    -- Detection metadata
    detection_source VARCHAR(50) NOT NULL, -- 'BANK_DEPOSITS' | 'MANUAL_ENTRY'
    confidence VARCHAR(20) NOT NULL,        -- 'HIGH' | 'MEDIUM' | 'LOW'
    monthly_gross_amount_cents BIGINT NOT NULL,
    monthly_net_amount_cents BIGINT NULL,
    annual_gross_amount_cents BIGINT NULL,
    
    -- Detection details
    detection_details JSONB NULL,
    user_confirmed BOOLEAN DEFAULT FALSE,
    confirmed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    CONSTRAINT fk_income_detection_household 
        FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
    CONSTRAINT fk_income_detection_onboarding 
        FOREIGN KEY (onboarding_id) REFERENCES onboarding_progress (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_onboarding_income_detection_hh_onboarding 
    ON onboarding_income_detection (household_id, onboarding_id);


-- 5. Create onboarding_expense_detection table
CREATE TABLE IF NOT EXISTS onboarding_expense_detection (
    id UUID PRIMARY KEY,
    household_id UUID NOT NULL,
    onboarding_id UUID NOT NULL,
    
    -- Detected category
    expense_category VARCHAR(100) NOT NULL,
    monthly_amount_cents BIGINT NOT NULL,
    confidence VARCHAR(20) NOT NULL, -- 'HIGH' | 'MEDIUM' | 'LOW'
    
    -- Detection source
    detection_source VARCHAR(50) NOT NULL, -- 'AUTO_DETECTED' | 'MANUAL_ENTRY'
    detected_from_transaction_count INT NULL,
    
    -- User confirmation
    user_confirmed BOOLEAN DEFAULT FALSE,
    user_amount_cents BIGINT NULL,
    confirmed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    CONSTRAINT fk_expense_detection_household 
        FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE,
    CONSTRAINT fk_expense_detection_onboarding 
        FOREIGN KEY (onboarding_id) REFERENCES onboarding_progress (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_onboarding_expense_detection_hh_category 
    ON onboarding_expense_detection (household_id, expense_category);


-- 6. Create analytics view
CREATE OR REPLACE VIEW onboarding_completion_status AS
SELECT
    household_id,
    current_phase,
    (phase_1_completed_at IS NOT NULL) AS phase_1_complete,
    (phase_2_completed_at IS NOT NULL) AS phase_2_complete,
    (phase_3_completed_at IS NOT NULL) AS phase_3_complete,
    (phase_4_completed_at IS NOT NULL) AS phase_4_complete,
    (phase_5_completed_at IS NOT NULL) AS phase_5_complete,
    (phase_6_completed_at IS NOT NULL) AS phase_6_complete,
    (completed_at IS NOT NULL) AS fully_complete,
    total_time_seconds,
    started_at,
    completed_at
FROM onboarding_progress;

COMMIT;

/*
-- ============================================================================
-- DOWN MIGRATION (Execute separately when rolling back)
-- ============================================================================

BEGIN;

DROP VIEW IF EXISTS onboarding_completion_status;

DROP TABLE IF EXISTS onboarding_expense_detection;
DROP TABLE IF EXISTS onboarding_income_detection;
DROP TABLE IF EXISTS onboarding_checkpoints;
DROP TABLE IF EXISTS onboarding_progress;

ALTER TABLE financial_documents 
    DROP COLUMN IF EXISTS onboarding_order,
    DROP COLUMN IF EXISTS onboarding_phase_id;

ALTER TABLE accounts 
    DROP COLUMN IF EXISTS onboarding_declaration_id;

COMMIT;
*/