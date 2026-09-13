# Slice 5 Validation Fixes — Detailed Execution Plan

**Date**: 2026-09-13  
**Status**: READY FOR IMPLEMENTATION  
**Audience**: Junior developers (step-by-step instructions)  
**Prerequisites**: Understand PRODUCT_BUILD_CONTRACT.md and ADRs 001-006

---

## Overview

Slice 5 validation identified **3 CRITICAL**, **5 HIGH**, and multiple MEDIUM/LOW issues. This plan prioritizes them for execution with specific file locations, line numbers, and step-by-step instructions.

**Key Insight**: Three recommendation representations coexist (full domain, lightweight orchestrator, UI-constructed). The fix integrates them into a single, typed pipeline.

---

## PHASE 0: Safety Verification (Before Starting)

### Task P0.1: Verify Test Suite Runs
```bash
npm run test:unit
npm run test:integration
npm run test:e2e
```
**Expected**: All tests pass (or document known failures)  
**Time**: 5-10 min  
**Owner**: Junior dev

---

## PHASE 1: CRITICAL Fixes (Must Complete Before Slice 6)

### 🔴 CRITICAL-1: Wire Typed Pipeline into Live Orchestrator

**Problem**: Production bypasses the independent recommendation pipeline. The live path extracts arbitrary strings from LLM response and declares PASS when a candidate exists.

**Files Affected**:
- `packages/ai/recommendation-workflow.ts` (lines 25-67)
- `packages/ai/ai-orchestrator.ts` (lines 295-320, 376-435)
- `packages/ai/recommendation-validator.ts` (lines 142-240)

**Steps**:

#### Step 1.1: Understand Current Flow (5 min)
Read these files to understand how recommendations currently work:
1. [recommendation-workflow.ts](packages/ai/recommendation-workflow.ts#L25-L67) — Current recommendation workflow
2. [ai-orchestrator.ts](packages/ai/ai-orchestrator.ts#L295-L320) — Where recommendations are built
3. [ai-orchestrator.ts](packages/ai/ai-orchestrator.ts#L376-L435) — Grounding and fallback logic

**Acceptance Criteria**:
- [ ] Can explain: current flow extracts strings from LLM response
- [ ] Can explain: validation status is PASS if any candidate exists
- [ ] Can explain: no invocation of scenario builder or validator

#### Step 1.2: Review Domain Pipeline (5 min)
Read these files to understand the typed pipeline that should be used:
1. [packages/domain/recommendation-builder.ts](packages/domain/recommendation-builder.ts) — Builds candidates from scenarios
2. [packages/domain/recommendation-validator.ts](packages/domain/recommendation-validator.ts) — Validates recommendations
3. [packages/contracts/recommendation.ts](packages/contracts/recommendation.ts) — Typed contract

**Acceptance Criteria**:
- [ ] Understand: scenario → candidate → validation → selection pipeline
- [ ] Understand: validator recalculates figures
- [ ] Understand: FAIL validation blocks delivery

#### Step 1.3: Create Wrapper Function (15 min)
Create new file: `packages/ai/recommendation-orchestrator.ts`

This function will orchestrate the full pipeline:

```typescript
import { buildToolBackedRecommendationWorkflow } from "./recommendation-workflow";
import { buildRecommendationPipeline } from "@house-fin/domain";
import { EntityId, FinancialSnapshot, Recommendation } from "@house-fin/contracts";

export async function orchestrateRecommendation(
  toolResults: Record<string, unknown>,
  financialSnapshot: FinancialSnapshot,
  userMessage: string,
  householdId: EntityId,
  memberId: EntityId,
  policyVersion: number
): Promise<{
  recommendation: Recommendation | null;
  validationStatus: "PASS" | "PASS_WITH_WARNINGS" | "FAIL" | "INSUFFICIENT_INFORMATION";
  fallbackMessage?: string;
}> {
  // 1. Build scenarios from tools and snapshot
  const workflow = buildToolBackedRecommendationWorkflow({
    toolResults,
    userMessage,
    householdId,
    memberId,
    policyVersion,
  });

  if (!workflow.scenarios || workflow.scenarios.length === 0) {
    return {
      recommendation: null,
      validationStatus: "INSUFFICIENT_INFORMATION",
      fallbackMessage: "Could not construct scenarios from available data.",
    };
  }

  // 2. Generate candidates from scenarios
  const candidates = workflow.candidates;
  if (!candidates || candidates.length === 0) {
    return {
      recommendation: null,
      validationStatus: "INSUFFICIENT_INFORMATION",
      fallbackMessage: "No viable recommendation candidates could be generated.",
    };
  }

  // 3. Validate each candidate
  const validations = workflow.validations;
  const passedValidations = validations.filter(v => v.status === "PASS" || v.status === "PASS_WITH_WARNINGS");
  
  if (passedValidations.length === 0) {
    return {
      recommendation: null,
      validationStatus: "FAIL",
      fallbackMessage: workflow.validation.summary || "Recommendation failed validation checks.",
    };
  }

  // 4. Select best candidate
  const finalRec = workflow.finalRecommendation;
  if (!finalRec) {
    return {
      recommendation: null,
      validationStatus: workflow.validation.status,
      fallbackMessage: "Could not select a final recommendation.",
    };
  }

  return {
    recommendation: finalRec,
    validationStatus: workflow.validation.status,
  };
}
```

**Acceptance Criteria**:
- [ ] Function compiles without errors
- [ ] Function takes typed inputs
- [ ] Function returns typed outputs
- [ ] Function enforces pipeline order

#### Step 1.4: Update ai-orchestrator.ts to Use Pipeline (30 min)
File: [packages/ai/ai-orchestrator.ts](packages/ai/ai-orchestrator.ts#L295-L320)

**Current code** (around line 295):
```typescript
const recommendationWorkflow = isRecommendationWorkflow(request.workflowType, researchRequirement)
    ? buildToolBackedRecommendationWorkflow({...})
    : undefined;
```

**Replace with** (call your new wrapper):
```typescript
let recommendationResult;
if (isRecommendationWorkflow(request.workflowType, researchRequirement)) {
  recommendationResult = await orchestrateRecommendation(
    toolResults,
    financialContext.snapshot,
    continuity.resolvedMessage,
    request.householdId,
    request.memberId,
    request.householdPolicyVersion ?? 1
  );
} else {
  recommendationResult = { recommendation: null, validationStatus: "INSUFFICIENT_INFORMATION" };
}
```

**Acceptance Criteria**:
- [ ] Compilation succeeds
- [ ] No errors when `isRecommendationWorkflow` is true
- [ ] Full pipeline is called (not just scenario building)

#### Step 1.5: Update Failure Handling (15 min)
File: [packages/ai/ai-orchestrator.ts](packages/ai/ai-orchestrator.ts#L376-L435)

**Current code** (around line 376):
```typescript
if (recommendationWorkflow && !recommendationWorkflow.finalRecommendation) {
    return this.buildFailureResponse(...);
}
```

**Replace with**:
```typescript
if (recommendationResult && !recommendationResult.recommendation) {
    // Validation failed or insufficient data—return graceful failure
    return this.buildFailureResponse(
        request,
        plan,
        toolResults,
        buildAdvisorFailure(AdvisorFailureCategory.RECOMMENDATION_UNAVAILABLE),
        startTime,
        {
            validationStatus: recommendationResult.validationStatus,
            reason: recommendationResult.fallbackMessage,
        }
    );
}

// Validation passed—deliver recommendation
const recommendation = recommendationResult.recommendation;
```

**Acceptance Criteria**:
- [ ] FAIL validation does not deliver recommendation
- [ ] INSUFFICIENT_INFORMATION returns graceful failure
- [ ] PASS/PASS_WITH_WARNINGS allows delivery

#### Step 1.6: Update Journal Recording (15 min)
File: [packages/ai/ai-orchestrator.ts](packages/ai/ai-orchestrator.ts) (journal section)

**Add to journal**:
```typescript
const journalEntry = await decisionJournalService.recordRecommendation({
  householdId: request.householdId,
  userIntent: request.userMessage,
  scenarios: workflow.scenarios,
  research: research.evidence,
  candidates: workflow.candidates,
  validation: recommendationResult.recommendation ? workflow.validation : { status: "FAIL" },
  finalRecommendation: recommendationResult.recommendation,
  policyVersion: request.householdPolicyVersion ?? 1,
  snapshotId: financialContext.snapshot.id,
});
```

**Acceptance Criteria**:
- [ ] Journal includes validation details
- [ ] Journal includes FAIL status when validation fails
- [ ] Recommendation ID is persisted

---

### 🔴 CRITICAL-2: Remove UI-Synthesized Validation

**Problem**: UI presents synthetic validation as "Independently checked." Assumptions, risks, confidence are hardcoded instead of returned by recommendation engine.

**Files Affected**:
- [apps/web/components/AdvisorResponseCard.tsx](apps/web/components/AdvisorResponseCard.tsx#L49-L61) — Hardcoded validation
- [apps/web/components/AdvisorResponseCard.tsx](apps/web/components/AdvisorResponseCard.tsx#L166-L195) — Hardcoded assumptions/risks
- [apps/web/components/RecommendationExperience.tsx](apps/web/components/RecommendationExperience.tsx#L174-L204) — Hardcoded confidence

**Steps**:

#### Step 2.1: Create TypeScript Contract for UI Recommendation (10 min)
File: [packages/contracts/ui-recommendation.ts](packages/contracts/ui-recommendation.ts) (NEW)

```typescript
/**
 * Recommendation as returned from API to UI.
 * All fields come from domain layer; UI never synthesizes validation or confidence.
 */
export interface UIRecommendation {
  // Identification
  id: EntityId;
  type: RecommendationType;
  title: string;
  summary: string;

  // Recommendation content
  recommendedAction: string;
  alternatives: {
    title: string;
    description: string;
    rationale: string;
    isPreferred: boolean;
  }[];

  // Basis
  snapshotId: EntityId;
  snapshotVersion: number;
  policyVersion: number;

  // Evidence
  evidence: {
    claim: string;
    sourceName: string;
    sourceTier: string;
    sourceUrl?: string;
    retrievalDate: Date;
    freshness: string;
  }[];

  // Analysis
  assumptions: {
    key: string;
    value: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    reason: string;
  }[];

  risks: {
    description: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    mitigations: string[];
  }[];

  // Validation
  validationStatus: "PASS" | "PASS_WITH_WARNINGS" | "FAIL" | "INSUFFICIENT_INFORMATION";
  validationSummary: string;
  validationDetails: string;

  // Confidence
  confidence: "HIGH" | "MEDIUM" | "LOW";
  confidenceReasoning: string;

  // Approval
  requiresApproval: boolean;
  approvalStatus: "PROPOSED" | "APPROVED" | "DECLINED" | "EXPIRED";
}
```

**Acceptance Criteria**:
- [ ] Contract compiles
- [ ] All fields come from domain, not UI
- [ ] No hardcoded values

#### Step 2.2: Update API Route to Return Full Recommendation (20 min)
File: [apps/api/src/routes/recommendations.ts](apps/api/src/routes/recommendations.ts) (GET endpoint)

**Current code** (may not exist yet):
```typescript
router.get("/api/recommendations/:id", async (req, res) => {
  // TODO: Return recommendation from database
});
```

**Implement**:
```typescript
router.get("/api/recommendations/:id", async (req, res) => {
  const { id } = req.params;
  const householdId = req.user.householdId; // From auth

  try {
    // Load recommendation from database
    const recommendation = await recommendationRepository.getById(id, householdId);
    
    if (!recommendation) {
      return res.status(404).json({ error: "Recommendation not found" });
    }

    // Verify household access
    if (recommendation.householdId !== householdId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Transform to UI contract
    const uiRecommendation: UIRecommendation = {
      id: recommendation.id,
      type: recommendation.intent,
      title: recommendation.title,
      summary: recommendation.summary,
      recommendedAction: recommendation.recommendedAction,
      alternatives: recommendation.alternatives,
      snapshotId: recommendation.financialSnapshotId,
      snapshotVersion: recommendation.financialSnapshotVersion,
      policyVersion: recommendation.policyVersion,
      evidence: recommendation.evidence.map(e => ({
        claim: e.claim,
        sourceName: e.source.name,
        sourceTier: e.sourceTier,
        sourceUrl: e.sourceUrl,
        retrievalDate: e.retrievalDate,
        freshness: e.freshness,
      })),
      assumptions: recommendation.assumptions,
      risks: recommendation.risks,
      validationStatus: recommendation.validationResult.status,
      validationSummary: recommendation.validationResult.summary,
      validationDetails: JSON.stringify(recommendation.validationResult.details),
      confidence: recommendation.confidence,
      confidenceReasoning: recommendation.confidenceReasoning,
      requiresApproval: recommendation.approvalRequired,
      approvalStatus: recommendation.approvalStatus,
    };

    return res.json(uiRecommendation);
  } catch (error) {
    console.error("Error fetching recommendation:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

**Acceptance Criteria**:
- [ ] Route returns full recommendation from database
- [ ] All validation/confidence/assumptions come from domain
- [ ] Authorization is enforced

#### Step 2.3: Update AdvisorResponseCard to Use Domain Data (30 min)
File: [apps/web/components/AdvisorResponseCard.tsx](apps/web/components/AdvisorResponseCard.tsx)

**Current code** (lines 49-61, hardcoded validation):
```typescript
const validation = {
  status: "PASS",
  summary: "Independently checked",
  details: [
    { category: "MATH", status: "PASS", description: "Calculations verified" },
  ],
};
```

**Replace with**:
```typescript
import { UIRecommendation } from "@house-fin/contracts";

interface AdvisorResponseCardProps {
  recommendation: UIRecommendation;
  onApprove?: () => void;
  onDecline?: () => void;
}

export function AdvisorResponseCard({ recommendation, onApprove, onDecline }: AdvisorResponseCardProps) {
  // Use domain-provided validation, never synthesize
  const validation = {
    status: recommendation.validationStatus,
    summary: recommendation.validationSummary,
    details: recommendation.validationDetails ? JSON.parse(recommendation.validationDetails) : [],
  };

  const confidence = {
    level: recommendation.confidence,
    reasoning: recommendation.confidenceReasoning,
  };

  const assumptions = recommendation.assumptions;
  const risks = recommendation.risks;
  
  return (
    <div className="recommendation-card">
      <h2>{recommendation.title}</h2>
      <p>{recommendation.summary}</p>
      
      <section className="validation">
        <h3>Independent Validation</h3>
        <p>Status: {validation.status}</p>
        <p>{validation.summary}</p>
        {validation.details.map((detail, idx) => (
          <div key={idx} className={`detail status-${detail.status}`}>
            <strong>{detail.category}</strong>: {detail.description}
          </div>
        ))}
      </section>

      <section className="confidence">
        <h3>Confidence</h3>
        <p>Level: {confidence.level}</p>
        <p>{confidence.reasoning}</p>
      </section>

      <section className="assumptions">
        <h3>Assumptions</h3>
        {assumptions.map((a, idx) => (
          <div key={idx}>
            <strong>{a.key}</strong>: {a.value} (Confidence: {a.confidence})
            <p>{a.reason}</p>
          </div>
        ))}
      </section>

      <section className="risks">
        <h3>Risks</h3>
        {risks.map((r, idx) => (
          <div key={idx} className={`risk severity-${r.severity}`}>
            <strong>{r.description}</strong>
            {r.mitigations && r.mitigations.length > 0 && (
              <p>Mitigations: {r.mitigations.join(", ")}</p>
            )}
          </div>
        ))}
      </section>

      {recommendation.requiresApproval && (
        <div className="approval-actions">
          <button onClick={onApprove}>Approve</button>
          <button onClick={onDecline}>Decline</button>
        </div>
      )}
    </div>
  );
}
```

**Acceptance Criteria**:
- [ ] No hardcoded validation
- [ ] All data comes from `recommendation` prop
- [ ] Compiles without errors
- [ ] Validation status displayed accurately

#### Step 2.4: Update RecommendationExperience Component (20 min)
File: [apps/web/components/RecommendationExperience.tsx](apps/web/components/RecommendationExperience.tsx#L174-L204)

**Replace hardcoded "Independently checked" language** with domain-provided validation status.

**Current bad code**:
```typescript
const validation = {
  status: "PASS",
  message: "Independently checked",
};
```

**Fix**: Call your API endpoint to get full recommendation with validation data.

```typescript
import { UIRecommendation } from "@house-fin/contracts";

export function RecommendationExperience() {
  const [recommendation, setRecommendation] = useState<UIRecommendation | null>(null);

  useEffect(() => {
    // Fetch from API (not hardcoded)
    fetch(`/api/recommendations/${recommendationId}`)
      .then(r => r.json())
      .then(data => setRecommendation(data))
      .catch(err => console.error("Failed to load recommendation:", err));
  }, [recommendationId]);

  if (!recommendation) return <div>Loading...</div>;

  // Render using domain data, not hardcoded values
  return (
    <div>
      <h2>{recommendation.title}</h2>
      <p>Validation: {recommendation.validationStatus}</p>
      <p>{recommendation.validationSummary}</p>
      {/* ... rest of UI */}
    </div>
  );
}
```

**Acceptance Criteria**:
- [ ] Recommendation is loaded from API
- [ ] Validation comes from domain, not hardcoded
- [ ] Component works with real recommendation data

---

### 🔴 CRITICAL-3: Grounding Failure is Consistent

**Problem**: Ungrounded LLM response is replaced with fallback, but response is marked successful with PASS validation.

**File**: [packages/ai/ai-orchestrator.ts](packages/ai/ai-orchestrator.ts#L376-L435)

**Steps**:

#### Step 3.1: Understand Grounding (5 min)
Read: [packages/ai/response-grounding.ts](packages/ai/response-grounding.ts)

**Question to answer**: What does `groundResponse()` return when grounding fails?

#### Step 3.2: Update Journal Status for Grounding Failure (10 min)
File: [packages/ai/ai-orchestrator.ts](packages/ai/ai-orchestrator.ts) (in recommendation response path)

**Current logic**:
```typescript
const groundedResponse = groundResponse(recommendation, research, tools);
if (!groundedResponse.isGrounded) {
  // Use fallback but still mark as PASS
  return buildSuccessResponse({...});
}
```

**Fix**: Mark journal as FAIL if grounding fails

```typescript
const groundedResponse = groundResponse(recommendation, research, tools);
if (!groundedResponse.isGrounded) {
  // Record in journal that grounding failed
  await decisionJournalService.recordFailure({
    householdId,
    recommendationId: recommendation.id,
    stage: "GROUNDING",
    reason: "LLM output could not be grounded in verified data",
    fallbackMessage: groundedResponse.fallback,
  });

  // Return graceful failure, not success with fallback
  return this.buildFailureResponse(
    request,
    plan,
    toolResults,
    buildAdvisorFailure(AdvisorFailureCategory.RECOMMENDATION_GROUNDING_FAILED),
    startTime,
    { reason: "Recommendation could not be grounded in verified information" }
  );
}
```

**Acceptance Criteria**:
- [ ] Grounding failure is recorded in journal
- [ ] Grounding failure returns AdvisorFailure, not success
- [ ] User sees consistent message

---

## PHASE 2: HIGH Priority Fixes

### 🟠 HIGH-1: Move Financial Calculations from AI to Domain

**Problem**: simulatePurchase calculates affordability, emergency-fund floors, financing in AI package, violating domain-service requirement.

**File**: [packages/ai/tool-implementations.ts](packages/ai/tool-implementations.ts#L39-L40, #L117-L149)

**Steps**:

#### Step 1.1: Create Financial Simulation Service (30 min)
File: [packages/domain/financial-simulator.ts](packages/domain/financial-simulator.ts) (NEW)

```typescript
import { Money, Scenario, FinancialSnapshot, Budget } from "@house-fin/contracts";
import { calculateEmergencyFundRequirement } from "./financial-rules";
import { calculateAffordability } from "./financial-rules";

export class FinancialSimulator {
  constructor(private policy: HouseholdPolicy) {}

  /**
   * Simulate a purchase within the current financial context.
   * Returns affordability assessment and impact on financial health.
   */
  simulatePurchase(
    snapshot: FinancialSnapshot,
    amount: Money,
    description: string,
    method: "cash" | "credit" | "loan"
  ): {
    affordable: boolean;
    reason: string;
    impactOnCash: Money;
    impactOnDebt: Money;
    newCashPosition: Money;
    emergencyFundStatus: "healthy" | "warning" | "critical";
    emergencyFundGap?: Money;
  } {
    // Calculate emergency fund requirement from policy
    const monthlyExpenses = snapshot.monthlyExpenses;
    const emergencyFundMonths = this.policy.emergencyFundMonths || 3;
    const emergencyFundGoal = new Money(
      monthlyExpenses.amount * emergencyFundMonths,
      monthlyExpenses.currency
    );

    // Calculate current emergency fund
    const currentEmergencyFund = snapshot.cash;

    // Assess affordability
    const isAffordable = amount.amount <= currentEmergencyFund.amount;

    // Simulate impact
    let newCash = currentEmergencyFund;
    let newDebt = snapshot.totalDebt;

    if (method === "cash") {
      newCash = new Money(
        currentEmergencyFund.amount - amount.amount,
        currentEmergencyFund.currency
      );
    } else if (method === "loan") {
      newDebt = new Money(
        snapshot.totalDebt.amount + amount.amount,
        snapshot.totalDebt.currency
      );
    }

    // Check emergency fund status after purchase
    const emergencyFundGap =
      newCash.amount < emergencyFundGoal.amount
        ? new Money(emergencyFundGoal.amount - newCash.amount, newCash.currency)
        : undefined;

    const emergencyFundStatus =
      newCash.amount >= emergencyFundGoal.amount
        ? "healthy"
        : newCash.amount >= emergencyFundGoal.amount * 0.5
          ? "warning"
          : "critical";

    return {
      affordable: isAffordable,
      reason: isAffordable
        ? `Purchase of ${amount} is within cash available.`
        : `Purchase of ${amount} exceeds cash available by ${new Money(amount.amount - currentEmergencyFund.amount, amount.currency)}.`,
      impactOnCash: new Money(
        newCash.amount - currentEmergencyFund.amount,
        newCash.currency
      ),
      impactOnDebt: new Money(
        newDebt.amount - snapshot.totalDebt.amount,
        newDebt.currency
      ),
      newCashPosition: newCash,
      emergencyFundStatus,
      emergencyFundGap,
    };
  }

  /**
   * Simulate a financing decision (e.g., loan for purchase).
   * Returns impact on affordability and financial health.
   */
  simulateFinancing(
    snapshot: FinancialSnapshot,
    loanAmount: Money,
    interestRate: number, // annual, as decimal (0.05 = 5%)
    termMonths: number
  ): {
    monthlyPayment: Money;
    totalInterest: Money;
    totalCost: Money;
    affordableWithinBudget: boolean;
    impactOnCashFlow: Money;
  } {
    // Use deterministic loan calculation (not assumed values)
    const monthlyRate = interestRate / 12;
    const numerator = loanAmount.amount * monthlyRate * Math.pow(1 + monthlyRate, termMonths);
    const denominator = Math.pow(1 + monthlyRate, termMonths) - 1;
    const monthlyPayment = Math.round(numerator / denominator);

    const totalPaid = monthlyPayment * termMonths;
    const totalInterest = totalPaid - loanAmount.amount;
    const totalCost = loanAmount.amount + totalInterest;

    // Check if monthly payment fits within budget surplus
    const currentSurplus = snapshot.monthlySurplus;
    const affordableWithinBudget = monthlyPayment <= currentSurplus.amount;

    const impactOnCashFlow = new Money(-monthlyPayment, loanAmount.currency);

    return {
      monthlyPayment: new Money(monthlyPayment, loanAmount.currency),
      totalInterest: new Money(totalInterest, loanAmount.currency),
      totalCost: new Money(totalCost, loanAmount.currency),
      affordableWithinBudget,
      impactOnCashFlow,
    };
  }
}
```

**Acceptance Criteria**:
- [ ] Financial calculations use integer arithmetic
- [ ] No assumed interest rates (must be passed in)
- [ ] Calculations are deterministic and testable
- [ ] Compiles without errors

#### Step 1.2: Create Tests for Financial Simulator (20 min)
File: [tests/unit/domain/financial-simulator.test.ts](tests/unit/domain/financial-simulator.test.ts) (NEW)

```typescript
import { FinancialSimulator } from "@house-fin/domain";
import { Money } from "@house-fin/contracts";

describe("FinancialSimulator", () => {
  const policy = {
    emergencyFundMonths: 3,
  };
  const simulator = new FinancialSimulator(policy);

  describe("simulatePurchase", () => {
    it("should mark purchase as affordable if cash is sufficient", () => {
      const snapshot = {
        cash: new Money(500000, "USD"), // $5000
        monthlyExpenses: new Money(300000, "USD"), // $3000
        totalDebt: new Money(0, "USD"),
        monthlySurplus: new Money(100000, "USD"),
      };

      const result = simulator.simulatePurchase(
        snapshot,
        new Money(100000, "USD"), // $1000
        "Test purchase",
        "cash"
      );

      expect(result.affordable).toBe(true);
      expect(result.impactOnCash.amount).toBe(-100000);
    });

    it("should mark purchase as unaffordable if cash is insufficient", () => {
      const snapshot = {
        cash: new Money(500000, "USD"),
        monthlyExpenses: new Money(300000, "USD"),
        totalDebt: new Money(0, "USD"),
        monthlySurplus: new Money(100000, "USD"),
      };

      const result = simulator.simulatePurchase(
        snapshot,
        new Money(600000, "USD"), // $6000 > $5000 cash
        "Test purchase",
        "cash"
      );

      expect(result.affordable).toBe(false);
    });

    it("should detect emergency fund gap", () => {
      const snapshot = {
        cash: new Money(500000, "USD"), // $5000
        monthlyExpenses: new Money(200000, "USD"), // $2000
        totalDebt: new Money(0, "USD"),
        monthlySurplus: new Money(100000, "USD"),
      };

      const result = simulator.simulatePurchase(
        snapshot,
        new Money(300000, "USD"), // Purchase $3000, leaving $2000
        "Test purchase",
        "cash"
      );

      // Emergency fund goal = $2000 * 3 = $6000
      // After purchase = $2000, which is < $6000
      expect(result.emergencyFundStatus).toBe("critical");
      expect(result.emergencyFundGap?.amount).toBe(400000); // $4000 gap
    });
  });

  describe("simulateFinancing", () => {
    it("should calculate monthly payment correctly", () => {
      const snapshot = {
        cash: new Money(500000, "USD"),
        monthlyExpenses: new Money(300000, "USD"),
        totalDebt: new Money(0, "USD"),
        monthlySurplus: new Money(200000, "USD"),
      };

      const result = simulator.simulateFinancing(
        snapshot,
        new Money(1200000, "USD"), // $12,000 loan
        0.05, // 5% annual
        24 // 24 months
      );

      // Verify is deterministic and no assumed values
      expect(result.monthlyPayment.amount).toBeGreaterThan(0);
      expect(result.totalInterest.amount).toBeGreaterThan(0);
      expect(result.totalCost.amount).toBe(result.monthlyPayment.amount * 24);
    });
  });
});
```

**Acceptance Criteria**:
- [ ] All tests pass
- [ ] No hardcoded interest rates (6%, 18%)
- [ ] Tests verify deterministic behavior

#### Step 1.3: Update tool-implementations.ts to Call Domain Service (20 min)
File: [packages/ai/tool-implementations.ts](packages/ai/tool-implementations.ts)

**Current code** (lines 117-149, hardcoded calculations):
```typescript
export async function simulatePurchase(amount, method) {
  // Hardcoded emergency fund = 3 months
  // Hardcoded loan interest = 18%
  // ...calculations...
}
```

**Replace with**:
```typescript
import { FinancialSimulator } from "@house-fin/domain";

export async function simulatePurchase(
  amount: Money,
  method: "cash" | "credit" | "loan",
  snapshot: FinancialSnapshot,
  policy: HouseholdPolicy
) {
  const simulator = new FinancialSimulator(policy);
  return simulator.simulatePurchase(snapshot, amount, "", method);
}

export async function simulateFinancing(
  loanAmount: Money,
  interestRate: number,
  termMonths: number,
  snapshot: FinancialSnapshot,
  policy: HouseholdPolicy
) {
  const simulator = new FinancialSimulator(policy);
  return simulator.simulateFinancing(snapshot, loanAmount, interestRate, termMonths);
}
```

**Acceptance Criteria**:
- [ ] No hardcoded financial constants
- [ ] All calculations delegated to domain service
- [ ] Tests still pass

---

### 🟠 HIGH-2: Add Allowlisted Production Research Provider

**Problem**: Server constructs AIOrchestrator without RecommendationResearchProvider; every recognized tax, issuer, retirement-rule, or current-rate request fails closed.

**File**: [apps/api/src/server.ts](apps/api/src/server.ts#L778-L783)

**Steps**:

#### Step 2.1: Review Research Architecture (10 min)
Read: [packages/ai/recommendation-research.ts](packages/ai/recommendation-research.ts#L32-L42)

**Question**: What interface does RecommendationResearchProvider implement?

#### Step 2.2: Create Allowlist Configuration (10 min)
File: [packages/ai/research-allowlist.ts](packages/ai/research-allowlist.ts) (NEW)

```typescript
/**
 * Approved research sources for external queries.
 * Maintains privacy boundary: only specific, pre-approved sources are accessible.
 */

export const RESEARCH_ALLOWLIST = {
  // Federal Reserve sources (TIER_1_GOVERNMENT)
  FED_FUNDS_RATE: {
    name: "Federal Reserve",
    tier: "TIER_1_GOVERNMENT",
    endpoint: "https://www.federalreserve.gov",
    query: "current_fed_funds_rate",
  },
  FED_PRIME_RATE: {
    name: "Federal Reserve",
    tier: "TIER_1_GOVERNMENT",
    endpoint: "https://www.federalreserve.gov",
    query: "prime_rate",
  },

  // IRS sources (TIER_1_GOVERNMENT)
  IRS_STANDARD_DEDUCTION: {
    name: "IRS",
    tier: "TIER_1_GOVERNMENT",
    endpoint: "https://www.irs.gov",
    query: "standard_deduction",
  },
  IRS_CONTRIBUTION_LIMITS: {
    name: "IRS",
    tier: "TIER_1_GOVERNMENT",
    endpoint: "https://www.irs.gov",
    query: "retirement_contribution_limits",
  },

  // FDIC sources (TIER_1_GOVERNMENT)
  FDIC_INSURANCE_LIMIT: {
    name: "FDIC",
    tier: "TIER_1_GOVERNMENT",
    endpoint: "https://www.fdic.gov",
    query: "deposit_insurance_limit",
  },

  // Credit issuer terms (TIER_2_PROVIDER) — requires verification
  // Note: Specific card/account terms must be verified by human before adding
};

/**
 * Verify that a research request is allowed.
 */
export function isResearchAllowed(claim: string): boolean {
  // Only allow specific, pre-approved claims
  return Object.values(RESEARCH_ALLOWLIST).some(source =>
    source.query.toLowerCase().includes(claim.toLowerCase())
  );
}

/**
 * Get allowed sources for a claim.
 */
export function getAllowedSourcesForClaim(claim: string) {
  return Object.values(RESEARCH_ALLOWLIST).filter(source =>
    source.query.toLowerCase().includes(claim.toLowerCase())
  );
}
```

**Acceptance Criteria**:
- [ ] Allowlist is specific and pre-approved
- [ ] No arbitrary external sources
- [ ] Tier information is included
- [ ] Compiles without errors

#### Step 2.3: Implement Research Provider (30 min)
File: [packages/ai/anthropic-research-provider.ts](packages/ai/anthropic-research-provider.ts) (NEW)

```typescript
import { RecommendationResearchProvider, Evidence, SourceTier } from "@house-fin/contracts";
import { isResearchAllowed, getAllowedSourcesForClaim } from "./research-allowlist";

export class AnthropicResearchProvider implements RecommendationResearchProvider {
  constructor(private client: Anthropic) {}

  async researchClaim(claim: string): Promise<Evidence[]> {
    // Step 1: Verify claim is on allowlist
    if (!isResearchAllowed(claim)) {
      console.warn(`Research blocked: claim not on allowlist: ${claim}`);
      return [];
    }

    const allowedSources = getAllowedSourcesForClaim(claim);
    if (allowedSources.length === 0) {
      return [];
    }

    // Step 2: Query LLM for current information (not opinion)
    const response = await this.client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 500,
      system: `You are a research assistant. Answer only factual, current information.
        Do not provide analysis or opinion.
        Include the specific source where the information comes from.
        Format: [FACT] The specific fact [SOURCE] URL or official source name`,
      messages: [
        {
          role: "user",
          content: `What is the current value of: ${claim}? 
          Sources are limited to: ${allowedSources.map(s => s.name).join(", ")}
          Provide only the fact and its official source.`,
        },
      ],
    });

    // Step 3: Parse response and create evidence
    const content = response.content[0].type === "text" ? response.content[0].text : "";
    const evidence = this.parseResearchResponse(content, claim, allowedSources);

    return evidence;
  }

  private parseResearchResponse(
    content: string,
    claim: string,
    allowedSources: typeof RESEARCH_ALLOWLIST[keyof typeof RESEARCH_ALLOWLIST][]
  ): Evidence[] {
    const facts = [];

    // Parse [FACT]...[SOURCE]... patterns
    const factRegex = /\[FACT\](.*?)\[SOURCE\](.*?)(?=\[FACT\]|$)/gs;
    let match;

    while ((match = factRegex.exec(content)) !== null) {
      const factText = match[1].trim();
      const sourceText = match[2].trim();

      // Verify source is on allowlist
      const source = allowedSources.find(
        s => sourceText.includes(s.name) || sourceText.includes(s.endpoint)
      );
      if (!source) continue;

      facts.push({
        id: generateId(),
        claim,
        sourceText: factText,
        sourceName: source.name,
        sourceTier: source.tier as SourceTier,
        sourceUrl: source.endpoint,
        retrievalDate: new Date(),
        freshness: "CURRENT",
        confidence: "HIGH",
        verification: "VERIFIED",
      });
    }

    return facts;
  }
}
```

**Acceptance Criteria**:
- [ ] Only allowed claims are researched
- [ ] Response is parsed without fabrication
- [ ] Evidence includes source tier
- [ ] Returns empty array if research not allowed

#### Step 2.4: Update server.ts to Initialize Provider (15 min)
File: [apps/api/src/server.ts](apps/api/src/server.ts#L778-L783)

**Current code**:
```typescript
const orchestrator = new AIOrchestrator({
  // ... other options
  // researchProvider not initialized
});
```

**Update**:
```typescript
import { AnthropicResearchProvider } from "@house-fin/ai";

const orchestrator = new AIOrchestrator({
  // ... other options
  researchProvider: process.env.ENABLE_RESEARCH === "true"
    ? new AnthropicResearchProvider(anthropicClient)
    : undefined,
});
```

**Add environment check**:
```bash
# .env (or similar)
ENABLE_RESEARCH=true  # Only in production/staging
```

**Acceptance Criteria**:
- [ ] Research provider is initialized
- [ ] Only initializes if ENABLE_RESEARCH=true
- [ ] No crashes if provider is undefined
- [ ] Tests still pass

---

### 🟠 HIGH-3: Strengthen Current-Fact Classification

**Problem**: Regex gaps miss current product questions. "Should I keep my Amex?" does not match card, allowing claims to reach LLM without verification.

**File**: [packages/ai/recommendation-research.ts](packages/ai/recommendation-research.ts#L67-L88)

**Steps**:

#### Step 3.1: Expand Current-Fact Regex (15 min)
File: [packages/ai/recommendation-research.ts](packages/ai/recommendation-research.ts)

**Current code** (lines 67-88, narrow patterns):
```typescript
const currentFactRegex = /interest rate|APR|fee|credit limit|balance transfer/i;
if (currentFactRegex.test(userMessage)) {
  return "CURRENT_FACT_REQUIRED";
}
```

**Replace with comprehensive patterns**:
```typescript
const CURRENT_FACT_PATTERNS = {
  // Credit cards
  CREDIT_CARD: /(?:credit|debit|amex|visa|mastercard|discover|card|cc)\s+(?:rate|apr|fee|limit|offer|term)/i,
  KEEP_CARD: /(?:keep|close|cancel)\s+(?:my\s+)?(?:credit|debit|amex|visa|mastercard|discover|card|cc)/i,
  NEW_CARD: /(?:apply|open)\s+(?:for\s+)?(?:a\s+)?(?:new\s+)?(?:credit|debit|card|cc)/i,
  CARD_BENEFIT: /(?:rewards|cash back|travel|sign.up bonus|annual fee|waive|card benefit)/i,

  // Interest rates
  RATE: /interest\s+rate|apr|apy|yield|rate/i,
  FED_RATE: /federal\s+(?:funds|prime|rate)/i,

  // Loan terms
  LOAN: /loan\s+(?:rate|term|payment|offer)/i,
  MORTGAGE: /mortgage|refinance|home\s+loan|rate/i,

  // Investment/retirement
  RETIREMENT: /401k|roth|ira|contribution\s+limit|match|deduction/i,
  INVESTMENT: /stock|bond|etf|fund|dividend|return/i,

  // Savings
  SAVINGS: /savings\s+account|cd|certificate\s+of\s+deposit|yield/i,
  FDIC: /fdic|insurance|protected/i,

  // Tax
  TAX: /tax|deduction|credit|refund|withholding/i,
  STANDARD_DEDUCTION: /standard\s+deduction|itemize/i,

  // Current financial rules
  POLICY: /require|allow|limit|maximum|minimum|eligible/i,
};

export function detectCurrentFactRequirement(message: string): "CURRENT_FACT_REQUIRED" | "NOT_REQUIRED" {
  // Check all patterns
  const patterns = Object.values(CURRENT_FACT_PATTERNS);
  for (const pattern of patterns) {
    if (pattern.test(message)) {
      return "CURRENT_FACT_REQUIRED";
    }
  }
  return "NOT_REQUIRED";
}
```

**Acceptance Criteria**:
- [ ] Covers credit cards, rates, loans, retirement, savings, taxes
- [ ] "Should I keep my Amex?" is now detected
- [ ] No false positives on general financial questions
- [ ] All tests pass

#### Step 3.2: Add Tests for Current-Fact Detection (15 min)
File: [tests/unit/ai/recommendation-research.test.ts](tests/unit/ai/recommendation-research.test.ts)

```typescript
import { detectCurrentFactRequirement } from "@house-fin/ai";

describe("detectCurrentFactRequirement", () => {
  it("should detect credit card questions", () => {
    const cases = [
      "Should I keep my Amex?",
      "What's the APR on my Visa?",
      "Is a 2% rewards card worth it?",
      "Should I close my old card?",
      "Should I apply for a new credit card?",
    ];

    for (const msg of cases) {
      expect(detectCurrentFactRequirement(msg)).toBe("CURRENT_FACT_REQUIRED");
    }
  });

  it("should detect interest rate questions", () => {
    const cases = [
      "What's the current Fed rate?",
      "What's the 30-year mortgage rate?",
      "What's the interest rate on savings accounts?",
    ];

    for (const msg of cases) {
      expect(detectCurrentFactRequirement(msg)).toBe("CURRENT_FACT_REQUIRED");
    }
  });

  it("should detect tax questions", () => {
    const cases = [
      "What's the standard deduction for 2024?",
      "What's the 401k contribution limit?",
      "Can I itemize deductions?",
    ];

    for (const msg of cases) {
      expect(detectCurrentFactRequirement(msg)).toBe("CURRENT_FACT_REQUIRED");
    }
  });

  it("should not flag general financial questions", () => {
    const cases = [
      "Help me create a budget",
      "Should I save or pay off debt?",
      "How should I invest $10,000?",
      "What's a good emergency fund size?",
    ];

    for (const msg of cases) {
      expect(detectCurrentFactRequirement(msg)).toBe("NOT_REQUIRED");
    }
  });
});
```

**Acceptance Criteria**:
- [ ] All tests pass
- [ ] Edge cases documented
- [ ] No false positives

---

### 🟠 HIGH-4: Verify Claim/Evidence Relevance

**Problem**: Research acceptance checks status, tier, freshness, but not whether evidence actually supports requested claim.

**File**: [packages/ai/recommendation-research.ts](packages/ai/recommendation-research.ts#L43-L64)

**Steps**:

#### Step 4.1: Create Evidence Relevance Checker (20 min)
File: [packages/domain/evidence-relevance-checker.ts](packages/domain/evidence-relevance-checker.ts) (NEW)

```typescript
import { Evidence } from "@house-fin/contracts";

/**
 * Verify that evidence actually supports a claimed fact.
 * Prevents generic evidence from being used for specific claims.
 */
export class EvidenceRelevanceChecker {
  /**
   * Check if evidence supports a specific claim.
   * Returns confidence (HIGH, MEDIUM, LOW) or IRRELEVANT.
   */
  checkRelevance(claim: string, evidence: Evidence[]): {
    isRelevant: boolean;
    confidence: "HIGH" | "MEDIUM" | "LOW" | "IRRELEVANT";
    reasoning: string;
    supportingEvidence: Evidence[];
  } {
    // Extract key terms from claim
    const claimTerms = claim.toLowerCase().split(/\s+/).filter(t => t.length > 3);

    // Score each evidence against claim
    const scores = evidence.map(e => {
      const evidenceTerms = `${e.claim} ${e.sourceText}`.toLowerCase().split(/\s+/);
      const matches = claimTerms.filter(term => evidenceTerms.some(et => et.includes(term)));
      const relevanceScore = matches.length / claimTerms.length;

      return { evidence: e, relevanceScore, matchedTerms: matches.length };
    });

    // Filter for relevant evidence (>50% term match)
    const relevantEvidences = scores.filter(s => s.relevanceScore >= 0.5);

    if (relevantEvidences.length === 0) {
      return {
        isRelevant: false,
        confidence: "IRRELEVANT",
        reasoning: `No evidence found that directly addresses the claim: "${claim}"`,
        supportingEvidence: [],
      };
    }

    // Sort by relevance score
    relevantEvidences.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Determine confidence level
    const topScore = relevantEvidences[0].relevanceScore;
    const confidence = topScore >= 0.8 ? "HIGH" : topScore >= 0.6 ? "MEDIUM" : "LOW";

    return {
      isRelevant: true,
      confidence,
      reasoning: `Found ${relevantEvidences.length} piece(s) of evidence supporting this claim with ${confidence} confidence.`,
      supportingEvidence: relevantEvidences.map(s => s.evidence),
    };
  }
}
```

**Acceptance Criteria**:
- [ ] Relevance checking works for common cases
- [ ] Prevents generic evidence from being claimed as specific
- [ ] Tests exist for various scenarios
- [ ] Compiles without errors

#### Step 4.2: Update Research Validator to Use Relevance Checker (15 min)
File: [packages/ai/recommendation-research.ts](packages/ai/recommendation-research.ts#L43-L64)

**Current code**:
```typescript
export function validateResearchEvidence(evidence: Evidence[]): boolean {
  // Only checks status, tier, freshness
  return evidence.every(e => e.verification === "VERIFIED");
}
```

**Update**:
```typescript
import { EvidenceRelevanceChecker } from "@house-fin/domain";

const relevanceChecker = new EvidenceRelevanceChecker();

export function validateResearchEvidence(
  evidence: Evidence[],
  claim: string
): { isValid: boolean; reason: string } {
  // Check 1: Status, tier, freshness
  const statusValid = evidence.every(e => e.verification === "VERIFIED");
  if (!statusValid) {
    return { isValid: false, reason: "Evidence verification failed" };
  }

  // Check 2: Evidence relevance to claim
  const relevance = relevanceChecker.checkRelevance(claim, evidence);
  if (!relevance.isRelevant) {
    return { isValid: false, reason: relevance.reasoning };
  }

  if (relevance.confidence === "LOW") {
    return {
      isValid: true,
      reason: `Evidence supports claim with LOW confidence; recommendation should be labeled uncertain.`,
    };
  }

  return { isValid: true, reason: "" };
}
```

**Acceptance Criteria**:
- [ ] Evidence relevance is checked
- [ ] Claims with poor supporting evidence are flagged
- [ ] Validation fails if evidence does not support claim
- [ ] Tests pass

---

### 🟠 HIGH-5: Persist Typed Recommendations and Enforce Versions

**Problem**: Migrations and domain functions exist, but there is no recommendation repository implementation or API. Snapshot and policy versions are optional on journal entries.

**Files**: 
- [packages/domain/recommendation-service.ts](packages/domain/recommendation-service.ts#L88-L114) (exists but unused)
- [packages/db/migrations/](packages/db/migrations/) (no active use in live path)

**Steps**:

#### Step 5.1: Implement Recommendation Repository (30 min)
File: [packages/db/repositories/recommendation-repository.ts](packages/db/repositories/recommendation-repository.ts) (NEW)

```typescript
import { Recommendation, EntityId, ValidationStatus } from "@house-fin/contracts";
import { db } from "../db";

export class RecommendationRepository {
  /**
   * Save a recommendation and return its ID.
   * Snapshot and policy versions are mandatory.
   */
  async save(recommendation: Recommendation): Promise<EntityId> {
    if (!recommendation.financialSnapshotId) {
      throw new Error("Recommendation must reference a financial snapshot");
    }
    if (recommendation.policyVersion === undefined || recommendation.policyVersion === null) {
      throw new Error("Recommendation must include policy version");
    }

    const query = `
      INSERT INTO recommendations (
        id, household_id, member_id, conversation_id,
        intent, title, summary, recommended_action,
        financial_snapshot_id, financial_snapshot_version, policy_version,
        alternatives, assumptions, risks, sensitivity,
        validation_status, validation_details, validation_result,
        confidence, confidence_reasoning,
        approval_required, approval_status, approval_data,
        created_by, created_at, expires_at, recommendation_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
    `;

    await db.query(query, [
      recommendation.id,
      recommendation.householdId,
      recommendation.memberId,
      recommendation.conversationId || null,
      recommendation.intent,
      recommendation.title,
      recommendation.summary,
      recommendation.recommendedAction,
      recommendation.financialSnapshotId,
      recommendation.financialSnapshotVersion,
      recommendation.policyVersion,
      JSON.stringify(recommendation.alternatives),
      JSON.stringify(recommendation.assumptions),
      JSON.stringify(recommendation.risks),
      recommendation.sensitivity ? JSON.stringify(recommendation.sensitivity) : null,
      recommendation.validationResult.status,
      recommendation.validationResult.summary,
      JSON.stringify(recommendation.validationResult),
      recommendation.confidence,
      recommendation.confidenceReasoning,
      recommendation.approvalRequirement,
      recommendation.approvalStatus,
      recommendation.approvalData ? JSON.stringify(recommendation.approvalData) : null,
      recommendation.createdBy,
      recommendation.createdAt,
      recommendation.expiresAt || null,
      recommendation.recommendationVersion,
    ]);

    return recommendation.id;
  }

  /**
   * Get recommendation by ID with full household isolation.
   */
  async getById(id: EntityId, householdId: EntityId): Promise<Recommendation | null> {
    const query = `
      SELECT * FROM recommendations
      WHERE id = $1 AND household_id = $2
    `;

    const result = await db.query(query, [id, householdId]);
    if (result.rows.length === 0) return null;

    return this.mapRowToRecommendation(result.rows[0]);
  }

  /**
   * Get all non-expired recommendations for a household.
   */
  async getActiveByHousehold(householdId: EntityId): Promise<Recommendation[]> {
    const query = `
      SELECT * FROM recommendations
      WHERE household_id = $1
        AND (expires_at IS NULL OR expires_at > NOW())
        AND approval_status != 'EXPIRED'
      ORDER BY created_at DESC
    `;

    const result = await db.query(query, [householdId]);
    return result.rows.map(row => this.mapRowToRecommendation(row));
  }

  /**
   * Mark recommendation as expired when snapshot/policy versions change.
   */
  async markExpired(id: EntityId, householdId: EntityId, reason: string): Promise<void> {
    const query = `
      UPDATE recommendations
      SET approval_status = 'EXPIRED',
          expires_at = NOW(),
          approval_data = jsonb_set(
            COALESCE(approval_data, '{}'::jsonb),
            '{expiredReason}',
            to_jsonb($3)
          )
      WHERE id = $1 AND household_id = $2
    `;

    await db.query(query, [id, householdId, reason]);
  }

  /**
   * Record approval decision (append-only).
   */
  async recordApproval(
    id: EntityId,
    householdId: EntityId,
    approvedBy: EntityId,
    notes?: string
  ): Promise<void> {
    const query = `
      UPDATE recommendations
      SET approval_status = 'APPROVED',
          approval_data = jsonb_set(
            COALESCE(approval_data, '{}'::jsonb),
            '{approvedBy}',
            to_jsonb($3)
          ) || jsonb_set(
            '{}'::jsonb,
            '{approvedAt}',
            to_jsonb(NOW())
          ) || jsonb_set(
            '{}'::jsonb,
            '{approvalNotes}',
            to_jsonb($4)
          )
      WHERE id = $1 AND household_id = $2
    `;

    await db.query(query, [id, householdId, approvedBy, notes || ""]);
  }

  /**
   * Record decline decision (append-only).
   */
  async recordDecline(
    id: EntityId,
    householdId: EntityId,
    declinedBy: EntityId,
    reason: string
  ): Promise<void> {
    const query = `
      UPDATE recommendations
      SET approval_status = 'DECLINED',
          approval_data = jsonb_set(
            COALESCE(approval_data, '{}'::jsonb),
            '{declinedBy}',
            to_jsonb($3)
          ) || jsonb_set(
            '{}'::jsonb,
            '{declinedAt}',
            to_jsonb(NOW())
          ) || jsonb_set(
            '{}'::jsonb,
            '{declinationReason}',
            to_jsonb($4)
          )
      WHERE id = $1 AND household_id = $2
    `;

    await db.query(query, [id, householdId, declinedBy, reason]);
  }

  private mapRowToRecommendation(row: any): Recommendation {
    return {
      id: row.id,
      householdId: row.household_id,
      memberId: row.member_id,
      conversationId: row.conversation_id,
      intent: row.intent,
      title: row.title,
      summary: row.summary,
      recommendedAction: row.recommended_action,
      alternatives: JSON.parse(row.alternatives),
      financialSnapshotId: row.financial_snapshot_id,
      financialSnapshotVersion: row.financial_snapshot_version,
      scenarioIds: [],
      evidenceIds: [],
      policyVersion: row.policy_version,
      assumptions: JSON.parse(row.assumptions),
      risks: JSON.parse(row.risks),
      sensitivity: row.sensitivity ? JSON.parse(row.sensitivity) : undefined,
      validationResult: JSON.parse(row.validation_result),
      confidence: row.confidence,
      confidenceReasoning: row.confidence_reasoning,
      approvalRequirement: row.approval_required,
      approvalStatus: row.approval_status,
      approvalData: row.approval_data ? JSON.parse(row.approval_data) : undefined,
      createdAt: new Date(row.created_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      recommendationVersion: row.recommendation_version,
      createdBy: row.created_by,
    };
  }
}
```

**Acceptance Criteria**:
- [ ] Repository enforces snapshot and policy version requirements
- [ ] Save validates required fields
- [ ] Retrieval includes household isolation
- [ ] Approval recording is append-only
- [ ] Tests pass

#### Step 5.2: Create API Routes for Recommendation Lifecycle (30 min)
File: [apps/api/src/routes/recommendations.ts](apps/api/src/routes/recommendations.ts)

```typescript
import { Router, Request, Response } from "express";
import { RecommendationRepository } from "@house-fin/db";
import { authenticateRequest, authorizeHousehold } from "../middleware/auth";

const router = Router();
const recommendationRepo = new RecommendationRepository();

// GET /api/recommendations
router.get("/api/recommendations", authenticateRequest, async (req: Request, res: Response) => {
  try {
    const householdId = await authorizeHousehold(req);
    const recommendations = await recommendationRepo.getActiveByHousehold(householdId);
    res.json(recommendations);
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

// GET /api/recommendations/:id
router.get("/api/recommendations/:id", authenticateRequest, async (req: Request, res: Response) => {
  try {
    const householdId = await authorizeHousehold(req);
    const { id } = req.params;

    const recommendation = await recommendationRepo.getById(id, householdId);
    if (!recommendation) {
      return res.status(404).json({ error: "Recommendation not found" });
    }

    res.json(recommendation);
  } catch (error) {
    console.error("Error fetching recommendation:", error);
    res.status(500).json({ error: "Failed to fetch recommendation" });
  }
});

// POST /api/recommendations/:id/approve
router.post(
  "/api/recommendations/:id/approve",
  authenticateRequest,
  async (req: Request, res: Response) => {
    try {
      const householdId = await authorizeHousehold(req);
      const { id } = req.params;
      const { notes } = req.body;
      const userId = req.user.id;

      await recommendationRepo.recordApproval(id, householdId, userId, notes);
      res.json({ status: "approved" });
    } catch (error) {
      console.error("Error approving recommendation:", error);
      res.status(500).json({ error: "Failed to approve recommendation" });
    }
  }
);

// POST /api/recommendations/:id/decline
router.post(
  "/api/recommendations/:id/decline",
  authenticateRequest,
  async (req: Request, res: Response) => {
    try {
      const householdId = await authorizeHousehold(req);
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      if (!reason) {
        return res.status(400).json({ error: "Decline reason is required" });
      }

      await recommendationRepo.recordDecline(id, householdId, userId, reason);
      res.json({ status: "declined" });
    } catch (error) {
      console.error("Error declining recommendation:", error);
      res.status(500).json({ error: "Failed to decline recommendation" });
    }
  }
);

export default router;
```

**Acceptance Criteria**:
- [ ] Routes enforce authorization
- [ ] GET returns full recommendation
- [ ] POST endpoints update approval status
- [ ] Tests pass

---

## PHASE 3: MEDIUM Priority Fixes

### 🟡 MEDIUM-1: Persist Complete Replay Data in Journal

**Problem**: Journal preserves outputs but not tool parameters, candidate rankings, structured validation details, or transformation steps.

**File**: [packages/domain/decision-journal-service.ts](packages/domain/decision-journal-service.ts#L80-L111)

**Steps**:

#### Step 1.1: Update Journal Schema (20 min)
Update migration [packages/db/migrations/017_add_decision_journal.sql](packages/db/migrations/017_add_decision_journal.sql)

```sql
ALTER TABLE decision_journal ADD COLUMN tool_parameters JSONB;
ALTER TABLE decision_journal ADD COLUMN candidate_rankings JSONB;
ALTER TABLE decision_journal ADD COLUMN validation_lineage JSONB;
ALTER TABLE decision_journal ADD COLUMN transformation_steps JSONB;

COMMENT ON COLUMN decision_journal.tool_parameters IS 'Complete inputs to each tool invocation for replay';
COMMENT ON COLUMN decision_journal.candidate_rankings IS 'All candidates with scores and rationale';
COMMENT ON COLUMN decision_journal.validation_lineage IS 'Validation checks performed, in order, with results';
COMMENT ON COLUMN decision_journal.transformation_steps IS 'How LLM output transformed to structured recommendation';
```

**Acceptance Criteria**:
- [ ] Migration runs without errors
- [ ] Schema supports complete replay data

#### Step 1.2: Update Journal Service to Record Complete Data (30 min)
File: [packages/domain/decision-journal-service.ts](packages/domain/decision-journal-service.ts)

```typescript
export interface CompleteRecommendationContext {
  stage: "SCENARIOS_BUILT";
  toolParameters: Record<string, Record<string, any>>; // tool name -> params
  toolResults: Record<string, any>;
  scenarios: Scenario[];
}

export interface CandidateGenerationContext {
  stage: "CANDIDATES_GENERATED";
  scenarios: Scenario[];
  candidates: {
    id: string;
    title: string;
    reasoning: string;
    score?: number;
    ranking?: number;
  }[];
  candidateRankings: Record<string, { score: number; rationale: string }>;
}

export interface ValidationContext {
  stage: "VALIDATED";
  candidates: any[];
  candidateRankings: Record<string, any>;
  validationLineage: {
    check: string;
    status: "PASS" | "WARN" | "FAIL";
    description: string;
    timestamp: Date;
  }[];
  validationResult: ValidationResult;
  selectedCandidate: string;
}

export async function recordFullJournalEntry(
  householdId: EntityId,
  contexts: (CompleteRecommendationContext | CandidateGenerationContext | ValidationContext)[]
): Promise<EntityId> {
  const entry = {
    id: generateId(),
    householdId,
    stage: contexts[contexts.length - 1].stage,
    input: contexts[0].input,
    toolParameters: contexts
      .filter(c => c.stage === "SCENARIOS_BUILT")
      .flatMap(c => (c as CompleteRecommendationContext).toolParameters)
      .reduce((acc, p) => ({ ...acc, ...p }), {}),
    candidates: contexts
      .filter(c => c.stage === "CANDIDATES_GENERATED")
      .flatMap(c => (c as CandidateGenerationContext).candidates),
    candidateRankings: contexts
      .filter(c => c.stage === "CANDIDATES_GENERATED")
      .flatMap(c => (c as CandidateGenerationContext).candidateRankings)
      .reduce((acc, r) => ({ ...acc, ...r }), {}),
    validationLineage: contexts
      .filter(c => c.stage === "VALIDATED")
      .flatMap(c => (c as ValidationContext).validationLineage),
    transformationSteps: [], // LLM output → structured recommendation steps
  };

  // Save to DB
  const query = `
    INSERT INTO decision_journal (
      id, household_id, stage, input, tool_parameters,
      candidates, candidate_rankings, validation_lineage,
      transformation_steps, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
  `;

  await db.query(query, [
    entry.id,
    entry.householdId,
    entry.stage,
    JSON.stringify(entry.input),
    JSON.stringify(entry.toolParameters),
    JSON.stringify(entry.candidates),
    JSON.stringify(entry.candidateRankings),
    JSON.stringify(entry.validationLineage),
    JSON.stringify(entry.transformationSteps),
  ]);

  return entry.id;
}
```

**Acceptance Criteria**:
- [ ] Journal stores tool parameters
- [ ] Journal stores candidate rankings
- [ ] Journal stores validation lineage
- [ ] Replay data is complete enough to reconstruct decision

---

### 🟡 MEDIUM-2: Restore Architecture Documentation

**Problem**: PRODUCT_BUILD_CONTRACT.md and ADR set are absent despite master plan requiring them.

**Status**: ✅ **ALREADY COMPLETED** in this plan. Files created:
- [PRODUCT_BUILD_CONTRACT.md](PRODUCT_BUILD_CONTRACT.md)
- [docs/adr/001-money-representation.md](docs/adr/001-money-representation.md)
- [docs/adr/002-recommendation-pipeline-architecture.md](docs/adr/002-recommendation-pipeline-architecture.md)
- [docs/adr/003-privacy-boundary-and-ai-tools.md](docs/adr/003-privacy-boundary-and-ai-tools.md)
- [docs/adr/004-decision-journal-and-auditability.md](docs/adr/004-decision-journal-and-auditability.md)
- [docs/adr/005-persona-framing-not-calculation.md](docs/adr/005-persona-framing-not-calculation.md)
- [docs/adr/006-validation-independence.md](docs/adr/006-validation-independence.md)

---

## PHASE 4: LOW Priority Fixes

### 🟢 LOW-1: Clean Up Technical Debt

These are lower priority but should be tracked for future cleanup:

1. **Remove unused recommendation code**:
   - Dormant recommendation tables (if truly unused)
   - Migrate uses to new repository
   - Delete old files

2. **Consolidate persona definitions**:
   - Review [packages/contracts/advisor-persona.ts](packages/contracts/advisor-persona.ts)
   - Review [apps/web/utils/personas.ts](apps/web/utils/personas.ts) (likely)
   - Use single source of truth
   - Remove duplicates

3. **Remove heuristic UI extraction**:
   - Stop using regex/string extraction for recommendations
   - Use typed API responses
   - Remove any `recommendation = parse(toolOutput)`  code

---

## Summary of Changes by Phase

| Phase | Priority | Task | Effort | Dependencies |
|-------|----------|------|--------|--------------|
| 0 | — | Verify test suite | 10 min | None |
| 1 | CRITICAL | Wire typed pipeline | 80 min | Phase 0 |
| 1 | CRITICAL | Remove UI synthesis | 110 min | Phase 1 |
| 1 | CRITICAL | Consistent grounding | 25 min | Phase 1 |
| 2 | HIGH | Move financial calcs | 70 min | Phase 1 |
| 2 | HIGH | Production research | 70 min | Phase 1 |
| 2 | HIGH | Strengthen detection | 30 min | Phase 2 |
| 2 | HIGH | Verify relevance | 35 min | Phase 2 |
| 2 | HIGH | Persist recommendations | 60 min | Phase 1 |
| 3 | MEDIUM | Complete replay data | 50 min | Phase 2 |
| 3 | MEDIUM | Restore docs | 0 min | (Done) |
| 4 | LOW | Cleanup debt | Variable | Phase 3 |

**Total estimated effort**: ~540 minutes (~9 hours) for CRITICAL + HIGH

---

## Validation Checklist

Before moving to Slice 6:

- [ ] All CRITICAL fixes implemented and tested
- [ ] All HIGH fixes implemented and tested
- [ ] Typed recommendation pipeline is active in production path
- [ ] UI receives domain-provided validation/confidence/alternatives
- [ ] Journal records complete lineage
- [ ] Snapshot and policy versions are mandatory
- [ ] Failed validation blocks delivery
- [ ] All E2E tests pass
- [ ] No architectural drift from ADRs
- [ ] Code review checklist passes
- [ ] PRODUCT_BUILD_CONTRACT.md and ADRs are current

---

## Next Steps

1. **Immediately**: Assign tasks from Phase 1 to junior developers
2. **Track**: Use issue tracker to mark progress (CRITICAL-1, HIGH-2, etc.)
3. **Daily**: Review blockers and verify no phase dependencies are violated
4. **Post-Phase-1**: Run full E2E test suite and code review
5. **Post-Phase-2**: Validate architecture against PRODUCT_BUILD_CONTRACT.md
6. **Slice 6 Readiness**: Complete all CRITICAL and HIGH fixes before starting Slice 6

---

**Questions or clarifications?** Reference this plan, the PRODUCT_BUILD_CONTRACT.md, and the relevant ADR when proposing changes.
