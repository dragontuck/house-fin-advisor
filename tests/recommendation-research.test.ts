import { AdvisorWorkflow, ConfidenceLevel, EntityId, SourceAuthority, SourceTier } from "@house-fin/contracts";
import { determineResearchRequirement, performRequiredResearch, detectCurrentFactRequirement } from "@house-fin/ai/recommendation-research";

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

describe("detectCurrentFactRequirement", () => {
    describe("Credit card decisions", () => {
        test("detects keep/close/cancel credit card questions", () => {
            expect(detectCurrentFactRequirement("Should I keep my Amex?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("Is it time to close this Visa card?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("Should I cancel my Chase card?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("Should I keep my credit card?")).toBe("CURRENT_FACT_REQUIRED");
        });

        test("detects card terms and benefits questions", () => {
            expect(detectCurrentFactRequirement("What's the current APR on my credit card?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("Does this card have annual fees?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("What rewards does my card offer today?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("Is there a sign-up bonus for this card?")).toBe("CURRENT_FACT_REQUIRED");
        });

        test("does not flag generic card questions without context", () => {
            expect(detectCurrentFactRequirement("I have a credit card")).toBe("NOT_REQUIRED");
            expect(detectCurrentFactRequirement("Tell me about credit cards")).toBe("NOT_REQUIRED");
        });
    });

    describe("Tax-related questions", () => {
        test("detects current year tax deduction questions", () => {
            expect(detectCurrentFactRequirement("What can I deduct in 2024?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("What's the current standard deduction?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("Can I itemize deductions this year?")).toBe("CURRENT_FACT_REQUIRED");
        });

        test("detects tax rule inquiries", () => {
            expect(detectCurrentFactRequirement("What are the new IRS rules for 2024?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("What are the current tax withholding rules?")).toBe("CURRENT_FACT_REQUIRED");
        });

        test("does not flag tax questions without current year reference", () => {
            expect(detectCurrentFactRequirement("How do tax deductions work?")).toBe("NOT_REQUIRED");
            expect(detectCurrentFactRequirement("What are deductions?")).toBe("NOT_REQUIRED");
        });
    });

    describe("Retirement contribution limits", () => {
        test("detects current year 401k/IRA contribution limit questions", () => {
            expect(detectCurrentFactRequirement("Can I contribute $10,000 to my 401k this year?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("What's the 2024 IRA contribution limit?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("What's the current Roth IRA limit?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("What's the current HSA limit?")).toBe("CURRENT_FACT_REQUIRED");
        });

        test("detects retirement rule inquiries", () => {
            expect(detectCurrentFactRequirement("Are there new 401k rules for 2025?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("What's the current 403b match?")).toBe("CURRENT_FACT_REQUIRED");
        });

        test("does not flag retirement questions without limits or current year reference", () => {
            expect(detectCurrentFactRequirement("Should I contribute to retirement?")).toBe("NOT_REQUIRED");
            expect(detectCurrentFactRequirement("How do 401k plans work?")).toBe("NOT_REQUIRED");
        });
    });

    describe("Savings and loan rate questions", () => {
        test("detects current savings rate inquiries", () => {
            expect(detectCurrentFactRequirement("What's the current CD rate?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("What's today's money market rate?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("What's the current savings rate available?")).toBe("CURRENT_FACT_REQUIRED");
        });

        test("detects loan rate questions", () => {
            expect(detectCurrentFactRequirement("What are current mortgage rates?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("Should I refinance with current rates?")).toBe("CURRENT_FACT_REQUIRED");
        });

        test("does not flag rate questions without current context", () => {
            expect(detectCurrentFactRequirement("How do interest rates work?")).toBe("NOT_REQUIRED");
            expect(detectCurrentFactRequirement("Tell me about savings accounts")).toBe("NOT_REQUIRED");
            // Without explicit "current/today" context, can determine with household data
            expect(detectCurrentFactRequirement("Should I move my savings to a high-yield account?")).toBe("NOT_REQUIRED");
        });
    });

    describe("Federal and regulatory questions", () => {
        test("detects FDIC insurance inquiries", () => {
            expect(detectCurrentFactRequirement("What's the current FDIC insurance limit?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("Am I fully insured today?")).toBe("CURRENT_FACT_REQUIRED");
        });

        test("detects Social Security questions", () => {
            expect(detectCurrentFactRequirement("When can I claim Social Security?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("What's my full retirement age?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("What are my estimated benefits?")).toBe("CURRENT_FACT_REQUIRED");
        });
    });

    describe("Edge cases and variations", () => {
        test("handles multiple triggers in same message", () => {
            expect(detectCurrentFactRequirement("Should I close my Amex and what's the current standard deduction for 2024?"))
                .toBe("CURRENT_FACT_REQUIRED");
        });

        test("is case-insensitive", () => {
            expect(detectCurrentFactRequirement("SHOULD I KEEP MY AMEX?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("What's the CURRENT 401k LIMIT?")).toBe("CURRENT_FACT_REQUIRED");
        });

        test("handles questions with mixed language", () => {
            // With explicit current year indicator
            expect(detectCurrentFactRequirement("Should I keep my card in 2024?")).toBe("CURRENT_FACT_REQUIRED");
            expect(detectCurrentFactRequirement("Can I really deduct this for taxes?")).toBe("NOT_REQUIRED"); // No current year ref
            expect(detectCurrentFactRequirement("Can I really deduct this for current taxes?")).toBe("CURRENT_FACT_REQUIRED"); // With current
        });

        test("returns NOT_REQUIRED for general financial advice", () => {
            expect(detectCurrentFactRequirement("How should I budget my money?")).toBe("NOT_REQUIRED");
            expect(detectCurrentFactRequirement("What's a good emergency fund size?")).toBe("NOT_REQUIRED");
            expect(detectCurrentFactRequirement("Should we pay off debt or invest?")).toBe("NOT_REQUIRED");
        });
    });
});
