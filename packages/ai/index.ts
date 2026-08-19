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

// LLM Provider Exports
export {
    type LLMMessage,
    type LLMRequest,
    type LLMResponse,
    type LLMToolDefinition,
    type LLMToolCall,
    type LLMProviderConfig,
    type LLMUsageMetrics,
    type LLMTelemetryHandler,
    type LLMProvider,
    type LLMProviderFactory,
    LLMProviderError,
} from "./llm-provider";

export {
    BaseProvider,
} from "./base-provider";

export {
    AnthropicProvider,
} from "./anthropic-provider";

export {
    DefaultLLMProviderFactory,
    setGlobalProviderFactory,
    getProviderFactory,
    createLLMProvider,
    createDefaultLLMProvider,
} from "./llm-provider-factory";

export {
    InMemoryTelemetryHandler,
    NoOpTelemetryHandler,
    createTelemetryHandler,
} from "./telemetry-handler";
