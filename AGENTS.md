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
- Realm: house-fin

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

## Agents
- Minimize token usage and the number of rework