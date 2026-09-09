/**
 * AI Audit Log — contracts for recording *metadata* about every AI advisor interaction.
 *
 * Deliberately excludes raw financial payloads (amounts, balances, transactions). The goal
 * is to let an administrator answer "what did the AI do and why" (workflow, tools, versions,
 * provider, validation/approval outcome) without exposing private financial data - the actual
 * numbers already live in the household's own data and in the tool-execution audit trail,
 * which is household-scoped and not intended for cross-household admin review.
 */

import { EntityId, AdvisorWorkflow } from "./index";

/** Whether the LLM's response passed grounding validation, or the interaction never reached that step. */
export type AIValidationStatus = "PASSED" | "FAILED_SAFE_FALLBACK" | "NOT_APPLICABLE";

/** Best-effort classification of whether this interaction could lead to something requiring approval. */
export type AIApprovalStatus = "PENDING" | "NOT_APPLICABLE";

/**
 * One audit record per orchestrated AI request. Immutable, append-only.
 */
export interface AIAuditLogEntry {
    /** Request correlation ID - ties this entry to application logs and tool-execution records. */
    correlationId: EntityId;
    /** Conversation this request belongs to, if any. */
    conversationId?: EntityId;
    householdId: EntityId;
    memberId: EntityId;
    /** Classified workflow for this request (e.g. BUDGET_CREATE). */
    workflow: AdvisorWorkflow;
    /** Classified intent - currently identical to workflow (intent classification produces the workflow). */
    intent: AdvisorWorkflow;
    /** Every tool the plan called for. */
    toolsRequested: string[];
    /** Tools that actually completed successfully. */
    toolsExecuted: string[];
    /** Tool name -> implementation version, for reproducibility. */
    toolVersions: Record<string, number>;
    /** Version of the financial snapshot the tools/LLM reasoned over, if determinable. */
    financialSnapshotVersion?: number;
    /** LLM provider name (e.g. "anthropic"), if an LLM call was attempted. */
    provider?: string;
    /** LLM model identifier, if an LLM call was attempted. */
    model?: string;
    validationStatus: AIValidationStatus;
    approvalStatus: AIApprovalStatus;
    /** Whether the overall request succeeded (a safe fallback message still counts as success). */
    success: boolean;
    /** Graceful-failure category, if the request could not be completed. */
    failureCategory?: string;
    totalDurationMs: number;
}

/** An {@link AIAuditLogEntry} as persisted, with generated id/timestamp. */
export interface StoredAIAuditLogEntry extends AIAuditLogEntry {
    id: EntityId;
    createdAt: Date;
}

/**
 * Aggregate metrics computed from the audit log (and related tables) over a time range.
 * Used for operational dashboards - never includes per-household financial data.
 */
export interface AIMetricsSnapshot {
    periodStart: Date;
    periodEnd: Date;
    /** Total AI requests processed (successful + failed). */
    aiRequestCount: number;
    /** Successful tool executions / total tool executions attempted. */
    toolSuccessRate: number;
    /** Failed tool executions / total tool executions attempted. */
    toolFailureRate: number;
    /** COMPLETED workflows / all workflows that reached a terminal state. */
    workflowCompletionRate: number;
    /** Requests that failed due to an LLM-category failure / total requests. */
    llmFailureRate: number;
    /** Requests where the LLM response failed grounding validation / total requests that reached validation. */
    responseValidationFailureRate: number;
    /** Budget proposals APPROVED or PERSISTED / total non-PROPOSED proposals. */
    proposalApprovalRate: number;
    /** Budget-related workflows CANCELLED / total budget-related workflows that reached a terminal state. */
    budgetWorkflowAbandonmentRate: number;
    /** Mean total_duration_ms across all requests in the period. */
    averageResponseTimeMs: number;
}
