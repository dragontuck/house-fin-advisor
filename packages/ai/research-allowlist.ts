/**
 * Research Allowlist - Approved External Data Sources
 *
 * This module maintains the list of pre-approved external research sources
 * that the LLM is allowed to query. All external research requests must pass
 * through this allowlist to enforce privacy boundaries and prevent
 * unauthorized data access.
 *
 * Tiers:
 * - TIER_1_GOVERNMENT: Official government sources (Federal Reserve, IRS, FDIC, etc.)
 * - TIER_2_PROVIDER: Financial institution public data (subject to verification)
 * - TIER_3_RESEARCH: Other research institutions
 * - TIER_4_MEDIA: News/media sources
 */

import { SourceTier, SourceAuthority } from "@house-fin/contracts";

/** Allowlist entry for a research source */
export interface AllowlistedSource {
    name: string;
    type: "GOVERNMENT" | "PROVIDER" | "RESEARCH" | "MEDIA" | "CUSTOM";
    tier: SourceTier;
    authority: SourceAuthority;
    endpoint: string;
    query: string;
}

/**
 * Approved research sources for external queries.
 * Maintains privacy boundary: only specific, pre-approved sources are accessible.
 */
export const RESEARCH_ALLOWLIST: Record<string, AllowlistedSource> = {
    // Federal Reserve sources (TIER_1_GOVERNMENT)
    FED_FUNDS_RATE: {
        name: "Federal Reserve",
        type: "GOVERNMENT",
        tier: SourceTier.TIER_1_GOVERNMENT,
        authority: SourceAuthority.REGULATORY,
        endpoint: "https://www.federalreserve.gov",
        query: "current_fed_funds_rate",
    },
    FED_PRIME_RATE: {
        name: "Federal Reserve",
        type: "GOVERNMENT",
        tier: SourceTier.TIER_1_GOVERNMENT,
        authority: SourceAuthority.REGULATORY,
        endpoint: "https://www.federalreserve.gov",
        query: "prime_rate",
    },

    // IRS sources (TIER_1_GOVERNMENT)
    IRS_STANDARD_DEDUCTION: {
        name: "IRS",
        type: "GOVERNMENT",
        tier: SourceTier.TIER_1_GOVERNMENT,
        authority: SourceAuthority.REGULATORY,
        endpoint: "https://www.irs.gov",
        query: "standard_deduction",
    },
    IRS_TAX_BRACKETS: {
        name: "IRS",
        type: "GOVERNMENT",
        tier: SourceTier.TIER_1_GOVERNMENT,
        authority: SourceAuthority.REGULATORY,
        endpoint: "https://www.irs.gov",
        query: "tax_brackets",
    },
    IRS_CONTRIBUTION_LIMITS: {
        name: "IRS",
        type: "GOVERNMENT",
        tier: SourceTier.TIER_1_GOVERNMENT,
        authority: SourceAuthority.REGULATORY,
        endpoint: "https://www.irs.gov",
        query: "retirement_contribution_limits",
    },
    IRS_401K_LIMITS: {
        name: "IRS",
        type: "GOVERNMENT",
        tier: SourceTier.TIER_1_GOVERNMENT,
        authority: SourceAuthority.REGULATORY,
        endpoint: "https://www.irs.gov",
        query: "401k_contribution_limits",
    },
    IRS_IRA_LIMITS: {
        name: "IRS",
        type: "GOVERNMENT",
        tier: SourceTier.TIER_1_GOVERNMENT,
        authority: SourceAuthority.REGULATORY,
        endpoint: "https://www.irs.gov",
        query: "ira_contribution_limits",
    },
    IRS_HSA_LIMITS: {
        name: "IRS",
        type: "GOVERNMENT",
        tier: SourceTier.TIER_1_GOVERNMENT,
        authority: SourceAuthority.REGULATORY,
        endpoint: "https://www.irs.gov",
        query: "hsa_contribution_limits",
    },

    // FDIC sources (TIER_1_GOVERNMENT)
    FDIC_INSURANCE_LIMIT: {
        name: "FDIC",
        type: "GOVERNMENT",
        tier: SourceTier.TIER_1_GOVERNMENT,
        authority: SourceAuthority.REGULATORY,
        endpoint: "https://www.fdic.gov",
        query: "deposit_insurance_limit",
    },

    // Social Security (TIER_1_GOVERNMENT)
    SOCIAL_SECURITY_FULL_RETIREMENT_AGE: {
        name: "Social Security Administration",
        type: "GOVERNMENT",
        tier: SourceTier.TIER_1_GOVERNMENT,
        authority: SourceAuthority.REGULATORY,
        endpoint: "https://www.ssa.gov",
        query: "full_retirement_age",
    },
    SOCIAL_SECURITY_BENEFIT_AMOUNTS: {
        name: "Social Security Administration",
        type: "GOVERNMENT",
        tier: SourceTier.TIER_1_GOVERNMENT,
        authority: SourceAuthority.REGULATORY,
        endpoint: "https://www.ssa.gov",
        query: "estimated_benefits",
    },

    // Credit scoring (TIER_3_RESEARCH)
    CREDIT_SCORE_RANGES: {
        name: "FICO",
        type: "RESEARCH",
        tier: SourceTier.TIER_3_RESEARCH,
        authority: SourceAuthority.INSTITUTIONAL,
        endpoint: "https://www.fico.com",
        query: "credit_score_ranges",
    },

    // Note: Specific card/account terms must be verified by human before adding
};

/**
 * Verify that a research request is allowed.
 *
 * @param claim The research claim to verify
 * @returns true if the claim is on the allowlist
 */
export function isResearchAllowed(claim: string): boolean {
    if (!claim || claim.length === 0) {
        return false;
    }

    // Only allow specific, pre-approved claims
    return Object.values(RESEARCH_ALLOWLIST).some(source => {
        const claimLower = claim.toLowerCase();
        const queryLower = source.query.toLowerCase();
        return queryLower.includes(claimLower) || claimLower.includes(queryLower);
    });
}

/**
 * Get allowed sources for a claim.
 *
 * @param claim The research claim
 * @returns Array of matching allowed sources
 */
export function getAllowedSourcesForClaim(claim: string): AllowlistedSource[] {
    if (!claim || claim.length === 0) {
        return [];
    }

    const claimLower = claim.toLowerCase();
    return Object.values(RESEARCH_ALLOWLIST).filter(source => {
        const queryLower = source.query.toLowerCase();
        return queryLower.includes(claimLower) || claimLower.includes(queryLower);
    });
}
