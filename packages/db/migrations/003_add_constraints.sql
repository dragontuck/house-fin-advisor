-- Migration 003: Add database constraints for edge case protection
-- Ensures financial data maintains valid ranges and prevents invalid states

SET search_path TO finhouse;

-- Add CHECK constraints for accounts table
ALTER TABLE accounts
ADD CONSTRAINT check_non_empty_name CHECK (name ~ '\S'),
ADD CONSTRAINT check_valid_currency CHECK (currency ~ '^[A-Z]{3}$');

-- Add CHECK constraints for household_settings table
ALTER TABLE household_settings
ADD CONSTRAINT check_monthly_income_non_negative CHECK (monthly_income_cents >= 0),
ADD CONSTRAINT check_monthly_essential_expenses_non_negative CHECK (monthly_essential_expenses_cents >= 0),
ADD CONSTRAINT check_monthly_discretionary_expenses_non_negative CHECK (monthly_discretionary_expenses_cents >= 0),
ADD CONSTRAINT check_valid_income_source CHECK (income_source IN ('manual_entry', 'bank_feed', 'user_provided')),
ADD CONSTRAINT check_valid_currency_settings CHECK (currency ~ '^[A-Z]{3}$');

-- Add CHECK constraints for financial_snapshots table
ALTER TABLE financial_snapshots
ADD CONSTRAINT check_cash_non_negative CHECK (cash_cents >= 0),
ADD CONSTRAINT check_debt_non_negative CHECK (debt_cents >= 0),
ADD CONSTRAINT check_income_non_negative CHECK (monthly_income_cents >= 0),
ADD CONSTRAINT check_expenses_non_negative CHECK (
    monthly_essential_expenses_cents >= 0 AND 
    monthly_discretionary_expenses_cents >= 0
);

-- Add constraint to ensure household_settings.updated_by is a valid UUID
ALTER TABLE household_settings
ADD CONSTRAINT check_valid_updated_by_uuid CHECK (updated_by::TEXT ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- Comment on constraints for documentation
COMMENT ON CONSTRAINT check_monthly_income_non_negative ON household_settings IS 'Income must not be negative';
COMMENT ON CONSTRAINT check_monthly_essential_expenses_non_negative ON household_settings IS 'Essential expenses must not be negative';
COMMENT ON CONSTRAINT check_monthly_discretionary_expenses_non_negative ON household_settings IS 'Discretionary expenses must not be negative';
COMMENT ON CONSTRAINT check_cash_non_negative ON financial_snapshots IS 'Cash (checking + savings) must not be negative';
COMMENT ON CONSTRAINT check_debt_non_negative ON financial_snapshots IS 'Debt (absolute value of liabilities) must not be negative';
COMMENT ON CONSTRAINT check_income_non_negative ON financial_snapshots IS 'Income must not be negative';
COMMENT ON CONSTRAINT check_expenses_non_negative ON financial_snapshots IS 'Expenses must not be negative';
