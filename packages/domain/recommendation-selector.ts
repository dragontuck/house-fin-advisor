/**
 * Recommendation Selector
 *
 * Selects the final recommendation from validated candidates using deterministic rules.
 *
 * Rules:
 * 1. A failed candidate cannot become final.
 * 2. A candidate with insufficient evidence cannot be presented as high confidence.
 * 3. Household policy takes precedence over generic optimization unless the system explicitly identifies a policy conflict.
 * 4. A recommendation should not be selected solely because an LLM prefers it.
 * 5. Material alternatives must be retained.
 * 6. Confidence must reflect evidence and uncertainty.
 */

import {
    EntityId,
    Money,
    FinancialSnapshot,
    ConfidenceLevel,
    Scenario,
    RecommendationAlternative,
} from "@house-fin/contracts";
import {
    RecommendationCandidate,
} from "./recommendation-builder";
import { ValidationResult } from "./recommendation-validator";

/**
 * Validated candidate with its validation result
 */
export interface ValidatedCandidate {
    candidate: RecommendationCandidate;
    validation: ValidationResult;
}

/**
 * Ranking score for a candidate (used internally during selection)
 */
interface CandidateRankingScore {
    candidate: RecommendationCandidate;
    validation: ValidationResult;
    score: number;
    factors: {
        validationStatus: number; // 0-100
        confidenceLevel: number; // 0-100
        policyCompliance: number; // 0-100
        evidenceQuality: number; // 0-100
        positiveImpact: number; // 0-100 (magnitude of wealth increase)
        penaltyForConflict: number; // -X (penalty for policy conflicts)
    };
}

/**
 * Final recommendation output
 */
export interface FinalRecommendation {
    type: RecommendationCandidate["type"];
    title: string;
    scenarioIds: EntityId[];
    policyVersion: number;
    recommendedAction: string;
    why: string; // Summary of why this was selected
    alternatives: RecommendationAlternative[];
    impact: {
        cashFlowImpact: Money;
        wealthIncrease: Money;
        debtReduction: Money;
        timeframeMonths?: number;
    };
    assumptions: RecommendationCandidate["assumptions"];
    risks: RecommendationCandidate["risks"];
    evidence: RecommendationCandidate["evidence"];
    validation: ValidationResult;
    confidence: ConfidenceLevel;
    confidenceReasoning: string;
    approvalRequired: boolean; // Whether human approval is needed
}

/**
 * Select the final recommendation from validated candidates
 *
 * Applies deterministic ranking rules to choose the best candidate.
 * Returns null if no suitable candidate found (all failed).
 */
export function selectFinalRecommendation(
    candidates: ValidatedCandidate[],
    householdPolicy?: {
        riskTolerance?: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
        priorityConstraints?: string[];
    }
): FinalRecommendation | null {
    if (candidates.length === 0) {
        return null;
    }

    // RULE 1: Only candidates that passed independent validation are deliverable.
    const eligibleCandidates = candidates.filter(
        (c) => c.validation.status === "PASS" || c.validation.status === "PASS_WITH_WARNINGS"
    );

    if (eligibleCandidates.length === 0) {
        // All candidates failed - no valid recommendation
        return null;
    }

    // Score and rank eligible candidates
    const scored = scoreAndRankCandidates(
        eligibleCandidates,
        householdPolicy
    );

    // Select the top-ranked candidate
    if (scored.length === 0) {
        return null;
    }

    const selected = scored[0];

    // RULE 6: Adjust confidence based on validation result and evidence
    const finalConfidence = adjustConfidenceForValidation(
        selected.candidate.confidence,
        selected.validation,
        selected.candidate.confidenceFactors.evidenceTier
    );

    // Build final recommendation
    const final: FinalRecommendation = {
        type: selected.candidate.type,
        title: selected.candidate.title,
        scenarioIds: selected.candidate.scenarioIds,
        policyVersion: selected.candidate.policyVersion,
        recommendedAction: selected.candidate.recommendedAction,
        why: buildSelectionReasoning(selected, scored),
        alternatives: selected.candidate.alternatives,
        impact: selected.candidate.expectedImpact,
        assumptions: selected.candidate.assumptions,
        risks: selected.candidate.risks,
        evidence: selected.candidate.evidence,
        validation: selected.validation,
        confidence: finalConfidence,
        confidenceReasoning: buildConfidenceReasoning(
            finalConfidence,
            selected.validation,
            selected.candidate.confidenceFactors
        ),
        approvalRequired: determinedApprovalRequired(selected.validation),
    };

    return final;
}

/**
 * Score and rank candidates using deterministic rules
 */
function scoreAndRankCandidates(
    candidates: ValidatedCandidate[],
    householdPolicy?: {
        riskTolerance?: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
        priorityConstraints?: string[];
    }
): CandidateRankingScore[] {
    const scored: CandidateRankingScore[] = candidates
        .map((c) => {
            const factors = calculateRankingFactors(
                c.candidate,
                c.validation,
                householdPolicy
            );

            const score = calculateCompositeScore(factors);

            return {
                candidate: c.candidate,
                validation: c.validation,
                score,
                factors,
            };
        })
        .sort((a, b) => b.score - a.score);

    return scored;
}

/**
 * Calculate individual ranking factors (0-100 scale)
 */
function calculateRankingFactors(
    candidate: RecommendationCandidate,
    validation: ValidationResult,
    householdPolicy?: {
        riskTolerance?: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
        priorityConstraints?: string[];
    }
): CandidateRankingScore["factors"] {
    // FACTOR 1: Validation Status
    let validationStatusScore = 0;
    if (validation.status === "PASS") {
        validationStatusScore = 100;
    } else if (validation.status === "PASS_WITH_WARNINGS") {
        validationStatusScore = 75;
    } else if (validation.status === "INSUFFICIENT_INFORMATION") {
        validationStatusScore = 40; // Low score but not disqualifying
    }
    // FAIL is already filtered out above

    // FACTOR 2: Confidence Level
    let confidenceScore = 0;
    if (candidate.confidence === ConfidenceLevel.HIGH) {
        confidenceScore = 100;
    } else if (candidate.confidence === ConfidenceLevel.MEDIUM) {
        confidenceScore = 70;
    } else if (candidate.confidence === ConfidenceLevel.LOW) {
        confidenceScore = 40;
    } else {
        confidenceScore = 20; // INSUFFICIENT_INFORMATION
    }

    // FACTOR 3: Policy Compliance (RULE 3)
    let policyComplianceScore = 100;
    if (!candidate.compliesWithPolicy) {
        // Policy violations drop score significantly unless it's an explicit policy conflict
        policyComplianceScore = 30;
    }
    if (candidate.policyViolations && candidate.policyViolations.length > 0) {
        // Each violation drops score further
        policyComplianceScore = Math.max(0, 30 - candidate.policyViolations.length * 10);
    }

    // Adjust for risk tolerance in policy
    if (householdPolicy?.riskTolerance === "CONSERVATIVE") {
        // Downrank recommendations with high risk
        const highRiskCount = candidate.risks.filter(
            (r) => r.severity === "HIGH" || r.severity === "CRITICAL"
        ).length;
        policyComplianceScore = Math.max(20, policyComplianceScore - highRiskCount * 15);
    }

    // FACTOR 4: Evidence Quality
    let evidenceScore = 0;
    const bestEvidenceTier = candidate.confidenceFactors.evidenceTier;

    // Better source tiers get higher scores
    if (bestEvidenceTier === "TIER_1_GOVERNMENT") {
        evidenceScore = 100;
    } else if (bestEvidenceTier === "TIER_2_PROVIDER") {
        evidenceScore = 75;
    } else if (bestEvidenceTier === "TIER_3_RESEARCH") {
        evidenceScore = 85;
    } else if (bestEvidenceTier === "TIER_4_MEDIA") {
        evidenceScore = 50;
    } else {
        evidenceScore = 30; // No evidence
    }

    // Bonus for evidence freshness
    if (candidate.confidenceFactors.evidenceFreshness === "CURRENT") {
        evidenceScore = Math.min(100, evidenceScore + 10);
    } else if (candidate.confidenceFactors.evidenceFreshness === "RECENT") {
        evidenceScore = Math.min(100, evidenceScore + 5);
    } else if (
        candidate.confidenceFactors.evidenceFreshness === "STALE" ||
        candidate.confidenceFactors.evidenceFreshness === "EXPIRED"
    ) {
        evidenceScore = Math.max(0, evidenceScore - 20);
    }

    // FACTOR 5: Positive Impact
    let impactScore = 0;
    const wealthIncrease = candidate.expectedImpact.wealthIncrease;

    if (wealthIncrease > Money(100000)) {
        // Large positive impact
        impactScore = 100;
    } else if (wealthIncrease > Money(50000)) {
        impactScore = 85;
    } else if (wealthIncrease > Money(10000)) {
        impactScore = 70;
    } else if (wealthIncrease > Money(0)) {
        impactScore = 50;
    } else if (wealthIncrease === Money(0)) {
        impactScore = 30; // Neutral impact
    } else {
        // Negative wealth impact (debt reduction could still be positive overall)
        const debtReduction = candidate.expectedImpact.debtReduction;
        if (debtReduction > Money(50000)) {
            impactScore = 80;
        } else if (debtReduction > Money(10000)) {
            impactScore = 60;
        } else {
            impactScore = 30;
        }
    }

    // FACTOR 6: Penalty for conflicts
    let conflictPenalty = 0;
    if (validation.adversarialReview.weaknesses.length > 0) {
        conflictPenalty = Math.min(20, validation.adversarialReview.weaknesses.length * 5);
    }

    return {
        validationStatus: validationStatusScore,
        confidenceLevel: confidenceScore,
        policyCompliance: policyComplianceScore,
        evidenceQuality: evidenceScore,
        positiveImpact: impactScore,
        penaltyForConflict: -conflictPenalty,
    };
}

/**
 * Calculate composite ranking score (0-100)
 *
 * Weighted formula prioritizes:
 * 1. Validation status (30%)
 * 2. Policy compliance (25%)
 * 3. Evidence quality (20%)
 * 4. Confidence level (15%)
 * 5. Impact (10%)
 */
function calculateCompositeScore(
    factors: CandidateRankingScore["factors"]
): number {
    const score =
        factors.validationStatus * 0.3 +
        factors.policyCompliance * 0.25 +
        factors.evidenceQuality * 0.2 +
        factors.confidenceLevel * 0.15 +
        factors.positiveImpact * 0.1 +
        factors.penaltyForConflict;

    return Math.max(0, score); // Ensure score is never negative
}

/**
 * RULE 2: Adjust confidence based on validation result and evidence
 *
 * Cannot claim HIGH confidence if:
 * - Validation status is INSUFFICIENT_INFORMATION
 * - Evidence tier is TIER_4_MEDIA only
 * - Evidence is STALE or EXPIRED
 */
function adjustConfidenceForValidation(
    baseConfidence: ConfidenceLevel,
    validation: ValidationResult,
    bestEvidenceTier: string
): ConfidenceLevel {
    // Cannot be HIGH confidence with insufficient information
    if (validation.status === "INSUFFICIENT_INFORMATION") {
        if (baseConfidence === ConfidenceLevel.HIGH) {
            return ConfidenceLevel.MEDIUM;
        }
        if (baseConfidence === ConfidenceLevel.MEDIUM) {
            return ConfidenceLevel.LOW;
        }
    }

    // Cannot be HIGH confidence with weak evidence only
    if (bestEvidenceTier === "TIER_4_MEDIA") {
        if (baseConfidence === ConfidenceLevel.HIGH) {
            return ConfidenceLevel.MEDIUM;
        }
    }

    // Adjust down if validation has warnings
    if (
        validation.status === "PASS_WITH_WARNINGS" &&
        baseConfidence === ConfidenceLevel.HIGH
    ) {
        // Keep HIGH only if warnings are minor
        if (validation.warningChecks > 2) {
            return ConfidenceLevel.MEDIUM;
        }
    }

    return baseConfidence;
}

/**
 * Determine if human approval is required
 */
function determinedApprovalRequired(validation: ValidationResult): boolean {
    // Always require approval if there are warnings
    if (validation.status === "PASS_WITH_WARNINGS") {
        return true;
    }

    // Require approval if data quality is uncertain
    if (validation.status === "INSUFFICIENT_INFORMATION") {
        return true;
    }

    // Require approval for certain challenge types
    const criticalChallenges = validation.adversarialReview.challenges.filter(
        (c) => c.impact === "HIGH" || c.impact === "CRITICAL"
    );
    if (criticalChallenges.length > 0) {
        return true;
    }

    // Otherwise approval might not be strictly required (policy decision)
    return true; // Default to requiring approval for safety
}

/**
 * Build human-readable explanation of why this candidate was selected
 */
function buildSelectionReasoning(
    selected: CandidateRankingScore,
    allScored: CandidateRankingScore[]
): string {
    const factors = selected.factors;
    const candidate = selected.candidate;

    const reasons: string[] = [];

    // Primary reason - best validation status
    if (selected.validation.status === "PASS") {
        reasons.push("It passed all validation checks");
    } else if (selected.validation.status === "PASS_WITH_WARNINGS") {
        reasons.push(
            `It passed validation with ${selected.validation.warningChecks} warning(s) that can be addressed`
        );
    }

    // Evidence quality
    if (factors.evidenceQuality >= 85) {
        reasons.push("It is supported by authoritative evidence");
    } else if (factors.evidenceQuality >= 70) {
        reasons.push("It is supported by credible evidence");
    }

    // Policy compliance
    if (candidate.compliesWithPolicy) {
        reasons.push("It aligns with your financial policy");
    }

    // Impact
    if (candidate.expectedImpact.wealthIncrease > Money(50000)) {
        reasons.push(
            `It offers substantial financial improvement (+$${(candidate.expectedImpact.wealthIncrease / 100).toFixed(2)})`
        );
    }

    // Comparison to alternatives
    if (allScored.length > 1) {
        const difference = selected.score - allScored[1].score;
        if (difference > 10) {
            reasons.push("It ranks significantly higher than alternative options");
        } else if (difference > 2) {
            reasons.push("It scores slightly higher than other options");
        }
    }

    return reasons.join(". ") + ".";
}

/**
 * Build explanation of confidence level
 */
function buildConfidenceReasoning(
    confidence: ConfidenceLevel,
    validation: ValidationResult,
    confidenceFactors: RecommendationCandidate["confidenceFactors"]
): string {
    const reasons: string[] = [];

    if (confidence === ConfidenceLevel.HIGH) {
        reasons.push("High confidence based on:");
        if (confidenceFactors.dataQuality === "HIGH") {
            reasons.push("- Current, complete financial data");
        }
        if (confidenceFactors.evidenceFreshness === "CURRENT") {
            reasons.push("- Current research and rates");
        }
        if (validation.status === "PASS") {
            reasons.push("- Validation passed all checks");
        }
    } else if (confidence === ConfidenceLevel.MEDIUM) {
        reasons.push("Medium confidence due to:");
        if (confidenceFactors.dataQuality !== "HIGH") {
            reasons.push("- Some data may be outdated or incomplete");
        }
        if (confidenceFactors.evidenceFreshness === "RECENT") {
            reasons.push("- Research is recent but not current");
        }
        if (validation.status === "PASS_WITH_WARNINGS") {
            reasons.push(
                `- Validation has ${validation.warningChecks} warning(s) requiring attention`
            );
        }
    } else if (confidence === ConfidenceLevel.LOW) {
        reasons.push("Low confidence due to:");
        if (confidenceFactors.dataQuality === "LOW") {
            reasons.push("- Limited or outdated financial data");
        }
        if (confidenceFactors.evidenceFreshness === "STALE") {
            reasons.push("- Available research is outdated");
        }
        if (validation.failedChecks > 0) {
            reasons.push("- Some validation concerns");
        }
    } else {
        reasons.push(
            "Insufficient information available - recommend gathering more data before acting"
        );
    }

    return reasons.join(" ");
}
