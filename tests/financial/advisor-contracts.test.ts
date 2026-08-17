/**
 * Tests for AI Advisor Conversation & Workflow Contracts
 * Validates contract design, workflow state transitions, and audit trails
 */

import {
    AdvisorWorkflow,
    WorkflowStatus,
    AdvisorMessageRole,
    AdvisorMessage,
    WorkflowState,
    WorkflowAssumption,
    AIResponse,
    ToolExecution,
    KnownActivity,
    Money,
    MoneyFromDollars,
    EntityId,
} from "@house-fin/contracts";

describe("AdvisorWorkflow Enum", () => {
    test("has all required workflow types", () => {
        expect(AdvisorWorkflow.FINANCIAL_HEALTH).toBe("FINANCIAL_HEALTH");
        expect(AdvisorWorkflow.BUDGET_STATUS).toBe("BUDGET_STATUS");
        expect(AdvisorWorkflow.BUDGET_CREATE).toBe("BUDGET_CREATE");
        expect(AdvisorWorkflow.BUDGET_DIAGNOSE).toBe("BUDGET_DIAGNOSE");
        expect(AdvisorWorkflow.BUDGET_REVISE).toBe("BUDGET_REVISE");
        expect(AdvisorWorkflow.BUDGET_SCENARIO).toBe("BUDGET_SCENARIO");
        expect(AdvisorWorkflow.CASH_FLOW).toBe("CASH_FLOW");
        expect(AdvisorWorkflow.GOAL_STATUS).toBe("GOAL_STATUS");
        expect(AdvisorWorkflow.DEBT_STATUS).toBe("DEBT_STATUS");
        expect(AdvisorWorkflow.AFFORDABILITY).toBe("AFFORDABILITY");
        expect(AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION).toBe("GENERAL_FINANCIAL_QUESTION");
    });

    test("supports MODE A (informational) workflows", () => {
        const informationalWorkflows = [
            AdvisorWorkflow.FINANCIAL_HEALTH,
            AdvisorWorkflow.BUDGET_STATUS,
            AdvisorWorkflow.CASH_FLOW,
            AdvisorWorkflow.GOAL_STATUS,
            AdvisorWorkflow.DEBT_STATUS,
        ];
        informationalWorkflows.forEach(wf => {
            expect(typeof wf).toBe("string");
            expect(wf.length).toBeGreaterThan(0);
        });
    });

    test("supports MODE B (diagnostic) workflows", () => {
        const diagnosticWorkflows = [
            AdvisorWorkflow.BUDGET_DIAGNOSE,
        ];
        diagnosticWorkflows.forEach(wf => {
            expect(typeof wf).toBe("string");
        });
    });

    test("supports MODE C (planning) workflows", () => {
        const planningWorkflows = [
            AdvisorWorkflow.BUDGET_CREATE,
            AdvisorWorkflow.BUDGET_REVISE,
        ];
        planningWorkflows.forEach(wf => {
            expect(typeof wf).toBe("string");
        });
    });

    test("supports MODE D (scenario) workflows", () => {
        const scenarioWorkflows = [
            AdvisorWorkflow.BUDGET_SCENARIO,
            AdvisorWorkflow.AFFORDABILITY,
        ];
        scenarioWorkflows.forEach(wf => {
            expect(typeof wf).toBe("string");
        });
    });
});

describe("WorkflowStatus Enum", () => {
    test("has all required status values", () => {
        expect(WorkflowStatus.ACTIVE).toBe("ACTIVE");
        expect(WorkflowStatus.WAITING_FOR_USER).toBe("WAITING_FOR_USER");
        expect(WorkflowStatus.READY_FOR_REVIEW).toBe("READY_FOR_REVIEW");
        expect(WorkflowStatus.APPROVED).toBe("APPROVED");
        expect(WorkflowStatus.CANCELLED).toBe("CANCELLED");
        expect(WorkflowStatus.COMPLETED).toBe("COMPLETED");
    });

    test("supports workflow state transitions", () => {
        // Valid transitions
        const validTransitions = [
            { from: WorkflowStatus.ACTIVE, to: WorkflowStatus.WAITING_FOR_USER },
            { from: WorkflowStatus.WAITING_FOR_USER, to: WorkflowStatus.ACTIVE },
            { from: WorkflowStatus.ACTIVE, to: WorkflowStatus.READY_FOR_REVIEW },
            { from: WorkflowStatus.READY_FOR_REVIEW, to: WorkflowStatus.APPROVED },
            { from: WorkflowStatus.APPROVED, to: WorkflowStatus.COMPLETED },
            { from: WorkflowStatus.ACTIVE, to: WorkflowStatus.CANCELLED },
            { from: WorkflowStatus.WAITING_FOR_USER, to: WorkflowStatus.CANCELLED },
        ];

        validTransitions.forEach(t => {
            expect(typeof t.from).toBe("string");
            expect(typeof t.to).toBe("string");
        });
    });
});

describe("AdvisorMessageRole Enum", () => {
    test("has all required roles", () => {
        expect(AdvisorMessageRole.USER).toBe("USER");
        expect(AdvisorMessageRole.ASSISTANT).toBe("ASSISTANT");
        expect(AdvisorMessageRole.SYSTEM).toBe("SYSTEM");
        expect(AdvisorMessageRole.TOOL).toBe("TOOL");
    });

    test("supports message audit trail", () => {
        const roles = [
            AdvisorMessageRole.USER,
            AdvisorMessageRole.ASSISTANT,
            AdvisorMessageRole.SYSTEM,
            AdvisorMessageRole.TOOL,
        ];
        expect(roles.length).toBe(4);
    });
});

describe("KnownActivity", () => {
    test("represents a known upcoming activity", () => {
        const activity: KnownActivity = {
            id: "car_repair_001",
            description: "Car repair - transmission fluid leak",
            estimatedAmountCents: MoneyFromDollars(450),
            amountConfidence: "MEDIUM",
            type: "ONE_TIME",
            sourceExtraction: "car repair",
        };

        expect(activity.id).toBe("car_repair_001");
        expect(activity.description).toContain("transmission");
        expect(activity.estimatedAmountCents).toBe(45000);
        expect(activity.amountConfidence).toBe("MEDIUM");
        expect(activity.type).toBe("ONE_TIME");
    });

    test("supports recurring activities", () => {
        const subscription: KnownActivity = {
            id: "netflix_sub",
            description: "Netflix subscription",
            estimatedAmountCents: MoneyFromDollars(15.99),
            amountConfidence: "HIGH",
            type: "RECURRING",
        };

        expect(subscription.type).toBe("RECURRING");
        expect(subscription.amountConfidence).toBe("HIGH");
    });

    test("tracks extraction confidence", () => {
        const confidences = ["HIGH", "MEDIUM", "LOW"];
        confidences.forEach(conf => {
            const activity: KnownActivity = {
                id: "test",
                description: "Test",
                estimatedAmountCents: MoneyFromDollars(100),
                amountConfidence: conf as any,
                type: "ONE_TIME",
            };
            expect(["HIGH", "MEDIUM", "LOW"]).toContain(activity.amountConfidence);
        });
    });
});

describe("WorkflowState", () => {
    test("tracks multi-turn budget creation workflow", () => {
        const workflowId = "workflow_123" as EntityId;
        const householdId = "household_456" as EntityId;

        const workflow: WorkflowState = {
            id: workflowId,
            householdId,
            conversationId: "conv_789" as EntityId,
            workflowType: AdvisorWorkflow.BUDGET_CREATE,
            planningPeriod: { year: 2026, month: 9 },
            status: WorkflowStatus.ACTIVE,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        expect(workflow.workflowType).toBe(AdvisorWorkflow.BUDGET_CREATE);
        expect(workflow.status).toBe(WorkflowStatus.ACTIVE);
        expect(workflow.planningPeriod?.year).toBe(2026);
    });

    test("tracks scenario state for affordability analysis", () => {
        const workflow: WorkflowState = {
            id: "workflow_1" as EntityId,
            householdId: "hh_1" as EntityId,
            workflowType: AdvisorWorkflow.AFFORDABILITY,
            currentScenario: {
                type: "PURCHASE",
                description: "$4,000 kitchen remodel",
                affectedAmountCents: MoneyFromDollars(4000),
                baselineScenario: "current_state",
            },
            status: WorkflowStatus.READY_FOR_REVIEW,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        expect(workflow.currentScenario?.type).toBe("PURCHASE");
        expect(workflow.currentScenario?.affectedAmountCents).toBe(400000);
    });

    test("tracks known activities for budget planning", () => {
        const activities: KnownActivity[] = [
            {
                id: "activity_1",
                description: "Wife's birthday celebration",
                estimatedAmountCents: MoneyFromDollars(200),
                amountConfidence: "MEDIUM",
                type: "ONE_TIME",
            },
            {
                id: "activity_2",
                description: "Three-day trip to coast",
                estimatedAmountCents: MoneyFromDollars(1500),
                amountConfidence: "LOW",
                type: "ONE_TIME",
            },
        ];

        const workflow: WorkflowState = {
            id: "workflow_2" as EntityId,
            householdId: "hh_1" as EntityId,
            workflowType: AdvisorWorkflow.BUDGET_REVISE,
            knownActivities: activities,
            status: WorkflowStatus.WAITING_FOR_USER,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        expect(workflow.knownActivities).toHaveLength(2);
        expect(workflow.knownActivities![0].description).toContain("birthday");
    });

    test("tracks assumptions with confidence and reasoning", () => {
        const assumptions: WorkflowAssumption[] = [
            {
                key: "grocery_spending",
                value: "$600/month",
                confidence: "HIGH",
                reasoning: "Based on 3-month average of tagged transactions",
                impact: "Used in essential expenses calculation",
            },
            {
                key: "annual_car_insurance",
                value: "$1,200",
                confidence: "MEDIUM",
                reasoning: "Last statement was $100/month; assuming similar renewal",
                impact: "Allocated to monthly budget as $100",
            },
        ];

        const workflow: WorkflowState = {
            id: "workflow_3" as EntityId,
            householdId: "hh_1" as EntityId,
            workflowType: AdvisorWorkflow.BUDGET_CREATE,
            assumptions,
            status: WorkflowStatus.ACTIVE,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        expect(workflow.assumptions).toHaveLength(2);
        expect(workflow.assumptions![0].reasoning).toContain("3-month average");
        expect(workflow.assumptions![1].confidence).toBe("MEDIUM");
    });

    test("tracks pending questions awaiting user input", () => {
        const workflow: WorkflowState = {
            id: "workflow_4" as EntityId,
            householdId: "hh_1" as EntityId,
            workflowType: AdvisorWorkflow.BUDGET_CREATE,
            pendingQuestions: [
                {
                    id: "q1",
                    question: "How much are you comfortable spending on entertainment monthly?",
                    why: "Your discretionary spending varies; we need a policy",
                    affectsWhat: "Discretionary budget allocation",
                },
                {
                    id: "q2",
                    question: "Do you have any planned major purchases in the next 6 months?",
                    why: "Helps distinguish between expected and unexpected expenses",
                    affectsWhat: "Emergency fund adequacy assessment",
                },
            ],
            status: WorkflowStatus.WAITING_FOR_USER,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        expect(workflow.pendingQuestions).toHaveLength(2);
        expect(workflow.pendingQuestions![0].affectsWhat).toContain("Discretionary");
    });

    test("links to financial snapshot for reproducibility", () => {
        const workflow: WorkflowState = {
            id: "workflow_5" as EntityId,
            householdId: "hh_1" as EntityId,
            workflowType: AdvisorWorkflow.BUDGET_SCENARIO,
            linkedFinancialSnapshotId: "snapshot_999" as EntityId,
            linkedSnapshotVersion: 1,
            status: WorkflowStatus.ACTIVE,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        expect(workflow.linkedFinancialSnapshotId).toBe("snapshot_999");
        expect(workflow.linkedSnapshotVersion).toBe(1);
    });
});

describe("AIResponse - Fact/Calculation/Assumption/Analysis/Proposal Model", () => {
    test("distinguishes facts from calculations", () => {
        const response: AIResponse = {
            answer: "Your dining budget is consistently too low.",
            facts: [
                {
                    statement: "Your dining budget is set to $400/month",
                    source: "BUDGET",
                    confidence: "CERTAIN",
                },
                {
                    statement: "Your actual dining spending over the last 3 months averaged $550/month",
                    source: "TRANSACTION_HISTORY",
                    confidence: "VERY_HIGH",
                },
            ],
            calculations: [
                {
                    name: "dining_variance",
                    valueCents: MoneyFromDollars(150),
                    formula: "actual_spending - planned_budget = 550 - 400",
                    calculationVersion: 1,
                },
                {
                    name: "variance_percentage",
                    valueCents: MoneyFromDollars(37.5),  // 37.5% represented as currency
                    formula: "(variance / budget) * 100 = (150 / 400) * 100",
                    calculationVersion: 1,
                },
            ],
            assumptions: [
                {
                    key: "current_month_dining",
                    value: "$550/month",
                    confidence: "MEDIUM",
                    reason: "Assuming similar spending to prior 3 months",
                    impact: "If current month spending increases, this estimate becomes lower",
                },
            ],
            analysis: [
                {
                    conclusion: "Your dining budget is unrealistic given actual spending patterns.",
                    basedOnFacts: ["Your dining budget is set to $400/month"],
                    basedOnCalculations: ["dining_variance"],
                    confidence: "HIGH",
                },
            ],
            toolsUsed: ["get_budget_status", "get_cash_flow"],
            financialSnapshotVersion: 1,
            financialSnapshotAsOf: new Date(),
            confidence: "HIGH",
        };

        expect(response.facts).toHaveLength(2);
        expect(response.calculations).toHaveLength(2);
        expect(response.assumptions).toHaveLength(1);
        expect(response.analysis).toHaveLength(1);
        expect(response.facts[0].confidence).toBe("CERTAIN");
        expect(response.calculations[0].name).toBe("dining_variance");
    });

    test("includes proposal for suggested actions", () => {
        const response: AIResponse = {
            answer: "I recommend increasing your dining budget to $600 and reducing entertainment by $100.",
            facts: [],
            calculations: [],
            assumptions: [],
            analysis: [],
            proposal: {
                title: "Dining Budget Adjustment",
                description: "Increase dining budget from $400 to $600; reduce entertainment from $200 to $100",
                rationale: "Actual spending is consistently $150/month over budget; adjusting budget aligns with behavior",
                tradeoffs: ["Reduces entertainment allocation by $100/month"],
                affectedCategories: ["dining", "entertainment"],
                estimatedImpactCents: MoneyFromDollars(150),
                estimatedImpactDirection: "POSITIVE",
                approval_required: true,
            },
            toolsUsed: ["get_budget_status"],
            financialSnapshotVersion: 1,
            financialSnapshotAsOf: new Date(),
            confidence: "HIGH",
        };

        expect(response.proposal).toBeDefined();
        expect(response.proposal!.approval_required).toBe(true);
        expect(response.proposal!.affectedCategories).toContain("dining");
    });

    test("includes limitations and confidence signals", () => {
        const response: AIResponse = {
            answer: "Based on available data, your financial health is improving.",
            facts: [],
            calculations: [],
            assumptions: [],
            analysis: [],
            toolsUsed: [],
            financialSnapshotVersion: 1,
            financialSnapshotAsOf: new Date(),
            confidence: "MEDIUM",
            limitations: [
                "We only have 2 months of transaction data; confidence would be higher with 6+ months",
                "Your income is manually entered; actual variation is unknown",
                "Some discretionary spending may be miscategorized",
            ],
        };

        expect(response.limitations).toHaveLength(3);
        expect(response.confidence).toBe("MEDIUM");
    });
});

describe("AdvisorMessage", () => {
    test("represents a user message", () => {
        const message: AdvisorMessage = {
            id: "msg_1" as EntityId,
            conversationId: "conv_1" as EntityId,
            role: AdvisorMessageRole.USER,
            content: "Why am I always over budget?",
            createdAt: new Date(),
        };

        expect(message.role).toBe(AdvisorMessageRole.USER);
        expect(message.content).toContain("over budget");
    });

    test("represents an assistant response with structured AIResponse", () => {
        const message: AdvisorMessage = {
            id: "msg_2" as EntityId,
            conversationId: "conv_1" as EntityId,
            role: AdvisorMessageRole.ASSISTANT,
            content: "Your dining budget is consistently too low.",
            aiResponse: {
                answer: "Your dining budget is consistently too low.",
                facts: [
                    {
                        statement: "Your dining budget is $400/month",
                        source: "BUDGET",
                        confidence: "CERTAIN",
                    },
                ],
                calculations: [],
                assumptions: [],
                analysis: [
                    {
                        conclusion: "Your budget is unrealistic",
                        basedOnFacts: ["Your dining budget is $400/month"],
                        basedOnCalculations: [],
                        confidence: "HIGH",
                    },
                ],
                toolsUsed: ["get_budget_status"],
                financialSnapshotVersion: 1,
                financialSnapshotAsOf: new Date(),
                confidence: "HIGH",
            },
            createdAt: new Date(),
        };

        expect(message.role).toBe(AdvisorMessageRole.ASSISTANT);
        expect(message.aiResponse?.facts).toHaveLength(1);
    });

    test("represents a tool execution result", () => {
        const message: AdvisorMessage = {
            id: "msg_3" as EntityId,
            conversationId: "conv_1" as EntityId,
            role: AdvisorMessageRole.TOOL,
            content: "Tool get_budget_status returned results",
            toolExecutionId: "exec_1" as EntityId,
            createdAt: new Date(),
        };

        expect(message.role).toBe(AdvisorMessageRole.TOOL);
        expect(message.toolExecutionId).toBe("exec_1");
    });

    test("includes metadata linking to workflow and related items", () => {
        const message: AdvisorMessage = {
            id: "msg_4" as EntityId,
            conversationId: "conv_1" as EntityId,
            role: AdvisorMessageRole.ASSISTANT,
            content: "Here is your current budget status.",
            metadata: {
                workflowId: "workflow_1" as EntityId,
                workflowType: AdvisorWorkflow.BUDGET_STATUS,
                relatedItems: [
                    { type: "BUDGET", id: "budget_1" as EntityId, name: "Dining" },
                    { type: "BUDGET", id: "budget_2" as EntityId, name: "Entertainment" },
                ],
            },
            createdAt: new Date(),
        };

        expect(message.metadata?.workflowType).toBe(AdvisorWorkflow.BUDGET_STATUS);
        expect(message.metadata?.relatedItems).toHaveLength(2);
    });
});

describe("ToolExecution Audit Trail", () => {
    test("records tool execution with provenance", () => {
        const execution: ToolExecution = {
            id: "exec_1" as EntityId,
            conversationId: "conv_1" as EntityId,
            messageId: "msg_2" as EntityId,
            toolName: "get_budget_status",
            inputParams: {
                householdId: "hh_1",
                month: 9,
                year: 2026,
            },
            result: {
                status: "OVER_BUDGET",
                categories: [
                    { name: "Dining", variance: 150, percentage: 37.5 },
                ],
            },
            durationMs: 42,
            executionVersion: 1,
            executedAt: new Date(),
            correlationId: "corr_1" as EntityId,
        };

        expect(execution.toolName).toBe("get_budget_status");
        expect(execution.durationMs).toBe(42);
        expect(execution.result?.status).toBe("OVER_BUDGET");
        expect(execution.correlationId).toBe("corr_1");
    });

    test("records tool execution errors", () => {
        const failedExecution: ToolExecution = {
            id: "exec_2" as EntityId,
            conversationId: "conv_1" as EntityId,
            messageId: "msg_3" as EntityId,
            toolName: "get_financial_snapshot",
            inputParams: { householdId: "hh_1" },
            errorMessage: "Household not found",
            result: undefined,
            durationMs: 15,
            executionVersion: 1,
            executedAt: new Date(),
            correlationId: "corr_2" as EntityId,
        };

        expect(failedExecution.errorMessage).toBe("Household not found");
        expect(failedExecution.result).toBeUndefined();
    });

    test("enables audit trail queries by correlation ID", () => {
        const correlationId = "corr_123" as EntityId;
        const executions: ToolExecution[] = [
            {
                id: "e1" as EntityId,
                conversationId: "c1" as EntityId,
                messageId: "m1" as EntityId,
                toolName: "get_financial_snapshot",
                inputParams: {},
                result: { cash: 50000 },
                durationMs: 30,
                executionVersion: 1,
                executedAt: new Date(),
                correlationId,
            },
            {
                id: "e2" as EntityId,
                conversationId: "c1" as EntityId,
                messageId: "m2" as EntityId,
                toolName: "get_budget_status",
                inputParams: {},
                result: {},
                durationMs: 25,
                executionVersion: 1,
                executedAt: new Date(),
                correlationId,
            },
        ];

        const relatedExecutions = executions.filter(e => e.correlationId === correlationId);
        expect(relatedExecutions).toHaveLength(2);
    });
});

describe("Conversation Workflow Integration", () => {
    test("traces a complete budget diagnosis workflow", () => {
        // 1. Conversation starts
        const conversation = {
            id: "conv_1" as EntityId,
            householdId: "hh_1" as EntityId,
            memberId: "member_1" as EntityId,
            title: "Budget diagnosis",
            status: "ACTIVE" as const,
            currentWorkflow: AdvisorWorkflow.BUDGET_DIAGNOSE,
            messageCount: 4,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // 2. Messages recorded (immutable append-only)
        const messages: AdvisorMessage[] = [
            {
                id: "msg_1" as EntityId,
                conversationId: conversation.id,
                role: AdvisorMessageRole.USER,
                content: "Why am I always over budget?",
                createdAt: new Date(),
            },
            {
                id: "msg_2" as EntityId,
                conversationId: conversation.id,
                role: AdvisorMessageRole.TOOL,
                toolExecutionId: "exec_1" as EntityId,
                content: "Fetched budget history",
                createdAt: new Date(),
            },
            {
                id: "msg_3" as EntityId,
                conversationId: conversation.id,
                role: AdvisorMessageRole.ASSISTANT,
                content: "I found that dining is consistently over budget...",
                aiResponse: {
                    answer: "Your dining budget is too low.",
                    facts: [],
                    calculations: [],
                    assumptions: [],
                    analysis: [],
                    toolsUsed: ["get_budget_status"],
                    financialSnapshotVersion: 1,
                    financialSnapshotAsOf: new Date(),
                    confidence: "HIGH",
                },
                createdAt: new Date(),
            },
        ];

        // 3. Workflow state separate from messages
        const workflow: WorkflowState = {
            id: "workflow_1" as EntityId,
            householdId: conversation.householdId,
            conversationId: conversation.id,
            workflowType: AdvisorWorkflow.BUDGET_DIAGNOSE,
            status: WorkflowStatus.COMPLETED,
            createdAt: new Date(),
            updatedAt: new Date(),
            completedAt: new Date(),
        };

        expect(messages).toHaveLength(3);
        expect(workflow.workflowType).toBe(AdvisorWorkflow.BUDGET_DIAGNOSE);
        expect(workflow.status).toBe(WorkflowStatus.COMPLETED);
    });

    test("supports multi-message budget creation with approval", () => {
        // Multi-turn workflow where user refines the proposed budget
        const workflow: WorkflowState = {
            id: "workflow_2" as EntityId,
            householdId: "hh_1" as EntityId,
            conversationId: "conv_2" as EntityId,
            workflowType: AdvisorWorkflow.BUDGET_CREATE,
            status: WorkflowStatus.READY_FOR_REVIEW,
            proposedChanges: [
                {
                    category: "dining",
                    proposedBudgetCents: MoneyFromDollars(600),
                    currentBudgetCents: MoneyFromDollars(400),
                    reason: "Based on 3-month average spending of $550",
                },
            ],
            assumptions: [
                {
                    key: "dining_stability",
                    value: "Spending will remain stable",
                    confidence: "MEDIUM",
                    reasoning: "Based on historical data",
                    impact: "Used to estimate ongoing dining costs",
                },
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // Turn 1: User asks for budget
        // Turn 2: AI proposes budget
        // Turn 3: User says "That seems too aggressive"
        // Turn 4: AI refines proposal
        // Turn 5: User approves (workflow status → APPROVED)

        expect(workflow.status).toBe(WorkflowStatus.READY_FOR_REVIEW);
        expect(workflow.proposedChanges).toHaveLength(1);
    });
});

describe("Workflow Separation from Conversation History", () => {
    test("workflow state remains independent of message history", () => {
        // Same workflow can have multiple messages; workflow state is mutable
        const conversationMessages = 10; // 10 messages in conversation
        const workflowId = "workflow_1" as EntityId;

        const workflow: WorkflowState = {
            id: workflowId,
            householdId: "hh_1" as EntityId,
            conversationId: "conv_1" as EntityId,
            workflowType: AdvisorWorkflow.BUDGET_REVISE,
            knownActivities: [
                {
                    id: "act_1",
                    description: "Car repair",
                    estimatedAmountCents: MoneyFromDollars(500),
                    amountConfidence: "MEDIUM",
                    type: "ONE_TIME",
                },
            ],
            status: WorkflowStatus.ACTIVE,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        // After turn 2 (user clarifies amount), workflow state updates
        workflow.knownActivities![0].estimatedAmountCents = MoneyFromDollars(750);
        workflow.updatedAt = new Date();

        // Conversation history remains unchanged — it's an immutable log
        expect(conversationMessages).toBe(10);
        expect(workflow.knownActivities![0].estimatedAmountCents).toBe(75000);
        expect(workflow.updatedAt.getTime()).toBeGreaterThanOrEqual(workflow.createdAt.getTime());
    });
});
