import { AdvisorWorkflow, EntityId, Evidence, SearchResearchResponse, SourceTier } from "@house-fin/contracts";
import { EvidenceRelevanceChecker } from "@house-fin/domain";

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

/**
 * Validate research evidence against the original claim.
 * 
 * Ensures evidence:
 * 1. Has VERIFIED verification status
 * 2. Is not STALE or EXPIRED
 * 3. Actually supports the requested claim (not just tangentially related)
 * 
 * @param evidence Array of evidence to validate
 * @param claim The financial claim that evidence should support
 * @returns Object with validation result and reasoning
 */
export function validateResearchEvidence(
    evidence: Evidence[],
    claim: string
): { isValid: boolean; reason: string; supportingEvidence: Evidence[] } {
    // Check 1: Status, tier, freshness
    const statusValid = evidence.every(e =>
        e.verificationStatus === "VERIFIED" &&
        e.freshness !== "STALE" &&
        e.freshness !== "EXPIRED"
    );

    if (!statusValid) {
        return {
            isValid: false,
            reason: "Some evidence is not VERIFIED or has expired freshness",
            supportingEvidence: [],
        };
    }

    // Check 2: Evidence relevance to claim using domain service
    const relevanceChecker = new EvidenceRelevanceChecker();
    const relevance = relevanceChecker.checkRelevance(claim, evidence);

    if (!relevance.isRelevant) {
        return {
            isValid: false,
            reason: relevance.reasoning,
            supportingEvidence: [],
        };
    }

    if (relevance.confidence === "LOW") {
        return {
            isValid: true,
            reason: `Evidence supports claim with LOW confidence (${relevance.reasoning}). Recommendation should be labeled uncertain.`,
            supportingEvidence: relevance.supportingEvidence,
        };
    }

    return {
        isValid: true,
        reason: `Evidence supports claim with ${relevance.confidence} confidence.`,
        supportingEvidence: relevance.supportingEvidence,
    };
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

/**
 * Detect if a user message requires current external facts.
 *
 * This function analyzes whether the user's request depends on current data
 * that must be retrieved from external authoritative sources rather than
 * calculated from household financial data.
 *
 * Current-fact requirements typically stem from:
 * - Credit card/issuer terms (fees, rates, rewards, benefits)
 * - Tax rules and limits (deduction amounts, contribution limits)
 * - Retirement rules (eligibility, matching, vesting)
 * - Current market/product rates (savings APY, loan rates, CD rates)
 * - Government regulations and regulatory changes
 *
 * @param message The user's request message
 * @returns "CURRENT_FACT_REQUIRED" if current facts are needed, "NOT_REQUIRED" otherwise
 */
export function detectCurrentFactRequirement(message: string): "CURRENT_FACT_REQUIRED" | "NOT_REQUIRED" {
    const msg = message.toLowerCase();

    // ========== CREDIT CARD QUESTIONS ==========
    // "Should I keep/close my Amex?" or "Is this card worth it?" or "Should I keep my credit card?"
    const creditCardKeepDecision = /\b(keep|close|cancel|ditch|drop|switch)\b.*\b(?:credit|debit|amex|american express|visa|mastercard|discover|capital one|chase|citi|card|cc)\b/i.test(message);

    // Card with action and year reference: "Is it worth keeping this card in 2024?"
    const creditCardWorthKeeping = /(?:credit|debit|amex|american express|visa|mastercard|discover|capital one|chase|citi|card|cc).*(?:worth|keep|good).*(?:2024|2025|this year|today|current)/i.test(message);

    if (creditCardKeepDecision || creditCardWorthKeeping) {
        return "CURRENT_FACT_REQUIRED";
    }

    // "What's the APR on my card?" or "Does this card have annual fees?" or "What rewards does my card offer?"
    const creditCardTerms = /(?:credit|debit|amex|visa|mastercard|discover|card|cc).*?(?:rate|apr|apy|fee|limit|offer|term|benefit|reward|annual|sign.?up|new|promo)|(?:rate|apr|apy|fee|limit|offer|term|benefit|reward|annual|sign.?up|new|promo).*?(?:credit|debit|card|cc)/i.test(message);
    if (creditCardTerms) {
        return "CURRENT_FACT_REQUIRED";
    }

    // ========== TAX QUESTIONS ==========
    // "What can I deduct?" or "What's the 2024 standard deduction?"
    const taxDeductionInquiry = /\b(deduct|deduction|deductible|standard deduction|itemize)\b/i.test(message) &&
        /\b(current|2024|2025|this year|today|this tax year)\b/i.test(message);
    if (taxDeductionInquiry) {
        return "CURRENT_FACT_REQUIRED";
    }

    // "What's my withholding?" or "IRS rules for X"
    const taxRuleInquiry = /\b(withhold|withholding|irs|tax rule|tax law|tax change)\b/i.test(message) &&
        /\b(current|new|change|2024|2025|this year|latest)\b/i.test(message);
    if (taxRuleInquiry) {
        return "CURRENT_FACT_REQUIRED";
    }

    // ========== RETIREMENT CONTRIBUTION LIMITS ==========
    // "Can I contribute X to my 401k/IRA?" with current year references
    const retirementLimitInquiry = /\b(401\(?k\)?|403\(?b\)?|ira|roth ira|sep ira|simple ira|hsa|fsa)\b/i.test(message) &&
        /\b(limit|limits|max|maximum|contribution|can i contribute|how much)\b/i.test(message) &&
        /\b(current|2024|2025|this year|today)\b/i.test(message);
    if (retirementLimitInquiry) {
        return "CURRENT_FACT_REQUIRED";
    }

    // "What are the 2024 contribution limits for IRAs?" or "What's the current 403b match?"
    const retirementRuleInquiry = /\b(contribution.*limit|limit.*contribution|401k|ira|roth.*limit|contribution.*ceiling|match|vesting|eligibility)\b/i.test(message) &&
        /\b(2024|2025|current|latest|today)\b/i.test(message);
    if (retirementRuleInquiry) {
        return "CURRENT_FACT_REQUIRED";
    }

    // ========== SAVINGS/LOAN RATE INQUIRIES ==========
    // "Should I move to a savings account?" or "What's the current CD rate?"
    const savingsRateInquiry = /\b(savings|cd|money market|high yield|rate|apy|yield|interest)\b/i.test(message) &&
        /\b(current|today|now|latest|what.*rate|how much)\b/i.test(message);
    if (savingsRateInquiry) {
        return "CURRENT_FACT_REQUIRED";
    }

    // "Is a loan a good idea?" or "Should I refinance?" (depends on current rates)
    const loanRateInquiry = /\b(loan|refinanc|mortgage|rate)\b/i.test(message) &&
        /\b(current|today|rate|apr|terms?)\b/i.test(message);
    if (loanRateInquiry) {
        return "CURRENT_FACT_REQUIRED";
    }

    // ========== FEDERAL/REGULATORY INQUIRIES ==========
    // "Is FDIC insurance enough?" or "What's the deposit limit?" or "Am I fully insured?"
    const fdic = (/\b(fdic|deposit|insure|protect)\b/i.test(message) &&
        /\b(limit|amount|coverage|protection|insured)\b/i.test(message)) ||
        (/\b(insured|insurance|protect|coverage)\b/i.test(message) &&
            /\b(today|current|right now)\b/i.test(message));
    if (fdic) {
        return "CURRENT_FACT_REQUIRED";
    }

    // "When can I claim Social Security?" or "What's my full retirement age?" or "What are my estimated benefits?"
    const socialSecurity = /\b(social security|retirement age|full retirement|earliest|benefits?)\b/i.test(message) &&
        /\b(when|what.*age|how much|estimated|claim|eligib|my.*age)\b/i.test(message);
    if (socialSecurity) {
        return "CURRENT_FACT_REQUIRED";
    }

    // ========== GENERIC CURRENT FACT PATTERNS ==========
    // Questions explicitly asking about current/today/now with financial terms
    const genericCurrentFact = /\b(current|today|now|latest|right now|these days|2024|2025)\b/i.test(message) &&
        /\b(rate|rates|fee|fees|limit|rule|law|regulation|requirement|allow|require)\b/i.test(message);
    if (genericCurrentFact) {
        return "CURRENT_FACT_REQUIRED";
    }

    return "NOT_REQUIRED";
}

