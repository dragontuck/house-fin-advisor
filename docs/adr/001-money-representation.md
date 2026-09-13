# ADR-001: Money Representation

**Status**: Accepted  
**Date**: 2026-09-13  
**Deciders**: Architecture Team  

---

## Context

The financial advisor application handles household money, which demands precision and auditability. Floating-point arithmetic introduces rounding errors that compound over time, leading to discrepancies between calculated and actual balances. This is unacceptable for a household financial system.

## Decision

All monetary values are represented and stored as **integer cent amounts** (e.g., $10.50 = 1050 cents). Conversions to decimal representation occur only for display.

## Consequences

### Positive
- No rounding errors or unexpected precision loss
- Deterministic calculations produce identical results on every run
- Auditability: every cent is accounted for
- Database storage is efficient (integer, no decimal precision config)

### Negative
- Developers must be careful to convert user input (e.g., "$10.50" from UI) to cents
- Display logic must format cents back to human-readable currency
- Cannot assume financial calculations work with numbers directly

## Implementation Rules

1. **In TypeScript/JavaScript**: Use `Money` contract type
   ```typescript
   interface Money {
     amount: number; // cents (integer)
     currency: string; // "USD"
   }
   ```

2. **In Database**: Store as `BIGINT` (cents), never `DECIMAL`

3. **In API**: JSON always contains cents; conversion to decimal only in response formatting

4. **In Domain Services**: All calculations use integer arithmetic

5. **In Tests**: Use fixed, known values; no random floats

## References
- PRODUCT_BUILD_CONTRACT.md § 3.1 Money Representation
- AGENTS.md § Money
