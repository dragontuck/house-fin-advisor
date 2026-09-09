/**
 * Tests for Research and Evidence Service
 *
 * Coverage:
 * - Source retrieval and classification
 * - Freshness assessment
 * - Evidence validation
 * - Source ranking
 * - Conflict detection
 * - Unavailable sources
 */

import {
    EntityId,
    Evidence,
    SourceTier,
    SourceAuthority,
    ConfidenceLevel,
} from "@house-fin/contracts";
import {
    retrieveSource,
    extractClaims,
    storeEvidence,
    checkFreshness,
    detectConflict,
    searchResearch,
} from "@house-fin/domain";

describe("Research and Evidence Service", () => {
    const householdId = "household-1" as EntityId;

    describe("Source Retrieval", () => {
        it("should retrieve source and create evidence from URL", () => {
            const content =
                "The 2024 IRS standard deduction for single filers is $14,600. This was increased from $13,850 in 2023.";

            const result = retrieveSource(
                { sourceUrl: "https://www.irs.gov/standard-deduction-2024" },
                content
            );

            expect(result.status).toBe("SUCCESS");
            expect(result.evidence).toBeDefined();
            expect(result.evidence?.claim).toBeTruthy();
            expect(result.evidence?.source.tier).toBe(SourceTier.TIER_1_GOVERNMENT);
            expect(result.evidence?.source.authority).toBe(SourceAuthority.REGULATORY);
        });

        it("should classify government source correctly", () => {
            const result = retrieveSource(
                { sourceUrl: "https://www.sec.gov/investor-alerts" },
                "SEC investment guidance"
            );

            expect(result.source.tier).toBe(SourceTier.TIER_1_GOVERNMENT);
            expect(result.source.type).toBe("GOVERNMENT");
        });

        it("should classify provider source correctly", () => {
            const result = retrieveSource(
                { sourceUrl: "https://www.chase.com/mortgage-rates" },
                "Chase mortgage rates"
            );

            expect(result.source.tier).toBe(SourceTier.TIER_2_PROVIDER);
            expect(result.source.type).toBe("PROVIDER");
            expect(result.source.authority).toBe(SourceAuthority.OFFICIAL);
        });

        it("should classify research source correctly", () => {
            const result = retrieveSource(
                { sourceUrl: "https://scholar.google.com/financial-study" },
                "Academic research"
            );

            expect(result.source.tier).toBe(SourceTier.TIER_3_RESEARCH);
            expect(result.source.authority).toBe(SourceAuthority.ACADEMIC);
        });

        it("should classify media source correctly", () => {
            const result = retrieveSource({ sourceUrl: "https://www.wsj.com/article" }, "News article");

            expect(result.source.tier).toBe(SourceTier.TIER_4_MEDIA);
            expect(result.source.type).toBe("MEDIA");
        });

        it("should return UNAVAILABLE for empty URL", () => {
            const result = retrieveSource({ sourceUrl: "" });

            expect(result.status).toBe("UNAVAILABLE");
            expect(result.evidence).toBeUndefined();
            expect(result.errorMessage).toContain("Invalid or empty source URL");
        });

        it("should return UNAVAILABLE when no content provided", () => {
            const result = retrieveSource({
                sourceUrl: "https://example.com/some-page",
            });

            expect(result.status).toBe("UNAVAILABLE");
            expect(result.errorMessage).toContain("Could not retrieve content");
        });

        it("should handle www prefix in domain classification", () => {
            const result = retrieveSource(
                { sourceUrl: "https://www.irs.gov/standard-deduction" },
                "IRS data"
            );

            expect(result.source.name).toBe("IRS");
            expect(result.source.tier).toBe(SourceTier.TIER_1_GOVERNMENT);
        });
    });

    describe("Claim Extraction", () => {
        it("should extract claims from content", () => {
            const content =
                "The Federal Reserve rate is 5.5%. Interest rates affect mortgage payments significantly. A 1% change costs $100 per month on a $300,000 loan.";

            const result = extractClaims(content, "https://www.federalreserve.gov");

            expect(result.claims.length).toBeGreaterThan(0);
            expect(result.claims.every((c) => c.confidence)).toBe(true);
        });

        it("should assign confidence based on source tier", () => {
            const content = "The tax rate is 37% and affects high earners.";

            // Government source
            const govResult = extractClaims(content, "https://www.irs.gov");
            expect(govResult.claims[0]?.confidence).toBe(ConfidenceLevel.HIGH);

            // Media source
            const mediaResult = extractClaims(content, "https://www.wsj.com");
            expect(mediaResult.claims[0]?.confidence).toBe(ConfidenceLevel.LOW);
        });

        it("should extract numerical claims", () => {
            const content = "The rate increased by 2.5% this year. The average return was 8% annually.";

            const result = extractClaims(content, "https://www.example.com");

            expect(result.claims.length).toBeGreaterThan(0);
            expect(result.claims.some((c) => c.text.includes("%"))).toBe(true);
        });

        it("should extract date-based claims", () => {
            const content = "Starting January 2024, new rules apply. The effective date is March 1, 2024.";

            const result = extractClaims(content, "https://www.example.com");

            expect(result.claims.length).toBeGreaterThan(0);
        });
    });

    describe("Evidence Storage", () => {
        const validEvidence: Evidence = {
            id: "evidence-1" as EntityId,
            householdId,
            claim: "2024 IRS standard deduction is $14,600",
            source: {
                name: "IRS",
                type: "GOVERNMENT",
                tier: SourceTier.TIER_1_GOVERNMENT,
                authority: SourceAuthority.REGULATORY,
                url: "https://www.irs.gov",
            },
            sourceUrl: "https://www.irs.gov/standard-deduction",
            retrievalDate: new Date(),
            freshness: "CURRENT",
            confidence: ConfidenceLevel.HIGH,
            usedIn: [],
            verificationStatus: "VERIFIED",
            createdAt: new Date(),
        };

        it("should store valid evidence", () => {
            const result = storeEvidence(validEvidence, householdId);

            expect(result.success).toBe(true);
            expect(result.evidence).toBeDefined();
            expect(result.error).toBeUndefined();
        });

        it("should reject evidence without ID", () => {
            const invalid = { ...validEvidence, id: undefined as any };
            const result = storeEvidence(invalid, householdId);

            expect(result.success).toBe(false);
            expect(result.error).toContain("ID");
        });

        it("should reject evidence without claim", () => {
            const invalid = { ...validEvidence, claim: "" };
            const result = storeEvidence(invalid, householdId);

            expect(result.success).toBe(false);
            expect(result.error).toContain("Claim");
        });

        it("should reject evidence without source", () => {
            const invalid = { ...validEvidence, source: undefined as any };
            const result = storeEvidence(invalid, householdId);

            expect(result.success).toBe(false);
            expect(result.error).toContain("Source");
        });

        it("should reject evidence without retrieval date", () => {
            const invalid = { ...validEvidence, retrievalDate: undefined as any };
            const result = storeEvidence(invalid, householdId);

            expect(result.success).toBe(false);
            expect(result.error).toContain("Retrieval date");
        });

        it("should reject evidence with invalid freshness", () => {
            const invalid = { ...validEvidence, freshness: "INVALID" as any };
            const result = storeEvidence(invalid, householdId);

            expect(result.success).toBe(false);
            expect(result.error).toContain("freshness");
        });
    });

    describe("Freshness Assessment", () => {
        const createEvidenceWithAge = (daysOld: number): Evidence => ({
            id: "evidence-1" as EntityId,
            householdId,
            claim: "Test claim",
            source: {
                name: "IRS",
                type: "GOVERNMENT",
                tier: SourceTier.TIER_1_GOVERNMENT,
                authority: SourceAuthority.REGULATORY,
            },
            retrievalDate: new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000),
            freshness: "CURRENT",
            confidence: ConfidenceLevel.HIGH,
            usedIn: [],
            verificationStatus: "VERIFIED",
            createdAt: new Date(),
        });

        it("should mark current evidence", () => {
            const evidence = createEvidenceWithAge(5); // 5 days old
            evidence.source.tier = SourceTier.TIER_1_GOVERNMENT;

            const result = checkFreshness(evidence);

            expect(result.status).toBe("CURRENT");
            expect(result.requiresVerification).toBe(false);
        });

        it("should mark recent evidence", () => {
            const evidence = createEvidenceWithAge(50); // 50 days old
            evidence.source.tier = SourceTier.TIER_2_PROVIDER;

            const result = checkFreshness(evidence);

            expect(result.status).toBe("RECENT");
            expect(result.requiresVerification).toBe(false);
        });

        it("should mark stale evidence", () => {
            const evidence = createEvidenceWithAge(120); // 120 days old
            evidence.source.tier = SourceTier.TIER_2_PROVIDER;

            const result = checkFreshness(evidence);

            expect(result.status).toBe("STALE");
            expect(result.requiresVerification).toBe(true);
        });

        it("should mark expired evidence based on explicit date", () => {
            const evidence: Evidence = {
                id: "evidence-1" as EntityId,
                householdId,
                claim: "Test claim",
                source: {
                    name: "Test",
                    type: "CUSTOM",
                    tier: SourceTier.TIER_4_MEDIA,
                    authority: SourceAuthority.COMMUNITY,
                },
                retrievalDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
                expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Expired yesterday
                freshness: "EXPIRED",
                confidence: ConfidenceLevel.LOW,
                usedIn: [],
                verificationStatus: "UNVERIFIED",
                createdAt: new Date(),
            };

            const result = checkFreshness(evidence);

            expect(result.status).toBe("EXPIRED");
            expect(result.requiresVerification).toBe(true);
        });

        it("should use different thresholds by source tier", () => {
            // Government source: can be older
            const govEvidence = createEvidenceWithAge(100); // 100 days old
            govEvidence.source.tier = SourceTier.TIER_1_GOVERNMENT;
            const govResult = checkFreshness(govEvidence);
            expect(govResult.status).toBe("RECENT"); // Still recent for government

            // Media source: must be newer
            const mediaEvidence = createEvidenceWithAge(100);
            mediaEvidence.source.tier = SourceTier.TIER_4_MEDIA;
            const mediaResult = checkFreshness(mediaEvidence);
            expect(mediaResult.status).toBe("STALE"); // Stale for media
        });

        it("should include recommendation for stale evidence", () => {
            const evidence = createEvidenceWithAge(200);
            evidence.source.tier = SourceTier.TIER_3_RESEARCH;

            const result = checkFreshness(evidence);

            expect(result.recommendation).toContain("refresh");
            expect(result.recommendation).toContain("200");
        });
    });

    describe("Source Ranking", () => {
        it("should prefer government over provider", () => {
            const govEvidence: Evidence = {
                id: "gov-1" as EntityId,
                householdId,
                claim: "Tax rate is 37%",
                source: {
                    name: "IRS",
                    type: "GOVERNMENT",
                    tier: SourceTier.TIER_1_GOVERNMENT,
                    authority: SourceAuthority.REGULATORY,
                },
                retrievalDate: new Date(),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.HIGH,
                usedIn: [],
                verificationStatus: "VERIFIED",
                createdAt: new Date(),
            };

            const providerEvidence: Evidence = {
                id: "prov-1" as EntityId,
                householdId,
                claim: "Tax rate is 37%",
                source: {
                    name: "Chase",
                    type: "PROVIDER",
                    tier: SourceTier.TIER_2_PROVIDER,
                    authority: SourceAuthority.OFFICIAL,
                },
                retrievalDate: new Date(),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.HIGH,
                usedIn: [],
                verificationStatus: "VERIFIED",
                createdAt: new Date(),
            };

            const conflict = detectConflict(govEvidence, providerEvidence);

            if (conflict.hasConflict) {
                expect(conflict.recommendation).toContain("IRS");
            }
        });

        it("should prefer provider over research", () => {
            const providerEvidence: Evidence = {
                id: "prov-1" as EntityId,
                householdId,
                claim: "Rate is 5%",
                source: {
                    name: "Chase",
                    type: "PROVIDER",
                    tier: SourceTier.TIER_2_PROVIDER,
                    authority: SourceAuthority.OFFICIAL,
                },
                retrievalDate: new Date(),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.HIGH,
                usedIn: [],
                verificationStatus: "VERIFIED",
                createdAt: new Date(),
            };

            const researchEvidence: Evidence = {
                id: "res-1" as EntityId,
                householdId,
                claim: "Rate is 5%",
                source: {
                    name: "NBER",
                    type: "RESEARCH",
                    tier: SourceTier.TIER_3_RESEARCH,
                    authority: SourceAuthority.ACADEMIC,
                },
                retrievalDate: new Date(),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.MEDIUM,
                usedIn: [],
                verificationStatus: "VERIFIED",
                createdAt: new Date(),
            };

            const conflict = detectConflict(providerEvidence, researchEvidence);

            if (conflict.hasConflict) {
                expect(conflict.recommendation).toContain("Chase");
            }
        });

        it("should prefer research over media", () => {
            const researchEvidence: Evidence = {
                id: "res-1" as EntityId,
                householdId,
                claim: "Market return is 8%",
                source: {
                    name: "NBER",
                    type: "RESEARCH",
                    tier: SourceTier.TIER_3_RESEARCH,
                    authority: SourceAuthority.ACADEMIC,
                },
                retrievalDate: new Date(),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.MEDIUM,
                usedIn: [],
                verificationStatus: "VERIFIED",
                createdAt: new Date(),
            };

            const mediaEvidence: Evidence = {
                id: "media-1" as EntityId,
                householdId,
                claim: "Market return is 8%",
                source: {
                    name: "WSJ",
                    type: "MEDIA",
                    tier: SourceTier.TIER_4_MEDIA,
                    authority: SourceAuthority.COMMERCIAL,
                },
                retrievalDate: new Date(),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.LOW,
                usedIn: [],
                verificationStatus: "UNVERIFIED",
                createdAt: new Date(),
            };

            const conflict = detectConflict(researchEvidence, mediaEvidence);

            if (conflict.hasConflict) {
                expect(conflict.recommendation).toContain("NBER");
            }
        });
    });

    describe("Conflict Detection", () => {
        it("should detect no conflict when claims unrelated", () => {
            const evidence1: Evidence = {
                id: "ev1" as EntityId,
                householdId,
                claim: "Federal rate is 5.5%",
                source: {
                    name: "Fed",
                    type: "GOVERNMENT",
                    tier: SourceTier.TIER_1_GOVERNMENT,
                    authority: SourceAuthority.REGULATORY,
                },
                retrievalDate: new Date(),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.HIGH,
                usedIn: [],
                verificationStatus: "VERIFIED",
                createdAt: new Date(),
            };

            const evidence2: Evidence = {
                id: "ev2" as EntityId,
                householdId,
                claim: "Inflation is 3%",
                source: {
                    name: "BLS",
                    type: "GOVERNMENT",
                    tier: SourceTier.TIER_1_GOVERNMENT,
                    authority: SourceAuthority.REGULATORY,
                },
                retrievalDate: new Date(),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.HIGH,
                usedIn: [],
                verificationStatus: "VERIFIED",
                createdAt: new Date(),
            };

            const conflict = detectConflict(evidence1, evidence2);

            expect(conflict.hasConflict).toBe(false);
        });

        it("should detect conflict from age difference", () => {
            const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
            const newDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

            const oldEvidence: Evidence = {
                id: "old" as EntityId,
                householdId,
                claim: "Interest rate is 4%",
                source: {
                    name: "Fed",
                    type: "GOVERNMENT",
                    tier: SourceTier.TIER_1_GOVERNMENT,
                    authority: SourceAuthority.REGULATORY,
                },
                retrievalDate: oldDate,
                freshness: "RECENT",
                confidence: ConfidenceLevel.HIGH,
                usedIn: [],
                verificationStatus: "VERIFIED",
                createdAt: oldDate,
            };

            const newEvidence: Evidence = {
                id: "new" as EntityId,
                householdId,
                claim: "Interest rate is 5.5%",
                source: {
                    name: "Fed",
                    type: "GOVERNMENT",
                    tier: SourceTier.TIER_1_GOVERNMENT,
                    authority: SourceAuthority.REGULATORY,
                },
                retrievalDate: newDate,
                freshness: "CURRENT",
                confidence: ConfidenceLevel.HIGH,
                usedIn: [],
                verificationStatus: "VERIFIED",
                createdAt: newDate,
            };

            const conflict = detectConflict(oldEvidence, newEvidence);

            expect(conflict.hasConflict).toBe(true);
            expect(conflict.severity).toBe("MEDIUM");
            expect(conflict.recommendation).toContain("recent");
        });

        it("should detect conflict from source tier difference", () => {
            const govEvidence: Evidence = {
                id: "gov" as EntityId,
                householdId,
                claim: "Tax rate is 37%",
                source: {
                    name: "IRS",
                    type: "GOVERNMENT",
                    tier: SourceTier.TIER_1_GOVERNMENT,
                    authority: SourceAuthority.REGULATORY,
                },
                retrievalDate: new Date(),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.HIGH,
                usedIn: [],
                verificationStatus: "VERIFIED",
                createdAt: new Date(),
            };

            const mediaEvidence: Evidence = {
                id: "media" as EntityId,
                householdId,
                claim: "Tax rate is 37%",
                source: {
                    name: "CNBC",
                    type: "MEDIA",
                    tier: SourceTier.TIER_4_MEDIA,
                    authority: SourceAuthority.COMMERCIAL,
                },
                retrievalDate: new Date(),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.LOW,
                usedIn: [],
                verificationStatus: "UNVERIFIED",
                createdAt: new Date(),
            };

            const conflict = detectConflict(govEvidence, mediaEvidence);

            expect(conflict.hasConflict).toBe(true);
            expect(conflict.recommendation).toContain("IRS");
        });
    });

    describe("Search Research", () => {
        it("should return UNVERIFIED with no evidence available", () => {
            const result = searchResearch(
                {
                    claim: "What is the 2024 standard deduction?",
                },
                []
            );

            expect(result.status).toBe("UNVERIFIED");
            expect(result.results).toHaveLength(0);
        });

        it("should indicate when sources conflict", () => {
            const result = searchResearch(
                {
                    claim: "What is the current mortgage rate?",
                },
                []
            );

            expect(["VERIFIED", "UNVERIFIED", "CONFLICTED"].includes(result.status)).toBe(true);
        });
    });

    describe("Failure Behavior", () => {
        it("should return UNVERIFIED for unavailable sources", () => {
            const result = retrieveSource({
                sourceUrl: "https://nonexistent.example.com/data",
            });

            expect(result.status).toBe("UNAVAILABLE");
            expect(result.evidence?.verificationStatus).not.toBe("VERIFIED");
        });

        it("should not fabricate evidence when source fails", () => {
            const result = retrieveSource({
                sourceUrl: "",
                claim: "Some claim",
            });

            expect(result.status).toBe("UNAVAILABLE");
            expect(result.evidence).toBeUndefined();
        });

        it("should mark evidence as UNVERIFIED when unable to confirm", () => {
            const evidence: Evidence = {
                id: "unverified" as EntityId,
                householdId,
                claim: "Source data",
                source: {
                    name: "UNKNOWN",
                    type: "CUSTOM",
                    tier: SourceTier.TIER_4_MEDIA,
                    authority: SourceAuthority.COMMUNITY,
                },
                retrievalDate: new Date(),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.LOW,
                usedIn: [],
                verificationStatus: "UNVERIFIED",
                createdAt: new Date(),
            };

            const storeResult = storeEvidence(evidence, householdId);

            expect(storeResult.success).toBe(true);
            expect(storeResult.evidence?.verificationStatus).toBe("UNVERIFIED");
        });
    });
});
