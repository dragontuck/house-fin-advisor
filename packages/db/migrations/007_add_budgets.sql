-- Migration 007: Add budget planning tables for Slice 3 financial intelligence
-- Supports per-category monthly budgets and transaction categorization

SET search_path TO finhouse;

-- Add category to posted_transactions for budget matching
-- Nullable: pre-existing transactions have no category until user assigns one
ALTER TABLE posted_transactions
ADD COLUMN category VARCHAR(100);

CREATE INDEX idx_posted_transactions_category ON posted_transactions(household_id, category, transaction_date DESC);

-- Household budget entries — explicit plans, not inferred from spending
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,

  -- Period: year + month (1-12) define the planning window
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,

  -- Category: matches the category column on posted_transactions
  category VARCHAR(100) NOT NULL,

  -- Planned spending for this category/period (always non-negative; represents an allowance)
  amount_cents BIGINT NOT NULL,

  -- Optional link to a savings goal
  goal_id UUID,

  -- User-provided notes
  notes TEXT,

  -- Optimistic concurrency version
  version INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- One budget entry per category per period per household
  CONSTRAINT uq_budget_household_period_category UNIQUE (household_id, period_year, period_month, category),

  CONSTRAINT check_amount_non_negative CHECK (amount_cents >= 0),
  CONSTRAINT check_period_month_valid CHECK (period_month >= 1 AND period_month <= 12),
  CONSTRAINT check_period_year_valid CHECK (period_year >= 2000 AND period_year <= 2100),
  CONSTRAINT check_category_not_empty CHECK (LENGTH(TRIM(category)) > 0)
);

CREATE INDEX idx_budgets_household ON budgets(household_id);
CREATE INDEX idx_budgets_period ON budgets(household_id, period_year, period_month);

CREATE TRIGGER budgets_updated_at BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE budgets IS 'Household-defined spending plans by category and month. Created explicitly — never auto-generated from observed transactions.';
COMMENT ON COLUMN budgets.amount_cents IS 'Planned spending allowance in cents. Zero is a valid budget (tracks spending against a zero target).';
COMMENT ON COLUMN budgets.category IS 'Spending category matching posted_transactions.category. Free-text to support household-specific categories.';
COMMENT ON COLUMN budgets.version IS 'Optimistic concurrency version, incremented on each update.';
COMMENT ON COLUMN posted_transactions.category IS 'User-assigned spending category for budget matching. NULL until categorized.';
