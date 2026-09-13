# ADR-003: Privacy Boundary and AI Tool Access

**Status**: Accepted  
**Date**: 2026-09-13  
**Deciders**: Architecture Team, Security Team  

---

## Context

The system stores sensitive household financial data (balances, account numbers, transaction history, income). External LLMs must never receive raw financial records, credentials, or identifiers. The privacy boundary must be enforced at the application layer, not through policy.

## Decision

1. **Privacy Gateway**: All external LLM calls pass through a privacy-aware middleware that:
   - Constructs minimal, derived context (FinancialSnapshot summary, not raw transactions)
   - Removes identifiers (SSN, account numbers, routing numbers, credentials, card numbers, raw statements)
   - Blocks secrets before transmission
   - Allowlists external destinations (currently Anthropic only)

2. **Tool-Only AI Access**: The LLM never receives:
   - Unrestricted database connection
   - Filesystem access
   - Shell execution capability
   - Network access (except through privacy gateway)
   - All financial access occurs through typed, authorization-aware tools

3. **Financial Data Containment**: Raw financial records remain inside the self-hosted environment and are never sent to external systems

## Consequences

### Positive
- Confidential data stays on-premises by default
- External AI cannot infer sensitive details from raw statements
- Easy to audit what leaves the boundary (all paths go through gateway)
- Consistent policy enforcement regardless of LLM provider

### Negative
- More complex LLM prompts (must work with summaries, not raw data)
- Requires careful tool design to expose safe abstractions
- Cannot leverage external AI to do privacy-sensitive work (e.g., raw OCR)

## Implementation Rules

1. **Privacy Gateway Middleware**
   - Location: `packages/ai/privacy-gateway.ts`
   - All external LLM calls must pass through this middleware
   - Never bypass for "temporary" or "internal" calls

2. **Context Construction**
   - Include: FinancialSnapshot (derived), budget categories, goal summaries
   - Exclude: Account numbers, transaction descriptions, SSN, routing numbers, card numbers, authentication credentials
   - Anonymize: Merchant names, payee names (use categories instead)

3. **Tool Authorization**
   - Every tool checks household authorization
   - Tools return only household-scoped data
   - Tools never return raw statements or account numbers

4. **External Provider Restrictions**
   - Currently allowed: Anthropic (Claude)
   - Future additions require explicit approval and ADR

## Denial Checklist

Never allow external LLM to receive:
- ❌ SSN
- ❌ Account numbers
- ❌ Routing numbers
- ❌ Credentials
- ❌ Card numbers
- ❌ Raw statements or transaction descriptions
- ❌ Payee/merchant names
- ❌ Provider-specific terms or offers

## References
- AGENTS.md § Privacy
- PRODUCT_BUILD_CONTRACT.md § 1.3 Minimum Data Exposure
- packages/ai/privacy-gateway.ts
