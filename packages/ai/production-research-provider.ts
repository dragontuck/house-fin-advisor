import { Evidence, SearchResearchResponse, SourceTier } from "@house-fin/contracts";
import { EvidenceRepository, checkFreshness } from "@house-fin/domain";
import {
    RecommendationResearchContext,
    RecommendationResearchProvider,
    ResearchQuery,
    researchClaimRelevance,
} from "./recommendation-research";

export interface AllowlistedResearchSource {
    hostname: string;
    tiers: SourceTier[];
}

export interface ControlledResearchConfig {
    sources: AllowlistedResearchSource[];
    minimumRelevance: number;
}

function sourceHostname(evidence: Evidence): string | undefined {
    const value = evidence.sourceUrl ?? evidence.source.url;
    if (!value) return undefined;
    try {
        return new URL(value).hostname.toLowerCase();
    } catch {
        return undefined;
    }
}

export class CachedEvidenceResearchProvider implements RecommendationResearchProvider {
    constructor(
        private readonly repository: EvidenceRepository,
        private readonly config: ControlledResearchConfig
    ) { }

    async research(
        query: ResearchQuery,
        context: RecommendationResearchContext
    ): Promise<SearchResearchResponse> {
        const evidence = await this.repository.findByHouseholdId(context.householdId, 200);
        const results = evidence
            .map((item) => ({ ...item, freshness: checkFreshness(item).status }))
            .filter((item) => this.isAllowed(item) && query.preferredTiers.includes(item.source.tier))
            .map((item) => ({ evidence: item, relevanceScore: researchClaimRelevance(query.claim, item.claim) }))
            .filter((result) =>
                result.relevanceScore >= this.config.minimumRelevance &&
                result.evidence.verificationStatus === "VERIFIED" &&
                result.evidence.freshness !== "STALE" &&
                result.evidence.freshness !== "EXPIRED"
            )
            .sort((left, right) => right.relevanceScore - left.relevanceScore ||
                left.evidence.source.tier.localeCompare(right.evidence.source.tier));

        const distinctClaims = new Set(results.map((result) => result.evidence.claim.trim().toLowerCase()));
        return {
            claim: query.claim,
            results,
            status: results.length === 0 ? "UNVERIFIED" : distinctClaims.size > 1 ? "CONFLICTED" : "VERIFIED",
            conflictDetails: distinctClaims.size > 1 ? "Allowlisted sources provide conflicting claims." : undefined,
        };
    }

    private isAllowed(evidence: Evidence): boolean {
        const hostname = sourceHostname(evidence);
        if (!hostname) return false;
        return this.config.sources.some((source) =>
            source.tiers.includes(evidence.source.tier) &&
            (hostname === source.hostname || hostname.endsWith(`.${source.hostname}`))
        );
    }
}

export function defaultControlledResearchConfig(): ControlledResearchConfig {
    return {
        minimumRelevance: 30,
        sources: [
            { hostname: "irs.gov", tiers: [SourceTier.TIER_1_GOVERNMENT] },
            { hostname: "sec.gov", tiers: [SourceTier.TIER_1_GOVERNMENT] },
            { hostname: "federalreserve.gov", tiers: [SourceTier.TIER_1_GOVERNMENT] },
            { hostname: "dol.gov", tiers: [SourceTier.TIER_1_GOVERNMENT] },
            { hostname: "americanexpress.com", tiers: [SourceTier.TIER_2_PROVIDER] },
            { hostname: "chase.com", tiers: [SourceTier.TIER_2_PROVIDER] },
            { hostname: "capitalone.com", tiers: [SourceTier.TIER_2_PROVIDER] },
            { hostname: "citi.com", tiers: [SourceTier.TIER_2_PROVIDER] },
            { hostname: "discover.com", tiers: [SourceTier.TIER_2_PROVIDER] },
            { hostname: "bankofamerica.com", tiers: [SourceTier.TIER_2_PROVIDER] },
            { hostname: "wellsfargo.com", tiers: [SourceTier.TIER_2_PROVIDER] },
        ],
    };
}