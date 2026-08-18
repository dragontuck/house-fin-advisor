# AI Tool Layer - Deterministic Testing Guide

## Overview

All AI tools are designed to be **deterministic** - the same input always produces identical output. This guide provides strategies for verifying determinism and ensuring tools work correctly.

## What is Determinism?

**Deterministic Behavior**: Given the same input and database state, the tool produces the exact same output every time.

**Why It Matters**:
1. **Predictable for LLMs**: Consistent results make LLM workflows reliable
2. **Auditable**: Same inputs → same outputs makes calculations verifiable
3. **Testable**: Easy to write and verify test cases
4. **Reproducible**: Can replay tool executions for debugging

## Determinism Verification Checklist

### ✅ Same Input → Same Output

```typescript
describe("Determinism: Identical inputs produce identical outputs", () => {
  it("create_initial_budget produces deterministic results", async () => {
    const input = { month: "2026-8", incomeMethodCents: 500000 };
    
    // Call 1
    const call1 = await createInitialBudget(householdId, "2026-8", toolDeps, {
      incomeMethodCents: 500000
    });
    
    // Call 2 (identical input)
    const call2 = await createInitialBudget(householdId, "2026-8", toolDeps, {
      incomeMethodCents: 500000
    });
    
    // Compare key financial values (not timestamps)
    expect(call1.totalBudgetedCents).toBe(call2.totalBudgetedCents);
    expect(call1.projectedSurplusCents).toBe(call2.projectedSurplusCents);
    
    // Compare category ordering
    const cats1 = call1.proposedBudgets.map(b => b.category);
    const cats2 = call2.proposedBudgets.map(b => b.category);
    expect(cats1).toEqual(cats2);
  });
});
```

### ✅ All Money Values Are Integers

```typescript
describe("Money Type Integrity", () => {
  it("all *Cents fields contain only integers", async () => {
    const result = await createInitialBudget(householdId, "2026-8", toolDeps, {});
    
    const validateMoney = (obj: any, path: string = ""): string[] => {
      const errors: string[] = [];
      
      if (Array.isArray(obj)) {
        obj.forEach((item, idx) => {
          errors.push(...validateMoney(item, `${path}[${idx}]`));
        });
      } else if (typeof obj === "object" && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          if (key.endsWith("Cents")) {
            if (!Number.isInteger(value)) {
              errors.push(`${path}.${key} = ${value} is not an integer`);
            }
          } else {
            errors.push(...validateMoney(value, `${path}.${key}`));
          }
        }
      }
      
      return errors;
    };
    
    const errors = validateMoney(result);
    expect(errors).toEqual([]);
  });
});
```

### ✅ No Floating-Point Arithmetic

**Bad** (leads to floating-point errors):
```typescript
const percent = (overage / budget) * 100;  // Floating point
const monthly = annual / 12;               // Floating point
```

**Good** (integer arithmetic only):
```typescript
// All Money operations use integers
const totalCents = proposedBudgets.reduce((sum, b) => sum + b.proposedBudgetCents, 0) as Money;

// Frequency conversion keeps integers
const estimateMonthlyFromFrequency = (amount: Money, freq: RecurringFrequency): Money => {
  switch (freq) {
    case "WEEKLY":
      return ((amount * 52) / 12) as Money;  // 52 weeks → 12 months
    case "BIWEEKLY":
      return ((amount * 26) / 12) as Money;  // 26 periods → 12 months
    // ...
  }
};
```

### ✅ No Random or Time-Based Values

**Bad**:
```typescript
const randomBudget = Math.random() * 1000;    // Random!
const now = new Date();                       // Time-dependent!
const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000;  // Time-dependent!
```

**Good**:
```typescript
// Only use data from database
const historicalAverage = transactions.reduce((sum, t) => sum + t.amount, 0) / transactions.length;

// Time calculations use fixed points
const nextMonth = incrementMonth(currentYear, currentMonth);
```

## Test Patterns

### Pattern 1: Snapshot Testing

Verify output hasn't changed unexpectedly:

```typescript
it("should match snapshot for standard budget", async () => {
  const result = await createInitialBudget(householdId, "2026-8", toolDeps, {});
  expect(result).toMatchSnapshot();
});
```

**When to update snapshots**: Only when you intentionally change calculations.

### Pattern 2: Regression Testing

Compare current results against known-good baseline:

```typescript
it("regression: should produce same results as v1.0", async () => {
  const baselineResult = {
    totalBudgetedCents: 280000,
    projectedSurplusCents: 220000,
  };
  
  const currentResult = await createInitialBudget(householdId, "2026-8", toolDeps, {});
  
  expect(currentResult.totalBudgetedCents).toBe(baselineResult.totalBudgetedCents);
  expect(currentResult.projectedSurplusCents).toBe(baselineResult.projectedSurplusCents);
});
```

### Pattern 3: Calculation Verification

Verify calculations manually:

```typescript
it("should correctly calculate projected surplus", async () => {
  const result = await createInitialBudget(householdId, "2026-8", toolDeps, {});
  
  const expected = result.monthlyIncomeCents - result.totalBudgetedCents;
  expect(result.projectedSurplusCents).toBe(expected);
});
```

### Pattern 4: Input Variation

Test different inputs produce expected variations:

```typescript
it("should increase surplus when income increases", async () => {
  const low = await createInitialBudget(householdId, "2026-8", toolDeps, {
    incomeMethodCents: 400000,  // $4,000
  });
  
  const high = await createInitialBudget(householdId, "2026-8", toolDeps, {
    incomeMethodCents: 600000,  // $6,000
  });
  
  expect(high.projectedSurplusCents).toBeGreaterThan(low.projectedSurplusCents);
  
  // Difference should be exactly the income difference
  // (budgets remain the same)
  const diff = high.projectedSurplusCents - low.projectedSurplusCents;
  expect(diff).toBe(200000);  // $2,000 difference
});
```

## Deterministic Test Suite

### Test 1: Identical Calls Produce Identical Output

```typescript
describe("Determinism Tests: All 4 Tools", () => {
  let testHouseholdId: EntityId;
  
  beforeAll(async () => {
    // Set up test household with known data
    testHouseholdId = EntityId("test-determinism-1");
  });
  
  describe("create_initial_budget", () => {
    it("identical inputs → identical outputs (call 1 vs call 2)", async () => {
      const calls = await Promise.all([
        createInitialBudget(testHouseholdId, "2026-8", toolDeps, {}),
        createInitialBudget(testHouseholdId, "2026-8", toolDeps, {}),
      ]);
      
      const [result1, result2] = calls;
      
      // All financial fields should match exactly
      expect(result1.totalBudgetedCents).toBe(result2.totalBudgetedCents);
      expect(result1.monthlyIncomeCents).toBe(result2.monthlyIncomeCents);
      expect(result1.projectedSurplusCents).toBe(result2.projectedSurplusCents);
      
      // Category arrays should be identical
      expect(result1.proposedBudgets.length).toBe(result2.proposedBudgets.length);
      result1.proposedBudgets.forEach((b, idx) => {
        expect(b.category).toBe(result2.proposedBudgets[idx].category);
        expect(b.recommendedBudgetCents).toBe(result2.proposedBudgets[idx].recommendedBudgetCents);
      });
    });
  });
  
  describe("analyzeBudgetVariance", () => {
    it("identical inputs → identical outputs", async () => {
      const calls = await Promise.all([
        analyzeBudgetVariance(testHouseholdId, toolDeps, { months: 3 }),
        analyzeBudgetVariance(testHouseholdId, toolDeps, { months: 3 }),
      ]);
      
      const [result1, result2] = calls;
      expect(result1.avgVarianceCents).toBe(result2.avgVarianceCents);
      expect(result1.trend).toBe(result2.trend);
    });
  });
  
  describe("planNextMonthBudget", () => {
    it("identical inputs → identical outputs", async () => {
      const calls = await Promise.all([
        planNextMonthBudget(testHouseholdId, toolDeps, {}),
        planNextMonthBudget(testHouseholdId, toolDeps, {}),
      ]);
      
      const [result1, result2] = calls;
      expect(result1.totalProposedBudgetCents).toBe(result2.totalProposedBudgetCents);
      expect(result1.projectedSurplusCents).toBe(result2.projectedSurplusCents);
    });
  });
  
  describe("simulateBudgetChange", () => {
    it("identical inputs → identical outputs", async () => {
      const changes = [
        { category: "Groceries", newBudgetCents: 50000 },
      ];
      
      const calls = await Promise.all([
        simulateBudgetChange(testHouseholdId, changes, toolDeps, {}),
        simulateBudgetChange(testHouseholdId, changes, toolDeps, {}),
      ]);
      
      const [result1, result2] = calls;
      expect(result1.impact.surplusChange).toBe(result2.impact.surplusChange);
    });
  });
});
```

### Test 2: Output Consistency

```typescript
describe("Output Consistency", () => {
  it("categories are always sorted alphabetically", async () => {
    const result = await createInitialBudget(testHouseholdId, "2026-8", toolDeps, {});
    
    const categories = result.proposedBudgets.map(b => b.category);
    const sorted = [...categories].sort();
    
    expect(categories).toEqual(sorted);
  });
  
  it("all fields present in output", async () => {
    const result = await createInitialBudget(testHouseholdId, "2026-8", toolDeps, {});
    
    expect(result).toHaveProperty("householdId");
    expect(result).toHaveProperty("month");
    expect(result).toHaveProperty("proposedBudgets");
    expect(result).toHaveProperty("totalBudgetedCents");
    expect(result).toHaveProperty("monthlyIncomeCents");
    expect(result).toHaveProperty("monthlyExpensesCents");
    expect(result).toHaveProperty("projectedSurplusCents");
    expect(result).toHaveProperty("recommendations");
  });
});
```

### Test 3: Calculation Verification

```typescript
describe("Calculation Correctness", () => {
  it("totalBudgetedCents = sum of all proposedBudgets", async () => {
    const result = await createInitialBudget(testHouseholdId, "2026-8", toolDeps, {});
    
    const calculatedTotal = result.proposedBudgets.reduce(
      (sum, b) => sum + b.recommendedBudgetCents,
      0
    );
    
    expect(result.totalBudgetedCents).toBe(calculatedTotal);
  });
  
  it("projectedSurplusCents = income - expenses", async () => {
    const result = await createInitialBudget(testHouseholdId, "2026-8", toolDeps, {});
    
    const calculated = result.monthlyIncomeCents - result.monthlyExpensesCents;
    
    expect(result.projectedSurplusCents).toBe(calculated);
  });
  
  it("variance = budget - actual, can be positive or negative", async () => {
    const result = await analyzeBudgetVariance(testHouseholdId, toolDeps, {});
    
    result.variances.forEach(v => {
      const calculated = v.budgetCents - v.actualCents;
      expect(v.varianceCents).toBe(calculated);
    });
  });
});
```

## Running Determinism Tests

```bash
# Run all determinism tests
npm test -- --testNamePattern="Determinism" tests/integration/tool-execution.test.ts

# Run with coverage report
npm test -- --coverage tests/integration/tool-execution.test.ts

# Run single tool tests
npm test -- --testNamePattern="create_initial_budget" tests/integration/tool-execution.test.ts

# Watch mode for development
npm test -- --watch tests/integration/tool-execution.test.ts
```

## Continuous Verification

### Add to CI/CD Pipeline

```yaml
# GitHub Actions example
- name: Verify tool determinism
  run: |
    npm test -- --testNamePattern="Determinism" tests/integration/tool-execution.test.ts
    npm test -- --testNamePattern="Money Type" tests/integration/tool-execution.test.ts
```

### Regression Testing

Before releasing new tool versions:

1. Generate baseline results
2. Run tests against baseline
3. Document any intentional changes
4. Update snapshots if needed
5. Verify no unintended changes

```bash
# Generate baseline
npm test -- -u tests/integration/tool-execution.test.ts

# Verify against baseline
npm test tests/integration/tool-execution.test.ts
```

## Known Sources of Non-Determinism (to Avoid)

❌ **Timestamps**: Different on each call
```typescript
// Don't do this
const now = new Date();  // Changes every call
```

✅ **Use stable dates instead**:
```typescript
// Do this
const period = new Date(2026, 7, 1);  // Fixed to Aug 1, 2026
```

❌ **Floating-point arithmetic**: Precision errors
```typescript
// Don't do this
const rate = 1.25;  // Floating point
const withRate = amount * rate;  // Precision loss
```

✅ **Use integer arithmetic**:
```typescript
// Do this
const ratePercent = 125;  // 125% as integer
const withRate = (amount * ratePercent) / 100;  // Integer operations
```

❌ **Unordered collections**: Order varies
```typescript
// Don't do this
const results = new Set([...categories]);  // Order undefined
```

✅ **Sort before returning**:
```typescript
// Do this
const results = Array.from(categories).sort();  // Deterministic order
```

## Debugging Non-Determinism

If you encounter non-deterministic behavior:

1. **Check database state**: Ensure test data is stable
2. **Review recent changes**: What was modified?
3. **Trace execution**: Add logging to tool functions
4. **Compare outputs**: What differs between calls?
5. **Check timestamps**: Are time-dependent values being used?

```typescript
// Debug helper
function compareResults(result1: any, result2: any, path = ""): string[] {
  const diffs: string[] = [];
  
  if (JSON.stringify(result1) !== JSON.stringify(result2)) {
    for (const key in result1) {
      if (JSON.stringify(result1[key]) !== JSON.stringify(result2[key])) {
        diffs.push(`${path}.${key}`);
      }
    }
  }
  
  return diffs;
}

// Usage
const r1 = await createInitialBudget(...);
const r2 = await createInitialBudget(...);
const diffs = compareResults(r1, r2);
console.log("Differences:", diffs);  // Show what changed
```

## Summary

✅ **All tools are deterministic by design**
✅ **Tests verify identical inputs produce identical outputs**
✅ **Money values always use integers (no floats)**
✅ **No external data sources or random operations**
✅ **Outputs always sorted consistently**
✅ **Safe for LLM workflows and replay**

For questions about determinism, see [AI_TOOL_LAYER_ARCHITECTURE.md](./AI_TOOL_LAYER_ARCHITECTURE.md#determinism-guarantees).
