# ADR-005: Personas as Framing, Not Calculation

**Status**: Accepted  
**Date**: 2026-09-13  
**Deciders**: Architecture Team  

---

## Context

Slice 5 implements advisor personas (Kitces retirement planning, Edelman longevity framework, etc.) to provide different analytical perspectives. However, personas must never affect financial calculations or recommendation validity. They are purely presentation-level framing.

## Decision

1. **Personas are Optional**: Households can select a persona for communication style, but calculations are persona-independent.

2. **Personas Affect Prompts Only**: Selected persona influences:
   - How the AI phrases explanations
   - Which topics receive emphasis
   - Communication tone and terminology
   - Which assumptions are surfaced

3. **Personas Never Affect**:
   - Financial calculations
   - Validation logic
   - Evidence evaluation
   - Recommendation selection
   - Confidence levels
   - Alternatives, assumptions, or risks

4. **Fictionalization Disclaimer**: Every persona is labeled as a stylistic framework, not an actual person or organization. No endorsement language is used.

## Consequences

### Positive
- Simple persona switching without recalculation
- Personas enhance UX without compromising financial integrity
- Household can experiment with different perspectives risk-free

### Negative
- Personas cannot have different business logic (would violate this ADR)
- Requires discipline in implementation to keep personas presentation-only

## Implementation Rules

1. **Persona Selection**
   - Stored in `household_settings.selected_advisor_persona_id`
   - Can be changed per-conversation or globally
   - Changing persona does not invalidate existing recommendations

2. **Persona Application**
   - Applied only in prompt template selection
   - Never in domain service logic
   - Never in validation or scoring
   - Example:
     ```typescript
     // ✅ GOOD: Persona affects prompt framing
     const promptTemplate = getTemplateForPersona(selectedPersona);
     
     // ❌ BAD: Persona affects calculation
     const affordability = calculateAffordability(scenario, selectedPersona);
     ```

3. **UI Disclaimer**
   - Display: "This is a planning framework, not actual financial advice"
   - No claim of actual person or organization
   - No authority or endorsement implied

4. **Testing**
   - Domain tests verify calculation is persona-independent
   - E2E tests verify UI displays persona name correctly
   - Tests confirm recommendation is identical across personas

## References
- PRODUCT_BUILD_CONTRACT.md § 1.4 Recommendation Contract
- PRODUCT_BUILD_CONTRACT.md § 1.5 Personas affect presentation only, not calculations
- SLICE_5_VALIDATION_FINDINGS.md § Persona Risks (LOW risk while labels remain generic)
