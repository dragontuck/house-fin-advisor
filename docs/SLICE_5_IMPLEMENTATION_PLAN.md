# Slice 5: Researched Recommendations & Independent Validation — Implementation Plan

**Date**: 2026-09-09  
**Objective**: Transform the advisor from a conversational assistant into a research-backed, challengeable recommendation system  
**Status**: PLANNING & IMPLEMENTATION

---

## Decision Journal Integration Update (2026-09-11)

Implemented through migration `017_add_decision_journal.sql`, the AI orchestrator, and household-scoped API routes.

- Every generated recommendation is persisted before delivery with its exact question, financial context and tool outputs, snapshot identity/version when available, policy version when supplied, scenarios, evidence, recommendation, alternatives, validation, confidence assessment, persona, pending approval state, and generation timestamp.
- Generation records are immutable. Approval and decline decisions are append-only records and never rewrite the original context.
- Historical “why did you recommend...” questions load archived journal records from the original conversation or a household-scoped relevance search.
- Historical explanations are grounded against archived tool results and evidence. If no matching journal exists, the advisor refuses to reconstruct the past decision from current data.
- Journal retrieval is available at `GET /api/recommendations/:recommendationId/journal` and `GET /api/conversations/:conversationId/decision-journal`.
- User decisions are recorded at `POST /api/recommendations/:recommendationId/decision`.

---

## Phase 1: Contracts & Data Models

### 1.1 Recommendation Model Contracts
**File**: `packages/contracts/recommendation.ts` (NEW)

```typescript
// Core Recommendation Type
interface Recommendation {
  id: EntityId;
  householdId: EntityId;
  memberId: EntityId;
  conversationId?: EntityId;
  intent: RecommendationType;
  title: string;
  summary: string;
  recommendedAction: string;
  
  // Alternatives
  alternatives: Alternative[];
  
  // Financial basis
  financialSnapshotId: EntityId;
  financialSnapshotVersion: number;
  scenarioIds?: EntityId[];
  
  // Evidence & research
  evidenceIds?: EntityId[];
  policyVersion: number;
  
  // Reasoning
  assumptions: Assumption[];
  risks: Risk[];
  sensitivity?: SensitivityAnalysis[];
  
  // Validation
  validationResult: ValidationResult;
  validationDetails?: string;
  
  // Confidence
  confidence: ConfidenceLevel;
  confidenceReasoning: string;
  
  // Approval
  approvalRequirement: boolean;
  approvalStatus: ApprovalStatus;
  approvalData?: ApprovalData;
  
  // Lifecycle
  createdAt: Date;
  expiresAt?: Date;
  recommendationVersion: number;
  
  // Audit
  createdBy: EntityId;
}

// Recommendation types (from spec section 3)
enum RecommendationType {
  BUDGET_CHANGE = "BUDGET_CHANGE",
  SAVINGS_ALLOCATION = "SAVINGS_ALLOCATION",
  EMERGENCY_FUND = "EMERGENCY_FUND",
  DEBT_ACTION = "DEBT_ACTION",
  WINDFALL_ALLOCATION = "WINDFALL_ALLOCATION",
  SURPRISE_EXPENSE = "SURPRISE_EXPENSE",
  GOAL_PRIORITY = "GOAL_PRIORITY",
  CASH_MANAGEMENT = "CASH_MANAGEMENT",
  CREDIT_CARD_DECISION = "CREDIT_CARD_DECISION",
  FINANCIAL_INDEPENDENCE = "FINANCIAL_INDEPENDENCE",
  GENERAL_FINANCIAL_DECISION = "GENERAL_FINANCIAL_DECISION",
}

interface Alternative {
  id: string;
  title: string;
  description: string;
  rationale: string;
  tradeoffs?: string[];
  estimatedImpact?: Money;
  impactDirection: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  isPreferred: boolean;
}

interface Assumption {
  id: string;
  key: string;
  value: string;
  confidence: ConfidenceLevel;
  reason: string;
  sensitivity?: string;  // How much does it affect outcome if wrong
}

interface Risk {
  id: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  mitigations?: string[];
  impact?: string;
}

interface SensitivityAnalysis {
  variable: string;
  baselineValue: string;
  scenarios: {
    scenario: string;
    outcome: string;
    impact: Money;
  }[];
}
```

### 1.2 Evidence & Research Contracts
**File**: `packages/contracts/evidence.ts` (NEW)

```typescript
// Evidence types
interface Evidence {
  id: EntityId;
  recommendationId?: EntityId;
  householdId: EntityId;
  claim: string;
  source: ResearchSource;
  sourceTier: SourceTier;
  retrievalDate: Date;
  expiresAt?: Date;
  confidence: ConfidenceLevel;
  freshness: "CURRENT" | "RECENT" | "STALE" | "EXPIRED";
  
  // Raw evidence
  sourceUrl?: string;
  sourceText?: string;
  sourceQuote?: string;
  
  // Metadata
  createdAt: Date;
  usedIn?: EntityId[];  // Recommendations using this evidence
}

enum SourceTier {
  TIER_1_GOVERNMENT = "TIER_1_GOVERNMENT",
  TIER_2_PROVIDER = "TIER_2_PROVIDER",
  TIER_3_RESEARCH = "TIER_3_RESEARCH",
  TIER_4_MEDIA = "TIER_4_MEDIA",
}

interface ResearchSource {
  name: string;
  type: "GOVERNMENT" | "PROVIDER" | "RESEARCH" | "MEDIA" | "CUSTOM";
  authority: "REGULATORY" | "OFFICIAL" | "ACADEMIC" | "INSTITUTIONAL" | "COMMERCIAL" | "COMMUNITY";
  url?: string;
}

enum ConfidenceLevel {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
  INSUFFICIENT_INFORMATION = "INSUFFICIENT_INFORMATION",
}
```

### 1.3 Validation Contracts
**File**: `packages/contracts/validation.ts` (NEW)

```typescript
interface ValidationResult {
  status: ValidationStatus;
  summary: string;
  details: ValidationDetail[];
  adversarialReview: AdversarialReview;
  warnings?: string[];
  suggestions?: string[];
}

enum ValidationStatus {
  PASS = "PASS",
  PASS_WITH_WARNINGS = "PASS_WITH_WARNINGS",
  FAIL = "FAIL",
  INSUFFICIENT_INFORMATION = "INSUFFICIENT_INFORMATION",
}

interface ValidationDetail {
  category: "MATH" | "RULES" | "POLICY" | "FRESHNESS" | "ASSUMPTIONS" | "ALTERNATIVES" | 
            "DOWNSIDE" | "SENSITIVITY" | "CONFLICTS" | "BIAS" | "CLAIMS" | "RESEARCH";
  status: "PASS" | "WARN" | "FAIL";
  description: string;
  evidence?: string;
}

interface AdversarialReview {
  question: string;  // "What would make this recommendation wrong?"
  challenges: Challenge[];
  weaknesses: string[];
  potentialAlternatives: string[];
}

interface Challenge {
  type: "ASSUMPTION" | "DATA_FRESHNESS" | "INCOME_CHANGE" | "EXPENSE_CHANGE" | 
        "INTEREST_RATE" | "TAX_CONSEQUENCE" | "GOAL_DEADLINE" | "EMERGENCY" | 
        "BENEFIT_OVERSTATEMENT" | "MISSING_DEBT" | "OUTDATED_TERMS";
  description: string;
  impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  likelihood: "UNLIKELY" | "POSSIBLE" | "LIKELY" | "PROBABLE";
}
```

### 1.4 Advisor Persona Contracts
**File**: `packages/contracts/advisor-persona.ts` (NEW)

```typescript
interface AdvisorPersona {
  id: EntityId;
  name: string;
  organization?: string;
  description: string;
  focusAreas: string[];
  communicationStyle: string;
  analyticalPriorities: string[];
  enabled: boolean;
  version: number;
  
  // CRITICAL: Safety flags
  isFictionalized: boolean;  // Always true for these personas
  disclaimerText: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// Predefined personas (seed data)
const PERSONAS = {
  KITCES: {
    name: "Retirement Planning Framework",
    organization: "Inspired by Michael Kitces / Nerd's Eye View",
    description: "Wealth advisory technology, retirement planning, tax scenario modeling",
    // ... 
  },
  EDELMAN: {
    name: "Longevity & Digital Assets Framework",
    organization: "Inspired by Ric Edelman / Digital Assets Council",
    // ...
  },
  // ...
};

interface HouseholdSettings {
  // ... existing fields
  selectedAdvisorPersona?: EntityId;  // Which persona (if any)
}
```

### 1.5 Approval Workflow Contracts
**File**: Extend existing `packages/contracts/index.ts`

```typescript
enum ApprovalStatus {
  PROPOSED = "PROPOSED",
  REVIEWED = "REVIEWED",
  APPROVED = "APPROVED",
  DECLINED = "DECLINED",
  EXPIRED = "EXPIRED",
}

interface ApprovalData {
  approvedBy?: EntityId;
  approvedAt?: Date;
  approvalNotes?: string;
  declinedBy?: EntityId;
  declinedAt?: Date;
  declinationReason?: string;
}
```

### 1.6 Decision Journal Contracts
**File**: `packages/contracts/decision-journal.ts` (NEW)

```typescript
interface DecisionJournalEntry {
  id: EntityId;
  householdId: EntityId;
  recommendationId: EntityId;
  
  // Complete lineage
  stage: "INTENT" | "CONTEXT_GATHERED" | "SCENARIOS_BUILT" | "RESEARCH_GATHERED" | 
         "CANDIDATES_GENERATED" | "VALIDATED" | "PRESENTED" | "APPROVED" | "DECLINED" | "EXPIRED";
  
  stageTimestamp: Date;
  stageDuration?: number;  // ms since previous stage
  
  input: {
    userIntent: string;
    financialSnapshot: EntityId;
  };
  
  scenarios?: {
    id: EntityId;
    type: string;
    inputs: Record<string, unknown>;
    results: Record<string, unknown>;
  }[];
  
  research?: {
    evidenceId: EntityId;
    claim: string;
    source: ResearchSource;
    confidence: ConfidenceLevel;
  }[];
  
  candidates?: {
    id: string;
    title: string;
    reasoning: string;
  }[];
  
  validation?: {
    status: ValidationStatus;
    result: ValidationResult;
  };
  
  final?: {
    recommendationId: EntityId;
    approvalStatus: ApprovalStatus;
    userChoice?: string;
  };
  
  createdAt: Date;
}
```

---

## Phase 2: Database Migrations

### 2.1 Recommendations Table
**File**: `packages/db/migrations/009_add_recommendations.sql`

```sql
CREATE TABLE recommendations (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id),
  member_id UUID NOT NULL REFERENCES household_members(id),
  conversation_id UUID REFERENCES advisor_conversations(id),
  
  intent VARCHAR(50) NOT NULL,  -- RecommendationType
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  
  -- Financial basis
  financial_snapshot_id UUID NOT NULL REFERENCES financial_snapshots(id),
  financial_snapshot_version INTEGER NOT NULL,
  policy_version INTEGER NOT NULL,
  
  -- JSON fields for complex structures
  alternatives JSONB NOT NULL DEFAULT '[]',  -- Alternative[]
  assumptions JSONB NOT NULL DEFAULT '[]',   -- Assumption[]
  risks JSONB NOT NULL DEFAULT '[]',         -- Risk[]
  sensitivity JSONB,                          -- SensitivityAnalysis[]
  
  -- Validation
  validation_status VARCHAR(30) NOT NULL,  -- ValidationStatus
  validation_details TEXT,
  validation_result JSONB,
  
  -- Confidence
  confidence VARCHAR(20) NOT NULL,
  confidence_reasoning TEXT NOT NULL,
  
  -- Approval
  approval_required BOOLEAN NOT NULL DEFAULT true,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'PROPOSED',  -- ApprovalStatus
  approval_data JSONB,  -- ApprovalData
  
  -- Metadata
  created_by UUID NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  recommendation_version INTEGER NOT NULL DEFAULT 1,
  
  -- Indexes
  INDEX idx_household_id (household_id),
  INDEX idx_approval_status (approval_status),
  INDEX idx_created_at (created_at),
  UNIQUE (id, household_id)
);
```

### 2.2 Evidence Table
**File**: `packages/db/migrations/010_add_evidence.sql`

```sql
CREATE TABLE evidence (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id),
  recommendation_id UUID REFERENCES recommendations(id),
  
  claim TEXT NOT NULL,
  source_name VARCHAR(255) NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_tier VARCHAR(30) NOT NULL,
  source_authority VARCHAR(30) NOT NULL,
  source_url VARCHAR(2048),
  
  retrieval_date TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,
  confidence VARCHAR(20) NOT NULL,
  freshness VARCHAR(20) NOT NULL,
  
  source_text TEXT,
  source_quote TEXT,
  
  used_in JSONB DEFAULT '[]',  -- EntityId[]
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  INDEX idx_household_id (household_id),
  INDEX idx_recommendation_id (recommendation_id),
  INDEX idx_source_tier (source_tier)
);
```

### 2.3 Validation Audit Table
**File**: `packages/db/migrations/011_add_validation_audit.sql`

```sql
CREATE TABLE validation_audits (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id),
  recommendation_id UUID NOT NULL REFERENCES recommendations(id),
  
  validation_status VARCHAR(30) NOT NULL,
  summary TEXT NOT NULL,
  details JSONB NOT NULL,  -- ValidationDetail[]
  adversarial_review JSONB NOT NULL,  -- AdversarialReview
  warnings JSONB,
  suggestions JSONB,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  INDEX idx_recommendation_id (recommendation_id),
  INDEX idx_validation_status (validation_status)
);
```

### 2.4 Decision Journal Table
**File**: `packages/db/migrations/012_add_decision_journal.sql`

```sql
CREATE TABLE decision_journal (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id),
  recommendation_id UUID NOT NULL REFERENCES recommendations(id),
  
  stage VARCHAR(30) NOT NULL,
  stage_timestamp TIMESTAMP NOT NULL,
  stage_duration_ms INTEGER,
  
  input JSONB NOT NULL,
  scenarios JSONB,
  research JSONB,
  candidates JSONB,
  validation JSONB,
  final JSONB,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  INDEX idx_recommendation_id (recommendation_id),
  INDEX idx_stage (stage),
  INDEX idx_created_at (created_at)
);
```

### 2.5 Advisor Personas Table
**File**: `packages/db/migrations/013_add_advisor_personas.sql`

```sql
CREATE TABLE advisor_personas (
  id UUID PRIMARY KEY,
  
  name VARCHAR(255) NOT NULL UNIQUE,
  organization VARCHAR(255),
  description TEXT NOT NULL,
  focus_areas JSONB NOT NULL,  -- string[]
  communication_style TEXT NOT NULL,
  analytical_priorities JSONB NOT NULL,  -- string[]
  
  enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  is_fictionalized BOOLEAN NOT NULL DEFAULT true,
  disclaimer_text TEXT NOT NULL,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  INDEX idx_enabled (enabled),
  UNIQUE (id, name)
);

-- Add to household_settings
ALTER TABLE household_settings
ADD COLUMN selected_advisor_persona_id UUID REFERENCES advisor_personas(id);
```

---

## Phase 3: Domain Services

### 3.1 Recommendation Builder Service
**File**: `packages/domain/recommendation-builder.ts` (NEW)

Responsibilities:
- Build candidate recommendations from scenarios
- Apply household policy constraints
- Generate alternatives
- Calculate confidence levels from data quality + research freshness + calculation strength
- NOT do LLM generation (pure deterministic logic)

### 3.2 Validation Service
**File**: `packages/domain/recommendation-validator.ts` (NEW)

Responsibilities:
- Check math (recalculate all figures)
- Validate against household policy
- Check data freshness
- Challenge assumptions
- Check for conflicts
- Attempt to build adversarial counter-recommendation
- Rate validation result (PASS/WARN/FAIL)

### 3.3 Evidence Tracker
**File**: `packages/domain/evidence-tracker.ts` (NEW)

Responsibilities:
- Record evidence with source hierarchy
- Track freshness
- Link evidence to recommendations
- Surface when evidence cannot be verified

### 3.4 Decision Journal Service
**File**: `packages/domain/decision-journal-service.ts` (NEW)

Responsibilities:
- Record each stage of recommendation pipeline
- Track stage timing
- Record all inputs/outputs at each stage
- Enable reproducibility and audit trail

---

## Phase 4: API Endpoints

### 4.1 Recommendation Endpoints
**File**: `apps/api/src/routes/recommendations.ts` (NEW)

```
POST   /api/recommendations/generate    -- Run full pipeline (intent → recommendation)
GET    /api/recommendations            -- List recommendations for household
GET    /api/recommendations/:id        -- Get specific recommendation with full lineage
POST   /api/recommendations/:id/approve -- Approve (with or without modifications)
POST   /api/recommendations/:id/decline -- Decline with reason
GET    /api/recommendations/:id/journal -- Get decision journal entry
```

### 4.2 Evidence Endpoints
**File**: Extend recommendations.ts

```
GET    /api/evidence/:id               -- Get evidence with source details
GET    /api/evidence/research/:claim   -- Search for evidence on a claim
```

### 4.3 Validation Endpoints
```
GET    /api/recommendations/:id/validation  -- Get validation audit
POST   /api/recommendations/:id/re-validate -- Re-run validation
```

---

## Phase 5: Testing

### 5.1 Contract Tests
- All recommendation types validate
- Evidence source tiers enforced
- Validation status constraints
- Approval state machine constraints
- No impersonation in personas

### 5.2 Service Tests
- Recommendation builder: scenarios → candidates
- Validator: validates math, policy, data freshness
- Evidence tracker: records source tier correctly
- Decision journal: complete lineage recorded

### 5.3 Integration Tests
- Full pipeline: intent → recommendation → validation → approval
- Recommendation expires after expiry date
- Evidence source verification
- Persona changes presentation only

---

## Phase 6: UI Components

### 6.1 Recommendation View
- Display structured recommendation
- Show alternatives with rationale
- Display assumptions and risks
- Show confidence level with reasoning
- Display evidence/sources
- Show validation result
- Approval workflow (PROPOSED → REVIEWED → APPROVED)

### 6.2 Persona Selector
- Household setting for advisor style
- Disclaimer that it's a style, not actual person
- No endorsement language
- Can change per-conversation or globally

### 6.3 Decision Journal View
- Timeline of recommendation building
- Stage-by-stage progress
- Scenarios considered
- Research conducted
- Validation results
- Approval status

---

## Implementation Order

1. ✅ **Phase 1a**: Create contracts (recommendation, evidence, validation, persona, approval)
2. ✅ **Phase 1b**: Update main contracts index
3. ✅ **Phase 2**: Create migrations (5 new tables, 1 schema alter)
4. ✅ **Phase 3**: Create domain services (builder, validator, evidence tracker, journal snapshot builder)
5. ✅ **Phase 3**: Add repositories (recommendations, evidence, validation audit, decision journal)
6. ✅ **Phase 4**: Create API endpoints and handlers
7. ✅ **Phase 5**: Create comprehensive tests
8. ⏳ **Phase 6**: UI components (after core logic verified)
9. ⏳ **Phase 6b**: Advisor persona seeding and household integration

---

## Success Criteria

- [ ] All recommendation types can be created
- [ ] Evidence source hierarchy enforced
- [ ] Validation catches math errors and policy violations
- [ ] Recommendations expire automatically
- [ ] Approval workflow prevents auto-changes
- [ ] Personas affect presentation not calculation
- [ ] No impersonation language used
- [x] Complete decision journal auditable
- [x] Recommendations reproducible from saved inputs
- [ ] Failed validation blocks normal delivery
- [ ] All E2E tests pass
- [ ] Slices 1-4 continue to work

---
