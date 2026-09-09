/**
 * Recommendation Domain Services
 *
 * Pure, deterministic functions for building and managing recommendations.
 * Does NOT call LLM, research, or validation services.
 */

import {
    EntityId,
    Recommendation,
    RecommendationStatus,
    RecommendationType,
    ConfidenceLevel,
    RecommendationAlternative,
    RecommendationAssumption,
    RecommendationRisk,
    RecommendationEvidence,
    CreateRecommendationRequest,
    Money,
} from "@house-fin/contracts";

/**
 * Build a recommendation from request
 *
 * Validates all required fields and creates consistent recommendation object.
 * Does not persist (that's repository's job).
 */
export function buildRecommendation(
    req: CreateRecommendationRequest,
    createdBy: EntityId,
    correlationId: EntityId
): Recommendation {
    // Validate alternatives
    if (req.alternatives.length === 0) {
        throw new Error("At least one alternative is required");
    }
    if (req.alternatives.filter((a) => a.isPreferred).length !== 1) {
        throw new Error("Exactly one alternative must be marked as preferred");
    }

    // Validate assumptions
    if (req.assumptions.length === 0) {
        throw new Error("At least one assumption is required");
    }

    // Validate evidence
    if (req.evidence.length === 0) {
        console.warn("Warning: recommendation has no supporting evidence");
    }

    const recommendation: Recommendation = {
        id: createdBy, // Will be overwritten by repository
        householdId: req.householdId,
        memberId: req.memberId,
        conversationId: req.conversationId,
        type: req.type,
        title: req.title,
        summary: req.summary,
        recommendedAction: req.recommendedAction,
        alternatives: req.alternatives,
        financialSnapshotId: req.financialSnapshotId,
        financialSnapshotVersion: req.financialSnapshotVersion,
        policyVersion: req.policyVersion,
        scenarioIds: req.scenarioIds,
        evidence: req.evidence,
        assumptions: req.assumptions,
        risks: req.risks,
        confidence: req.confidence,
        confidenceReasoning: req.confidenceReasoning,
        approval: {
            status: RecommendationStatus.PROPOSED,
            expiresAt: req.expiresAt,
        },
        approvalRequired: req.approvalRequired !== false,
        version: 1,
        createdAt: new Date(),
        createdBy,
        updatedAt: new Date(),
        correlationId,
    };

    return recommendation;
}

/**
 * Check if recommendation has expired
 */
export function isExpired(recommendation: Recommendation): boolean {
    if (!recommendation.approval.expiresAt) {
        return false; // No expiration set
    }
    return new Date() > recommendation.approval.expiresAt;
}

/**
 * Check if recommendation should be automatically expired
 * Triggers on data inconsistency or policy changes
 */
export function shouldInvalidate(
    recommendation: Recommendation,
    currentSnapshotVersion: number,
    currentPolicyVersion: number
): boolean {
    // Snapshot was recalculated/updated
    if (recommendation.financialSnapshotVersion !== currentSnapshotVersion) {
        return true;
    }

    // Policy changed
    if (recommendation.policyVersion !== currentPolicyVersion) {
        return true;
    }

    return false;
}

/**
 * Determine if a new version is materially different from previous
 *
 * Material differences:
 * - Changed recommended action
 * - Changed preferred alternative
 * - Changed financial snapshot/version
 * - Changed confidence level
 * - Changed risk severity
 *
 * Non-material:
 * - Added evidence
 * - Updated approval status
 * - Added risk with same severity
 */
export function isMateriallyDifferent(
    previous: Recommendation,
    current: Recommendation
): boolean {
    // Different action
    if (previous.recommendedAction !== current.recommendedAction) {
        return true;
    }

    // Different preferred alternative
    const prevPreferred = previous.alternatives.find((a) => a.isPreferred);
    const currPreferred = current.alternatives.find((a) => a.isPreferred);
    if (prevPreferred?.id !== currPreferred?.id) {
        return true;
    }

    // Different financial basis
    if (previous.financialSnapshotId !== current.financialSnapshotId) {
        return true;
    }
    if (previous.financialSnapshotVersion !== current.financialSnapshotVersion) {
        return true;
    }

    // Different confidence level
    if (previous.confidence !== current.confidence) {
        return true;
    }

    // Risk severity changed (compare critical/high risks)
    const prevCritical = previous.risks.filter((r) => r.severity === "CRITICAL" || r.severity === "HIGH");
    const currCritical = current.risks.filter((r) => r.severity === "CRITICAL" || r.severity === "HIGH");
    if (prevCritical.length !== currCritical.length) {
        return true;
    }

    return false;
}

/**
 * Validate recommendation can transition to new status
 *
 * Valid transitions:
 * - PROPOSED → REVIEWED → APPROVED ✓
 * - PROPOSED → REVIEWED → DECLINED ✓
 * - PROPOSED → DECLINED ✓
 * - * → EXPIRED (automatic, but can force)
 * - * → INVALIDATED (automatic)
 * - PROPOSED/REVIEWED → INVALIDATED ✓
 */
export function canTransitionStatus(
    current: RecommendationStatus,
    next: RecommendationStatus
): boolean {
    if (current === next) {
        return true; // No-op is valid
    }

    // Terminal states cannot change except to INVALIDATED
    if ((current === "APPROVED" || current === "DECLINED" || current === "EXPIRED") && next !== "INVALIDATED") {
        return false;
    }

    // Can always invalidate
    if (next === "INVALIDATED") {
        return true;
    }

    // Normal workflow: PROPOSED → REVIEWED → APPROVED/DECLINED
    if (current === "PROPOSED") {
        return next === "REVIEWED" || next === "DECLINED" || next === "EXPIRED";
    }

    if (current === "REVIEWED") {
        return next === "APPROVED" || next === "DECLINED" || next === "EXPIRED";
    }

    return false;
}

/**
 * Calculate confidence level based on multiple factors
 *
 * Inputs:
 * - Data quality (freshness of snapshot, completeness of data)
 * - Calculation confidence (complexity of math)
 * - Evidence quality (tier, freshness, confidence)
 * - Validation outcome (pass/warn/fail)
 * - Assumption sensitivity (how much do assumptions matter)
 */
export interface ConfidenceFactors {
    dataFreshness: "CURRENT" | "RECENT" | "STALE"; // Days old?
    dataCompleteness: number; // 0-1, how many fields populated?
    calculationComplexity: "SIMPLE" | "MODERATE" | "COMPLEX";
    evidenceTier: "TIER_1" | "TIER_2" | "TIER_3" | "TIER_4";
    evidenceFreshness: "CURRENT" | "RECENT" | "STALE";
    validationStatus?: "PASS" | "PASS_WITH_WARNINGS" | "FAIL" | "INSUFFICIENT_INFORMATION";
    assumptionSensitivity: "LOW" | "MEDIUM" | "HIGH"; // How much do assumptions matter?
    assumptions: RecommendationAssumption[];
}

export function calculateConfidenceLevel(factors: ConfidenceFactors): ConfidenceLevel {
    let score = 0;

    // Data quality (25 points)
    if (factors.dataFreshness === "CURRENT") score += 15;
    else if (factors.dataFreshness === "RECENT") score += 8;
    else score += 2;

    score += factors.dataCompleteness * 10;

    // Calculation (20 points)
    if (factors.calculationComplexity === "SIMPLE") score += 20;
    else if (factors.calculationComplexity === "MODERATE") score += 15;
    else score += 10;

    // Evidence (30 points)
    if (factors.evidenceTier === "TIER_1") score += 20;
    else if (factors.evidenceTier === "TIER_2") score += 15;
    else if (factors.evidenceTier === "TIER_3") score += 10;
    else score += 5;

    if (factors.evidenceFreshness === "CURRENT") score += 10;
    else if (factors.evidenceFreshness === "RECENT") score += 5;
    else score += 0;

    // Validation (15 points)
    if (factors.validationStatus === "PASS") score += 15;
    else if (factors.validationStatus === "PASS_WITH_WARNINGS") score += 8;
    else if (factors.validationStatus === "FAIL") score += 0;
    else score += 3; // INSUFFICIENT_INFORMATION

    // Assumption sensitivity (10 points penalty)
    if (factors.assumptionSensitivity === "HIGH") score -= 10;
    else if (factors.assumptionSensitivity === "MEDIUM") score -= 5;

    // Any LOW confidence assumptions reduce overall confidence
    const lowConfidenceAssumptions = factors.assumptions.filter((a) => a.confidence === "LOW");
    score -= lowConfidenceAssumptions.length * 5;

    // Normalize to confidence level
    if (score >= 70) return ConfidenceLevel.HIGH;
    if (score >= 40) return ConfidenceLevel.MEDIUM;
    if (score >= 10) return ConfidenceLevel.LOW;
    return ConfidenceLevel.INSUFFICIENT_INFORMATION;
}

/**
 * Get summary of recommendation for audit/logging
 */
export function summarizeRecommendation(r: Recommendation): string {
    const preferred = r.alternatives.find((a) => a.isPreferred);
    const altCount = r.alternatives.length - 1;
    return (
        `Recommendation "${r.title}": ${preferred?.title || "unknown"} ` +
        `(${altCount} alternatives, confidence: ${r.confidence}, ` +
        `status: ${r.approval.status}, v${r.version})`
    );
}

/**
 * Validate recommendation structure before creating/updating
 *
 * Checks:
 * - All required fields present
 * - Types consistent
 * - References valid
 */
export function validateRecommendationStructure(
    recommendation: Partial<Recommendation>
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!recommendation.title || recommendation.title.trim().length === 0) {
        errors.push("Title is required");
    }

    if (!recommendation.summary || recommendation.summary.trim().length === 0) {
        errors.push("Summary is required");
    }

    if (!recommendation.recommendedAction || recommendation.recommendedAction.trim().length === 0) {
        errors.push("Recommended action is required");
    }

    if (!recommendation.alternatives || recommendation.alternatives.length === 0) {
        errors.push("At least one alternative is required");
    } else {
        const preferred = recommendation.alternatives.filter((a) => a.isPreferred);
        if (preferred.length !== 1) {
            errors.push("Exactly one alternative must be marked as preferred");
        }
    }

    if (!recommendation.assumptions || recommendation.assumptions.length === 0) {
        errors.push("At least one assumption is required");
    }

    if (!recommendation.householdId) {
        errors.push("householdId is required");
    }

    if (!recommendation.memberId) {
        errors.push("memberId is required");
    }

    if (!recommendation.financialSnapshotId) {
        errors.push("financialSnapshotId is required");
    }

    if (recommendation.financialSnapshotVersion === undefined || recommendation.financialSnapshotVersion === null) {
        errors.push("financialSnapshotVersion is required");
    }

    if (recommendation.policyVersion === undefined || recommendation.policyVersion === null) {
        errors.push("policyVersion is required");
    }

    if (!recommendation.confidence) {
        errors.push("confidence level is required");
    }

    if (!recommendation.approval?.status) {
        errors.push("approval status is required");
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
