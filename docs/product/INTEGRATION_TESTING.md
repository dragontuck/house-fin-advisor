# Slice 1 Integration Testing Guide

## Overview

This guide explains how to run the complete end-to-end integration tests that validate the entire Slice 1 journey with **real data** from PostgreSQL.

**Note**: This project uses existing shared infrastructure (PostgreSQL, Redis, Keycloak). You do not need to run Docker containers for these services.

## Test Coverage

The integration tests (`apps/web/e2e/integration.spec.ts`) validate:

1. **Household Data Journey**
   - Fetch household information from real API
   - Verify no raw IDs are exposed to users
   - Validate household name display

2. **Accounts Display**
   - Display all seeded accounts by category (Cash, Retirement, Debt)
   - Verify correct balances from database
   - Confirm proper currency formatting

3. **FinancialSnapshot Calculation**
   - Calculate metrics from real database
   - Verify HEALTHY status for seeded household
   - Ensure deterministic calculations

4. **Authorization Boundaries**
   - Verify hardcoded household ID (Slice 1 limitation)
   - Document that multi-user auth is Slice 2 feature

5. **Error Handling**
   - Graceful failure when API is unavailable
   - Proper error messages displayed to user
   - Retry functionality works

6. **Responsive Layout**
   - Desktop (1920x1080), Tablet (768x1024), Mobile (375x667)
   - Interactive tooltips on all metrics
   - Touch-friendly interface

7. **Seeded Data Verification**
   - Tucker Household: Sean (OWNER) + Wife (MEMBER)
   - Accounts: Checking ($7,200), Savings ($12,000), 401k ($325,000), IRA ($85,000), Mortgage ($240,000)
   - Metrics: Net Worth ($189,200), Cash ($19,200), Monthly Surplus ($4,000)

## Prerequisites

### Existing Infrastructure (Must Be Running)

These services are already running in the shared environment:

```
PostgreSQL:  localhost:5434
  Database:  house_financial
  User:      hf_admin
  Password:  hf_admin

Redis:       localhost:6379

Keycloak:    https://keycloak.keystone.internal:7443/
  Realm:     house-fin
```

**Verify existing infrastructure is accessible:**

```bash
# Check PostgreSQL
psql -h localhost -p 5434 -U hf_admin -d house_financial -c "SELECT 1"

# Check Redis
redis-cli -p 6379 ping

# Check Keycloak (optional for Slice 1)
curl -k https://keycloak.keystone.internal:7443/health/ready
```

### Local Requirements

- **Node.js 20+**: `node -v`
- **npm**: `npm -v`
- **Git**: `git --version`

**Do NOT need to install:**
- ❌ Docker
- ❌ PostgreSQL (using existing)
- ❌ Redis (using existing)
- ❌ Keycloak (using existing)


### Verify Backend API

```bash
# In terminal 1 - Start API server
cd apps/api
npm run dev
# Should output: "Server running on http://localhost:3000"

# In terminal 2 - Verify API is accessible
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"2024-..."}
```

### Verify Frontend Development Server

```bash
# In terminal 3 - Start frontend development server
cd apps/web
npm run dev
# Should output: "VITE v4.5.14 ready in XXXms"
# Local:   http://localhost:5173/
```

## Running Integration Tests

### Option 1: Run All Integration Tests

```bash
cd apps/web

# Run all tests (chromium only for speed)
npm test -- --project=chromium e2e/integration.spec.ts

# Run with all browsers (slower but comprehensive)
npm test e2e/integration.spec.ts

# Run specific test group
npm test -- -g "Journey: Household Data" e2e/integration.spec.ts

# Run with debug/headed mode
npm test -- --headed e2e/integration.spec.ts
npm test -- --debug e2e/integration.spec.ts
```

### Option 2: Run Only Production Path Tests

```bash
cd apps/web

# Run tests that don't mock API (real data path)
npm test -- -g "complete flow: household member" e2e/integration.spec.ts
```

### Option 3: Run Specific Test Categories

```bash
cd apps/web

# Test only error handling
npm test -- -g "Error Handling" e2e/integration.spec.ts

# Test only responsive layout
npm test -- -g "Responsive Layout" e2e/integration.spec.ts

# Test only seeded data values
npm test -- -g "Seeded Data Verification" e2e/integration.spec.ts
```

## Expected Test Results

### Success Criteria

All tests should pass with real PostgreSQL data:

```
✓ Journey: Household Data (3 tests)
  ✓ should fetch household information from real API
  ✓ should verify no raw household IDs are exposed to user
  ✓ (other household tests)

✓ Journey: Accounts Display (5 tests)
  ✓ should display all seeded accounts organized by category
  ✓ should display correct cash account balances from DB
  ✓ should display retirement account balances from DB
  ✓ should display mortgage debt from DB
  ✓ (other account tests)

✓ Journey: FinancialSnapshot Calculation (3 tests)
  ✓ should calculate and display key metrics from real snapshot
  ✓ should show HEALTHY health status for seeded household
  ✓ should calculate deterministic snapshot values

✓ Authorization Boundaries (1 test)
  ✓ should use hardcoded household ID (Slice 1 limitation)

✓ Error Handling (3 tests)
  ✓ should handle database connection errors gracefully
  ✓ should display error message when API fails
  ✓ should show currency formatting errors if API returns invalid data

✓ Responsive Layout (5 tests)
  ✓ should display correctly on desktop viewport
  ✓ should display correctly on tablet viewport
  ✓ should display correctly on mobile viewport
  ✓ should display interactive tooltips on all metrics
  ✓ (other responsive tests)

✓ Seeded Data Verification (3 tests)
  ✓ should verify Tucker household members are configured
  ✓ should verify account types are correct from seeded data
  ✓ should verify monetary values use cents internally

✓ Complete Production Journey (1 test)
  ✓ complete flow: household member sees financial pulse on login
```

**Total: 25+ tests should pass**

## Troubleshooting

### Tests Fail to Connect to Backend

**Symptom**: Tests timeout or show "Failed to fetch"

**Solution**:
```bash
# 1. Verify API is running
curl http://localhost:3000/health

# 2. Verify database migrations ran
psql -h localhost -p 5434 -U hf_admin -d house_financial -c "SELECT COUNT(*) FROM households;"
# Should return: 1 (the seeded Tucker household)

# 3. Check API logs for errors
cd apps/api && npm run dev  # Look for error output
```

### Tests Show Wrong Household

**Symptom**: Tests show different household data than expected

**Solution**:
```bash
# Verify the hardcoded household ID matches the seeded data
# Household ID: f47ac10b-58cc-4372-a567-0e02b2c3d479

# Check seed data in database
psql -h localhost -p 5434 -U hf_admin -d house_financial <<EOF
SELECT id, name FROM households;
SELECT * FROM accounts WHERE household_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
EOF
```

### Account Balances Don't Match

**Symptom**: Tests report wrong values for account balances

**Solution**:
```bash
# Verify seeded data is correct (in cents)
psql -h localhost -p 5434 -U hf_admin -d house_financial <<EOF
SELECT name, current_balance_cents FROM accounts 
WHERE household_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
EOF

# Expected values (in cents):
# - Checking: 720000 (displays as $7,200)
# - Savings: 1200000 (displays as $12,000)
# - 401(k): 32500000 (displays as $325,000)
# - IRA: 8500000 (displays as $85,000)
# - Mortgage: -24000000 (displays as -$240,000)
```

### Migration Didn't Run

**Symptom**: Database has no tables or data

**Solution**:
```bash
# Manually run migrations
cd packages/db
psql -h localhost -p 5434 -U hf_admin -d house_financial < migrations/001_initial_schema.sql
psql -h localhost -p 5434 -U hf_admin -d house_financial < migrations/002_seed_tucker_household.sql

# Verify migrations ran
psql -h localhost -p 5434 -U hf_admin -d house_financial -c "\dt"
# Should show: households, household_members, accounts, financial_snapshots
```

## Development Workflow

### Typical Session

```bash
# Ensure existing infrastructure is running:
# - PostgreSQL on localhost:5434
# - Redis on localhost:6379
# - Keycloak on keycloak.keystone.internal:7443 (optional for Slice 1)

# Terminal 1: API server
cd apps/api && npm run dev

# Terminal 2: Frontend dev server
cd apps/web && npm run dev

# Terminal 3: Run tests
cd apps/web && npm test -- -g "complete flow" e2e/integration.spec.ts
```

### Quick Test During Development

```bash
cd apps/web

# Run single test (fastest)
npm test -- -g "should fetch household information" e2e/integration.spec.ts

# Run with headed mode to watch
npm test -- --headed -g "should fetch household information" e2e/integration.spec.ts
```

## Continuous Integration

### GitHub Actions Setup (Example)

**Note**: This assumes the CI/CD environment has access to the shared infrastructure (PostgreSQL, Redis, Keycloak).

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration:
    runs-on: ubuntu-latest
    
    # Requires access to shared infrastructure:
    # - PostgreSQL: localhost:5434
    # - Redis: localhost:6379
    # - Keycloak: keycloak.keystone.internal:7443 (optional)

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Verify infrastructure access
        run: |
          psql -h localhost -p 5434 -U hf_admin -d house_financial -c "SELECT 1"
      
      - run: npm install
      - run: npm run build
      - run: npm test
      
      - name: Start API
        run: cd apps/api && npm run dev &
        
      - name: Wait for API
        run: sleep 5 && curl http://localhost:3000/health
      
      - name: Run integration tests
        run: cd apps/web && npm test e2e/integration.spec.ts
      
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: apps/web/playwright-report/
```

## Key Files

- **Test File**: `apps/web/e2e/integration.spec.ts` (500+ lines)
- **API Server**: `apps/api/src/server.ts` (endpoints for journey)
- **Database Setup**: 
  - `packages/db/migrations/001_initial_schema.sql` (schema)
  - `packages/db/migrations/002_seed_tucker_household.sql` (seed data)
- **Frontend**: `apps/web/src/App.tsx` + components
- **Config**: `apps/web/playwright.config.ts`

## Architecture Notes

### No Mocks in Production Path

The integration tests use **real API data**:
- ✅ Real PostgreSQL database
- ✅ Real API endpoints
- ✅ Real FinancialSnapshot calculations
- ✅ Real React components

### Test Data

Seeded household used for all tests:

```
Tucker Household (f47ac10b-58cc-4372-a567-0e02b2c3d479)
├── Members
│   ├── Sean (OWNER)
│   └── Wife (MEMBER)
├── Accounts
│   ├── Cash: Checking ($7,200) + Savings ($12,000) = $19,200
│   ├── Retirement: 401(k) ($325,000) + IRA ($85,000) = $410,000
│   ├── Investments: (none)
│   └── Debt: Mortgage (-$240,000)
└── Metrics
    ├── Net Worth: $189,200
    ├── Monthly Income: $12,000
    ├── Monthly Expenses: $8,000
    ├── Monthly Surplus: $4,000
    └── Health Status: HEALTHY
```

## Next Steps (Slice 2)

The integration tests will be extended in Slice 2 to:
- Test real Keycloak OAuth login (not mocked)
- Test multi-user scenarios (multiple households)
- Test role-based access control (OWNER vs MEMBER)
- Test audit logging on data access

---

**For questions**: Check AGENTS.md for development rules and SLICE_1_COMPLETE.md for architecture overview.
