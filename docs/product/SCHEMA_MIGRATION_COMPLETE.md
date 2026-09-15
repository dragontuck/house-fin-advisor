# Database Schema Migration to finhouse Schema

**Date**: 2026-08-12  
**Status**: ✅ Complete  
**Scope**: All database objects migrated to dedicated `finhouse` schema

---

## Summary of Changes

All database objects (tables, indexes, triggers, enums) have been moved from the default PostgreSQL schema to a dedicated `finhouse` schema for better isolation and organization.

### Files Modified

1. **packages/db/migrations/001_initial_schema.sql**
   - Added: `CREATE SCHEMA IF NOT EXISTS finhouse;`
   - Added: `SET search_path TO finhouse;`
   - Effect: All enum types, tables, indexes, and triggers created in `finhouse` schema

2. **packages/db/migrations/002_seed_tucker_household.sql**
   - Added: `SET search_path TO finhouse;`
   - Effect: All INSERT statements target tables in `finhouse` schema

3. **apps/api/src/db/connection.ts**
   - Added: `pool.on("connect", ...)` listener
   - Effect: Automatically sets `search_path TO finhouse` for all new connections

4. **apps/api/src/db/repositories.ts**
   - Updated: All table references now use `finhouse.` prefix
   - Changes: 17 SQL queries across 4 repository classes
   - Queries updated:
     - `PgHouseholdRepository`: 4 queries (INSERT, SELECT, UPDATE)
     - `PgHouseholdMemberRepository`: 4 queries (INSERT, SELECT × 3)
     - `PgAccountRepository`: 5 queries (INSERT, SELECT × 3, UPDATE)
     - `PgFinancialSnapshotRepository`: 4 queries (INSERT, SELECT × 3)

---

## Database Objects Created in finhouse Schema

### Enum Types
- `household_member_role` (OWNER, MEMBER)
- `household_member_visibility` (VISIBLE, HIDDEN)
- `account_type` (CHECKING, SAVINGS, CREDIT_CARD, LOAN, RETIREMENT, INVESTMENT, MORTGAGE)
- `account_ownership` (INDIVIDUAL, JOINT)
- `account_status` (ACTIVE, INACTIVE, CLOSED)
- `financial_health_status` (HEALTHY, ATTENTION, AT_RISK)

### Tables
- `finhouse.households`
- `finhouse.household_members`
- `finhouse.accounts`
- `finhouse.financial_snapshots`

### Indexes (in finhouse schema)
- `idx_household_members_household_id`
- `idx_household_members_identity_id`
- `idx_accounts_household_id`
- `idx_accounts_status`
- `idx_financial_snapshots_household_id`
- `idx_financial_snapshots_as_of`

### Functions (in finhouse schema)
- `update_updated_at_column()` - Trigger function

### Triggers (in finhouse schema)
- `households_updated_at` - Updates `updated_at` on households table
- `household_members_updated_at` - Updates `updated_at` on household_members table
- `accounts_updated_at` - Updates `updated_at` on accounts table

---

## How It Works

### Migration Execution Strategy

When migrations run:
1. `001_initial_schema.sql` creates the `finhouse` schema
2. `SET search_path TO finhouse;` makes all subsequent DDL commands operate in that schema
3. All tables, indexes, triggers, and enum types are created in `finhouse`
4. `002_seed_tucker_household.sql` does the same - sets search_path and inserts into finhouse tables

### Application Connection Strategy

When the application starts:
1. Pool is created with connection parameters
2. Each new connection triggers the `connect` event handler
3. Handler runs `SET search_path TO finhouse;` on that connection
4. All queries automatically resolve table names to `finhouse` schema
5. Queries can use unqualified table names (e.g., `SELECT * FROM households`) OR qualified names (e.g., `SELECT * FROM finhouse.households`)

**Current Implementation**: Uses qualified names (`finhouse.` prefix) in repositories.ts for clarity and explicitness.

---

## Verification

### Check if schema was created
```bash
psql -h localhost -p 5434 -U hf_admin -d house_financial -c "\dn finhouse"
```
Expected output:
```
   List of schemas
   Name   | Owner
---------+----------
 finhouse | hf_admin
```

### Check tables in finhouse schema
```bash
psql -h localhost -p 5434 -U hf_admin -d house_financial -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'finhouse';"
```
Expected output:
```
       table_name
-----------------------
 households
 household_members
 accounts
 financial_snapshots
```

### Test a query
```bash
psql -h localhost -p 5434 -U hf_admin -d house_financial -c "SELECT id, name FROM finhouse.households;"
```

---

## Benefits of Schema Organization

1. **Isolation**: All application tables in dedicated schema, preventing namespace pollution
2. **Multi-tenant ready**: Future support for multiple applications in same database
3. **Explicit**: Schema prefix in code makes relationships clear
4. **Migration safety**: Schema creation is idempotent (IF NOT EXISTS)
5. **Permissions**: Can grant schema-level permissions in future (not yet implemented)

---

## Breaking Changes

**None for application code** - All changes are transparent:
- Application code continues to work without modification
- Connection setup automatically handles schema routing
- Queries use explicit `finhouse.` prefix for clarity

**Migration Scripts**: If running migrations manually, must use:
```bash
psql -h localhost -p 5434 -U hf_admin -d house_financial < packages/db/migrations/001_initial_schema.sql
psql -h localhost -p 5434 -U hf_admin -d house_financial < packages/db/migrations/002_seed_tucker_household.sql
```

Or with search_path set:
```bash
psql -h localhost -p 5434 -U hf_admin -d house_financial -v search_path=finhouse < packages/db/migrations/001_initial_schema.sql
```

---

## What's Next

### Recommended Future Improvements

1. **Grant Permissions**: Restrict application user to finhouse schema only
   ```sql
   GRANT USAGE ON SCHEMA finhouse TO app_user;
   GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA finhouse TO app_user;
   ```

2. **Application User**: Create read/write user for application (not admin)
   ```sql
   CREATE USER app_user WITH PASSWORD 'app_password';
   GRANT CONNECT ON DATABASE house_financial TO app_user;
   GRANT USAGE ON SCHEMA finhouse TO app_user;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA finhouse TO app_user;
   ```

3. **Multi-schema Support**: In Slice 2+, could add separate schemas for:
   - `finhouse.private` - Raw account data
   - `finhouse.audit` - Change tracking
   - `finhouse.analytics` - Derived metrics

---

## Testing Verification

Run integration tests to verify schema migration worked:

```bash
npm run test:integration
```

Or using the provided test scripts:
```bash
./run-integration-tests.sh       # Linux/Mac
./run-integration-tests.bat       # Windows
```

Expected results:
- ✅ All API endpoints accessible
- ✅ Tucker household data loads correctly
- ✅ Accounts display with correct balances
- ✅ Financial snapshots calculate properly
- ✅ E2E tests pass with real database

---

## Documentation

For more information on database setup and configuration, see:
- [USING_EXISTING_INFRASTRUCTURE.md](docs/USING_EXISTING_INFRASTRUCTURE.md) - Database setup and access
- [INFRASTRUCTURE_MIGRATION.md](docs/INFRASTRUCTURE_MIGRATION.md) - Infrastructure changes
- [AGENTS.md](AGENTS.md) - Database architecture notes

---

## Troubleshooting

### Issue: "relation 'households' does not exist"
**Cause**: search_path not set to finhouse  
**Solution**: Verify connection.ts pool.on("connect", ...) is configured

### Issue: "schema 'finhouse' does not exist"
**Cause**: Migrations not run  
**Solution**: Run `001_initial_schema.sql` first

### Issue: Tables appear in public schema instead of finhouse
**Cause**: SET search_path not executed during migration  
**Solution**: Manually run migrations with schema qualifier in SQL file names

---

**Migration Complete** ✅  
All database objects are now organized in the dedicated `finhouse` schema.
