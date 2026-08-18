/**
 * AI Tools Package Exports
 */

export {
    createInitialBudget,
    analyzeBudgetVariance,
    planNextMonthBudget,
    simulateBudgetChange,
    createToolDependencies,
    type ToolDependencies,
} from "./tool-implementations";

export {
    FinancialContextBuilder,
    createFinancialContextBuilder,
    type FinancialContext,
    type ContextBuilderDependencies,
    type DataPointMetadata,
    type CurrentBudgetContext,
    type BudgetPerformanceContext,
    type RecurringObligationsContext,
    type CashFlowContext,
    type AttentionItem,
} from "./financial-context-builder";
