/**
 * AI Tools Package Exports
 */

export {
    createInitialBudget,
    analyzeBudgetVariance,
    planNextMonthBudget,
    simulateBudgetChange,
    simulatePurchase,
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

// AI Orchestration Exports
export {
    AIToolPlanner,
    type PlannedToolCall,
    type ToolExecutionPlan,
    getToolPlanner,
    setToolPlanner,
} from "./ai-tool-planner";

export {
    AIToolExecutor,
    type ToolExecutionResult,
    type ToolExecutionContext,
    type AuthorizationCheckResult,
    type ToolResolver,
    getToolExecutor,
    setToolExecutor,
} from "./ai-tool-executor";

export {
    AIOrchestrator,
    type OrchestratorRequest,
    type OrchestratorResponse,
    createAIOrchestrator,
    getAIOrchestrator,
    initializeAIOrchestrator,
} from "./ai-orchestrator";

export {
    validateGroundedResponse,
    buildSafeFallback,
    type GroundingResult,
    type GroundingViolation,
    type GroundingViolationType,
    type GroundingResearchEvidence,
} from "./response-grounding";

export {
    resolveConversationalReference,
    findLastScenarioReference,
    detectStaleFinancialConflict,
    extractNumericFacts,
    extractScenarioSubject,
    containsPronounReference,
    extractDollarAmountCents,
    extractPaymentMethod,
    STALE_FINANCIAL_DATA_EXPLANATION,
    type ConversationTurn,
    type ScenarioReference,
    type ContinuityResolution,
    type StaleDataCheck,
} from "./conversation-continuity";

export {
    determineResearchRequirement,
    performRequiredResearch,
    type ResearchRequirementLevel,
    type ResearchTopic,
    type ResearchQuery,
    type ResearchRequirement,
    type RecommendationResearchContext,
    type RecommendationResearchProvider,
    type RecommendationResearchOutcome,
    researchClaimRelevance,
} from "./recommendation-research";

export {
    CachedEvidenceResearchProvider,
    defaultControlledResearchConfig,
    type AllowlistedResearchSource,
    type ControlledResearchConfig,
} from "./production-research-provider";

export {
    buildToolBackedRecommendationWorkflow,
    isRecommendationWorkflow,
    resolveAdvisorStyle,
    type OrchestratedRecommendationWorkflow,
    type AdvisorStyle,
} from "./recommendation-workflow";

export {
    buildAuditLogEntry,
    type BuildAuditLogEntryInput,
} from "./audit-log";

export {
    buildDecisionJournalEntry,
    isHistoricalRecommendationQuestion,
    type BuildDecisionJournalEntryInput,
} from "./decision-journal";

export {
    AdvisorFailureCategory,
    buildAdvisorFailure,
    classifyLLMError,
    classifyPrivacyError,
    classifyCriticalToolFailure,
    classifyStaleSnapshot,
    type AdvisorFailure,
} from "./graceful-failure";
