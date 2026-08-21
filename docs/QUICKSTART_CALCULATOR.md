# Quick Start: FinancialSnapshot Calculator

## Overview
The `FinancialSnapshotCalculator` calculates deterministic financial metrics for a household. All calculations use integer cent values to ensure precision.

## Installation

The calculator is already exported from the domain package:

```typescript
import { 
  createFinancialSnapshotCalculator,
  CalculateSnapshotInput
} from "@house-fin/domain";
```

## Basic Usage

### 1. Create Calculator Instance

```typescript
const calculator = createFinancialSnapshotCalculator();
```

### 2. Prepare Input

```typescript
import { EntityId, MoneyFromDollars } from "@house-fin/contracts";

const input: CalculateSnapshotInput = {
  householdId: EntityId("household-123"),
  accounts: [
    // Array of Account objects (typically from database)
  ],
  monthlyIncome: MoneyFromDollars(12000),
  monthlyEssentialExpenses: MoneyFromDollars(6800),
  monthlyDiscretionaryExpenses: MoneyFromDollars(1200),
  asOf: new Date(),
};
```

### 3. Calculate

```typescript
const snapshot = calculator.calculate(input);
```

### 4. Use Result

```typescript
// All values are Money type (integer cents)
console.log(snapshot.cash);           // 1920000 cents = $19,200
console.log(snapshot.debt);           // 24000000 cents = $240,000
console.log(snapshot.netWorth);       // 18920000 cents = $189,200
console.log(snapshot.monthlySurplus); // 400000 cents = $4,000
console.log(snapshot.financialHealthStatus); // "HEALTHY"

// Convert to dollars if needed
import { MoneyToDollars } from "@house-fin/contracts";
console.log(MoneyToDollars(snapshot.cash)); // 19200 (as number)
```

### 5. Persist

```typescript
// Snapshot is ready for database persistence
// (missing id and createdAt which database adds)
const saved = await snapshotRepository.create(snapshot);
```

## Full Example

```typescript
import { 
  Account,
  AccountType,
  AccountOwnership,
  AccountStatus,
  EntityId,
  MoneyFromDollars,
  MoneyToDollars,
} from "@house-fin/contracts";
import { createFinancialSnapshotCalculator } from "@house-fin/domain";

// Initialize calculator
const calculator = createFinancialSnapshotCalculator();

// Define household accounts
const accounts: Account[] = [
  {
    id: EntityId("acc-1"),
    householdId: EntityId("hh-1"),
    name: "Checking",
    type: AccountType.CHECKING,
    ownership: AccountOwnership.JOINT,
    currency: "USD",
    currentBalance: MoneyFromDollars(5000),
    status: AccountStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUpdatedAt: new Date(),
  },
  {
    id: EntityId("acc-2"),
    householdId: EntityId("hh-1"),
    name: "Savings",
    type: AccountType.SAVINGS,
    ownership: AccountOwnership.JOINT,
    currency: "USD",
    currentBalance: MoneyFromDollars(20000),
    status: AccountStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUpdatedAt: new Date(),
  },
];

// Calculate snapshot
const snapshot = calculator.calculate({
  householdId: EntityId("hh-1"),
  accounts,
  monthlyIncome: MoneyFromDollars(5000),
  monthlyEssentialExpenses: MoneyFromDollars(3000),
  monthlyDiscretionaryExpenses: MoneyFromDollars(500),
  asOf: new Date(),
});

// Display results
console.log(`Cash: $${MoneyToDollars(snapshot.cash)}`);
console.log(`Monthly Surplus: $${MoneyToDollars(snapshot.monthlySurplus)}`);
console.log(`Health: ${snapshot.financialHealthStatus}`);
```

## Key Metrics

### Cash
Liquid funds: CHECKING + SAVINGS (active only)
```typescript
MoneyToDollars(snapshot.cash)
```

### Debt
Outstanding liabilities: absolute value of CREDIT_CARD + LOAN + MORTGAGE balances
```typescript
MoneyToDollars(snapshot.debt)
```

### Net Worth
Total assets minus liabilities:
```typescript
MoneyToDollars(snapshot.netWorth)
```

### Monthly Surplus
Income minus expenses (can be negative):
```typescript
MoneyToDollars(snapshot.monthlySurplus)
```

### Health Status
Three levels: `HEALTHY` | `ATTENTION` | `AT_RISK`
```typescript
snapshot.financialHealthStatus
```

## Account Types

Fully supported:
- `CHECKING` - Liquid asset
- `SAVINGS` - Liquid asset
- `RETIREMENT` - Investment asset
- `INVESTMENT` - Investment asset
- `CREDIT_CARD` - Liability
- `LOAN` - Liability
- `MORTGAGE` - Liability

Unsupported types will throw an error.

## Error Handling

```typescript
try {
  const snapshot = calculator.calculate(input);
} catch (error) {
  if (error.message.includes("Unsupported account type")) {
    console.error("Account has unsupported type");
  }
}
```

## Testing

Run all tests:
```bash
npm test
```

Run calculator tests only:
```bash
npm test snapshot-calculator
```

Run Tucker Household validation:
```bash
npm test tucker-household
```

## Tips

1. **Money Type**: Always use `MoneyFromDollars()` for input, `MoneyToDollars()` for output
2. **Status Filtering**: Automatic - only ACTIVE accounts are processed
3. **Determinism**: Same inputs always produce identical outputs
4. **Performance**: O(n) time complexity, typically < 1ms for typical household

## Common Patterns

### Calculate and Save

```typescript
const snapshot = calculator.calculate({
  householdId,
  accounts,
  monthlyIncome,
  monthlyEssentialExpenses,
  monthlyDiscretionaryExpenses,
  asOf: new Date(),
});

const saved = await snapshotRepository.create(snapshot);
```

### Check Financial Health

```typescript
const snapshot = calculator.calculate(input);

switch (snapshot.financialHealthStatus) {
  case FinancialHealthStatus.HEALTHY:
    console.log("Great financial position!");
    break;
  case FinancialHealthStatus.ATTENTION:
    console.log("Room for improvement");
    break;
  case FinancialHealthStatus.AT_RISK:
    console.log("Financial risks detected");
    break;
}
```

### Analyze Cash Flow

```typescript
const surplus = MoneyToDollars(snapshot.monthlySurplus);

if (surplus > 0) {
  console.log(`Saving $${surplus} per month`);
} else {
  console.log(`Deficit of $${Math.abs(surplus)} per month`);
}
```

## See Also

- [FINANCIAL_SNAPSHOT_CALCULATION.md](FINANCIAL_SNAPSHOT_CALCULATION.md) - Detailed documentation
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Complete implementation details
- `tests/financial/snapshot-calculator.test.ts` - Comprehensive test suite
- `tests/financial/tucker-household.test.ts` - Real-world example tests

## Support

For questions about the calculator:
1. Review the test files for examples
2. Check FINANCIAL_SNAPSHOT_CALCULATION.md for detailed rules
3. Look at Tucker Household tests for real-world usage patterns
