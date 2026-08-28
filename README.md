# House Financial Advisor

A privacy-first, self-hosted household financial advisor built to keep financial data inside the home environment while providing deterministic, explainable guidance.

## Current project state

The project has moved beyond the original household pulse prototype and now includes the main financial intelligence, document ingestion, budgeting, and AI advisory layers that were implemented across the later slices.

### Implemented and validated

- ✅ Core household, account, and financial snapshot logic
- ✅ Statement/document ingestion and posting workflow
- ✅ Budget planning, variance analysis, and approval flows
- ✅ Cash flow and recurring transaction detection
- ✅ Savings goals and emergency-fund tracking
- ✅ Debt intelligence and health/attention engine
- ✅ AI tool layer with deterministic tool execution
- ✅ Financial context builder and privacy-safe orchestration
- ✅ Conversational advisor workflows with tool audit trails
- ✅ API + React web dashboard integration

### Current focus

This is a self-hosted financial operating system for households, not a generic chatbot. The system aims to:

- keep all sensitive household data inside a private environment
- make financial calculations deterministic and testable
- expose only typed, validated tools to AI workflows
- provide plain-language plans and recommendations that are grounded in actual household data

---

## Architecture

The codebase is organized as a modular monolith with clear boundaries:

- API: Express + TypeScript services and route layer
- Web: Vite + React dashboard for household finance views
- Domain: core financial rules, calculations, and workflows
- AI: tool planner, executor, orchestrator, and context builder
- Contracts: shared types and API contracts across apps/packages
- Security: privacy gateway and sanitization boundaries
- Database: PostgreSQL with migration-based schema evolution
- Infra: Redis, Keycloak, and object storage used by the app environment

---

## Implemented capability by slice

### Slice 1: Household financial pulse

Complete foundation for household records and deterministic financial metrics.

Included:
- household and member management
- account tracking for assets and liabilities
- cash, debt, net worth, and monthly surplus calculations
- financial health status
- dashboard for household pulse data

### Slice 2: persistence and infrastructure integration

Completed data and infrastructure groundwork.

Included:
- PostgreSQL-backed persistence
- migration-based schema changes
- seed data and shared infrastructure configuration
- household-scoped access patterns

### Slice 3: financial intelligence

This layer turns raw household data into operational insight.

Included:
- budgets and budget variance analysis
- recurring expense detection
- cash flow intelligence
- savings goals and emergency fund tracking
- debt signals and trend analysis
- health and attention items for users
- historical snapshot explainability

### Slice 4: AI advisor, tools, and privacy boundary

The AI layer is implemented as a deterministic tool-based workflow.

Included:
- tool execution endpoints
- AI planner and executor
- financial context builder
- privacy filtering before external LLM interactions
- conversational workflow orchestration
- audit logs for tool use

---

## Privacy and safety model

The project explicitly follows a privacy-first design:

- no SSN, account numbers, routing numbers, credentials, or raw statements are sent to external LLMs
- all sensitive data is filtered before reaching external providers
- the LLM does not have unrestricted database access
- financial calculations remain in domain services, not prompts
- tool behavior is deterministic and validated
- recommendation outputs reference snapshots, policy versions, and evidence

These patterns are enforced by the architecture and documented in the project guidance files.

---

## Quick start

### Prerequisites

Use the shared project infrastructure described in the docs.

- PostgreSQL: `localhost:5434`
- Redis: `localhost:6379`
- Keycloak: `https://keycloak.keystone.internal:7443/`
- object storage / document processing environment for uploads

See:
- `docs/USING_EXISTING_INFRASTRUCTURE.md`
- `AGENTS.md`

### Install dependencies

```bash
npm install
```

### Run the API

```bash
cd apps/api
npm run dev
```

Typically served on:
- `http://localhost:6723`

### Run the web app

```bash
cd apps/web
npm run dev
```

Typically served on:
- `http://localhost:6173`

### Run tests

```bash
npm test
```

For app-level checks:

```bash
cd apps/api && npm run test
cd apps/web && npm test
```

For type-checking:

```bash
npm run type-check
cd apps/api && npm run type-check
cd apps/web && npm run type-check
```

---

## Main project structure

```text
apps/
  api/            Express API and service orchestration
  web/            React dashboard and UI flows
  worker/         Background processing workers

packages/
  ai/             AI orchestration, planner, executor, context builder
  contracts/      Shared type contracts and API schemas
  db/             Database migrations and schema setup
  domain/         Financial rules and domain services
  security/       Privacy and governance utilities
  ui/             Shared UI primitives and patterns

docs/             Architecture, implementation, and validation guides
tests/            Financial, integration, and UI tests
infra/            Infrastructure and environment configuration
```

---

## Key feature areas

### Household finance core
- account balances and liabilities
- snapshot calculations for net worth, cash, debt, and surplus
- household health assessment

### Financial intelligence
- budget creation and variance review
- recurring transaction detection
- savings goal planning
- debt trend tracking
- health/attention engine and explainability metadata

### Statement/document processing
- document upload and validation
- statement processing queue
- transaction posting and review flow
- audit trail for processed records

### AI-guided advice
- structured financial context gathering
- tool-based planning and execution
- privacy-safe provider integration
- conversation-based advisor workflow

---

## Documentation map

Use these guides for more detail:

- `docs/INDEX.md` — project documentation index
- `docs/COMPLETION_SUMMARY.md` — implementation summary
- `docs/AI_TOOL_LAYER_ARCHITECTURE.md` — AI tool architecture
- `docs/AI_TOOL_LAYER_DETERMINISM_TESTING.md` — deterministic testing guidance
- `docs/PRIVACY_BOUNDARY_IMPLEMENTATION.md` — privacy boundary design
- `docs/FINANCIAL_CONTEXT_BUILDER.md` — context-building logic
- `docs/SESSION_SUMMARY_SLICE3.md` — Slice 3 integration summary
- `AGENTS.md` — product and architecture rules

---

## Testing and validation

The project includes financial, integration, and end-to-end validation around real household data and deterministic calculations.

Common commands:

```bash
npm test
cd apps/api && npm run test
cd apps/web && npm test
```

Key validation areas include:
- financial snapshot correctness
- budget and debt scenarios
- document ingestion and posting flows
- AI tool determinism
- dashboard behavior and user journeys

---

## Project philosophy

This project treats household finance as a trust-sensitive domain.

It emphasizes:
- deterministic financial logic
- privacy-first architecture
- explainable recommendations
- data ownership inside the private environment
- safe augmentation with AI rather than uncontrolled access

That makes it suitable as a practical household financial advisor rather than a generic LLM wrapper around personal finance data.

---

## License

This project is licensed under the MIT license. See `LICENSE` for details.
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
