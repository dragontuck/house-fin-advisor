# AI Tool Layer Architecture

## Overview

The AI Tool Layer provides a deterministic interface between Large Language Models (LLMs) and the financial planning domain services. All tools delegate calculations to domain services, ensuring:

- **Determinism**: Same inputs always produce identical outputs
- **Auditability**: All calculations traceable to business rules
- **Privacy**: No sensitive data sent to external LLMs
- **Consistency**: Single source of truth for financial calculations

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client (Web/Mobile)                          │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Express.js REST API                               │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │         Tool Execution Routes (apps/api/src/routes/)          │ │
│  │  • POST /tools/create_initial_budget                           │ │
│  │  • POST /tools/analyze_budget_variance                         │ │
│  │  • POST /tools/plan_next_month_budget                          │ │
│  │  • POST /tools/simulate_budget_change                          │ │
│  └─────────────┬────────────────────────────────────────┬────────┘ │
└────────────────┼────────────────────────────────────────┼───────────┘
                 │ Dependency Injection                   │
                 ▼                                        ▼
        ┌──────────────────────┐           ┌──────────────────────────┐
        │ Tool Implementation  │           │  Domain Services         │
        │ (packages/ai/)       │           │  (packages/domain/)      │
        │                      │           │                          │
        │ • createInitial      │──────────▶│ • BudgetService          │
        │   Budget()           │           │ • CashFlowService        │
        │ • analyzeBudget      │           │ • RecurringPatterns      │
        │   Variance()         │           │                          │
        │ • planNextMonth      │           └────────┬─────────────────┘
        │   Budget()           │                    │
        │ • simulateBudget     │           ┌────────▼──────────────────┐
        │   Change()           │           │   Repositories            │
        │                      │           │  (apps/api/src/db/)       │
        └──────────────────────┘           │                           │
                                           │ • BudgetRepository        │
                                           │ • PostingRepository       │
                                           │ • SettingsRepository      │
                                           │ • RecurringPatterns       │
                                           └────────┬──────────────────┘
                                                    │
                                           ┌────────▼──────────────────┐
                                           │   PostgreSQL Database     │
                                           │                           │
                                           │ • budgets                 │
                                           │ • posted_transactions     │
                                           │ • household_settings      │
                                           │ • recurring_patterns      │
                                           └───────────────────────────┘
```

## Component Details

### 1. Tool Execution Routes (`apps/api/src/routes/tool-execution.ts`)

**Purpose**: HTTP endpoints that accept LLM-formatted requests and invoke deterministic tools.

**Key Responsibilities**:
- Request validation and sanitization
- Household authorization
- Tool invocation with dependency injection
- Response formatting and error handling

**Endpoints**:

#### POST /tools/create_initial_budget
Creates an initial budget from household income and spending history.

```typescript
// Request
{
  month: string;              // Format: "2026-8"
  incomeMethodCents?: Money;  // Optional income override
  essentialExpensesCents?: Money;
  discretionaryExpensesCents?: Money;
}

// Response
{
  householdId: EntityId;
  month: string;
  proposedBudgets: ProposedBudgetCategory[];
  totalBudgetedCents: Money;
  monthlyIncomeCents: Money;
  monthlyExpensesCents: Money;
  projectedSurplusCents: Money;
  recommendations: string[];
}
```

#### POST /tools/analyze_budget_variance
Analyzes variance patterns across multiple months to identify trends.

```typescript
// Request
{
  categories?: string[];      // Specific categories to analyze
  months?: number;            // Months to look back (default: 3)
}

// Response
{
  householdId: EntityId;
  variances: VarianceTrend[];
  overBudgetMonthCount: number;
  avgVarianceCents: Money;
  trend: "IMPROVING" | "DECLINING" | "STABLE";
  recommendations: string[];
}
```

#### POST /tools/plan_next_month_budget
Plans the next month's budget using recurring patterns and known upcoming expenses.

```typescript
// Request
{
  incomeOverrideCents?: Money;
  knownUpcomingExpenses?: Array<{
    category: string;
    description: string;
    estimatedAmountCents: Money;
  }>;
}

// Response
{
  householdId: EntityId;
  nextMonth: string;
  estimatedIncomeCents: Money;
  proposedBudgets: NextMonthBudgetProposal[];
  totalProposedBudgetCents: Money;
  projectedSurplusCents: Money;
  knownUpcomingExpensesAccountedFor: boolean;
  recommendations: string[];
}
```

#### POST /tools/simulate_budget_change
Simulates the financial impact of proposed budget reallocations.

```typescript
// Request
{
  changes: Array<{
    category: string;
    newBudgetCents: Money;
  }>;
  month?: string;             // Which month to simulate (default: next month)
}

// Response
{
  householdId: EntityId;
  simulatedBudget: SimulatedBudgetCategory[];
  impact: BudgetImpactAnalysis;
  recommendations: string[];
}
```

### 2. Tool Implementations (`packages/ai/tool-implementations.ts`)

**Purpose**: Core business logic for each AI tool. Orchestrates data collection and delegates calculations to domain services.

**Key Functions**:

#### createInitialBudget()
1. Retrieves household settings (income, expense preferences)
2. Fetches 3 months of transaction history
3. Calculates category spending using BudgetService
4. Detects recurring patterns using CashFlowService
5. Generates recommendations based on patterns
6. Returns deterministic budget proposal

**Determinism Guarantees**:
- No random number generation
- Sorted output for consistent ordering
- All Money values are integers (cents)
- Uses historical data only, no external data sources

#### analyzeBudgetVariance()
1. Fetches budgets and actual transactions for specified months
2. Calculates variance per category using BudgetService
3. Analyzes variance trends (improving, declining, stable)
4. Counts over-budget months and calculates averages
5. Generates recommendations for problem categories

**Variance Calculation**:
```
Variance = (Budget Amount - Actual Spending) / Budget Amount
Positive = Under budget (good)
Negative = Over budget (needs attention)
```

#### planNextMonthBudget()
1. Determines next calendar month
2. Estimates income from settings or override
3. Fetches current and historical budgets
4. Analyzes recurring patterns for each category
5. Incorporates known upcoming expenses
6. Projects surplus using BudgetService
7. Generates recommendations for upcoming month

#### simulateBudgetChange()
1. Retrieves current budget baseline
2. Applies proposed changes (reallocations)
3. Recalculates totals using BudgetService
4. Computes impact analysis (delta from current)
5. Generates recommendations based on impact

### 3. Helper Functions

**Determinism and Formatting**:

```typescript
estimateMonthlyFromFrequency(amount: Money, frequency: RecurringFrequency): Money
- Converts WEEKLY → Monthly (amount × 52 / 12)
- Converts BIWEEKLY → Monthly (amount × 26 / 12)
- Converts MONTHLY → Monthly (no change)
- Converts QUARTERLY → Monthly (amount / 3)
- Converts ANNUAL → Monthly (amount / 12)
```

**Recommendation Generators**:
- `generateBudgetRecommendations()`: Based on surplus/deficit
- `generateVarianceRecommendations()`: Based on variance trends
- `generateNextMonthRecommendations()`: Based on projected surplus
- `generateSimulationRecommendations()`: Based on impact analysis

### 4. Dependency Injection

**ToolDependencies Interface**:
```typescript
interface ToolDependencies {
  budgetService: BudgetService;
  cashFlowService: CashFlowService;
  budgetRepo: BudgetRepository;
  settingsRepo: SettingsRepository;
  recurringPatternsRepo: RecurringPatternsRepository;
}
```

**Factory Function**:
```typescript
function createToolDependencies(
  budgetService: BudgetService,
  cashFlowService: CashFlowService,
  repos: any
): ToolDependencies
```

### 5. Repository Adapter Pattern

**Problem**: Tools expect typed repository interfaces; actual repositories have different method signatures.

**Solution**: Tool routes create a local `toolRepos` adapter that maps tool interface to actual repository methods.

```typescript
const toolRepos = {
  findByPeriod: (householdId, year, month) =>
    budgetRepo.findByHouseholdAndPeriod(householdId, year, month),
  
  findByHouseholdIdRange: (householdId, startYear, startMonth, endYear, endMonth) => {
    // Loop through period method for multiple months
    const budgets = [];
    for (let y = startYear; y <= endYear; y++) {
      for (let m = (y === startYear ? startMonth : 1); m <= (y === endYear ? endMonth : 12); m++) {
        budgets.push(...budgetRepo.findByHouseholdAndPeriod(householdId, y, m));
      }
    }
    return budgets;
  },
  
  findByHouseholdDateRange: (householdId, startDate, endDate) =>
    cashFlowRepo.getTransactionsForRange(householdId, startDate, endDate),
};
```

## Data Flow Example: create_initial_budget

```
1. Client POST /tools/create_initial_budget
   └─ {month: "2026-8", incomeMethodCents: 500000}

2. Route Handler (tool-execution.ts)
   ├─ Validates input
   ├─ Extracts householdId from auth context
   └─ Calls createInitialBudget(householdId, month, toolDeps, options)

3. Tool Implementation (tool-implementations.ts)
   ├─ Fetches household settings via settingsRepo
   ├─ Determines income: override > settings > 0
   ├─ Fetches 3 months of transaction history
   ├─ Calls budgetService.calculateBudgetResult() for each category
   ├─ Fetches recurring patterns via recurringPatternsRepo
   ├─ For each category:
   │  ├─ Gets historical average via budgetService
   │  ├─ Gets pattern amount via recurringPatternsRepo
   │  └─ Proposes max(current, historical, pattern)
   ├─ Calculates total budgeted amounts
   ├─ Generates recommendations
   └─ Returns ProposedBudgetCategory[]

4. Response (JSON)
   └─ All Money values as integers (cents)
   └─ Deterministic output
```

## Determinism Guarantees

### 1. No External Data Sources
- All data comes from PostgreSQL only
- No external APIs or data providers
- No time-dependent calculations (except dates)

### 2. Integer-Only Money
- All Money type values are integers (cents)
- No floating-point arithmetic
- Prevents rounding errors

### 3. Sorted Output
- Categories sorted alphabetically
- Variances sorted by magnitude
- Recommendations in consistent order

### 4. Pure Functions
- No side effects
- Same input → same output
- No state mutations

### 5. Idempotent Operations
- Tool execution doesn't modify data
- Safe to call multiple times
- Useful for LLM retry logic

## Privacy & Security

### What's NOT Sent to External LLMs
- SSN or tax IDs
- Account numbers or routing numbers
- Credentials or authentication tokens
- Raw credit card numbers
- Detailed merchant information
- Transaction descriptions

### What CAN Be Sent (if needed)
- Aggregated category spending
- Budget amounts (not sources)
- Variance metrics and trends
- Recommendations (text only)
- Period information (month/year)

### Authentication
- All tool routes require household authorization
- Routes extract householdId from req.context
- Unauthorized requests return 401

## Error Handling

### ApiError Class
```typescript
class ApiError extends Error {
  statusCode: number;           // HTTP status code
  userMessage: string;          // Non-technical user-facing message
  errorCode: string;            // Machine-readable error code
  retryable: boolean;           // Whether to retry is safe
}
```

### Common Errors
- `MISSING_MONTH`: Month parameter not provided
- `MISSING_CHANGES`: Changes array not provided or not an array
- `INVALID_PERIOD`: Requested period has no data
- `HOUSEHOLD_NOT_FOUND`: Household doesn't exist

## Testing Strategy

### Determinism Tests
```typescript
// Same input should produce identical output
const response1 = await request(app).post("/tools/create_initial_budget").send({month: "2026-8"});
const response2 = await request(app).post("/tools/create_initial_budget").send({month: "2026-8"});
expect(response1.body).toEqual(response2.body);
```

### Money Type Validation
```typescript
// All *Cents fields must be integers
const validateMoneyType = (obj) => {
  for (const [key, value] of Object.entries(obj)) {
    if (key.endsWith("Cents")) {
      expect(Number.isInteger(value)).toBe(true);
    }
  }
};
```

### Integration Tests
- Mock repositories with test data
- Verify tool outputs match contract types
- Test edge cases (empty history, no budgets)
- Verify error messages are user-friendly

## Integration with LLM Layer

### Message Generation Flow
```
1. LLM receives tool definitions and current conversation
2. LLM classifies user intent (budget planning, analysis, etc.)
3. LLM determines which tools to use
4. LLM prepares tool input (e.g., {month: "2026-8"})
5. Agent invokes tool via HTTP API
6. Tool returns deterministic result
7. LLM generates natural language response
```

### Tool Context for LLM
```typescript
// Tool definition for LLM
{
  name: "create_initial_budget",
  description: "Create an initial budget from historical spending patterns",
  parameters: {
    month: "string (format: YYYY-M)",
    incomeMethodCents: "optional number (cents)",
  },
  returns: {
    proposedBudgets: "array of {category, recommendedBudgetCents, rationale}",
    projectedSurplusCents: "integer (cents)"
  }
}
```

## Future Enhancements

1. **Tool Execution Logging**: Record all tool invocations for audit trail
2. **Performance Metrics**: Track execution time and cache results
3. **Batch Operations**: Process multiple households efficiently
4. **Webhooks**: Notify systems of significant budget changes
5. **Explanations**: Generate detailed calculation breakdowns
6. **Confidence Scores**: Return certainty levels for recommendations

## Related Documentation

- [Financial Snapshot Calculation](./FINANCIAL_SNAPSHOT_CALCULATION.md)
- [Domain Services Design](../../packages/domain/README.md)
- [API Contract Types](../../packages/contracts/index.ts)
- [Integration Testing Guide](../../docs/INTEGRATION_TESTING.md)

## Version History

- **v1.0** (2026-08-17): Initial implementation with 4 deterministic tools
  - create_initial_budget
  - analyze_budget_variance
  - plan_next_month_budget
  - simulate_budget_change
