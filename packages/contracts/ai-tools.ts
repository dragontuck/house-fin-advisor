/**
 * AI Tool Contracts for Slice 4 Financial Advisor
 *
 * These contracts define typed adapters that give the LLM access to financial domain services.
 * Each tool:
 * - Operates within a household scope (enforced by authorization)
 * - Returns structured, traceable financial data
 * - Never invents balances, rates, or transactions
 * - May only call existing domain services (no new calculations)
 * - Includes input validation, output schema, and household isolation
 */

import {
    EntityId,
    Money,
    FinancialSnapshot,
    Budget,
    BudgetResult,
    Account,
    SavingsGoal,
    DebtAnalysis,
    AttentionItem,
    RecurringPattern,
} from "./index";

/**
 * Authorization levels for tools (enforced by API layer before tool execution)
 */
export enum ToolAuthorizationLevel {
    /** Any authenticated household member can invoke */
    HOUSEHOLD_MEMBER = "HOUSEHOLD_MEMBER",
    /** Only household owner can invoke */
    HOUSEHOLD_OWNER = "HOUSEHOLD_OWNER",
}

/**
 * Data classification for audit logging and compliance
 */
export enum ToolDataClassification {
    /** Public, non-sensitive financial data (e.g., summary balances) */
    PUBLIC = "PUBLIC",
    /** Internal use only (e.g., full account details with numbers) */
    INTERNAL = "INTERNAL",
    /** Highly sensitive (e.g., SSN, credentials) — never exposed to LLM */
    CONFIDENTIAL = "CONFIDENTIAL",
}

/**
 * Base structure for all AI tool definitions
 */
export interface AIToolDefinition {
    /** Unique tool name (used in logs and tool invocation) */
    name: string;
    /** Human-readable description of what the tool does */
    description: string;
    /** Tool implementation version (for reproducibility and debugging) */
    version: number;
    /** Household scope enforcement */
    householdScope: "REQUIRED";
    /** Authorization requirement */
    authorizationLevel: ToolAuthorizationLevel;
    /** Data classification of the output */
    outputClassification: ToolDataClassification;
}

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL 1: get_financial_snapshot
 *
 * Returns the latest FinancialSnapshot for a household.
 * Provides: net worth, cash, debt, health status, and emergency fund metrics.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export interface GetFinancialSnapshotInput {
    householdId: EntityId;
    /** If true, only return data calculated after this date */
    minCalculatedAfter?: Date;
}

export interface GetFinancialSnapshotOutput {
    snapshot: FinancialSnapshot | null; // null if no snapshot exists yet
    error?: string;                      // if calculation failed
}

export const GetFinancialSnapshotTool: AIToolDefinition = {
    name: "get_financial_snapshot",
    description:
        "Retrieves the household's latest financial snapshot including net worth, cash, debt, " +
        "health status, and emergency fund coverage. Used for overall financial health assessment.",
    version: 1,
    householdScope: "REQUIRED",
    authorizationLevel: ToolAuthorizationLevel.HOUSEHOLD_MEMBER,
    outputClassification: ToolDataClassification.INTERNAL,
};

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL 2: get_cash_flow
 *
 * Returns current-month and multi-month cash flow projections.
 * Provides: income, expenses, surplus/deficit, and forecast confidence.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export interface GetCashFlowInput {
    householdId: EntityId;
    /** Month to analyze (format: "YYYY-M", e.g. "2026-8") */
    month?: string;
    /** How many months ahead to forecast (1-12) */
    forecastMonths?: number;
}

export interface CashFlowMonthData {
    month: string;                       // "YYYY-M"
    projectedIncomeCents: number;
    projectedEssentialExpensesCents: number;
    projectedDiscretionaryExpensesCents: number;
    projectedSurplusCents: number;       // positive = surplus, negative = deficit
    confidence: "LOW" | "MEDIUM" | "HIGH";
    assumptions: Array<{ key: string; value: string; reasoning: string }>;
}

export interface GetCashFlowOutput {
    householdId: EntityId;
    currentMonth: CashFlowMonthData | null;
    forecast: CashFlowMonthData[];        // future months
    historicalAverage?: {
        monthlyIncomeCents: number;
        monthlyExpensesCents: number;
        monthlySurplusCents: number;
    };
    error?: string;
}

export const GetCashFlowTool: AIToolDefinition = {
    name: "get_cash_flow",
    description:
        "Analyzes household cash flow for the current month and forecasts future months. " +
        "Returns income, expenses, surplus/deficit, and confidence levels based on recurring patterns.",
    version: 1,
    householdScope: "REQUIRED",
    authorizationLevel: ToolAuthorizationLevel.HOUSEHOLD_MEMBER,
    outputClassification: ToolDataClassification.INTERNAL,
};

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL 3: get_current_budget
 *
 * Returns the current month's budget for all categories.
 * Provides: budgeted amounts for each category.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export interface GetCurrentBudgetInput {
    householdId: EntityId;
    /** Month to fetch (format: "YYYY-M", defaults to current month) */
    month?: string;
}

export interface GetCurrentBudgetOutput {
    householdId: EntityId;
    period: string;                      // "YYYY-M"
    budgets: Budget[];
    totalBudgetedCents: number;
    categoryCount: number;
    error?: string;
}

export const GetCurrentBudgetTool: AIToolDefinition = {
    name: "get_current_budget",
    description:
        "Retrieves the household's current budget allocations by category. " +
        "Lists all budgeted categories and their amounts.",
    version: 1,
    householdScope: "REQUIRED",
    authorizationLevel: ToolAuthorizationLevel.HOUSEHOLD_MEMBER,
    outputClassification: ToolDataClassification.INTERNAL,
};

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL 4: get_budget_status
 *
 * Returns actual spending vs. budget for the current month.
 * Provides: variance, remaining budget, and projected overspend.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export interface GetBudgetStatusInput {
    householdId: EntityId;
    /** Month to analyze (defaults to current month) */
    month?: string;
    /** Include only overspent categories? (for problem diagnosis) */
    overSpentOnly?: boolean;
}

export interface BudgetCategoryStatus {
    category: string;
    budgetedCents: number;
    actualCents: number;
    varianceCents: number;                // actual - budget; positive = over
    remainingCents: number;               // budget - actual
    isOverBudget: boolean;
    projectedMonthEndCents?: number;      // if not yet end of month
}

export interface GetBudgetStatusOutput {
    householdId: EntityId;
    period: string;                       // "YYYY-M"
    asOf: Date;
    categories: BudgetCategoryStatus[];
    totalBudgetedCents: number;
    totalActualCents: number;
    totalVarianceCents: number;
    overBudgetCount: number;
    error?: string;
}

export const GetBudgetStatusTool: AIToolDefinition = {
    name: "get_budget_status",
    description:
        "Compares actual spending to budget for the current month. " +
        "Shows which categories are over/under budget and by how much. Used for budget diagnosis.",
    version: 1,
    householdScope: "REQUIRED",
    authorizationLevel: ToolAuthorizationLevel.HOUSEHOLD_MEMBER,
    outputClassification: ToolDataClassification.INTERNAL,
};

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL 5: get_historical_budget_performance
 *
 * Returns how the household's spending patterns compare across months.
 * Provides: multi-month budget vs. actual to identify trends.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export interface GetHistoricalBudgetPerformanceInput {
    householdId: EntityId;
    /** How many months of history to return (default 3, max 12) */
    months?: number;
    /** Categories to filter (if empty, all categories included) */
    categories?: string[];
}

export interface MonthlyBudgetPerformance {
    period: string;                       // "YYYY-M"
    categories: BudgetCategoryStatus[];
    totalBudgetedCents: number;
    totalActualCents: number;
    totalVarianceCents: number;
}

export interface GetHistoricalBudgetPerformanceOutput {
    householdId: EntityId;
    months: MonthlyBudgetPerformance[];
    trendSummary?: {
        averageMonthlyBudgetCents: number;
        averageMonthlyActualCents: number;
        averageVarianceCents: number;
        totalOverBudgetMonths: number;
        totalUnderBudgetMonths: number;
    };
    error?: string;
}

export const GetHistoricalBudgetPerformanceTool: AIToolDefinition = {
    name: "get_historical_budget_performance",
    description:
        "Returns multi-month budget vs. actual spending to identify trends and patterns. " +
        "Used to analyze budget discipline and detect spending changes.",
    version: 1,
    householdScope: "REQUIRED",
    authorizationLevel: ToolAuthorizationLevel.HOUSEHOLD_MEMBER,
    outputClassification: ToolDataClassification.INTERNAL,
};

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL 6: get_goal_status
 *
 * Returns progress on all savings goals.
 * Provides: target amount, current progress, timeline, and confidence.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export interface GetGoalStatusInput {
    householdId: EntityId;
    /** Filter to active/completed/all goals */
    status?: "ACTIVE" | "COMPLETED" | "ALL";
}

export interface GoalStatusDetail extends SavingsGoal {
    currentProgressCents: number;
    percentComplete: number;
    remainingCents: number;
    daysUntilTarget: number | null;
    isOnTrack: boolean;
}

export interface GetGoalStatusOutput {
    householdId: EntityId;
    goals: GoalStatusDetail[];
    activeGoalCount: number;
    completedGoalCount: number;
    totalTargetCents: number;
    totalCurrentProgressCents: number;
    error?: string;
}

export const GetGoalStatusTool: AIToolDefinition = {
    name: "get_goal_status",
    description:
        "Retrieves progress on all household savings goals. " +
        "Shows target amounts, current progress, timelines, and whether goals are on track.",
    version: 1,
    householdScope: "REQUIRED",
    authorizationLevel: ToolAuthorizationLevel.HOUSEHOLD_MEMBER,
    outputClassification: ToolDataClassification.INTERNAL,
};

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL 7: get_debt_summary
 *
 * Returns overview of all debt accounts and health status.
 * Provides: total debt, interest rates, minimum payments, health status.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export interface GetDebtSummaryInput {
    householdId: EntityId;
    /** Include detailed analysis of debt trends */
    detailed?: boolean;
}

export interface DebtAccountSummary {
    accountId: EntityId;
    accountName: string;
    accountType: string;                  // CREDIT_CARD, LOAN, MORTGAGE, etc.
    balanceCents: number;
    creditLimitCents?: number;
    interestRateBps: number;              // basis points (1% = 100 bps)
    minimumPaymentCents?: number;
    daysOverdue?: number;
}

export interface GetDebtSummaryOutput {
    householdId: EntityId;
    totalDebtCents: number;
    debtAccounts: DebtAccountSummary[];
    debtHealthStatus: string;             // HEALTHY, WATCH, AT_RISK, CRITICAL
    monthlyMinimumPaymentCents?: number;
    analysis?: DebtAnalysis;
    error?: string;
}

export const GetDebtSummaryTool: AIToolDefinition = {
    name: "get_debt_summary",
    description:
        "Provides a comprehensive overview of all debt including balances, interest rates, " +
        "minimum payments, and health status. Used for debt management and refinancing decisions.",
    version: 1,
    householdScope: "REQUIRED",
    authorizationLevel: ToolAuthorizationLevel.HOUSEHOLD_MEMBER,
    outputClassification: ToolDataClassification.INTERNAL,
};

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL 8: get_attention_items
 *
 * Returns actionable financial issues requiring attention.
 * Provides: alerts about over-budget, low emergency fund, data staleness, etc.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export interface GetAttentionItemsInput {
    householdId: EntityId;
    /** Filter by severity: CRITICAL, HIGH, MEDIUM, LOW, or empty for all */
    severityFilter?: string[];
    /** Only unresolved items */
    unresolvedOnly?: boolean;
}

export interface GetAttentionItemsOutput {
    householdId: EntityId;
    items: AttentionItem[];
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    error?: string;
}

export const GetAttentionItemsTool: AIToolDefinition = {
    name: "get_attention_items",
    description:
        "Lists financial issues that require attention, such as overspent categories, " +
        "low emergency fund, high debt levels, or stale data. Severity levels indicate priority.",
    version: 1,
    householdScope: "REQUIRED",
    authorizationLevel: ToolAuthorizationLevel.HOUSEHOLD_MEMBER,
    outputClassification: ToolDataClassification.INTERNAL,
};

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL 9: get_recurring_financial_items
 *
 * Returns detected recurring income and expense patterns.
 * Provides: recurring transactions, frequency, confidence, and trend data.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export interface GetRecurringFinancialItemsInput {
    householdId: EntityId;
    /** Filter by frequency (WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, ANNUAL, IRREGULAR, UNKNOWN) */
    frequencyFilter?: string[];
    /** Only show patterns with confidence >= threshold (0-1) */
    minConfidence?: number;
}

export interface RecurringItemDetail extends RecurringPattern {
    estimatedMonthlyImpactCents: number;
    category: string | null;
}

export interface GetRecurringFinancialItemsOutput {
    householdId: EntityId;
    incomePatterns: RecurringItemDetail[];
    expensePatterns: RecurringItemDetail[];
    estimatedMonthlyIncomeCents: number;
    estimatedMonthlyExpensesCents: number;
    estimatedMonthlySurplusCents: number;
    totalPatternsFound: number;
    error?: string;
}

export const GetRecurringFinancialItemsTool: AIToolDefinition = {
    name: "get_recurring_financial_items",
    description:
        "Detects and returns recurring income and expense patterns based on historical transactions. " +
        "Shows frequency, confidence levels, and typical amounts. Used for cash flow projection and budget planning.",
    version: 1,
    householdScope: "REQUIRED",
    authorizationLevel: ToolAuthorizationLevel.HOUSEHOLD_MEMBER,
    outputClassification: ToolDataClassification.INTERNAL,
};

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL 10: simulate_purchase
 *
 * Simulates the financial impact of a one-time purchase.
 * Provides: impact on cash, debt, emergency fund, and budget.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export interface SimulatePurchaseInput {
    householdId: EntityId;
    purchaseAmountCents: Money;
    /** How will this be paid: CASH, CREDIT_CARD, LOAN, SAVINGS */
    paymentMethod: "CASH" | "CREDIT_CARD" | "LOAN" | "SAVINGS";
    description: string;                  // What is being purchased
    category?: string;                    // Budget category (if applicable)
}

export interface SimulatePurchaseOutput {
    householdId: EntityId;
    scenario: {
        purchaseAmountCents: Money;
        paymentMethod: string;
        description: string;
    };
    projectedImpact: {
        currentLiquidCashCents: Money;
        projectedLiquidCashCents: Money;
        affectsCashPosition: boolean;
        affectsDebtLevel: boolean;
        affectsEmergencyFund: boolean;
        budgetImpactCategory?: string;
    };
    recommendations: string[];
    isAffordable: boolean;                // Based on emergency fund + surplus
    error?: string;
}

export const SimulatePurchaseTool: AIToolDefinition = {
    name: "simulate_purchase",
    description:
        "Simulates the financial impact of a potential one-time purchase. " +
        "Shows impact on cash, debt, emergency fund, and whether the purchase is affordable.",
    version: 1,
    householdScope: "REQUIRED",
    authorizationLevel: ToolAuthorizationLevel.HOUSEHOLD_MEMBER,
    outputClassification: ToolDataClassification.INTERNAL,
};

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL 11: simulate_budget_change
 *
 * Simulates the impact of changing budget allocations.
 * Provides: impact on surplus, cash flow, and financial health.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export interface SimulateBudgetChangeInput {
    householdId: EntityId;
    /** Budget changes to apply: Map of category -> new budgeted amount in cents */
    changes: Array<{ category: string; newBudgetCents: Money }>;
    month?: string;                       // Month to apply (defaults to current)
}

export interface SimulateBudgetChangeOutput {
    householdId: EntityId;
    month: string;
    currentBudgetTotalCents: Money;
    projectedBudgetTotalCents: Money;
    budgetChanges: Array<{
        category: string;
        currentBudgetCents: Money;
        projectedBudgetCents: Money;
        changeCents: Money;
    }>;
    impactOnSurplus?: {
        currentSurplusCents: Money;
        projectedSurplusCents: Money;
        changeCents: Money;
    };
    recommendations: string[];
    error?: string;
}

export const SimulateBudgetChangeTool: AIToolDefinition = {
    name: "simulate_budget_change",
    description:
        "Simulates the impact of reallocating budget across categories. " +
        "Shows how changes affect monthly surplus and financial health.",
    version: 1,
    householdScope: "REQUIRED",
    authorizationLevel: ToolAuthorizationLevel.HOUSEHOLD_MEMBER,
    outputClassification: ToolDataClassification.INTERNAL,
};

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL 12: create_initial_budget
 *
 * Creates an initial budget based on income and expense history.
 * Provides: recommended budget allocations by category.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export interface CreateInitialBudgetInput {
    householdId: EntityId;
    month: string;                        // "YYYY-M" when budget should apply
    /** Use household settings income/expenses or override */
    incomeMethodCents?: Money;
    essentialExpensesCents?: Money;
    discretionaryExpensesCents?: Money;
}

export interface ProposedBudgetCategory {
    category: string;
    recommendedBudgetCents: Money;
    historicalAverageCents?: Money;
    rationale: string;
}

export interface CreateInitialBudgetOutput {
    householdId: EntityId;
    month: string;
    proposedBudgets: ProposedBudgetCategory[];
    totalBudgetedCents: Money;
    monthlyIncomeCents: Money;
    monthlyExpensesCents: Money;
    projectedSurplusCents: Money;
    recommendations: string[];
    error?: string;
}

export const CreateInitialBudgetTool: AIToolDefinition = {
    name: "create_initial_budget",
    description:
        "Creates an initial budget recommendation based on household income and spending history. " +
        "Suggests category allocations to balance essential and discretionary spending.",
    version: 1,
    householdScope: "REQUIRED",
    authorizationLevel: ToolAuthorizationLevel.HOUSEHOLD_OWNER,
    outputClassification: ToolDataClassification.INTERNAL,
};

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL 13: analyze_budget_variance
 *
 * Analyzes why actual spending differs from budget across months.
 * Provides: variance trends, explanations, and recommendations.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export interface AnalyzeBudgetVarianceInput {
    householdId: EntityId;
    /** Categories to analyze (if empty, all categories included) */
    categories?: string[];
    /** How many months of history (default 3, max 12) */
    months?: number;
}

export interface VarianceTrend {
    category: string;
    avgVarianceCents: number;
    maxVarianceCents: number;
    minVarianceCents: number;
    overBudgetMonthCount: number;
    totalMonthsAnalyzed: number;
    trend: "IMPROVING" | "WORSENING" | "STABLE";
}

export interface AnalyzeBudgetVarianceOutput {
    householdId: EntityId;
    periodAnalyzed: string;               // "YYYY-M through YYYY-M"
    monthsIncluded: number;
    categoryVariances: VarianceTrend[];
    overallTrend: "IMPROVING" | "WORSENING" | "STABLE";
    typicalVarianceCents: number;
    recommendations: string[];
    error?: string;
}

export const AnalyzeBudgetVarianceTool: AIToolDefinition = {
    name: "analyze_budget_variance",
    description:
        "Analyzes spending variance patterns across multiple months to identify where the household " +
        "consistently overspends or underspends. Provides trend analysis and recommendations.",
    version: 1,
    householdScope: "REQUIRED",
    authorizationLevel: ToolAuthorizationLevel.HOUSEHOLD_MEMBER,
    outputClassification: ToolDataClassification.INTERNAL,
};

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL 14: plan_next_month_budget
 *
 * Proposes next month's budget based on current trends and recurring patterns.
 * Provides: recommended category allocations for the next month.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export interface PlanNextMonthBudgetInput {
    householdId: EntityId;
    /** Explicitly override estimated income (in cents) */
    incomeOverrideCents?: Money;
    /** Known upcoming expenses to account for */
    knownUpcomingExpenses?: Array<{
        description: string;
        estimatedAmountCents: Money;
        category: string;
    }>;
}

export interface NextMonthBudgetProposal {
    category: string;
    proposedBudgetCents: Money;
    currentBudgetCents?: Money;
    historicalAverageCents?: Money;
    isBasedOnRecurring: boolean;
    rationale: string;
}

export interface PlanNextMonthBudgetOutput {
    householdId: EntityId;
    nextMonth: string;                    // "YYYY-M"
    estimatedIncomeCents: Money;
    proposedBudgets: NextMonthBudgetProposal[];
    totalProposedBudgetCents: Money;
    projectedSurplusCents: Money;
    knownUpcomingExpensesAccountedFor: boolean;
    recommendations: string[];
    error?: string;
}

export const PlanNextMonthBudgetTool: AIToolDefinition = {
    name: "plan_next_month_budget",
    description:
        "Proposes the next month's budget based on current spending trends and recurring patterns. " +
        "Accounts for known upcoming expenses and seasonal variations.",
    version: 1,
    householdScope: "REQUIRED",
    authorizationLevel: ToolAuthorizationLevel.HOUSEHOLD_MEMBER,
    outputClassification: ToolDataClassification.INTERNAL,
};

/**
 * Registry of all AI tools for easy lookup and validation
 */
export const AIToolRegistry = [
    GetFinancialSnapshotTool,
    GetCashFlowTool,
    GetCurrentBudgetTool,
    GetBudgetStatusTool,
    GetHistoricalBudgetPerformanceTool,
    GetGoalStatusTool,
    GetDebtSummaryTool,
    GetAttentionItemsTool,
    GetRecurringFinancialItemsTool,
    SimulatePurchaseTool,
    SimulateBudgetChangeTool,
    CreateInitialBudgetTool,
    AnalyzeBudgetVarianceTool,
    PlanNextMonthBudgetTool,
];

/**
 * Type union of all tool input types (for dispatch)
 */
export type AIToolInput =
    | GetFinancialSnapshotInput
    | GetCashFlowInput
    | GetCurrentBudgetInput
    | GetBudgetStatusInput
    | GetHistoricalBudgetPerformanceInput
    | GetGoalStatusInput
    | GetDebtSummaryInput
    | GetAttentionItemsInput
    | GetRecurringFinancialItemsInput
    | SimulatePurchaseInput
    | SimulateBudgetChangeInput
    | CreateInitialBudgetInput
    | AnalyzeBudgetVarianceInput
    | PlanNextMonthBudgetInput;

/**
 * Type union of all tool output types (for dispatch)
 */
export type AIToolOutput =
    | GetFinancialSnapshotOutput
    | GetCashFlowOutput
    | GetCurrentBudgetOutput
    | GetBudgetStatusOutput
    | GetHistoricalBudgetPerformanceOutput
    | GetGoalStatusOutput
    | GetDebtSummaryOutput
    | GetAttentionItemsOutput
    | GetRecurringFinancialItemsOutput
    | SimulatePurchaseOutput
    | SimulateBudgetChangeOutput
    | CreateInitialBudgetOutput
    | AnalyzeBudgetVarianceOutput
    | PlanNextMonthBudgetOutput;
