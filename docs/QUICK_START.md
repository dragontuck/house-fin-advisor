# Slice 1 - Quick Start Guide

## 🚀 5-Minute Setup

### Prerequisites
- Docker & Docker Compose
- Access to shared infrastructure:
  - PostgreSQL on `localhost:5434`
  - Redis on `localhost:6379` (with password)
  - Keycloak on `https://keycloak.keystone.internal:7443/`

### Start the Full Stack

```bash
# Clone and navigate to repo
cd house-fin-advisor

# Start all services using Docker Compose
docker compose up -d --build

# Wait for services to be ready (~30-60 seconds)
# Check logs:
docker logs house-fin-api --tail 20
docker logs house-fin-web --tail 20
```

**Access the application**:
- 🌐 **Web UI**: http://localhost:6173 → Financial Pulse dashboard
- 📡 **API**: http://localhost:6723
  - `/financial-pulse` → Main endpoint for UI
  - `/household` → Household info
  - `/accounts` → List of accounts
- 🗄️ **PostgreSQL**: localhost:5434
  - User: `hf_admin`
  - Password: `hf_admin`
  - Database: `house_financial`
- 🔴 **Redis**: localhost:6379 (password required)
- 📦 **MinIO Console**: http://localhost:9001 (user: minioadmin, pass: minioadmin)

### What You'll See

**Tucker Household Dashboard**:
- Health Status: ✅ HEALTHY
- Net Worth: $189,200
- Cash Available: $19,200
- Monthly Income: $12,000
- Monthly Expenses: $8,000
- Monthly Surplus: $4,000
- Total Debt: $240,000

**Account Breakdown** (expandable sections):
- **Cash**: Checking ($7,200) + Savings ($12,000)
- **Retirement**: 401(k) ($325,000) + IRA ($85,000)
- **Debt**: Mortgage ($240,000)

## 🧪 Run Tests Locally

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run only domain/financial tests
npm test -- financial

# Watch mode (re-run on changes)
npm test -- --watch
```

**Test Coverage**:
- ✅ Cash calculation
- ✅ Debt calculation
- ✅ Net worth calculation
- ✅ Health status determination
- ✅ Tucker household snapshot validation

## 🛠️ Local Development

```bash
# Option 1: Using Docker Compose (Recommended)
docker compose up -d --build

# View logs
docker logs -f house-fin-api
docker logs -f house-fin-web

# Stop services
docker compose down

# Option 2: Local development without Docker (advanced)
# Requires direct access to PostgreSQL, Redis, and Keycloak
npm install

# Start API (Terminal 1)
cd apps/api && npm run dev
# Runs on http://localhost:6723

# Start Web (Terminal 2)
cd apps/web && npm run dev
# Runs on http://localhost:6173 (with hot reload)
```

## 📡 Try the API

### Get Financial Pulse (Main Endpoint)
```bash
curl http://localhost:6723/financial-pulse | jq
# or through the web proxy:
curl http://localhost:6173/api/financial-pulse | jq
```

Response includes:
- Household name & health status
- Key metrics (net worth, cash, income, expenses, surplus, debt)
- Account summary grouped by category
- Generated status message

### Get Household Info
```bash
curl http://localhost:6723/household | jq
```

### List Accounts
```bash
curl http://localhost:6723/accounts | jq
```

### Create New Account
```bash
curl -X POST http://localhost:6723/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Emergency Fund",
    "type": "SAVINGS",
    "ownership": "JOINT",
    "currentBalance": 50000
  }'
```

## 📁 Project Structure

```
.
├── apps/
│   ├── api/              Express API server
│   └── web/              React dashboard UI
├── packages/
│   ├── contracts/        Shared TypeScript types
│   ├── domain/          Domain services
│   ├── financial/       Financial calculation rules
│   └── db/              Database migrations
├── tests/
│   ├── financial/       Financial calculation tests
│   └── integration/     API integration tests
└── docs/
    ├── SLICE_1_IMPLEMENTATION.md    Complete architecture
    └── README.md                     Project overview
```

## 🔍 Key Files to Understand

**Financial Calculations** (Pure functions, no side effects):
- `packages/financial/calculations.ts` → Cash, debt, net worth, health status logic

**Domain Layer** (Business orchestration):
- `packages/domain/index.ts` → HouseholdService

**API Endpoints** (HTTP layer):
- `apps/api/src/routes.ts` → API endpoints definition

**UI Dashboard** (React component):
- `apps/web/src/components/FinancialPulse.tsx` → Main dashboard UI

**Database Schema**:
- `packages/db/migrations/001_initial_schema.sql` → Tables & enums
- `packages/db/migrations/002_seed_tucker_household.sql` → Test data

## 🧮 Understanding Financial Calculations

All calculations are **pure functions** in `packages/financial/calculations.ts`:

```typescript
// Example: Calculate cash available
function calculateCash(accounts: Account[]): Money {
  const cashAccounts = accounts.filter(
    (a) => a.type === AccountType.CHECKING || a.type === AccountType.SAVINGS
  );
  return sum of balances;
}
```

**Money Type**: All values are in cents (integers), preventing floating-point errors.

**No side effects**: Can call from anywhere—tests, UI, worker jobs, etc.

## 🎨 UI Philosophy

The dashboard is designed for a **non-technical spouse**:

✅ Large, readable numbers with currency formatting
✅ Color-coded status (green/orange/red)
✅ Plain language ("Cash Available" not "Liquid Assets")
✅ Progressive disclosure (simple → details on demand)
✅ No database IDs, API jargon, or technical errors
✅ Responsive mobile design

## 🔒 Privacy & Security (Slice 1)

- Financial data **never** sent to external APIs
- Calculations run locally in the backend
- Mock authentication (real Keycloak in Slice 2)
- No AI LLM calls in Slice 1
- All data stays within Docker environment

## 📝 Common Tasks

### View Database
```bash
# Connect to PostgreSQL
psql -h localhost -p 5434 -U hf_admin -d house_financial

# Example queries:
SELECT * FROM households;
SELECT * FROM accounts WHERE household_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1;
```

### Add New Account
1. Use POST /api/accounts endpoint
2. Or insert directly into PostgreSQL:
```sql
INSERT INTO accounts (household_id, name, type, ownership, currency, current_balance_cents)
VALUES ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'New Account', 'SAVINGS', 'JOINT', 'USD', 1000000);
```

### Run Linter
```bash
npm run lint
```

### Type Check
```bash
npm run type-check
```

## 🐛 Troubleshooting

**Services won't start**:
```bash
# Check ports not in use
lsof -i :3000 :3001 :5434 :6379 :7443

# Clean Docker
docker-compose down -v
docker-compose up
```

**Database connection error**:
```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres
```

**Node modules issues**:
```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install
```

## 📚 Next Steps

1. **Explore the code**: Start with `SLICE_1_IMPLEMENTATION.md`
2. **Run tests**: `npm test`
3. **Check the API**: Use curl or Postman to explore endpoints
4. **Review the UI**: Open http://localhost:3001
5. **Read the database schema**: `packages/db/migrations/001_initial_schema.sql`

## ❓ Questions?

See `SLICE_1_IMPLEMENTATION.md` for:
- Complete architecture explanation
- Financial rules documentation
- API endpoint specifications
- Recommended next slices
- Known technical debt

---

**Ready to code!** The foundation is solid. Future slices can add bank integrations, statement ingestion, AI, and recommendations—all without changing the core domain model.
