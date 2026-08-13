# House Financial Advisor

A privacy-first, self-hosted household financial advisor application.

## 🎯 Vision

Help households understand their financial position, make better financial decisions, and build wealth—without exposing sensitive data to external APIs.

## 🏗️ Architecture

**Modular Monolith**: Self-contained deployable units with clear domain boundaries. Future slices can be extracted into services without domain model changes.

- **API**: Express.js/TypeScript - HTTP endpoints for household financial management
- **Web UI**: React/Vite - Plain-language dashboard for non-technical users
- **Domain**: TypeScript services - Financial calculations and business rules
- **Database**: PostgreSQL - Household data, accounts, transactions (future)
- **Auth**: Keycloak - OAuth, multi-user support (Slice 2+)

## ✨ Slice 1: Household Financial Pulse

**Status**: ✅ Complete

The first vertical slice establishes the core domain, API, persistence, financial calculation boundary, and primary UX pattern.

### What's Included

- ✅ Household & household members
- ✅ Financial accounts (checking, savings, retirement, debt)
- ✅ Deterministic financial calculations (cash, debt, net worth, surplus)
- ✅ Financial health status determination
- ✅ Financial Pulse dashboard UI
- ✅ API endpoints for household management
- ✅ Database migrations and seeded development data
- ✅ Domain tests for all financial rules

### What's NOT Included (Intentionally)

- ❌ Bank integrations or statement ingestion
- ❌ AI recommendations or research
- ❌ Transaction categorization
- ❌ Investment analysis
- ❌ Microservices
- ❌ Multi-tenancy (Slice 1 uses single seeded household)

### Quick Start

This project uses existing shared infrastructure. Ensure you have access to:
- **PostgreSQL** on `localhost:5434`
- **Redis** on `localhost:6379`
- **Keycloak** on `https://keycloak.keystone.internal:7443/`

Then start the local development servers:

```bash
# Terminal 1: API server
cd apps/api
npm run dev
# Output: Server running on http://localhost:3000

# Terminal 2: Web UI
cd apps/web
npm run dev
# Output: VITE ready at http://localhost:5173
```

For first-time setup, apply database migrations:
```bash
psql -h localhost -p 5434 -U hf_admin -d house_financial < packages/db/migrations/001_initial_schema.sql
psql -h localhost -p 5434 -U hf_admin -d house_financial < packages/db/migrations/002_seed_tucker_household.sql
```

📖 [Using Existing Infrastructure Guide](./docs/USING_EXISTING_INFRASTRUCTURE.md)

### Local Development

```bash
# Verify infrastructure access
psql -h localhost -p 5434 -U hf_admin -d house_financial -c "SELECT 1"
redis-cli -p 6379 ping

# Install dependencies
npm install

# Run tests
npm test           # Run unit tests
npm run dev        # Start API + Web concurrently

# Run linters
npm run lint       # Lint TypeScript
npm run type-check # Type checking
```

**Infrastructure Details:**
- PostgreSQL: `localhost:5434` (user: `hf_admin`, db: `house_financial`)
- Redis: `localhost:6379`
- Keycloak: `https://keycloak.keystone.internal:7443/` (realm: `house-fin`)

📖 [Existing Infrastructure Guide](./docs/USING_EXISTING_INFRASTRUCTURE.md)

## 📚 Documentation

- [Slice 1 Implementation](./SLICE_1_IMPLEMENTATION.md) - Complete architecture, design decisions, data flow
- [Architectural Rules](./AGENTS.md) - Privacy, financial safety, domain-driven design constraints
- [Database Schema](./packages/db/migrations/) - SQL migrations and seed data

## 🔐 Privacy & Security

- **No external LLM calls with financial data**: All sensitive data stays private
- **Deterministic calculations**: Financial rules are testable, verifiable
- **Type-safe contracts**: Domain models prevent rule drift across layers
- **Money as integers**: Avoids floating-point precision errors
- **Append-only audit trail**: Raw data never silently overwritten

## 🧮 Financial Rules (Slice 1)

### Cash
Sum of checking + savings accounts

### Debt
Sum of credit cards, loans, and mortgages (returned as positive liability)

### Net Worth
Assets - Liabilities

### Monthly Surplus
Monthly income - essential expenses - discretionary expenses

### Financial Health Status
- **HEALTHY**: Positive surplus, manageable debt, adequate cash reserves
- **ATTENTION**: Low surplus or insufficient emergency reserves
- **AT_RISK**: Negative cash flow or debt > 3x annual income

## 🗂️ Project Structure

```
apps/
  api/            Express API server
  web/            React web UI
  worker/         Background jobs (future)

packages/
  contracts/      Shared TypeScript types
  domain/         Domain services & interfaces
  financial/      Financial calculations (testable, deterministic)
  db/             Database migrations & schema
  security/       Auth utilities
  ui/             Shared UI components (future)

tests/
  financial/      Domain calculation tests
  integration/    API integration tests
  e2e/            End-to-end tests (ready for implementation)

infra/
  docker/         Docker configuration
  keycloak/       Keycloak realm setup
  postgres/       PostgreSQL initialization
```

## 🧪 Testing

### Unit Tests
```bash
# All tests
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

### Integration Tests (Slice 1 Complete)

**Status**: ✅ Full end-to-end testing with real data

The integration test suite (`apps/web/e2e/integration.spec.ts`) validates the complete journey with **zero mocks in the production data path**:

```bash
# Quick start (automated)
./run-integration-tests.sh    # Linux/Mac
run-integration-tests.bat     # Windows

# Manual setup
docker-compose up              # Docker services
cd apps/api && npm run dev     # API on :3000
cd apps/web && npm run dev     # Web on :5173
npm test e2e/integration.spec.ts  # Run tests
```

**What it validates**:
- ✅ Real PostgreSQL data (Tucker Household)
- ✅ Complete journey: Household → Accounts → Snapshot → UI
- ✅ All 6 key metrics calculated correctly
- ✅ Deterministic calculations (same results on reload)
- ✅ Responsive design (desktop, tablet, mobile)
- ✅ Authorization boundaries (Slice 1 hardcoded household)
- ✅ Error handling and retry flows
- ✅ No raw IDs exposed to users
- ✅ Currency formatting (cents → dollars)

**Expected result**: 25+ tests pass with real data

📚 [Integration Testing Guide](./docs/INTEGRATION_TESTING.md)
📊 [Slice 1 Status Report](./docs/SLICE_1_INTEGRATION_COMPLETE.md)

### Test Coverage

- ✅ Financial calculations (cash, debt, net worth, health status)
- ✅ Snapshot calculation matches expected Tucker household values
- ✅ API endpoint integration (6 endpoints tested with real data)
- ✅ E2E journey tests (login → household → accounts → pulse)
- ✅ Error handling and recovery
- ✅ Responsive UI across all screen sizes


## 📋 API Endpoints

### Household Management
- `GET /api/household` - Get household info
- `GET /api/household/members` - List members

### Accounts
- `GET /api/accounts` - List accounts
- `POST /api/accounts` - Create account

### Financial Snapshot
- `GET /api/financial-snapshot` - Raw calculation
- `GET /api/financial-pulse` - UI-ready summary

## 🎨 UI/UX Design

The Financial Pulse dashboard answers 5 key questions in 30 seconds:

1. **How are we doing?** → Health status badge
2. **What's our position?** → Net worth + cash available
3. **What changed?** → Monthly income/expenses/surplus
4. **What needs attention?** → Status message from structured data
5. **Where do we go?** → Progressive disclosure to details

**Design for non-technical users**:
- Plain language (no financial jargon)
- No database IDs or API terminology
- Large, readable numbers with color coding
- Responsive mobile design
- Progressive disclosure (simple → detailed)

## 🚀 Next Slice: Authentication & Permissions (Slice 2)

- Keycloak OAuth integration
- Multi-user households
- Role-based access (OWNER, MEMBER)
- Audit logging
- Session management

## ⚡ Performance Notes

- Financial snapshot calculated on-demand (can cache/invalidate on account update)
- Database queries indexed for household/account lookups
- React UI lazy-loads account details with progressive disclosure

## 📝 Known Technical Debt

- Mock authentication (uses test user, needs Keycloak)
- Basic connection pooling (needs monitoring)
- Minimal API validation (needs middleware)
- No rate limiting or input sanitization
- Structured logging needed (replace console.log)
- API documentation needs Swagger/OpenAPI

## 📄 License

See [LICENSE](./LICENSE)

---

**Version**: 0.1.0 (Slice 1 - Household Financial Pulse)
**Last Updated**: August 12, 2024
