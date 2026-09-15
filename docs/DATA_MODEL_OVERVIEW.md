# Data Model Overview

**Version**: 1.0  
**Date**: 2026-09-15  
**Audience**: Backend developers, data engineers, architects  
**Purpose**: Complete reference for domain model, API contracts, and database schema  

---

## Part 1: Domain Model Architecture

### Design Philosophy

**1. Money as Integer Cents**
- All monetary values stored as `BigInt` (cents, not dollars)
- No floating-point arithmetic (prevents $0.01 errors)
- Example: $1,234.56 = 123456 cents

**2. Immutable Audit Trail**
- Transaction history is append-only
- No updates or deletes (only inserts)
- Every change logged with timestamp, user, evidence
- Enables complete audit trail for compliance

**3. Household as Aggregate Root**
- Household owns all data (accounts, transactions, etc.)
- Household-scoped authorization enforced
- Members are household-scoped (cannot access other households)
- Data isolation at database row level

**4. Calculated Values Timestamped**
- Every derived value has calculation_version, calculated_at, source_snapshot_id
- Enables traceability of calculations
- Allows recalculation if formula changes
- Used for audit trail and regression testing

**5. Deterministic Financial Calculations**
- Same inputs always produce same outputs
- Calculations in domain services (never in LLM, UI, or prompts)
- All formulas tested independently
- Zero financial calculation errors

---

## Part 2: Entity Relationship Diagram

```
┌─────────────────────────┐
│      HOUSEHOLD          │
│─────────────────────────│
│ id (PK)                 │
│ name                    │
│ created_at              │
│ updated_at              │
└─────────┬───────────────┘
          │
          ├─────────────────────────────┐
          │                             │
          │                     ┌───────┴────────────┐
          │                     │                    │
     ┌────▼─────────┐  ┌────────▼─────────┐  ┌─────▼──────────┐
     │   MEMBER     │  │    ACCOUNT       │  │    BUDGET      │
     │──────────────│  │──────────────────│  │────────────────│
     │ id (PK)      │  │ id (PK)          │  │ id (PK)        │
     │ household_id │  │ household_id     │  │ household_id   │
     │ name         │  │ name             │  │ month          │
     │ role         │  │ bank_name        │  │ total_planned  │
     │ keycloak_id  │  │ account_type     │  │ created_at     │
     │              │  │ current_balance  │  │                │
     │              │  │ interest_rate    │  └────┬───────────┘
     │              │  │ created_at       │       │
     │              │  └────────┬─────────┘       │
     │              │           │                │
     └──────────────┘      ┌────▼──────────┐     │
                           │ TRANSACTION   │     │
                           │───────────────│     │
                           │ id (PK)       │     │
                           │ account_id    │     │
                           │ amount        │     │
                           │ category      │     │
                           │ posted_at     │     │
                           └───────────────┘     │
                                                 │
                           ┌─────────────────────┘
                           │
                    ┌──────▼─────────────┐
                    │  BUDGET_CATEGORY   │
                    │────────────────────│
                    │ id (PK)            │
                    │ budget_id          │
                    │ category_name      │
                    │ planned_amount     │
                    │ actual_amount      │
                    │ last_updated       │
                    └────────────────────┘
```

---

## Part 3: Core Entities

### HOUSEHOLD

**Purpose**: Represents a household (family, individual, couple)

**Table**: `households`

```sql
CREATE TABLE households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES members(id),
    
    CONSTRAINT household_name_not_empty CHECK (name != '')
);
```

**Fields**:
- `id`: Unique identifier
- `name`: Household name ("Smith Family", "John's Finances", etc.)
- `description`: Optional notes about household
- `created_at`: When household was created
- `updated_at`: Last modification
- `created_by`: User who created household

**Example**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Smith Family",
  "description": "Household of John and Jane Smith",
  "created_at": "2026-01-15T10:30:00Z",
  "created_by": "550e8400-e29b-41d4-a716-446655440001"
}
```

---

### MEMBER

**Purpose**: Represents a household member (owner, spouse, dependent)

**Table**: `members`

```sql
CREATE TABLE members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id),
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('HOUSEHOLD_OWNER', 'HOUSEHOLD_MEMBER')),
    keycloak_id UUID UNIQUE,
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(household_id, keycloak_id),
    INDEX idx_household_members (household_id),
    INDEX idx_keycloak (keycloak_id)
);
```

**Fields**:
- `id`: Unique identifier
- `household_id`: Parent household
- `name`: Member name
- `role`: Authorization role (HOUSEHOLD_OWNER, HOUSEHOLD_MEMBER)
- `keycloak_id`: Link to Keycloak OAuth user
- `email`: Contact email
- `created_at`: When added to household
- `updated_at`: Last modification

**Roles**:
- `HOUSEHOLD_OWNER`: Full access, can manage members, approve recommendations
- `HOUSEHOLD_MEMBER`: View-only or delegated access

**Example**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "household_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "John Smith",
  "role": "HOUSEHOLD_OWNER",
  "keycloak_id": "auth0-user-12345",
  "email": "john@smith.local"
}
```

---

### ACCOUNT

**Purpose**: Represents a financial account (checking, savings, credit card, loan, investment)

**Table**: `accounts`

```sql
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id),
    name VARCHAR(255) NOT NULL,
    account_type VARCHAR(50) NOT NULL 
        CHECK (account_type IN ('CHECKING', 'SAVINGS', 'CREDIT_CARD', 'LOAN', 'INVESTMENT')),
    bank_name VARCHAR(255),
    institution_id VARCHAR(255),
    current_balance_cents BIGINT NOT NULL,
    interest_rate_bps INT,  -- basis points (100 = 1%)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_household_accounts (household_id),
    CONSTRAINT account_name_not_empty CHECK (name != '')
);
```

**Fields**:
- `id`: Unique identifier
- `household_id`: Parent household
- `name`: Account name ("Wells Fargo Checking", "Chase Credit Card", etc.)
- `account_type`: Type of account
- `bank_name`: Bank/institution name
- `institution_id`: Plaid/Finicity institution ID (for future online integrations)
- `current_balance_cents`: Balance in cents (BigInt to prevent float errors)
- `interest_rate_bps`: Interest rate in basis points (1 bps = 0.01%)
- `created_at`: When added to household
- `updated_at`: Last modification

**Account Types**:
- `CHECKING`: Checking account (spendable)
- `SAVINGS`: Savings account (low interest, spendable)
- `CREDIT_CARD`: Credit card (borrowed money)
- `LOAN`: Loan (borrowed money, fixed term)
- `INVESTMENT`: Investment account (retirement, brokerage)

**Example**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440010",
  "household_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Wells Fargo Checking",
  "account_type": "CHECKING",
  "bank_name": "Wells Fargo",
  "current_balance_cents": 210400,  // $2,104.00
  "interest_rate_bps": 0
}
```

---

### TRANSACTION

**Purpose**: A single money movement (append-only audit trail)

**Table**: `transactions`

```sql
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id),
    household_id UUID NOT NULL REFERENCES households(id),
    description VARCHAR(255) NOT NULL,
    amount_cents BIGINT NOT NULL,
    category VARCHAR(50),
    posted_at TIMESTAMP NOT NULL,
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reconciled_at TIMESTAMP,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_id UUID,  -- Links recurring instances
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_account_transactions (account_id),
    INDEX idx_household_transactions (household_id),
    INDEX idx_posted_date (posted_at),
    INDEX idx_category (category),
    INDEX idx_recurring (recurring_id)
);
```

**Fields**:
- `id`: Unique identifier
- `account_id`: Parent account
- `household_id`: Household (for faster queries)
- `description`: Transaction description ("Amazon Purchase", "Direct Deposit", etc.)
- `amount_cents`: Amount in cents (negative for debits, positive for credits)
- `category`: Budget category ("GROCERIES", "UTILITIES", "SALARY", etc.)
- `posted_at`: When transaction occurred
- `imported_at`: When imported into system
- `reconciled_at`: When user confirmed (null = pending)
- `is_recurring`: Whether this is part of recurring pattern
- `recurring_id`: Links to other instances of same recurring transaction
- `created_at`: When record created

**Append-Only Rule**: Transactions are never updated or deleted. Only inserts and reconciliation marks.

**Example**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440020",
  "account_id": "550e8400-e29b-41d4-a716-446655440010",
  "household_id": "550e8400-e29b-41d4-a716-446655440000",
  "description": "WHOLE FOODS MARKET #00123",
  "amount_cents": -12543,  // -$125.43 (debit)
  "category": "GROCERIES",
  "posted_at": "2026-09-14T14:32:00Z",
  "is_recurring": false
}
```

---

### FINANCIAL_SNAPSHOT

**Purpose**: A calculation of household financial state at a point in time

**Table**: `financial_snapshots`

```sql
CREATE TABLE financial_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id),
    calculated_at TIMESTAMP NOT NULL,
    calculation_version VARCHAR(10),  -- "1.0", "1.1", etc.
    
    -- Assets
    checking_total_cents BIGINT,
    savings_total_cents BIGINT,
    investment_total_cents BIGINT,
    asset_total_cents BIGINT,
    
    -- Liabilities
    credit_card_total_cents BIGINT,
    loan_total_cents BIGINT,
    liability_total_cents BIGINT,
    
    -- Net Worth
    net_worth_cents BIGINT,
    
    -- Cash Flow (30-day)
    income_30day_cents BIGINT,
    spending_30day_cents BIGINT,
    surplus_30day_cents BIGINT,
    
    -- Metrics
    savings_rate_percent DECIMAL(5,2),
    debt_to_income_ratio DECIMAL(5,2),
    interest_paid_30day_cents BIGINT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_household_snapshot (household_id),
    INDEX idx_calculated_at (calculated_at)
);
```

**Purpose**: Cache financial calculations (recalculated daily or on-demand)

**Example**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440030",
  "household_id": "550e8400-e29b-41d4-a716-446655440000",
  "calculated_at": "2026-09-15T02:00:00Z",
  "calculation_version": "1.0",
  "asset_total_cents": 50010400,  // $500,104.00
  "liability_total_cents": -31080000,  // -$310,800.00
  "net_worth_cents": 18930400,  // $189,304.00
  "income_30day_cents": 800000,  // $8,000.00
  "spending_30day_cents": 620000,  // $6,200.00
  "surplus_30day_cents": 180000,  // $1,800.00
  "savings_rate_percent": 22.50
}
```

---

### BUDGET

**Purpose**: Monthly budget for a household

**Table**: `budgets`

```sql
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id),
    month TIMESTAMP NOT NULL,  -- First day of month
    total_planned_cents BIGINT NOT NULL,
    total_actual_cents BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(household_id, month),
    INDEX idx_household_budget (household_id),
    INDEX idx_month (month)
);
```

**Fields**:
- `id`: Unique identifier
- `household_id`: Parent household
- `month`: Month this budget applies to (YYYY-01-01 for January)
- `total_planned_cents`: Sum of all category plans
- `total_actual_cents`: Sum of all actual spending
- `created_at`: When budget created
- `updated_at`: Last modification

**Example**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440040",
  "household_id": "550e8400-e29b-41d4-a716-446655440000",
  "month": "2026-09-01",
  "total_planned_cents": 700000,  // $7,000.00
  "total_actual_cents": 620000  // $6,200.00 (month not over)
}
```

---

### BUDGET_CATEGORY

**Purpose**: Budget for a specific category within a month

**Table**: `budget_categories`

```sql
CREATE TABLE budget_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES budgets(id),
    category_name VARCHAR(50) NOT NULL,
    planned_cents BIGINT NOT NULL,
    actual_cents BIGINT DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(budget_id, category_name),
    INDEX idx_budget_categories (budget_id),
    INDEX idx_category (category_name)
);
```

**Standard Categories**:
- HOUSING (rent/mortgage, property tax, insurance)
- FOOD (groceries, dining out)
- UTILITIES (electric, water, internet)
- TRANSPORTATION (car payment, gas, insurance, transit)
- HEALTHCARE (insurance, copays, medications)
- ENTERTAINMENT (hobbies, streaming, dining)
- SAVINGS (deliberate savings)
- DEBT (minimum payments)
- OTHER

**Example**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440050",
  "budget_id": "550e8400-e29b-41d4-a716-446655440040",
  "category_name": "GROCERIES",
  "planned_cents": 100000,  // $1,000.00
  "actual_cents": 87654  // $876.54
}
```

---

## Part 4: API Contracts

### Authentication

**Endpoint**: All requests require OAuth token (Keycloak)

**Header**:
```
Authorization: Bearer <keycloak_jwt_token>
```

**Token Claims**:
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440001",  // User ID
  "preferred_username": "john.smith",
  "households": ["550e8400-e29b-41d4-a716-446655440000"],
  "role": "HOUSEHOLD_OWNER"
}
```

---

### REST API Endpoints

#### Households

**GET /api/households**
- List all households user can access
- Response: `Household[]`

**GET /api/households/:id**
- Get single household (check authorization)
- Response: `Household`

**POST /api/households**
- Create new household
- Request: `{ name: string, description?: string }`
- Response: `Household`

**PUT /api/households/:id**
- Update household
- Request: `{ name?: string, description?: string }`
- Response: `Household`

---

#### Accounts

**GET /api/households/:householdId/accounts**
- List all accounts in household
- Query params: `?type=CHECKING,SAVINGS&includeBalance=true`
- Response: `Account[]`

**GET /api/households/:householdId/accounts/:id**
- Get single account
- Response: `Account`

**POST /api/households/:householdId/accounts**
- Create new account
- Request:
```json
{
  "name": "Wells Fargo Checking",
  "accountType": "CHECKING",
  "bankName": "Wells Fargo",
  "currentBalanceCents": 210400,
  "interestRateBps": 0
}
```
- Response: `Account`

**PUT /api/households/:householdId/accounts/:id**
- Update account
- Request: (same fields as POST, all optional)
- Response: `Account`

---

#### Transactions

**GET /api/households/:householdId/transactions**
- List transactions (paginated)
- Query params:
  - `?accountId=xxx` (filter by account)
  - `?category=GROCERIES` (filter by category)
  - `?from=2026-01-01&to=2026-01-31` (date range)
  - `?limit=50&offset=0` (pagination)
- Response: 
```json
{
  "data": "Transaction[]",
  "total": 1234,
  "limit": 50,
  "offset": 0
}
```

**POST /api/households/:householdId/transactions**
- Create transaction (manual entry)
- Request:
```json
{
  "accountId": "550e8400-e29b-41d4-a716-446655440010",
  "description": "Manual entry",
  "amountCents": -12543,
  "category": "GROCERIES",
  "postedAt": "2026-09-14T14:32:00Z"
}
```
- Response: `Transaction`

**POST /api/households/:householdId/transactions/import**
- Import from CSV
- Request: `multipart/form-data` with file
- Response: 
```json
{
  "imported": 150,
  "skipped": 5,
  "errors": ["Row 3: invalid amount"]
}
```

---

#### Budget

**GET /api/households/:householdId/budgets/:month**
- Get budget for specific month (YYYY-MM-01)
- Response: 
```json
{
  "id": "...",
  "month": "2026-09-01",
  "totalPlanned": 700000,
  "totalActual": 620000,
  "categories": [
    {
      "name": "GROCERIES",
      "planned": 100000,
      "actual": 87654,
      "variance": -12346
    }
  ]
}
```

**PUT /api/households/:householdId/budgets/:month**
- Update budget
- Request:
```json
{
  "categories": [
    { "name": "GROCERIES", "planned": 100000 },
    { "name": "HOUSING", "planned": 150000 }
  ]
}
```
- Response: (same as GET)

---

#### Financial Snapshot

**GET /api/households/:householdId/snapshot**
- Get current financial snapshot (latest calculation)
- Response:
```json
{
  "id": "...",
  "calculatedAt": "2026-09-15T02:00:00Z",
  "netWorthCents": 18930400,
  "assetsTotal": 50010400,
  "liabilitiesTotal": -31080000,
  "incomeMonth": 800000,
  "spendingMonth": 620000,
  "savingsRate": 22.50
}
```

**GET /api/households/:householdId/snapshot/history**
- Historical snapshots (monthly)
- Query params: `?from=2026-01-01&to=2026-09-15`
- Response: `FinancialSnapshot[]`

---

#### Members

**GET /api/households/:householdId/members**
- List household members
- Response: `Member[]`

**POST /api/households/:householdId/members**
- Invite member to household
- Request: `{ email: string, role: "HOUSEHOLD_MEMBER" | "HOUSEHOLD_OWNER" }`
- Response: (invitation sent to email)

**DELETE /api/households/:householdId/members/:id**
- Remove member from household
- Response: `{ success: true }`

---

## Part 5: Financial Calculations

### Net Worth Calculation

```
Net Worth = Total Assets - Total Liabilities

Where:
  Total Assets = Checking + Savings + Investments
  Total Liabilities = Credit Cards + Loans
```

**Example**:
```
Assets:
  Checking: $2,104
  Savings: $8,000
  Investments: $500,000
  Total: $510,104

Liabilities:
  Credit Cards: $12,543
  Mortgage: -$250,000
  Car Loan: -$48,257
  Total: $-310,800

Net Worth: $510,104 - $310,800 = $189,304
```

**Code**:
```typescript
function calculateNetWorth(accounts: Account[]): bigint {
  const assets = accounts
    .filter(a => ['CHECKING', 'SAVINGS', 'INVESTMENT'].includes(a.accountType))
    .reduce((sum, a) => sum + a.currentBalanceCents, 0n);
    
  const liabilities = accounts
    .filter(a => ['CREDIT_CARD', 'LOAN'].includes(a.accountType))
    .reduce((sum, a) => sum + Math.abs(a.currentBalanceCents), 0n);
    
  return assets - liabilities;
}
```

---

### Cash Flow Analysis

```
Cash Flow = Income - Spending

Where:
  Income = Sum of positive transactions in category SALARY, BONUS, etc.
  Spending = Sum of negative transactions (excluding transfers)
```

**Example**:
```
Monthly:
  Income: $8,000
  Spending: $6,200
  Surplus: $1,800 (22.5% savings rate)
```

**Code**:
```typescript
function calculateCashFlow(
  transactions: Transaction[],
  period: DateRange
): { income: bigint; spending: bigint; surplus: bigint } {
  const income = transactions
    .filter(t => t.category === 'SALARY' && t.postedAt in period)
    .reduce((sum, t) => sum + t.amountCents, 0n);
    
  const spending = transactions
    .filter(t => t.amountCents < 0 && t.postedAt in period)
    .reduce((sum, t) => sum + Math.abs(t.amountCents), 0n);
    
  return {
    income,
    spending,
    surplus: income - spending
  };
}
```

---

### Budget Variance Analysis

```
Variance = Actual - Planned
Variance % = (Actual - Planned) / Planned * 100

Interpretation:
  Negative = Under budget (good!)
  Positive = Over budget (needs attention)
```

**Example**:
```
Groceries:
  Planned: $1,000
  Actual: $1,235
  Variance: +$235 (23.5% over)
```

**Code**:
```typescript
function calculateVariance(category: BudgetCategory): {
  variance: bigint;
  variancePercent: number;
} {
  const variance = category.actualCents - category.plannedCents;
  const variancePercent = (Number(variance) / Number(category.plannedCents)) * 100;
  
  return { variance, variancePercent };
}
```

---

### Savings Rate

```
Savings Rate = (Income - Spending) / Income * 100

Where:
  Income = Monthly gross income
  Spending = Monthly expenses
```

**Example**:
```
Income: $8,000
Spending: $6,200
Savings: $1,800
Savings Rate: ($1,800 / $8,000) * 100 = 22.5%
```

**Code**:
```typescript
function calculateSavingsRate(income: bigint, spending: bigint): number {
  if (income === 0n) return 0;
  const savings = income - spending;
  return (Number(savings) / Number(income)) * 100;
}
```

---

### Debt-to-Income Ratio

```
DTI = Total Monthly Debt / Gross Monthly Income

Interpretation:
  < 36% = Good
  36-50% = Acceptable
  > 50% = High risk
```

**Example**:
```
Monthly Income: $8,000
Credit Card Payment: $300
Mortgage: $1,500
Car Loan: $400
Total Debt: $2,200

DTI = ($2,200 / $8,000) * 100 = 27.5% (Good)
```

---

### Interest Accrual Calculation

```
Monthly Interest = Balance * (Annual Rate / 12)

For Credit Cards:
  Amount = Balance * (APR / 100 / 12)
  
Example: $5,000 balance at 19.99% APR
  Monthly Interest = $5,000 * (19.99 / 100 / 12) = $83.29
```

**Code**:
```typescript
function calculateMonthlyInterest(
  balanceCents: bigint,
  annualRateBps: number
): bigint {
  // APR in basis points (100 bps = 1%)
  const monthlyRate = annualRateBps / 10000 / 12;
  return balanceCents * BigInt(Math.round(monthlyRate * 10000)) / 10000n;
}
```

---

## Part 6: Database Queries

### High-Frequency Queries

#### Get household financial snapshot (< 50ms)

```sql
SELECT 
  SUM(CASE WHEN a.account_type IN ('CHECKING', 'SAVINGS', 'INVESTMENT') 
           THEN a.current_balance_cents ELSE 0 END) as assets,
  SUM(CASE WHEN a.account_type IN ('CREDIT_CARD', 'LOAN') 
           THEN ABS(a.current_balance_cents) ELSE 0 END) as liabilities
FROM accounts a
WHERE a.household_id = $1;

-- Index: idx_household_accounts (household_id)
```

#### Get 30-day cash flow (< 100ms)

```sql
SELECT 
  SUM(CASE WHEN t.amount_cents > 0 THEN t.amount_cents ELSE 0 END) as income,
  SUM(CASE WHEN t.amount_cents < 0 THEN ABS(t.amount_cents) ELSE 0 END) as spending
FROM transactions t
WHERE t.household_id = $1 
  AND t.posted_at > NOW() - INTERVAL '30 days';

-- Index: idx_household_transactions (household_id, posted_at)
```

#### Get transactions by category (< 50ms)

```sql
SELECT * FROM transactions
WHERE household_id = $1 
  AND category = $2
  AND posted_at > $3
ORDER BY posted_at DESC
LIMIT 100;

-- Index: idx_category (household_id, category, posted_at DESC)
```

#### Budget variance (< 50ms)

```sql
SELECT 
  bc.category_name,
  bc.planned_cents,
  SUM(t.amount_cents) as actual_cents
FROM budget_categories bc
LEFT JOIN transactions t ON t.household_id = bc.budget_id
  AND t.category = bc.category_name
  AND DATE_TRUNC('month', t.posted_at) = $2
WHERE bc.budget_id = $1
GROUP BY bc.id, bc.category_name, bc.planned_cents;

-- Index: idx_budget_categories (budget_id, category_name)
```

---

## Part 7: Domain Services

### Account Service

**Responsibilities**:
- Account CRUD operations
- Balance management
- Account validation

**Key Methods**:
```typescript
class AccountService {
  async createAccount(household: Household, account: CreateAccountInput): Promise<Account>
  async updateBalance(account: Account, newBalance: bigint): Promise<Account>
  async getHouseholdAccounts(household: Household): Promise<Account[]>
  async getAccountsByType(household: Household, type: AccountType): Promise<Account[]>
  async deleteAccount(account: Account): Promise<void>
}
```

---

### Transaction Service

**Responsibilities**:
- Transaction import (CSV, PDF)
- Transaction categorization
- Recurring detection
- Append-only enforcement

**Key Methods**:
```typescript
class TransactionService {
  async importCSV(household: Household, csvData: string): Promise<ImportResult>
  async createTransaction(account: Account, transaction: CreateTransactionInput): Promise<Transaction>
  async categorizeTransaction(transaction: Transaction): Promise<string>
  async detectRecurring(household: Household): Promise<RecurringGroup[]>
  async getTransactions(household: Household, filters: TransactionFilters): Promise<Transaction[]>
}
```

---

### Financial Snapshot Service

**Responsibilities**:
- Calculate net worth
- Calculate cash flow
- Calculate financial health metrics
- Cache snapshots for performance

**Key Methods**:
```typescript
class FinancialSnapshotService {
  async calculateSnapshot(household: Household): Promise<FinancialSnapshot>
  async getLatestSnapshot(household: Household): Promise<FinancialSnapshot>
  async getSnapshotHistory(household: Household, period: DateRange): Promise<FinancialSnapshot[]>
  async calculateNetWorth(household: Household): Promise<bigint>
  async calculateCashFlow(household: Household, days: number): Promise<CashFlow>
}
```

---

### Budget Service

**Responsibilities**:
- Budget CRUD
- Variance calculation
- Category management
- Budget recommendations

**Key Methods**:
```typescript
class BudgetService {
  async createBudget(household: Household, month: Date): Promise<Budget>
  async updateBudgetCategory(budget: Budget, category: string, plannedAmount: bigint): Promise<BudgetCategory>
  async calculateVariance(budget: Budget): Promise<VarianceReport>
  async suggestBudget(household: Household): Promise<BudgetSuggestion>
}
```

---

## Part 8: Data Validation Rules

### Account Validation

- Account name required (non-empty)
- Account type must be valid (CHECKING, SAVINGS, etc.)
- Interest rate must be >= 0
- Balance must fit in BigInt range (-2^63 to 2^63)

### Transaction Validation

- Account ID must exist and belong to household
- Amount must be non-zero
- Category must be valid (or null)
- Posted date must be valid date
- Description required (non-empty)

### Budget Validation

- Month must be first day of month (YYYY-01-01)
- Planned amounts must be >= 0
- Categories must be valid
- No duplicate categories in budget

---

## Part 9: Audit Trail Example

Every change is logged:

```
Action: User imported CSV statement
Timestamp: 2026-09-15 14:30:00Z
User: john@smith.local (550e8400-e29b-41d4-a716-446655440001)
Household: Smith Family (550e8400-e29b-41d4-a716-446655440000)
Data:
  - Imported 150 transactions
  - Account: Wells Fargo Checking
  - Total amount: $12,543.21
Result: SUCCESS
```

```
Action: Financial Snapshot Calculated
Timestamp: 2026-09-15 02:00:00Z
Household: Smith Family
Version: 1.0
Changes:
  - Net Worth: $189,304 (previously $188,200)
  - Savings Rate: 22.5% (previously 20.1%)
Triggered by: Scheduled job (daily recalculation)
```

---

## Part 10: Performance Considerations

### Indexing Strategy

| Table | Index | Purpose |
|-------|-------|---------|
| accounts | (household_id) | Household account lookup |
| transactions | (household_id, posted_at) | Time-range queries |
| transactions | (account_id, posted_at) | Account history |
| transactions | (category, posted_at) | Category analysis |
| budgets | (household_id, month) | Budget lookup |
| members | (household_id) | Household members |

### Query Caching

- Financial snapshots cached for 1 hour
- Budget summaries cached for 5 minutes
- Member lists cached for 10 minutes
- Clear cache on any update

### Pagination

All list endpoints paginate:
- Default limit: 50
- Max limit: 1000
- Offset-based (not cursor, to keep DB simple)

---

**Complete technical reference for developers and architects.** 📚

*For questions or clarifications, contact: architecture@advisor.local*  
*Last Updated: 2026-09-15*
