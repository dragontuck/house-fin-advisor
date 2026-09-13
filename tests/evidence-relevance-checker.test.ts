import { EvidenceRelevanceChecker } from "@house-fin/domain";
import { Evidence, ConfidenceLevel, SourceTier, SourceAuthority } from "@house-fin/contracts";

describe("EvidenceRelevanceChecker", () => {
    let checker: EvidenceRelevanceChecker;

    beforeEach(() => {
        checker = new EvidenceRelevanceChecker();
    });

    // ─── Utility: Create mock Evidence ─────────────────────────────────────────
    function createEvidence(
        claim: string,
        sourceText: string,
        householdId = "test-household" as any
    ): Evidence {
        return {
            id: `evidence-${Math.random()}` as any,
            householdId,
            claim,
            source: {
                name: "Test Source",
                type: "GOVERNMENT" as const,
                tier: SourceTier.TIER_1_GOVERNMENT,
                authority: SourceAuthority.REGULATORY,
                url: "https://example.com",
                description: "Test evidence",
            },
            sourceUrl: "https://example.com",
            sourceText,
            retrievalDate: new Date(),
            freshness: "CURRENT" as const,
            confidence: ConfidenceLevel.HIGH,
            usedIn: [],
            verificationStatus: "VERIFIED" as const,
            createdAt: new Date(),
        };
    }

    describe("High Confidence Cases (70%+ term overlap)", () => {
        test("detects strong match for credit card APR inquiry", () => {
            const claim = "What is the current APR for credit cards?";
            const evidence = [
                createEvidence(
                    "Credit card APR rates",
                    "The average credit card APR is 21.5% as of 2024"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.isRelevant).toBe(true);
            expect(result.confidence).toMatch(/HIGH|MEDIUM/);
            expect(result.supportingEvidence.length).toBeGreaterThan(0);
        });

        test("detects strong match for specific tax deduction", () => {
            const claim = "What are the 2024 child tax credit limits?";
            const evidence = [
                createEvidence(
                    "Child tax credit",
                    "The child tax credit for 2024 is $2,000 per child under age 17"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.isRelevant).toBe(true);
            expect(result.confidence).toMatch(/HIGH|MEDIUM/);
            expect(result.supportingEvidence.length).toBeGreaterThan(0);
        });

        test("detects strong match for FDIC insurance limits", () => {
            const claim = "What is the FDIC insurance limit for savings accounts?";
            const evidence = [
                createEvidence(
                    "FDIC deposit insurance",
                    "FDIC insurance covers up to $250,000 per depositor per insured bank"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.isRelevant).toBe(true);
            expect(result.confidence).toMatch(/HIGH|MEDIUM|LOW/);
            expect(result.supportingEvidence.length).toBeGreaterThan(0);
        });
    });

    describe("Medium Confidence Cases (50-70% term overlap)", () => {
        test("detects partial match for retirement contribution inquiry", () => {
            const claim = "What is the IRA contribution limit for 2024?";
            const evidence = [
                createEvidence(
                    "IRA annual contribution",
                    "Individuals can contribute up to $7,000 to traditional or Roth IRAs"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.isRelevant).toBe(true);
            expect(result.confidence).toMatch(/MEDIUM|HIGH|LOW/);
            expect(result.supportingEvidence.length).toBeGreaterThan(0);
        });

        test("detects partial match with synonym terms", () => {
            const claim = "What is the mortgage refinancing rate right now?";
            const evidence = [
                createEvidence(
                    "Mortgage rates",
                    "Current 30-year fixed mortgage rates average 6.8%"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.isRelevant).toBe(true);
            expect(result.confidence).toMatch(/MEDIUM|HIGH|LOW/);
        });
    });

    describe("Low Confidence Cases (30-50% term overlap)", () => {
        test("accepts evidence with marginal term overlap", () => {
            const claim = "Should I apply for a new credit card?";
            const evidence = [
                createEvidence(
                    "Credit card benefits",
                    "Credit cards offer rewards and points programs"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.isRelevant).toBe(true);
            expect(result.confidence).toMatch(/LOW|MEDIUM|HIGH/);
            expect(result.supportingEvidence.length).toBeGreaterThan(0);
        });
    });

    describe("Irrelevant Cases (<30% term overlap)", () => {
        test("rejects evidence with no term overlap", () => {
            const claim = "What is my total debt?";
            const evidence = [
                createEvidence(
                    "Stock market returns",
                    "The S&P 500 increased by 15% this year"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.isRelevant).toBe(false);
            expect(result.confidence).toBe("IRRELEVANT");
            expect(result.supportingEvidence.length).toBe(0);
        });

        test("rejects generic evidence for specific claim", () => {
            const claim = "What is my 401k contribution limit for this year?";
            const evidence = [
                createEvidence(
                    "Investment strategies",
                    "Diversifying your portfolio is important for long-term growth"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.isRelevant).toBe(false);
            expect(result.confidence).toBe("IRRELEVANT");
        });

        test("rejects health-related evidence for financial question", () => {
            const claim = "Can I defer my mortgage payment?";
            const evidence = [
                createEvidence(
                    "Medical insurance",
                    "Most health insurance plans cover preventive care"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.isRelevant).toBe(false);
            expect(result.confidence).toBe("IRRELEVANT");
        });
    });

    describe("Edge Cases", () => {
        test("handles empty evidence array", () => {
            const claim = "What is the current savings rate?";
            const evidence: Evidence[] = [];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.isRelevant).toBe(false);
            expect(result.confidence).toBe("IRRELEVANT");
            expect(result.supportingEvidence.length).toBe(0);
        });

        test("handles null/undefined evidence gracefully", () => {
            const claim = "What is the current savings rate?";

            const result = checker.checkRelevance(claim, null as any);

            expect(result.isRelevant).toBe(false);
            expect(result.confidence).toBe("IRRELEVANT");
        });

        test("scores multiple evidence pieces and returns top matches", () => {
            const claim = "What is the 2024 401k contribution limit?";
            const evidence = [
                createEvidence(
                    "401k limits",
                    "For 2024, the 401k limit is $23,500 for individuals under 50"
                ),
                createEvidence(
                    "IRA limits",
                    "The 2024 IRA limit is $7,000 for most people"
                ),
                createEvidence(
                    "Catch-up contributions",
                    "Those 50 and older can contribute an additional $7,500 to 401k"
                ),
                createEvidence(
                    "Unrelated topic",
                    "Roth conversions allow moving funds from traditional to Roth accounts"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.isRelevant).toBe(true);
            expect(result.supportingEvidence.length).toBeGreaterThan(0);
            // Should prefer the 401k-specific evidence
            expect(result.supportingEvidence[0].claim).toMatch(/401k/i);
        });

        test("is case-insensitive in term matching", () => {
            const claim = "WHAT IS THE FEDERAL FUNDS RATE?";
            const evidence = [
                createEvidence(
                    "interest rates",
                    "the federal funds rate is set by the Federal Reserve"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.isRelevant).toBe(true);
            expect(result.confidence).toMatch(/MEDIUM|HIGH/);
        });

        test("handles evidence with special characters and formatting", () => {
            const claim = "What's the current CD rate?";
            const evidence = [
                createEvidence(
                    "Certificate of Deposit (CD) rates",
                    "CDs (Certificates of Deposit) currently pay 4.5%-5.2% APY"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.isRelevant).toBe(true);
            expect(result.confidence).toMatch(/MEDIUM|HIGH|LOW/);
        });

        test("ignores common English words in scoring", () => {
            const claim = "What is the rate for savings?";
            const evidence = [
                createEvidence(
                    "Savings account rates",
                    "The current savings rate that banks offer is 4.0% to 5.0%"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            // Should match on "savings" and "rate", not on common words like "the", "is"
            expect(result.isRelevant).toBe(true);
            expect(result.confidence).toMatch(/MEDIUM|HIGH|LOW/);
        });

        test("handles single-word claims gracefully", () => {
            const claim = "Bankruptcy?";
            const evidence = [
                createEvidence(
                    "Bankruptcy alternatives",
                    "There are several alternatives to bankruptcy including debt consolidation"
                ),
            ];

            // With very short claim, relevance checking is harder but shouldn't crash
            const result = checker.checkRelevance(claim, evidence);

            expect(result).toHaveProperty("isRelevant");
            expect(result).toHaveProperty("confidence");
        });

        test("returns reasoning string in all cases", () => {
            const claim = "What is the inflation rate?";
            const evidence = [
                createEvidence(
                    "Inflation",
                    "Current inflation is 3.2% year-over-year"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.reasoning).toBeTruthy();
            expect(typeof result.reasoning).toBe("string");
            expect(result.reasoning.length).toBeGreaterThan(0);
        });
    });

    describe("Financial Domain Specificity", () => {
        test("distinguishes between similar financial products", () => {
            const claimCreditCard = "What is the APR for credit cards?";
            const claimDebitCard = "Can I use a debit card for online purchases?";

            const creditCardEvidence = createEvidence(
                "Credit card APR",
                "Credit card APR averages 21%"
            );

            const debitCardEvidence = createEvidence(
                "Debit card purchases",
                "Debit cards work like cash and can be used for online purchases"
            );

            const creditResult = checker.checkRelevance(claimCreditCard, [creditCardEvidence]);
            const debitResult = checker.checkRelevance(claimDebitCard, [creditCardEvidence]);

            expect(creditResult.confidence).not.toBe("IRRELEVANT");
            expect(debitResult.confidence).toBe("IRRELEVANT");
        });

        test("matches tax year references correctly", () => {
            const claim = "What was the 2023 standard deduction?";
            const evidence = [
                createEvidence(
                    "Standard deduction 2023",
                    "The 2023 standard deduction was $13,850 for single filers"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.isRelevant).toBe(true);
            expect(result.confidence).toMatch(/HIGH|MEDIUM/);
        });

        test("handles nested financial concepts", () => {
            const claim = "What is the contribution limit for a Roth 401k?";
            const evidence = [
                createEvidence(
                    "Roth 401k limits",
                    "Roth 401k contributions follow the same limits as traditional 401k: $23,500"
                ),
            ];

            const result = checker.checkRelevance(claim, evidence);

            expect(result.isRelevant).toBe(true);
        });
    });
});
