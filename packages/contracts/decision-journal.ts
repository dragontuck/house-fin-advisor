import { AdvisorWorkflow, EntityId } from "./index";
import { Evidence } from "./recommendation";

export type DecisionJournalApprovalState = "PENDING" | "APPROVED" | "DECLINED";

export interface DecisionJournalScenario {
    toolName: string;
    success: boolean;
    result?: Record<string, unknown>;
    error?: string;
}

export interface DecisionJournalValidation {
    recommendationStatus: "PASS" | "INSUFFICIENT_INFORMATION";
    recommendationSummary: string;
    groundingPassed: boolean;
    groundingViolations: string[];
}

export interface DecisionJournalConfidence {
    level: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_INFORMATION" | "NOT_ASSESSED";
    reasoning: string;
}

/** Immutable context captured when a recommendation is presented. */
export interface DecisionJournalEntry {
    recommendationId: EntityId;
    correlationId: EntityId;
    householdId: EntityId;
    memberId: EntityId;
    conversationId?: EntityId;
    workflowType: AdvisorWorkflow;
    question: string;
    currentFinancialState: Record<string, unknown>;
    financialSnapshotId?: EntityId;
    financialSnapshotVersion?: number;
    householdPolicyVersion?: number;
    scenarios: DecisionJournalScenario[];
    evidence: Evidence[];
    recommendation: {
        deterministicRecommendation: string;
        presentedRecommendation: string;
    };
    alternatives: string[];
    validation: DecisionJournalValidation;
    confidence: DecisionJournalConfidence;
    personaUsed: {
        key: string;
        label: string;
        instruction: string;
    };
    approvalState: DecisionJournalApprovalState;
    generatedAt: Date;
}

/** Append-only user decision; it never modifies the generation snapshot. */
export interface DecisionJournalDecision {
    id: EntityId;
    recommendationId: EntityId;
    householdId: EntityId;
    memberId: EntityId;
    decision: "APPROVED" | "DECLINED";
    userChoice?: string;
    notes?: string;
    decidedAt: Date;
}

export interface DecisionJournalRecord {
    entry: DecisionJournalEntry;
    decisions: DecisionJournalDecision[];
    currentApprovalState: DecisionJournalApprovalState;
}

export interface RecordDecisionJournalDecisionRequest {
    decision: "APPROVED" | "DECLINED";
    userChoice?: string;
    notes?: string;
}