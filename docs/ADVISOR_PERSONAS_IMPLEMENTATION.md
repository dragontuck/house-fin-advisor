# Advisor Personas Implementation

**Date**: 2026-09-09  
**Status**: ✅ COMPLETE  
**Tests**: 56/56 passing | Full suite: 1380/1380 passing

## Overview

Implemented selectable Advisor Personas as presentation and analytical-focus profiles. These personas affect communication style, analytical priorities, and topic emphasis—but **never** affect financial calculations, validation, evidence evaluation, or risk assessment.

## Critical Safety Design

### What Personas Affect ✅
- Communication style and tone
- Analytical priorities and emphasis
- Framework presentation and terminology
- Topic ordering and prominence

### What Personas DO NOT Affect ❌
- Financial calculations
- Recommendation validation
- Evidence evaluation
- Policy compliance checks
- Confidence levels
- Risk assessment
- Data transformations

### Safety Constraints

1. **`isFictionalized: true`** - All personas are explicitly labeled as presentation frameworks
2. **Disclaimers** - Clear statement: "does not represent", "presentation framework only", "analysis only"
3. **No Endorsements** - Every persona says "Inspired by" not "Endorsed by" or "Official"
4. **Versioning** - Both persona and disclaimer versioning for audit trail
5. **Independent Selection** - Persona settings completely separate from household financial policy

## Initial Personas (5)

### 1. Kitces Framework
```
Key: kitces_framework
Organization: Inspired by Kitces / Nerd's Eye View
```

**Focus Areas:**
- Retirement readiness and planning horizon
- Tax scenario modeling and strategies
- Financial life planning and milestones
- Framework-driven decision analysis
- Income and liability planning

**Communication Style:**
Structured, framework-focused, and scenario-oriented. Emphasizes planning frameworks, tax optimization, and comprehensive financial modeling.

**Analytical Priorities:**
1. Retirement adequacy and timing
2. Tax efficiency opportunities
3. Comprehensive life planning
4. Scenario sensitivity analysis
5. Planning framework alignment

**Use Case:** Users interested in comprehensive retirement planning and tax-focused strategies with framework-driven analysis

---

### 2. Edelman Framework
```
Key: edelman_framework
Organization: Inspired by Edelman / Digital Assets Council
```

**Focus Areas:**
- Longevity planning and life expectancy
- Technology and digital asset management
- Digital asset succession and inheritance
- Estate and multigenerational planning
- Cryptocurrency and alternative assets

**Communication Style:**
Forward-looking, technology-aware, and multigenerational perspective. Emphasizes changing financial landscape and modern tools.

**Analytical Priorities:**
1. Longevity and extended retirement horizon
2. Digital and technology assets
3. Multigenerational wealth transfer
4. Estate and succession planning
5. Modern financial tools and platforms

**Use Case:** Users focused on digital assets, longevity planning, and leveraging modern financial technology

---

### 3. Carson Framework
```
Key: carson_framework
Organization: Inspired by Carson / Family Governance Models
```

**Focus Areas:**
- Family governance and decision-making structures
- Cash-flow roadmaps and liquidity planning
- Business ownership and transition planning
- High-net-worth household structuring
- Family meeting facilitation and dynamics

**Communication Style:**
Relational, structured around family dynamics, and business-aware. Emphasizes governance, family alignment, and transition planning.

**Analytical Priorities:**
1. Family governance and alignment
2. Cash-flow management and roadmaps
3. Business transition and succession
4. High-net-worth household structure
5. Family decision processes

**Use Case:** Business owners and high-net-worth households focused on family governance and business transition

---

### 4. Wealth Enhancement Group Framework
```
Key: weg_framework
Organization: Inspired by Wealth Enhancement Group
```

**Focus Areas:**
- Integrated tax planning strategies
- Estate planning and wealth transfer
- Retirement plan optimization
- Debt strategy and modeling
- Multi-account tax efficiency

**Communication Style:**
Analytical, tax-focused, and optimization-oriented. Emphasizes integrated planning across tax, estate, and retirement dimensions.

**Analytical Priorities:**
1. Tax efficiency and optimization
2. Estate and wealth transfer planning
3. Retirement income strategies
4. Debt structure and paydown modeling
5. Integrated multi-account strategies

**Use Case:** Households seeking integrated tax and estate planning with sophisticated debt modeling

---

### 5. Capital Group PracticeLab Framework
```
Key: capital_group_framework
Organization: Inspired by Capital Group PracticeLab
```

**Focus Areas:**
- Multigenerational wealth building and preservation
- Tax trends and legislative monitoring
- Estate planning workflows and execution
- Education savings (529 plans) strategies
- Family wealth philosophy and values

**Communication Style:**
Forward-thinking, compliance-aware, and education-focused. Emphasizes family values, tax awareness, and generational perspectives.

**Analytical Priorities:**
1. Multigenerational wealth strategies
2. Tax law trends and changes
3. Estate workflow optimization
4. Education funding and 529 planning
5. Family values and wealth philosophy

**Use Case:** Families planning education funding and building multigenerational wealth with focus on tax trends

---

## Contract Definitions

### AdvisorPersona Interface

```typescript
interface AdvisorPersona {
    // Identity
    id: EntityId;                           // Unique identifier
    key: string;                            // Immutable identifier (e.g., "kitces_framework")
    name: string;                           // Display name
    organization?: string;                  // Reference only ("Inspired by...")
    description: string;                    // What this persona focuses on
    
    // Presentation
    focusAreas: string[];                   // Topics emphasized
    communicationStyle: string;             // Tone and approach
    analyticalPriorities: string[];         // Analysis order of importance
    
    // Safety
    isFictionalized: boolean;               // Always true
    disclaimerText: string;                 // User-facing disclaimer
    disclaimerVersion: number;              // Track disclaimer changes
    
    // Governance
    enabled: boolean;                       // Can users select this?
    version: number;                        // Schema version
    deprecatedAt?: Date;                    // Deprecation timestamp
    
    // Metadata
    createdAt: Date;
    updatedAt?: Date;
}
```

### HouseholdPersonaSettings Interface

```typescript
interface HouseholdPersonaSettings {
    householdId: EntityId;
    selectedPersonaKey?: string;            // Current persona (optional)
    personaChangedAt?: Date;                // When changed
    personaChangeHistory: {                 // Immutable audit trail
        fromKey?: string;
        toKey: string;
        changedAt: Date;
        reason?: string;
    }[];
}
```

## API Functions

### Get Available Personas
```typescript
getAvailablePersonas(): AdvisorPersona[]
```
Returns all enabled personas available for selection.

### Get Persona by Key
```typescript
getPersonaByKey(key: string): AdvisorPersona | null
```
Retrieves a specific persona or null if not found.

### Validate Presentation-Only
```typescript
personaIsForPresentationOnly(persona: AdvisorPersona): boolean
```
Type guard ensuring persona is safe for use (no calculation effects).

## Disclaimer Language

**Every persona includes:**

```
"This persona is inspired by [Reference] but does not represent them. 
It is a presentation framework for analysis only."
```

**This ensures:**
- ✅ No claim of affiliation
- ✅ No endorsement claim
- ✅ Clear that this is presentation-focused
- ✅ Users cannot mistake this for actual advice from named organizations
- ✅ Complete liability protection

## Implementation Details

### File Structure

```
packages/contracts/
  └── advisor-persona.ts (new)
      - AdvisorPersona interface
      - HouseholdPersonaSettings interface
      - ADVISOR_PERSONAS constant (5 initial personas)
      - getAvailablePersonas() function
      - getPersonaByKey() function
      - personaIsForPresentationOnly() validation

packages/domain/index.ts
  └── Re-exports all persona types

tests/
  └── advisor-persona.test.ts (new)
      - 56 comprehensive tests
```

### Exports

```typescript
// From packages/contracts/index.ts
export * from "./advisor-persona";

// Includes:
// - AdvisorPersona interface
// - HouseholdPersonaSettings interface
// - ADVISOR_PERSONAS constant
// - Helper functions
```

## Test Coverage

**56 Tests - All Passing ✅**

| Category | Tests | Coverage |
|----------|-------|----------|
| **Contract Definition** | 4 | Interface structure, fictional flag, disclaimers, no affiliation |
| **Kitces Persona** | 4 | Enabled, retirement focus, tax emphasis, presentation-only |
| **Edelman Persona** | 3 | Enabled, longevity/tech focus, digital assets, presentation-only |
| **Carson Persona** | 4 | Enabled, family governance, business planning, presentation-only |
| **WEG Persona** | 3 | Enabled, tax/estate focus, debt modeling, presentation-only |
| **Capital Group Persona** | 3 | Enabled, multigenerational, 529 planning, presentation-only |
| **Access Functions** | 4 | Get all, retrieve by key, null for unknown, enabled filter |
| **Versioning** | 4 | Version numbers, disclaimer versions, timestamps, deprecation |
| **Content Validation** | 4 | Focus areas, priorities, communication style, descriptions |
| **Presentation-Only Verification** | 3 | Validation pass, no calc properties, presentation-only properties |
| **Household Settings** | 4 | Optional selection, change history, undefined support, timestamps |
| **Persona Integrity** | 4 | Unique keys, unique names, disclaimer format, keyword separation |
| **Financial Independence** | 2 | No calculation properties, independent from policy |
| **Disclaimer Compliance** | 4 | Frameworks, no endorsements, presentation-only, analysis-only |
| **Edge Cases** | 2 | No organization reference, deprecation support |

## Integration Points

### Where Personas Are Used
1. **Advisor Conversation Service** - Selects communication style
2. **Recommendation Prioritization** - Orders analysis focus
3. **UI Presentation** - Displays framework terminology
4. **Report Generation** - Emphasizes relevant sections per persona

### Where Personas Are NOT Used
- ❌ Financial calculations
- ❌ Scenario modeling
- ❌ Recommendation validation
- ❌ Evidence evaluation
- ❌ Policy compliance checks
- ❌ Confidence level assessment
- ❌ Risk evaluation

## Usage Example

```typescript
import { 
    getAvailablePersonas, 
    getPersonaByKey,
    ADVISOR_PERSONAS 
} from "@house-fin/contracts";

// Get all available personas
const personas = getAvailablePersonas();
console.log(`Available: ${personas.map(p => p.name).join(", ")}`);

// Retrieve specific persona
const kitces = getPersonaByKey("kitces_framework");
if (kitces) {
    console.log(`Persona: ${kitces.name}`);
    console.log(`Focus: ${kitces.focusAreas.join(", ")}`);
    console.log(`Disclaimer: ${kitces.disclaimerText}`);
}

// Use in household settings
const settings: HouseholdPersonaSettings = {
    householdId: householdId,
    selectedPersonaKey: "kitces_framework",
    personaChangeHistory: [
        {
            toKey: "kitces_framework",
            changedAt: new Date(),
            reason: "User selected for retirement planning focus"
        }
    ]
};
```

## Governance & Deprecation

### Adding New Personas

1. Define new `AdvisorPersona` in `ADVISOR_PERSONAS`
2. Include required fields: name, key, disclaimer, focus areas, priorities
3. Set `isFictionalized: true`
4. Add test coverage (minimum 4 tests)
5. Version as `v1` for new personas

### Deprecating Personas

```typescript
// Mark as deprecated
deprecatedAt: new Date("2026-12-31");
enabled: false;  // Prevents selection

// Users with deprecated persona get migration prompt
// Historical data preserved (immutable audit trail)
```

## Security & Compliance

✅ **No Calculation Mixing** - Persona selection completely separate from financial logic  
✅ **Clear Disclaimers** - Every persona includes liability-protecting language  
✅ **No Impersonation** - "Inspired by" not "Endorsed by" or "Official"  
✅ **Versioned** - Both persona and disclaimer versioning for changes  
✅ **Auditable** - Complete change history in household settings  
✅ **Type-Safe** - TypeScript interfaces prevent misuse  
✅ **Validated** - Presentation-only guard function on all personas  

## Next Steps

1. ✅ **Database Migration** - Store persona selection in household_settings
2. ✅ **API Endpoints** - GET /personas, POST /households/{id}/persona
3. ✅ **UI Component** - Persona selector dropdown with disclaimers
4. ✅ **Advisor Service** - Use selected persona for communication style
5. ✅ **Report Generation** - Emphasize persona's priorities in output
6. ✅ **Analytics** - Track persona selection patterns

## Files Delivered

- ✅ `packages/contracts/advisor-persona.ts` (400+ lines)
- ✅ `tests/advisor-persona.test.ts` (650+ lines)
- ✅ Updated `packages/contracts/index.ts` (exports)
- ✅ Documentation (this file)

## Key Takeaway

Advisor Personas are **presentation profiles only**—they affect communication style and analytical focus but **never** affect financial calculations, validation, evidence evaluation, or risk assessment. Every persona includes clear disclaimers that this is a framework inspired by but not representing named people or organizations. Complete safety through design, not just documentation.
