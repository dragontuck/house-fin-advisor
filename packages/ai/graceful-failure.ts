/**
 * Graceful AI Failure Handling — classifies every way the advisor pipeline can fail
 * and maps each to a safe, non-technical message the user can actually act on.
 *
 * Core rule (see AGENTS.md): when the AI can't safely answer, it must say so plainly
 * and never substitute invented numbers. Internal details (privacy rule names, stack
 * traces, provider error codes) are never surfaced - only the category-appropriate
 * copy below is shown to the user.
 */

import { ToolExecutionResult } from "./ai-tool-executor";
import { PlannedToolCall } from "./ai-tool-planner";
import { LLMProviderError } from "./llm-provider";

export enum AdvisorFailureCategory {
    LLM_UNAVAILABLE = "LLM_UNAVAILABLE",
    LLM_TIMEOUT = "LLM_TIMEOUT",
    LLM_RATE_LIMITED = "LLM_RATE_LIMITED",
    LLM_MALFORMED_RESPONSE = "LLM_MALFORMED_RESPONSE",
    INVALID_TOOL_CALL = "INVALID_TOOL_CALL",
    UNAUTHORIZED_TOOL_CALL = "UNAUTHORIZED_TOOL_CALL",
    PRIVACY_REJECTED = "PRIVACY_REJECTED",
    STALE_SNAPSHOT = "STALE_SNAPSHOT",
    FINANCIAL_ENGINE_UNAVAILABLE = "FINANCIAL_ENGINE_UNAVAILABLE",
    DIRECT_PERSISTENCE_BLOCKED = "DIRECT_PERSISTENCE_BLOCKED",
}

export interface AdvisorFailure {
    category: AdvisorFailureCategory;
    userMessage: string;
    /** Whether showing a [Try Again] action makes sense for this failure. */
    retryable: boolean;
}

const FAILURE_COPY: Record<AdvisorFailureCategory, { message: string; retryable: boolean }> = {
    [AdvisorFailureCategory.LLM_UNAVAILABLE]: {
        message: "Your financial information is available, but I couldn't generate the explanation right now.",
        retryable: true,
    },
    [AdvisorFailureCategory.LLM_TIMEOUT]: {
        message: "That took longer than expected. Your financial information is available, but I couldn't finish the explanation in time.",
        retryable: true,
    },
    [AdvisorFailureCategory.LLM_RATE_LIMITED]: {
        message: "I'm handling a lot of requests right now. Your financial information is available - please try again in a moment.",
        retryable: true,
    },
    [AdvisorFailureCategory.LLM_MALFORMED_RESPONSE]: {
        message: "I had trouble putting together a clear answer. Your financial information is available, but I couldn't safely generate the explanation.",
        retryable: true,
    },
    [AdvisorFailureCategory.INVALID_TOOL_CALL]: {
        message: "I wasn't able to gather the information needed to answer that safely. Please try rephrasing your question.",
        retryable: true,
    },
    [AdvisorFailureCategory.UNAUTHORIZED_TOOL_CALL]: {
        message: "This action requires household owner permission, so I couldn't complete it.",
        retryable: false,
    },
    [AdvisorFailureCategory.PRIVACY_REJECTED]: {
        message: "The information required for this question can't currently be sent to the selected AI provider.",
        retryable: false,
    },
    [AdvisorFailureCategory.STALE_SNAPSHOT]: {
        message: "Your financial figures haven't been recalculated recently, so I can't safely answer this right now. Try again once your latest statements have finished processing.",
        retryable: true,
    },
    [AdvisorFailureCategory.FINANCIAL_ENGINE_UNAVAILABLE]: {
        message: "I can't safely answer this financial question because the current calculation service is unavailable.",
        retryable: true,
    },
    [AdvisorFailureCategory.DIRECT_PERSISTENCE_BLOCKED]: {
        message: "I can only propose changes - a household member has to explicitly review and approve them before anything is saved.",
        retryable: false,
    },
};

export function buildAdvisorFailure(category: AdvisorFailureCategory): AdvisorFailure {
    const copy = FAILURE_COPY[category];
    return { category, userMessage: copy.message, retryable: copy.retryable };
}

/** Classifies an error thrown while calling the LLM provider (unavailable/timeout/rate limit/malformed). */
export function classifyLLMError(error: unknown): AdvisorFailure {
    if (error instanceof LLMProviderError) {
        switch (error.code) {
            case "TIMEOUT":
                return buildAdvisorFailure(AdvisorFailureCategory.LLM_TIMEOUT);
            case "RATE_LIMIT":
                return buildAdvisorFailure(AdvisorFailureCategory.LLM_RATE_LIMITED);
            default:
                // AUTH_FAILED, SERVER_ERROR, API_ERROR, CONTEXT_LIMIT_EXCEEDED, etc.
                return buildAdvisorFailure(AdvisorFailureCategory.LLM_UNAVAILABLE);
        }
    }
    // Any non-provider error (e.g. unexpected shape, JSON parsing) means the response
    // itself was malformed rather than the provider being unreachable.
    return buildAdvisorFailure(AdvisorFailureCategory.LLM_MALFORMED_RESPONSE);
}

/** Classifies a privacy gateway rejection - never surfaces which internal rule matched. */
export function classifyPrivacyError(): AdvisorFailure {
    return buildAdvisorFailure(AdvisorFailureCategory.PRIVACY_REJECTED);
}

/** Classifies a blocked attempt to have a tool directly persist financial state without approval. */
export function classifyDirectPersistenceAttempt(): AdvisorFailure {
    return buildAdvisorFailure(AdvisorFailureCategory.DIRECT_PERSISTENCE_BLOCKED);
}

/**
 * Scans the critical tools in a plan for failures that must stop the request before any
 * LLM call - the advisor must never narrate around missing or broken critical data.
 * Returns null when every critical tool succeeded.
 */
export function classifyCriticalToolFailure(
    plannedTools: PlannedToolCall[],
    toolResults: ToolExecutionResult[]
): AdvisorFailure | null {
    const resultsBySequence = new Map(toolResults.map((r) => [r.sequence, r]));

    for (const tool of plannedTools) {
        if (!tool.isCritical) continue;
        const result = resultsBySequence.get(tool.sequence);
        if (result?.success) continue;

        const error = result?.error ?? "";
        if (/not registered/i.test(error)) {
            return buildAdvisorFailure(AdvisorFailureCategory.INVALID_TOOL_CALL);
        }
        if (/^Authorization failed/i.test(error)) {
            return buildAdvisorFailure(AdvisorFailureCategory.UNAUTHORIZED_TOOL_CALL);
        }
        return buildAdvisorFailure(AdvisorFailureCategory.FINANCIAL_ENGINE_UNAVAILABLE);
    }

    return null;
}

const STALE_SNAPSHOT_MAX_AGE_DAYS = 45;
const STALE_DATE_KEY_PATTERN = /^(asOf|calculatedAt)$/;

/** Walks a tool result's data tree, invoking visit(value, key) for every value/branch. */
function walk(value: unknown, key: string | undefined, visit: (value: unknown, key?: string) => void): void {
    if (value === null || value === undefined) return;
    if (value instanceof Date) {
        visit(value, key);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((v) => walk(v, undefined, visit));
        return;
    }
    if (typeof value === "object") {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            visit(v, k);
            walk(v, k, visit);
        }
        return;
    }
    visit(value, key);
}

function collectDates(toolResults: ToolExecutionResult[]): Date[] {
    const dates: Date[] = [];
    for (const result of toolResults) {
        if (!result.success || !result.data) continue;
        walk(result.data, undefined, (value, key) => {
            if (!key || !STALE_DATE_KEY_PATTERN.test(key)) return;
            const date = value instanceof Date ? value : new Date(String(value));
            if (!Number.isNaN(date.getTime())) dates.push(date);
        });
    }
    return dates;
}

/**
 * Detects whether the freshest financial data available is too old to safely answer with.
 * Never blocks when there simply isn't enough dated data to judge (returns null).
 */
export function classifyStaleSnapshot(toolResults: ToolExecutionResult[], now: Date = new Date()): AdvisorFailure | null {
    const dates = collectDates(toolResults);
    if (dates.length === 0) return null;

    const freshest = dates.reduce((latest, d) => (d > latest ? d : latest));
    const ageDays = (now.getTime() - freshest.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > STALE_SNAPSHOT_MAX_AGE_DAYS) {
        return buildAdvisorFailure(AdvisorFailureCategory.STALE_SNAPSHOT);
    }
    return null;
}
