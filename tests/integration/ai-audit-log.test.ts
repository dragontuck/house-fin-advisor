/**
 * AI Audit Log Builder Tests
 *
 * Verifies that buildAuditLogEntry records the required audit metadata (workflow, intent, tools
 * requested/executed, tool versions, financial snapshot version, provider/model, validation and
 * approval status, timing) and never includes raw financial payloads.
 */

import { describe, it, expect } from "@jest/globals";
import { EntityId, AdvisorWorkflow } from "@house-fin/contracts";
import { buildAuditLogEntry, type BuildAuditLogEntryInput } from "@house-fin/ai";
import type { OrchestratorRequest } from "@house-fin/ai";
import type { ToolExecutionResult } from "@house-fin/ai";
import type { ToolExecutionPlan } from "@house-fin/ai";

function baseRequest(overrides: Partial<OrchestratorRequest> = {}): OrchestratorRequest {
    return {
        correlationId: "corr-1" as EntityId,
        userMessage: "Can we afford a $4,000 kitchen project?",
        workflowType: AdvisorWorkflow.AFFORDABILITY,
        householdId: "hh-1" as EntityId,
        memberId: "member-1" as EntityId,
        isHouseholdOwner: true,
        conversationId: "conv-1" as EntityId,
        ...overrides,
    };
}

function plan(tools: string[]): ToolExecutionPlan {
    return {
        workflowType: AdvisorWorkflow.AFFORDABILITY,
        description: "test plan",
        estimatedQueries: tools.length,
        tools: tools.map((toolName, sequence) => ({
            sequence,
            toolName,
            rationale: "test",
            isCritical: false,
            dependsOn: [],
            passToLLM: true,
        })),
    };
}

function toolResult(overrides: Partial<ToolExecutionResult>): ToolExecutionResult {
    return {
        sequence: 0,
        toolName: "get_financial_snapshot",
        success: true,
        durationMs: 5,
        retries: 0,
        executedAt: new Date("2027-01-01T00:00:00Z"),
        ...overrides,
    };
}

describe("buildAuditLogEntry", () => {
    it("records the core identity/context fields", () => {
        const entry = buildAuditLogEntry({
            request: baseRequest(),
            plan: plan(["get_financial_snapshot"]),
            toolResults: [toolResult({ data: { snapshot: { version: 3 } } })],
            success: true,
            totalDurationMs: 120,
            groundingPassed: true,
        });

        expect(entry.correlationId).toBe("corr-1");
        expect(entry.conversationId).toBe("conv-1");
        expect(entry.householdId).toBe("hh-1");
        expect(entry.memberId).toBe("member-1");
        expect(entry.workflow).toBe(AdvisorWorkflow.AFFORDABILITY);
        expect(entry.intent).toBe(AdvisorWorkflow.AFFORDABILITY);
        expect(entry.totalDurationMs).toBe(120);
    });

    it("captures tools requested vs. tools actually executed", () => {
        const entry = buildAuditLogEntry({
            request: baseRequest(),
            plan: plan(["get_financial_snapshot", "get_cash_flow", "simulate_purchase"]),
            toolResults: [
                toolResult({ toolName: "get_financial_snapshot", success: true }),
                toolResult({ toolName: "get_cash_flow", success: false, error: "boom" }),
                toolResult({ toolName: "simulate_purchase", success: true }),
            ],
            success: true,
            totalDurationMs: 50,
            groundingPassed: true,
        });

        expect(entry.toolsRequested).toEqual(["get_financial_snapshot", "get_cash_flow", "simulate_purchase"]);
        expect(entry.toolsExecuted).toEqual(["get_financial_snapshot", "simulate_purchase"]);
    });

    it("records tool implementation versions for every requested tool", () => {
        const entry = buildAuditLogEntry({
            request: baseRequest(),
            plan: plan(["get_financial_snapshot", "simulate_purchase"]),
            toolResults: [toolResult({ toolName: "get_financial_snapshot" })],
            success: true,
            totalDurationMs: 10,
            groundingPassed: true,
        });

        expect(entry.toolVersions.get_financial_snapshot).toBe(1);
        expect(entry.toolVersions.simulate_purchase).toBe(1);
    });

    it("extracts the financial snapshot version from get_financial_snapshot's result", () => {
        const entry = buildAuditLogEntry({
            request: baseRequest(),
            plan: plan(["get_financial_snapshot"]),
            toolResults: [
                toolResult({
                    toolName: "get_financial_snapshot",
                    data: { snapshot: { version: 7, cash: 500000, debt: 10000 } },
                }),
            ],
            success: true,
            totalDurationMs: 10,
            groundingPassed: true,
        });

        expect(entry.financialSnapshotVersion).toBe(7);
    });

    it("never includes raw financial payloads (only versions/metadata)", () => {
        const entry = buildAuditLogEntry({
            request: baseRequest(),
            plan: plan(["get_financial_snapshot"]),
            toolResults: [
                toolResult({
                    toolName: "get_financial_snapshot",
                    data: { snapshot: { version: 2, cash: 500000, debt: 250000, netWorth: 900000 } },
                }),
            ],
            success: true,
            totalDurationMs: 10,
            groundingPassed: true,
        });

        const serialized = JSON.stringify(entry);
        expect(serialized).not.toContain("500000");
        expect(serialized).not.toContain("250000");
        expect(serialized).not.toContain("900000");
    });

    it("records provider and model when an LLM call was attempted", () => {
        const entry = buildAuditLogEntry({
            request: baseRequest(),
            plan: plan(["get_financial_snapshot"]),
            toolResults: [toolResult({})],
            success: true,
            totalDurationMs: 10,
            llmProvider: { name: "anthropic", model: "claude-3-sonnet-20240229" },
            groundingPassed: true,
        });

        expect(entry.provider).toBe("anthropic");
        expect(entry.model).toBe("claude-3-sonnet-20240229");
    });

    it("marks validationStatus PASSED when grounding passed", () => {
        const entry = buildAuditLogEntry({
            request: baseRequest(),
            plan: plan([]),
            toolResults: [],
            success: true,
            totalDurationMs: 10,
            groundingPassed: true,
        });
        expect(entry.validationStatus).toBe("PASSED");
    });

    it("marks validationStatus FAILED_SAFE_FALLBACK when grounding failed", () => {
        const entry = buildAuditLogEntry({
            request: baseRequest(),
            plan: plan([]),
            toolResults: [],
            success: true,
            totalDurationMs: 10,
            groundingPassed: false,
        });
        expect(entry.validationStatus).toBe("FAILED_SAFE_FALLBACK");
    });

    it("marks validationStatus NOT_APPLICABLE when the request never reached response validation", () => {
        const entry = buildAuditLogEntry({
            request: baseRequest(),
            plan: plan(["get_financial_snapshot"]),
            toolResults: [toolResult({ success: false, error: "not registered" })],
            success: false,
            totalDurationMs: 10,
            failureCategory: "INVALID_TOOL_CALL",
        });
        expect(entry.validationStatus).toBe("NOT_APPLICABLE");
        expect(entry.success).toBe(false);
        expect(entry.failureCategory).toBe("INVALID_TOOL_CALL");
    });

    it("marks approvalStatus PENDING for proposal-generating workflows", () => {
        const createEntry = buildAuditLogEntry({
            request: baseRequest({ workflowType: AdvisorWorkflow.BUDGET_CREATE }),
            plan: plan([]),
            toolResults: [],
            success: true,
            totalDurationMs: 10,
            groundingPassed: true,
        });
        const reviseEntry = buildAuditLogEntry({
            request: baseRequest({ workflowType: AdvisorWorkflow.BUDGET_REVISE }),
            plan: plan([]),
            toolResults: [],
            success: true,
            totalDurationMs: 10,
            groundingPassed: true,
        });

        expect(createEntry.approvalStatus).toBe("PENDING");
        expect(reviseEntry.approvalStatus).toBe("PENDING");
    });

    it("marks approvalStatus NOT_APPLICABLE for non-proposal workflows", () => {
        const entry = buildAuditLogEntry({
            request: baseRequest({ workflowType: AdvisorWorkflow.FINANCIAL_HEALTH }),
            plan: plan([]),
            toolResults: [],
            success: true,
            totalDurationMs: 10,
            groundingPassed: true,
        });
        expect(entry.approvalStatus).toBe("NOT_APPLICABLE");
    });
});
