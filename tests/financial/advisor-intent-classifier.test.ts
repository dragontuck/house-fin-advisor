import {
    AdvisorIntentClassifier,
    IntentCategory,
    RuleBasedIntentClassifier,
    createIntentClassifier,
} from "@house-fin/domain/advisor-intent-classifier";
import { AdvisorWorkflow } from "@house-fin/contracts";

describe("AdvisorIntentClassifier", () => {
    let classifier: AdvisorIntentClassifier;

    beforeEach(() => {
        classifier = createIntentClassifier();
    });

    // ============================================================================
    // INTENT CATEGORY: INFORMATION
    // These queries ask about current financial state without action
    // ============================================================================

    describe("Intent: FINANCIAL_HEALTH (INFORMATION)", () => {
        const testCases = [
            "How are we doing?",
            "What's our overall financial situation?",
            "How's our financial health?",
            "Are we in good financial shape?",
            "Can you give me an overview of our finances?",
            "What's the current state of our money?",
        ];

        testCases.forEach((message) => {
            it(`classifies "${message}" as FINANCIAL_HEALTH`, async () => {
                const result = await classifier.classify(message);
                expect(result.intent).toBe(AdvisorWorkflow.FINANCIAL_HEALTH);
                expect(result.category).toBe(IntentCategory.INFORMATION);
                expect(result.confidence).toBeGreaterThanOrEqual(0.7);
            });
        });

        it("has high confidence for generic status questions", async () => {
            const result = await classifier.classify("How are we doing?");
            expect(result.confidence).toBeGreaterThan(0.75);
        });
    });

    describe("Intent: BUDGET_STATUS (INFORMATION)", () => {
        const testCases = [
            "Am I over budget this month?",
            "What's our current budget status?",
            "How much are we spending versus budget?",
            "Are we staying within budget?",
            "What's our budget situation right now?",
            "Have we exceeded our budget?",
        ];

        testCases.forEach((message) => {
            it(`classifies "${message}" as BUDGET_STATUS`, async () => {
                const result = await classifier.classify(message);
                expect(result.intent).toBe(AdvisorWorkflow.BUDGET_STATUS);
                expect(result.category).toBe(IntentCategory.INFORMATION);
                expect(result.confidence).toBeGreaterThanOrEqual(0.75);
            });
        });
    });

    describe("Intent: CASH_FLOW (INFORMATION)", () => {
        const testCases = [
            "What's our cash flow looking like?",
            "Can you analyze our income and expenses?",
            "What are our inflows and outflows?",
            "How much are we bringing in versus spending?",
            "What's the cash flow forecast?",
            "Tell me about our money flow.",
        ];

        testCases.forEach((message) => {
            it(`classifies "${message}" as CASH_FLOW`, async () => {
                const result = await classifier.classify(message);
                expect(result.intent).toBe(AdvisorWorkflow.CASH_FLOW);
                expect(result.category).toBe(IntentCategory.INFORMATION);
                expect(result.confidence).toBeGreaterThanOrEqual(0.75);
            });
        });
    });

    describe("Intent: GOAL_STATUS (INFORMATION)", () => {
        const testCases = [
            "How are our savings goals doing?",
            "Are our goals on track?",
            "What's our progress toward our savings targets?",
            "How much have we saved toward our goals?",
            "Are we meeting our investment goals?",
            "What's the status of our savings plan?",
        ];

        testCases.forEach((message) => {
            it(`classifies "${message}" as GOAL_STATUS`, async () => {
                const result = await classifier.classify(message);
                expect(result.intent).toBe(AdvisorWorkflow.GOAL_STATUS);
                expect(result.category).toBe(IntentCategory.INFORMATION);
                expect(result.confidence).toBeGreaterThanOrEqual(0.75);
            });
        });
    });

    describe("Intent: DEBT_STATUS (INFORMATION)", () => {
        const testCases = [
            "How much debt do we have?",
            "What's our debt situation?",
            "Can you summarize our outstanding debts?",
            "What are the details of our debt accounts?",
            "How much are we owing in total?",
            "Tell me about our liabilities.",
        ];

        testCases.forEach((message) => {
            it(`classifies "${message}" as DEBT_STATUS`, async () => {
                const result = await classifier.classify(message);
                expect(result.intent).toBe(AdvisorWorkflow.DEBT_STATUS);
                expect(result.category).toBe(IntentCategory.INFORMATION);
                expect(result.confidence).toBeGreaterThanOrEqual(0.75);
            });
        });
    });

    // ============================================================================
    // INTENT CATEGORY: DIAGNOSIS
    // These queries ask why something is happening
    // ============================================================================

    describe("Intent: BUDGET_DIAGNOSE (DIAGNOSIS)", () => {
        const testCases = [
            "Why am I always over budget?",
            "Why do we struggle with our budget?",
            "What's causing us to overspend?",
            "Why do we keep exceeding our budget?",
            "What's the reason our spending is so high?",
            "Help me understand why we have budget issues.",
        ];

        testCases.forEach((message) => {
            it(`classifies "${message}" as BUDGET_DIAGNOSE`, async () => {
                const result = await classifier.classify(message);
                expect(result.intent).toBe(AdvisorWorkflow.BUDGET_DIAGNOSE);
                expect(result.category).toBe(IntentCategory.DIAGNOSIS);
                expect(result.confidence).toBeGreaterThanOrEqual(0.8);
            });
        });

        it("has high confidence for why + problem indicators", async () => {
            const result = await classifier.classify("Why are we spending so much?");
            expect(result.confidence).toBeGreaterThan(0.8);
        });
    });

    // ============================================================================
    // INTENT CATEGORY: PLANNING
    // These queries are about creating or modifying financial plans
    // ============================================================================

    describe("Intent: BUDGET_CREATE (PLANNING)", () => {
        const testCases = [
            "Help me create an initial budget.",
            "I need to set up a budget.",
            "Let's build a new budget from scratch.",
            "Can you help me establish a budget?",
            "I want to create a household budget.",
            "Let's start with an initial budget.",
        ];

        testCases.forEach((message) => {
            it(`classifies "${message}" as BUDGET_CREATE`, async () => {
                const result = await classifier.classify(message);
                expect(result.intent).toBe(AdvisorWorkflow.BUDGET_CREATE);
                expect(result.category).toBe(IntentCategory.PLANNING);
                expect(result.confidence).toBeGreaterThanOrEqual(0.8);
            });
        });

        it("distinguishes BUDGET_CREATE from BUDGET_REVISE", async () => {
            const createResult = await classifier.classify("Help me create an initial budget.");
            const reviseResult = await classifier.classify("Help me revise next month's budget.");

            expect(createResult.intent).toBe(AdvisorWorkflow.BUDGET_CREATE);
            expect(reviseResult.intent).toBe(AdvisorWorkflow.BUDGET_REVISE);
        });
    });

    describe("Intent: BUDGET_REVISE (PLANNING)", () => {
        const testCases = [
            "Help me revise the budget for next month.",
            "Let's adjust our budget.",
            "Can you help me plan next month?",
            "I need to update our budget allocations.",
            "Let's re-plan our spending for the coming month.",
            "Help me refine our budget.",
        ];

        testCases.forEach((message) => {
            it(`classifies "${message}" as BUDGET_REVISE`, async () => {
                const result = await classifier.classify(message);
                expect(result.intent).toBe(AdvisorWorkflow.BUDGET_REVISE);
                expect(result.category).toBe(IntentCategory.PLANNING);
                expect(result.confidence).toBeGreaterThanOrEqual(0.7);
            });
        });
    });

    // ============================================================================
    // INTENT CATEGORY: SCENARIO
    // These queries explore hypothetical situations
    // ============================================================================

    describe("Intent: AFFORDABILITY (SCENARIO)", () => {
        const testCases = [
            "Can we afford a new car?",
            "What if we spend $6,000 on a vacation?",
            "Should we buy a house right now?",
            "Can we afford to upgrade our kitchen for $8,000?",
            "Is a $500/month subscription affordable?",
            "Could we manage an additional $200 monthly expense?",
        ];

        testCases.forEach((message) => {
            it(`classifies "${message}" as AFFORDABILITY`, async () => {
                const result = await classifier.classify(message);
                expect(result.intent).toBe(AdvisorWorkflow.AFFORDABILITY);
                expect(result.category).toBe(IntentCategory.SCENARIO);
                expect(result.confidence).toBeGreaterThanOrEqual(0.7);
            });
        });

        it("requires a price amount for highest confidence", async () => {
            const withPrice = await classifier.classify("What if we spend $6,000?");
            const withoutPrice = await classifier.classify("What if we make a big purchase?");

            expect(withPrice.confidence).toBeGreaterThan(withoutPrice.confidence);
        });
    });

    describe("Intent: BUDGET_SCENARIO (SCENARIO)", () => {
        const testCases = [
            "What if we spend more on dining?",
            "How would it affect us to reallocate budget from savings to entertainment?",
            "What if we increase our grocery budget by $200?",
            "How would reducing our entertainment budget help?",
            "Suppose we cut back on dining and redirect to savings?",
            "What happens if we shift money between categories?",
        ];

        testCases.forEach((message) => {
            it(`classifies "${message}" as BUDGET_SCENARIO`, async () => {
                const result = await classifier.classify(message);
                expect(result.intent).toBe(AdvisorWorkflow.BUDGET_SCENARIO);
                expect(result.category).toBe(IntentCategory.SCENARIO);
                expect(result.confidence).toBeGreaterThanOrEqual(0.7);
            });
        });
    });

    // ============================================================================
    // EDGE CASES & AMBIGUOUS EXAMPLES
    // ============================================================================

    describe("Edge Cases: Ambiguous Examples", () => {
        it("disambiguates 'Should I buy' as AFFORDABILITY (with price)", async () => {
            const result = await classifier.classify("Should I buy a new laptop for $1,200?");
            expect(result.intent).toBe(AdvisorWorkflow.AFFORDABILITY);
            expect(result.category).toBe(IntentCategory.SCENARIO);
        });

        it("handles 'Should I buy' without price as fallback PLANNING", async () => {
            const result = await classifier.classify("Should I buy something expensive?");
            // Without a specific price, this is ambiguous - should fall back reasonably
            expect([AdvisorWorkflow.AFFORDABILITY, AdvisorWorkflow.BUDGET_SCENARIO]).toContain(
                result.intent
            );
        });

        it("prioritizes 'what if' hypotheticals as SCENARIO", async () => {
            const result = await classifier.classify("What if we save less?");
            expect(result.category).toBe(IntentCategory.SCENARIO);
        });

        it("handles multi-intent messages sensibly", async () => {
            // This asks for diagnosis but includes future planning
            const result = await classifier.classify("Why are we struggling, and how can we fix our budget?");
            // Should pick the dominant intent
            expect(result.category).toBe(IntentCategory.DIAGNOSIS);
            expect(result.intent).toBe(AdvisorWorkflow.BUDGET_DIAGNOSE);
        });
    });

    describe("Edge Cases: Temporal Ambiguity", () => {
        it("identifies current status questions", async () => {
            const result = await classifier.classify("How are we doing right now?");
            expect(result.intent).toBe(AdvisorWorkflow.FINANCIAL_HEALTH);
            expect(result.category).toBe(IntentCategory.INFORMATION);
        });

        it("identifies future-oriented planning", async () => {
            const result = await classifier.classify("Let's plan for next month.");
            expect(result.category).toBe(IntentCategory.PLANNING);
        });

        it("distinguishes current budget status from future planning", async () => {
            const currentResult = await classifier.classify("What's our budget status now?");
            const futureResult = await classifier.classify("Let's plan our budget for next month.");

            expect(currentResult.intent).toBe(AdvisorWorkflow.BUDGET_STATUS);
            expect(futureResult.intent).toMatch(AdvisorWorkflow.BUDGET_REVISE);
        });
    });

    describe("Edge Cases: Empty and Trivial Input", () => {
        it("handles empty string gracefully", async () => {
            const result = await classifier.classify("");
            expect(result.intent).toBe(AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION);
            expect(result.confidence).toBeLessThan(0.5);
            expect(result.reasoning).toBeDefined();
        });

        it("handles whitespace-only input", async () => {
            const result = await classifier.classify("   ");
            expect(result.intent).toBe(AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION);
            expect(result.confidence).toBeLessThan(0.5);
        });

        it("handles single word input", async () => {
            const result = await classifier.classify("budget");
            // Should still attempt classification
            expect(result.intent).toBeDefined();
            expect(result.category).toBeDefined();
        });

        it("handles very long unclear input", async () => {
            const longText = "I'm just rambling about various aspects of life and don't really have a clear financial question in mind right now";
            const result = await classifier.classify(longText);
            // Should fall back gracefully
            expect(result.intent).toBe(AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION);
            expect(result.category).toBe(IntentCategory.INFORMATION);
        });
    });

    // ============================================================================
    // FALLBACK BEHAVIOR
    // ============================================================================

    describe("Fallback: GENERAL_FINANCIAL_QUESTION", () => {
        const ambiguousQueries = [
            "Tell me something interesting about money.",
            "I have a financial question.",
            "What should I know about finance?",
            "Can you explain how interest works?",
            "What are some money tips?",
            "Teach me about investing.",
        ];

        ambiguousQueries.forEach((message) => {
            it(`handles unclear queries: "${message}"`, async () => {
                const result = await classifier.classify(message);
                // Should be a valid intent (may not be GENERAL_FINANCIAL_QUESTION, but should be reasonable)
                expect(result.intent).toBeDefined();
                expect(result.category).toBeDefined();
                expect(result.confidence).toBeGreaterThan(0);
            });
        });

        it("returns GENERAL_FINANCIAL_QUESTION for truly ambiguous input", async () => {
            const result = await classifier.classify("money stuff");
            expect(result.intent).toBe(AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION);
        });
    });

    // ============================================================================
    // SEMANTIC SIGNAL EXTRACTION
    // ============================================================================

    describe("Semantic Signal Extraction", () => {
        it("extracts question type correctly", () => {
            const whySignals = classifier.extractSignals("Why are we over budget?");
            expect(whySignals.questionType).toBe("why");

            const howSignals = classifier.extractSignals("How much are we saving?");
            expect(howSignals.questionType).toBe("how");

            const whatIfSignals = classifier.extractSignals("What if we spend more?");
            expect(whatIfSignals.questionType).toBe("what_if");

            const statusSignals = classifier.extractSignals("Are we on track?");
            expect(statusSignals.questionType).toBe("status");
        });

        it("extracts domain keywords", () => {
            const signals = classifier.extractSignals("I need help with my budget and spending.");
            expect(signals.domainKeywords).toContain("budget");
            expect(signals.domainKeywords).toContain("spending");
        });

        it("extracts action verbs", () => {
            const createSignals = classifier.extractSignals("Help me create a budget.");
            expect(createSignals.actions).toContain("create");
            expect(createSignals.actions).toContain("help");

            const reviseSignals = classifier.extractSignals("Revise our budget.");
            expect(reviseSignals.actions).toContain("revise");
        });

        it("detects hypothetical language", () => {
            const hypothetical = classifier.extractSignals("What if we spend $5,000?");
            expect(hypothetical.hasHypothetical).toBe(true);

            const concrete = classifier.extractSignals("How much are we spending?");
            expect(concrete.hasHypothetical).toBe(false);
        });

        it("detects problem language", () => {
            const problem = classifier.extractSignals("Why do we struggle with overspending?");
            expect(problem.hasProblem).toBe(true);

            const noProblem = classifier.extractSignals("What's our budget status?");
            expect(noProblem.hasProblem).toBe(false);
        });

        it("detects goal language", () => {
            const goals = classifier.extractSignals("How are our savings goals progressing?");
            expect(goals.hasGoalLanguage).toBe(true);

            const noGoals = classifier.extractSignals("What's our cash flow?");
            expect(noGoals.hasGoalLanguage).toBe(false);
        });

        it("detects temporal scope", () => {
            const current = classifier.extractSignals("What's our current budget?");
            expect(current.temporalScope).toBe("current");

            const future = classifier.extractSignals("Plan for next month.");
            expect(future.temporalScope).toBe("future");

            const past = classifier.extractSignals("What was our spending last year?");
            expect(past.temporalScope).toBe("past");
        });
    });

    // ============================================================================
    // CONFIDENCE SCORING
    // ============================================================================

    describe("Confidence Scoring", () => {
        it("gives high confidence to clear, specific queries", async () => {
            const result = await classifier.classify("Why am I always over budget?");
            expect(result.confidence).toBeGreaterThan(0.8);
        });

        it("gives lower confidence to ambiguous queries", async () => {
            const result = await classifier.classify("money things");
            expect(result.confidence).toBeLessThan(0.6);
        });

        it("includes reasoning for audit trail", async () => {
            const result = await classifier.classify("Help me create a budget.");
            expect(result.reasoning).toBeDefined();
            expect(result.reasoning!.length).toBeGreaterThan(0);
        });

        it("confidence is 0-1 range", async () => {
            const messages = [
                "How are we doing?",
                "money?",
                "",
                "What if we spend $5,000 on vacation?",
            ];

            for (const msg of messages) {
                const result = await classifier.classify(msg);
                expect(result.confidence).toBeGreaterThanOrEqual(0);
                expect(result.confidence).toBeLessThanOrEqual(1);
            }
        });
    });

    // ============================================================================
    // CATEGORY COVERAGE
    // ============================================================================

    describe("All Intent Categories Represented", () => {
        it("can classify INFORMATION category", async () => {
            const result = await classifier.classify("How are we doing?");
            expect(result.category).toBe(IntentCategory.INFORMATION);
        });

        it("can classify DIAGNOSIS category", async () => {
            const result = await classifier.classify("Why are we over budget?");
            expect(result.category).toBe(IntentCategory.DIAGNOSIS);
        });

        it("can classify PLANNING category", async () => {
            const result = await classifier.classify("Help me create a budget.");
            expect(result.category).toBe(IntentCategory.PLANNING);
        });

        it("can classify SCENARIO category", async () => {
            const result = await classifier.classify("What if we spend $5,000?");
            expect(result.category).toBe(IntentCategory.SCENARIO);
        });
    });

    // ============================================================================
    // INTERFACE COMPLIANCE
    // ============================================================================

    describe("Interface Compliance", () => {
        it("classify returns ClassifiedIntent with required fields", async () => {
            const result = await classifier.classify("How are we doing?");
            expect(result.intent).toBeDefined();
            expect(result.category).toBeDefined();
            expect(result.confidence).toBeDefined();
            expect(typeof result.confidence).toBe("number");
        });

        it("extractSignals returns IntentSignals with all fields", () => {
            const signals = classifier.extractSignals("What if we spend more?");
            expect(signals.questionType).toBeDefined();
            expect(signals.domainKeywords).toBeDefined();
            expect(signals.actions).toBeDefined();
            expect(signals.temporalScope).toBeDefined();
            expect(signals.hasHypothetical).toBeDefined();
            expect(signals.hasProblem).toBeDefined();
            expect(signals.hasGoalLanguage).toBeDefined();
        });

        it("intent always matches one of AdvisorWorkflow enum values", async () => {
            const validIntents = Object.values(AdvisorWorkflow);
            const queries = [
                "How are we doing?",
                "Why over budget?",
                "Create budget",
                "What if scenario?",
            ];

            for (const query of queries) {
                const result = await classifier.classify(query);
                expect(validIntents).toContain(result.intent);
            }
        });

        it("category always matches one of IntentCategory enum values", async () => {
            const validCategories = Object.values(IntentCategory);
            const queries = [
                "How are we doing?",
                "Why over budget?",
                "Create budget",
                "What if scenario?",
            ];

            for (const query of queries) {
                const result = await classifier.classify(query);
                expect(validCategories).toContain(result.category);
            }
        });
    });

    // ============================================================================
    // NEGATIVE CASES
    // ============================================================================

    describe("Negative Cases: Things NOT to Classify", () => {
        it("doesn't confuse general info questions with specific intents", async () => {
            const result = await classifier.classify("Tell me about investing.");
            // This is generic financial education, not a specific household intent
            // Could go to GENERAL_FINANCIAL_QUESTION or FINANCIAL_HEALTH, but should recognize it's not specific
            expect(result.confidence).toBeLessThanOrEqual(0.75);
        });

        it("doesn't misclassify personal non-financial questions", async () => {
            const result = await classifier.classify("What should I have for dinner?");
            // Should probably fall back or give very low confidence
            expect(result.intent).toBe(AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION);
        });

        it("handles mixed financial/non-financial questions", async () => {
            const result = await classifier.classify("How are we doing financially and with our health?");
            // Should focus on the financial part
            expect(result.category).toBeDefined();
            expect(result.intent).toBeDefined();
        });
    });

    // ============================================================================
    // OUT-OF-SCOPE QUESTIONS
    // Protection against questions outside personal finance and budgeting scope
    // ============================================================================

    describe("Out-of-Scope Protection", () => {
        describe("Coding and Software Development Questions", () => {
            const outOfScopeQuestions = [
                "How do I write a function in JavaScript?",
                "Can you help me debug this Python code?",
                "What's the best way to implement a loop?",
                "How do I deploy to GitHub?",
                "Explain how databases work",
            ];

            outOfScopeQuestions.forEach((question) => {
                it(`flags "${question}" as out-of-scope`, async () => {
                    const result = await classifier.classify(question);
                    expect(result.out_of_scope).toBe(true);
                    expect(result.confidence).toBeLessThanOrEqual(0.1);
                    expect(result.reasoning).toContain("outside the scope");
                });
            });
        });

        describe("Resume and Job Search Questions", () => {
            const outOfScopeQuestions = [
                "How do I write a better resume?",
                "Can you help me with my cover letter?",
                "What should I put in my LinkedIn profile?",
                "How do I prepare for a job interview?",
                "Should I apply to this job?",
            ];

            outOfScopeQuestions.forEach((question) => {
                it(`flags "${question}" as out-of-scope`, async () => {
                    const result = await classifier.classify(question);
                    expect(result.out_of_scope).toBe(true);
                    expect(result.confidence).toBeLessThanOrEqual(0.1);
                });
            });
        });

        describe("Medical and Health Questions", () => {
            const outOfScopeQuestions = [
                "What should I do about this symptoms?",
                "Which medication should I take?",
                "How do I lose weight?",
                "What's a healthy diet plan?",
            ];

            outOfScopeQuestions.forEach((question) => {
                it(`flags "${question}" as out-of-scope`, async () => {
                    const result = await classifier.classify(question);
                    expect(result.out_of_scope).toBe(true);
                });
            });
        });

        describe("Entertainment and Unrelated Questions", () => {
            const outOfScopeQuestions = [
                "What movie should I watch?",
                "Who won the championship?",
                "Recommend a good book",
                "What should I wear to the party?",
            ];

            outOfScopeQuestions.forEach((question) => {
                it(`flags "${question}" as out-of-scope`, async () => {
                    const result = await classifier.classify(question);
                    expect(result.out_of_scope).toBe(true);
                });
            });
        });

        describe("Real Estate and Investment Trading Questions", () => {
            const outOfScopeQuestions = [
                "How do I flip a property for profit?",
                "Should I invest in cryptocurrency?",
                "What's a good day trading strategy?",
                "How do I start a rental business?",
            ];

            outOfScopeQuestions.forEach((question) => {
                it(`flags "${question}" as out-of-scope`, async () => {
                    const result = await classifier.classify(question);
                    expect(result.out_of_scope).toBe(true);
                });
            });
        });

        describe("Financial Questions Should NOT Be Out-of-Scope", () => {
            const financialQuestions = [
                "How much can we afford to spend on groceries?",
                "Why is our budget always exceeded?",
                "Can we afford a $300 monthly subscription?",
                "What's our current spending status?",
                "How much do we owe in total?",
                "Should we buy a car?",
                "What if we increase our entertainment budget?",
            ];

            financialQuestions.forEach((question) => {
                it(`does NOT flag "${question}" as out-of-scope`, async () => {
                    const result = await classifier.classify(question);
                    expect(result.out_of_scope).not.toBe(true);
                    expect(result.confidence).toBeGreaterThan(0.1);
                });
            });
        });

        it("has very low confidence for out-of-scope questions", async () => {
            const result = await classifier.classify("How do I learn Python?");
            expect(result.out_of_scope).toBe(true);
            expect(result.confidence).toBe(0.1);
        });

        it("includes explanatory reasoning for out-of-scope questions", async () => {
            const result = await classifier.classify("Can you help me write code?");
            expect(result.out_of_scope).toBe(true);
            expect(result.reasoning).toBeTruthy();
            expect(result.reasoning).toContain("outside the scope");
        });
    });
});
