/**
 * Advisor Persona Contracts
 *
 * Presentation and analytical-focus profiles for the financial advisor.
 *
 * CRITICAL SAFETY CONSTRAINTS:
 * 1. Personas are presentation-only (do not affect calculations or validation)
 * 2. Personas do not represent actual people or organizations
 * 3. Personas must include disclaimers (no endorsement/affiliation)
 * 4. Personas are versioned and immutable
 * 5. Persona selection is independent from household financial policy
 */

import { EntityId } from "./index";

/**
 * Advisor Persona - a presentation and analytical-focus profile
 *
 * Personas affect:
 * - Communication style and tone
 * - Analytical priorities and emphasis
 * - Framework presentation and terminology
 * - Which topics appear first/prominent
 *
 * Personas do NOT affect:
 * - Financial calculations
 * - Recommendation validation
 * - Evidence evaluation
 * - Policy compliance checks
 * - Confidence levels
 * - Risk assessment
 */
export interface AdvisorPersona {
    id: EntityId;

    // Identity (read-only after creation)
    key: string; // Immutable identifier (e.g., "kitces_v1")
    name: string; // Display name
    organization?: string; // Reference only (e.g., "Inspired by Kitces / Nerd's Eye View")
    description: string; // What this persona focuses on

    // Presentation
    focusAreas: string[]; // What topics this persona emphasizes
    communicationStyle: string; // Tone and approach description
    analyticalPriorities: string[]; // Order of importance for analysis

    // Safety
    isFictionalized: boolean; // Always true - these are profiles, not real people
    disclaimerText: string; // User-facing disclaimer about this persona
    disclaimerVersion: number; // Increment when disclaimer changes

    // Governance
    enabled: boolean; // Can users select this persona?
    version: number; // Schema version for this persona
    deprecatedAt?: Date; // When this persona was deprecated (if at all)

    // Metadata
    createdAt: Date;
    updatedAt?: Date;
}

/**
 * Persona selection in household settings
 *
 * This is kept SEPARATE from financial policy to prevent personas
 * from accidentally affecting calculations.
 */
export interface HouseholdPersonaSettings {
    householdId: EntityId;
    selectedPersonaKey?: string; // Which persona is active (optional)
    personaChangedAt?: Date; // When user last changed it
    personaChangeHistory: {
        fromKey?: string;
        toKey: string;
        changedAt: Date;
        reason?: string; // User-provided reason for change
    }[]; // Immutable audit trail
}

/**
 * Initial Advisor Personas
 *
 * These are presentation-focused profiles that help users understand
 * different perspectives on financial planning. They are NOT endorsements
 * and do NOT represent the named people or organizations.
 */

export const ADVISOR_PERSONAS = {
    KITCES: {
        id: "persona-kitces-v1" as EntityId,
        key: "kitces_framework",
        name: "Kitces Framework",
        organization: "Inspired by Kitces / Nerd's Eye View",
        description:
            "Retirement planning, tax scenarios, financial life planning, and framework-driven analysis",
        focusAreas: [
            "Retirement readiness and planning horizon",
            "Tax scenario modeling and strategies",
            "Financial life planning and milestones",
            "Framework-driven decision analysis",
            "Income and liability planning",
        ],
        communicationStyle:
            "Structured, framework-focused, and scenario-oriented. Emphasizes planning frameworks, tax optimization, and comprehensive financial modeling.",
        analyticalPriorities: [
            "Retirement adequacy and timing",
            "Tax efficiency opportunities",
            "Comprehensive life planning",
            "Scenario sensitivity analysis",
            "Planning framework alignment",
        ],
        isFictionalized: true,
        disclaimerText:
            "This persona is inspired by Kitces / Nerd's Eye View but does not represent them. It is a presentation framework for analysis only.",
        disclaimerVersion: 1,
        enabled: true,
        version: 1,
        createdAt: new Date("2026-09-09"),
    } as AdvisorPersona,

    EDELMAN: {
        id: "persona-edelman-v1" as EntityId,
        key: "edelman_framework",
        name: "Edelman Framework",
        organization: "Inspired by Edelman / Digital Assets Council",
        description:
            "Longevity and technology focus with emphasis on digital assets, estate planning, and multigenerational wealth",
        focusAreas: [
            "Longevity planning and life expectancy",
            "Technology and digital asset management",
            "Digital asset succession and inheritance",
            "Estate and multigenerational planning",
            "Cryptocurrency and alternative assets",
        ],
        communicationStyle:
            "Forward-looking, technology-aware, and multigenerational perspective. Emphasizes changing financial landscape and modern tools.",
        analyticalPriorities: [
            "Longevity and extended retirement horizon",
            "Digital and technology assets",
            "Multigenerational wealth transfer",
            "Estate and succession planning",
            "Modern financial tools and platforms",
        ],
        isFictionalized: true,
        disclaimerText:
            "This persona is inspired by Edelman / Digital Assets Council but does not represent them. It is a presentation framework for analysis only.",
        disclaimerVersion: 1,
        enabled: true,
        version: 1,
        createdAt: new Date("2026-09-09"),
    } as AdvisorPersona,

    CARSON: {
        id: "persona-carson-v1" as EntityId,
        key: "carson_framework",
        name: "Carson Framework",
        organization: "Inspired by Carson / Family Governance Models",
        description:
            "Family governance, cash-flow roadmaps, business transition, and high-net-worth planning concepts",
        focusAreas: [
            "Family governance and decision-making structures",
            "Cash-flow roadmaps and liquidity planning",
            "Business ownership and transition planning",
            "High-net-worth household structuring",
            "Family meeting facilitation and dynamics",
        ],
        communicationStyle:
            "Relational, structured around family dynamics, and business-aware. Emphasizes governance, family alignment, and transition planning.",
        analyticalPriorities: [
            "Family governance and alignment",
            "Cash-flow management and roadmaps",
            "Business transition and succession",
            "High-net-worth household structure",
            "Family decision processes",
        ],
        isFictionalized: true,
        disclaimerText:
            "This persona is inspired by Carson / Family Governance Models but does not represent them. It is a presentation framework for analysis only.",
        disclaimerVersion: 1,
        enabled: true,
        version: 1,
        createdAt: new Date("2026-09-09"),
    } as AdvisorPersona,

    WEG: {
        id: "persona-weg-v1" as EntityId,
        key: "weg_framework",
        name: "Wealth Enhancement Group Framework",
        organization: "Inspired by Wealth Enhancement Group",
        description:
            "Integrated tax, estate, and retirement-plan analysis with debt modeling emphasis",
        focusAreas: [
            "Integrated tax planning strategies",
            "Estate planning and wealth transfer",
            "Retirement plan optimization",
            "Debt strategy and modeling",
            "Multi-account tax efficiency",
        ],
        communicationStyle:
            "Analytical, tax-focused, and optimization-oriented. Emphasizes integrated planning across tax, estate, and retirement dimensions.",
        analyticalPriorities: [
            "Tax efficiency and optimization",
            "Estate and wealth transfer planning",
            "Retirement income strategies",
            "Debt structure and paydown modeling",
            "Integrated multi-account strategies",
        ],
        isFictionalized: true,
        disclaimerText:
            "This persona is inspired by Wealth Enhancement Group but does not represent them. It is a presentation framework for analysis only.",
        disclaimerVersion: 1,
        enabled: true,
        version: 1,
        createdAt: new Date("2026-09-09"),
    } as AdvisorPersona,

    CAPITAL_GROUP: {
        id: "persona-capital-group-v1" as EntityId,
        key: "capital_group_framework",
        name: "Capital Group PracticeLab Framework",
        organization: "Inspired by Capital Group PracticeLab",
        description:
            "Multigenerational wealth, tax trends, estate workflows, and 529 planning optimization",
        focusAreas: [
            "Multigenerational wealth building and preservation",
            "Tax trends and legislative monitoring",
            "Estate planning workflows and execution",
            "Education savings (529 plans) strategies",
            "Family wealth philosophy and values",
        ],
        communicationStyle:
            "Forward-thinking, compliance-aware, and education-focused. Emphasizes family values, tax awareness, and generational perspectives.",
        analyticalPriorities: [
            "Multigenerational wealth strategies",
            "Tax law trends and changes",
            "Estate workflow optimization",
            "Education funding and 529 planning",
            "Family values and wealth philosophy",
        ],
        isFictionalized: true,
        disclaimerText:
            "This persona is inspired by Capital Group PracticeLab but does not represent them. It is a presentation framework for analysis only.",
        disclaimerVersion: 1,
        enabled: true,
        version: 1,
        createdAt: new Date("2026-09-09"),
    } as AdvisorPersona,
};

/**
 * Get all available personas
 */
export function getAvailablePersonas(): AdvisorPersona[] {
    return Object.values(ADVISOR_PERSONAS).filter((p) => p.enabled);
}

/**
 * Get persona by key
 */
export function getPersonaByKey(key: string): AdvisorPersona | null {
    const persona = Object.values(ADVISOR_PERSONAS).find((p) => p.key === key);
    return persona || null;
}

/**
 * Validate that persona selection doesn't affect calculations
 *
 * This is a type guard - persona selection should be kept completely
 * separate from financial policy and recommendation logic.
 */
export function personaIsForPresentationOnly(persona: AdvisorPersona): boolean {
    // Personas can ONLY affect:
    // - Communication style
    // - Analytical focus and priority
    // - Framework presentation
    // - Topic emphasis

    // Personas can NEVER affect:
    // - Financial calculations
    // - Recommendation validation
    // - Evidence evaluation
    // - Policy compliance
    // - Confidence levels
    // - Risk assessment
    // - Data transformations

    return (
        persona.isFictionalized === true &&
        persona.disclaimerText.length > 0 &&
        persona.focusAreas.length > 0 &&
        persona.analyticalPriorities.length > 0
    );
}
