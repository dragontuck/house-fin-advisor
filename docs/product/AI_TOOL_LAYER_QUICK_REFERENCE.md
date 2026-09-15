# AI Tool Layer - Developer Quick Reference

## Quick Start

### 1. Using Tools from the REST API

```bash
# Create initial budget
curl -X POST http://localhost:6723/tools/create_initial_budget \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "month": "2026-8",
    "incomeMethodCents": 500000
  }'

# Analyze budget variance
curl -X POST http://localhost:6723/tools/analyze_budget_variance \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "categories": ["Groceries", "Utilities"],
    "months": 3
  }'

# Plan next month budget
curl -X POST http://localhost:6723/tools/plan_next_month_budget \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "incomeOverrideCents": 600000,
    "knownUpcomingExpenses": [
      {
        "category": "Car Maintenance",
        "description": "Scheduled service",
        "estimatedAmountCents": 50000
      }
    ]
  }'

# Simulate budget change
curl -X POST http://localhost:6723/tools/simulate_budget_change \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "changes": [
      { "category": "Groceries", "newBudgetCents": 50000 },
      { "category": "Entertainment", "newBudgetCents": 10000 }
    ]
  }'
```

### 2. Using Tools Programmatically

```typescript
import {
  createInitialBudget,
  analyzeBudgetVariance,
  planNextMonthBudget,
  simulateBudgetChange,
  createToolDependencies,
} from "@house-fin/ai";

import { createBudgetService, createCashFlowService } from "@house-fin/domain";
import { budgetRepo, settingsRepo, recurringPatternsRepo } from "./repositories";

// Initialize dependencies
const toolDeps = createToolDependencies(
  createBudgetService(),
  createCashFlowService(),
  { budgetRepo, settingsRepo, recurringPatternsRepo }
);

// Use tools
const initialBudget = await createInitialBudget(
  householdId,
  "2026-8",
  toolDeps,
  { incomeMethodCents: 500000 }
);

const variance = await analyzeBudgetVariance(
  householdId,
  toolDeps,
  { months: 3 }
);
```

## API Endpoint Reference

### POST /tools/create_initial_budget

Creates an initial budget proposal based on household income and historical spending patterns.

**Headers**:
```
Authorization: Bearer <auth-token>
Content-Type: application/json
```

**Request Body**:
```typescript
{
  // Required
  month: string;              // Format: "YYYY-M" (e.g., "2026-8")
  
  // Optional
  incomeMethodCents?: Money;  // Override household income
  essentialExpensesCents?: Money;
  discretionaryExpensesCents?: Money;
}
```

**Response** (200 OK):
```typescript
{
  householdId: EntityId;
  month: string;
  proposedBudgets: Array<{
    category: string;
    recommendedBudgetCents: Money;
    historicalAverageCents: Money;
    rationale: string;
  }>;
  totalBudgetedCents: Money;
  monthlyIncomeCents: Money;
  monthlyExpensesCents: Money;
  projectedSurplusCents: Money;
  recommendations: string[];
}
```

**Errors**:
- `400 MISSING_MONTH`: Month parameter not provided
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Database or calculation error

**Example Usage**:
```typescript
const response = await fetch("/tools/create_initial_budget", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    month: "2026-8",
  }),
});

const budget = await response.json();
console.log(`Proposed spending: $${budget.totalBudgetedCents / 100}`);
console.log(`Projected surplus: $${budget.projectedSurplusCents / 100}`);
```

---

### POST /tools/analyze_budget_variance

Analyzes spending patterns and identifies trends in budget variance.

**Request Body**:
```typescript
{
  // Optional
  categories?: string[];  // Specific categories to analyze
  months?: number;        // How many months to look back (default: 3, max: 12)
}
```

**Response** (200 OK):
```typescript
{
  householdId: EntityId;
  variances: Array<{
    category: string;
    month: string;
    budgetCents: Money;
    actualCents: Money;
    varianceCents: Money;        // Positive = under budget
    variancePercent: number;      // Variance as percentage
  }>;
  overBudgetMonthCount: number;
  avgVarianceCents: Money;
  trend: "IMPROVING" | "DECLINING" | "STABLE";
  recommendations: string[];
}
```

**Common Patterns**:
- Look back 3 months for recent trends
- Use all categories for full picture
- Negative variance indicates overspending
- Trend shows direction of improvement

**Example Usage**:
```typescript
const variance = await fetch("/tools/analyze_budget_variance", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    categories: ["Groceries", "Entertainment"],
    months: 6,
  }),
});

const data = await variance.json();
console.log(`Trend: ${data.trend}`);
data.recommendations.forEach(r => console.log(`- ${r}`));
```

---

### POST /tools/plan_next_month_budget

Plans budget for the next calendar month using recurring patterns and known upcoming expenses.

**Request Body**:
```typescript
{
  // Optional
  incomeOverrideCents?: Money;
  
  knownUpcomingExpenses?: Array<{
    category: string;
    description: string;
    estimatedAmountCents: Money;
  }>;
}
```

**Response** (200 OK):
```typescript
{
  householdId: EntityId;
  nextMonth: string;                          // Format: "YYYY-M"
  estimatedIncomeCents: Money;
  proposedBudgets: Array<{
    category: string;
    proposedBudgetCents: Money;
    currentBudgetCents: Money;
    historicalAverageCents: Money;
    isBasedOnRecurring: boolean;
    rationale: string;
  }>;
  totalProposedBudgetCents: Money;
  projectedSurplusCents: Money;
  knownUpcomingExpensesAccountedFor: boolean;
  recommendations: string[];
}
```

**Key Insights**:
- Automatically detects next calendar month
- Uses recurring patterns for forecasting
- Incorporates one-time expenses
- Calculates projected cash surplus

**Example Usage**:
```typescript
const nextMonth = await fetch("/tools/plan_next_month_budget", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    knownUpcomingExpenses: [
      {
        category: "Car Insurance",
        description: "Quarterly payment",
        estimatedAmountCents: 40000,
      },
    ],
  }),
});

const plan = await nextMonth.json();
console.log(`Next month: ${plan.nextMonth}`);
console.log(`Projected surplus: $${plan.projectedSurplusCents / 100}`);
```

---

### POST /tools/simulate_budget_change

Simulates the impact of proposed budget reallocations without modifying actual budgets.

**Request Body**:
```typescript
{
  // Required
  changes: Array<{
    category: string;
    newBudgetCents: Money;
  }>;
  
  // Optional
  month?: string;  // Month to simulate (default: next month)
}
```

**Response** (200 OK):
```typescript
{
  householdId: EntityId;
  simulatedBudget: Array<{
    category: string;
    previousBudgetCents: Money;
    simulatedBudgetCents: Money;
    changeCents: Money;
  }>;
  impact: {
    totalBudgetChange: Money;        // Sum of all changes
    surplusChange: Money;            // Impact on available surplus
    additionalBudgetedCents: Money;
    previousTotalBudgetCents: Money;
    simulatedTotalBudgetCents: Money;
    previousSurplusCents: Money;
    simulatedSurplusCents: Money;
  };
  recommendations: string[];
}
```

**Common Use Cases**:
- "What if I increase Groceries by $100?"
- "Can I reduce Entertainment and add to Savings?"
- "What happens if I allocate $500 to Car Maintenance?"

**Example Usage**:
```typescript
const simulation = await fetch("/tools/simulate_budget_change", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    changes: [
      { category: "Groceries", newBudgetCents: 50000 },
      { category: "Entertainment", newBudgetCents: 10000 },
    ],
  }),
});

const result = await simulation.json();
console.log(`Budget change: $${result.impact.totalBudgetChange / 100}`);
console.log(`New surplus: $${result.impact.simulatedSurplusCents / 100}`);
result.recommendations.forEach(r => console.log(`- ${r}`));
```

---

## Error Response Format

All errors follow this format:

```typescript
{
  statusCode: number;      // HTTP status code
  errorCode: string;       // Machine-readable error identifier
  userMessage: string;     // User-friendly error message
  retryable: boolean;      // Whether retry is safe
  timestamp: string;       // ISO 8601 timestamp
}
```

**Example Error Response**:
```json
{
  "statusCode": 400,
  "errorCode": "MISSING_MONTH",
  "userMessage": "Month is required (format: YYYY-M)",
  "retryable": false,
  "timestamp": "2026-08-17T14:30:00.000Z"
}
```

## Determinism Guarantees

All tools are **deterministic**:

✅ **Same input always produces identical output**
```typescript
// Call 1
const result1 = await fetch("/tools/create_initial_budget", {
  body: JSON.stringify({ month: "2026-8" })
});

// Call 2 (same input)
const result2 = await fetch("/tools/create_initial_budget", {
  body: JSON.stringify({ month: "2026-8" })
});

// result1.body === result2.body (except timestamp fields)
```

✅ **All Money values are integers (cents)**
```typescript
// Never returns floats
{
  proposedBudgetCents: 50000,  // $500.00 exactly
  projectedSurplusCents: 125000,  // $1,250.00 exactly
}
```

✅ **No external API calls or side effects**
- Only reads from PostgreSQL
- No LLM calls
- No state mutations
- Safe to execute multiple times

✅ **Sorted output**
- Categories alphabetically sorted
- Variances sorted by magnitude
- Deterministic ordering

## Testing Tools Locally

### Run Integration Tests
```bash
# Run tool-specific tests
npm test tests/integration/tool-execution.test.ts

# Run with coverage
npm test -- --coverage tests/integration/tool-execution.test.ts

# Run with detailed output
npm test -- --verbose tests/integration/tool-execution.test.ts
```

### Manual Testing with curl
```bash
# Start the server
npm run start:api

# In another terminal, test an endpoint
curl -X POST http://localhost:6723/tools/create_initial_budget \
  -H "Authorization: Bearer test-token-household-1" \
  -H "Content-Type: application/json" \
  -d '{"month": "2026-8"}' | jq '.'
```

### Debug Tool Calculations
```typescript
// Enable detailed logging in tool implementations
process.env.DEBUG_TOOLS = "true";

// Then call tool
const result = await createInitialBudget(householdId, month, toolDeps, options);
// Will log detailed calculation steps
```

## Performance Considerations

### Typical Response Times
- `create_initial_budget`: ~200-500ms (3 months of history)
- `analyze_budget_variance`: ~150-300ms (up to 12 months)
- `plan_next_month_budget`: ~100-250ms (pattern analysis)
- `simulate_budget_change`: ~50-100ms (arithmetic only)

### Optimization Tips
- Minimize month range for variance analysis
- Cache recurring patterns (updated weekly)
- Filter categories if only interested in subset
- Use specific categories instead of analyzing all

### Database Indexes Required
```sql
-- For efficient tool queries
CREATE INDEX idx_budgets_household_period 
  ON budgets(household_id, year, month);

CREATE INDEX idx_transactions_household_date 
  ON posted_transactions(household_id, posted_date);

CREATE INDEX idx_settings_household 
  ON household_settings(household_id);
```

## Integration with LLM Workflow

When integrated with an LLM:

```
User: "Create a budget for next month"
  │
  ▼ (LLM classifies intent)
Agent determines: Need to plan next month
  │
  ▼ (LLM calls tool)
POST /tools/plan_next_month_budget
  │
  ▼ (Tool returns structured data)
{proposedBudgets: [...], projectedSurplusCents: 125000}
  │
  ▼ (LLM generates natural language response)
"Based on your recurring patterns, I recommend..."
```

## Troubleshooting

### Tool returns empty results
- Check household has historical data (transactions)
- Verify household settings exist
- Ensure month format is correct (YYYY-M)

### High response times
- Check database performance
- Verify indexes are created
- Reduce months parameter for variance analysis

### Non-integer money values
- Check domain service implementations
- Verify repository data is in cents
- Review recommendation generation logic

## API Versioning

Current version: **v1.0** (2026-08-17)

All endpoints maintain backward compatibility. Breaking changes will increment version:
- `POST /tools/v2/create_initial_budget`

## Support & Contact

For issues or questions:
1. Check [AI_TOOL_LAYER_ARCHITECTURE.md](./AI_TOOL_LAYER_ARCHITECTURE.md) for detailed design
2. Review test cases in `tests/integration/tool-execution.test.ts`
3. Check domain service implementations
4. File issue in GitHub with request/response details
