import {
    DecisionJournalEntry,
    EntityId,
    Evidence,
} from "@house-fin/contracts";
import type { OrchestratorRequest } from "./ai-orchestrator";
import type { ToolExecutionResult } from "./ai-tool-executor";
import type { AdvisorStyle, OrchestratedRecommendationWorkflow } from "./recommendation-workflow";

export interface BuildDecisionJournalEntryInput {
    request: OrchestratorRequest;
    toolResults: ToolExecutionResult[];
    evidence: Evidence[];
    workflow: OrchestratedRecommendationWorkflow;
    presentedRecommendation: string;
    groundingPassed: boolean;
    groundingViolations: string[];
    advisorStyle: AdvisorStyle;
    generatedAt: Date;
}

export function isHistoricalRecommendationQuestion(question: string): boolean {
    return /\b(?:why|what)\b[\s\S]*\b(?:recommend|recommended|suggest|suggested|advise|advised)\b/i.test(question);
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function clone<T>(value: T): T {
    return structuredClone(value);
}

function extractSnapshotIdentity(
    request: OrchestratorRequest,
    toolResults: ToolExecutionResult[]
): { id?: EntityId; version?: number } {
    const requestContext = getRecord(request.financialContext);
    const requestSnapshot = getRecord(requestContext?.snapshot);
    const requestVersions = getRecord(requestContext?.contextVersions);

    let id = typeof requestSnapshot?.id === "string" ? requestSnapshot.id as EntityId : undefined;
    let version = typeof requestVersions?.snapshotVersion === "number"
        ? requestVersions.snapshotVersion
        : typeof requestSnapshot?.version === "number" ? requestSnapshot.version : undefined;

    for (const result of toolResults) {
        if (!result.success) continue;
        const data = getRecord(result.data);
        const snapshot = getRecord(data?.snapshot);
        if (!id && typeof snapshot?.id === "string") id = snapshot.id as EntityId;
        if (version === undefined && typeof snapshot?.version === "number") version = snapshot.version;
        if (version === undefined && typeof data?.snapshotVersion === "number") version = data.snapshotVersion;
    }

    return { id, version };
}

function extractPolicyVersion(request: OrchestratorRequest): number | undefined {
    if (request.householdPolicyVersion !== undefined) return request.householdPolicyVersion;
    const context = getRecord(request.financialContext);
    const versions = getRecord(context?.contextVersions);
    return typeof versions?.settingsVersion === "number" ? versions.settingsVersion : undefined;
}

export function buildDecisionJournalEntry(input: BuildDecisionJournalEntryInput): DecisionJournalEntry {
    const snapshot = extractSnapshotIdentity(input.request, input.toolResults);
    const finalRecommendation = input.workflow.finalRecommendation;
    if (!finalRecommendation) {
        throw new Error("Cannot journal a recommendation without a deterministic final recommendation");
    }

    return {
        recommendationId: input.request.correlationId,
        correlationId: input.request.correlationId,
        householdId: input.request.householdId,
        memberId: input.request.memberId,
        conversationId: input.request.conversationId,
        workflowType: input.request.workflowType,
        question: input.request.userMessage,
        currentFinancialState: {
            providedContext: clone(input.request.financialContext ?? {}),
            toolResults: clone(input.toolResults),
        },
        financialSnapshotId: snapshot.id,
        financialSnapshotVersion: snapshot.version,
        householdPolicyVersion: extractPolicyVersion(input.request),
        scenarios: input.toolResults.map((result) => ({
            toolName: result.toolName,
            success: result.success,
            result: result.success ? clone(result.data) : undefined,
            error: result.error,
        })),
        evidence: clone(input.evidence),
        recommendation: {
            deterministicRecommendation: finalRecommendation,
            presentedRecommendation: input.presentedRecommendation,
        },
        alternatives: input.workflow.candidates.filter((candidate) => candidate !== finalRecommendation),
        validation: {
            recommendationStatus: input.workflow.validation.status,
            recommendationSummary: input.workflow.validation.summary,
            groundingPassed: input.groundingPassed,
            groundingViolations: input.groundingViolations,
        },
        confidence: {
            level: "NOT_ASSESSED",
            reasoning: "This workflow did not calculate a deterministic recommendation confidence score.",
        },
        personaUsed: {
            key: input.advisorStyle.key,
            label: input.advisorStyle.label,
            instruction: input.advisorStyle.instruction,
        },
        approvalState: "PENDING",
        generatedAt: input.generatedAt,
    };
}