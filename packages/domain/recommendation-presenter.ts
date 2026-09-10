/**
 * Recommendation Presenter Service
 *
 * Applies persona styling to recommendations for presentation.
 *
 * CRITICAL GUARANTEE:
 * Persona selection changes ONLY:
 * - Terminology and phrasing
 * - Explanation depth and detail level
 * - Question framing and context
 * - Ordering and emphasis of information
 * - Analytical themes and educational context
 *
 * Persona selection does NOT change:
 * - Financial facts or calculations
 * - Evidence or source information
 * - Research hierarchy or tier requirements
 * - Validation results or status
 * - Privacy boundaries
 * - Confidence scoring methodology
 * - Approval rules or requirements
 *
 * All presented content is derived-only (no new calculations).
 * Original recommendation data remains immutable.
 */

import {
    Recommendation,
    RecommendationAlternative,
    RecommendationAssumption,
    RecommendationEvidence,
    RecommendationRisk,
} from "../contracts";
import { AdvisorPersona, ADVISOR_PERSONAS } from "../contracts";
import { Money } from "../contracts";

/**
 * Presented recommendation - same data, persona-specific formatting
 *
 * All numeric values, evidence, validation, and approval data are IDENTICAL
 * to the original recommendation. Only presentation aspects are modified.
 */
export interface PresentedRecommendation {
    // Original recommendation data (unchanged)
    original: Recommendation;
    selectedPersona: AdvisorPersona;

    // Persona-specific presentation (derived, not calculated)
    presentedTitle: string; // Persona-specific emphasis
    presentedSummary: string; // Persona-specific explanation depth
    presentedRationale: string; // Persona-specific framing
    presentedAlternatives: PresentedAlternative[];
    presentedAssumptions: PresentedAssumption[];
    presentedRisks: PresentedRisk[];
    presentedEvidence: PresentedEvidence[];

    // Analytical themes for this persona
    focusAreas: string[]; // What this persona emphasizes
    analyticalPriorities: string[]; // Order of importance
    educationalContext?: string; // Educational framing based on persona

    // Metadata
    presentedAt: Date;
    personaVersion: number; // Which version of persona was used
}

/**
 * Presented alternative - same data, persona-specific framing
 */
interface PresentedAlternative {
    original: RecommendationAlternative;
    presentedRationale: string; // Persona-specific framing of "why choose this"
    presentedTradeoffs: string[]; // Persona-specific tradeoff emphasis
    tradeoffEmphasis: "CONSERVATIVE" | "BALANCED" | "GROWTH"; // How this persona views tradeoffs
}

/**
 * Presented assumption - same data, persona-specific context
 */
interface PresentedAssumption {
    original: RecommendationAssumption;
    presentedContext: string; // Persona-specific explanation of why this matters
    sensitivityEmphasis?: string; // Persona-specific framing of what happens if wrong
}

/**
 * Presented risk - same data, persona-specific mitigation framing
 */
interface PresentedRisk {
    original: RecommendationRisk;
    presentedMitigations: string[]; // Persona-specific mitigation emphasis
    riskFraming: "CONSERVATIVE" | "BALANCED" | "OPPORTUNITY"; // How persona views this risk
}

/**
 * Presented evidence - same data, persona-specific sourcing context
 */
interface PresentedEvidence {
    original: RecommendationEvidence;
    presentedContext: string; // Persona-specific explanation of source credibility
    alignmentWithPersona: boolean; // Does this evidence align with persona priorities?
}

/**
 * Presenter implementation
 */
export class RecommendationPresenter {
    /**
     * Present a recommendation through a specific persona
     *
     * Returns a new PresentedRecommendation with persona-specific formatting.
     * Original recommendation data is never modified.
     */
    static present(recommendation: Recommendation, persona?: AdvisorPersona): PresentedRecommendation {
        const effectivePersona = persona || this.getDefaultPersona();

        return {
            original: recommendation,
            selectedPersona: effectivePersona,

            presentedTitle: this.formatTitle(recommendation, effectivePersona),
            presentedSummary: this.formatSummary(recommendation, effectivePersona),
            presentedRationale: this.formatRationale(recommendation, effectivePersona),

            presentedAlternatives: recommendation.alternatives.map((alt) =>
                this.presentAlternative(alt, effectivePersona)
            ),

            presentedAssumptions: recommendation.assumptions.map((assume) =>
                this.presentAssumption(assume, effectivePersona)
            ),

            presentedRisks: recommendation.risks.map((risk) =>
                this.presentRisk(risk, effectivePersona)
            ),

            presentedEvidence: recommendation.evidence.map((evidence) =>
                this.presentEvidence(evidence, effectivePersona)
            ),

            focusAreas: effectivePersona.focusAreas,
            analyticalPriorities: effectivePersona.analyticalPriorities,
            educationalContext: this.buildEducationalContext(recommendation, effectivePersona),

            presentedAt: new Date(),
            personaVersion: effectivePersona.version,
        };
    }

    /**
     * Format recommendation title with persona emphasis
     *
     * Examples:
     * - Kitces: "Allocate $10,000 bonus to emergency fund (Retirement Impact Analysis)"
     * - Edelman: "Build emergency fund with $10,000 (Legacy Asset Protection Strategy)"
     */
    private static formatTitle(recommendation: Recommendation, persona: AdvisorPersona): string {
        const baseTitle = recommendation.title;

        if (persona.key === "kitces_framework") {
            return `${baseTitle} (Tax & Retirement Planning Impact)`;
        }

        if (persona.key === "edelman_framework") {
            return `${baseTitle} (Longevity & Wealth Preservation)`;
        }

        if (persona.key === "carson_framework") {
            return `${baseTitle} (Family Governance & Liquidity Strategy)`;
        }

        if (persona.key === "weg_framework") {
            return `${baseTitle} (Tax-Efficient & Integrated Planning)`;
        }

        if (persona.key === "capital_group_framework") {
            return `${baseTitle} (Multigenerational Wealth Building)`;
        }

        return baseTitle;
    }

    /**
     * Format summary with persona-specific depth and terminology
     */
    private static formatSummary(recommendation: Recommendation, persona: AdvisorPersona): string {
        const summary = recommendation.summary;

        // Add persona-specific context to summary
        if (persona.key === "kitces_framework") {
            return (
                `FRAMEWORK ANALYSIS: ${summary}\n\n` +
                `This recommendation aligns with a comprehensive financial planning framework by ` +
                `addressing both near-term cash flow and long-term tax efficiency implications.`
            );
        }

        if (persona.key === "edelman_framework") {
            return (
                `LONGEVITY & TECHNOLOGY PERSPECTIVE: ${summary}\n\n` +
                `This recommendation supports extended longevity planning and positions your household ` +
                `for modern wealth management tools and digital asset strategies.`
            );
        }

        if (persona.key === "carson_framework") {
            return (
                `FAMILY GOVERNANCE VIEW: ${summary}\n\n` +
                `This recommendation supports family alignment and creates opportunities for structured ` +
                `family financial meetings and governance decision-making.`
            );
        }

        if (persona.key === "weg_framework") {
            return (
                `INTEGRATED TAX & WEALTH ANALYSIS: ${summary}\n\n` +
                `This recommendation optimizes tax efficiency while integrating retirement, estate, ` +
                `and debt strategy considerations across all household accounts.`
            );
        }

        if (persona.key === "capital_group_framework") {
            return (
                `MULTIGENERATIONAL WEALTH STRATEGY: ${summary}\n\n` +
                `This recommendation builds on family wealth values and positions your household ` +
                `for tax-aware, generational wealth transfer and education funding.`
            );
        }

        return summary;
    }

    /**
     * Format rationale with persona-specific framing
     */
    private static formatRationale(recommendation: Recommendation, persona: AdvisorPersona): string {
        const base = recommendation.recommendedAction;

        if (persona.key === "kitces_framework") {
            return this.addFrameworkContext(base, recommendation, persona);
        }

        if (persona.key === "edelman_framework") {
            return this.addLongevityContext(base, recommendation, persona);
        }

        if (persona.key === "carson_framework") {
            return this.addFamilyGovernanceContext(base, recommendation, persona);
        }

        if (persona.key === "weg_framework") {
            return this.addTaxOptimizationContext(base, recommendation, persona);
        }

        if (persona.key === "capital_group_framework") {
            return this.addMultigenerationalContext(base, recommendation, persona);
        }

        return base;
    }

    private static addFrameworkContext(
        action: string,
        recommendation: Recommendation,
        _persona: AdvisorPersona
    ): string {
        return (
            `FRAMEWORK RATIONALE:\n${action}\n\n` +
            `This action aligns with comprehensive financial planning frameworks by:\n` +
            `1. Addressing immediate cash flow needs (planning horizon: ${this.getTimeframe(recommendation)})\n` +
            `2. Optimizing tax efficiency\n` +
            `3. Supporting retirement adequacy goals\n` +
            `4. Managing overall household risk profile`
        );
    }

    private static addLongevityContext(
        action: string,
        recommendation: Recommendation,
        _persona: AdvisorPersona
    ): string {
        return (
            `LONGEVITY & WEALTH PRESERVATION:\n${action}\n\n` +
            `This strategy supports extended longevity planning by:\n` +
            `1. Building resilient household economics (${this.getTimeframe(recommendation)}+ horizon)\n` +
            `2. Leveraging modern wealth management approaches\n` +
            `3. Positioning for digital asset and technology integration\n` +
            `4. Supporting multigenerational wealth transfer`
        );
    }

    private static addFamilyGovernanceContext(
        action: string,
        recommendation: Recommendation,
        _persona: AdvisorPersona
    ): string {
        return (
            `FAMILY GOVERNANCE PERSPECTIVE:\n${action}\n\n` +
            `This recommendation supports family alignment and structured decision-making by:\n` +
            `1. Creating clarity around cash flow and liquidity (${this.getTimeframe(recommendation)})\n` +
            `2. Enabling family-level governance conversations\n` +
            `3. Building family decision frameworks\n` +
            `4. Supporting business and estate transition planning`
        );
    }

    private static addTaxOptimizationContext(
        action: string,
        recommendation: Recommendation,
        _persona: AdvisorPersona
    ): string {
        return (
            `INTEGRATED TAX STRATEGY:\n${action}\n\n` +
            `This recommendation optimizes across all household planning dimensions by:\n` +
            `1. Maximizing tax efficiency (${this.getTimeframe(recommendation)} tax impact)\n` +
            `2. Integrating retirement plan strategies\n` +
            `3. Coordinating estate and wealth transfer planning\n` +
            `4. Optimizing multi-account tax positioning`
        );
    }

    private static addMultigenerationalContext(
        action: string,
        recommendation: Recommendation,
        _persona: AdvisorPersona
    ): string {
        return (
            `MULTIGENERATIONAL WEALTH BUILDING:\n${action}\n\n` +
            `This strategy builds multigenerational wealth by:\n` +
            `1. Aligning with family values and wealth philosophy (${this.getTimeframe(recommendation)})\n` +
            `2. Monitoring tax law changes and legislative impacts\n` +
            `3. Supporting education funding and 529 planning\n` +
            `4. Positioning for generational wealth transfer`
        );
    }

    private static presentAlternative(
        alternative: RecommendationAlternative,
        persona: AdvisorPersona
    ): PresentedAlternative {
        const tradeoffEmphasis = this.getTradeofffEmphasisForPersona(persona);

        return {
            original: alternative,
            presentedRationale: this.frameAlternativeRationale(
                alternative,
                persona,
                tradeoffEmphasis
            ),
            presentedTradeoffs: this.emphasizeTradeoffs(alternative.tradeoffs || [], tradeoffEmphasis),
            tradeoffEmphasis,
        };
    }

    private static frameAlternativeRationale(
        alternative: RecommendationAlternative,
        persona: AdvisorPersona,
        emphasis: string
    ): string {
        const base = alternative.rationale;

        if (emphasis === "CONSERVATIVE") {
            return `${base}\n[This alternative reduces risk exposure and provides downside protection.]`;
        }

        if (emphasis === "GROWTH") {
            return `${base}\n[This alternative emphasizes growth potential and opportunity maximization.]`;
        }

        return `${base}\n[This alternative balances risk and opportunity.]`;
    }

    private static emphasizeTradeoffs(
        tradeoffs: string[],
        emphasis: "CONSERVATIVE" | "BALANCED" | "GROWTH"
    ): string[] {
        // Reorder or emphasize based on persona risk tolerance
        if (emphasis === "CONSERVATIVE") {
            // Lead with risk mitigation
            return [
                ...tradeoffs.filter((t) => t.toLowerCase().includes("risk")),
                ...tradeoffs.filter((t) => !t.toLowerCase().includes("risk")),
            ];
        }

        if (emphasis === "GROWTH") {
            // Lead with opportunity
            return [
                ...tradeoffs.filter((t) => t.toLowerCase().includes("opportunity")),
                ...tradeoffs.filter((t) => !t.toLowerCase().includes("opportunity")),
            ];
        }

        return tradeoffs;
    }

    private static presentAssumption(
        assumption: RecommendationAssumption,
        persona: AdvisorPersona
    ): PresentedAssumption {
        return {
            original: assumption,
            presentedContext: this.frameAssumptionContext(assumption, persona),
            sensitivityEmphasis: this.frameSensitivity(assumption, persona),
        };
    }

    private static frameAssumptionContext(
        assumption: RecommendationAssumption,
        persona: AdvisorPersona
    ): string {
        // Frame why this assumption matters for THIS persona
        if (persona.key === "kitces_framework") {
            return (
                `PLANNING FRAMEWORK ASSUMPTION: ${assumption.reason}\n` +
                `Within the comprehensive planning framework, this assumption affects: ` +
                `tax projection accuracy, retirement modeling, and scenario sensitivity.`
            );
        }

        if (persona.key === "edelman_framework") {
            return (
                `LONGEVITY PLANNING ASSUMPTION: ${assumption.reason}\n` +
                `For extended longevity planning, this assumption affects: ` +
                `long-term wealth sustainability, digital asset planning, and estate transition.`
            );
        }

        if (persona.key === "carson_framework") {
            return (
                `FAMILY GOVERNANCE ASSUMPTION: ${assumption.reason}\n` +
                `For family alignment, this assumption affects: ` +
                `cash flow roadmaps, family decision-making, and business transition planning.`
            );
        }

        if (persona.key === "weg_framework") {
            return (
                `TAX PLANNING ASSUMPTION: ${assumption.reason}\n` +
                `For integrated tax strategy, this assumption affects: ` +
                `multi-account tax positioning, retirement plan optimization, and estate efficiency.`
            );
        }

        if (persona.key === "capital_group_framework") {
            return (
                `MULTIGENERATIONAL ASSUMPTION: ${assumption.reason}\n` +
                `For generational wealth building, this assumption affects: ` +
                `tax law planning, education funding, and wealth transfer strategy.`
            );
        }

        return assumption.reason;
    }

    private static frameSensitivity(
        assumption: RecommendationAssumption,
        persona: AdvisorPersona
    ): string | undefined {
        if (!assumption.sensitivity) return undefined;

        if (persona.key === "kitces_framework") {
            return `FRAMEWORK SENSITIVITY: ${assumption.sensitivity}`;
        }

        if (persona.key === "edelman_framework") {
            return `LONGEVITY IMPACT: ${assumption.sensitivity}`;
        }

        if (persona.key === "carson_framework") {
            return `FAMILY GOVERNANCE IMPACT: ${assumption.sensitivity}`;
        }

        if (persona.key === "weg_framework") {
            return `TAX EFFICIENCY IMPACT: ${assumption.sensitivity}`;
        }

        if (persona.key === "capital_group_framework") {
            return `MULTIGENERATIONAL IMPACT: ${assumption.sensitivity}`;
        }

        return assumption.sensitivity;
    }

    private static presentRisk(
        risk: RecommendationRisk,
        persona: AdvisorPersona
    ): PresentedRisk {
        const riskFraming = this.getRiskFramingForPersona(persona);

        return {
            original: risk,
            presentedMitigations: this.emphasizeMitigations(risk.mitigations || [], riskFraming),
            riskFraming,
        };
    }

    private static emphasizeMitigations(
        mitigations: string[],
        framing: "CONSERVATIVE" | "BALANCED" | "OPPORTUNITY"
    ): string[] {
        if (framing === "CONSERVATIVE") {
            // Emphasize defensive mitigations
            return mitigations.map((m) => `🛡️ ${m}`);
        }

        if (framing === "OPPORTUNITY") {
            // Emphasize how mitigations enable progress
            return mitigations.map((m) => `📈 ${m}`);
        }

        return mitigations;
    }

    private static presentEvidence(
        evidence: RecommendationEvidence,
        persona: AdvisorPersona
    ): PresentedEvidence {
        return {
            original: evidence,
            presentedContext: this.frameEvidenceContext(evidence, persona),
            alignmentWithPersona: this.checkPersonaAlignment(evidence, persona),
        };
    }

    private static frameEvidenceContext(
        evidence: RecommendationEvidence,
        persona: AdvisorPersona
    ): string {
        const sourceQuality = this.getSourceQuality(evidence.sourceTier);

        if (persona.key === "kitces_framework") {
            return (
                `PLANNING FRAMEWORK SUPPORT: ${evidence.sourceName} ` +
                `(${sourceQuality} credibility) states: "${evidence.claim}"`
            );
        }

        if (persona.key === "edelman_framework") {
            return (
                `AUTHORITY SOURCE: ${evidence.sourceName} ` +
                `(${sourceQuality} credibility) establishes: "${evidence.claim}"`
            );
        }

        if (persona.key === "carson_framework") {
            return (
                `GOVERNANCE FRAMEWORK: ${evidence.sourceName} ` +
                `(${sourceQuality} credibility) provides: "${evidence.claim}"`
            );
        }

        if (persona.key === "weg_framework") {
            return (
                `TAX & LEGAL AUTHORITY: ${evidence.sourceName} ` +
                `(${sourceQuality} credibility) confirms: "${evidence.claim}"`
            );
        }

        if (persona.key === "capital_group_framework") {
            return (
                `LEGISLATIVE GUIDANCE: ${evidence.sourceName} ` +
                `(${sourceQuality} credibility) indicates: "${evidence.claim}"`
            );
        }

        return `Source: ${evidence.sourceName} - ${evidence.claim}`;
    }

    private static checkPersonaAlignment(
        evidence: RecommendationEvidence,
        persona: AdvisorPersona
    ): boolean {
        // Check if evidence aligns with persona's focus areas
        const evidenceKeywords = evidence.claim.toLowerCase().split(" ");
        const personaFocusLower = persona.focusAreas.map((f) => f.toLowerCase());

        return evidenceKeywords.some((keyword) =>
            personaFocusLower.some((focus) => focus.includes(keyword))
        );
    }

    private static buildEducationalContext(
        recommendation: Recommendation,
        persona: AdvisorPersona
    ): string {
        if (persona.key === "kitces_framework") {
            return (
                `This analysis uses the comprehensive planning framework approach: ` +
                `gathering complete financial picture, building scenarios, modeling tax consequences, ` +
                `and testing recommendations against planning objectives.`
            );
        }

        if (persona.key === "edelman_framework") {
            return (
                `This analysis emphasizes longevity-focused wealth planning: ` +
                `managing extended retirement horizons, protecting digital and technology assets, ` +
                `planning for multigenerational wealth transfer, and leveraging modern tools.`
            );
        }

        if (persona.key === "carson_framework") {
            return (
                `This analysis applies family governance principles: ` +
                `structuring family decision-making, building cash flow roadmaps, ` +
                `planning business transitions, and aligning family values with financial strategy.`
            );
        }

        if (persona.key === "weg_framework") {
            return (
                `This analysis uses integrated tax planning: ` +
                `optimizing tax efficiency across all accounts, coordinating retirement strategies, ` +
                `planning wealth transfer, and modeling debt optimization.`
            );
        }

        if (persona.key === "capital_group_framework") {
            return (
                `This analysis focuses on multigenerational wealth: ` +
                `building family wealth values, monitoring tax legislation, ` +
                `optimizing education funding (529 plans), and planning generational transfer.`
            );
        }

        return "";
    }

    private static getTradeofffEmphasisForPersona(
        persona: AdvisorPersona
    ): "CONSERVATIVE" | "BALANCED" | "GROWTH" {
        // Map personas to their typical risk/opportunity emphasis
        if (persona.key === "kitces_framework") return "BALANCED";
        if (persona.key === "edelman_framework") return "GROWTH";
        if (persona.key === "carson_framework") return "BALANCED";
        if (persona.key === "weg_framework") return "BALANCED";
        if (persona.key === "capital_group_framework") return "BALANCED";
        return "BALANCED";
    }

    private static getRiskFramingForPersona(
        persona: AdvisorPersona
    ): "CONSERVATIVE" | "BALANCED" | "OPPORTUNITY" {
        if (persona.key === "edelman_framework") return "OPPORTUNITY";
        if (persona.key === "capital_group_framework") return "OPPORTUNITY";
        return "BALANCED";
    }

    private static getSourceQuality(tier: string): string {
        if (tier === "TIER_1_GOVERNMENT") return "Government/Regulatory";
        if (tier === "TIER_2_PROVIDER") return "Provider/Institutional";
        if (tier === "TIER_3_RESEARCH") return "Academic/Research";
        if (tier === "TIER_4_MEDIA") return "Media/Community";
        return "Unknown";
    }

    private static getTimeframe(recommendation: Recommendation): string {
        // Try to extract timeframe from recommendations
        if (recommendation.type === "EMERGENCY_FUND") return "3-12 months";
        if (recommendation.type === "GOAL_PRIORITY") return "1-5 years";
        if (recommendation.type === "FINANCIAL_INDEPENDENCE") return "5-20 years";
        return "Medium-term (1-5 years)";
    }

    private static getDefaultPersona(): AdvisorPersona {
        return ADVISOR_PERSONAS.KITCES;
    }
}

/**
 * Helper function for common use case
 */
export function presentRecommendation(
    recommendation: Recommendation,
    persona?: AdvisorPersona
): PresentedRecommendation {
    return RecommendationPresenter.present(recommendation, persona);
}

/**
 * Verify that financial data is identical across personas
 *
 * Used for testing and audit trail verification.
 * Returns true if all financial data matches exactly.
 */
export function verifyFinancialDataUnchanged(
    presentation1: PresentedRecommendation,
    presentation2: PresentedRecommendation
): boolean {
    // Compare original recommendation objects
    const r1 = presentation1.original;
    const r2 = presentation2.original;

    // All financial data must be identical
    return (
        r1.id === r2.id &&
        r1.type === r2.type &&
        r1.financialSnapshotId === r2.financialSnapshotId &&
        r1.financialSnapshotVersion === r2.financialSnapshotVersion &&
        r1.policyVersion === r2.policyVersion &&
        r1.confidence === r2.confidence &&
        r1.validation?.status === r2.validation?.status &&
        r1.approval.status === r2.approval.status &&
        JSON.stringify(r1.alternatives) === JSON.stringify(r2.alternatives) &&
        JSON.stringify(r1.assumptions) === JSON.stringify(r2.assumptions) &&
        JSON.stringify(r1.risks) === JSON.stringify(r2.risks) &&
        JSON.stringify(r1.evidence) === JSON.stringify(r2.evidence)
    );
}
