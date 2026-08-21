# Schema Migration: Before & After Examples

## Migration Overview

All database objects migrated from default PostgreSQL schema to dedicated `finhouse` schema.

---

## Migration 1: SQL Schema Definition

### BEFORE (001_initial_schema.sql)
```sql
-- Initial schema for house-fin-advisor Slice 1
-- Households, Members, Accounts, and Financial Snapshots

-- Create enum types
CREATE TYPE household_member_role AS ENUM ('OWNER', 'MEMBER');
```

### AFTER (001_initial_schema.sql)
```sql
-- Initial schema for house-fin-advisor Slice 1
-- Households, Members, Accounts, and Financial Snapshots

-- Create finhouse schema
CREATE SCHEMA IF NOT EXISTS finhouse;

-- Set default schema for this migration
SET search_path TO finhouse;

-- Create enum types
CREATE TYPE household_member_role AS ENUM ('OWNER', 'MEMBER');
```

**Impact**: All subsequent DDL (CREATE TABLE, CREATE INDEX, CREATE TRIGGER) happens in finhouse schema

---

## Migration 2: Seed Data

### BEFORE (002_seed_tucker_household.sql)
```sql
-- Seed data for Slice 1: Tucker Household
-- This data represents the seeded development household

-- Create the Tucker household
INSERT INTO households (id, name, created_at, updated_at) VALUES
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Tucker Household', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
```

### AFTER (002_seed_tucker_household.sql)
```sql
-- Seed data for Slice 1: Tucker Household
-- This data represents the seeded development household

-- Set default schema for this migration
SET search_path TO finhouse;

-- Create the Tucker household
INSERT INTO households (id, name, created_at, updated_at) VALUES
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Tucker Household', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
```

**Impact**: All INSERT statements target tables in finhouse schema

---

## Migration 3: Connection Pool

### BEFORE (apps/api/src/db/connection.ts)
```typescript
const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5434", 10),
    database: process.env.DB_NAME || "house_financial",
    user: process.env.DB_USER || "hf_admin",
    password: process.env.DB_PASSWORD || "hf_admin",
});

pool.on("error", (err) => {
    console.error("Unexpected error on idle client", err);
});
```

### AFTER (apps/api/src/db/connection.ts)
```typescript
const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5434", 10),
    database: process.env.DB_NAME || "house_financial",
    user: process.env.DB_USER || "hf_admin",
    password: process.env.DB_PASSWORD || "hf_admin",
});

// Set schema search path for all connections
pool.on("connect", (client) => {
    client.query("SET search_path TO finhouse", (err) => {
        if (err) {
            console.error("Failed to set search_path", err);
        }
    });
});

pool.on("error", (err) => {
    console.error("Unexpected error on idle client", err);
});
```

**Impact**: Every new connection automatically gets search_path set to finhouse

---

## Migration 4: Repository Queries

### Example 1: INSERT Household

**BEFORE**:
```typescript
async create(req: CreateHouseholdRequest): Promise<Household> {
    const result = await query(
        "INSERT INTO households (name) VALUES ($1) RETURNING id, name, created_at, updated_at",
        [req.name]
    );
```

**AFTER**:
```typescript
async create(req: CreateHouseholdRequest): Promise<Household> {
    const result = await query(
        "INSERT INTO finhouse.households (name) VALUES ($1) RETURNING id, name, created_at, updated_at",
        [req.name]
    );
```

---

### Example 2: SELECT Accounts

**BEFORE**:
```typescript
async findByHouseholdId(householdId: EntityId): Promise<Account[]> {
    const result = await query(
        "SELECT * FROM accounts WHERE household_id = $1 ORDER BY created_at",
        [householdId]
    );
```

**AFTER**:
```typescript
async findByHouseholdId(householdId: EntityId): Promise<Account[]> {
    const result = await query(
        "SELECT * FROM finhouse.accounts WHERE household_id = $1 ORDER BY created_at",
        [householdId]
    );
```

---

### Example 3: UPDATE Household

**BEFORE**:
```typescript
const result = await query(
    `UPDATE households SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    values
);
```

**AFTER**:
```typescript
const result = await query(
    `UPDATE finhouse.households SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    values
);
```

---

### Example 4: INSERT Financial Snapshot

**BEFORE**:
```typescript
const result = await query(
    `INSERT INTO financial_snapshots 
   (household_id, as_of, version, cash_cents, debt_cents, net_worth_cents, 
    monthly_income_cents, monthly_essential_expenses_cents, monthly_discretionary_expenses_cents,
    monthly_surplus_cents, financial_health_status, calculated_at) 
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
   RETURNING *`,
```

**AFTER**:
```typescript
const result = await query(
    `INSERT INTO finhouse.financial_snapshots 
   (household_id, as_of, version, cash_cents, debt_cents, net_worth_cents, 
    monthly_income_cents, monthly_essential_expenses_cents, monthly_discretionary_expenses_cents,
    monthly_surplus_cents, financial_health_status, calculated_at) 
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
   RETURNING *`,
```

---

## Complete Query Update Summary

| Category | Before | After | Count |
|----------|--------|-------|-------|
| **INSERT queries** | `INSERT INTO households` | `INSERT INTO finhouse.households` | 4 |
| **SELECT queries** | `SELECT * FROM accounts` | `SELECT * FROM finhouse.accounts` | 9 |
| **UPDATE queries** | `UPDATE households SET` | `UPDATE finhouse.households SET` | 2 |
| **Total** | Default schema (public) | finhouse schema | **17** |

---

## Database Structure Before

```
house_financial (database)
├── public (default schema)
│   ├── households
│   ├── household_members
│   ├── accounts
│   └── financial_snapshots
└── (other default schemas: information_schema, pg_catalog, etc.)
```

---

## Database Structure After

```
house_financial (database)
├── public (default schema) - [NOT USED]
├── finhouse (application schema)
│   ├── Enums (6)
│   │   ├── household_member_role
│   │   ├── household_member_visibility
│   │   ├── account_type
│   │   ├── account_ownership
│   │   ├── account_status
│   │   └── financial_health_status
│   │
│   ├── Tables (4)
│   │   ├── households
│   │   ├── household_members
│   │   ├── accounts
│   │   └── financial_snapshots
│   │
│   ├── Indexes (6)
│   │   ├── idx_household_members_household_id
│   │   ├── idx_household_members_identity_id
│   │   ├── idx_accounts_household_id
│   │   ├── idx_accounts_status
│   │   ├── idx_financial_snapshots_household_id
│   │   └── idx_financial_snapshots_as_of
│   │
│   ├── Functions (1)
│   │   └── update_updated_at_column()
│   │
│   └── Triggers (3)
│       ├── households_updated_at
│       ├── household_members_updated_at
│       └── accounts_updated_at
│
└── (other default schemas: information_schema, pg_catalog, etc.)
```

---

## Application Code Before

```typescript
// No schema awareness - implicit use of public schema
pool.on("error", ...);  // No connection setup

// Queries without schema prefix
query("SELECT * FROM households WHERE id = $1")
query("INSERT INTO accounts (...)") 
query("UPDATE household_members SET ...")
query("SELECT * FROM financial_snapshots WHERE ...")
```

---

## Application Code After

```typescript
// Schema-aware connection setup
pool.on("connect", (client) => {
    client.query("SET search_path TO finhouse", ...);  // ← Automatic routing
});

// Queries with explicit schema prefix
query("SELECT * FROM finhouse.households WHERE id = $1")
query("INSERT INTO finhouse.accounts (...)") 
query("UPDATE finhouse.household_members SET ...")
query("SELECT * FROM finhouse.financial_snapshots WHERE ...")
```

---

## How Queries Are Now Resolved

```
Query: "SELECT * FROM finhouse.accounts WHERE id = $1"
  ↓
Connection pool finds schema prefix
  ↓
Routes to: house_financial.finhouse.accounts
  ↓
Returns: Data from finhouse schema ✅
```

vs.

```
Query: "SELECT * FROM accounts WHERE id = $1" (old way)
  ↓
Connection uses search_path (implicit)
  ↓
Would look in: public schema (if default) ✗
  ↓
Result: "Table accounts not found" ✗
```

---

## Why This Matters

1. **Explicit**: Code is clear about schema usage
2. **Safe**: Won't accidentally query public schema
3. **Scalable**: Foundation for multi-schema design
4. **Professional**: Industry standard for organized databases
5. **Future-proof**: Ready for Slice 2+ enhancements

---

## Testing the Changes

### Verify Queries Work
```bash
# Start the API server
npm run dev:api

# Should see no errors connecting to finhouse schema
```

### Run Integration Tests
```bash
npm run test:integration

# All tests should pass with data from finhouse schema
```

### Manual Query Test
```bash
psql -h localhost -p 5434 -U hf_admin -d house_financial

house_financial=> SELECT * FROM finhouse.households;
                  id                  |     name
--------------------------------------+-----------------
 f47ac10b-58cc-4372-a567-0e02b2c3d479 | Tucker Household

house_financial=> SELECT * FROM households;
ERROR: relation "households" does not exist

house_financial=> SELECT * FROM finhouse.accounts;
                  id                  | household_id | name | ...
--------------------------------------+-----------+----------+
 550e8400-e29b-41d4-a716-446655440003 | f47ac... | Checking | ...
```

---

**Summary**: Migration complete. All database objects now in `finhouse` schema with explicit routing at application level.
