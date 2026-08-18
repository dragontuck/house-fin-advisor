/**
 * Integration Guide: Financial Context Builder with Advisor Conversations
 *
 * This document describes how to integrate the Financial Context Builder
 * into the advisor conversation workflow at the API level.
 */

/**
 * STEP 1: Update RouteContext in apps/api/src/routes/types.ts (COMPLETED)
 *
 * ✅ Added to interface:
 * - contextBuilder: FinancialContextBuilder;
 * - contextService: AdvisorContextService;
 */

/**
 * STEP 2: Update server.ts to create instances and pass via RouteContext
 *
 * Add these imports:
 *
 * ```typescript
 * import {
 *     AdvisorContextService,
 *     createAdvisorContextService,
 * } from "@house-fin/domain";
 * import {
 *     createFinancialContextBuilder,
 * } from "@house-fin/ai";
 * ```
 *
 * In createServer() function, after creating advisorService:
 *
 * ```typescript
 * // Create Financial Context Builder with repository dependencies
 * const contextBuilder = createFinancialContextBuilder({
 *     budgetRepo,
 *     transactionRepo: postingRepo,  // PostingRepository implements transaction queries
 *     settingsRepo,
 *     recurringPatternsRepo: recurringDetector,  // RecurringDetector can provide patterns
 *     snapshotRepo,
 *     debtRepo,
 *     goalsRepo: savingsGoalRepo,
 * });
 *
 * // Create context service for conversation orchestration
 * const contextService = createAdvisorContextService(contextBuilder);
 * ```
 *
 * When creating RouteContext (before registerAllRoutes), add:
 *
 * ```typescript
 * const context: RouteContext = {
 *     app,
 *     householdService,
 *     reviewQueueService,
 *     postingService,
 *     advisorService,
 *     contextBuilder,      // ADD THIS
 *     contextService,      // ADD THIS
 *     householdRepo,
 *     memberRepo,
 *     accountRepo,
 *     snapshotRepo,
 *     settingsRepo,
 *     documentRepo,
 *     reviewItemRepo,
 *     postingRepo,
 *     budgetRepo,
 *     cashFlowRepo,
 *     savingsGoalRepo,
 *     debtRepo,
 *     conversationRepo,
 *     messageRepo,
 *     workflowRepo,
 *     toolExecutionRepo,
 *     storageAdapter,
 * };
 *
 * // Register all routes
 * registerAllRoutes(context);
 * ```
 */

/**
 * STEP 3: Update advisor-conversations.ts to use FinancialContextBuilder
 *
 * In POST /conversations/:conversationId/messages endpoint:
 *
 * ```typescript
 * app.post(
 *     "/conversations/:conversationId/messages",
 *     async (req: Request, res: Response, next: NextFunction) => {
 *         try {
 *             const { conversationId } = req.params;
 *             const householdId = req.context!.householdId;
 *             const { content } = req.body;
 *
 *             // 1. Add user message
 *             const userMessage = await advisorService.addMessage({
 *                 conversationId: conversationId as EntityId,
 *                 role: AdvisorMessageRole.USER,
 *                 content: content.trim(),
 *             });
 *
 *             // 2. Classify intent
 *             const classifiedIntent = await intentClassifier.classify(content);
 *
 *             if (classifiedIntent.out_of_scope) {
 *                 // Return out-of-scope response
 *                 return res.status(200).json({ ... });
 *             }
 *
 *             // 3. BUILD FINANCIAL CONTEXT (NEW)
 *             const conversation = await conversationRepo.findById(conversationId as EntityId);
 *             const workflowState: WorkflowState = {
 *                 id: EntityId(...),
 *                 householdId,
 *                 workflowType: classifiedIntent.intent as AdvisorWorkflow,
 *                 state: {},
 *                 status: "ACTIVE",
 *                 createdAt: new Date(),
 *             };
 *
 *             const financialContext = await contextService.buildContextForRequest(
 *                 householdId,
 *                 content,
 *                 workflowState
 *             );
 *
 *             // 4. Build system prompt with context
 *             const systemPrompt = contextService.buildSystemPrompt(financialContext);
 *
 *             // 5. Determine available tools
 *             const availableTools = financialContext.toolsRequired;
 *
 *             // 6. Return to client with context and tools
 *             res.json({
 *                 userMessageId: userMessage.id,
 *                 intent: {
 *                     type: classifiedIntent.intent,
 *                     category: classifiedIntent.category,
 *                     confidence: classifiedIntent.confidence,
 *                 },
 *                 // Financial context
 *                 financialContext: contextService.extractToolContext(financialContext),
 *                 // Available tools for LLM
 *                 availableTools: availableTools.map((tool) => ({
 *                     name: tool,
 *                     description: TOOL_DESCRIPTIONS[tool],
 *                 })),
 *                 // System prompt for LLM
 *                 systemPrompt,
 *                 // Context metadata for audit trail
 *                 contextMetadata: contextService.buildResponseMetadata(financialContext),
 *             });
 *
 *         } catch (error) {
 *             next(error);
 *         }
 *     }
 * );
 * ```
 */

/**
 * STEP 4: Update tool execution endpoints to use FinancialContext
 *
 * In POST /tools/:toolName endpoint:
 *
 * ```typescript
 * app.post("/tools/:toolName", async (req: Request, res: Response, next: NextFunction) => {
 *     try {
 *         const { toolName } = req.params;
 *         const householdId = req.context!.householdId;
 *         const { messageId, financialContext, toolInput } = req.body;
 *
 *         // Tool execution now receives FinancialContext instead of conversation history
 *         // This ensures tools work with authoritative data, not LLM-generated context
 *
 *         const result = await toolExecutor.execute(
 *             toolName,
 *             {
 *                 householdId,
 *                 context: financialContext,  // Pass context, not history
 *                 input: toolInput,
 *             }
 *         );
 *
 *         // Store tool execution with context metadata
 *         const execution = await toolExecutionRepo.create({
 *             id: EntityId(...),
 *             householdId,
 *             messageId: messageId as EntityId,
 *             toolName,
 *             status: "SUCCESS",
 *             input: toolInput,
 *             output: result,
 *             executedAt: new Date(),
 *             metadata: {
 *                 contextAsOf: financialContext.contextAsOf,
 *                 contextVersions: financialContext.contextVersions,
 *             },
 *         });
 *
 *         res.json({
 *             toolExecutionId: execution.id,
 *             result,
 *             metadata: execution.metadata,
 *         });
 *
 *     } catch (error) {
 *         next(error);
 *     }
 * });
 * ```
 */

/**
 * Data Flow Diagram:
 *
 * User Message
 *      ↓
 * Intent Classification → (determines AdvisorWorkflow type)
 *      ↓
 * Financial Context Builder
 *      ├─ Query budgetRepo for current month
 *      ├─ Query transactionRepo for actuals
 *      ├─ Query settingsRepo for income
 *      ├─ Query recurringPatternsRepo for obligations
 *      ├─ Query snapshotRepo for overall health
 *      ├─ Query debtRepo for liabilities
 *      └─ Query goalsRepo for savings targets
 *           ↓
 * FinancialContext (only relevant data, no sensitive info)
 *      ├─ Workflow-specific context
 *      ├─ Metadata (versions, timestamps, confidence)
 *      ├─ Attention items (what to focus on)
 *      └─ Tool requirements (which tools to invoke)
 *           ↓
 * → Build system prompt for LLM
 * → Pass to LLM with available tools
 * → LLM invokes tools with FinancialContext (not conversation history)
 * → Tools operate on authoritative data (database snapshots)
 * → Store responses with context metadata for audit trail
 */

/**
 * Privacy Guarantees:
 *
 * ✅ Never sent to LLM:
 *    - SSN
 *    - Account numbers
 *    - Routing numbers
 *    - Credentials
 *    - Card numbers
 *    - Raw statements
 *
 * ✅ LLM receives:
 *    - Aggregated financial data (budgets, cash flow, debt analysis)
 *    - Recommendations (based on deterministic rules)
 *    - Attention items (facts, not speculation)
 *    - Tool definitions (what operations are available)
 *
 * ✅ Tools receive:
 *    - FinancialContext (database snapshots)
 *    - User input (what they want to calculate)
 *    - NOT conversation history (avoids hallucination)
 */

/**
 * Error Handling:
 *
 * If context is insufficient for the workflow:
 *
 * ```typescript
 * if (!contextService.isContextSufficient(financialContext)) {
 *     return res.status(422).json({
 *         userMessage: `To help with ${classifiedIntent.intent}, I need: ` +
 *             contextService.describeContextAvailability(financialContext),
 *         errorCode: "INSUFFICIENT_CONTEXT",
 *         requiredData: ["budget", "transactions", "settings"],
 *     });
 * }
 * ```
 */

export {};
