/**
 * Advisor Conversation Routes
 * Handles conversational financial planning with intent classification and tool routing
 */

import { Request, Response, NextFunction } from "express";
import { RouteContext, RouteRegistrar } from "./types";
import { EntityId, AdvisorMessageRole, AdvisorWorkflow, IntentCategory } from "@house-fin/contracts";
import { createIntentClassifier } from "@house-fin/domain";

/**
 * Tool availability by intent category
 * Determines which tools the LLM can use based on classified user intent
 */
const TOOLS_BY_CATEGORY: Record<string, string[]> = {
    // Information gathering - read-only tools
    [IntentCategory.INFORMATION]: [
        "get_financial_snapshot",      // Overall financial health
        "get_cash_flow",               // Income/expense analysis
        "get_budget_status",           // Current budget vs. actual
        "get_goal_status",             // Savings progress
        "get_debt_summary",            // Debt overview
    ],
    // Diagnosis - analysis tools
    [IntentCategory.DIAGNOSIS]: [
        "get_budget_status",           // Detailed budget analysis
        "get_cash_flow",               // Historical patterns
        "get_historical_performance",  // Trend analysis
        "analyze_budget_variance",     // Why variance occurred
    ],
    // Planning - creation/modification tools
    [IntentCategory.PLANNING]: [
        "create_initial_budget",       // First-time budget creation
        "plan_next_month_budget",      // Forward planning
        "get_budget_status",           // Check current state
    ],
    // Scenario - simulation tools
    [IntentCategory.SCENARIO]: [
        "simulate_purchase",           // "What if I buy X?"
        "simulate_budget_change",      // "What if I shift $X from category A to B?"
        "simulate_income_change",      // "What if my income changes?"
        "get_financial_snapshot",      // For comparison baseline
    ],
};

/**
 * Tool descriptions for LLM context
 */
const TOOL_DESCRIPTIONS: Record<string, string> = {
    get_financial_snapshot: "Get overall financial health snapshot with balances, income, expenses, goals, and debt",
    get_cash_flow: "Analyze cash inflow and outflow patterns, identify income sources and spending categories",
    get_budget_status: "Check current month's budget vs actual spending by category",
    get_goal_status: "Check progress toward savings goals and emergency fund targets",
    get_debt_summary: "Get comprehensive debt overview including all liabilities and payment obligations",
    get_historical_performance: "Analyze historical budget performance, trends, and recurring patterns",
    analyze_budget_variance: "Analyze why actual spending differs from budget in specific categories",
    create_initial_budget: "Help create initial budget from historical spending patterns or goals",
    plan_next_month_budget: "Plan next month's budget based on income and priorities",
    simulate_purchase: "Simulate impact of a potential purchase on cash flow and budget",
    simulate_budget_change: "Simulate impact of reallocating funds between budget categories",
    simulate_income_change: "Simulate impact of income increase or decrease",
};

class ApiError extends Error {
    constructor(
        public statusCode: number,
        public userMessage: string,
        public errorCode: string,
        public retryable: boolean = false,
        message?: string
    ) {
        super(message || userMessage);
        this.name = "ApiError";
    }
}

/**
 * Register advisor conversation routes
 */
export const registerAdvisorConversationRoutes: RouteRegistrar = (context: RouteContext) => {
    const { app, advisorService, conversationRepo } = context;
    const intentClassifier = createIntentClassifier();

    /**
     * POST /conversations
     * Create a new conversation
     */
    app.post("/conversations", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;
            const { memberId, title, initialMessage } = req.body;

            if (!memberId) {
                throw new ApiError(400, "Member ID is required", "MISSING_MEMBER_ID");
            }

            const conversation = await advisorService.createConversation({
                householdId: householdId as EntityId,
                memberId: memberId as EntityId,
                title: title || "Financial Planning Discussion",
                initialMessage: initialMessage as string | undefined,
            });

            res.status(201).json({
                id: conversation.id,
                householdId: conversation.householdId,
                memberId: conversation.memberId,
                title: conversation.title,
                status: conversation.status,
                messageCount: conversation.messageCount,
                createdAt: conversation.createdAt,
            });
        } catch (error) {
            next(error);
        }
    });

    /**
     * GET /conversations/:conversationId
     * Get conversation details
     */
    app.get("/conversations/:conversationId", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { conversationId } = req.params;
            const householdId = req.context!.householdId;

            const conversation = await conversationRepo.findById(conversationId as EntityId);
            if (!conversation) {
                throw new ApiError(404, "Conversation not found", "CONVERSATION_NOT_FOUND");
            }

            // Verify authorization
            if (conversation.householdId !== householdId) {
                throw new ApiError(403, "Not authorized", "UNAUTHORIZED");
            }

            res.json({
                id: conversation.id,
                householdId: conversation.householdId,
                memberId: conversation.memberId,
                title: conversation.title,
                status: conversation.status,
                currentWorkflow: conversation.currentWorkflow,
                messageCount: conversation.messageCount,
                lastMessageAt: conversation.lastMessageAt,
                createdAt: conversation.createdAt,
            });
        } catch (error) {
            next(error);
        }
    });

    /**
     * GET /conversations/:conversationId/messages
     * Get conversation message history
     */
    app.get(
        "/conversations/:conversationId/messages",
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { conversationId } = req.params;
                const householdId = req.context!.householdId;
                const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
                const offset = parseInt(req.query.offset as string) || 0;

                // Verify conversation belongs to household
                const conversation = await conversationRepo.findById(conversationId as EntityId);
                if (!conversation || conversation.householdId !== householdId) {
                    throw new ApiError(403, "Not authorized", "UNAUTHORIZED");
                }

                const messages = await advisorService.getConversationHistory(
                    conversationId as EntityId,
                    limit,
                    offset
                );

                res.json({
                    conversationId,
                    messages: messages.map((msg) => ({
                        id: msg.id,
                        role: msg.role,
                        content: msg.content,
                        createdAt: msg.createdAt,
                    })),
                    limit,
                    offset,
                });
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * POST /conversations/:conversationId/messages
     * Add message to conversation with intent classification and tool routing
     */
    app.post(
        "/conversations/:conversationId/messages",
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { conversationId } = req.params;
                const householdId = req.context!.householdId;
                const { content } = req.body;

                if (!content || typeof content !== "string" || content.trim().length === 0) {
                    throw new ApiError(400, "Message content is required", "EMPTY_MESSAGE");
                }

                // Verify conversation belongs to household
                const conversation = await conversationRepo.findById(conversationId as EntityId);
                if (!conversation || conversation.householdId !== householdId) {
                    throw new ApiError(403, "Not authorized", "UNAUTHORIZED");
                }

                // Add user message to conversation
                const userMessage = await advisorService.addMessage({
                    conversationId: conversationId as EntityId,
                    role: AdvisorMessageRole.USER,
                    content: content.trim(),
                });

                // Classify user intent
                const classifiedIntent = await intentClassifier.classify(content);

                // Check if question is out of scope
                if (classifiedIntent.out_of_scope) {
                    // Create assistant response for out-of-scope question
                    const response = await advisorService.addMessage({
                        conversationId: conversationId as EntityId,
                        role: AdvisorMessageRole.ASSISTANT,
                        content:
                            "I'm designed to help with personal finance and budgeting questions. " +
                            "That topic is outside my scope. Can I help you with financial planning instead?",
                        metadata: {
                            intent: classifiedIntent.intent,
                            category: classifiedIntent.category,
                            confidence: classifiedIntent.confidence,
                            reasoning: classifiedIntent.reasoning,
                            out_of_scope: true,
                        },
                    });

                    return res.status(200).json({
                        userMessageId: userMessage.id,
                        assistantMessageId: response.id,
                        assistantMessage: response.content,
                        intent: classifiedIntent.intent,
                        category: classifiedIntent.category,
                        confidence: classifiedIntent.confidence,
                        out_of_scope: true,
                        availableTools: [],
                    });
                }

                // Determine available tools based on intent classification
                const availableTools = getAvailableTools(classifiedIntent.category);
                const toolDescriptions = availableTools.map((tool) => ({
                    name: tool,
                    description: TOOL_DESCRIPTIONS[tool],
                }));

                // Return classification with available tools for LLM
                const response = await advisorService.addMessage({
                    conversationId: conversationId as EntityId,
                    role: AdvisorMessageRole.SYSTEM,
                    content: `User intent classified as: ${classifiedIntent.intent}`,
                    metadata: {
                        intent: classifiedIntent.intent,
                        category: classifiedIntent.category,
                        confidence: classifiedIntent.confidence,
                        reasoning: classifiedIntent.reasoning,
                        availableTools: availableTools,
                    },
                });

                // Update conversation with current workflow if needed
                if (classifiedIntent.intent !== AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION) {
                    await conversationRepo.update(conversationId as EntityId, {
                        currentWorkflow: classifiedIntent.intent,
                    });
                }

                res.json({
                    userMessageId: userMessage.id,
                    systemMessageId: response.id,
                    intent: {
                        type: classifiedIntent.intent,
                        category: classifiedIntent.category,
                        confidence: classifiedIntent.confidence,
                        reasoning: classifiedIntent.reasoning,
                    },
                    availableTools: toolDescriptions,
                    out_of_scope: false,
                });
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /conversations
     * List conversations for household
     */
    app.get("/conversations", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;
            const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

            const conversations = await conversationRepo.findByHouseholdId(householdId as EntityId, limit);

            res.json({
                conversations: conversations.map((c) => ({
                    id: c.id,
                    title: c.title,
                    status: c.status,
                    currentWorkflow: c.currentWorkflow,
                    messageCount: c.messageCount,
                    lastMessageAt: c.lastMessageAt,
                    createdAt: c.createdAt,
                })),
            });
        } catch (error) {
            next(error);
        }
    });
};

/**
 * Get available tools for a given intent category
 */
function getAvailableTools(category: string): string[] {
    return TOOLS_BY_CATEGORY[category] || [];
}
