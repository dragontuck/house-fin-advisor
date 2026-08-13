-- Seed data for Slice 1: Tucker Household
-- This data represents the seeded development household

-- Set default schema for this migration
SET search_path TO finhouse;

-- Create the Tucker household
INSERT INTO households (id, name, created_at, updated_at) VALUES
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Tucker Household', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Add household settings
INSERT INTO household_settings (id, household_id, monthly_income_cents, monthly_essential_expenses_cents, monthly_discretionary_expenses_cents, currency, income_source, updated_by, created_at, updated_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440000', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 1200000, 680000, 120000, 'USD', 'manual_entry', '550e8400-e29b-41d4-a716-446655440001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Add household members
INSERT INTO household_members (id, household_id, identity_id, display_name, role, visibility, created_at, updated_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'keycloak-test-user-1', 'Sean', 'OWNER', 'VISIBLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440002', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'keycloak-test-user-2', 'Wife', 'MEMBER', 'VISIBLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Add accounts
-- Cash accounts
INSERT INTO accounts (id, household_id, name, type, ownership, currency, current_balance_cents, institution_name, status, created_at, updated_at, last_updated_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440003', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Checking', 'CHECKING', 'JOINT', 'USD', 720000, 'Main Bank', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440004', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Savings', 'SAVINGS', 'JOINT', 'USD', 1200000, 'Main Bank', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Retirement accounts
INSERT INTO accounts (id, household_id, name, type, ownership, currency, current_balance_cents, institution_name, status, created_at, updated_at, last_updated_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440005', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', '401(k)', 'RETIREMENT', 'INDIVIDUAL', 'USD', 32500000, 'Employer Plan', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('550e8400-e29b-41d4-a716-446655440006', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'IRA', 'RETIREMENT', 'INDIVIDUAL', 'USD', 8500000, 'Retirement Brokerage', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Debt accounts (stored as negative balance)
INSERT INTO accounts (id, household_id, name, type, ownership, currency, current_balance_cents, institution_name, status, created_at, updated_at, last_updated_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440007', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Mortgage', 'MORTGAGE', 'JOINT', 'USD', -24000000, 'Home Loan Bank', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Create a financial snapshot for today
INSERT INTO financial_snapshots (id, household_id, as_of, version, cash_cents, debt_cents, net_worth_cents, monthly_income_cents, monthly_essential_expenses_cents, monthly_discretionary_expenses_cents, monthly_surplus_cents, financial_health_status, source_account_ids, calculated_at, created_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440008', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', CURRENT_DATE, 1, 1920000, 24000000, 18920000, 1200000, 680000, 120000, 400000, 'HEALTHY', ARRAY['550e8400-e29b-41d4-a716-446655440003'::UUID, '550e8400-e29b-41d4-a716-446655440004'::UUID, '550e8400-e29b-41d4-a716-446655440005'::UUID, '550e8400-e29b-41d4-a716-446655440006'::UUID, '550e8400-e29b-41d4-a716-446655440007'::UUID], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
