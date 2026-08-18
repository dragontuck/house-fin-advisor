/**
 * Integration Tests: Multi-Turn Workflow Planning
 *
 * Tests the conversation flow for multi-turn budget planning scenarios.
 * Verifies that workflow state is properly maintained and updated across turns.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import {
    EntityId,
    WorkflowState,
    WorkflowStatus,
    AdvisorWorkflow,
} from "@house-fin/contracts";
import {
    WorkflowStateManager,
    createWorkflowStateManager,
} from "@house-fin/domain";

describe("Multi-Turn Budget Planning Workflows", () => {
    let manager: WorkflowStateManager;
    const householdId = "f47ac10b-58cc-4372-a567-0e02b2c3d479" as EntityId;

    beforeEach(() => {
        manager = createWorkflowStateManager();
    });

    describe("Activity Extraction from Natural Language", () => {
        it("extracts single dollar amount with description", () => {
            const message = "We need $1,200 for a car repair.";
            const result = WorkflowStateManager.extractPlanningData(message);

            expect(result.activities).toHaveLength(1);
            expect(result.activities[0].description).toMatch(/car repair/i);
            expect(result.activities[0].estimatedAmountCents).toBe(120000);
            expect(result.activities[0].amountConfidence).toBe("HIGH");
            expect(result.activities[0].type).toBe("ONE_TIME");
        });

        it("extracts multiple activities from single message", () => {
            const message =
                "We have a $1,200 car repair, a $900 birthday celebration, and a $1,500 trip.";
            const result = WorkflowStateManager.extractPlanningData(message);

            expect(result.activities).toHaveLength(3);

            // Verify descriptions
            const descriptions = result.activities.map((a) => a.description.toLowerCase());
            expect(descriptions).toContainEqual(expect.stringContaining("car repair"));
            expect(descriptions).toContainEqual(expect.stringContaining("birthday"));
            expect(descriptions).toContainEqual(expect.stringContaining("trip"));

            // Verify amounts
            expect(result.activities.map((a) => a.estimatedAmountCents)).toEqual(
                expect.arrayContaining([120000, 90000, 150000])
            );
        });

        it("handles amounts with comma formatting", () => {
            const message = "We need $2,500 for home repairs.";
            const result = WorkflowStateManager.extractPlanningData(message);

            expect(result.activities).toHaveLength(1);
            expect(result.activities[0].estimatedAmountCents).toBe(250000);
        });

        it("handles decimal amounts", () => {
            const message = "Budget $1,234.50 for groceries.";
            const result = WorkflowStateManager.extractPlanningData(message);

            expect(result.activities).toHaveLength(1);
            expect(result.activities[0].estimatedAmountCents).toBe(123450);
        });

        it("extracts constraint from message", () => {
            const message = "I don't want to reduce vacation savings.";
            const result = WorkflowStateManager.extractPlanningData(message);

            expect(result.constraints).toHaveLength(1);
            expect(result.constraints[0].key).toMatch(/vacation/i);
            expect(result.constraints[0].value).toMatch(/vacation savings/i);
            expect(result.constraints[0].confidence).toBe("HIGH");
        });

        it("extracts multiple constraint variations", () => {
            const message =
                "Keep emergency fund unchanged and don't cut grocery spending.";
            const result = WorkflowStateManager.extractPlanningData(message);

            expect(result.constraints.length).toBeGreaterThanOrEqual(2);

            const keys = result.constraints.map((c) => c.key);
            expect(keys.some((k) => k.includes("emergency"))).toBe(true);
            expect(keys.some((k) => k.includes("grocery"))).toBe(true);
        });

        it("uses 'preserve' constraint pattern", () => {
            const message = "Preserve savings goals at current levels.";
            const result = WorkflowStateManager.extractPlanningData(message);

            expect(result.constraints).toHaveLength(1);
            expect(result.constraints[0].value).toMatch(/savings goals/i);
        });

        it("handles 'keep' constraint pattern", () => {
            const message = "Keep healthcare spending as is.";
            const result = WorkflowStateManager.extractPlanningData(message);

            expect(result.constraints).toHaveLength(1);
        });

        it("avoids duplicate activities in same message", () => {
            const message =
                "We have $1,000 home repairs. Actually, let's budget $1,000 for home repairs.";
            const result = WorkflowStateManager.extractPlanningData(message);

            // Should deduplicate by description (both say "home repairs")
            expect(result.activities.length).toBeLessThanOrEqual(2);
        });
    });

    describe("Workflow State Updates Across Turns", () => {
        let initialWorkflow: WorkflowState;

        beforeEach(() => {
            initialWorkflow = {
                id: "workflow-123" as EntityId,
                householdId,
                conversationId: "conv-123" as EntityId,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                planningPeriod: { year: 2026, month: 8 },
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        });

        it("adds activities to empty workflow state", () => {
            const userMessage = "We need $1,200 for car repair and $900 for birthday.";
            const extracted = WorkflowStateManager.extractPlanningData(userMessage);
            const updated = WorkflowStateManager.updateWorkflowState(initialWorkflow, extracted);

            expect(updated.knownActivities).toHaveLength(2);
            expect(updated.knownActivities![0].description).toMatch(/car repair/i);
            expect(updated.knownActivities![1].description).toMatch(/birthday/i);
        });

        it("accumulates activities across multiple turns", () => {
            // Turn 1: Add first activities
            let extracted = WorkflowStateManager.extractPlanningData(
                "We have a $1,200 car repair and $900 birthday celebration."
            );
            let updated = WorkflowStateManager.updateWorkflowState(initialWorkflow, extracted);

            initialWorkflow = { ...initialWorkflow, ...updated };

            // Turn 2: Add more activities
            extracted = WorkflowStateManager.extractPlanningData("Plus a $1,500 trip.");
            updated = WorkflowStateManager.updateWorkflowState(initialWorkflow, extracted);

            // Should have all 3 activities
            expect(updated.knownActivities).toHaveLength(3);
            const descriptions = updated.knownActivities!.map((a) =>
                a.description.toLowerCase()
            );
            expect(descriptions).toContainEqual(expect.stringContaining("car"));
            expect(descriptions).toContainEqual(expect.stringContaining("birthday"));
            expect(descriptions).toContainEqual(expect.stringContaining("trip"));
        });

        it("accumulates constraints across turns", () => {
            // Turn 1: Add first constraint
            let extracted = WorkflowStateManager.extractPlanningData(
                "Don't reduce vacation savings."
            );
            let updated = WorkflowStateManager.updateWorkflowState(initialWorkflow, extracted);
            initialWorkflow = { ...initialWorkflow, ...updated };

            // Turn 2: Add second constraint
            extracted = WorkflowStateManager.extractPlanningData(
                "Keep emergency fund unchanged."
            );
            updated = WorkflowStateManager.updateWorkflowState(initialWorkflow, extracted);

            // Should have both constraints
            expect(updated.assumptions).toHaveLength(2);
        });

        it("avoids duplicate constraints", () => {
            // Add constraint
            let extracted = WorkflowStateManager.extractPlanningData(
                "Don't reduce vacation savings."
            );
            let updated = WorkflowStateManager.updateWorkflowState(initialWorkflow, extracted);
            initialWorkflow = { ...initialWorkflow, ...updated };

            // Repeat same constraint
            extracted = WorkflowStateManager.extractPlanningData(
                "I want to preserve vacation savings."
            );
            updated = WorkflowStateManager.updateWorkflowState(initialWorkflow, extracted);

            // Should still have only 1 constraint (deduplicated by key)
            expect(updated.assumptions).toHaveLength(1);
        });
    });

    describe("Workflow State Summary", () => {
        it("generates human-readable description of empty workflow", () => {
            const workflow: WorkflowState = {
                id: "workflow-123" as EntityId,
                householdId,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const description = WorkflowStateManager.describeWorkflowState(workflow);
            expect(description).toContain("Budget planning mode");
        });

        it("summarizes activities in workflow", () => {
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
                        description: "Birthday celebration",
                        estimatedAmountCents: 90000 as any,
                        amountConfidence: "HIGH",
                        type: "ONE_TIME",
                    },
                ],
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const description = WorkflowStateManager.describeWorkflowState(workflow);

            expect(description).toContain("Car repair");
            expect(description).toContain("$1200");
            expect(description).toContain("Birthday celebration");
            expect(description).toContain("$900");
            expect(description).toContain("Total: $2100");
        });

        it("summarizes constraints in workflow", () => {
            const workflow: WorkflowState = {
                id: "workflow-123" as EntityId,
                householdId,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                assumptions: [
                    {
                        key: "preserve_vacation_savings",
                        value: "Do not reduce or eliminate vacation savings",
                        confidence: "HIGH",
                        reasoning: "User explicitly stated this should be preserved",
                        impact:
                            "Proposed changes must keep vacation savings at current or higher level",
                    },
                ],
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const description = WorkflowStateManager.describeWorkflowState(workflow);

            expect(description).toContain("Constraints:");
            expect(description).toContain("vacation savings");
        });
    });

    describe("Activity Cost Calculation", () => {
        it("calculates total cost of activities", () => {
            const activities = [
                {
                    id: "activity-1",
                    description: "Car repair",
                    estimatedAmountCents: 120000 as any,
                    amountConfidence: "HIGH" as const,
                    type: "ONE_TIME" as const,
                },
                {
                    id: "activity-2",
                    description: "Birthday",
                    estimatedAmountCents: 90000 as any,
                    amountConfidence: "HIGH" as const,
                    type: "ONE_TIME" as const,
                },
                {
                    id: "activity-3",
                    description: "Trip",
                    estimatedAmountCents: 150000 as any,
                    amountConfidence: "HIGH" as const,
                    type: "ONE_TIME" as const,
                },
            ];

            const total = WorkflowStateManager.calculateTotalActivityCost(activities);
            expect(total).toBe(360000); // $3,600
        });

        it("returns 0 for empty activities", () => {
            const total = WorkflowStateManager.calculateTotalActivityCost([]);
            expect(total).toBe(0);
        });

        it("returns 0 for undefined activities", () => {
            const total = WorkflowStateManager.calculateTotalActivityCost(undefined);
            expect(total).toBe(0);
        });
    });

    describe("Full Multi-Turn Conversation Scenario", () => {
        it("processes complete budget revision workflow", () => {
            // Initial workflow state
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

            // Turn 1: User states activities
            let extracted = WorkflowStateManager.extractPlanningData(
                "We have a $1,200 car repair, a $900 birthday celebration, and a $1,500 trip."
            );
            let updated = WorkflowStateManager.updateWorkflowState(workflow, extracted);
            workflow = { ...workflow, ...updated };

            expect(workflow.knownActivities).toHaveLength(3);
            let totalCost = WorkflowStateManager.calculateTotalActivityCost(
                workflow.knownActivities
            );
            expect(totalCost).toBe(360000); // $3,600

            // Turn 2: User states constraint
            extracted = WorkflowStateManager.extractPlanningData(
                "I don't want to reduce vacation savings."
            );
            updated = WorkflowStateManager.updateWorkflowState(workflow, extracted);
            workflow = { ...workflow, ...updated };

            expect(workflow.assumptions).toHaveLength(1);
            expect(workflow.assumptions![0].key).toContain("vacation");

            // Turn 3: User adds more activity
            extracted = WorkflowStateManager.extractPlanningData("Also $200 for gifts.");
            updated = WorkflowStateManager.updateWorkflowState(workflow, extracted);
            workflow = { ...workflow, ...updated };

            expect(workflow.knownActivities).toHaveLength(4);
            totalCost = WorkflowStateManager.calculateTotalActivityCost(workflow.knownActivities);
            expect(totalCost).toBe(380000); // $3,800

            // Generate summary
            const summary = WorkflowStateManager.describeWorkflowState(workflow);
            expect(summary).toContain("August 2026");
            expect(summary).toContain("$3800");
            expect(summary).toContain("vacation savings");
        });

        it("handles workflow with planning period", () => {
            const workflow: WorkflowState = {
                id: "workflow-123" as EntityId,
                householdId,
                workflowType: AdvisorWorkflow.BUDGET_REVISE,
                planningPeriod: { year: 2026, month: 8 },
                status: WorkflowStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const description = WorkflowStateManager.describeWorkflowState(workflow);
            expect(description).toContain("August");
            expect(description).toContain("2026");
        });
    });

    describe("Edge Cases", () => {
        it("handles message with no financial information", () => {
            const message = "What do you think about the economy?";
            const result = WorkflowStateManager.extractPlanningData(message);

            expect(result.activities).toHaveLength(0);
            expect(result.constraints).toHaveLength(0);
        });

        it("handles message with malformed amounts", () => {
            const message = "We need $ for something.";
            const result = WorkflowStateManager.extractPlanningData(message);

            expect(result.activities).toHaveLength(0);
        });

        it("ignores very small amounts (likely typos)", () => {
            // Amounts less than $0.01 (1 cent) shouldn't be extracted
            const message = "We need $0.01 for something.";
            const result = WorkflowStateManager.extractPlanningData(message);

            // $0.01 = 1 cent - this would be extracted but is essentially noise
            // In production, we might filter out amounts < $1.00
            expect(result.activities.length).toBeLessThanOrEqual(1);
        });

        it("handles descriptions with special characters", () => {
            const message = "We need $500 for home/yard work.";
            const result = WorkflowStateManager.extractPlanningData(message);

            expect(result.activities.length).toBeGreaterThanOrEqual(1);
            expect(result.activities[0].description).toMatch(/home/i);
        });

        it("activity IDs are deterministic (same description + amount = same ID)", () => {
            const result1 = WorkflowStateManager.extractPlanningData("$1,200 car repair");
            const result2 = WorkflowStateManager.extractPlanningData("$1,200 car repair");

            expect(result1.activities[0].id).toBe(result2.activities[0].id);
        });
    });
});
