/**
 * Research and Evidence Service
 *
 * Pure, deterministic functions for retrieving, structuring, and tracking evidence.
 *
 * Key principles:
 * - Does NOT generate recommendations
 * - Only retrieves and structures external facts
 * - Tracks source tier and authority
 * - Marks stale/expired evidence explicitly
 * - Returns UNVERIFIED rather than fabricating information
 * - All operations are deterministic and testable
 * - No external API calls (those belong in adapter/repository layer)
 *
 * Workflow:
 * 1. searchResearch() - Find evidence on a claim
 * 2. retrieveSource() - Get content from source
 * 3. extractClaims() - Parse claims from content
 * 4. storeEvidence() - Save to database (via repository)
 * 5. checkFreshness() - Determine if still valid
 */

import {
    EntityId,
    Evidence,
    ResearchSource,
    SourceTier,
    SourceAuthority,
    ConfidenceLevel,
    SearchResearchRequest,
    SearchResearchResponse,
    RetrieveSourceRequest,
    RetrieveSourceResponse,
    FreshnessAssessment,
} from "@house-fin/contracts";

/**
 * Search for evidence on a claim
 *
 * Ranks results by source tier and relevance.
 * Returns UNVERIFIED if no sources can be found.
 *
 * Note: This is a pure function. Actual data retrieval happens in adapter layer.
 */
export function searchResearch(
    _request: SearchResearchRequest,
    _knownEvidence: Evidence[]
): SearchResearchResponse {
    // This function is typically called by the adapter layer which provides knownEvidence
    // Here we implement the ranking and filtering logic

    // Note: Real implementation would query external research APIs in the adapter layer
    // This function receives the results and ranks them

    // Stub implementation for testing
    return {
        claim: _request.claim,
        results: [],
        status: "UNVERIFIED",
        conflictDetails: "No evidence sources available in this context",
    };
}

/**
 * Retrieve source content and extract claims
 *
 * Returns UNVERIFIED if source is unavailable or cannot be accessed.
 * Returns UNAVAILABLE if source is inaccessible.
 * Returns FORBIDDEN if access is denied.
 *
 * Note: Actual HTTP retrieval happens in adapter layer.
 * This function processes the retrieved content.
 */
export function retrieveSource(
    request: RetrieveSourceRequest,
    _sourceContent?: string
): RetrieveSourceResponse {
    // Validation
    if (!request.sourceUrl || request.sourceUrl.trim().length === 0) {
        return {
            source: {
                name: "UNKNOWN",
                type: "CUSTOM",
                tier: SourceTier.TIER_4_MEDIA,
                authority: SourceAuthority.COMMUNITY,
            },
            sourceUrl: request.sourceUrl,
            status: "UNAVAILABLE",
            errorMessage: "Invalid or empty source URL",
        };
    }

    // Note: If sourceContent is not provided, retrieval failed
    if (!_sourceContent) {
        return {
            source: {
                name: "UNKNOWN",
                type: "CUSTOM",
                tier: SourceTier.TIER_4_MEDIA,
                authority: SourceAuthority.COMMUNITY,
                url: request.sourceUrl,
            },
            sourceUrl: request.sourceUrl,
            status: "UNAVAILABLE",
            errorMessage: "Could not retrieve content from source",
        };
    }

    // Extract basic information (real implementation would parse HTML/JSON)
    const evidence: Evidence = {
        id: `evidence-${Date.now()}` as EntityId,
        householdId: "unknown" as EntityId,
        claim: request.claim || "Content from external source",
        source: {
            name: extractSourceName(request.sourceUrl),
            type: classifySourceType(request.sourceUrl),
            tier: classifySourceTier(request.sourceUrl),
            authority: classifySourceAuthority(request.sourceUrl),
            url: request.sourceUrl,
        },
        sourceUrl: request.sourceUrl,
        sourceText: _sourceContent,
        retrievalDate: new Date(),
        freshness: "CURRENT",
        confidence: ConfidenceLevel.MEDIUM, // Default confidence for unverified content
        usedIn: [],
        verificationStatus: "UNVERIFIED",
        createdAt: new Date(),
    };

    return {
        source: evidence.source,
        sourceUrl: request.sourceUrl,
        status: "SUCCESS",
        evidence,
    };
}

/**
 * Extract claims from source content
 *
 * Parses structured content and identifies key claims.
 * Returns claims with confidence levels based on source tier.
 */
export function extractClaims(
    content: string,
    sourceUrl: string
): {
    claims: Array<{ text: string; confidence: ConfidenceLevel }>;
    rawContent: string;
} {
    const claims: Array<{ text: string; confidence: ConfidenceLevel }> = [];

    // Basic extraction: split by sentences and filter for likely claims
    const sentences = content
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 10 && s.length < 500);

    // Rank by likelihood of being a factual claim
    const sourceTier = classifySourceTier(sourceUrl);
    const confidenceForTier = confidenceLevelForTier(sourceTier);

    sentences.forEach((sentence) => {
        // Heuristic: claims often contain numbers, dates, percentages
        if (/\d+|percent|%|rate|fee|amount|cost|return|yield|year|month|date/.test(sentence)) {
            claims.push({
                text: sentence,
                confidence: confidenceForTier,
            });
        }
    });

    return {
        claims,
        rawContent: content,
    };
}

/**
 * Store evidence for later use
 *
 * Prepares evidence for persistence.
 * Validates all required fields.
 * Returns error if any critical field is missing.
 */
export function storeEvidence(
    evidence: Evidence,
    _householdId: EntityId
): {
    success: boolean;
    evidence?: Evidence;
    error?: string;
} {
    // Validation
    const errors: string[] = [];

    if (!evidence.id) errors.push("Evidence must have an ID");
    if (!evidence.claim || evidence.claim.trim().length === 0) errors.push("Claim cannot be empty");
    if (!evidence.source) {
        errors.push("Source information is required");
    } else {
        if (!evidence.source.name) errors.push("Source name is required");
    }
    if (!evidence.retrievalDate) errors.push("Retrieval date is required");
    if (
        !evidence.freshness ||
        !["CURRENT", "RECENT", "STALE", "EXPIRED"].includes(evidence.freshness)
    ) {
        errors.push("Valid freshness status is required");
    }
    if (!evidence.verificationStatus) errors.push("Verification status is required");

    if (errors.length > 0) {
        return {
            success: false,
            error: errors.join("; "),
        };
    }

    // If we get here, evidence is valid
    return {
        success: true,
        evidence,
    };
}

/**
 * Check if evidence is still fresh and valid
 *
 * Determines CURRENT, RECENT, STALE, or EXPIRED.
 * Considers:
 * - Days since retrieval
 * - Source tier (government sources stay valid longer)
 * - Evidence type (interest rates vs. policy)
 * - Explicit expiration date
 */
export function checkFreshness(evidence: Evidence): FreshnessAssessment {
    const now = new Date();
    const retrievedDate = new Date(evidence.retrievalDate);
    const daysOld = Math.floor((now.getTime() - retrievedDate.getTime()) / (1000 * 60 * 60 * 24));

    // Check explicit expiration
    if (evidence.expiresAt) {
        const expiresDate = new Date(evidence.expiresAt);
        if (now > expiresDate) {
            return {
                status: "EXPIRED",
                daysOld,
                recommendation: "This evidence has passed its expiration date. Retrieve updated information.",
                requiresVerification: true,
            };
        }
    }

    // Freshness thresholds by source tier
    const thresholds = {
        [SourceTier.TIER_1_GOVERNMENT]: { recent: 90, stale: 365 }, // Gov data valid ~1 year
        [SourceTier.TIER_2_PROVIDER]: { recent: 30, stale: 90 }, // Provider data valid ~3 months
        [SourceTier.TIER_3_RESEARCH]: { recent: 14, stale: 60 }, // Research valid ~2 months
        [SourceTier.TIER_4_MEDIA]: { recent: 7, stale: 30 }, // Media dated quickly
    };

    const threshold = thresholds[evidence.source.tier] || thresholds[SourceTier.TIER_4_MEDIA];

    if (daysOld > threshold.stale) {
        return {
            status: "STALE",
            daysOld,
            recommendation: `This ${evidence.source.tier} evidence is ${daysOld} days old. Consider refreshing.`,
            requiresVerification: true,
        };
    }

    if (daysOld > threshold.recent) {
        return {
            status: "RECENT",
            daysOld,
            recommendation: `This evidence is ${daysOld} days old. Reasonably current but may need refresh.`,
            requiresVerification: false,
        };
    }

    return {
        status: "CURRENT",
        daysOld,
        recommendation: "Evidence is current and reliable.",
        requiresVerification: false,
    };
}

/**
 * Detect conflicting evidence
 *
 * When multiple sources contradict each other.
 * Returns details about the conflict and suggestion for resolution.
 */
export function detectConflict(
    evidence1: Evidence,
    evidence2: Evidence
): {
    hasConflict: boolean;
    severity: "LOW" | "MEDIUM" | "HIGH";
    description: string;
    recommendation: string;
} {
    // Simple heuristic: if both claim similar things but from different sources
    // and sources have different tiers, prefer the higher tier

    const claimsRelated =
        evidence1.claim.toLowerCase().includes(evidence2.claim.toLowerCase().split(" ")[0]) ||
        evidence2.claim.toLowerCase().includes(evidence1.claim.toLowerCase().split(" ")[0]);

    if (!claimsRelated) {
        return {
            hasConflict: false,
            severity: "LOW",
            description: "No conflict between evidence",
            recommendation: "Both pieces of evidence can coexist",
        };
    }

    // Check if freshness differs significantly
    const age1 = Math.floor(
        (new Date().getTime() - new Date(evidence1.retrievalDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const age2 = Math.floor(
        (new Date().getTime() - new Date(evidence2.retrievalDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const ageDifference = Math.abs(age1 - age2);

    // Rank sources
    const rank1 = getTierRank(evidence1.source.tier);
    const rank2 = getTierRank(evidence2.source.tier);

    if (ageDifference > 30) {
        return {
            hasConflict: true,
            severity: "MEDIUM",
            description: `Evidence is from different time periods (${age1} days vs ${age2} days old)`,
            recommendation: `Prefer the more recent evidence, or retrieve updated sources.`,
        };
    }

    if (rank1 !== rank2) {
        return {
            hasConflict: true,
            severity: rank1 < rank2 ? "LOW" : "HIGH",
            description: `Sources have different authority levels (${evidence1.source.tier} vs ${evidence2.source.tier})`,
            recommendation: `Prefer ${rank1 < rank2 ? evidence1.source.name : evidence2.source.name} (higher tier source)`,
        };
    }

    return {
        hasConflict: false,
        severity: "LOW",
        description: "Evidence sources are comparable in tier and recency",
        recommendation: "Both sources are equally reliable",
    };
}

/**
 * Rank sources by tier hierarchy
 *
 * Lower number = higher authority
 */
function getTierRank(tier: SourceTier): number {
    const ranks = {
        [SourceTier.TIER_1_GOVERNMENT]: 1,
        [SourceTier.TIER_2_PROVIDER]: 2,
        [SourceTier.TIER_3_RESEARCH]: 3,
        [SourceTier.TIER_4_MEDIA]: 4,
    };
    return ranks[tier] || 5;
}

/**
 * Get confidence level for a source tier
 *
 * Government sources get HIGH confidence.
 * Provider/Research get MEDIUM.
 * Media gets LOW.
 */
function confidenceLevelForTier(tier: SourceTier): ConfidenceLevel {
    switch (tier) {
        case SourceTier.TIER_1_GOVERNMENT:
            return ConfidenceLevel.HIGH;
        case SourceTier.TIER_2_PROVIDER:
            return ConfidenceLevel.HIGH;
        case SourceTier.TIER_3_RESEARCH:
            return ConfidenceLevel.MEDIUM;
        case SourceTier.TIER_4_MEDIA:
            return ConfidenceLevel.LOW;
        default:
            return ConfidenceLevel.LOW;
    }
}

/**
 * Extract source name from URL
 *
 * Heuristic: use domain name
 */
function extractSourceName(url: string): string {
    try {
        const domain = new URL(url).hostname.replace("www.", "");
        return domain.split(".")[0].toUpperCase();
    } catch {
        return "UNKNOWN";
    }
}

/**
 * Classify source type from URL
 */
function classifySourceType(url: string): "GOVERNMENT" | "PROVIDER" | "RESEARCH" | "MEDIA" | "CUSTOM" {
    const urlLower = url.toLowerCase();

    if (/gov|sec|irs|federal|occ|fdic/.test(urlLower)) return "GOVERNMENT";
    if (/bank|chase|wellsfargo|boa|citigroup|provider|mortgage/.test(urlLower)) return "PROVIDER";
    if (/research|academic|edu|scholar|paper|study|research|journal/.test(urlLower)) return "RESEARCH";
    if (/news|media|blog|article|press|cnn|reuters|bloomberg|wsj/.test(urlLower)) return "MEDIA";

    return "CUSTOM";
}

/**
 * Classify source tier from URL
 */
function classifySourceTier(url: string): SourceTier {
    const type = classifySourceType(url);

    switch (type) {
        case "GOVERNMENT":
            return SourceTier.TIER_1_GOVERNMENT;
        case "PROVIDER":
            return SourceTier.TIER_2_PROVIDER;
        case "RESEARCH":
            return SourceTier.TIER_3_RESEARCH;
        case "MEDIA":
            return SourceTier.TIER_4_MEDIA;
        default:
            return SourceTier.TIER_4_MEDIA;
    }
}

/**
 * Classify source authority from URL
 */
function classifySourceAuthority(url: string): SourceAuthority {
    const urlLower = url.toLowerCase();

    if (/gov|sec|federal|occ|fdic/.test(urlLower)) return SourceAuthority.REGULATORY;
    if (/bank|chase|wellsfargo|boa|citigroup/.test(urlLower)) return SourceAuthority.OFFICIAL;
    if (/edu|scholar|academic|journal/.test(urlLower)) return SourceAuthority.ACADEMIC;
    if (/research|think|study|analysis/.test(urlLower)) return SourceAuthority.INSTITUTIONAL;
    if (/news|media|blog|article/.test(urlLower)) return SourceAuthority.COMMERCIAL;

    return SourceAuthority.COMMUNITY;
}
