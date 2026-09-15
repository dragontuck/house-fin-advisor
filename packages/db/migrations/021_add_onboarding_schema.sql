-- Migration: 021_update_onboarding_schema.sql
-- Description: Updates the onboarding schema following 020.sql. Adds missing columns, aligns schema definitions, and adds missing indexes.

BEGIN;

-- ============================================================================
-- UP MIGRATION
-- ============================================================================

-- 1. Update onboarding_progress table
ALTER TABLE onboarding_progress
    ADD COLUMN IF NOT EXISTS last_checkpoint_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_created_at 
    ON onboarding_progress (created_at);


-- 2. Update onboarding_checkpoints table
CREATE INDEX IF NOT EXISTS idx_checkpoint_created_at 
    ON onboarding_checkpoints (created_at);


-- 3. Update onboarding_income_detection table
-- Rename columns to match Knex schema definitions if they exist under 020 names
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'onboarding_income_detection' AND column_name = 'monthly_gross_amount_cents'
    ) THEN
        ALTER TABLE onboarding_income_detection RENAME COLUMN monthly_gross_amount_cents TO monthly_gross_cents;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'onboarding_income_detection' AND column_name = 'monthly_net_amount_cents'
    ) THEN
        ALTER TABLE onboarding_income_detection RENAME COLUMN monthly_net_amount_cents TO monthly_net_cents;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'onboarding_income_detection' AND column_name = 'annual_gross_amount_cents'
    ) THEN
        ALTER TABLE onboarding_income_detection RENAME COLUMN annual_gross_amount_cents TO annual_gross_cents;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_income_detection_created_at 
    ON onboarding_income_detection (created_at);


-- 4. Update onboarding_expense_detection table
CREATE INDEX IF NOT EXISTS idx_expense_detection_household_onboarding 
    ON onboarding_expense_detection (household_id, onboarding_id);

CREATE INDEX IF NOT EXISTS idx_expense_detection_created_at 
    ON onboarding_expense_detection (created_at);


-- 5. Extend financial_documents table
-- Add onboarding_phase (or rename onboarding_phase_id to onboarding_phase)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'financial_documents' AND column_name = 'onboarding_phase_id'
    ) THEN
        ALTER TABLE financial_documents RENAME COLUMN onboarding_phase_id TO onboarding_phase;
    ELSE
        ALTER TABLE financial_documents ADD COLUMN IF NOT EXISTS onboarding_phase SMALLINT NULL;
    END IF;
END $$;

COMMIT;

/*
-- ============================================================================
-- DOWN MIGRATION (Execute separately when rolling back)
-- ============================================================================

BEGIN;

DROP INDEX IF EXISTS idx_expense_detection_created_at;
DROP INDEX IF EXISTS idx_expense_detection_household_onboarding;
DROP INDEX IF EXISTS idx_income_detection_created_at;
DROP INDEX IF EXISTS idx_checkpoint_created_at;
DROP INDEX IF EXISTS idx_onboarding_created_at;

ALTER TABLE onboarding_progress 
    DROP COLUMN IF EXISTS last_checkpoint_id;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'financial_documents' AND column_name = 'onboarding_phase'
    ) THEN
        ALTER TABLE financial_documents RENAME COLUMN onboarding_phase TO onboarding_phase_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'onboarding_income_detection' AND column_name = 'monthly_gross_cents'
    ) THEN
        ALTER TABLE onboarding_income_detection RENAME COLUMN monthly_gross_cents TO monthly_gross_amount_cents;
        ALTER TABLE onboarding_income_detection RENAME COLUMN monthly_net_cents TO monthly_net_amount_cents;
        ALTER TABLE onboarding_income_detection RENAME COLUMN annual_gross_cents TO annual_gross_amount_cents;
    END IF;
END $$;

COMMIT;
*/