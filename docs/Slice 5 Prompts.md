# Slice 5 — Researched Recommendations & Independent Validation

## Objective

Implement the fifth vertical slice of the AI Financial Advisor.

The objective is to evolve the application from a contextual conversational financial assistant into a **research-backed, challengeable household financial recommendation system**.

The advisor must be able to answer questions such as:

* "What should we do with this $10,000 bonus?"
* "Should we put this money toward the mortgage or retirement?"
* "How should we handle this unexpected $6,000 expense?"
* "Should I keep this credit-card annual fee?"
* "How should we prioritize our savings goals?"
* "What is the best way to handle this extra money?"
* "Should we change our budget?"
* "What should we do differently to reach financial independence sooner?"

The system must:

1. Understand the current household financial state.
2. Identify the user's decision or objective.
3. Build relevant scenarios using deterministic financial services.
4. Research current external facts when required.
5. Generate one or more candidate recommendations.
6. Independently challenge those recommendations.
7. Identify assumptions and uncertainty.
8. Compare alternatives.
9. Produce a structured Recommendation.
10. Explain the recommendation in plain language.
11. Record the complete recommendation lineage.
12. Require explicit user approval before financial-state changes.

---

# 1. Critical Architectural Principle

The system is NOT:

```text
User
 ↓
LLM
 ↓
Financial Advice
```

The system is:

```text
User
 ↓
Intent / Decision
 ↓
Current Financial State
 ↓
Deterministic Scenario Modeling
 ↓
Current Research
 ↓
Candidate Recommendations
 ↓
Independent Validation
 ↓
Final Recommendation
 ↓
Human Review / Approval
```

The LLM is an orchestration and explanation layer.

The Financial Engine remains authoritative for calculations.

The Research Service remains authoritative for current external facts.

The Validation Service is responsible for challenging recommendations.

---

# 2. Recommendation Pipeline

Implement:

```text
USER QUESTION
     ↓
DECISION INTENT
     ↓
CONTEXT BUILDER
     ↓
FINANCIAL SCENARIOS
     ↓
RESEARCH
     ↓
CANDIDATE RECOMMENDATIONS
     ↓
INDEPENDENT VALIDATION
     ↓
RISK / ALTERNATIVE ANALYSIS
     ↓
FINAL RECOMMENDATION
     ↓
USER
     ↓
OPTIONAL APPROVAL
     ↓
DECISION JOURNAL
```

---

# 3. New Recommendation Types

Initially support:

```text
BUDGET_CHANGE
SAVINGS_ALLOCATION
EMERGENCY_FUND
DEBT_ACTION
WINDFALL_ALLOCATION
SURPRISE_EXPENSE
GOAL_PRIORITY
CASH_MANAGEMENT
CREDIT_CARD_DECISION
FINANCIAL_INDEPENDENCE
GENERAL_FINANCIAL_DECISION
```

Do not implement automated securities trading.

Do not implement autonomous money movement.

Do not provide individualized securities recommendations as an automated action.

---

# 4. Recommendation Object

Expand the existing Recommendation model.

Required fields:

* id
* householdId
* memberId
* conversationId
* intent
* title
* summary
* recommendedAction
* alternatives
* financialSnapshotId
* financialSnapshotVersion
* policyVersion
* scenarioIds
* evidenceIds
* assumptions
* risks
* validationResult
* confidence
* approvalRequirement
* approvalStatus
* createdAt
* expiresAt
* recommendationVersion

A recommendation must be reproducible from its recorded inputs.

---

# 5. Recommendation Confidence

Use:

HIGH
MEDIUM
LOW
INSUFFICIENT_INFORMATION

Confidence must not simply reflect LLM confidence.

It should depend on:

* quality of financial data
* freshness
* calculation confidence
* evidence quality
* research freshness
* assumption sensitivity
* validation outcome
* disagreement between scenarios

Example:

```text
Confidence: HIGH

Reason:
- current account data is fresh
- scenario inputs are complete
- primary source evidence is available
- recommendation passed independent validation
- result is not highly sensitive to assumptions
```

---

# 6. Research Architecture

The Research Service is responsible for current external facts.

It must distinguish:

### Fact

"The credit card annual fee is $550."

### Source

Issuer terms.

### Retrieval date

2026-09-08.

### Freshness

Current.

### Confidence

High.

### Recommendation

"Keep the card because the benefits exceed the annual fee under your current usage."

The research engine provides evidence.

It does NOT determine the household recommendation.

---

# 7. Research Source Hierarchy

Prefer:

## Tier 1 — Government / Regulatory / Official

Examples:

* IRS
* SEC
* CFPB
* FDIC
* Federal Reserve
* Treasury
* Department of Labor
* Social Security Administration
* official government program pages

Use for:

* tax rules
* retirement rules
* regulatory facts
* official program rules

## Tier 2 — Primary Provider Documentation

Examples:

* bank
* credit-card issuer
* employer plan
* mortgage lender
* investment provider

Use for:

* rates
* fees
* card benefits
* account terms
* plan rules
* provider policies

## Tier 3 — Independent Research

Examples:

* Morningstar
* Vanguard research
* Fidelity research
* Schwab research
* institutional research
* academic sources

Use for:

* portfolio education
* historical evidence
* comparisons
* financial research

## Tier 4 — Secondary Media / Community

Use only for:

* context
* discovery
* supplementary insight

Never use Tier 4 as the sole support for a material recommendation.

---

# 8. Evidence Requirements

For any material recommendation involving current external facts:

* record source
* record retrieval timestamp
* record claim
* record source tier
* record freshness
* record confidence

If current facts cannot be verified:

Do not present them as current.

The system should say:

"Current information could not be verified, so I am not relying on that fact in this recommendation."

---

# 9. Independent Validation

Every material recommendation must be challenged.

The validator should examine:

1. Math
2. Financial rules
3. Household policy
4. Data freshness
5. Assumptions
6. Alternatives
7. Downside
8. Sensitivity
9. Conflicts
10. Potential bias
11. Unsupported claims
12. Research quality

Validation results:

PASS
PASS_WITH_WARNINGS
FAIL
INSUFFICIENT_INFORMATION

A failed validation must not be presented as a normal recommendation.

---

# 10. Adversarial Review

The validator should explicitly ask:

> "What would make this recommendation wrong?"

Examples:

* income changes
* unexpected expense
* interest-rate change
* tax consequence
* goal deadline
* emergency-fund requirement
* benefit value being overstated
* missing debt
* outdated provider terms

It should attempt to produce at least one meaningful alternative.

---

# 11. Recommendation Alternatives

A recommendation should normally include:

### Preferred

What the system recommends.

### Alternative A

The strongest competing choice.

### Alternative B

A reasonable lower-risk or lower-effort option where applicable.

Example:

```text
Recommended:
Put $4,000 toward emergency savings.

Alternative:
Put $4,000 toward mortgage principal.

Alternative:
Split $2,000 / $2,000.
```

Explain why the preferred option wins under current household policy.

---

# 12. User Approval

The system must distinguish:

PROPOSED
REVIEWED
APPROVED
DECLINED
EXPIRED

No recommendation can change household financial data merely because an AI produced it.

A user must explicitly approve:

* budget changes
* goal changes
* financial policy changes
* other persisted financial planning changes

Money movement remains out of scope.

---

# 13. AI Persona Selection

Add a household/member-selectable AI advisor persona.

The persona changes how advice is framed and explained.

It must NOT change:

* financial calculations
* source requirements
* privacy controls
* validation rules
* household policy
* safety rules
* approval requirements

The five initial personas are:

### 1. Michael Kitces

**Reference:** Nerd’s Eye View / Kitces.com

**Focus:**

* wealth advisory technology
* financial frameworks
* client discovery
* retirement planning
* tax scenario modeling
* financial life planning

### 2. Ric Edelman

**Reference:** Digital Assets Council / Edelman Financial

**Focus:**

* wealth-management technology
* digital assets
* longevity planning
* estate planning
* multi-generational wealth preservation
* modern portfolio allocation

### 3. Ron Carson

**Reference:** Carson Group

**Focus:**

* high-net-worth family planning
* business transition
* family governance
* multi-step cash-flow planning
* family-office style decision frameworks

### 4. Wealth Enhancement Group

**Reference:** WEG Thought Leadership

**Focus:**

* integrated tax
* estate planning
* personal financial modeling
* retirement-plan analysis
* tax-bracket optimization
* debt-paydown modeling

### 5. Capital Group Advisor Practice

**Reference:** PracticeLab

**Focus:**

* multi-generational wealth
* tax-return trends
* estate workflows
* 529 planning
* structured financial-document analysis

---

# 14. Persona Safety Rule

The system must NOT claim:

* endorsement
* affiliation
* direct advice from the named person/company
* access to their private systems
* use of proprietary models
* official certification
* proprietary prompt libraries unless actually licensed or available

The UI should describe these as:

"Advisor Style"

rather than:

"Advisor"

Example:

> Advisor Style: Retirement Planning Framework

rather than:

> Michael Kitces is advising you.

The persona is a style/analytical framework inspired by publicly available material, not an impersonation.

---

# 15. Persona Architecture

Create:

```text
AdvisorPersona
```

with:

* id
* name
* organization
* description
* focusAreas
* communicationStyle
* analyticalPriorities
* enabled
* version

Separate:

```text
Persona Presentation
```

from:

```text
Financial Decision Logic
```

The persona may affect:

* question framing
* level of detail
* analytical emphasis
* response organization
* terminology

It may not affect:

* financial calculations
* evidence hierarchy
* privacy rules
* validation outcome
* approval requirements
* safety policies

---

# 16. Definition of Done

Slice 5 is complete when:

1. Material financial questions can produce structured recommendations.
2. Recommendations use current household state.
3. Deterministic scenarios drive financial calculations.
4. Current external facts can be researched.
5. Evidence is stored and traceable.
6. Candidate recommendations are independently challenged.
7. Alternatives are considered.
8. Assumptions and risks are visible.
9. Confidence is evidence-based.
10. Recommendations are versioned.
11. Recommendations are auditable.
12. Approval state is explicit.
13. Persona selection works.
14. Persona changes presentation rather than financial truth.
15. No named-person impersonation occurs.
16. Failed validation prevents normal recommendation delivery.
17. The user can understand why a recommendation was made.
18. Public LLM calls continue to pass through privacy controls.
19. The system works when external research or LLM services are unavailable.
20. Existing Slices 1–4 continue to work.

Before implementation, inspect the repository and all current ADRs.

Do not rewrite existing financial logic unless there is an architectural conflict.

At the end of every task report:

* files created
* files modified
* tools added
* domain changes
* research sources/classes added
* tests added
* architecture decisions
* security/privacy implications
* financial correctness implications
* technical debt
* recommended next task

------------------------------------------------------
# Traget Prompt 1
Implement the Slice 5 Recommendation domain.

Extend/create:

* Recommendation
* RecommendationAlternative
* RecommendationAssumption
* RecommendationRisk
* RecommendationEvidence
* RecommendationValidation
* RecommendationApproval

A Recommendation must reference:

* household
* user
* conversation
* financial snapshot
* policy version
* scenarios
* evidence
* validation

Create explicit status:

PROPOSED
REVIEWED
APPROVED
DECLINED
EXPIRED
INVALIDATED

Create RecommendationVersion.

A new materially different recommendation must create a new version rather than silently modifying the old one.

Implement database migrations and domain tests.

Do not implement research, validation, or LLM integration yet.

----------------------------------------------
# Targeted prompt 2
Implement the Research and Evidence service.

## Objective

Retrieve current external facts when a recommendation requires current information.

Implement:

```text
searchResearch()
retrieveSource()
extractClaims()
storeEvidence()
checkFreshness()
```

Every EvidenceSource must retain:

* source URL
* title
* source tier
* publisher
* retrieval timestamp
* publication/update timestamp if available
* freshness status
* extracted claim
* confidence

Use source tiers:

1. Government/regulator
2. Primary provider
3. Independent research
4. Secondary/media

Prefer primary sources.

The service must NOT generate household recommendations.

It only retrieves and structures evidence.

## Failure behavior

If material current information cannot be verified:

Return:

UNVERIFIED

The recommendation workflow must be able to stop rather than fabricate current information.

Add tests for:

* source retrieval
* freshness
* unavailable source
* conflicting sources
* stale source
* source ranking

---------------------------------
# Targeted Prompt 3
Implement the recommendation scenario layer.

Create scenarios for:

* windfall
* surprise expense
* savings allocation
* debt action
* budget change
* goal priority
* cash allocation
* affordability
* financial-independence impact

A scenario must contain:

* inputs
* baseline
* proposed action
* resulting state
* assumptions
* sensitivity
* calculation version
* financial snapshot version

Use existing deterministic financial services.

Do not perform financial calculations in the LLM.

Example:

Input:

Windfall = $10,000

Generate scenarios:

A:
Emergency fund

B:
Debt reduction

C:
Goal funding

D:
Investment/long-term allocation where supported by current scope

E:
Split allocation

Return structured impacts.

Do not select the final recommendation yet.
--------------------------------------------------
# Targeted Prompt 4 — Candidate recommendation generator

Implement candidate recommendation generation.

The generator should evaluate:

* household policy
* current financial state
* user objective
* scenarios
* evidence
* constraints
* goals
* risk

Generate structured candidate recommendations.

Each candidate must include:

* action
* rationale
* alternatives
* assumptions
* risks
* expected impact
* confidence
* evidence references

The LLM may help formulate candidate recommendations.

However:

* financial calculations must come from tools
* current facts must come from EvidenceSource
* household policy must come from structured data
* unsupported claims must be rejected

Do not yet declare a candidate to be the final recommendation.

Produce multiple candidates where meaningful alternatives exist.


---------------------------------------
# Targeted Prompt 5 — Independent validation engine

Implement the independent Recommendation Validator.

The validator must independently inspect candidate recommendations.

Evaluate:

## Mathematical correctness

Are the calculations supported by financial-engine results?

## Rule correctness

Does the recommendation violate household financial policy?

## Evidence correctness

Are current external claims supported?

## Assumption sensitivity

Would small changes in assumptions materially change the recommendation?

## Alternative quality

Was a meaningful competing option considered?

## Downside

What is the worst plausible consequence?

## Bias

Could the recommendation be systematically favoring:

* a particular product
* a particular provider
* a particular financial behavior
* an overly aggressive strategy
* an overly conservative strategy

## Data freshness

Are the financial state and external facts sufficiently current?

Return:

PASS
PASS_WITH_WARNINGS
FAIL
INSUFFICIENT_INFORMATION

A failed recommendation must not become the final recommendation.

Add adversarial test cases.

----------------------------------------------------------

#  Targeted Prompt 6 — Bias and conflict detection

Implement conflict and bias checks.

The validator should identify:

* recommendation-provider conflicts
* unsupported product preference
* fees that may bias an option
* marketing language
* hidden assumptions
* disproportionate downside
* one-sided alternative analysis

The system should explicitly ask:

"What would make another option better?"

For every material recommendation involving a financial product, identify:

* benefit
* cost
* limitation
* alternative
* reason for preference

The system must not favor a product merely because its information is easier to retrieve.

Do not make claims about advisor or provider incentives unless supported by evidence.

Add tests using deliberately biased candidate recommendations.


-------------------------------------------

# Targeted Prompt 7 — Recommendation selection and finalization

Implement final recommendation selection.

Inputs:

* candidate recommendations
* scenario results
* household policy
* evidence
* validation results
* confidence

Rules:

1. A failed candidate cannot become final.
2. A candidate with insufficient evidence cannot be presented as high confidence.
3. Household policy takes precedence over generic optimization unless the system explicitly identifies a policy conflict.
4. A recommendation should not be selected solely because an LLM prefers it.
5. Material alternatives must be retained.
6. Confidence must reflect evidence and uncertainty.

Output:

```text
recommendedAction
why
alternatives
impact
assumptions
risks
evidence
validation
confidence
approvalRequirement
```

Store the finalized Recommendation.

Create deterministic tests for candidate ranking/selection where possible.

----

# Targeted Prompt 8 — Persona framework

Implement selectable Advisor Personas.

Create:

```text
AdvisorPersona
```

Initial personas:

## Kitces Style

Focus:

* retirement planning
* tax scenarios
* financial life planning
* framework-driven analysis

## Edelman Style

Focus:

* longevity
* technology
* digital assets
* estate/multigenerational planning

## Carson Style

Focus:

* family governance
* cash-flow roadmaps
* business transition
* high-net-worth planning concepts

## Wealth Enhancement Group Style

Focus:

* integrated tax
* estate
* retirement-plan analysis
* debt modeling

## Capital Group PracticeLab Style

Focus:

* multigenerational wealth
* tax trends
* estate workflows
* 529 planning

Important:

These are presentation and analytical-focus profiles.

Do not represent them as the named people or organizations providing advice.

Never claim endorsement or affiliation.

Create versioned persona definitions.

Persona settings must be independent from financial calculations and validation.


----
#  Targeted Prompt 9 — Persona-aware AI presentation

Modify the AI presentation layer to use the selected AdvisorPersona.

The persona may influence:

* terminology
* explanation depth
* question framing
* ordering of information
* emphasis
* analytical themes
* educational context

The persona may NOT influence:

* financial facts
* calculations
* research hierarchy
* source requirements
* privacy
* validation
* confidence scoring
* approval rules

Example:

The same recommendation may be presented differently.

Kitces-style:

Focus on retirement impact, tax interactions, opportunity cost, and planning framework.

Edelman-style:

Focus more on longevity, technology implications, estate context, and long-term wealth preservation.

The underlying recommendation, calculations, evidence, and validation must remain identical.

Add automated tests proving persona changes do not change financial outputs.

---
# Targeted Prompt 10 — Recommendation UX

Implement the recommendation experience.

The user should see:

## Recommendation

A clear plain-language action.

## Why

Short explanation.

## Financial Impact

Show impact on:

* cash
* budget
* goals
* debt
* emergency fund
* financial independence where applicable

## What I Considered

Show material alternatives.

## Assumptions

Show assumptions that could change the result.

## Risks

Show meaningful downside.

## Evidence

Show source links and retrieval dates.

## Validation

Show:

"Independently checked"

Then allow:

[Show validation details]

## Confidence

HIGH / MEDIUM / LOW / INSUFFICIENT INFORMATION

## Persona

Show:

"Advisor Style: Retirement Planning"

Do not imply the named person directly provided advice.

The user should be able to switch persona and regenerate the explanation without recalculating the underlying recommendation.

----
# Targeted Prompt 11 — Research-aware AI orchestration

Extend the AI Orchestrator for recommendation workflows.

Flow:

```text
User Question
    ↓
Intent
    ↓
Current Financial Context
    ↓
Scenario Construction
    ↓
Determine Research Requirements
    ↓
Research
    ↓
Candidate Recommendations
    ↓
Independent Validation
    ↓
Final Recommendation
    ↓
Persona-Aware Explanation
```

The orchestrator must know when research is required.

Examples:

"Can we afford a $5,000 vacation?"

Usually financial-engine calculation only.

"What should we do with this $10,000 bonus given current tax rules?"

Requires current tax research.

"Should we keep this credit card?"

Requires current issuer terms and benefits.

"Should we increase retirement contributions?"

May require current plan/tax rules depending on the question.

If research is required and unavailable:

Do not pretend the information is current.

The orchestrator should either:

* ask the user to retry later
* provide clearly limited general guidance
* explain that a verified recommendation cannot currently be produced

----
# Targeted Prompt 12 — Decision journal integration

Integrate recommendations with the Decision Journal.

When a recommendation is generated, record:

* question
* current financial state
* financial snapshot version
* household policy version
* scenarios
* evidence
* recommendation
* alternatives
* validation
* confidence
* persona used
* user decision
* approval state
* timestamp

The decision journal must preserve the exact recommendation context.

Example:

Six months later:

User:
"Why did you recommend putting the bonus into emergency savings?"

The system should be able to retrieve the historical recommendation and explain:

* what the financial state looked like
* what policy was in effect
* what research supported the decision
* what alternatives were considered
* what validation found
* what the household ultimately decided

Do not silently reconstruct historical decisions from current data.

----
# Targeted Prompt 13 — End-to-end recommendation workflows

Create end-to-end tests for these workflows.

## Scenario 1 — Windfall

User:

"We received a $10,000 bonus. What should we do with it?"

Expected:

* current financial snapshot
* goals
* emergency fund
* debt
* cash flow
* scenario analysis
* candidate recommendations
* alternatives
* validation
* final recommendation
* decision journal

## Scenario 2 — Surprise expense

User:

"We have an unexpected $6,000 expense. What should we do?"

Expected:

* liquidity analysis
* emergency fund
* goals
* debt
* credit implications
* funding scenarios
* recommendation
* validation

## Scenario 3 — Credit card annual fee

User:

"Should we keep this card?"

Expected:

* current card terms
* annual fee
* benefits
* household usage
* current evidence
* alternatives
* recommendation
* validation

## Scenario 4 — Tax-sensitive decision

User:

"What should we do with this $20,000 bonus considering taxes?"

Expected:

* relevant current tax research
* explicit tax assumptions
* scenario comparison
* validation
* appropriate uncertainty

## Scenario 5 — Persona switch

Generate recommendation using:

Kitces Style

Then switch to:

Edelman Style

Verify:

* recommendation data is identical
* calculations are identical
* validation is identical
* only presentation changes

## Scenario 6 — Research unavailable

Expected:

* no fabricated current facts
* no unsupported recommendation
* clear explanation

## Scenario 7 — Validator failure

Expected:

* recommendation not released as normal
* user sees meaningful limitation
* candidate alternatives may be shown if safe

----
# Targeted Prompt 14 — Final Slice 5 architecture/safety review

Perform the final Slice 5 review.

Do not add functionality.

Review against:

* AGENTS.md
* PRODUCT_BUILD_CONTRACT.md
* Slices 1–4
* Slice 5 specification
* existing ADRs

## Financial correctness

Verify:

* calculations originate from financial engine
* scenarios are reproducible
* recommendation inputs are versioned
* historical recommendations remain auditable
* stale data is identified

## Research correctness

Verify:

* source hierarchy
* source freshness
* primary-source preference
* claim/evidence mapping
* current-fact verification
* unavailable research behavior

## Recommendation quality

Verify:

* alternatives
* assumptions
* risks
* sensitivity
* confidence
* validator independence
* failed validation handling

## AI safety

Verify:

* no unrestricted SQL
* no arbitrary network access
* no secrets
* no raw statements without controlled permission
* no fabricated research
* no fabricated sources
* no unsupported current facts

## Persona safety

Verify:

* no impersonation
* no false endorsement
* no claim of direct advice
* persona only affects presentation/analytical emphasis
* underlying calculations remain identical
* evidence and validation remain identical

## UX

Verify the spouse can understand:

1. What are you recommending?
2. Why?
3. What alternatives did you consider?
4. What could make this wrong?
5. What evidence supports it?
6. How confident are you?
7. What does it mean for our finances?
8. What do I need to approve?

Classify:

CRITICAL
HIGH
MEDIUM
LOW

Do not fix findings.

Return:

1. findings
2. required fixes
3. financial risks
4. research risks
5. AI risks
6. persona risks
7. UX issues
8. architecture drift
9. technical debt
10. Slice 6 readiness
