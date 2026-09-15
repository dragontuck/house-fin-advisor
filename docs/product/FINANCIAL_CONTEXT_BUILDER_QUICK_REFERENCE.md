# Financial Context Builder - Quick Reference

**Status**: ✅ Production Ready  
**Location**: `packages/ai/financial-context-builder.ts`  
**Export**: `@house-fin/ai`

## Quick Start

### 1. Create a Builder

```typescript
import { createFinancialContextBuilder } from "@house-fin/ai";

const builder = createFinancialContextBuilder({
    budgetRepo: pgBudgetRepository,
    transactionRepo: pgTransactionRepository,
    settingsRepo: pgSettingsRepository,
    recurringPatternsRepo: pgRecurringPatternsRepository,
    snapshotRepo: pgSnapshotRepository,
    debtRepo: pgDebtRepository,
    goalsRepo: pgGoalsRepository,
});
```

### 2. Build Context for a Workflow

```typescript
const context = await builder.buildContext(
    householdId,
    "Help me create an initial budget",
    workflowState  // Current workflow state
);
```

### 3. Use Context in Your Code

```typescript
// Determine which tools to invoke
if (context.toolsRequired.includes("create_initial_budget")) {
    await createInitialBudget(householdId, month, deps);
}

// Access financial data
const overBudgetAmount = context.currentBudget?.totalVarianceCents ?? 0;
const cashFlowSurplus = context.projectedCashFlow?.projectedSurplusCents ?? 0;

// Check what needs attention
for (const item of context.attentionItems ?? []) {
    console.log(`[${item.severity}] ${item.description}`);
}

// Include metadata when storing results
await saveAdvisorResponse({
    contextAsOf: context.asOf,
    contextVersions: context.contextVersions,
    toolsUsed: context.toolsRequired,
});
```

---

## Workflow Types & Context

### Simple Informational Queries
- **FINANCIAL_HEALTH**: "How are we doing?" → Snapshot, debt, goals, attention items
- **BUDGET_STATUS**: "Am I over budget?" → Current budget, trends, attention items
- **CASH_FLOW**: "What's our cash flow?" → Projections, recurring patterns

### Diagnostic Queries
- **BUDGET_DIAGNOSE**: "Why am I always over budget?" → Full budget history (6mo), patterns, attention

### Planning Workflows
- **BUDGET_CREATE**: "Help me create a budget" → Comprehensive context (snapshot, budgets, cash flow, patterns, debt, goals)
- **BUDGET_REVISE**: "Plan next month" → Current budget, next-month cash flow, recurring patterns, goals

### Scenario Workflows
- **BUDGET_SCENARIO**: "What if we spend more on X?" → Current budget only (minimal context)
- **AFFORDABILITY**: "Can we afford this?" → Cash flow, patterns, debt, goals

---

## Context Fields by Use Case

### Budget Creation

```typescript
const context = await builder.buildContext(householdId, request, {
    workflowType: AdvisorWorkflow.BUDGET_CREATE,
    ...
});

// Returns:
// ✓ currentBudget         - Existing budget (if any)
// ✓ budgetPerformance     - 3-month history
// ✓ projectedCashFlow     - Next month
// ✓ recurringObligations  - Spending patterns
// ✓ debt                  - Debt summary
// ✓ goals                 - Savings goals
// ✓ attentionItems        - Issues to address
```

### Budget Status Check

```typescript
const context = await builder.buildContext(householdId, request, {
    workflowType: AdvisorWorkflow.BUDGET_STATUS,
    ...
});

// Returns:
// ✓ currentBudget         - This month's breakdown
// ✓ budgetPerformance     - Trend analysis
// ✓ attentionItems        - Over-budget categories
// ✗ debt                  - Not needed
// ✗ goals                 - Not needed
// ✗ projectedCashFlow     - Not needed
```

### Scenario Analysis

```typescript
const context = await builder.buildContext(householdId, request, {
    workflowType: AdvisorWorkflow.BUDGET_SCENARIO,
    currentScenario: {
        type: "SPENDING_CHANGE",
        description: "Increase dining to $800",
        affectedAmountCents: 80000,
    },
    ...
});

// Returns:
// ✓ currentBudget         - Baseline to compare against
// ✗ Everything else       - Minimal context for scenario
```

---

## Accessing Context Data

### Current Month Budget

```typescript
if (context.currentBudget) {
    // Loop through categories
    for (const cat of context.currentBudget.categories) {
        console.log(`${cat.category}:`);
        console.log(`  Budget: $${cat.budgetCents / 100}`);
        console.log(`  Actual: $${cat.actualCents / 100}`);
        console.log(`  Over by: $${Math.max(0, cat.actualCents - cat.budgetCents) / 100}`);
        console.log(`  Spent: ${cat.percentSpent}%`);
    }
    
    // Get totals
    console.log(`Total over budget: $${Math.max(0, context.currentBudget.totalVarianceCents) / 100}`);
}
```

### Budget Trends

```typescript
if (context.budgetPerformance) {
    console.log(`Trend: ${context.budgetPerformance.trend}`);  // "IMPROVING", "DECLINING", "STABLE"
    console.log(`Over-budget months: ${context.budgetPerformance.overBudgetCount} of ${context.budgetPerformance.periods.length}`);
    
    for (const period of context.budgetPerformance.periods) {
        const ratio = (period.totalActualCents / period.totalBudgetCents * 100).toFixed(0);
        console.log(`${period.period.year}-${period.period.month}: ${ratio}% spent`);
    }
}
```

### Cash Flow Projection

```typescript
if (context.projectedCashFlow) {
    const income = context.projectedCashFlow.projectedIncomeCents / 100;
    const expenses = context.projectedCashFlow.projectedExpensesCents / 100;
    const surplus = context.projectedCashFlow.projectedSurplusCents / 100;
    
    console.log(`Income: $${income}`);
    console.log(`Expenses: $${expenses}`);
    console.log(`Surplus/Deficit: $${surplus}`);
    console.log(`Confidence: ${context.projectedCashFlow.confidence}`);
    
    if (context.projectedCashFlow.projectedSurplusCents < 0) {
        console.log("⚠️ Projected deficit!");
    }
}
```

### Recurring Obligations

```typescript
if (context.recurringObligations) {
    console.log(`Total monthly from recurring: $${context.recurringObligations.totalMonthlyProjectionCents / 100}`);
    console.log(`Based on ${context.recurringObligations.patterns.length} patterns`);
    console.log(`Confidence: ${context.recurringObligations.metadata.confidence}`);
    
    for (const pattern of context.recurringObligations.patterns) {
        const monthly = estimateMonthly(pattern);
        console.log(`- ${pattern.merchant} (${pattern.frequency}): $${monthly / 100}/month`);
    }
}
```

### Attention Items

```typescript
for (const item of context.attentionItems ?? []) {
    const icon = item.severity === "HIGH" ? "🔴" : "🟡";
    console.log(`${icon} [${item.type}] ${item.description}`);
    
    if (item.affectedAmountCents) {
        console.log(`   Amount: $${item.affectedAmountCents / 100}`);
    }
    console.log(`   Action: ${item.suggestedAction}`);
}
```

### Tools to Invoke

```typescript
// Check which tools should be run
if (context.toolsRequired.includes("create_initial_budget")) {
    // Invoke budget creation tool
}

if (context.toolsRequired.includes("analyze_budget_variance")) {
    // Invoke variance analysis
}

if (context.toolsRequired.includes("simulate_budget_change")) {
    // Invoke scenario simulation
}
```

---

## Metadata & Reproducibility

### Context Age

```typescript
const ageMinutes = (new Date().getTime() - context.asOf.getTime()) / 60000;
if (ageMinutes > 30) {
    console.log("⚠️ Context is stale, consider rebuilding");
}
```

### Snapshot Version

```typescript
// Track which snapshot version was used
console.log(`Snapshot version: ${context.contextVersions.snapshotVersion}`);
console.log(`As of: ${context.asOf}`);

// Later, if resolving a dispute:
// - Check if snapshot version matches what advisor saw
// - Reproduce same context if snapshot still available
```

### Confidence Levels

```typescript
const confidence = context.currentBudget?.metadata.confidence ?? "UNKNOWN";

switch (confidence) {
    case "HIGH":
        // Use with confidence in advisor response
        break;
    case "MEDIUM":
        // Use but add caveats ("based on available data")
        break;
    case "LOW":
        // Recommend more data collection or manual input
        break;
}
```

### Assumptions

```typescript
for (const assumption of context.currentBudget?.metadata.assumptions ?? []) {
    console.log(`Assumption: ${assumption}`);
}
```

---

## Common Patterns

### Check if Over Budget

```typescript
function isOverBudget(context: FinancialContext): boolean {
    return (context.currentBudget?.percentOverBudget ?? 0) > 0;
}

function overBudgetAmount(context: FinancialContext): Money {
    const variance = context.currentBudget?.totalVarianceCents ?? 0;
    return Math.max(0, -variance) as Money;  // Negative variance = over budget
}
```

### Find Problem Categories

```typescript
function problemCategories(context: FinancialContext): string[] {
    return context.currentBudget?.categories
        .filter(c => c.actualCents > c.budgetCents)
        .map(c => c.category) ?? [];
}
```

### Check Cash Health

```typescript
function cashHealthStatus(context: FinancialContext): "HEALTHY" | "TIGHT" | "DEFICIT" {
    const surplus = context.projectedCashFlow?.projectedSurplusCents ?? 0;
    
    if (surplus > 100000) return "HEALTHY";           // $1000+ surplus
    if (surplus >= 0) return "TIGHT";                 // Break-even to $1000
    return "DEFICIT";                                 // Negative
}
```

### Assess Attention Urgency

```typescript
function needsImmediateAttention(context: FinancialContext): boolean {
    return (context.attentionItems ?? [])
        .some(item => item.severity === "HIGH");
}

function attentionSummary(context: FinancialContext): string {
    const high = context.attentionItems?.filter(i => i.severity === "HIGH").length ?? 0;
    const medium = context.attentionItems?.filter(i => i.severity === "MEDIUM").length ?? 0;
    
    return `${high} high priority, ${medium} medium priority issues`;
}
```

---

## Error Handling

### Graceful Degradation

The context builder returns `undefined` for sections that can't be fetched:

```typescript
// Always check for undefined before using
const budgetContext = context.currentBudget;
if (!budgetContext) {
    console.log("No budget data available");
    // Proceed with other context or ask user to create budget
}

const patterns = context.recurringObligations?.patterns ?? [];
// Safe to use empty array if patterns unavailable
```

### Stale Context Detection

```typescript
const MAX_CONTEXT_AGE_MINUTES = 30;
const ageMinutes = (new Date().getTime() - context.asOf.getTime()) / 60000;

if (ageMinutes > MAX_CONTEXT_AGE_MINUTES) {
    // Rebuild context for current state
    const freshContext = await builder.buildContext(householdId, request, workflowState);
    // Use freshContext instead
}
```

### Missing Metadata

```typescript
// All metadata always present
const version = context.contextVersions.snapshotVersion ?? 0;
const confidence = context.currentBudget?.metadata.confidence ?? "LOW";
const assumptions = context.currentBudget?.metadata.assumptions ?? [];
```

---

## Performance Tips

1. **Reuse Builder**: Create once per request, not per context call
2. **Check Workflow Type First**: Invalid workflows still work but fetch unnecessary data
3. **Cache if Stable**: Within single request handler, reuse built context
4. **Profile Latency**: Typically transaction range query is bottleneck
5. **Partial Context**: Partial context (some fields undefined) is valid, continue normally

---

## Testing with Context Builder

### Mock Dependencies

```typescript
const mockBuilder = new FinancialContextBuilder({
    budgetRepo: { findByHouseholdAndPeriod: async () => mockBudgets },
    transactionRepo: { findByHouseholdAndPeriod: async () => mockTransactions },
    settingsRepo: { findByHouseholdId: async () => mockSettings },
    recurringPatternsRepo: { findByHouseholdId: async () => mockPatterns },
    snapshotRepo: { findLatest: async () => mockSnapshot },
    debtRepo: { findByHouseholdId: async () => mockDebt },
    goalsRepo: { findByHouseholdId: async () => mockGoals },
});
```

### Fixture Context

```typescript
const fixtureContext = await builder.buildContext(
    testHouseholdId,
    "test request",
    {
        id: "test-workflow",
        householdId: testHouseholdId,
        workflowType: AdvisorWorkflow.BUDGET_CREATE,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
    }
);

// Use in tests:
expect(fixtureContext.currentBudget).toBeDefined();
expect(fixtureContext.toolsRequired).toContain("create_initial_budget");
```

---

## See Also

- [Financial Context Builder Full Docs](./FINANCIAL_CONTEXT_BUILDER.md)
- [Tool Layer Architecture](./AI_TOOL_LAYER_ARCHITECTURE.md)
- [AI Tool Implementations](../packages/ai/tool-implementations.ts)
- [Workflow Types](../packages/contracts/index.ts#L1468-L1490)
