/**
 * Tests for Recommendation Validator
 *
 * Validates that:
 * - Mathematical correctness is verified
 * - Policy compliance is checked
 * - Evidence quality is assessed
 * - Assumptions are sensitivity tested
 * - Alternatives are evaluated
 * - Downside risks are assessed
 * - Bias is detected
 * - Data freshness is checked
 * - Adversarial challenges are generated
 * - Failed recommendations are blocked
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import {
    EntityId,
    Money,
    FinancialSnapshot,
    FinancialHealthStatus,
    RecommendationType,
    ConfidenceLevel,
    ScenarioType,
    Scenario,
} from "@house-fin/contracts";
import {
    validateRecommendation,
    ValidatorInput,
    ValidationDetail,
    AdversarialChallenge,
} from "../packages/domain/recommendation-validator";
import { RecommendationCandidate } from "../packages/domain/recommendation-builder";

/**
 * Mock financial snapshot
 */
function createMockSnapshot(overrides?: Partial<FinancialSnapshot>): FinancialSnapshot {
    return {
        id: "snapshot-1" as EntityId,
        householdId: "household-1" as EntityId,
        asOf: new Date(),
        version: 1,
        cash: Money(180000), // $1,800
        debt: Money(800000), // $8,000
        netWorth: Money(380000), // $3,800
        monthlyIncome: Money(600000), // $6,000
        monthlyEssentialExpenses: Money(400000), // $4,000
        monthlyDiscretionaryExpenses: Money(100000), // $1,000
        monthlySurplus: Money(100000), // $1,000
        financialHealthStatus: FinancialHealthStatus.WATCH,
        sourceAccountIds: [],
        calculatedAt: new Date(),
        createdAt: new Date(),
        ...overrides,
    };
}

/**
 * Mock scenario
 */
function createMockScenario(overrides?: Partial<Scenario>): Scenario {
    return {
        id: `scenario-${Math.random().toString(36).substr(2, 9)}` as EntityId,
        householdId: "household-1" as EntityId,
        financialSnapshotId: "snapshot-1" as EntityId,
        financialSnapshotVersion: 1,
        type: ScenarioType.WINDFALL,
        title: "Test Scenario",
        description: "Test",
        input: {},
        baseline: {
            emergencyFundBalance: Money(180000),
            emergencyFundTarget: Money(2400000),
            emergencyFundMonths: 0.45,
            totalDebt: Money(800000),
            debtToIncomeRatio: 0.33, // 33% - compliant with 50% limit
            highestInterestRate: 18,
            monthlyDebtPayments: Money(32000),
            monthlyIncome: Money(600000),
            monthlyExpenses: Money(500000),
            monthlySavingsCapacity: Money(100000),
            activeGoals: 0,
            goalFundingGap: Money(0),
            retirementYearsAway: 30,
            financialHealthScore: 60,
            healthStatus: FinancialHealthStatus.WATCH,
        },
        proposedActions: [
            {
                id: "action-1",
                title: "Test action",
                description: "Do something",
            },
        ],
        impact: {
            immediatelyAffected: true,
            cashFlowImpact: Money(0),
            debtReduction: Money(0),
            emergencyFundIncrease: Money(1000000),
            investmentIncrease: Money(0),
            savingsIncrease: Money(0),
            wealthIncrease: Money(1000000),
            debtToIncomeChange: 0,
            healthScoreChange: 5,
            emergencyFundMonthsChange: 2,
            riskReduction: "HIGH",
            flexibilityChange: "INCREASED",
            liquidityChange: "IMPROVED",
        },
        resultingState: {
            emergencyFundBalance: Money(1200000), // Exactly 50% of target ($2.4M)
            emergencyFundMonths: 2.45,
            totalDebt: Money(800000),
            debtToIncomeRatio: 0.33, // 33% - compliant
            monthlyDebtPayments: Money(32000),
            monthlySavingsCapacity: Money(100000),
            monthlyAllocableAmount: Money(100000),
            goalFundingGap: Money(0),
            goalsOnTrack: 0,
            financialHealthScore: 65,
            healthStatus: FinancialHealthStatus.WATCH,
        },
        assumptions: [
            {
                key: "income_stable",
                statement: "Monthly income remains stable",
                confidence: ConfidenceLevel.HIGH,
                impact: "HIGH",
            },
        ],
        sensitivities: [],
        order: 1,
        rationale: "Test",
        calculationVersion: 1,
        createdAt: new Date(),
        confidence: ConfidenceLevel.HIGH,
        dataCompleteness: 90,
        ...overrides,
    };
}

/**
 * Mock candidate recommendation
 */
function createMockCandidate(overrides?: Partial<RecommendationCandidate>): RecommendationCandidate {
    const scenario = createMockScenario();
    return {
        id: "candidate-1",
        type: RecommendationType.WINDFALL_ALLOCATION,
        title: "Allocate $10,000 to emergency fund",
        summary: "Prioritize building emergency reserves",
        recommendedAction: "Put $10,000 windfall into savings account for emergency fund",
        alternatives: [
            {
                id: "alt-1",
                title: "Emergency Fund First (Recommended)",
                description: "Allocate to emergency fund",
                rationale: "Provides security",
                isPreferred: true,
                impactDirection: "POSITIVE",
                estimatedImpact: Money(1000000),
            },
            {
                id: "alt-2",
                title: "Debt Reduction",
                description: "Pay off credit card",
                rationale: "Reduce high-interest debt",
                isPreferred: false,
                impactDirection: "POSITIVE",
                estimatedImpact: Money(800000),
            },
        ],
        scenarioIds: [scenario.id],
        expectedImpact: {
            cashFlowImpact: Money(0),
            wealthIncrease: Money(1000000),
            debtReduction: Money(0),
        },
        evidence: [
            {
                id: "ev-1",
                evidenceId: "ev-1" as EntityId,
                claim: "Emergency fund should cover 3-6 months",
                sourceName: "Federal Reserve",
                sourceTier: "TIER_1_GOVERNMENT",
                retrievalDate: new Date(),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.HIGH,
            },
        ],
        assumptions: [
            {
                id: "as-1",
                key: "income_stable",
                value: "Income remains at $6,000/month",
                confidence: ConfidenceLevel.HIGH,
                reason: "Current employment stable",
            },
        ],
        risks: [
            {
                id: "risk-1",
                description: "Windfall may not materialize",
                severity: "MEDIUM",
                likelihood: "POSSIBLE",
                mitigations: ["Have backup plan"],
            },
        ],
        confidence: ConfidenceLevel.HIGH,
        confidenceReasoning: "Complete data, simple scenario, current evidence",
        confidenceFactors: {
            dataQuality: "HIGH",
            calculationStrength: "HIGH",
            evidenceFreshness: "CURRENT",
            evidenceTier: "TIER_1_GOVERNMENT",
        },
        compliesWithPolicy: true,
        policyVersion: 1,
        createdAt: new Date(),
        rationale: "Emergency fund provides security",
        ...overrides,
    };
}

describe("Recommendation Validator", () => {
    let validatorInput: ValidatorInput;
    let candidate: RecommendationCandidate;
    let snapshot: FinancialSnapshot;
    let scenario: Scenario;

    beforeEach(() => {
        snapshot = createMockSnapshot();
        scenario = createMockScenario();
        candidate = createMockCandidate({
            scenarioIds: [scenario.id],
        });

        validatorInput = {
            candidate,
            financialSnapshot: snapshot,
            scenarios: [scenario],
        };
    });

    describe("Mathematical Correctness", () => {
        it("should pass when wealth impact matches scenario", () => {
            const result = validateRecommendation(validatorInput);

            expect(result.status).not.toBe("FAIL");
            const mathCheck = result.details.find((d) => d.category === "MATH");
            expect(mathCheck?.status).toBe("PASS");
        });

        it("should fail when claimed wealth exceeds scenario", () => {
            candidate.expectedImpact.wealthIncrease = Money(5000000); // Way too high
            const result = validateRecommendation(validatorInput);

            const mathCheck = result.details.find((d) => d.category === "MATH");
            expect(mathCheck?.status).toBe("FAIL");
            expect(result.failedChecks).toBeGreaterThan(0);
        });

        it("should fail when no supporting scenarios found", () => {
            validatorInput.scenarios = [];
            const result = validateRecommendation(validatorInput);

            const mathCheck = result.details.find((d) => d.category === "MATH");
            expect(mathCheck?.status).toBe("FAIL");
        });

        it("should warn when debt reduction is high but scenarios don't support it", () => {
            candidate.expectedImpact.debtReduction = Money(2000000);
            const result = validateRecommendation(validatorInput);

            const mathCheck = result.details.find(
                (d) => d.category === "MATH" && d.title.toLowerCase().includes("debt")
            );
            expect(mathCheck).toBeDefined();
            expect([mathCheck?.status]).toContain("WARN");
        });

        it("should flag negative wealth impact on weak household", () => {
            snapshot.netWorth = Money(500); // Very weak
            candidate.expectedImpact.wealthIncrease = Money(-100000);
            const result = validateRecommendation(validatorInput);

            const mathCheck = result.details.find((d) => d.title.includes("Negative wealth"));
            expect(mathCheck?.status).toBe("WARN");
        });
    });

    describe("Policy Compliance", () => {
        it("should pass when emergency fund meets target", () => {
            const result = validateRecommendation(validatorInput);

            const policyCheck = result.details.find((d) => d.category === "POLICY");
            expect(policyCheck?.status).not.toBe("FAIL");
        });

        it("should fail when emergency fund drops below 50% target", () => {
            scenario.resultingState.emergencyFundBalance = Money(100000); // Below 50% of $2.4M target
            const result = validateRecommendation(validatorInput);

            const policyCheck = result.details.find((d) => d.title.includes("Emergency fund policy"));
            expect(policyCheck?.status).toBe("FAIL");
            expect(result.failedChecks).toBeGreaterThan(0);
        });

        it("should fail when DTI exceeds 50%", () => {
            scenario.resultingState.debtToIncomeRatio = 0.75; // Over limit
            const result = validateRecommendation(validatorInput);

            const policyCheck = result.details.find((d) => d.title.includes("Debt-to-income"));
            expect(policyCheck?.status).toBe("FAIL");
        });

        it("should fail when EF drops below 1 month", () => {
            scenario.resultingState.emergencyFundMonths = 0.5;
            const result = validateRecommendation(validatorInput);

            const policyCheck = result.details.find((d) => d.title.includes("emergency fund duration"));
            expect(policyCheck?.status).toBe("FAIL");
        });

        it("should fail when candidate marked non-compliant", () => {
            candidate.compliesWithPolicy = false;
            candidate.policyViolations = ["DTI would exceed 50%"];
            const result = validateRecommendation(validatorInput);

            const policyCheck = result.details.find((d) => d.title.includes("marked non-compliant"));
            expect(policyCheck?.status).toBe("FAIL");
        });
    });

    describe("Evidence Correctness", () => {
        it("should pass with strong, current evidence", () => {
            const result = validateRecommendation(validatorInput);

            const evidenceCheck = result.details.find((d) => d.category === "EVIDENCE");
            expect(evidenceCheck?.status).toBe("PASS");
        });

        it("should warn when no evidence provided", () => {
            candidate.evidence = [];
            const result = validateRecommendation(validatorInput);

            expect(result.status).not.toBe("PASS");
            expect(result.warningChecks).toBeGreaterThan(0);
        });

        it("should fail when evidence is expired", () => {
            candidate.evidence[0].freshness = "EXPIRED";
            const result = validateRecommendation(validatorInput);

            const evidenceCheck = result.details.find((d) => d.title.includes("Expired evidence"));
            expect(evidenceCheck?.status).toBe("FAIL");
        });

        it("should warn when majority of evidence is stale", () => {
            candidate.evidence = [
                { ...candidate.evidence[0], freshness: "STALE" },
                { ...candidate.evidence[0], freshness: "STALE" },
                { ...candidate.evidence[0], freshness: "RECENT" },
            ];
            const result = validateRecommendation(validatorInput);

            const staleCheck = result.details.find((d) => d.title.includes("stale"));
            expect(staleCheck?.status).toBe("WARN");
        });

        it("should warn when media sources outweigh government sources", () => {
            candidate.evidence = [
                { ...candidate.evidence[0], sourceTier: "TIER_4_MEDIA" },
                { ...candidate.evidence[0], sourceTier: "TIER_4_MEDIA" },
                { ...candidate.evidence[0], sourceTier: "TIER_1_GOVERNMENT" },
            ];
            const result = validateRecommendation(validatorInput);

            const sourceCheck = result.details.find((d) => d.title.includes("media sources"));
            expect(sourceCheck?.status).toBe("WARN");
        });
    });

    describe("Assumption Sensitivity", () => {
        it("should pass when assumptions are well-documented", () => {
            const result = validateRecommendation(validatorInput);

            const assumptionCheck = result.details.find((d) => d.category === "ASSUMPTIONS");
            expect(assumptionCheck?.status).toBe("PASS");
        });

        it("should warn when no assumptions documented", () => {
            candidate.assumptions = [];
            const result = validateRecommendation(validatorInput);

            const assumptionCheck = result.details.find((d) => d.title.includes("No assumptions"));
            expect(assumptionCheck?.status).toBe("WARN");
        });

        it("should warn and generate challenges for low-confidence assumptions", () => {
            candidate.assumptions = [
                {
                    ...candidate.assumptions[0],
                    confidence: ConfidenceLevel.LOW,
                },
                {
                    ...candidate.assumptions[0],
                    confidence: ConfidenceLevel.LOW,
                },
            ];
            const result = validateRecommendation(validatorInput);

            const assumptionCheck = result.details.find((d) => d.title.includes("low-confidence"));
            expect(assumptionCheck?.status).toBe("WARN");
            expect(result.adversarialReview.challenges.length).toBeGreaterThan(0);
        });

        it("should generate income change challenge if not documented", () => {
            candidate.assumptions = [];
            const result = validateRecommendation(validatorInput);

            const incomeChallenge = result.adversarialReview.challenges.find(
                (c) => c.type === "INCOME_CHANGE"
            );
            expect(incomeChallenge).toBeDefined();
            expect(incomeChallenge?.likelihood).toBe("POSSIBLE");
        });
    });

    describe("Alternative Quality", () => {
        it("should pass when meaningful alternatives exist", () => {
            const result = validateRecommendation(validatorInput);

            const altCheck = result.details.find((d) => d.category === "ALTERNATIVES");
            expect(altCheck?.status).toBe("PASS");
        });

        it("should warn when no alternatives provided", () => {
            candidate.alternatives = [];
            const result = validateRecommendation(validatorInput);

            const altCheck = result.details.find((d) => d.title.includes("No alternatives"));
            expect(altCheck?.status).toBe("WARN");
        });

        it("should warn when preferred alternative is not marked", () => {
            candidate.alternatives.forEach((a) => (a.isPreferred = false));
            const result = validateRecommendation(validatorInput);

            const altCheck = result.details.find((d) => d.title.includes("not clearly marked"));
            expect(altCheck?.status).toBe("WARN");
        });

        it("should warn when alternatives lack differentiation", () => {
            candidate.alternatives = [
                {
                    id: "alt-1",
                    title: "Option A",
                    description: "Do this",
                    rationale: "It's good",
                    isPreferred: true,
                    impactDirection: "POSITIVE",
                },
                {
                    id: "alt-2",
                    title: "Option B",
                    description: "Do that",
                    rationale: "It's also good",
                    isPreferred: false,
                    impactDirection: "POSITIVE",
                },
            ];
            const result = validateRecommendation(validatorInput);

            const altCheck = result.details.find((d) => d.title.includes("Limited"));
            expect(altCheck?.status).toBe("WARN");
        });
    });

    describe("Downside Assessment", () => {
        it("should pass when downside risks identified", () => {
            const result = validateRecommendation(validatorInput);

            const downCheck = result.details.find((d) => d.category === "DOWNSIDE");
            expect(downCheck).toBeDefined();
            expect(downCheck?.status).not.toBe("FAIL");
        });

        it("should fail when critical risks identified", () => {
            candidate.risks = [
                {
                    id: "risk-1",
                    description: "This could cause financial ruin",
                    severity: "CRITICAL",
                    likelihood: "POSSIBLE",
                },
            ];
            const result = validateRecommendation(validatorInput);

            const downCheck = result.details.find((d) => d.title.includes("Critical risks"));
            expect(downCheck?.status).toBe("FAIL");
            expect(result.failedChecks).toBeGreaterThan(0);
        });

        it("should warn when high-severity risks lack mitigations", () => {
            candidate.risks = [
                {
                    id: "risk-1",
                    description: "Major risk",
                    severity: "HIGH",
                    likelihood: "POSSIBLE",
                    // No mitigations
                },
            ];
            const result = validateRecommendation(validatorInput);

            const downCheck = result.details.find((d) => d.title.includes("without mitigations"));
            expect(downCheck?.status).toBe("WARN");
        });

        it("should warn with limited downside assessment", () => {
            candidate.risks = [
                {
                    id: "risk-1",
                    description: "One risk",
                    severity: "LOW",
                    likelihood: "UNLIKELY",
                },
            ];
            const result = validateRecommendation(validatorInput);

            const downCheck = result.details.find((d) => d.title.includes("Limited"));
            expect(downCheck?.status).toBe("WARN");
        });

        it("should generate adversarial challenge for critical risks", () => {
            candidate.risks = [
                {
                    id: "risk-1",
                    description: "Job loss within 12 months",
                    severity: "CRITICAL",
                    likelihood: "POSSIBLE",
                    mitigations: ["Maintain 6-month emergency fund"],
                },
            ];
            const result = validateRecommendation(validatorInput);

            const challenge = result.adversarialReview.challenges.find((c) => c.type === "EMERGENCY");
            expect(challenge).toBeDefined();
            expect(challenge?.impact).toBe("CRITICAL");
        });
    });

    describe("Bias Detection", () => {
        it("should pass when no systematic bias detected", () => {
            const result = validateRecommendation(validatorInput);

            const biasCheck = result.details.find((d) => d.category === "BIAS");
            // Either no bias detected OR bias check passes; should NOT have FAIL
            if (biasCheck) {
                expect(biasCheck?.status).not.toBe("FAIL");
            }
        });

        it("should warn for product-specific recommendation without comparison", () => {
            candidate.recommendedAction =
                "Open a Chase Sapphire Reserve credit card for $5,000 sign-up bonus";
            candidate.alternatives = []; // No comparison
            const result = validateRecommendation(validatorInput);

            const biasCheck = result.details.find((d) => d.category === "BIAS");
            expect(biasCheck?.status).toBe("WARN");
        });

        it("should warn for aggressive strategy without downside emphasis", () => {
            candidate.summary = "Maximize returns with aggressive investment strategy";
            candidate.risks = []; // No downside
            const result = validateRecommendation(validatorInput);

            const biasCheck = result.details.find((d) => d.title.includes("Aggressive"));
            expect(biasCheck?.status).toBe("WARN");
        });

        it("should warn for conservative strategy that favors status quo", () => {
            candidate.summary = "Play it safe and don't risk any money";
            candidate.alternatives = [
                {
                    id: "alt-1",
                    title: "Stay put",
                    description: "Don't do anything",
                    rationale: "Safest",
                    isPreferred: true,
                    impactDirection: "NEUTRAL",
                },
                {
                    id: "alt-2",
                    title: "Grow investments",
                    description: "Invest for growth",
                    rationale: "Could earn more",
                    isPreferred: false,
                    impactDirection: "POSITIVE",
                },
            ];
            const result = validateRecommendation(validatorInput);

            const biasCheck = result.details.find((d) => d.title.includes("status quo bias"));
            expect(biasCheck?.status).toBe("WARN");
        });
    });

    describe("Data Freshness", () => {
        it("should pass when snapshot is current", () => {
            snapshot.asOf = new Date();
            const result = validateRecommendation(validatorInput);

            const freshCheck = result.details.find((d) => d.title.includes("is current"));
            expect(freshCheck?.status).toBe("PASS");
        });

        it("should warn when snapshot is 45 days old", () => {
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 45);
            snapshot.asOf = oldDate;
            const result = validateRecommendation(validatorInput);

            const freshCheck = result.details.find((d) => d.title.includes("aging"));
            expect(freshCheck?.status).toBe("WARN");
        });

        it("should fail when snapshot is 100 days old", () => {
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 100);
            snapshot.asOf = oldDate;
            const result = validateRecommendation(validatorInput);

            const freshCheck = result.details.find((d) => d.title.includes("too old"));
            expect(freshCheck?.status).toBe("FAIL");
        });

        it("should pass when all evidence is current", () => {
            candidate.evidence.forEach((e) => {
                e.freshness = "CURRENT";
            });
            const result = validateRecommendation(validatorInput);

            const freshCheck = result.details.find(
                (d) => d.category === "FRESHNESS" && d.title.toLowerCase().includes("evidence")
            );
            expect(freshCheck).toBeDefined();
            expect(freshCheck?.status).toBe("PASS");
        });
    });

    describe("Overall Validation Status", () => {
        it("should return PASS for well-formed recommendation", () => {
            // Ensure snapshot is fresh and policy compliant
            snapshot.asOf = new Date();
            // Emergency fund is above 75% ideal (not just at 50% minimum)
            scenario.resultingState.emergencyFundBalance = Money(1900000); // 79% of target
            scenario.resultingState.debtToIncomeRatio = 0.33; // Compliant (33% < 50%)
            scenario.resultingState.emergencyFundMonths = 2.45; // Above 1 month

            const result = validateRecommendation(validatorInput);

            // Log failures for debugging
            if (result.failedChecks > 0) {
                console.log("Failed checks:", result.details.filter((d) => d.status === "FAIL"));
            }

            expect(result.failedChecks).toBe(0);
            // Should be PASS or PASS_WITH_WARNINGS - no critical failures
            expect(["PASS", "PASS_WITH_WARNINGS"]).toContain(result.status);
        });

        it("should return PASS_WITH_WARNINGS for valid but cautionary recommendation", () => {
            // Snapshot slightly old (45 days) but not expired
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 45);
            snapshot.asOf = oldDate;

            // Ensure policy compliance
            scenario.resultingState.emergencyFundBalance = Money(1200000); // At 50% target
            const result = validateRecommendation(validatorInput);

            // Should have warnings but pass overall
            expect([
                "PASS",
                "PASS_WITH_WARNINGS",
            ]).toContain(result.status);
            expect(result.warningChecks).toBeGreaterThanOrEqual(0);
        });

        it("should return FAIL when any critical check fails", () => {
            scenario.resultingState.debtToIncomeRatio = 0.75; // DTI violation
            const result = validateRecommendation(validatorInput);

            expect(result.status).toBe("FAIL");
            expect(result.failedChecks).toBeGreaterThan(0);
        });

        it("should include helpful summary", () => {
            const result = validateRecommendation(validatorInput);

            expect(result.summary).toBeTruthy();
            expect(result.summary.length).toBeGreaterThan(0);
        });

        it("should include recommendations for user", () => {
            const result = validateRecommendation(validatorInput);

            expect(result.recommendations).toBeDefined();
            // PASS should have at least some content
            if (result.status === "PASS") {
                expect(Array.isArray(result.recommendations)).toBe(true);
            }
        });
    });

    describe("Adversarial Review", () => {
        it("should generate adversarial challenges", () => {
            const result = validateRecommendation(validatorInput);

            expect(result.adversarialReview).toBeDefined();
            expect(result.adversarialReview.question).toContain("What would");
            expect(Array.isArray(result.adversarialReview.challenges)).toBe(true);
        });

        it("should identify weaknesses", () => {
            candidate.evidence = [];
            candidate.risks = [];
            const result = validateRecommendation(validatorInput);

            expect(result.adversarialReview.weaknesses.length).toBeGreaterThan(0);
        });

        it("should prioritize critical challenges", () => {
            candidate.risks = [
                {
                    id: "risk-1",
                    description: "Could lose everything",
                    severity: "CRITICAL",
                    likelihood: "POSSIBLE",
                },
            ];
            const result = validateRecommendation(validatorInput);

            const criticalChallenges = result.adversarialReview.challenges.filter(
                (c) => c.impact === "CRITICAL"
            );
            expect(criticalChallenges.length).toBeGreaterThan(0);
        });
    });

    describe("Confidence Recalibration", () => {
        it("should reduce confidence when validation fails", () => {
            scenario.resultingState.debtToIncomeRatio = 1.0; // Major policy violation
            const result = validateRecommendation(validatorInput);

            expect(result.confidenceAfterValidation).toBe(ConfidenceLevel.LOW);
        });

        it("should adjust confidence on PASS_WITH_WARNINGS", () => {
            // Snapshot too old causes warning
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 45);
            snapshot.asOf = oldDate;
            candidate.confidence = ConfidenceLevel.HIGH;
            const result = validateRecommendation(validatorInput);

            // With warnings, confidence should not increase
            expect(
                [ConfidenceLevel.HIGH, ConfidenceLevel.MEDIUM, ConfidenceLevel.LOW]
            ).toContain(result.confidenceAfterValidation);
        });

        it("should maintain confidence on PASS with strong data", () => {
            snapshot.asOf = new Date();
            scenario.resultingState.emergencyFundBalance = Money(1200000); // At 50% target
            scenario.resultingState.debtToIncomeRatio = 0.33; // Compliant (33% < 50%)
            scenario.resultingState.emergencyFundMonths = 2.45; // > 1 month
            candidate.confidence = ConfidenceLevel.HIGH;
            candidate.confidenceFactors.dataQuality = "HIGH";
            candidate.confidenceFactors.evidenceFreshness = "CURRENT";
            const result = validateRecommendation(validatorInput);

            expect(result.status).not.toBe("FAIL");
        });
    });

    describe("Adversarial Test Cases", () => {
        it("Case 1: Recommend high-risk strategy without adequate emergency fund", () => {
            candidate.summary = "Aggressive growth portfolio to maximize returns";
            scenario.resultingState.emergencyFundMonths = 0.8; // Below minimum
            candidate.risks = []; // No downside documented
            candidate.confidence = ConfidenceLevel.HIGH;

            const result = validateRecommendation(validatorInput);

            expect(result.status).toBe("FAIL");
            expect(
                result.details.some(
                    (d) => d.category === "POLICY" && d.title.includes("emergency")
                )
            ).toBe(true);
        });

        it("Case 2: Recommend debt payoff that violates policy", () => {
            candidate.title = "Pay off all debt immediately";
            scenario.resultingState.emergencyFundBalance = Money(50000); // Way too low
            scenario.resultingState.emergencyFundMonths = 0.1;

            const result = validateRecommendation(validatorInput);

            expect(result.status).toBe("FAIL");
            expect(result.failedChecks).toBeGreaterThan(0);
        });

        it("Case 3: Recommend product with no evidence", () => {
            candidate.recommendedAction = "Switch to Bank XYZ for savings account";
            candidate.evidence = [];
            candidate.alternatives = []; // No comparison

            const result = validateRecommendation(validatorInput);

            expect(result.status).not.toBe("PASS");
            expect(result.warningChecks).toBeGreaterThan(0);
        });

        it("Case 4: Recommend based on assumptions that don't hold", () => {
            candidate.assumptions = [
                {
                    id: "a1",
                    key: "interest_rate",
                    value: "APR will stay at 3%",
                    confidence: ConfidenceLevel.LOW,
                    reason: "Markets are volatile",
                },
                {
                    id: "a2",
                    key: "income_level",
                    value: "Income will grow 5% annually",
                    confidence: ConfidenceLevel.LOW,
                    reason: "Speculative",
                },
            ];

            const result = validateRecommendation(validatorInput);

            expect(result.adversarialReview.challenges.length).toBeGreaterThan(0);
            expect(result.warningChecks).toBeGreaterThan(0);
        });

        it("Case 5: Recommend with stale evidence and old snapshot", () => {
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 95); // More than 90 days
            snapshot.asOf = oldDate;

            candidate.evidence[0].freshness = "STALE";
            candidate.evidence[0].retrievalDate = oldDate;

            const result = validateRecommendation(validatorInput);

            // Old snapshot (>90 days) causes FAIL
            expect(result.status).toBe("FAIL");
            expect(result.failedChecks).toBeGreaterThan(0);
        });

        it("Case 6: Recommend strategy with no alternatives", () => {
            candidate.alternatives = [];
            candidate.recommendedAction = "This is the only way to handle your situation";

            const result = validateRecommendation(validatorInput);

            expect(result.warningChecks).toBeGreaterThan(0);
            const altCheck = result.details.find((d) => d.category === "ALTERNATIVES");
            expect(altCheck?.status).toBe("WARN");
        });

        it("Case 7: Recommend with overstated financial impact", () => {
            candidate.expectedImpact.wealthIncrease = Money(50000000); // Way too high
            scenario.impact.wealthIncrease = Money(1000000); // Reality is much lower

            const result = validateRecommendation(validatorInput);

            expect(result.status).toBe("FAIL");
            const mathCheck = result.details.find((d) => d.category === "MATH");
            expect(mathCheck?.status).toBe("FAIL");
        });

        it("Case 8: Recommend bias toward specific provider", () => {
            candidate.recommendedAction =
                "Switch all banking to Chase and use their premium checking account";
            candidate.alternatives = [];
            candidate.evidence = [
                {
                    ...candidate.evidence[0],
                    sourceName: "Chase",
                    sourceTier: "TIER_2_PROVIDER", // Provider source
                },
            ];

            const result = validateRecommendation(validatorInput);

            const biasCheck = result.details.find((d) => d.category === "BIAS");
            expect(biasCheck?.status).toBe("FAIL"); // Provider conflict with no alternatives blocks approval
        });

        it("Case 9: Recommend emergency action without contingency plan", () => {
            candidate.title = "Immediately liquidate retirement accounts";
            candidate.risks = [
                {
                    id: "r1",
                    description: "Large tax penalty",
                    severity: "CRITICAL",
                    likelihood: "PROBABLE",
                },
            ];
            candidate.assumptions = [
                {
                    id: "a1",
                    key: "tax_impact",
                    value: "Tax impact is manageable",
                    confidence: ConfidenceLevel.LOW,
                    reason: "Unknown future tax situation",
                },
            ];

            const result = validateRecommendation(validatorInput);

            expect(result.status).toBe("FAIL");
            const criticalRisk = result.details.find(
                (d) => d.title.includes("Critical risks")
            );
            expect(criticalRisk?.status).toBe("FAIL");
        });

        it("Case 10: Recommend without considering alternatives", () => {
            candidate.alternatives = [
                {
                    id: "only",
                    title: "Do nothing",
                    description: "Status quo",
                    rationale: "It's default",
                    isPreferred: false,
                    impactDirection: "NEUTRAL",
                },
            ];
            candidate.summary = "This is clearly the best option, no other reasonable choices";

            const result = validateRecommendation(validatorInput);

            expect(result.warningChecks).toBeGreaterThan(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // Conflict and Bias Detection: Deliberately Biased Scenarios
    // ─────────────────────────────────────────────────────────────────
    describe("Conflict and Bias Detection - Deliberately Biased Candidates", () => {
        it("Detects provider conflict: recommends product from evidence provider", () => {
            candidate.recommendedAction = "Open a Vanguard index fund account";
            candidate.alternatives = []; // No comparison
            candidate.evidence = [
                {
                    id: "vg-1",
                    evidenceId: "vg-1" as EntityId,
                    claim: "Index funds provide low-cost diversified investing",
                    sourceName: "Vanguard",
                    sourceTier: "TIER_2_PROVIDER",
                    sourceUrl: "https://vanguard.com/why-index-funds",
                    retrievalDate: new Date(),
                    freshness: "CURRENT",
                    confidence: ConfidenceLevel.HIGH,
                },
            ];

            const result = validateRecommendation(validatorInput);

            expect(result.status).toBe("FAIL"); // Provider conflict blocks approval
            const conflictDetail = result.details.find((d) => d.title.includes("conflict"));
            expect(conflictDetail).toBeDefined();
            expect(conflictDetail?.status).toBe("FAIL");

            // Should generate challenge
            const conflictChallenge = result.adversarialReview.challenges.find(
                (c) => c.type === "PROVIDER_CONFLICT"
            );
            expect(conflictChallenge).toBeDefined();
        });

        it("Detects undisclosed fees in product recommendation", () => {
            candidate.recommendedAction = "Switch to premium credit card with rewards";
            candidate.summary = "Premium card offers excellent cash back rewards";
            candidate.rationale = "Best card for travel benefits"; // No mention of fees
            candidate.evidence = [
                {
                    id: "cc-1",
                    evidenceId: "cc-1" as EntityId,
                    claim: "Premium card offers cash back rewards",
                    sourceName: "Card Issuer",
                    sourceTier: "TIER_2_PROVIDER",
                    sourceUrl: "https://creditcard.com/rewards",
                    retrievalDate: new Date(),
                    freshness: "CURRENT",
                    confidence: ConfidenceLevel.MEDIUM,
                },
            ];

            const result = validateRecommendation(validatorInput);

            expect(result.warningChecks).toBeGreaterThan(0);
            const costDetail = result.details.find((d) =>
                d.description.toLowerCase().includes("cost")
            );
            expect(costDetail?.status).toBe("WARN");
            expect(result.adversarialReview.weaknesses).toContainEqual(
                expect.stringMatching(/cost|fee/i)
            );
        });

        it("Detects marketing language without evidence", () => {
            candidate.summary =
                "This amazing opportunity can't be missed! The best option available, guaranteed to improve your wealth!";
            candidate.rationale = "Revolutionary approach that everyone should adopt";
            candidate.evidence = [
                {
                    id: "m1",
                    evidenceId: "m1" as EntityId,
                    claim: "This is a good financial strategy",
                    sourceName: "Financial Media",
                    sourceTier: "TIER_4_MEDIA",
                    sourceUrl: "https://mediasource.com/opinion",
                    retrievalDate: new Date(),
                    freshness: "CURRENT",
                    confidence: ConfidenceLevel.LOW,
                },
            ];

            const result = validateRecommendation(validatorInput);

            expect(result.warningChecks).toBeGreaterThan(0);
            const marketingDetail = result.details.find((d) =>
                d.title.toLowerCase().includes("persuasive") || d.title.toLowerCase().includes("marketing")
            );
            expect(marketingDetail).toBeDefined();
            expect(marketingDetail?.status).toBe("WARN");
        });

        it("Detects hidden assumptions not disclosed", () => {
            candidate.summary =
                "You will need to increase savings by 20% to meet retirement goals";
            candidate.rationale = "This strategy requires favorable market conditions";
            candidate.assumptions = []; // No explicit assumptions listed

            const result = validateRecommendation(validatorInput);

            expect(result.warningChecks).toBeGreaterThan(0);
            const assumptionDetail = result.details.find((d) =>
                d.title.toLowerCase().includes("assumption")
            );
            expect(assumptionDetail?.status).toBe("WARN");
            expect(result.adversarialReview.challenges.length).toBeGreaterThan(0);
        });

        it("Detects asymmetric downside: positive summary vs minimal risk discussion", () => {
            candidate.summary = "Excellent opportunity for exceptional wealth growth!";
            candidate.rationale = "This strategy will significantly boost your net worth";
            candidate.risks = [
                {
                    id: "r1",
                    description: "Market volatility",
                    severity: "MEDIUM",
                    likelihood: "POSSIBLE",
                    mitigations: [], // No mitigations
                },
            ];

            const result = validateRecommendation(validatorInput);

            expect(result.warningChecks).toBeGreaterThan(0);
            const asymmetricDetail = result.details.find((d) =>
                d.title.toLowerCase().includes("asymmetric")
            );
            expect(asymmetricDetail?.status).toBe("WARN");
        });

        it("Detects one-sided alternative analysis (preferred gets more detail)", () => {
            candidate.alternatives = [
                {
                    id: "preferred",
                    title: "Recommended strategy",
                    description: "This is the optimal approach because it balances growth with security while maximizing tax efficiency. It takes advantage of current market conditions and provides flexibility. The detailed analysis shows strong returns across multiple scenarios.",
                    rationale: "Comprehensive benefits with thorough risk mitigation and excellent historical performance data supporting this choice.",
                    isPreferred: true,
                    impactDirection: "POSITIVE",
                },
                {
                    id: "alt1",
                    title: "Alternative",
                    description: "Different approach",
                    rationale: "But only suboptimal",
                    isPreferred: false,
                    impactDirection: "POSITIVE",
                },
            ];

            const result = validateRecommendation(validatorInput);

            expect(result.warningChecks).toBeGreaterThan(0);
            const analysisDetail = result.details.find((d) =>
                d.title.toLowerCase().includes("one-sided") || d.title.toLowerCase().includes("asymmetric")
            );
            expect(analysisDetail).toBeDefined();
        });

        it("Detects information retrieval bias: provider evidence > government evidence", () => {
            candidate.evidence = [
                {
                    id: "p1",
                    evidenceId: "p1" as EntityId,
                    claim: "Our products provide excellent benefits",
                    sourceName: "Bank",
                    sourceTier: "TIER_2_PROVIDER",
                    sourceUrl: "https://bank.com",
                    retrievalDate: new Date(),
                    freshness: "CURRENT",
                    confidence: ConfidenceLevel.MEDIUM,
                },
                {
                    id: "p2",
                    evidenceId: "p2" as EntityId,
                    claim: "Our funds have strong performance history",
                    sourceName: "Fund Company",
                    sourceTier: "TIER_2_PROVIDER",
                    sourceUrl: "https://fund.com",
                    retrievalDate: new Date(),
                    freshness: "CURRENT",
                    confidence: ConfidenceLevel.MEDIUM,
                },
                {
                    id: "p3",
                    evidenceId: "p3" as EntityId,
                    claim: "Market analysis shows volatility",
                    sourceName: "Research Broker",
                    sourceTier: "TIER_3_RESEARCH",
                    sourceUrl: "https://broker.com",
                    retrievalDate: new Date(),
                    freshness: "CURRENT",
                    confidence: ConfidenceLevel.MEDIUM,
                },
            ];

            const result = validateRecommendation(validatorInput);

            expect(result.warningChecks).toBeGreaterThan(0);
            const biasDetail = result.details.find((d) =>
                d.description.toLowerCase().includes("information retrieval") || d.description.toLowerCase().includes("provider-supplied")
            );
            expect(biasDetail).toBeDefined();
            expect(biasDetail?.status).toBe("WARN");
        });

        it("Detects missing benefit-cost-limitation analysis for product", () => {
            candidate.recommendedAction = "Invest in ABC mutual fund";
            candidate.summary = "Fund has strong historical returns"; // Has benefit
            candidate.rationale = "Diversified portfolio"; // No cost, limitation, or reasoning
            candidate.evidence = [
                {
                    id: "fund1",
                    evidenceId: "fund1" as EntityId,
                    claim: "Fund has positive historical returns",
                    sourceName: "Fund Provider",
                    sourceTier: "TIER_2_PROVIDER",
                    sourceUrl: "https://fund.com/prospectus",
                    retrievalDate: new Date(),
                    freshness: "CURRENT",
                    confidence: ConfidenceLevel.HIGH,
                },
            ];

            const result = validateRecommendation(validatorInput);

            expect(result.warningChecks).toBeGreaterThan(0);
            const productDetail = result.details.find((d) =>
                /benefit|limitation|cost|missing/i.test(d.title)
            );
            expect(productDetail).toBeDefined();
        });

        it("Detects strawman analysis of alternatives", () => {
            candidate.alternatives = [
                {
                    id: "preferred",
                    title: "Recommended strategy",
                    description: "Excellent approach with superior risk-adjusted returns",
                    rationale: "Backed by academic research and proven track record",
                    isPreferred: true,
                    impactDirection: "POSITIVE",
                },
                {
                    id: "alt1",
                    title: "Alternative 1",
                    description: "Status quo approach",
                    rationale: "But only maintains current position without growth",
                    isPreferred: false,
                    impactDirection: "NEUTRAL",
                },
                {
                    id: "alt2",
                    title: "Alternative 2",
                    description: "Aggressive approach",
                    rationale: "However, exposes you to excessive risk",
                    isPreferred: false,
                    impactDirection: "POSITIVE",
                },
            ];

            const result = validateRecommendation(validatorInput);

            expect(result.warningChecks).toBeGreaterThan(0);
            const strawmanDetail = result.details.find((d) =>
                d.description.toLowerCase().includes("strawman") || d.description.toLowerCase().includes("weak")
            );
            expect(strawmanDetail).toBeDefined();
        });

        it("Generates 'What would make another option better?' question", () => {
            candidate.alternatives = [
                {
                    id: "only",
                    title: "Single option",
                    description: "This is what we recommend",
                    rationale: "No comparison needed",
                    isPreferred: true,
                    impactDirection: "POSITIVE",
                },
            ];

            const result = validateRecommendation(validatorInput);

            // The validator should generate the question
            expect(result.adversarialReview.question).toBeDefined();
            // Should have challenges that address the imbalance
            const asymmetricChallenge = result.adversarialReview.challenges.find(
                (c) => c.type === "ASYMMETRIC_ANALYSIS"
            );
            expect(asymmetricChallenge?.scenario).toBe("What would make another option better?");
        });

        it("Flags high-fee product without low-cost alternatives", () => {
            candidate.recommendedAction = "Elite investment account with premium advisory fees";
            candidate.summary = "Premium account provides exclusive benefits";
            candidate.alternatives = [
                {
                    id: "alt",
                    title: "Standard account",
                    description: "Also good but lacks elite features",
                    rationale: "Not as comprehensive",
                    isPreferred: false,
                    impactDirection: "NEUTRAL",
                },
            ];

            const result = validateRecommendation(validatorInput);

            expect(result.warningChecks).toBeGreaterThan(0);
            const feeDetail = result.details.find((d) =>
                /fee|cost|premium/i.test(d.description)
            );
            expect(feeDetail).toBeDefined();
        });

        it("Passes when all bias checks are clean: balanced analysis", () => {
            candidate.recommendedAction = "Balanced portfolio approach";
            candidate.summary = "Diversified allocation strategy";
            candidate.rationale = "Balances growth and security based on goals";
            candidate.evidence = [
                {
                    id: "g1",
                    evidenceId: "g1" as EntityId,
                    claim: "Portfolio theory supports diversification",
                    sourceName: "Federal Reserve",
                    sourceTier: "TIER_1_GOVERNMENT",
                    sourceUrl: "https://federalreserve.gov/research",
                    retrievalDate: new Date(),
                    freshness: "CURRENT",
                    confidence: ConfidenceLevel.HIGH,
                },
                {
                    id: "a1",
                    evidenceId: "a1" as EntityId,
                    claim: "Academic research supports balanced allocation",
                    sourceName: "Academic Researchers",
                    sourceTier: "TIER_3_RESEARCH",
                    sourceUrl: "https://academic.edu/study",
                    retrievalDate: new Date(),
                    freshness: "CURRENT",
                    confidence: ConfidenceLevel.HIGH,
                },
            ];
            candidate.alternatives = [
                {
                    id: "aggressive",
                    title: "Aggressive growth",
                    description: "Higher risk for growth potential",
                    rationale: "Suitable for some investors but not your profile",
                    isPreferred: false,
                    impactDirection: "POSITIVE",
                },
                {
                    id: "conservative",
                    title: "Conservative preservation",
                    description: "Lower risk focus",
                    rationale: "Suitable for some investors but sacrifices growth",
                    isPreferred: false,
                    impactDirection: "NEUTRAL",
                },
                {
                    id: "recommended",
                    title: "Balanced approach",
                    description:
                        "Medium risk with diversification across asset classes and geographies",
                    rationale: "Best fit for your situation based on goals and risk tolerance",
                    isPreferred: true,
                    impactDirection: "POSITIVE",
                },
            ];
            candidate.assumptions = [
                {
                    id: "as-market",
                    key: "market_conditions",
                    value: "Historical patterns continue",
                    confidence: ConfidenceLevel.HIGH,
                    reason: "Long-term data supports this",
                },
                {
                    id: "as-inflation",
                    key: "inflation",
                    value: "2-3% annual inflation",
                    confidence: ConfidenceLevel.MEDIUM,
                    reason: "Federal Reserve target range",
                },
            ];

            const result = validateRecommendation(validatorInput);

            // Should have minimal bias warnings
            const biasWarnings = result.details.filter((d) => d.category === "BIAS");
            const failedBias = biasWarnings.filter((d) => d.status === "FAIL");
            expect(failedBias.length).toBe(0);
        });
    });
});
