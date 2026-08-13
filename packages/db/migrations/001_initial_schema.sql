-- Initial schema for house-fin-advisor Slice 1
-- Households, Members, Accounts, and Financial Snapshots

-- Create finhouse schema
CREATE SCHEMA IF NOT EXISTS finhouse;

-- Set default schema for this migration
SET search_path TO finhouse;

-- Create enum types
CREATE TYPE household_member_role AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE household_member_visibility AS ENUM ('VISIBLE', 'HIDDEN');
CREATE TYPE account_type AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'LOAN', 'RETIREMENT', 'INVESTMENT', 'MORTGAGE');
CREATE TYPE account_ownership AS ENUM ('INDIVIDUAL', 'JOINT');
CREATE TYPE account_status AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED');
CREATE TYPE financial_health_status AS ENUM ('HEALTHY', 'ATTENTION', 'AT_RISK');

-- Create households table
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create household members table
CREATE TABLE household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  identity_id VARCHAR(255) NOT NULL, -- Keycloak user ID
  display_name VARCHAR(255) NOT NULL,
  role household_member_role NOT NULL DEFAULT 'MEMBER',
  visibility household_member_visibility NOT NULL DEFAULT 'VISIBLE',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(household_id, identity_id)
);

-- Create accounts table
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type account_type NOT NULL,
  ownership account_ownership NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  current_balance_cents BIGINT NOT NULL, -- Store as cents to avoid float precision issues
  institution_name VARCHAR(255),
  last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status account_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create financial_snapshots table
-- This is a derived, immutable record of household financial state
CREATE TABLE financial_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  as_of DATE NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, -- calculation_version
  cash_cents BIGINT NOT NULL, -- sum of checking + savings
  debt_cents BIGINT NOT NULL, -- sum of credit cards + loans (positive value)
  net_worth_cents BIGINT NOT NULL, -- assets - liabilities
  monthly_income_cents BIGINT NOT NULL, -- household-level seed value
  monthly_essential_expenses_cents BIGINT NOT NULL, -- household-level seed value
  monthly_discretionary_expenses_cents BIGINT NOT NULL, -- household-level seed value
  monthly_surplus_cents BIGINT NOT NULL, -- income - essential - discretionary
  financial_health_status financial_health_status NOT NULL,
  source_account_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[], -- Account IDs that contributed to snapshot (audit trail)
  snapshot_source_id UUID, -- reference to accounts snapshot version if needed
  calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create household_settings table
-- Stores financial configuration per household (income, essential expenses, discretionary expenses)
CREATE TABLE household_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  monthly_income_cents BIGINT NOT NULL,
  monthly_essential_expenses_cents BIGINT NOT NULL,
  monthly_discretionary_expenses_cents BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  income_source VARCHAR(50) NOT NULL DEFAULT 'manual_entry', -- manual_entry, bank_feed, user_provided
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_household_members_household_id ON household_members(household_id);
CREATE INDEX idx_household_members_identity_id ON household_members(identity_id);
CREATE INDEX idx_accounts_household_id ON accounts(household_id);
CREATE INDEX idx_accounts_status ON accounts(status);
CREATE INDEX idx_financial_snapshots_household_id ON financial_snapshots(household_id);
CREATE INDEX idx_financial_snapshots_as_of ON financial_snapshots(household_id, as_of DESC);
CREATE INDEX idx_household_settings_household_id ON household_settings(household_id);

-- Add trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER households_updated_at BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER household_members_updated_at BEFORE UPDATE ON household_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER household_settings_updated_at BEFORE UPDATE ON household_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
