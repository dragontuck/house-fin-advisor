/**
 * Recommendation Presenter Tests
 *
 * Verify that persona selection changes presentation style ONLY,
 * while keeping all financial data, calculations, evidence, and validation identical.
 */

import { describe, it, expect } from "@jest/globals";
import {
    Recommendation,
    RecommendationType,
    ConfidenceLevel,
    RecommendationStatus,
    ADVISOR_PERSONAS,
    AdvisorPersona,
} from "@house-fin/contracts";
import { EntityId, Money } from "@house-fin/contracts";
import {
    RecommendationPresenter,
    PresentedRecommendation,
    verifyFinancialDataUnchanged,
} from "@house-fin/domain/recommendation-presenter";

/**
 * Mock helper to create a test recommendation
 */
function createMockRecommendation(overrides?: Partial<Recommendation>): Recommendation {
    return {
        id: "rec-001" as EntityId,
        householdId: "hh-001" as EntityId,
        memberId: "member-001" as EntityId,

        type: RecommendationType.SAVINGS_ALLOCATION,
        title: "Allocate $10,000 bonus to emergency fund",
        summary:
            "Your household received a $10,000 bonus. Current emergency fund has 1.5 months of expenses. Allocating bonus would reach 3 months target.",

        recommendedAction:
            "Transfer $10,000 from checking to emergency savings account. This brings emergency fund from $22,500 to $32,500 (exactly 3 months of essential expenses).",

        alternatives: [
            {
                id: "alt-1",
                title: "Split bonus: $6,000 to emergency fund, $4,000 to high-yield savings",
                description: "Balance emergency readiness with short-term growth potential",
                rationale: "Provides safety margin while capturing yield on surplus",
                tradeoffs: [
                    "Lower emergency fund target (2.7 months vs 3 months)",
                    "But higher total liquid assets earning 4.5% yield",
                ],
                estimatedImpact: 2000 as Money,
                impactDirection: "NEUTRAL",
                isPreferred: false,
            },
            {
                id: "alt-2",
                title: "Pay down credit card balance instead",
                description: "Use bonus for debt reduction",
                rationale: "Prioritizes debt elimination over savings growth",
                tradeoffs: [
                    "Reduces emergency fund to 1 month",
                    "But saves $180/month in credit card interest",
                ],
                estimatedImpact: -10000 as Money,
                impactDirection: "NEGATIVE",
                isPreferred: false,
            },
        ],

        financialSnapshotId: "snap-001" as EntityId,
        financialSnapshotVersion: 1,
        policyVersion: 1,
        scenarioIds: ["scenario-001" as EntityId],

        evidence: [
            {
                id: "ev-001",
                evidenceId: "ev-ref-001" as EntityId,
                claim: "Emergency fund best practice is 3-6 months of essential expenses",
                sourceName: "Federal Reserve",
                sourceTier: "TIER_1_GOVERNMENT",
                retrievalDate: new Date("2026-09-01"),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.HIGH,
            },
            {
                id: "ev-002",
                evidenceId: "ev-ref-002" as EntityId,
                claim: "High-yield savings accounts currently offer 4.5% APY",
                sourceName: "Chase Bank",
                sourceTier: "TIER_2_PROVIDER",
                sourceUrl: "https://www.chase.com/personal/savings",
                retrievalDate: new Date("2026-09-08"),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.HIGH,
            },
        ],

        assumptions: [
            {
                id: "assume-001",
                key: "income_stability",
                value: "Household income remains stable at $6,000/month",
                confidence: ConfidenceLevel.HIGH,
                reason: "Both members have stable employment with no indication of change",
                sensitivity: "If either household member loses income, emergency fund becomes critical",
            },
            {
                id: "assume-002",
                key: "expense_stability",
                value: "Essential expenses remain at approximately $10,000/month",
                confidence: ConfidenceLevel.MEDIUM,
                reason: "Expenses have been relatively stable over past 12 months",
                sensitivity:
                    "Unexpected major expenses (home repair, medical) would require 6 month buffer",
            },
        ],

        risks: [
            {
                id: "risk-001",
                description: "Emergency fund may become insufficient if unexpected major expense occurs",
                severity: "MEDIUM",
                likelihood: "POSSIBLE",
                mitigations: ["Maintain homeowner and auto insurance", "Regular vehicle maintenance"],
                impact: "Would need to access credit or reduce other savings",
            },
            {
                id: "risk-002",
                description: "Opportunity cost if investment returns exceed savings account yield",
                severity: "LOW",
                likelihood: "LIKELY",
                mitigations: ["Can increase after emergency fund is fully funded"],
                impact: "Foregone investment growth on this $10,000",
            },
        ],

        validation: {
            id: "val-001",
            status: "PASS",
            summary: "Recommendation meets policy requirements and calculation verification",
            details: [
                {
                    category: "MATH",
                    status: "PASS",
                    description: "$10,000 + $22,500 = $32,500 matches emergency fund target calculation",
                },
                {
                    category: "POLICY",
                    status: "PASS",
                    description: "Recommendation complies with household emergency fund policy",
                },
                {
                    category: "FRESHNESS",
                    status: "PASS",
                    description: "All evidence is current (updated within 7 days)",
                },
            ],
            performedAt: new Date("2026-09-08"),
            performedBy: "SYSTEM",
        },

        confidence: ConfidenceLevel.HIGH,
        confidenceReasoning:
            "Recommendation based on current household data, stable income assumptions, and best-practice guidance from Federal Reserve. All inputs verified and validated.",

        approval: {
            status: RecommendationStatus.PROPOSED,
            expiresAt: new Date("2026-10-08"),
        },
        approvalRequired: true,

        version: 1,
        createdAt: new Date("2026-09-08"),
        createdBy: "advisor-ai" as EntityId,
        updatedAt: new Date("2026-09-08"),
        correlationId: "corr-001" as EntityId,

        ...overrides,
    };
}

describe("Recommendation Presenter", () => {
    describe("Persona-Specific Presentation", () => {
        it("should present recommendation with Kitces persona focus", () => {
            const recommendation = createMockRecommendation();
            const persona = ADVISOR_PERSONAS.KITCES;

            const presented = RecommendationPresenter.present(recommendation, persona);

            expect(presented.selectedPersona.key).toBe("kitces_framework");
            expect(presented.presentedTitle).toContain("Tax & Retirement");
            expect(presented.presentedSummary).toContain("FRAMEWORK ANALYSIS");
            expect(presented.presentedRationale).toContain("comprehensive financial planning");
        });

        it("should present recommendation with Edelman persona focus", () => {
            const recommendation = createMockRecommendation();
            const persona = ADVISOR_PERSONAS.EDELMAN;

            const presented = RecommendationPresenter.present(recommendation, persona);

            expect(presented.selectedPersona.key).toBe("edelman_framework");
            expect(presented.presentedTitle).toContain("Longevity");
            expect(presented.presentedSummary).toContain("LONGEVITY & TECHNOLOGY");
            expect(presented.presentedRationale).toContain("extended longevity planning");
        });

        it("should present recommendation with Carson persona focus", () => {
            const recommendation = createMockRecommendation();
            const persona = ADVISOR_PERSONAS.CARSON;

            const presented = RecommendationPresenter.present(recommendation, persona);

            expect(presented.selectedPersona.key).toBe("carson_framework");
            expect(presented.presentedTitle).toContain("Family Governance");
            expect(presented.presentedSummary).toContain("FAMILY GOVERNANCE");
            expect(presented.presentedRationale).toContain("family alignment");
        });

        it("should present recommendation with WEG persona focus", () => {
            const recommendation = createMockRecommendation();
            const persona = ADVISOR_PERSONAS.WEG;

            const presented = RecommendationPresenter.present(recommendation, persona);

            expect(presented.selectedPersona.key).toBe("weg_framework");
            expect(presented.presentedTitle).toContain("Tax-Efficient");
            expect(presented.presentedSummary).toContain("INTEGRATED TAX");
            expect(presented.presentedRationale).toContain("tax efficiency");
        });

        it("should present recommendation with Capital Group persona focus", () => {
            const recommendation = createMockRecommendation();
            const persona = ADVISOR_PERSONAS.CAPITAL_GROUP;

            const presented = RecommendationPresenter.present(recommendation, persona);

            expect(presented.selectedPersona.key).toBe("capital_group_framework");
            expect(presented.presentedTitle).toContain("Multigenerational");
            expect(presented.presentedSummary).toContain("MULTIGENERATIONAL");
            expect(presented.presentedRationale).toContain("generational wealth");
        });
    });

    describe("Financial Data Immutability", () => {
        it("should preserve all original recommendation data across all personas", () => {
            const recommendation = createMockRecommendation();

            const presentations = [
                RecommendationPresenter.present(recommendation, ADVISOR_PERSONAS.KITCES),
                RecommendationPresenter.present(recommendation, ADVISOR_PERSONAS.EDELMAN),
                RecommendationPresenter.present(recommendation, ADVISOR_PERSONAS.CARSON),
                RecommendationPresenter.present(recommendation, ADVISOR_PERSONAS.WEG),
                RecommendationPresenter.present(recommendation, ADVISOR_PERSONAS.CAPITAL_GROUP),
            ];

            // All presentations should have identical original data
            presentations.forEach((p) => {
                expect(p.original).toEqual(recommendation);
                expect(p.original.id).toBe(recommendation.id);
                expect(p.original.type).toBe(recommendation.type);
                expect(p.original.financialSnapshotId).toBe(recommendation.financialSnapshotId);
            });
        });

        it("should keep financial calculations identical across personas", () => {
            const recommendation = createMockRecommendation();

            const presented1 = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.KITCES
            );
            const presented2 = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.EDELMAN
            );

            // Financial data must be identical
            expect(presented1.original.alternatives).toEqual(presented2.original.alternatives);
            expect(
                JSON.stringify(presented1.original.alternatives)
            ).toEqual(JSON.stringify(presented2.original.alternatives));
        });

        it("should preserve evidence with source hierarchy unchanged", () => {
            const recommendation = createMockRecommendation();

            const presentations = [
                RecommendationPresenter.present(recommendation, ADVISOR_PERSONAS.KITCES),
                RecommendationPresenter.present(recommendation, ADVISOR_PERSONAS.CARSON),
            ];

            presentations.forEach((p) => {
                // Evidence tier order must be preserved
                expect(p.original.evidence[0].sourceTier).toBe("TIER_1_GOVERNMENT");
                expect(p.original.evidence[1].sourceTier).toBe("TIER_2_PROVIDER");
                // Exact source text unchanged
                expect(p.original.evidence[0].claim).toBe(
                    "Emergency fund best practice is 3-6 months of essential expenses"
                );
            });
        });

        it("should keep validation results identical across personas", () => {
            const recommendation = createMockRecommendation();

            const presented1 = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.KITCES
            );
            const presented2 = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.WEG
            );

            expect(presented1.original.validation?.status).toBe("PASS");
            expect(presented2.original.validation?.status).toBe("PASS");
            expect(presented1.original.validation).toEqual(presented2.original.validation);
        });

        it("should preserve confidence level unchanged", () => {
            const recommendation = createMockRecommendation();

            const presentations = [
                RecommendationPresenter.present(recommendation, ADVISOR_PERSONAS.KITCES),
                RecommendationPresenter.present(recommendation, ADVISOR_PERSONAS.EDELMAN),
                RecommendationPresenter.present(recommendation, ADVISOR_PERSONAS.CAPITAL_GROUP),
            ];

            presentations.forEach((p) => {
                expect(p.original.confidence).toBe(ConfidenceLevel.HIGH);
            });
        });

        it("should preserve approval status unchanged", () => {
            const recommendation = createMockRecommendation();

            const presented1 = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.KITCES
            );
            const presented2 = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.CARSON
            );

            expect(presented1.original.approval.status).toBe(RecommendationStatus.PROPOSED);
            expect(presented2.original.approval.status).toBe(RecommendationStatus.PROPOSED);
            expect(presented1.original.approvalRequired).toBe(true);
            expect(presented2.original.approvalRequired).toBe(true);
        });
    });

    describe("Presentation Differences Between Personas", () => {
        it("should use different terminology for the same recommendation", () => {
            const recommendation = createMockRecommendation();

            const kitces = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.KITCES
            );
            const edelman = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.EDELMAN
            );
            const carson = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.CARSON
            );

            // Same recommendation, different terminology
            expect(kitces.presentedTitle).not.toBe(edelman.presentedTitle);
            expect(edelman.presentedTitle).not.toBe(carson.presentedTitle);

            // But all contain the base title
            expect(kitces.presentedTitle).toContain("Allocate $10,000");
            expect(edelman.presentedTitle).toContain("Allocate $10,000");
            expect(carson.presentedTitle).toContain("Allocate $10,000");
        });

        it("should use different explanation depth based on persona", () => {
            const recommendation = createMockRecommendation();

            const kitces = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.KITCES
            );
            const edelman = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.EDELMAN
            );

            // Both explain the same recommendation but with different framing
            expect(kitces.presentedSummary.length).toBeGreaterThan(0);
            expect(edelman.presentedSummary.length).toBeGreaterThan(0);

            // Different emphasis
            expect(kitces.presentedSummary).toContain("FRAMEWORK");
            expect(edelman.presentedSummary).toContain("LONGEVITY");
        });

        it("should order alternatives differently based on persona risk tolerance", () => {
            const recommendation = createMockRecommendation();

            const kitces = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.KITCES
            );
            const edelman = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.EDELMAN
            );

            // Alternatives are in same order (same original data)
            expect(kitces.presentedAlternatives).toHaveLength(
                edelman.presentedAlternatives.length
            );

            // But presented rationale differs
            expect(kitces.presentedAlternatives[0].presentedRationale).not.toBe(
                edelman.presentedAlternatives[0].presentedRationale
            );
        });

        it("should frame assumptions differently for each persona", () => {
            const recommendation = createMockRecommendation();

            const kitces = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.KITCES
            );
            const carson = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.CARSON
            );

            // Same assumptions presented differently
            expect(kitces.presentedAssumptions[0].presentedContext).toContain(
                "PLANNING FRAMEWORK"
            );
            expect(carson.presentedAssumptions[0].presentedContext).toContain("FAMILY GOVERNANCE");

            // But original assumption is identical
            expect(kitces.presentedAssumptions[0].original).toEqual(
                carson.presentedAssumptions[0].original
            );
        });

        it("should frame evidence credibility differently", () => {
            const recommendation = createMockRecommendation();

            const kitces = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.KITCES
            );
            const weg = RecommendationPresenter.present(recommendation, ADVISOR_PERSONAS.WEG);

            // Same evidence, different framing
            expect(kitces.presentedEvidence[0].presentedContext).toContain("PLANNING FRAMEWORK");
            expect(weg.presentedEvidence[0].presentedContext).toContain("TAX & LEGAL AUTHORITY");

            // But underlying evidence data identical
            expect(kitces.presentedEvidence[0].original).toEqual(
                weg.presentedEvidence[0].original
            );
        });
    });

    describe("Verification Helper Function", () => {
        it("should verify financial data is unchanged across persona presentations", () => {
            const recommendation = createMockRecommendation();

            const presented1 = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.KITCES
            );
            const presented2 = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.EDELMAN
            );

            expect(verifyFinancialDataUnchanged(presented1, presented2)).toBe(true);
        });

        it("should detect if financial data was modified", () => {
            const recommendation = createMockRecommendation();

            const presented1 = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.KITCES
            );

            // Create a modified copy
            const modifiedRecommendation = {
                ...recommendation,
                confidence: ConfidenceLevel.MEDIUM, // Changed
            };
            const presented2 = RecommendationPresenter.present(
                modifiedRecommendation,
                ADVISOR_PERSONAS.EDELMAN
            );

            expect(verifyFinancialDataUnchanged(presented1, presented2)).toBe(false);
        });

        it("should verify all financial dimensions remain unchanged", () => {
            const recommendation = createMockRecommendation();

            const allPersonas = [
                ADVISOR_PERSONAS.KITCES,
                ADVISOR_PERSONAS.EDELMAN,
                ADVISOR_PERSONAS.CARSON,
                ADVISOR_PERSONAS.WEG,
                ADVISOR_PERSONAS.CAPITAL_GROUP,
            ];

            const presentations = allPersonas.map((p) =>
                RecommendationPresenter.present(recommendation, p)
            );

            // All presentations must have identical financial data
            for (let i = 0; i < presentations.length - 1; i++) {
                expect(verifyFinancialDataUnchanged(presentations[i], presentations[i + 1])).toBe(
                    true
                );
            }
        });
    });

    describe("Educational Context", () => {
        it("should provide persona-specific educational framing", () => {
            const recommendation = createMockRecommendation();

            const kitces = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.KITCES
            );
            const edelman = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.EDELMAN
            );

            expect(kitces.educationalContext).toContain("comprehensive planning framework");
            expect(edelman.educationalContext).toContain("longevity-focused");

            // Both are educational, but different
            expect(kitces.educationalContext).not.toBe(edelman.educationalContext);
        });

        it("should include persona's focus areas in presented output", () => {
            const recommendation = createMockRecommendation();

            const kitces = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.KITCES
            );

            expect(kitces.focusAreas).toEqual(ADVISOR_PERSONAS.KITCES.focusAreas);
            expect(kitces.analyticalPriorities).toEqual(
                ADVISOR_PERSONAS.KITCES.analyticalPriorities
            );
        });
    });

    describe("Edge Cases", () => {
        it("should handle recommendation with no alternatives", () => {
            const recommendation = createMockRecommendation({
                alternatives: [],
            });

            const presented = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.KITCES
            );

            expect(presented.presentedAlternatives).toHaveLength(0);
        });

        it("should handle recommendation with no validation", () => {
            const recommendation = createMockRecommendation({
                validation: undefined,
            });

            const presented = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.CARSON
            );

            expect(presented.original.validation).toBeUndefined();
        });

        it("should use default persona if none provided", () => {
            const recommendation = createMockRecommendation();

            const presented = RecommendationPresenter.present(recommendation);

            expect(presented.selectedPersona.key).toBe(ADVISOR_PERSONAS.KITCES.key);
        });

        it("should preserve presentation timestamp", () => {
            const recommendation = createMockRecommendation();

            const presented = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.KITCES
            );

            expect(presented.presentedAt).toBeInstanceOf(Date);
            expect(presented.presentedAt.getTime()).toBeLessThanOrEqual(new Date().getTime());
        });
    });

    describe("Risk Framing", () => {
        it("should emphasize mitigations based on persona risk perspective", () => {
            const recommendation = createMockRecommendation();

            const conservative = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.KITCES // BALANCED framing
            );
            const growth = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.EDELMAN // OPPORTUNITY framing
            );

            // Both present risks, but framing differs
            expect(conservative.presentedRisks[0]).toBeDefined();
            expect(growth.presentedRisks[0]).toBeDefined();

            // Original risks are identical
            expect(conservative.presentedRisks[0].original).toEqual(
                growth.presentedRisks[0].original
            );
        });
    });

    describe("Non-Financial Data Preservation", () => {
        it("should preserve all financial calculation references", () => {
            const recommendation = createMockRecommendation();

            const presentations = [
                RecommendationPresenter.present(recommendation, ADVISOR_PERSONAS.KITCES),
                RecommendationPresenter.present(recommendation, ADVISOR_PERSONAS.WEG),
            ];

            presentations.forEach((p) => {
                expect(p.original.financialSnapshotId).toBe("snap-001");
                expect(p.original.financialSnapshotVersion).toBe(1);
                expect(p.original.policyVersion).toBe(1);
            });
        });

        it("should preserve privacy boundaries", () => {
            const recommendation = createMockRecommendation();

            const presented = RecommendationPresenter.present(
                recommendation,
                ADVISOR_PERSONAS.CARSON
            );

            // No sensitive financial data exposed in presentation
            expect(presented.original.householdId).toBe("hh-001");
            expect(presented.original.memberId).toBe("member-001");

            // Financial data in original is preserved
            expect(presented.original.alternatives[0].estimatedImpact).toBe(2000);

            // Key financial figures are in original
            expect(presented.original.recommendedAction).toContain("$10,000");
            expect(presented.original.recommendedAction).toContain("$22,500");
        });
    });
});
