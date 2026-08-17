-- Migration 009: Add debt-detail columns to accounts
-- These columns are optional; NULL means "data not provided".
-- credit_limit_cents and revolving_balance_cents apply to CREDIT_CARD.
-- interest_rate_bps, minimum_payment_cents, scheduled_payment_cents apply to
-- CREDIT_CARD, LOAN, and MORTGAGE.
-- statement_balance_cents is the last statement balance for CREDIT_CARD accounts.
-- revolving_balance_cents is explicitly set — never inferred from transactions.

ALTER TABLE finhouse.accounts
    ADD COLUMN IF NOT EXISTS credit_limit_cents       BIGINT       DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS interest_rate_bps        INTEGER      DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS minimum_payment_cents    BIGINT       DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS scheduled_payment_cents  BIGINT       DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS statement_balance_cents  BIGINT       DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS revolving_balance_cents  BIGINT       DEFAULT NULL;

-- Validate ranges where values are provided
ALTER TABLE finhouse.accounts
    ADD CONSTRAINT check_credit_limit_positive
        CHECK (credit_limit_cents IS NULL OR credit_limit_cents > 0),
    ADD CONSTRAINT check_interest_rate_bps_range
        CHECK (interest_rate_bps IS NULL OR (interest_rate_bps >= 0 AND interest_rate_bps <= 100000)),
    ADD CONSTRAINT check_minimum_payment_non_negative
        CHECK (minimum_payment_cents IS NULL OR minimum_payment_cents >= 0),
    ADD CONSTRAINT check_scheduled_payment_non_negative
        CHECK (scheduled_payment_cents IS NULL OR scheduled_payment_cents >= 0),
    ADD CONSTRAINT check_statement_balance_non_negative
        CHECK (statement_balance_cents IS NULL OR statement_balance_cents >= 0),
    ADD CONSTRAINT check_revolving_balance_non_negative
        CHECK (revolving_balance_cents IS NULL OR revolving_balance_cents >= 0);

COMMENT ON COLUMN finhouse.accounts.credit_limit_cents IS
    'Credit limit in cents; only applicable to CREDIT_CARD accounts.';
COMMENT ON COLUMN finhouse.accounts.interest_rate_bps IS
    'Annual interest rate in basis points (e.g. 1975 = 19.75%); NULL when unknown.';
COMMENT ON COLUMN finhouse.accounts.minimum_payment_cents IS
    'Minimum required monthly payment in cents; NULL when unknown.';
COMMENT ON COLUMN finhouse.accounts.scheduled_payment_cents IS
    'Scheduled/automatic monthly payment in cents; NULL when unknown.';
COMMENT ON COLUMN finhouse.accounts.statement_balance_cents IS
    'Last statement balance in cents for credit cards; NOT assumed to be revolving.';
COMMENT ON COLUMN finhouse.accounts.revolving_balance_cents IS
    'Carried revolving balance in cents; must be explicitly provided — never inferred.';
