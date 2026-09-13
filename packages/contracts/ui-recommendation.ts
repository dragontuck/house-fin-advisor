/**
 * UI Recommendation Contract
 *
 * This contract defines what the web UI receives for a recommendation.
 * All fields come from the domain layer - UI never synthesizes validation, confidence, or alternatives.
 *
 * Key principle: If it's not in the domain Recommendation, it doesn't appear in the UI.
 */

import { EntityId, Money, ConfidenceLevel } from "./index";

/**
 * Recommendation as delivered to UI from the API
 *
 * All fields come from the domain Recommendation entity.
 * UI components render these fields; they never fabricate validation details or assumptions.
 */
export interface UIRecommendation {
    // Identity
    id: EntityId;
    householdId: EntityId;
    correlationId: EntityId;

    // Display information
    title: string;
    summary: string;
    type: string; // RecommendationType enum

    // The recommendation itself
    recommendedAction: string;
    why?: string; // Human-friendly explanation
    alternatives: {
        id: string;
        title: string;
        description: string;
        rationale: string;
        tradeoffs?: string[];
        estimatedImpact?: Money;
        impactDirection: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
        isPreferred: boolean;
    }[];

    // Financial basis
    financialSnapshotId: EntityId;
    financialSnapshotVersion: number;
    policyVersion: number;

    // Evidence (all from research/tools, never fabricated)
    evidence: {
        id: string;
        claim: string;
        sourceName: string;
        sourceTier: "TIER_1_GOVERNMENT" | "TIER_2_PROVIDER" | "TIER_3_RESEARCH" | "TIER_4_MEDIA";
        sourceUrl?: string;
        retrievalDate: Date;
        freshness: "CURRENT" | "RECENT" | "STALE" | "EXPIRED";
        confidence: ConfidenceLevel;
    }[];

    // Assumptions (all verifiable, never assumed)
    assumptions: {
        id: string;
        key: string;
        value: string; // Human-readable statement
        confidence: ConfidenceLevel;
        reason: string; // Why we're making this assumption
        sensitivity?: string; // How outcome changes if this is wrong
    }[];

    // Risks identified
    risks: {
        id: string;
        description: string;
        severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
        likelihood: "UNLIKELY" | "POSSIBLE" | "LIKELY" | "PROBABLE";
        mitigations?: string[];
        impact?: string;
    }[];

    // Financial impact (all calculated deterministically from domain service)
    financialImpact: {
        cashFlowImpact?: Money;
        debtReduction?: Money;
        wealthIncrease?: Money;
        savingsIncrease?: Money;
        emergencyFundIncrease?: Money;
        investmentIncrease?: Money;
        timeframeMonths?: number;
    };

    // Validation (must come from validator, never hardcoded)
    validation: {
        status: "PASS" | "PASS_WITH_WARNINGS" | "FAIL" | "INSUFFICIENT_INFORMATION";
        summary: string;
        details: {
            category:
            | "MATH"
            | "RULES"
            | "POLICY"
            | "FRESHNESS"
            | "ASSUMPTIONS"
            | "ALTERNATIVES"
            | "DOWNSIDE"
            | "SENSITIVITY"
            | "CONFLICTS"
            | "BIAS"
            | "CLAIMS"
            | "RESEARCH";
            status: "PASS" | "WARN" | "FAIL";
            description: string;
            evidence?: string;
        }[];
        warnings?: string[];
        suggestions?: string[];
        performedAt: Date;
        performedBy?: string; // "SYSTEM" or validator name
    };

    // Confidence (based on validation + data quality, not LLM mood)
    confidence: ConfidenceLevel;
    confidenceReasoning: string;

    // Approval state
    approvalRequired: boolean;
    approvalStatus: "PROPOSED" | "REVIEWED" | "APPROVED" | "DECLINED" | "EXPIRED" | "INVALIDATED";

    // Versioning and audit
    version: number;
    createdAt: Date;
    createdBy: EntityId;
    updatedAt: Date;
}

/**
 * Transform from domain Recommendation to UIRecommendation.
 *
 * This is the only place where domain → UI translation happens.
 * All data is directly mapped; nothing is fabricated or synthesized.
 */
export function toUIRecommendation(domainRec: any): UIRecommendation {
    return {
        id: domainRec.id,
        householdId: domainRec.householdId,
        correlationId: domainRec.correlationId,
        title: domainRec.title,
        summary: domainRec.summary,
        type: domainRec.type,
        recommendedAction: domainRec.recommendedAction,
        why: domainRec.why,
        alternatives: domainRec.alternatives || [],
        financialSnapshotId: domainRec.financialSnapshotId,
        financialSnapshotVersion: domainRec.financialSnapshotVersion,
        policyVersion: domainRec.policyVersion,
        evidence: (domainRec.evidence || []).map((e: any) => ({
            id: e.id,
            claim: e.claim,
            sourceName: e.sourceName,
            sourceTier: e.sourceTier,
            sourceUrl: e.sourceUrl,
            retrievalDate: e.retrievalDate,
            freshness: e.freshness,
            confidence: e.confidence,
        })),
        assumptions: (domainRec.assumptions || []).map((a: any) => ({
            id: a.id,
            key: a.key,
            value: a.value,
            confidence: a.confidence,
            reason: a.reason,
            sensitivity: a.sensitivity,
        })),
        risks: (domainRec.risks || []).map((r: any) => ({
            id: r.id,
            description: r.description,
            severity: r.severity,
            likelihood: r.likelihood,
            mitigations: r.mitigations,
            impact: r.impact,
        })),
        financialImpact: domainRec.financialImpact || {},
        validation: domainRec.validation
            ? {
                status: domainRec.validation.status,
                summary: domainRec.validation.summary,
                details: domainRec.validation.details || [],
                warnings: domainRec.validation.warnings,
                suggestions: domainRec.validation.suggestions,
                performedAt: domainRec.validation.performedAt,
                performedBy: domainRec.validation.performedBy,
            }
            : {
                status: "INSUFFICIENT_INFORMATION",
                summary: "Validation not yet performed",
                details: [],
                performedAt: new Date(),
            },
        confidence: domainRec.confidence,
        confidenceReasoning: domainRec.confidenceReasoning,
        approvalRequired: domainRec.approvalRequired ?? true,
        approvalStatus: domainRec.approval?.status || "PROPOSED",
        version: domainRec.version,
        createdAt: domainRec.createdAt,
        createdBy: domainRec.createdBy,
        updatedAt: domainRec.updatedAt,
    };
}
