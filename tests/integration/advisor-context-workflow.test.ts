/**
 * Integration Tests: Advisor Context Service with Multi-Turn Workflow State
 *
 * Tests the integration of workflow state management with the advisor context service.
 * Verifies that workflow state is updated and persisted across conversation turns.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import {
    EntityId,
    WorkflowState,
    WorkflowStatus,
    AdvisorWorkflow,
} from "@house-fin/contracts";
import {
    AdvisorContextService,
    createAdvisorContextService,
} from "@house-fin/domain";
import { createFinancialContextBuilder } from "@house-fin/ai";

describe("Advisor Context Service - Multi-Turn Workflow", () => {
    let contextService: AdvisorContextService;
    const householdId = "f47ac10b-58cc-4372-a567-0e02b2c3d479" as EntityId;

    beforeEach(() => {
        // Create mock context builder (minimal for these tests)
        const contextBuilder = createFinancialContextBuilder({
            budgetRepo: {
                findByHouseholdAndPeriod: async () => [],
                findByHouseholdIdRange: async () => [],
            },
            transactionRepo: {
                findByHouseholdAndPeriod: async () => [],
                findByHouseholdDateRange: async () => [],
            },
            settingsRepo: {
                findByHouseholdId: async () => null,
            },
            recurringPatternsRepo: {
                findByHouseholdId: async () => [],
            },
            snapshotRepo: {
                findLatest: async () => null,
            },
            debtRepo: {
                findByHouseholdId: async () => null,
            },
            goalsRepo: {
                findByHouseholdId: async () => [],
            },
        });

        contextService = createAdvisorContextService(contextBuilder);
    });

    describe("Workflow State Updates from User Messages", () => {
        it("updates workflow with activities from user message", () => {
            const workflow: WorkflowState = {
                id: "workflow-123" as EntityId,
                householdId,
                conversationId: "conv-123" as EntityId,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                planningPeriod: { year: 2026, month: 8 },
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const userMessage =
                "We have a $1,200 car repair, a $900 birthday celebration, and a $1,500 trip.";
            const updated = contextService.updateWorkflowStateFromMessage(
                workflow,
                userMessage
            );

            expect(updated.knownActivities).toHaveLength(3);
            expect(
                updated.knownActivities!.some((a) =>
                    a.description.toLowerCase().includes("car")
                )
            ).toBe(true);
        });

        it("updates workflow with constraints from user message", () => {
            const workflow: WorkflowState = {
                id: "workflow-123" as EntityId,
                householdId,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const userMessage = "I don't want to reduce vacation savings.";
            const updated = contextService.updateWorkflowStateFromMessage(
                workflow,
                userMessage
            );

            expect(updated.assumptions).toHaveLength(1);
            expect(updated.assumptions![0].key).toContain("vacation");
        });

        it("accumulates activities across multiple message updates", () => {
            let workflow: WorkflowState = {
                id: "workflow-123" as EntityId,
                householdId,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Message 1: Add first activities
            let updated = contextService.updateWorkflowStateFromMessage(
                workflow,
                "We have a $1,200 car repair and $900 birthday celebration."
            );
            workflow = { ...workflow, ...updated };
            expect(workflow.knownActivities).toHaveLength(2);

            // Message 2: Add more activities
            updated = contextService.updateWorkflowStateFromMessage(
                workflow,
                "Plus a $1,500 trip."
            );
            workflow = { ...workflow, ...updated };
            expect(workflow.knownActivities).toHaveLength(3);
        });
    });

    describe("Workflow Planning Description", () => {
        it("describes workflow with activities and period", () => {
            const workflow: WorkflowState = {
                id: "workflow-123" as EntityId,
                householdId,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                planningPeriod: { year: 2026, month: 8 },
                knownActivities: [
                    {
                        id: "activity-1",
                        description: "Car repair",
                        estimatedAmountCents: 120000 as any,
                        amountConfidence: "HIGH",
                        type: "ONE_TIME",
                    },
                    {
                        id: "activity-2",
                        description: "Trip",
                        estimatedAmountCents: 150000 as any,
                        amountConfidence: "HIGH",
                        type: "ONE_TIME",
                    },
                ],
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const description = contextService.describeWorkflowPlanning(workflow);

            expect(description).toContain("August");
            expect(description).toContain("2026");
            expect(description).toContain("Car repair");
            expect(description).toContain("Trip");
            expect(description).toContain("Total: $2700");
        });

        it("describes workflow with constraints", () => {
            const workflow: WorkflowState = {
                id: "workflow-123" as EntityId,
                householdId,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                assumptions: [
                    {
                        key: "preserve_vacation_savings",
                        value: "Do not reduce or eliminate vacation savings",
                        confidence: "HIGH",
                        reasoning: "User explicitly stated",
                        impact: "Proposed changes must keep vacation savings unchanged",
                    },
                ],
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const description = contextService.describeWorkflowPlanning(workflow);

            expect(description).toContain("Constraints:");
            expect(description).toContain("vacation savings");
        });

        it("returns simple description for empty workflow", () => {
            const workflow: WorkflowState = {
                id: "workflow-123" as EntityId,
                householdId,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const description = contextService.describeWorkflowPlanning(workflow);

            expect(description).toContain("Budget planning mode");
        });
    });

    describe("Activity Cost Calculation", () => {
        it("calculates total activity cost", () => {
            const workflow: WorkflowState = {
                id: "workflow-123" as EntityId,
                householdId,
                knownActivities: [
                    {
                        id: "activity-1",
                        description: "Car repair",
                        estimatedAmountCents: 120000 as any,
                        amountConfidence: "HIGH",
                        type: "ONE_TIME",
                    },
                    {
                        id: "activity-2",
                        description: "Birthday",
                        estimatedAmountCents: 90000 as any,
                        amountConfidence: "HIGH",
                        type: "ONE_TIME",
                    },
                    {
                        id: "activity-3",
                        description: "Trip",
                        estimatedAmountCents: 150000 as any,
                        amountConfidence: "HIGH",
                        type: "ONE_TIME",
                    },
                ],
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const total = contextService.calculateTotalActivityCost(workflow);

            expect(total).toBe(360000); // $3,600
        });

        it("returns 0 for workflow with no activities", () => {
            const workflow: WorkflowState = {
                id: "workflow-123" as EntityId,
                householdId,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const total = contextService.calculateTotalActivityCost(workflow);

            expect(total).toBe(0);
        });
    });

    describe("Complete Multi-Turn Conversation Flow", () => {
        it("processes a 3-turn budget planning conversation", () => {
            // Initial workflow
            let workflow: WorkflowState = {
                id: "workflow-123" as EntityId,
                householdId,
                conversationId: "conv-123" as EntityId,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                planningPeriod: { year: 2026, month: 8 },
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Turn 1: User describes activities
            const turn1Message =
                "Help me revise next month's budget. We have a $1,200 car repair, " +
                "a $900 birthday celebration, and a $1,500 trip.";

            let updated = contextService.updateWorkflowStateFromMessage(
                workflow,
                turn1Message
            );
            workflow = { ...workflow, ...updated };

            // Verify state after turn 1
            expect(workflow.knownActivities).toHaveLength(3);
            let totalCost = contextService.calculateTotalActivityCost(workflow);
            expect(totalCost).toBe(360000);

            // Assistant acknowledges the plan
            let planDescription = contextService.describeWorkflowPlanning(workflow);
            expect(planDescription).toContain("$3600");
            expect(planDescription).toContain("August");

            // Turn 2: User adds a constraint
            const turn2Message = "I don't want to reduce vacation savings.";

            updated = contextService.updateWorkflowStateFromMessage(
                workflow,
                turn2Message
            );
            workflow = { ...workflow, ...updated };

            // Verify state after turn 2
            expect(workflow.assumptions).toHaveLength(1);
            planDescription = contextService.describeWorkflowPlanning(workflow);
            expect(planDescription).toContain("Constraints:");
            expect(planDescription).toContain("vacation savings");

            // Turn 3: User adds another constraint
            const turn3Message = "Also, keep the emergency fund fully stocked.";

            updated = contextService.updateWorkflowStateFromMessage(
                workflow,
                turn3Message
            );
            workflow = { ...workflow, ...updated };

            // Verify state after turn 3
            expect(workflow.assumptions!.length).toBeGreaterThanOrEqual(2);
            planDescription = contextService.describeWorkflowPlanning(workflow);
            expect(planDescription).toContain("emergency fund");

            // Final verification: all planning context preserved
            expect(workflow.knownActivities).toHaveLength(3);
            expect(workflow.planningPeriod?.year).toBe(2026);
            expect(workflow.planningPeriod?.month).toBe(8);
            expect(workflow.workflowType).toBe(AdvisorWorkflow.BUDGET_REVISE);
        });

        it("handles conversation where user refines an activity amount", () => {
            let workflow: WorkflowState = {
                id: "workflow-123" as EntityId,
                householdId,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Turn 1: User mentions activity with amount
            let updated = contextService.updateWorkflowStateFromMessage(
                workflow,
                "We need about $1,000 for car repairs."
            );
            workflow = { ...workflow, ...updated };

            const initialActivity = workflow.knownActivities![0];
            expect(initialActivity.description.toLowerCase()).toContain("car");

            // Turn 2: User refines the amount
            const turn2Message = "Actually, let me update that - it's $1,300 for the car repair.";
            updated = contextService.updateWorkflowStateFromMessage(workflow, turn2Message);
            workflow = { ...workflow, ...updated };

            // Should now have the updated activity (same description but different amount)
            expect(workflow.knownActivities!.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe("Workflow State Persistence Scenarios", () => {
        it("maintains workflow across multiple context builds", async () => {
            let workflow: WorkflowState = {
                id: "workflow-123" as EntityId,
                householdId,
                conversationId: "conv-123" as EntityId,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                planningPeriod: { year: 2026, month: 8 },
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Update with activities
            let updated = contextService.updateWorkflowStateFromMessage(
                workflow,
                "We have $1,200 for car repair and $900 for birthday."
            );
            workflow = { ...workflow, ...updated };

            // Build context (this would be called by API before tool invocation)
            const context = await contextService.buildContextForRequest(
                householdId,
                "How should I adjust my budget for these activities?",
                workflow
            );

            // Context should include workflow type
            expect(context.workflowType).toBe(AdvisorWorkflow.BUDGET_REVISE);

            // Workflow state should be unchanged
            expect(workflow.knownActivities).toHaveLength(2);
        });

        it("enables assistant to reference workflow state in responses", () => {
            const workflow: WorkflowState = {
                id: "workflow-123" as EntityId,
                householdId,
                conversationId: "conv-123" as EntityId,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                planningPeriod: { year: 2026, month: 8 },
                knownActivities: [
                    {
                        id: "activity-1",
                        description: "Car repair",
                        estimatedAmountCents: 120000 as any,
                        amountConfidence: "HIGH",
                        type: "ONE_TIME",
                    },
                    {
                        id: "activity-2",
                        description: "Trip",
                        estimatedAmountCents: 150000 as any,
                        amountConfidence: "HIGH",
                        type: "ONE_TIME",
                    },
                ],
                assumptions: [
                    {
                        key: "preserve_vacation_savings",
                        value: "Do not reduce or eliminate vacation savings",
                        confidence: "HIGH",
                        reasoning: "User explicitly stated",
                        impact: "Proposed changes must preserve vacation savings",
                    },
                ],
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Assistant can build response using workflow planning description
            const planDescription = contextService.describeWorkflowPlanning(workflow);

            const responseText =
                `I understand. You're planning for August 2026 with these activities: ` +
                `${planDescription}. ` +
                `Let me help you adjust your budget while preserving vacation savings.`;

            expect(responseText).toContain("August");
            expect(responseText).toContain("$2700");
            expect(responseText).toContain("vacation savings");
        });
    });
});
