/**
 * AI Audit Log Builder — pure, deterministic construction of an {@link AIAuditLogEntry} from an
 * orchestrated request's plan/results. No DB access here (packages/ai stays persistence-free);
 * the caller (route layer) persists the entry via a repository.
 *
 * Never includes raw financial payloads - only workflow/tool/version/provider/validation metadata.
 */

import {
    AdvisorWorkflow,
    AIAuditLogEntry,
    AIToolRegistry,
    AIValidationStatus,
    AIApprovalStatus,
} from "@house-fin/contracts";
import { OrchestratorRequest } from "./ai-orchestrator";
import { ToolExecutionResult } from "./ai-tool-executor";
import { ToolExecutionPlan } from "./ai-tool-planner";

const TOOL_VERSION_BY_NAME: Record<string, number> = Object.fromEntries(
    AIToolRegistry.map((tool) => [tool.name, tool.version])
);

/** Workflows that can result in a budget proposal awaiting approval. */
const APPROVAL_PENDING_WORKFLOWS = new Set<AdvisorWorkflow>([
    AdvisorWorkflow.BUDGET_CREATE,
    AdvisorWorkflow.BUDGET_REVISE,
]);

export interface BuildAuditLogEntryInput {
    request: OrchestratorRequest;
    plan: ToolExecutionPlan;
    toolResults: ToolExecutionResult[];
    success: boolean;
    totalDurationMs: number;
    /** Set only when an LLM call was attempted. */
    llmProvider?: { name: string; model?: string };
    /** Whether the LLM response passed grounding validation; undefined if never reached. */
    groundingPassed?: boolean;
    /** Graceful-failure category, if the request failed. */
    failureCategory?: string;
}

/** Looks for the financial snapshot version among successful tool results, without exposing the rest of the payload. */
function extractFinancialSnapshotVersion(toolResults: ToolExecutionResult[]): number | undefined {
    const snapshotResult = toolResults.find(
        (r) => r.success && r.toolName === "get_financial_snapshot"
    );
    const snapshot = snapshotResult?.data?.snapshot as { version?: number } | null | undefined;
    if (typeof snapshot?.version === "number") return snapshot.version;

    // Fallback: some tools (e.g. simulate_purchase) don't return a snapshot object but may still
    // carry a top-level snapshotVersion field.
    for (const result of toolResults) {
        if (!result.success || !result.data) continue;
        const version = (result.data as Record<string, unknown>).snapshotVersion;
        if (typeof version === "number") return version;
    }
    return undefined;
}

function resolveValidationStatus(success: boolean, groundingPassed?: boolean): AIValidationStatus {
    if (!success || groundingPassed === undefined) return "NOT_APPLICABLE";
    return groundingPassed ? "PASSED" : "FAILED_SAFE_FALLBACK";
}

function resolveApprovalStatus(workflow: AdvisorWorkflow): AIApprovalStatus {
    return APPROVAL_PENDING_WORKFLOWS.has(workflow) ? "PENDING" : "NOT_APPLICABLE";
}

/**
 * Builds the audit entry for one orchestrated request. Deterministic given the same inputs.
 */
export function buildAuditLogEntry(input: BuildAuditLogEntryInput): AIAuditLogEntry {
    const { request, plan, toolResults, success, totalDurationMs, llmProvider, groundingPassed, failureCategory } = input;

    const toolsRequested = plan.tools.map((t) => t.toolName);
    const toolsExecuted = toolResults.filter((r) => r.success).map((r) => r.toolName);
    const toolVersions: Record<string, number> = {};
    for (const toolName of toolsRequested) {
        if (toolName in TOOL_VERSION_BY_NAME) {
            toolVersions[toolName] = TOOL_VERSION_BY_NAME[toolName];
        }
    }

    return {
        correlationId: request.correlationId,
        conversationId: request.conversationId,
        householdId: request.householdId,
        memberId: request.memberId,
        workflow: request.workflowType,
        intent: request.workflowType,
        toolsRequested,
        toolsExecuted,
        toolVersions,
        financialSnapshotVersion: extractFinancialSnapshotVersion(toolResults),
        provider: llmProvider?.name,
        model: llmProvider?.model,
        validationStatus: resolveValidationStatus(success, groundingPassed),
        approvalStatus: resolveApprovalStatus(request.workflowType),
        success,
        failureCategory,
        totalDurationMs,
    };
}
