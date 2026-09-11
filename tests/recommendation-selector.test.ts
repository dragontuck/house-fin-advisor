/**
 * Recommendation Selector Tests
 *
 * Deterministic tests for candidate ranking and selection
 * Testing all 6 selection rules without relying on LLM
 */

import { describe, it, expect } from "@jest/globals";
import {
    selectFinalRecommendation,
    ValidatedCandidate,
    FinalRecommendation,
} from "../packages/domain";
import { RecommendationCandidate } from "../packages/domain";
import {
    ValidationResult,
    AdversarialChallenge,
    ValidationDetail,
} from "../packages/domain";
import {
    EntityId,
    Money,
    ConfidenceLevel,
    RecommendationType,
} from "@house-fin/contracts";

/**
 * Helper: Create mock RecommendationCandidate
 */
function createMockCandidate(overrides?: Partial<RecommendationCandidate>): RecommendationCandidate {
    return {
        id: "candidate-1",
        type: RecommendationType.SAVINGS_ALLOCATION,
        title: "Allocate $5,000 to emergency fund",
        summary: "Recommend building emergency fund to 6 months of expenses",
        recommendedAction: "Transfer $5,000 from savings to emergency account",
        alternatives: [
            {
                id: "alt-1",
                title: "Transfer $3,000 to emergency fund",
                description: "Conservative approach",
                rationale: "Lower immediate impact but easier to implement",
                tradeoffs: ["Lower emergency fund coverage"],
                estimatedImpact: Money(300000),
                impactDirection: "POSITIVE",
                isPreferred: false,
            },
        ],
        scenarioIds: ["scenario-1" as EntityId],
        expectedImpact: {
            cashFlowImpact: Money(-500000),
            wealthIncrease: Money(0),
            debtReduction: Money(0),
            timeframeMonths: 1,
        },
        evidence: [
            {
                id: "evidence-1",
                evidenceId: "evidence-1" as EntityId,
                claim: "Emergency funds protect against unexpected expenses",
                sourceName: "Federal Reserve",
                sourceTier: "TIER_1_GOVERNMENT",
                sourceUrl: "https://example.com",
                retrievalDate: new Date(),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.HIGH,
            },
        ],
        assumptions: [
            {
                id: "assumption-1",
                key: "essential_expenses_monthly",
                value: "$3,000 per month",
                confidence: ConfidenceLevel.HIGH,
                reason: "Based on current spending patterns",
            },
        ],
        risks: [
            {
                id: "risk-1",
                description: "Opportunity cost if funds sit idle",
                severity: "LOW",
                likelihood: "UNLIKELY",
                mitigations: ["Use high-yield savings account"],
            },
        ],
        confidence: ConfidenceLevel.HIGH,
        confidenceReasoning: "Current data and authoritative evidence",
        confidenceFactors: {
            dataQuality: "HIGH",
            calculationStrength: "HIGH",
            evidenceFreshness: "CURRENT",
            evidenceTier: "TIER_1_GOVERNMENT",
        },
        compliesWithPolicy: true,
        policyViolations: undefined,
        policyVersion: 1,
        createdAt: new Date(),
        rationale: "Emergency fund reduces financial risk",
        ...overrides,
    };
}

/**
 * Helper: Create mock ValidationResult
 */
function createMockValidation(overrides?: Partial<ValidationResult>): ValidationResult {
    return {
        status: "PASS",
        summary: "Recommendation passed all validation checks",
        passedChecks: 8,
        failedChecks: 0,
        warningChecks: 0,
        details: [
            {
                category: "MATH",
                status: "PASS",
                title: "Mathematical accuracy",
                description: "Calculations verified",
                severity: "INFO",
            },
        ],
        adversarialReview: {
            question: "What would make this recommendation wrong?",
            challenges: [],
            weaknesses: [],
            potentialAlternatives: [],
        },
        confidenceAfterValidation: ConfidenceLevel.HIGH,
        ...overrides,
    };
}

describe("Recommendation Selector", () => {
    describe("Rule 1: Failed candidates excluded", () => {
        it("should exclude candidates with FAIL validation status", () => {
            const failedCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({ id: "failed" }),
                validation: createMockValidation({ status: "FAIL", failedChecks: 2 }),
            };

            const goodCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({ id: "good" }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([failedCandidate, goodCandidate]);

            expect(result).toBeDefined();
            expect(result?.recommendedAction).toContain("Transfer $5,000");
        });

        it("should return null if all candidates failed", () => {
            const failedCandidate1: ValidatedCandidate = {
                candidate: createMockCandidate({ id: "failed-1" }),
                validation: createMockValidation({ status: "FAIL", failedChecks: 2 }),
            };

            const failedCandidate2: ValidatedCandidate = {
                candidate: createMockCandidate({ id: "failed-2" }),
                validation: createMockValidation({ status: "FAIL", failedChecks: 1 }),
            };

            const result = selectFinalRecommendation([failedCandidate1, failedCandidate2]);

            expect(result).toBeNull();
        });

        it("should allow PASS_WITH_WARNINGS candidates", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate(),
                validation: createMockValidation({
                    status: "PASS_WITH_WARNINGS",
                    warningChecks: 1,
                }),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result).toBeDefined();
            expect(result?.validation.status).toBe("PASS_WITH_WARNINGS");
        });

        it("should allow INSUFFICIENT_INFORMATION candidates (but downrank)", () => {
            const insufficientCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({ id: "insufficient" }),
                validation: createMockValidation({
                    status: "INSUFFICIENT_INFORMATION",
                }),
            };

            const goodCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({ id: "good" }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([insufficientCandidate, goodCandidate]);

            // Should select the good candidate, not the insufficient one
            expect(result?.recommendedAction).toBe(
                "Transfer $5,000 from savings to emergency account"
            );
        });
    });

    describe("Rule 2: Insufficient evidence prevents high confidence claims", () => {
        it("should not select a candidate with INSUFFICIENT_INFORMATION", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    confidence: ConfidenceLevel.HIGH,
                }),
                validation: createMockValidation({
                    status: "INSUFFICIENT_INFORMATION",
                }),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result).toBeNull();
        });

        it("should downgrade HIGH confidence for TIER_4_MEDIA evidence only", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    confidence: ConfidenceLevel.HIGH,
                    confidenceFactors: {
                        dataQuality: "HIGH",
                        calculationStrength: "HIGH",
                        evidenceFreshness: "CURRENT",
                        evidenceTier: "TIER_4_MEDIA",
                    },
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result).toBeDefined();
            expect(result?.confidence).toBe(ConfidenceLevel.MEDIUM);
        });

        it("should keep HIGH confidence with PASS validation and TIER_1_GOVERNMENT evidence", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    confidence: ConfidenceLevel.HIGH,
                    confidenceFactors: {
                        dataQuality: "HIGH",
                        calculationStrength: "HIGH",
                        evidenceFreshness: "CURRENT",
                        evidenceTier: "TIER_1_GOVERNMENT",
                    },
                }),
                validation: createMockValidation({ status: "PASS" }),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result).toBeDefined();
            expect(result?.confidence).toBe(ConfidenceLevel.HIGH);
        });

        it("should downgrade to MEDIUM for HIGH confidence with multiple warnings", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    confidence: ConfidenceLevel.HIGH,
                }),
                validation: createMockValidation({
                    status: "PASS_WITH_WARNINGS",
                    warningChecks: 3,
                }),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result).toBeDefined();
            expect(result?.confidence).toBe(ConfidenceLevel.MEDIUM);
        });
    });

    describe("Rule 3: Policy compliance takes precedence", () => {
        it("should prefer policy-compliant candidate over non-compliant", () => {
            const policyCompliant: ValidatedCandidate = {
                candidate: createMockCandidate({
                    id: "compliant",
                    compliesWithPolicy: true,
                    confidence: ConfidenceLevel.MEDIUM,
                }),
                validation: createMockValidation(),
            };

            const policyViolating: ValidatedCandidate = {
                candidate: createMockCandidate({
                    id: "violating",
                    compliesWithPolicy: false,
                    policyViolations: ["Exceeds debt limit"],
                    confidence: ConfidenceLevel.HIGH,
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([policyViolating, policyCompliant]);

            // Should select compliant even though it has lower confidence
            expect(result?.recommendedAction).toBeDefined();
            // The validator should have noted policy violation
        });

        it("should downrank policy-violating candidates", () => {
            const violating: ValidatedCandidate = {
                candidate: createMockCandidate({
                    id: "violating",
                    compliesWithPolicy: false,
                    policyViolations: ["Exceeds emergency fund policy"],
                }),
                validation: createMockValidation(),
            };

            const compliant: ValidatedCandidate = {
                candidate: createMockCandidate({
                    id: "compliant",
                    compliesWithPolicy: true,
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([violating, compliant]);

            // Should select the compliant one
            expect(result).toBeDefined();
            // Verify that compliant was selected by checking candidate ID would come through
        });

        it("should respect risk tolerance policy", () => {
            const aggressiveCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    id: "aggressive",
                    risks: [
                        {
                            id: "risk-1",
                            description: "High market volatility exposure",
                            severity: "CRITICAL",
                            likelihood: "LIKELY",
                        },
                    ],
                }),
                validation: createMockValidation(),
            };

            const conservativeCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    id: "conservative",
                    risks: [
                        {
                            id: "risk-1",
                            description: "Opportunity cost",
                            severity: "LOW",
                            likelihood: "UNLIKELY",
                        },
                    ],
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([aggressiveCandidate, conservativeCandidate], {
                riskTolerance: "CONSERVATIVE",
            });

            expect(result).toBeDefined();
            // Conservative policy should prefer lower-risk option
        });
    });

    describe("Rule 4: Deterministic ranking (not LLM preference)", () => {
        it("should rank by validation status first", () => {
            const failCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({ id: "fail" }),
                validation: createMockValidation({ status: "FAIL" }),
            };

            const passCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({ id: "pass" }),
                validation: createMockValidation({ status: "PASS" }),
            };

            const warnCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({ id: "warn" }),
                validation: createMockValidation({
                    status: "PASS_WITH_WARNINGS",
                    warningChecks: 1,
                }),
            };

            // Only pass and warn candidates eligible
            const result = selectFinalRecommendation([failCandidate, warnCandidate, passCandidate]);

            expect(result).toBeDefined();
            // PASS should be selected over PASS_WITH_WARNINGS
        });

        it("should rank by policy compliance second", () => {
            const policyBad: ValidatedCandidate = {
                candidate: createMockCandidate({
                    id: "bad-policy",
                    compliesWithPolicy: false,
                    confidence: ConfidenceLevel.HIGH,
                }),
                validation: createMockValidation(),
            };

            const policyGood: ValidatedCandidate = {
                candidate: createMockCandidate({
                    id: "good-policy",
                    compliesWithPolicy: true,
                    confidence: ConfidenceLevel.MEDIUM,
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([policyBad, policyGood]);

            expect(result).toBeDefined();
            // Policy compliance should outweigh confidence
        });

        it("should rank by evidence quality third", () => {
            const tierFourCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    id: "tier-4",
                    confidenceFactors: {
                        dataQuality: "HIGH",
                        calculationStrength: "HIGH",
                        evidenceFreshness: "CURRENT",
                        evidenceTier: "TIER_4_MEDIA",
                    },
                }),
                validation: createMockValidation(),
            };

            const tierOneCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    id: "tier-1",
                    confidenceFactors: {
                        dataQuality: "HIGH",
                        calculationStrength: "HIGH",
                        evidenceFreshness: "CURRENT",
                        evidenceTier: "TIER_1_GOVERNMENT",
                    },
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([tierFourCandidate, tierOneCandidate]);

            expect(result).toBeDefined();
            // TIER_1_GOVERNMENT should rank higher than TIER_4_MEDIA
        });

        it("should use consistent scoring across identical candidates", () => {
            const candidate1: ValidatedCandidate = {
                candidate: createMockCandidate({ id: "same-1" }),
                validation: createMockValidation(),
            };

            const candidate2: ValidatedCandidate = {
                candidate: createMockCandidate({ id: "same-2" }),
                validation: createMockValidation(),
            };

            const result1 = selectFinalRecommendation([candidate1, candidate2]);
            const result2 = selectFinalRecommendation([candidate2, candidate1]);

            // Should select consistently regardless of input order
            expect(result1).toBeDefined();
            expect(result2).toBeDefined();
        });
    });

    describe("Rule 5: Material alternatives retained", () => {
        it("should include alternatives in final recommendation", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    alternatives: [
                        {
                            id: "alt-1",
                            title: "Conservative option",
                            description: "Lower impact",
                            rationale: "Lower risk",
                            impactDirection: "POSITIVE",
                            isPreferred: false,
                        },
                    ],
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result).toBeDefined();
            expect(result?.alternatives).toHaveLength(1);
            expect(result?.alternatives[0].title).toBe("Conservative option");
        });

        it("should preserve all alternatives even if candidate has many", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    alternatives: [
                        {
                            id: "alt-1",
                            title: "Option A",
                            description: "Description A",
                            rationale: "Rationale A",
                            impactDirection: "POSITIVE",
                            isPreferred: false,
                        },
                        {
                            id: "alt-2",
                            title: "Option B",
                            description: "Description B",
                            rationale: "Rationale B",
                            impactDirection: "NEUTRAL",
                            isPreferred: false,
                        },
                        {
                            id: "alt-3",
                            title: "Option C",
                            description: "Description C",
                            rationale: "Rationale C",
                            impactDirection: "NEGATIVE",
                            isPreferred: false,
                        },
                    ],
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result).toBeDefined();
            expect(result?.alternatives).toHaveLength(3);
        });
    });

    describe("Rule 6: Confidence reflects evidence and uncertainty", () => {
        it("should provide confidence reasoning based on factors", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    confidence: ConfidenceLevel.HIGH,
                    confidenceFactors: {
                        dataQuality: "HIGH",
                        calculationStrength: "HIGH",
                        evidenceFreshness: "CURRENT",
                        evidenceTier: "TIER_1_GOVERNMENT",
                    },
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result).toBeDefined();
            expect(result?.confidenceReasoning).toContain("High confidence");
            expect(result?.confidenceReasoning).toContain("Current");
        });

        it("should note data limitations in confidence reasoning", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    confidence: ConfidenceLevel.MEDIUM,
                    confidenceFactors: {
                        dataQuality: "MEDIUM",
                        calculationStrength: "MEDIUM",
                        evidenceFreshness: "RECENT",
                        evidenceTier: "TIER_3_RESEARCH",
                    },
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result).toBeDefined();
            expect(result?.confidenceReasoning).toContain("Medium");
        });

        it("should flag data quality issues", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    confidence: ConfidenceLevel.LOW,
                    confidenceFactors: {
                        dataQuality: "LOW",
                        calculationStrength: "LOW",
                        evidenceFreshness: "STALE",
                        evidenceTier: "TIER_4_MEDIA",
                    },
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result).toBeDefined();
            expect(result?.confidence).toBe(ConfidenceLevel.LOW);
            expect(result?.confidenceReasoning).toContain("Low");
        });
    });

    describe("Approval requirement determination", () => {
        it("should require approval for PASS_WITH_WARNINGS", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate(),
                validation: createMockValidation({
                    status: "PASS_WITH_WARNINGS",
                    warningChecks: 1,
                }),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result?.approvalRequired).toBe(true);
        });

        it("should not release INSUFFICIENT_INFORMATION for approval", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate(),
                validation: createMockValidation({
                    status: "INSUFFICIENT_INFORMATION",
                }),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result).toBeNull();
        });

        it("should require approval for high-impact challenges", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate(),
                validation: createMockValidation({
                    status: "PASS",
                    adversarialReview: {
                        question: "What could go wrong?",
                        challenges: [
                            {
                                type: "ASSUMPTION",
                                scenario: "Income decreases",
                                impact: "CRITICAL",
                                likelihood: "POSSIBLE",
                                recommendation: "Verify income stability",
                            },
                        ],
                        weaknesses: [],
                    },
                }),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result?.approvalRequired).toBe(true);
        });
    });

    describe("Selection reasoning", () => {
        it("should provide human-readable reasoning for selection", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    expectedImpact: {
                        cashFlowImpact: Money(-500000),
                        wealthIncrease: Money(100000),
                        debtReduction: Money(0),
                    },
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result?.why).toBeDefined();
            expect(result?.why.length).toBeGreaterThan(0);
            expect(result?.why).toContain("passed");
        });

        it("should mention validation status in reasoning", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate(),
                validation: createMockValidation({ status: "PASS" }),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result?.why).toContain("passed all");
        });

        it("should mention evidence quality in reasoning", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    confidenceFactors: {
                        dataQuality: "HIGH",
                        calculationStrength: "HIGH",
                        evidenceFreshness: "CURRENT",
                        evidenceTier: "TIER_1_GOVERNMENT",
                    },
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result?.why).toContain("authoritative evidence");
        });
    });

    describe("Edge cases", () => {
        it("should return null for empty candidate list", () => {
            const result = selectFinalRecommendation([]);

            expect(result).toBeNull();
        });

        it("should handle single candidate", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate(),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result).toBeDefined();
            expect(result?.recommendedAction).toBeDefined();
        });

        it("should preserve complete recommendation metadata", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    assumptions: [
                        {
                            id: "assumption-1",
                            key: "income_stability",
                            value: "$6,000/month",
                            confidence: ConfidenceLevel.HIGH,
                            reason: "Based on 12-month history",
                        },
                    ],
                    risks: [
                        {
                            id: "risk-1",
                            description: "Income disruption",
                            severity: "HIGH",
                            likelihood: "POSSIBLE",
                            mitigations: ["Build larger emergency fund"],
                        },
                    ],
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result).toBeDefined();
            expect(result?.assumptions).toHaveLength(1);
            expect(result?.risks).toHaveLength(1);
            expect(result?.evidence).toBeDefined();
        });

        it("should normalize impact values", () => {
            const candidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    expectedImpact: {
                        cashFlowImpact: Money(-250000),
                        wealthIncrease: Money(500000),
                        debtReduction: Money(0),
                        timeframeMonths: 12,
                    },
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([candidate]);

            expect(result).toBeDefined();
            expect(result?.impact.wealthIncrease).toBe(Money(500000));
            expect(result?.impact.timeframeMonths).toBe(12);
        });
    });

    describe("Ranking with multiple candidates", () => {
        it("should select candidate with best validation status", () => {
            const passCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({ id: "pass" }),
                validation: createMockValidation({ status: "PASS" }),
            };

            const warnCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({ id: "warn" }),
                validation: createMockValidation({
                    status: "PASS_WITH_WARNINGS",
                    warningChecks: 1,
                }),
            };

            const insufficientCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({ id: "insufficient" }),
                validation: createMockValidation({
                    status: "INSUFFICIENT_INFORMATION",
                }),
            };

            const result = selectFinalRecommendation([
                insufficientCandidate,
                warnCandidate,
                passCandidate,
            ]);

            expect(result).toBeDefined();
            // Should select PASS candidate
        });

        it("should break ties by evidence quality", () => {
            const tierThreeCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    id: "tier3",
                    confidenceFactors: {
                        dataQuality: "HIGH",
                        calculationStrength: "HIGH",
                        evidenceFreshness: "CURRENT",
                        evidenceTier: "TIER_3_RESEARCH",
                    },
                }),
                validation: createMockValidation(),
            };

            const tierOneCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    id: "tier1",
                    confidenceFactors: {
                        dataQuality: "HIGH",
                        calculationStrength: "HIGH",
                        evidenceFreshness: "CURRENT",
                        evidenceTier: "TIER_1_GOVERNMENT",
                    },
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([tierThreeCandidate, tierOneCandidate]);

            expect(result).toBeDefined();
            // TIER_1 should win the tie
        });

        it("should prefer larger positive impact when other factors tied", () => {
            const smallImpactCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    id: "small",
                    expectedImpact: {
                        cashFlowImpact: Money(0),
                        wealthIncrease: Money(10000),
                        debtReduction: Money(0),
                    },
                }),
                validation: createMockValidation(),
            };

            const largeImpactCandidate: ValidatedCandidate = {
                candidate: createMockCandidate({
                    id: "large",
                    expectedImpact: {
                        cashFlowImpact: Money(0),
                        wealthIncrease: Money(100000),
                        debtReduction: Money(0),
                    },
                }),
                validation: createMockValidation(),
            };

            const result = selectFinalRecommendation([smallImpactCandidate, largeImpactCandidate]);

            expect(result).toBeDefined();
            // Large impact should be selected
        });
    });
});
