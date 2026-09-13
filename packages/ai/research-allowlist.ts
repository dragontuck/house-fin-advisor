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

    // ========== TIER_3_RESEARCH: Academic Institutions & Education ==========
    KHAN_ACADEMY_FINANCE: {
        name: "Khan Academy",
        type: "RESEARCH",
        tier: SourceTier.TIER_3_RESEARCH,
        authority: SourceAuthority.ACADEMIC,
        endpoint: "https://www.khanacademy.org/college-careers-more/personal-finance",
        query: "personal_finance_education",
    },
    GFLEC: {
        name: "Global Financial Literacy Excellence Center",
        type: "RESEARCH",
        tier: SourceTier.TIER_3_RESEARCH,
        authority: SourceAuthority.ACADEMIC,
        endpoint: "https://gflec.org",
        query: "financial_literacy",
    },
    NGPF: {
        name: "Next Gen Personal Finance",
        type: "RESEARCH",
        tier: SourceTier.TIER_3_RESEARCH,
        authority: SourceAuthority.ACADEMIC,
        endpoint: "https://www.ngpf.org",
        query: "personal_finance_curriculum",
    },
    COURSERA: {
        name: "Coursera",
        type: "RESEARCH",
        tier: SourceTier.TIER_3_RESEARCH,
        authority: SourceAuthority.ACADEMIC,
        endpoint: "https://www.coursera.org",
        query: "finance_courses",
    },

    // ========== TIER_2_PROVIDER: Institutional & Government Research ==========
    CFPB: {
        name: "Consumer Financial Protection Bureau",
        type: "GOVERNMENT",
        tier: SourceTier.TIER_2_PROVIDER,
        authority: SourceAuthority.INSTITUTIONAL,
        endpoint: "https://www.consumerfinance.gov",
        query: "consumer_finance_information",
    },
    MYMONEY_GOV: {
        name: "MyMoney.gov",
        type: "GOVERNMENT",
        tier: SourceTier.TIER_2_PROVIDER,
        authority: SourceAuthority.INSTITUTIONAL,
        endpoint: "https://www.mymoney.gov",
        query: "financial_information",
    },
    FINRA_FOUNDATION: {
        name: "FINRA Investor Education Foundation",
        type: "RESEARCH",
        tier: SourceTier.TIER_2_PROVIDER,
        authority: SourceAuthority.INSTITUTIONAL,
        endpoint: "https://www.finrafoundation.org",
        query: "investor_education",
    },
    FDIC_MONEY_SMART: {
        name: "FDIC Money Smart",
        type: "GOVERNMENT",
        tier: SourceTier.TIER_2_PROVIDER,
        authority: SourceAuthority.INSTITUTIONAL,
        endpoint: "https://www.fdic.gov/resources/consumers/money-smart",
        query: "banking_financial_literacy",
    },

    // ========== TIER_4_MEDIA: News & Media ==========
    CNBC_MAKE_IT: {
        name: "CNBC Make It",
        type: "MEDIA",
        tier: SourceTier.TIER_4_MEDIA,
        authority: SourceAuthority.COMMERCIAL,
        endpoint: "https://www.cnbc.com/make-it",
        query: "personal_finance_news",
    },
    NPR_PLANET_MONEY: {
        name: "NPR's Planet Money",
        type: "MEDIA",
        tier: SourceTier.TIER_4_MEDIA,
        authority: SourceAuthority.COMMERCIAL,
        endpoint: "https://www.npr.org/sections/money",
        query: "finance_news",
    },
    INVESTOPEDIA: {
        name: "Investopedia",
        type: "MEDIA",
        tier: SourceTier.TIER_4_MEDIA,
        authority: SourceAuthority.COMMERCIAL,
        endpoint: "https://www.investopedia.com",
        query: "finance_information",
    },
    MARKETWATCH: {
        name: "MarketWatch Personal Finance",
        type: "MEDIA",
        tier: SourceTier.TIER_4_MEDIA,
        authority: SourceAuthority.COMMERCIAL,
        endpoint: "https://www.marketwatch.com/personal-finance",
        query: "personal_finance_advice",
    },

    // ========== TIER_4_MEDIA: Blogs ==========
    THE_COLLEGE_INVESTOR: {
        name: "The College Investor",
        type: "MEDIA",
        tier: SourceTier.TIER_4_MEDIA,
        authority: SourceAuthority.COMMERCIAL,
        endpoint: "https://thecollegeinvestor.com",
        query: "student_loans_finance",
    },
    AFFORD_ANYTHING: {
        name: "Afford Anything",
        type: "MEDIA",
        tier: SourceTier.TIER_4_MEDIA,
        authority: SourceAuthority.COMMERCIAL,
        endpoint: "https://affordanything.com",
        query: "personal_finance",
    },
    BOGLEHEADS: {
        name: "Bogleheads.org",
        type: "MEDIA",
        tier: SourceTier.TIER_4_MEDIA,
        authority: SourceAuthority.COMMUNITY,
        endpoint: "https://www.bogleheads.org",
        query: "investment_philosophy",
    },
    CLEVER_GIRL_FINANCE: {
        name: "Clever Girl Finance",
        type: "MEDIA",
        tier: SourceTier.TIER_4_MEDIA,
        authority: SourceAuthority.COMMERCIAL,
        endpoint: "https://www.clevergirlfinance.com",
        query: "personal_finance",
    },

    // ========== TIER_4_MEDIA: Aggregators & Communities ==========
    HARKSTER: {
        name: "Harkster",
        type: "MEDIA",
        tier: SourceTier.TIER_4_MEDIA,
        authority: SourceAuthority.COMMUNITY,
        endpoint: "https://www.harkster.com",
        query: "personal_finance_content",
    },
    FINVIZ: {
        name: "Finviz",
        type: "MEDIA",
        tier: SourceTier.TIER_4_MEDIA,
        authority: SourceAuthority.COMMERCIAL,
        endpoint: "https://finviz.com",
        query: "financial_data",
    },
    FEEDLY: {
        name: "Feedly",
        type: "MEDIA",
        tier: SourceTier.TIER_4_MEDIA,
        authority: SourceAuthority.COMMERCIAL,
        endpoint: "https://feedly.com",
        query: "finance_content_aggregation",
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
