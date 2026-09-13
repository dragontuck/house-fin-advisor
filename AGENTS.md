# Financial Advisor Development Rules

## Product Solution Design Document
- AI_Financial_Advisor_Product_Solution_Architecture_Specification.docx

## Architecture

This is a privacy-first self-hosted application.

Financial data remains inside the private environment (PostgreSQL).

LLMs never have unrestricted database access.

The LLM may only access typed application tools.

Financial calculations must be deterministic.

Do not put financial calculations in prompts.

Do not duplicate business rules across UI and backend.

Use domain services for financial rules.

Raw imported financial data is append-only.

Never silently overwrite imported financial records.

Every derived financial value has:
- calculation_version
- calculated_at
- source_snapshot_id

Every recommendation references:
- financial_snapshot_id
- policy_version
- evidence
- validation result


### Infrastructure

This project uses existing shared infrastructure (not Docker containers):

**Keycloak (OAuth/OIDC)**
- URL: https://keycloak.keystone.internal:7443/
- Realm: home-fin
- api client: home-fin-api
  - secret: cKlVAAJK7irs6H54QFbWPXgcKN60nJbZsIiHYZr9xh3AOZ6q2VHF7oL0pyaacz9aUCDf2raKkSL8Yjqa0dynwD
- web client: home-fin-web
  - secret: rIB2c3gKmOr9bubmGE53EatZCZOfH7wjDJ81fjD2jz04pGcWJIU06s9LuOPGqxEA5ai8RKnZW14KmQr0HQdJcm
**Redis (Cache)**
- Host: localhost
- Port: 6379

**PostgreSQL (Database)**
- Host: localhost
- Port: 5434
- Database: house_financial
- Admin User: hf_admin
- Admin Password: hf_admin

📖 See [docs/USING_EXISTING_INFRASTRUCTURE.md](./docs/USING_EXISTING_INFRASTRUCTURE.md) for setup and access details.
        
## Privacy

Never send:
- SSN
- account numbers
- routing numbers
- credentials
- card numbers
- raw statements

to an external LLM.

External LLM calls must pass through privacy-gateway.

## UX

The default interface must be understandable
by a non-technical spouse.

Never expose:
- stack traces
- database errors
- OAuth errors
- provider error codes

Errors require:
What happened
Why
What to do
Fix action
What happens next

## Coding
Follow S.O.L.I.D and Clean Code principles

## Financial safety

The LLM cannot:
- invent balances
- invent rates
- invent transactions
- claim research was performed when it wasn't
- make financial transfers

## Testing

Every financial rule requires tests.

Every ingestion parser requires fixtures.

Every AI tool requires contract tests.

## Documents
place working and output documents into the folder .\docs

## Agents
- Minimize token usage and the number of rework.
- **Two-Phase Test Generation:**
  - **Phase 1 (Planning):** Generate a text-only test case matrix before generating code. Do not output code until the matrix is approved or explicit execution is requested.
  - **Phase 2 (Implementation):** Require existing fixtures/factories. Import shared test helpers rather than declaring inline mock objects.
- **Scope & Output Restrictions:**
  - Never rewrite or output unchanged source/test code files; stream back only modified or target test functions.
  - Assert state and domain outputs—do not assert internal implementation details or private methods.
- **Circuit-Breaker Repair Strategy:**
  - Limit automated fixing attempts to a maximum of 1 retry iteration.
  - Pass only stack traces or specific failed test blocks, not entire source/test files.
  - If a test fails twice, stop generation and identify the root cause (test assertion, mock setup, or source bug) in 2 sentences.