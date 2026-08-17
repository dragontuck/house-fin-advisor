-- Migration 008: Savings goals and emergency fund policy
-- Adds per-household savings goal tracking and emergency fund coverage thresholds

SET search_path TO finhouse;

-- Emergency fund coverage policy stored alongside existing household financial settings.
-- Defaults represent conventional financial guidance (3 / 6 / 9 months).
ALTER TABLE household_settings
    ADD COLUMN emergency_fund_min_months     INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN emergency_fund_target_months  INTEGER NOT NULL DEFAULT 6,
    ADD COLUMN emergency_fund_stretch_months INTEGER NOT NULL DEFAULT 9;

ALTER TABLE household_settings
    ADD CONSTRAINT check_ef_min_months_positive
        CHECK (emergency_fund_min_months >= 1),
    ADD CONSTRAINT check_ef_months_order
        CHECK (emergency_fund_min_months    <= emergency_fund_target_months
           AND emergency_fund_target_months <= emergency_fund_stretch_months);

-- Household savings goals: explicit targets tracked over time.
-- The service calculates derived fields (status, projectedDate, etc.) — they are never stored.
CREATE TABLE savings_goals (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id                UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,

    name                        VARCHAR(255) NOT NULL,
    type                        VARCHAR(50)  NOT NULL,

    -- Core amounts (cents, non-negative)
    target_amount_cents         BIGINT NOT NULL,
    current_amount_cents        BIGINT NOT NULL DEFAULT 0,
    monthly_contribution_cents  BIGINT NOT NULL DEFAULT 0,

    -- Optional deadline and user notes
    target_date                 DATE,
    start_date                  DATE        NOT NULL DEFAULT CURRENT_DATE,
    notes                       TEXT,

    -- Optimistic concurrency
    version                     INTEGER NOT NULL DEFAULT 1,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_savings_goal_target_positive
        CHECK (target_amount_cents > 0),
    CONSTRAINT check_savings_goal_current_non_negative
        CHECK (current_amount_cents >= 0),
    CONSTRAINT check_savings_goal_contribution_non_negative
        CHECK (monthly_contribution_cents >= 0),
    CONSTRAINT check_savings_goal_name_not_empty
        CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT check_savings_goal_type
        CHECK (type IN ('EMERGENCY_FUND','VACATION','ENTERTAINMENT','PROJECT','RETIREMENT','CUSTOM'))
);

CREATE INDEX idx_savings_goals_household ON savings_goals(household_id);
CREATE INDEX idx_savings_goals_type ON savings_goals(household_id, type);

CREATE TRIGGER savings_goals_updated_at
    BEFORE UPDATE ON savings_goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE savings_goals
    IS 'Household savings targets. Calculated fields (status, projectedDate) are derived at query time — never persisted.';
COMMENT ON COLUMN savings_goals.type
    IS 'GoalType enum: EMERGENCY_FUND | VACATION | ENTERTAINMENT | PROJECT | RETIREMENT | CUSTOM';
COMMENT ON COLUMN savings_goals.target_date
    IS 'Optional desired completion date. When NULL, no deadline is tracked.';
COMMENT ON COLUMN household_settings.emergency_fund_min_months
    IS 'Minimum acceptable emergency fund coverage in calendar months.';
COMMENT ON COLUMN household_settings.emergency_fund_target_months
    IS 'Preferred emergency fund coverage target in calendar months.';
COMMENT ON COLUMN household_settings.emergency_fund_stretch_months
    IS 'Stretch / fully-funded emergency fund coverage goal in calendar months.';
