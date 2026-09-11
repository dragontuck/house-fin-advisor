import { AdvisorWorkflow, ConfidenceLevel, EntityId, SourceAuthority, SourceTier } from "@house-fin/contracts";
import { determineResearchRequirement, performRequiredResearch } from "@house-fin/ai/recommendation-research";

describe("recommendation research requirements", () => {
    test("uses household calculations for a vacation affordability question", () => {
        const result = determineResearchRequirement(
            "Can we afford a $5,000 vacation?",
            AdvisorWorkflow.AFFORDABILITY
        );

        expect(result.level).toBe("NOT_REQUIRED");
        expect(result.queries).toEqual([]);
    });

    test("requires government research for a bonus question involving current tax rules", () => {
        const result = determineResearchRequirement(
            "What should we do with this $10,000 bonus given current tax rules?",
            AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION
        );

        expect(result.level).toBe("REQUIRED");
        expect(result.queries[0]).toMatchObject({
            topic: "TAX_RULES",
            preferredTiers: [SourceTier.TIER_1_GOVERNMENT],
        });
    });

    test("requires primary issuer research for a credit card decision", () => {
        const result = determineResearchRequirement(
            "Should we keep this credit card?",
            AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION
        );

        expect(result.level).toBe("REQUIRED");
        expect(result.queries[0]).toMatchObject({
            topic: "ISSUER_TERMS",
            preferredTiers: [SourceTier.TIER_2_PROVIDER],
        });
    });

    test("treats a general retirement contribution question as optionally researched", () => {
        const result = determineResearchRequirement(
            "Should we increase retirement contributions?",
            AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION
        );

        expect(result.level).toBe("OPTIONAL");
        expect(result.queries).toEqual([]);
    });

    test("requires research when retirement advice depends on current limits", () => {
        const result = determineResearchRequirement(
            "Should we increase 401(k) contributions given this year's limits?",
            AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION
        );

        expect(result.level).toBe("REQUIRED");
        expect(result.queries[0].topic).toBe("RETIREMENT_RULES");
        expect(result.queries[0].preferredTiers).toEqual([
            SourceTier.TIER_1_GOVERNMENT,
            SourceTier.TIER_2_PROVIDER,
        ]);
    });

    test("rejects verified evidence from the wrong source tier", async () => {
        const requirement = determineResearchRequirement(
            "Should we keep this credit card?",
            AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION
        );
        const result = await performRequiredResearch(requirement, {
            async research(query, context) {
                return {
                    claim: query.claim,
                    status: "VERIFIED",
                    results: [{
                        relevanceScore: 100,
                        evidence: {
                            id: "evidence-1" as EntityId,
                            householdId: context.householdId,
                            claim: "A media review lists the card benefits.",
                            source: {
                                name: "Financial blog",
                                type: "MEDIA",
                                tier: SourceTier.TIER_4_MEDIA,
                                authority: SourceAuthority.COMMERCIAL,
                            },
                            retrievalDate: new Date(),
                            freshness: "CURRENT",
                            confidence: ConfidenceLevel.MEDIUM,
                            usedIn: [],
                            verificationStatus: "VERIFIED",
                            createdAt: new Date(),
                        },
                    }],
                };
            },
        }, {
            correlationId: "correlation-1" as EntityId,
            householdId: "household-1" as EntityId,
            memberId: "member-1" as EntityId,
        });

        expect(result).toEqual({ status: "UNAVAILABLE", evidence: [] });
    });
});
