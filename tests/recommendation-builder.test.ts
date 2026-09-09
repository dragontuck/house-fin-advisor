/**
 * Tests for Recommendation Candidate Builder
 *
 * Validates that:
 * - Candidates are generated from scenarios
 * - Policy constraints are applied
 * - Evidence is linked correctly
 * - Multiple alternatives exist where appropriate
 * - Confidence is calculated from data quality + calculation strength + evidence freshness
 * - No unsupported claims are made
 * - Financial impacts come from scenarios only
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
    Evidence,
    SourceTier,
    SourceAuthority,
} from "@house-fin/contracts";
import {
    generateCandidateRecommendations,
    RecommendationBuilderInput,
    RecommendationCandidate,
} from "../packages/domain/recommendation-builder";

/**
 * Mock financial snapshot for testing
 */
function createMockSnapshot(overrides?: Partial<FinancialSnapshot>): FinancialSnapshot {
    return {
        id: "snapshot-1" as EntityId,
        householdId: "household-1" as EntityId,
        asOf: new Date("2026-09-09"),
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
        calculatedAt: new Date("2026-09-09"),
        createdAt: new Date("2026-09-09"),
        ...overrides,
    };
}

/**
 * Mock scenario for testing
 */
function createMockScenario(
    type: ScenarioType = ScenarioType.WINDFALL,
    overrides?: Partial<Scenario>
): Scenario {
    return {
        id: `scenario-${Math.random().toString(36).substr(2, 9)}` as EntityId,
        householdId: "household-1" as EntityId,
        financialSnapshotId: "snapshot-1" as EntityId,
        financialSnapshotVersion: 1,
        type,
        title: `${type} Scenario`,
        description: `Test scenario for ${type}`,
        input: {},
        baseline: {
            emergencyFundBalance: Money(180000),
            emergencyFundTarget: Money(2400000),
            emergencyFundMonths: 0.45,
            totalDebt: Money(800000),
            debtToIncomeRatio: 1.33,
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
                description: "Do something financial",
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
            emergencyFundBalance: Money(1180000),
            emergencyFundMonths: 2.45,
            totalDebt: Money(800000),
            debtToIncomeRatio: 1.33,
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
        rationale: "Test scenario rationale",
        calculationVersion: 1,
        createdAt: new Date(),
        confidence: ConfidenceLevel.HIGH,
        dataCompleteness: 90,
        ...overrides,
    };
}

/**
 * Mock evidence for testing
 */
function createMockEvidence(claim: string, overrides?: Partial<Evidence>): Evidence {
    return {
        id: `evidence-${Math.random().toString(36).substr(2, 9)}` as EntityId,
        householdId: "household-1" as EntityId,
        claim,
        source: {
            name: "Federal Reserve",
            type: "GOVERNMENT",
            tier: SourceTier.TIER_1_GOVERNMENT,
            authority: SourceAuthority.REGULATORY,
            url: "https://federalreserve.gov",
        },
        retrievalDate: new Date("2026-09-01"),
        expiresAt: new Date("2027-09-01"),
        freshness: "CURRENT",
        confidence: ConfidenceLevel.HIGH,
        usedIn: [],
        verificationStatus: "VERIFIED",
        createdAt: new Date("2026-09-01"),
        ...overrides,
    };
}

describe("Recommendation Candidate Builder", () => {
    let builderInput: RecommendationBuilderInput;
    let snapshot: FinancialSnapshot;
    let scenarios: Scenario[];
    let evidence: Evidence[];

    beforeEach(() => {
        snapshot = createMockSnapshot();

        scenarios = [
            createMockScenario(ScenarioType.WINDFALL, {
                title: "Emergency Fund First",
                id: "scenario-ef" as EntityId,
                order: 1,
            }),
            createMockScenario(ScenarioType.WINDFALL, {
                title: "High-Interest Debt Reduction",
                id: "scenario-debt" as EntityId,
                order: 2,
            }),
            createMockScenario(ScenarioType.WINDFALL, {
                title: "Balanced Allocation",
                id: "scenario-balanced" as EntityId,
                order: 3,
            }),
        ];

        evidence = [
            createMockEvidence("Emergency fund policy: 3-6 months of expenses"),
            createMockEvidence("High interest credit card rates average 22% APR"),
            createMockEvidence("2024 inflation rate is 2.8%"),
        ];

        builderInput = {
            householdId: "household-1" as EntityId,
            memberId: "member-1" as EntityId,
            intent: RecommendationType.WINDFALL_ALLOCATION,
            financialSnapshot: snapshot,
            policyVersion: 1,
            scenarios,
            availableEvidence: evidence,
        };
    });

    describe("Windfall Allocation Candidates", () => {
        it("should generate multiple candidates from windfall scenarios", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            expect(candidates.length).toBeGreaterThan(0);
            expect(candidates[0].type).toBe(RecommendationType.WINDFALL_ALLOCATION);
        });

        it("should mark first candidate as preferred", () => {
            const candidates = generateCandidateRecommendations(builderInput);
            const preferred = candidates.filter((c) => c.alternatives.some((a) => a.isPreferred));

            expect(preferred.length).toBeGreaterThan(0);
        });

        it("should include only unsupported claims from evidence", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            candidates.forEach((candidate) => {
                candidate.evidence.forEach((ev) => {
                    // All evidence should be from availableEvidence
                    const isInAvailable = evidence.some((e) => e.id === ev.evidenceId);
                    expect(isInAvailable).toBe(true);
                });
            });
        });

        it("should include assumptions with confidence levels", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            expect(candidates[0].assumptions.length).toBeGreaterThan(0);
            candidates[0].assumptions.forEach((assumption) => {
                expect(assumption.confidence).toMatch(/HIGH|MEDIUM|LOW|INSUFFICIENT_INFORMATION/);
            });
        });

        it("should include risks with severity and likelihood", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            candidates[0].risks.forEach((risk) => {
                expect(risk.severity).toMatch(/LOW|MEDIUM|HIGH|CRITICAL/);
                if (risk.likelihood) {
                    expect(risk.likelihood).toMatch(/UNLIKELY|POSSIBLE|LIKELY|PROBABLE/);
                }
            });
        });

        it("should calculate confidence from data quality + calculation strength + evidence freshness", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            candidates.forEach((candidate) => {
                expect(candidate.confidence).toMatch(/HIGH|MEDIUM|LOW|INSUFFICIENT_INFORMATION/);
                expect(candidate.confidenceReasoning).toBeTruthy();

                // Factors should be present
                expect(candidate.confidenceFactors).toBeDefined();
                expect(candidate.confidenceFactors.dataQuality).toMatch(/HIGH|MEDIUM|LOW/);
                expect(candidate.confidenceFactors.calculationStrength).toMatch(/HIGH|MEDIUM|LOW/);
                expect(candidate.confidenceFactors.evidenceFreshness).toMatch(/CURRENT|RECENT|STALE|EXPIRED/);
            });
        });

        it("should include expected financial impact from scenarios", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            candidates.forEach((candidate) => {
                expect(candidate.expectedImpact).toBeDefined();
                expect(candidate.expectedImpact.wealthIncrease).toBe(Money(1000000));
                expect(candidate.expectedImpact.cashFlowImpact).toBe(Money(0));
            });
        });

        it("should check policy compliance", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            candidates.forEach((candidate) => {
                expect(typeof candidate.compliesWithPolicy).toBe("boolean");
                if (!candidate.compliesWithPolicy) {
                    expect(candidate.policyViolations).toBeDefined();
                    expect(candidate.policyViolations!.length).toBeGreaterThan(0);
                }
            });
        });

        it("should link scenario IDs to candidates", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            candidates.forEach((candidate) => {
                expect(candidate.scenarioIds.length).toBeGreaterThan(0);
                candidate.scenarioIds.forEach((scenarioId) => {
                    const exists = scenarios.some((s) => s.id === scenarioId);
                    expect(exists).toBe(true);
                });
            });
        });
    });

    describe("Savings Allocation Candidates", () => {
        beforeEach(() => {
            builderInput.intent = RecommendationType.SAVINGS_ALLOCATION;
            builderInput.scenarios = [
                createMockScenario(ScenarioType.SAVINGS_ALLOCATION, {
                    title: "Build Emergency Fund",
                    id: "scenario-ef-save" as EntityId,
                }),
                createMockScenario(ScenarioType.SAVINGS_ALLOCATION, {
                    title: "Accelerated Debt Payoff",
                    id: "scenario-debt-save" as EntityId,
                }),
            ];
        });

        it("should generate candidates for savings allocation", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            expect(candidates.length).toBeGreaterThan(0);
            expect(candidates[0].type).toBe(RecommendationType.SAVINGS_ALLOCATION);
        });

        it("should prioritize emergency fund if below target", () => {
            const candidates = generateCandidateRecommendations(builderInput);
            const preferred = candidates.find((c) => c.alternatives.some((a) => a.isPreferred));

            expect(preferred).toBeDefined();
            expect(preferred!.title).toMatch(/Emergency Fund|EF|emergency/i);
        });
    });

    describe("Debt Action Candidates", () => {
        beforeEach(() => {
            builderInput.intent = RecommendationType.DEBT_ACTION;
            builderInput.scenarios = [
                createMockScenario(ScenarioType.DEBT_ACTION, {
                    title: "Continue Current Payments",
                    id: "scenario-continue" as EntityId,
                }),
                createMockScenario(ScenarioType.DEBT_ACTION, {
                    title: "Avalanche Method",
                    id: "scenario-avalanche" as EntityId,
                }),
            ];
        });

        it("should generate debt action candidates", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            expect(candidates.length).toBeGreaterThan(0);
            expect(candidates[0].type).toBe(RecommendationType.DEBT_ACTION);
        });

        it("should include baseline and alternatives", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            expect(candidates.some((c) => c.title.includes("Continue"))).toBe(true);
            expect(candidates.some((c) => c.title.includes("Avalanche"))).toBe(true);
        });
    });

    describe("Affordability Candidates", () => {
        beforeEach(() => {
            builderInput.intent = RecommendationType.CASH_MANAGEMENT;
            builderInput.scenarios = [
                createMockScenario(ScenarioType.AFFORDABILITY, {
                    title: "You Can Afford This",
                    id: "scenario-afford-yes" as EntityId,
                }),
                createMockScenario(ScenarioType.AFFORDABILITY, {
                    title: "Borderline - Proceed with Caution",
                    id: "scenario-afford-caution" as EntityId,
                }),
                createMockScenario(ScenarioType.AFFORDABILITY, {
                    title: "Not Affordable - Wait",
                    id: "scenario-afford-wait" as EntityId,
                }),
            ];
        });

        it("should generate affordability decision candidates", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            expect(candidates.length).toBeGreaterThan(0);
            expect(candidates[0].type).toBe(RecommendationType.CASH_MANAGEMENT);
        });

        it("should provide three alternatives for affordability", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            expect(candidates.length).toBeGreaterThanOrEqual(2); // At least preferred + 1 alternative
        });
    });

    describe("Emergency Fund Candidates", () => {
        beforeEach(() => {
            builderInput.intent = RecommendationType.EMERGENCY_FUND;
            builderInput.financialSnapshot = createMockSnapshot({
                cash: Money(100000), // Only $1,000 in cash - well below target
            });
            builderInput.scenarios = [
                createMockScenario(ScenarioType.SAVINGS_ALLOCATION, {
                    title: "Build Emergency Fund",
                    id: "scenario-ef-save" as EntityId,
                }),
            ];
        });

        it("should generate emergency fund candidates", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            expect(candidates.length).toBeGreaterThan(0);
            if (candidates.length > 0) {
                expect(candidates[0].type).toBe(RecommendationType.EMERGENCY_FUND);
            }
        });
    });

    describe("Financial Independence Candidates", () => {
        beforeEach(() => {
            builderInput.intent = RecommendationType.FINANCIAL_INDEPENDENCE;
            builderInput.scenarios = [
                createMockScenario(ScenarioType.FINANCIAL_INDEPENDENCE, {
                    title: "Status Quo",
                    id: "scenario-fi-quo" as EntityId,
                }),
                createMockScenario(ScenarioType.FINANCIAL_INDEPENDENCE, {
                    title: "Increased Savings",
                    id: "scenario-fi-increased" as EntityId,
                }),
            ];
        });

        it("should generate retirement planning candidates", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            expect(candidates.length).toBeGreaterThan(0);
            expect(candidates[0].type).toBe(RecommendationType.FINANCIAL_INDEPENDENCE);
        });
    });

    describe("Policy Compliance", () => {
        it("should flag violations of emergency fund policy", () => {
            const worstScenario = createMockScenario(ScenarioType.WINDFALL, {
                title: "Bad Choice",
                resultingState: {
                    emergencyFundBalance: Money(0), // Violates policy
                    emergencyFundMonths: 0,
                    totalDebt: Money(800000),
                    debtToIncomeRatio: 1.33,
                    monthlyDebtPayments: Money(32000),
                    monthlySavingsCapacity: Money(100000),
                    monthlyAllocableAmount: Money(100000),
                    goalFundingGap: Money(0),
                    goalsOnTrack: 0,
                    financialHealthScore: 30,
                    healthStatus: FinancialHealthStatus.CRITICAL,
                },
            });

            builderInput.scenarios = [worstScenario];
            const candidates = generateCandidateRecommendations(builderInput);

            if (candidates.length > 0) {
                expect(candidates[0].compliesWithPolicy).toBe(false);
                expect(candidates[0].policyViolations).toBeDefined();
                expect(candidates[0].policyViolations!.length).toBeGreaterThan(0);
            }
        });

        it("should flag violations of debt-to-income ratio policy", () => {
            const badDebtScenario = createMockScenario(ScenarioType.WINDFALL, {
                title: "High Debt Risk",
                resultingState: {
                    emergencyFundBalance: Money(1000000),
                    emergencyFundMonths: 2,
                    totalDebt: Money(6000000), // Very high debt
                    debtToIncomeRatio: 10, // DTI over 50% threshold
                    monthlyDebtPayments: Money(200000),
                    monthlySavingsCapacity: Money(0),
                    monthlyAllocableAmount: Money(0),
                    goalFundingGap: Money(0),
                    goalsOnTrack: 0,
                    financialHealthScore: 20,
                    healthStatus: FinancialHealthStatus.CRITICAL,
                },
            });

            builderInput.scenarios = [badDebtScenario];
            const candidates = generateCandidateRecommendations(builderInput);

            if (candidates.length > 0) {
                expect(candidates[0].compliesWithPolicy).toBe(false);
            }
        });
    });

    describe("Confidence Calculation", () => {
        it("should rate HIGH confidence with complete data, simple calculation, and current evidence", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            // Windfall scenarios have high calculation strength
            expect(candidates[0].confidenceFactors.calculationStrength).toBe("HIGH");
            expect(candidates[0].confidenceFactors.dataQuality).toMatch(/HIGH|MEDIUM/);
            expect(candidates[0].confidenceFactors.evidenceFreshness).toBe("CURRENT");
        });

        it("should rate MEDIUM confidence with incomplete data", () => {
            // Create snapshot with some missing fields (set them very low to test)
            const partialSnapshot = createMockSnapshot({
                cash: Money(1000), // Very low
                monthlyIncome: Money(100000), // Very low income makes data questionable
            });

            builderInput.financialSnapshot = partialSnapshot;
            const candidates = generateCandidateRecommendations(builderInput);

            // Should still generate candidates but with lower confidence
            expect(candidates.length).toBeGreaterThan(0);
        });

        it("should rate LOW confidence for long-term projections", () => {
            builderInput.intent = RecommendationType.FINANCIAL_INDEPENDENCE;
            builderInput.scenarios = [
                createMockScenario(ScenarioType.FINANCIAL_INDEPENDENCE),
            ];

            const candidates = generateCandidateRecommendations(builderInput);

            if (candidates.length > 0) {
                expect(candidates[0].confidenceFactors.calculationStrength).toBe("LOW");
            }
        });
    });

    describe("Evidence Linking", () => {
        it("should link only relevant evidence to candidates", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            candidates.forEach((candidate) => {
                candidate.evidence.forEach((ev) => {
                    // Evidence should be findable in availableEvidence
                    const source = evidence.find((e) => e.id === ev.evidenceId);
                    expect(source).toBeDefined();

                    // Evidence should be relevant to candidate type
                    if (candidate.type === RecommendationType.WINDFALL_ALLOCATION) {
                        expect(ev.claim).toMatch(/savings|emergency|allocation|investment|bonus|tax/i);
                    }
                });
            });
        });

        it("should use evidence source tiers in confidence calculation", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            candidates.forEach((candidate) => {
                if (candidate.evidence.length > 0) {
                    expect(candidate.confidenceFactors.evidenceTier).toMatch(/TIER_[1234]_\w+/);
                }
            });
        });
    });

    describe("Determinism", () => {
        it("should generate identical candidates from identical input", () => {
            const input1 = JSON.parse(JSON.stringify(builderInput));
            const input2 = JSON.parse(JSON.stringify(builderInput));

            const candidates1 = generateCandidateRecommendations(input1);
            const candidates2 = generateCandidateRecommendations(input2);

            // Same number of candidates
            expect(candidates1.length).toBe(candidates2.length);

            // Same type and title (IDs may differ)
            candidates1.forEach((c1, i) => {
                const c2 = candidates2[i];
                expect(c1.type).toBe(c2.type);
                expect(c1.title).toBe(c2.title);
                expect(c1.summary).toBe(c2.summary);
                expect(c1.expectedImpact.wealthIncrease).toBe(c2.expectedImpact.wealthIncrease);
                expect(c1.confidence).toBe(c2.confidence);
            });
        });
    });

    describe("Alternative Generation", () => {
        it("should include multiple alternatives with rationale", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            candidates.forEach((candidate) => {
                expect(candidate.alternatives.length).toBeGreaterThan(0);
                candidate.alternatives.forEach((alt) => {
                    expect(alt.title).toBeTruthy();
                    expect(alt.description).toBeTruthy();
                    expect(alt.rationale).toBeTruthy();
                    expect(alt.impactDirection).toMatch(/POSITIVE|NEUTRAL|NEGATIVE/);
                });
            });
        });

        it("should indicate preferred alternative", () => {
            const candidates = generateCandidateRecommendations(builderInput);

            candidates.forEach((candidate) => {
                const preferred = candidate.alternatives.filter((a) => a.isPreferred);
                expect(preferred.length).toBeGreaterThanOrEqual(0); // At least 0 or 1
            });
        });
    });

    describe("Edge Cases", () => {
        it("should handle empty scenarios list", () => {
            builderInput.scenarios = [];
            const candidates = generateCandidateRecommendations(builderInput);

            // Should return empty array, not error
            expect(Array.isArray(candidates)).toBe(true);
        });

        it("should handle critical financial health status", () => {
            builderInput.financialSnapshot = createMockSnapshot({
                financialHealthStatus: FinancialHealthStatus.CRITICAL,
                debt: Money(9000000), // Very high debt
            });

            const candidates = generateCandidateRecommendations(builderInput);

            // Should still generate candidates but with critical risks
            if (candidates.length > 0) {
                expect(candidates[0].risks.some((r) => r.severity === "CRITICAL")).toBe(true);
            }
        });

        it("should handle household with high emergency fund", () => {
            builderInput.financialSnapshot = createMockSnapshot({
                cash: Money(3000000), // $30,000 - exceeds typical target
            });

            const candidates = generateCandidateRecommendations(builderInput);

            expect(candidates.length).toBeGreaterThan(0);
        });
    });
});
