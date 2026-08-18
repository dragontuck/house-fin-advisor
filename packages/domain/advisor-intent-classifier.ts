import { AdvisorWorkflow } from "@house-fin/contracts";

/**
 * High-level intent categories that group AdvisorWorkflow types.
 */
export enum IntentCategory {
    INFORMATION = "INFORMATION",
    DIAGNOSIS = "DIAGNOSIS",
    PLANNING = "PLANNING",
    SCENARIO = "SCENARIO",
}

/**
 * Question types - using an explicit enum to avoid type inference issues
 */
export enum QuestionTypeEnum {
    WHAT_IF = "what_if",
    STATUS = "status",
    WHY = "why",
    HOW = "how",
    CAN_WE = "can_we",
    OTHER = "other",
}

export type QuestionType = QuestionTypeEnum;
export type ActionType = "create" | "revise" | "diagnose" | "simulate" | "analyze" | "help" | "plan";
export type TemporalScope = "current" | "future" | "past" | "unspecified";

/**
 * Semantic signals extracted from user message.
 */
export interface IntentSignals {
    questionType: QuestionType;
    domainKeywords: string[];
    actions: ActionType[];
    temporalScope: TemporalScope;
    hasHypothetical: boolean;
    hasProblem: boolean;
    hasGoalLanguage: boolean;
}

/**
 * Result of intent classification.
 */
export interface ClassifiedIntent {
    intent: AdvisorWorkflow;
    category: IntentCategory;
    confidence: number;
    reasoning?: string;
    out_of_scope?: boolean;  // True if question is outside personal finance/budgeting scope
}

/**
 * Interface for intent classification implementations.
 */
export interface AdvisorIntentClassifier {
    classify(userMessage: string): Promise<ClassifiedIntent>;
    extractSignals(userMessage: string): IntentSignals;
}

/**
 * Rule-based intent classifier using semantic signals.
 */
export class RuleBasedIntentClassifier implements AdvisorIntentClassifier {
    async classify(userMessage: string): Promise<ClassifiedIntent> {
        if (!userMessage || userMessage.trim().length === 0) {
            return {
                intent: AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION,
                category: IntentCategory.INFORMATION,
                confidence: 0.3,
                reasoning: "Empty or whitespace-only message",
            };
        }

        const signals = this.extractSignals(userMessage);
        return this.classifyFromSignals(signals, userMessage);
    }

    extractSignals(userMessage: string): IntentSignals {
        const lowerMessage = userMessage.toLowerCase();
        const tokens = this.tokenize(lowerMessage);

        const questionType: QuestionType = this.detectQuestionType(lowerMessage, tokens);

        return {
            questionType,
            domainKeywords: this.extractDomainKeywords(tokens),
            actions: this.extractActions(tokens),
            temporalScope: this.detectTemporalScope(tokens),
            hasHypothetical: this.detectHypothetical(lowerMessage),
            hasProblem: this.detectProblem(tokens),
            hasGoalLanguage: this.detectGoalLanguage(tokens),
        };
    }

    private classifyFromSignals(signals: IntentSignals, userMessage: string): ClassifiedIntent {
        // Check if question is out-of-scope before attempting classification
        if (this.isOutOfScope(userMessage)) {
            return {
                intent: AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION,
                category: IntentCategory.INFORMATION,
                confidence: 0.1,
                reasoning: "Question is outside the scope of personal finance and budgeting",
                out_of_scope: true,
            };
        }

        const specificMatch = this.matchSpecificIntent(signals, userMessage);
        if (specificMatch) {
            return specificMatch;
        }

        return this.matchCategory(signals);
    }

    private matchSpecificIntent(signals: IntentSignals, userMessage: string): ClassifiedIntent | null {
        const lowerMessage = userMessage.toLowerCase();
        const isWhatIf = signals.questionType === QuestionTypeEnum.WHAT_IF;

        // BUDGET_SCENARIO: "what if" with price or budget-related scenario
        if (isWhatIf) {
            // BUDGET_SCENARIO: "what if" with "increase"/"add" budget category + price
            // Check this BEFORE generic affordability to distinguish budget adjustments from purchases
            if (
                (lowerMessage.includes("increase") || lowerMessage.includes("add")) &&
                (lowerMessage.includes("budget") || lowerMessage.includes("grocery") ||
                    lowerMessage.includes("dining") || lowerMessage.includes("entertainment") ||
                    lowerMessage.includes("transportation"))
            ) {
                return {
                    intent: AdvisorWorkflow.BUDGET_SCENARIO,
                    category: IntentCategory.SCENARIO,
                    confidence: 0.85,
                    reasoning: "Hypothetical budget adjustment scenario",
                };
            }

            // AFFORDABILITY: "what if" with price (but NOT a budget adjustment)
            if (this.hasPriceAmount(userMessage)) {
                return {
                    intent: AdvisorWorkflow.AFFORDABILITY,
                    category: IntentCategory.SCENARIO,
                    confidence: 0.9,
                    reasoning: "Hypothetical purchase question with specific amount",
                };
            }

            // BUDGET_SCENARIO: "what if" with budget/spending keywords
            if (signals.domainKeywords.some((k) => ["budget", "spend", "spending", "allocate"].includes(k))) {
                return {
                    intent: AdvisorWorkflow.BUDGET_SCENARIO,
                    category: IntentCategory.SCENARIO,
                    confidence: 0.85,
                    reasoning: "Hypothetical budget reallocation scenario",
                };
            }

            // Generic what_if
            return {
                intent: AdvisorWorkflow.BUDGET_SCENARIO,
                category: IntentCategory.SCENARIO,
                confidence: 0.75,
                reasoning: "Hypothetical scenario",
            };
        }

        // AFFORDABILITY: "can we afford", "could we", "is", "should" + "afford" or price
        if (
            signals.domainKeywords.includes("afford") ||
            lowerMessage.includes("can we afford") ||
            lowerMessage.includes("can i afford") ||
            lowerMessage.includes("should we buy") ||
            lowerMessage.includes("should i buy") ||
            lowerMessage.includes("could we afford") ||
            lowerMessage.includes("could we manage") ||
            (lowerMessage.startsWith("is") && (signals.domainKeywords.includes("afford") || this.hasPriceAmount(userMessage)))
        ) {
            return {
                intent: AdvisorWorkflow.AFFORDABILITY,
                category: IntentCategory.SCENARIO,
                confidence: this.hasPriceAmount(userMessage) ? 0.9 : 0.7,
                reasoning: "Affordability question",
            };
        }

        // BUDGET_CREATE: "create" + "budget"
        if (
            signals.actions.includes("create") &&
            signals.domainKeywords.includes("budget") &&
            !signals.domainKeywords.includes("revise")
        ) {
            return {
                intent: AdvisorWorkflow.BUDGET_CREATE,
                category: IntentCategory.PLANNING,
                confidence: 0.9,
                reasoning: "Request to create or set up initial budget",
            };
        }

        // BUDGET_REVISE: "revise", "adjust", "plan", "update" + "budget" + future scope
        if (
            (signals.actions.includes("revise") || signals.actions.includes("plan")) &&
            signals.domainKeywords.includes("budget") &&
            signals.temporalScope === "future"
        ) {
            return {
                intent: AdvisorWorkflow.BUDGET_REVISE,
                category: IntentCategory.PLANNING,
                confidence: 0.9,
                reasoning: "Request to revise or plan future budget",
            };
        }

        // BUDGET_REVISE: "help me plan" + budget/spending + future
        if (
            (lowerMessage.includes("help me plan") || lowerMessage.includes("can you help me plan")) &&
            (signals.temporalScope === "future" || lowerMessage.includes("next month"))
        ) {
            return {
                intent: AdvisorWorkflow.BUDGET_REVISE,
                category: IntentCategory.PLANNING,
                confidence: 0.85,
                reasoning: "Request to plan future budget",
            };
        }

        // BUDGET_REVISE: "let's adjust/refine/plan" + budget (even without explicit future marker)
        if (
            (lowerMessage.startsWith("let's") ||
                lowerMessage.startsWith("can you help me plan") ||
                lowerMessage.startsWith("help me refine")) &&
            signals.domainKeywords.includes("budget")
        ) {
            return {
                intent: AdvisorWorkflow.BUDGET_REVISE,
                category: IntentCategory.PLANNING,
                confidence: 0.85,
                reasoning: "Request to adjust or refine budget",
            };
        }

        // BUDGET_REVISE: "update" + "budget" + future context or allocations
        if (
            (signals.actions.includes("revise") || lowerMessage.includes("update")) &&
            signals.domainKeywords.includes("budget") &&
            (signals.temporalScope === "future" || lowerMessage.includes("allocations"))
        ) {
            return {
                intent: AdvisorWorkflow.BUDGET_REVISE,
                category: IntentCategory.PLANNING,
                confidence: 0.85,
                reasoning: "Request to update or replan budget",
            };
        }

        // BUDGET_REVISE: "re-plan" or "replan" + spending
        if (
            (lowerMessage.includes("re-plan") || lowerMessage.includes("replan")) &&
            (signals.domainKeywords.includes("spending") || signals.domainKeywords.includes("budget"))
        ) {
            return {
                intent: AdvisorWorkflow.BUDGET_REVISE,
                category: IntentCategory.PLANNING,
                confidence: 0.85,
                reasoning: "Request to replan spending",
            };
        }

        // BUDGET_DIAGNOSE: "why" + budget/spending + problem
        if (
            signals.questionType === QuestionTypeEnum.WHY &&
            (signals.domainKeywords.includes("budget") ||
                signals.domainKeywords.includes("spending")) &&
            signals.hasProblem
        ) {
            return {
                intent: AdvisorWorkflow.BUDGET_DIAGNOSE,
                category: IntentCategory.DIAGNOSIS,
                confidence: 0.9,
                reasoning: "Diagnostic question about budget issues",
            };
        }

        // BUDGET_DIAGNOSE: "what's causing" + overspend/spending
        if (
            (lowerMessage.includes("what's causing") || lowerMessage.includes("what is causing")) &&
            (lowerMessage.includes("overspend") || lowerMessage.includes("spending"))
        ) {
            return {
                intent: AdvisorWorkflow.BUDGET_DIAGNOSE,
                category: IntentCategory.DIAGNOSIS,
                confidence: 0.85,
                reasoning: "Diagnostic question about spending issues",
            };
        }

        // BUDGET_DIAGNOSE: "what's the reason" + spending/budget + problem
        if (
            (lowerMessage.includes("what's the reason") || lowerMessage.includes("what is the reason")) &&
            (signals.domainKeywords.includes("spending") || signals.domainKeywords.includes("budget")) &&
            signals.hasProblem
        ) {
            return {
                intent: AdvisorWorkflow.BUDGET_DIAGNOSE,
                category: IntentCategory.DIAGNOSIS,
                confidence: 0.85,
                reasoning: "Diagnostic question about spending issues",
            };
        }

        // BUDGET_SCENARIO: "how would it affect" + budget reallocation keywords
        // Check this BEFORE GOAL_STATUS to prevent "savings" keyword causing GOAL_STATUS match
        if (
            lowerMessage.includes("how would") && lowerMessage.includes("affect") &&
            (lowerMessage.includes("reallocate") || lowerMessage.includes("shift") ||
                lowerMessage.includes("redirect") || lowerMessage.includes("move") ||
                lowerMessage.includes("reduce") && signals.domainKeywords.includes("budget"))
        ) {
            return {
                intent: AdvisorWorkflow.BUDGET_SCENARIO,
                category: IntentCategory.SCENARIO,
                confidence: 0.85,
                reasoning: "Hypothetical budget reallocation scenario",
            };
        }

        // GOAL_STATUS: "goal" or "savings" keywords with status/how question
        if (
            signals.domainKeywords.includes("goal") ||
            signals.domainKeywords.includes("savings") ||
            lowerMessage.includes("goals") ||
            lowerMessage.includes("savings")
        ) {
            if (
                signals.questionType === QuestionTypeEnum.STATUS ||
                signals.questionType === QuestionTypeEnum.HOW ||
                signals.domainKeywords.includes("progress") ||
                lowerMessage.includes("on track") ||
                lowerMessage.includes("meeting") ||
                lowerMessage.includes("saved toward")
            ) {
                return {
                    intent: AdvisorWorkflow.GOAL_STATUS,
                    category: IntentCategory.INFORMATION,
                    confidence: 0.85,
                    reasoning: "Question about savings or investment goals",
                };
            }
        }

        // DEBT_STATUS: "debt" or "liabilities" keywords
        if (
            signals.domainKeywords.includes("debt") ||
            signals.domainKeywords.includes("liabilities") ||
            lowerMessage.includes("outstanding debt") ||
            lowerMessage.includes("owing") ||
            lowerMessage.includes("liabilities")
        ) {
            if (
                signals.questionType === QuestionTypeEnum.STATUS ||
                signals.questionType === QuestionTypeEnum.HOW ||
                lowerMessage.includes("how much") ||
                lowerMessage.includes("tell me") ||
                signals.actions.includes("analyze")
            ) {
                return {
                    intent: AdvisorWorkflow.DEBT_STATUS,
                    category: IntentCategory.INFORMATION,
                    confidence: 0.85,
                    reasoning: "Question about debt and liabilities",
                };
            }
        }

        // BUDGET_SCENARIO: "how would reducing/cutting" + budget category + "help"
        // Check this early to prevent matching BUDGET_STATUS HOW pattern
        if (
            (lowerMessage.includes("how would reducing") || lowerMessage.includes("how would cutting")) &&
            (lowerMessage.includes("budget") || lowerMessage.includes("help"))
        ) {
            return {
                intent: AdvisorWorkflow.BUDGET_SCENARIO,
                category: IntentCategory.SCENARIO,
                confidence: 0.85,
                reasoning: "Hypothetical budget reduction scenario",
            };
        }

        // CASH_FLOW: "cash", "flow", "income and expenses", "inflows and outflows"
        if (
            signals.domainKeywords.includes("cash") ||
            signals.domainKeywords.includes("flow") ||
            lowerMessage.includes("inflows") ||
            lowerMessage.includes("outflows") ||
            (signals.domainKeywords.includes("income") && signals.domainKeywords.includes("expenses")) ||
            (lowerMessage.includes("income") && lowerMessage.includes("expenses")) ||
            (lowerMessage.includes("bringing") && lowerMessage.includes("spending"))
        ) {
            return {
                intent: AdvisorWorkflow.CASH_FLOW,
                category: IntentCategory.INFORMATION,
                confidence: 0.85,
                reasoning: "Question about cash flow and money movement",
            };
        }

        // BUDGET_STATUS: "budget" keywords + "over budget", "exceeded", or status question  
        if (
            signals.domainKeywords.includes("budget") ||
            lowerMessage.includes("over budget") ||
            lowerMessage.includes("within budget") ||
            lowerMessage.includes("exceeded")
        ) {
            if (
                signals.questionType === QuestionTypeEnum.STATUS ||
                signals.questionType === QuestionTypeEnum.HOW ||
                lowerMessage.includes("how much") ||
                lowerMessage.includes("spending versus") ||
                lowerMessage.includes("over budget") ||
                lowerMessage.includes("exceeded") ||
                !signals.hasProblem // If it's budget-related but not a diagnosed problem, it's status
            ) {
                return {
                    intent: AdvisorWorkflow.BUDGET_STATUS,
                    category: IntentCategory.INFORMATION,
                    confidence: 0.8,
                    reasoning: "Question about current budget status",
                };
            }
        }

        // BUDGET_STATUS: Alternative - "how much" + spending/budget keywords
        if (
            lowerMessage.includes("how much") &&
            (signals.domainKeywords.includes("spending") ||
                signals.domainKeywords.includes("budget") ||
                signals.domainKeywords.includes("expense"))
        ) {
            return {
                intent: AdvisorWorkflow.BUDGET_STATUS,
                category: IntentCategory.INFORMATION,
                confidence: 0.75,
                reasoning: "Question about spending amounts",
            };
        }

        // FINANCIAL_HEALTH: generic overview/status questions about finances
        if (
            lowerMessage.includes("overview") ||
            lowerMessage.includes("situation") ||
            lowerMessage.includes("shape") ||
            (lowerMessage.includes("how are we") && lowerMessage.includes("doing")) ||
            (lowerMessage.includes("how am i") && lowerMessage.includes("doing"))
        ) {
            return {
                intent: AdvisorWorkflow.FINANCIAL_HEALTH,
                category: IntentCategory.INFORMATION,
                confidence: 0.85,
                reasoning: "Generic financial overview question",
            };
        }

        // BUDGET_SCENARIO: "suppose" + budget-related keywords
        if (
            (lowerMessage.includes("suppose") || lowerMessage.includes("suppose we")) &&
            (lowerMessage.includes("cut") || lowerMessage.includes("reduce") ||
                lowerMessage.includes("redirect") || lowerMessage.includes("shift"))
        ) {
            return {
                intent: AdvisorWorkflow.BUDGET_SCENARIO,
                category: IntentCategory.SCENARIO,
                confidence: 0.85,
                reasoning: "Hypothetical scenario with budget changes",
            };
        }

        // Handle "Should I buy" type questions without price as fallback
        if (
            (lowerMessage.includes("should") || lowerMessage.includes("could")) &&
            !this.hasPriceAmount(userMessage) &&
            (lowerMessage.includes("buy") || lowerMessage.includes("purchase"))
        ) {
            return {
                intent: AdvisorWorkflow.AFFORDABILITY,
                category: IntentCategory.SCENARIO,
                confidence: 0.6,
                reasoning: "Affordability question without price information",
            };
        }

        return null;
    }

    private matchCategory(signals: IntentSignals): ClassifiedIntent {
        // SCENARIO category if hypothetical
        if (signals.hasHypothetical) {
            return {
                intent: AdvisorWorkflow.BUDGET_SCENARIO,
                category: IntentCategory.SCENARIO,
                confidence: 0.7,
                reasoning: "Hypothetical scenario detected",
            };
        }

        // PLANNING if has action verbs
        if (signals.actions.length > 0) {
            return {
                intent: AdvisorWorkflow.BUDGET_REVISE,
                category: IntentCategory.PLANNING,
                confidence: 0.65,
                reasoning: "Action-oriented request",
            };
        }

        // DIAGNOSIS if problem + why
        if (signals.hasProblem && signals.questionType === QuestionTypeEnum.WHY) {
            return {
                intent: AdvisorWorkflow.BUDGET_DIAGNOSE,
                category: IntentCategory.DIAGNOSIS,
                confidence: 0.75,
                reasoning: "Problem-focused why question",
            };
        }

        // Default to FINANCIAL_HEALTH for status questions
        if (signals.questionType === QuestionTypeEnum.STATUS || signals.questionType === QuestionTypeEnum.HOW) {
            return {
                intent: AdvisorWorkflow.FINANCIAL_HEALTH,
                category: IntentCategory.INFORMATION,
                confidence: 0.75,
                reasoning: "Generic status question",
            };
        }

        // Final fallback
        return {
            intent: AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION,
            category: IntentCategory.INFORMATION,
            confidence: 0.5,
            reasoning: "Unable to determine specific intent",
        };
    }

    private detectQuestionType(lowerMessage: string, tokens: string[]): QuestionType {
        if (lowerMessage.includes("why") || lowerMessage.includes("reason")) {
            return QuestionTypeEnum.WHY;
        }

        if (
            lowerMessage.includes("how") ||
            lowerMessage.includes("what's our") ||
            lowerMessage.includes("what is our")
        ) {
            return QuestionTypeEnum.HOW;
        }

        // "can we" or "should we" questions (not "can you" which is a request)
        if ((lowerMessage.includes("can we") || lowerMessage.includes("should we")) &&
            !lowerMessage.includes("can you")) {
            return QuestionTypeEnum.CAN_WE;
        }

        // "should" by itself (standalone affordability question like "Should we buy...?")
        if (lowerMessage.startsWith("should ") && !lowerMessage.includes("should we")) {
            return QuestionTypeEnum.CAN_WE;
        }

        if (
            lowerMessage.includes("what if") ||
            lowerMessage.includes("what would happen") ||
            lowerMessage.includes("suppose")
        ) {
            return QuestionTypeEnum.WHAT_IF;
        }

        if (
            lowerMessage.includes("are we") ||
            lowerMessage.includes("are you") ||
            lowerMessage.includes("do we") ||
            lowerMessage.includes("am i") ||
            lowerMessage.includes("have we") ||
            lowerMessage.includes("have you") ||
            lowerMessage.includes("will we") ||
            lowerMessage.includes("could we") ||
            lowerMessage.startsWith("status") ||
            lowerMessage.includes("current") ||
            lowerMessage.includes("track") ||
            lowerMessage.includes("status")
        ) {
            return QuestionTypeEnum.STATUS;
        }

        return QuestionTypeEnum.OTHER;
    }

    private extractDomainKeywords(tokens: string[]): string[] {
        const domainVocab = [
            "budget",
            "budgets",
            "budgeting",
            "spending",
            "spend",
            "cash",
            "flow",
            "cash flow",
            "income",
            "expense",
            "expenses",
            "debt",
            "debts",
            "goal",
            "goals",
            "savings",
            "save",
            "saving",
            "invest",
            "investment",
            "emergency",
            "fund",
            "allocation",
            "allocate",
            "category",
            "categories",
            "monthly",
            "annual",
            "balance",
            "balances",
            "account",
            "accounts",
            "liabilities",
            "liability",
            "outstanding",
            "owing",
            "subscription",
            "subscriptions",
            "purchase",
            "purchases",
            "car",
            "house",
            "home",
            "kitchen",
            "grocery",
            "groceries",
            "dining",
            "entertainment",
            "inflow",
            "inflows",
            "outflow",
            "outflows",
            "progress",
            "savings",
            "investment",
            "afford",
            "affordable",
            "affordability",
        ];

        const matched = new Set<string>();
        tokens.forEach((token) => {
            if (domainVocab.includes(token)) {
                matched.add(token);
            }
        });

        return Array.from(matched);
    }

    private extractActions(tokens: string[]): ActionType[] {
        const actionMap: Record<string, ActionType> = {
            create: "create",
            set: "create",
            setup: "create",
            build: "create",
            establish: "create",
            start: "create",
            revise: "revise",
            adjust: "revise",
            change: "revise",
            update: "revise",
            refine: "revise",
            replan: "revise",
            reallocate: "revise",
            shift: "revise",
            "re-plan": "revise",
            plan: "plan",
            planning: "plan",
            help: "help",
            analyze: "analyze",
            analysis: "analyze",
            examine: "analyze",
            summarize: "analyze",
            summary: "analyze",
            details: "analyze",
            explain: "help",
            diagnose: "diagnose",
            simulate: "simulate",
            test: "simulate",
            affect: "simulate",
            happen: "simulate",
        };

        const actions = new Set<ActionType>();
        tokens.forEach((token) => {
            if (actionMap[token]) {
                actions.add(actionMap[token]);
            }
        });

        return Array.from(actions);
    }

    private detectTemporalScope(tokens: string[]): TemporalScope {
        // Look for explicit temporal markers
        const hasPastMarker = tokens.some((t) => ["past", "last", "previous", "history", "historical", "were", "was", "ago"].includes(t));
        const hasFutureMarker = tokens.some((t) => ["next", "upcoming", "plan", "planning", "will", "future", "forward", "coming"].includes(t));
        const hasCurrentMarker = tokens.some((t) => ["current", "now", "today", "are", "is", "this", "right"].includes(t));

        // "year" and "month" are ambiguous - check context
        const hasYear = tokens.includes("year") || tokens.includes("years");
        const hasMonth = tokens.includes("month") || tokens.includes("months");

        // If we have explicit past markers, it's past
        if (hasPastMarker) {
            return "past";
        }

        // If we have explicit future markers, it's future
        if (hasFutureMarker) {
            return "future";
        }

        // If we have current markers and no ambiguous time references, it's current
        if (hasCurrentMarker) {
            return "current";
        }

        // If we only have "year" or "month" without explicit temporal markers, default to ambiguous
        if ((hasYear || hasMonth) && !hasPastMarker && !hasFutureMarker) {
            return "unspecified";
        }

        return "unspecified";
    }

    private detectHypothetical(lowerMessage: string): boolean {
        const hypotheticalPatterns = [
            "what if",
            "suppose",
            "imagine",
            "would",
            "could",
            "can we spend",
            "if we",
            "scenario",
        ];

        return hypotheticalPatterns.some((pattern) => lowerMessage.includes(pattern));
    }

    private detectProblem(tokens: string[]): boolean {
        const problemIndicators = [
            "problem",
            "issue",
            "over",
            "overspent",
            "overspending",
            "exceeded",
            "exceeding",
            "exceed",
            "too",
            "much",
            "high",
            "short",
            "lack",
            "struggle",
            "struggling",
            "difficulty",
            "difficult",
            "concern",
            "worried",
            "worry",
            "help",
            "need",
            "causing",
            "cause",
            "reason",
            "why",
        ];

        return tokens.some((token) => problemIndicators.includes(token));
    }

    private detectGoalLanguage(tokens: string[]): boolean {
        const goalIndicators = [
            "goal",
            "goals",
            "save",
            "savings",
            "invest",
            "target",
            "achieve",
            "reach",
            "progress",
        ];

        return tokens.some((token) => goalIndicators.includes(token));
    }

    private hasPriceAmount(message: string): boolean {
        const pricePattern = /\$[\d,]+|€[\d,]+|£[\d,]+|[\d,]+\s*(dollars?|euros?|pounds?|k|cents?)?(?!\w)/i;
        return pricePattern.test(message);
    }

    private isOutOfScope(userMessage: string): boolean {
        const lowerMessage = userMessage.toLowerCase();

        // Topics explicitly outside the scope of personal finance and budgeting
        const outOfScopePatterns = [
            // Coding and software development
            /\b(code|coding|programming|debug(?!ging budget)|algorithm|function|variable|loop|array|class|object|git|github|javascript|python|typescript|react|angular|database|sql|software)\b/i,
            /\b(how do i (?:write|create|build|code|implement|deploy)|help me (?:write|create|build) code|write a (?:program|function|loop))\b/i,

            // Resume and job search
            /\b(resume|cv|cover letter|job (?:application|interview|search)|linkedin|apply to this job)\b/i,
            /\b(how do i write|help me (?:write|improve)|improve my)\s+(resume|cv|cover letter)\b/i,

            // General knowledge/homework (but exclude personal finance education)
            /\b(homework|assignment|essay|research paper|explain how|what is|define|history of)\b/i,
            /\b(solve this|answer this|do my (?:homework|assignment))\b/i,

            // Medical/health advice (including weight loss)
            /\b(doctor|prescription|medication|disease|symptom|symptoms|diet(?! plan for)|exercise|fitness|health advice|medical|lose weight|weight loss)\b/i,

            // Legal advice (outside finance)
            /\b(divorce|custody|contract(?! for)|lawsuit|attorney|legal advice)\b/i,

            // Real estate investment (not mortgage/home purchase affordability)
            /\b(flip|rental property|landlord|property manager|airbnb|start a rental)\b/i,

            // Investment advice beyond personal finance
            /\b(stock (?:market|trading|portfolio)|cryptocurrency|crypto|bitcoin|forex|options trading|day trading|swing trading)\b/i,

            // Unrelated personal matters
            /\b(relationship|dating|marriage|family conflict|pet care|cooking recipe|what should i (?:wear|read|watch|cook))\b/i,

            // Entertainment/trivia/sports/recommendations
            /\b(movie|game|book|celebrity|gossip|championship|tournament|match|sports|sport score|what to watch|recommend a (?:good|best)?)\b/i,
        ];

        // Check if message matches any out-of-scope pattern
        return outOfScopePatterns.some((pattern) => pattern.test(lowerMessage));
    }

    private tokenize(text: string): string[] {
        return text
            .split(/[\s\-—,.:;!?()]+/)
            .map((t) => t.toLowerCase())
            .filter((t) => t.length > 0);
    }
}

export function createIntentClassifier(): AdvisorIntentClassifier {
    return new RuleBasedIntentClassifier();
}
