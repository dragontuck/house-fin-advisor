import { AdvisorWorkflow, EntityId, Evidence, SearchResearchResponse, SourceTier } from "@house-fin/contracts";

export type ResearchRequirementLevel = "NOT_REQUIRED" | "OPTIONAL" | "REQUIRED";
export type ResearchTopic = "TAX_RULES" | "ISSUER_TERMS" | "RETIREMENT_RULES" | "CURRENT_RATES";

export interface ResearchQuery {
    topic: ResearchTopic;
    claim: string;
    preferredTiers: SourceTier[];
}

export interface ResearchRequirement {
    level: ResearchRequirementLevel;
    reason: string;
    queries: ResearchQuery[];
}

export interface RecommendationResearchContext {
    correlationId: EntityId;
    householdId: EntityId;
    memberId: EntityId;
}

export interface RecommendationResearchProvider {
    research(query: ResearchQuery, context: RecommendationResearchContext): Promise<SearchResearchResponse>;
}

export interface RecommendationResearchOutcome {
    status: "NOT_REQUIRED" | "VERIFIED" | "UNAVAILABLE" | "CONFLICTED";
    evidence: Evidence[];
}

const RELEVANCE_STOP_WORDS = new Set([
    "a", "an", "and", "applicable", "current", "for", "of", "or", "the", "to", "under",
]);

export function researchClaimRelevance(expectedClaim: string, evidenceClaim: string): number {
    const tokens = (value: string) => new Set(
        value.toLowerCase().match(/[a-z0-9]+/g)
            ?.filter((token) => token.length > 2 && !RELEVANCE_STOP_WORDS.has(token))
            .map((token) => token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token) ?? []
    );
    const expected = tokens(expectedClaim);
    const actual = tokens(evidenceClaim);
    if (expected.size === 0 || actual.size === 0) return 0;
    const overlap = [...expected].filter((token) => actual.has(token)).length;
    return Math.round((overlap / expected.size) * 100);
}

export async function performRequiredResearch(
    requirement: ResearchRequirement,
    provider: RecommendationResearchProvider | undefined,
    context: RecommendationResearchContext
): Promise<RecommendationResearchOutcome> {
    if (requirement.level !== "REQUIRED") {
        return { status: "NOT_REQUIRED", evidence: [] };
    }

    if (!provider) {
        return { status: "UNAVAILABLE", evidence: [] };
    }

    try {
        const responses = await Promise.all(
            requirement.queries.map((query) => provider.research(query, context))
        );
        if (responses.some((response) => response.status === "CONFLICTED")) {
            return { status: "CONFLICTED", evidence: [] };
        }
        const evidence: Evidence[] = [];
        for (let index = 0; index < responses.length; index += 1) {
            const response = responses[index];
            const query = requirement.queries[index];
            const qualifyingEvidence = response.results
                .filter((result) =>
                    result.relevanceScore >= 30 &&
                    researchClaimRelevance(query.claim, result.evidence.claim) >= 20
                )
                .map((result) => result.evidence)
                .filter((item) =>
                    item.householdId === context.householdId &&
                    item.verificationStatus === "VERIFIED" &&
                    item.freshness !== "STALE" &&
                    item.freshness !== "EXPIRED" &&
                    query.preferredTiers.includes(item.source.tier)
                );
            if (response.status !== "VERIFIED" || qualifyingEvidence.length === 0) {
                return { status: "UNAVAILABLE", evidence: [] };
            }
            evidence.push(...qualifyingEvidence);
        }

        return { status: "VERIFIED", evidence };
    } catch {
        return { status: "UNAVAILABLE", evidence: [] };
    }
}

const CURRENT_FACT_PATTERN = /\b(current|currently|latest|today|this year|now|new)\b/i;
const TAX_PATTERN = /\b(tax|taxes|taxable|deduction|deductible|irs|withholding)\b/i;
const CARD_PATTERN = /\b(credit card|card|amex|american express|visa|mastercard|discover|capital one|chase|citi)\b/i;
const CARD_DECISION_PATTERN = /\b(keep|cancel|close|renew|worth|annual fee|reward|rewards|benefit|benefits|points|issuer|terms)\b/i;
const RETIREMENT_PATTERN = /\b(retirement|401\(?k\)?|403\(?b\)?|ira|roth|pension)\b/i;
const RETIREMENT_RULE_PATTERN = /\b(limit|limits|match|matching|rule|rules|eligibility|vesting|tax|deduction|contribution maximum)\b/i;
const RATE_PATTERN = /\b(rate|rates|apy|apr|yield|interest|fee|fees|terms)\b/i;

export function determineResearchRequirement(
    userMessage: string,
    workflowType: AdvisorWorkflow
): ResearchRequirement {
    const message = userMessage.trim();

    if (CARD_PATTERN.test(message) && CARD_DECISION_PATTERN.test(message)) {
        return {
            level: "REQUIRED",
            reason: "A card decision depends on current issuer fees, terms, and benefits.",
            queries: [{
                topic: "ISSUER_TERMS",
                claim: "Current issuer terms, fees, and benefits for the credit card under review",
                preferredTiers: [SourceTier.TIER_2_PROVIDER],
            }],
        };
    }

    if (TAX_PATTERN.test(message) && (CURRENT_FACT_PATTERN.test(message) || /\bbonus|windfall\b/i.test(message))) {
        return {
            level: "REQUIRED",
            reason: "The requested recommendation depends on current tax rules.",
            queries: [{
                topic: "TAX_RULES",
                claim: "Current tax rules material to the proposed financial decision",
                preferredTiers: [SourceTier.TIER_1_GOVERNMENT],
            }],
        };
    }

    if (RETIREMENT_PATTERN.test(message)) {
        if (CURRENT_FACT_PATTERN.test(message) || RETIREMENT_RULE_PATTERN.test(message)) {
            return {
                level: "REQUIRED",
                reason: "The retirement recommendation depends on current plan or tax rules.",
                queries: [{
                    topic: "RETIREMENT_RULES",
                    claim: "Current retirement contribution limits, tax rules, and applicable plan terms",
                    preferredTiers: [SourceTier.TIER_1_GOVERNMENT, SourceTier.TIER_2_PROVIDER],
                }],
            };
        }

        return {
            level: "OPTIONAL",
            reason: "Household calculations can support general guidance, but plan-specific advice may require current terms.",
            queries: [],
        };
    }

    if (CURRENT_FACT_PATTERN.test(message) && RATE_PATTERN.test(message)) {
        return {
            level: "REQUIRED",
            reason: "The recommendation depends on a current market or product rate.",
            queries: [{
                topic: "CURRENT_RATES",
                claim: "Current rate material to the proposed financial decision",
                preferredTiers: [SourceTier.TIER_2_PROVIDER, SourceTier.TIER_1_GOVERNMENT],
            }],
        };
    }

    if (workflowType === AdvisorWorkflow.AFFORDABILITY) {
        return {
            level: "NOT_REQUIRED",
            reason: "Affordability can be determined from current household data and deterministic scenario calculations.",
            queries: [],
        };
    }

    return {
        level: "NOT_REQUIRED",
        reason: "No time-sensitive external fact is material to this request.",
        queries: [],
    };
}
