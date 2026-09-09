/**
 * Advisor Persona Tests
 *
 * Verify that:
 * 1. Personas are correctly defined and versioned
 * 2. Personas are presentation-only (don't affect calculations)
 * 3. Persona selection and history tracking work correctly
 * 4. All required disclaimers are present
 * 5. Initial personas are properly configured
 */

import { describe, it, expect } from "@jest/globals";
import {
    AdvisorPersona,
    HouseholdPersonaSettings,
    ADVISOR_PERSONAS,
    getAvailablePersonas,
    getPersonaByKey,
    personaIsForPresentationOnly,
} from "@house-fin/contracts";
import { EntityId } from "@house-fin/contracts";

describe("Advisor Personas", () => {
    describe("Persona Contract Definition", () => {
        it("should have all required fields on AdvisorPersona interface", () => {
            const persona: AdvisorPersona = ADVISOR_PERSONAS.KITCES;

            expect(persona).toHaveProperty("id");
            expect(persona).toHaveProperty("key");
            expect(persona).toHaveProperty("name");
            expect(persona).toHaveProperty("organization");
            expect(persona).toHaveProperty("description");
            expect(persona).toHaveProperty("focusAreas");
            expect(persona).toHaveProperty("communicationStyle");
            expect(persona).toHaveProperty("analyticalPriorities");
            expect(persona).toHaveProperty("isFictionalized");
            expect(persona).toHaveProperty("disclaimerText");
            expect(persona).toHaveProperty("disclaimerVersion");
            expect(persona).toHaveProperty("enabled");
            expect(persona).toHaveProperty("version");
            expect(persona).toHaveProperty("createdAt");
        });

        it("should enforce that isFictionalized is always true", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect(persona.isFictionalized).toBe(true);
            });
        });

        it("should have non-empty disclaimer text", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect(persona.disclaimerText.length).toBeGreaterThan(0);
                expect(persona.disclaimerText).toContain("does not represent");
                expect(persona.disclaimerText).toContain("presentation framework");
            });
        });

        it("should have valid organization references (not direct affiliations)", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                if (persona.organization) {
                    // Should have "Inspired by" or similar
                    expect(persona.organization.toLowerCase()).toContain("inspired");
                    // Should NOT claim direct affiliation
                    expect(persona.organization).not.toMatch(/^(The |)[\w\s]+\s(Inc\.|LLC|Ltd|Corp|Co\.?|Foundation)$/);
                }
            });
        });
    });

    describe("Initial Personas - Kitces", () => {
        const persona = ADVISOR_PERSONAS.KITCES;

        it("should be defined and enabled", () => {
            expect(persona).toBeDefined();
            expect(persona.enabled).toBe(true);
        });

        it("should have retirement planning focus", () => {
            expect(persona.focusAreas).toContain("Retirement readiness and planning horizon");
            expect(persona.description.toLowerCase()).toContain("retirement");
        });

        it("should have tax scenario emphasis", () => {
            expect(persona.focusAreas.some((f) => f.includes("Tax"))).toBe(true);
            expect(persona.analyticalPriorities.some((p) => p.includes("Tax"))).toBe(true);
        });

        it("should have framework-driven communication style", () => {
            expect(persona.communicationStyle).toContain("framework");
        });

        it("should be presentation-only", () => {
            expect(personaIsForPresentationOnly(persona)).toBe(true);
        });
    });

    describe("Initial Personas - Edelman", () => {
        const persona = ADVISOR_PERSONAS.EDELMAN;

        it("should be defined and enabled", () => {
            expect(persona).toBeDefined();
            expect(persona.enabled).toBe(true);
        });

        it("should have longevity and technology focus", () => {
            expect(persona.focusAreas.some((f) => f.includes("Longevity"))).toBe(true);
            expect(persona.focusAreas.some((f) => f.includes("Technology"))).toBe(true);
        });

        it("should emphasize digital assets and estate planning", () => {
            expect(persona.focusAreas.some((f) => f.includes("Digital"))).toBe(true);
            expect(persona.focusAreas.some((f) => f.includes("Estate"))).toBe(true);
        });

        it("should be presentation-only", () => {
            expect(personaIsForPresentationOnly(persona)).toBe(true);
        });
    });

    describe("Initial Personas - Carson", () => {
        const persona = ADVISOR_PERSONAS.CARSON;

        it("should be defined and enabled", () => {
            expect(persona).toBeDefined();
            expect(persona.enabled).toBe(true);
        });

        it("should have family governance focus", () => {
            expect(persona.focusAreas.some((f) => f.includes("Family governance"))).toBe(true);
            expect(persona.description.toLowerCase()).toContain("family");
        });

        it("should emphasize business and cash-flow planning", () => {
            expect(persona.focusAreas.some((f) => f.includes("Cash-flow"))).toBe(true);
            expect(persona.focusAreas.some((f) => f.includes("Business"))).toBe(true);
        });

        it("should be presentation-only", () => {
            expect(personaIsForPresentationOnly(persona)).toBe(true);
        });
    });

    describe("Initial Personas - Wealth Enhancement Group", () => {
        const persona = ADVISOR_PERSONAS.WEG;

        it("should be defined and enabled", () => {
            expect(persona).toBeDefined();
            expect(persona.enabled).toBe(true);
        });

        it("should have integrated tax and estate focus", () => {
            expect(persona.focusAreas.some((f) => f.includes("tax"))).toBe(true);
            expect(persona.focusAreas.some((f) => f.includes("Estate"))).toBe(true);
        });

        it("should emphasize retirement plans and debt modeling", () => {
            expect(persona.focusAreas.some((f) => f.includes("Retirement"))).toBe(true);
            expect(persona.focusAreas.some((f) => f.includes("Debt"))).toBe(true);
        });

        it("should be presentation-only", () => {
            expect(personaIsForPresentationOnly(persona)).toBe(true);
        });
    });

    describe("Initial Personas - Capital Group", () => {
        const persona = ADVISOR_PERSONAS.CAPITAL_GROUP;

        it("should be defined and enabled", () => {
            expect(persona).toBeDefined();
            expect(persona.enabled).toBe(true);
        });

        it("should have multigenerational and tax trends focus", () => {
            expect(persona.focusAreas.some((f) => f.includes("Multigenerational"))).toBe(true);
            expect(persona.focusAreas.some((f) => f.includes("Tax"))).toBe(true);
        });

        it("should emphasize 529 planning and estate workflows", () => {
            expect(persona.focusAreas.some((f) => f.includes("529"))).toBe(true);
            expect(persona.focusAreas.some((f) => f.includes("Estate"))).toBe(true);
        });

        it("should be presentation-only", () => {
            expect(personaIsForPresentationOnly(persona)).toBe(true);
        });
    });

    describe("Persona Access Functions", () => {
        it("should return all available personas", () => {
            const available = getAvailablePersonas();

            expect(available).toHaveLength(5);
            expect(available.map((p) => p.key)).toContain("kitces_framework");
            expect(available.map((p) => p.key)).toContain("edelman_framework");
            expect(available.map((p) => p.key)).toContain("carson_framework");
            expect(available.map((p) => p.key)).toContain("weg_framework");
            expect(available.map((p) => p.key)).toContain("capital_group_framework");
        });

        it("should retrieve persona by key", () => {
            const persona = getPersonaByKey("kitces_framework");

            expect(persona).toBeDefined();
            expect(persona?.name).toBe("Kitces Framework");
            expect(persona?.key).toBe("kitces_framework");
        });

        it("should return null for unknown persona key", () => {
            const persona = getPersonaByKey("unknown_framework");

            expect(persona).toBeNull();
        });

        it("should only include enabled personas", () => {
            const available = getAvailablePersonas();
            const allEnabled = available.every((p) => p.enabled === true);

            expect(allEnabled).toBe(true);
        });
    });

    describe("Versioning", () => {
        it("should have version number on all personas", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect(persona.version).toBeGreaterThanOrEqual(1);
                expect(Number.isInteger(persona.version)).toBe(true);
            });
        });

        it("should have disclaimer version for tracking changes", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect(persona.disclaimerVersion).toBeGreaterThanOrEqual(1);
                expect(Number.isInteger(persona.disclaimerVersion)).toBe(true);
            });
        });

        it("should have createdAt timestamp", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect(persona.createdAt).toBeInstanceOf(Date);
            });
        });

        it("should optionally have deprecatedAt timestamp", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                if (persona.deprecatedAt) {
                    expect(persona.deprecatedAt).toBeInstanceOf(Date);
                }
            });
        });
    });

    describe("Persona Content Validation", () => {
        it("should have 4+ focus areas per persona", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect(persona.focusAreas.length).toBeGreaterThanOrEqual(4);
            });
        });

        it("should have 5+ analytical priorities per persona", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect(persona.analyticalPriorities.length).toBeGreaterThanOrEqual(5);
            });
        });

        it("should have descriptive communication style", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect(persona.communicationStyle.length).toBeGreaterThan(20);
                expect(persona.communicationStyle).toBeTruthy();
            });
        });

        it("should have non-empty name and description", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect(persona.name.length).toBeGreaterThan(0);
                expect(persona.description.length).toBeGreaterThan(0);
            });
        });
    });

    describe("Presentation-Only Constraint Verification", () => {
        it("should pass presentation-only validation for all personas", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect(personaIsForPresentationOnly(persona)).toBe(true);
            });
        });

        it("should NOT have any calculation-related properties", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect(persona).not.toHaveProperty("calculationVersion");
                expect(persona).not.toHaveProperty("confidenceOverride");
                expect(persona).not.toHaveProperty("validationModifier");
                expect(persona).not.toHaveProperty("policyOverride");
            });
        });

        it("should only affect presentation properties", () => {
            const persona = ADVISOR_PERSONAS.KITCES;

            // Allowed presentation properties
            expect(persona.communicationStyle).toBeTruthy();
            expect(persona.focusAreas).toBeDefined();
            expect(persona.analyticalPriorities).toBeDefined();
            expect(persona.name).toBeTruthy();
            expect(persona.description).toBeTruthy();

            // These should NOT exist
            expect((persona as any).calculationModifier).toBeUndefined();
            expect((persona as any).validationRule).toBeUndefined();
            expect((persona as any).confidenceMultiplier).toBeUndefined();
        });
    });

    describe("Household Persona Settings", () => {
        it("should support optional persona selection", () => {
            const settings: HouseholdPersonaSettings = {
                householdId: "household-123" as EntityId,
                selectedPersonaKey: "kitces_framework",
                personaChangeHistory: [
                    {
                        toKey: "kitces_framework",
                        changedAt: new Date(),
                    },
                ],
            };

            expect(settings.selectedPersonaKey).toBe("kitces_framework");
            expect(settings.personaChangeHistory).toHaveLength(1);
        });

        it("should track persona change history", () => {
            const settings: HouseholdPersonaSettings = {
                householdId: "household-123" as EntityId,
                selectedPersonaKey: "edelman_framework",
                personaChangeHistory: [
                    {
                        toKey: "kitces_framework",
                        changedAt: new Date("2026-09-01"),
                        reason: "User preference",
                    },
                    {
                        fromKey: "kitces_framework",
                        toKey: "edelman_framework",
                        changedAt: new Date("2026-09-09"),
                        reason: "Exploring different approach",
                    },
                ],
            };

            expect(settings.personaChangeHistory).toHaveLength(2);
            expect(settings.personaChangeHistory[0].toKey).toBe("kitces_framework");
            expect(settings.personaChangeHistory[1].fromKey).toBe("kitces_framework");
        });

        it("should support undefined selected persona (default behavior)", () => {
            const settings: HouseholdPersonaSettings = {
                householdId: "household-123" as EntityId,
                personaChangeHistory: [],
            };

            expect(settings.selectedPersonaKey).toBeUndefined();
        });

        it("should allow tracking when persona was changed", () => {
            const settings: HouseholdPersonaSettings = {
                householdId: "household-123" as EntityId,
                selectedPersonaKey: "kitces_framework",
                personaChangedAt: new Date("2026-09-09T12:00:00Z"),
                personaChangeHistory: [],
            };

            expect(settings.personaChangedAt).toBeInstanceOf(Date);
        });
    });

    describe("Persona Integrity", () => {
        it("should have unique keys across all personas", () => {
            const keys = Object.values(ADVISOR_PERSONAS).map((p) => p.key);
            const uniqueKeys = new Set(keys);

            expect(uniqueKeys.size).toBe(keys.length);
        });

        it("should have unique names across all personas", () => {
            const names = Object.values(ADVISOR_PERSONAS).map((p) => p.name);
            const uniqueNames = new Set(names);

            expect(uniqueNames.size).toBe(names.length);
        });

        it("should have consistent disclaimer format", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect(persona.disclaimerText).toMatch(/does not represent/i);
                expect(persona.disclaimerText).toMatch(/presentation framework/i);
                expect(persona.disclaimerText).toMatch(/analysis only/i);
            });
        });

        it("should have non-overlapping focus area keywords", () => {
            // While personas can share some keywords, each should have unique emphasis
            const kitcesFocus = ADVISOR_PERSONAS.KITCES.focusAreas.join(" ").toLowerCase();
            const edelmanFocus = ADVISOR_PERSONAS.EDELMAN.focusAreas.join(" ").toLowerCase();
            const carsonFocus = ADVISOR_PERSONAS.CARSON.focusAreas.join(" ").toLowerCase();

            // Each should have distinct keywords
            expect(kitcesFocus).toContain("retirement");
            expect(kitcesFocus).toContain("tax");
            expect(edelmanFocus).toContain("digital");
            expect(edelmanFocus).toContain("longevity");
            expect(carsonFocus).toContain("family");
            expect(carsonFocus).toContain("business");
        });
    });

    describe("Persona Independence from Financial Logic", () => {
        it("should not have any calculation-affecting properties", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                const personaStr = JSON.stringify(persona);

                // Should NOT contain calculation-related terms
                expect(personaStr).not.toContain("weight");
                expect(personaStr).not.toContain("multiplier");
                expect(personaStr).not.toContain("override");
                expect(personaStr).not.toContain("modify");
                expect(personaStr).not.toContain("adjust");
                expect(personaStr).not.toContain("filter");
                expect(personaStr).not.toContain("rule");
            });
        });

        it("should be selectable independently of household policy", () => {
            // Persona settings should be completely separate
            const personaSettings: HouseholdPersonaSettings = {
                householdId: "h1" as EntityId,
                selectedPersonaKey: "kitces_framework",
                personaChangeHistory: [],
            };

            // This should not affect any financial policy
            expect(personaSettings.selectedPersonaKey).toBeTruthy();
            // Personas should never contain policy fields
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect((persona as any).policyVersion).toBeUndefined();
                expect((persona as any).householdPolicy).toBeUndefined();
            });
        });
    });

    describe("Disclaimer Compliance", () => {
        it("should indicate all personas are presentation frameworks", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect(persona.isFictionalized).toBe(true);
                expect(persona.disclaimerText).toContain("presentation framework");
            });
        });

        it("should never claim endorsement or affiliation", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                const disclaimer = persona.disclaimerText.toLowerCase();

                // Should NOT claim endorsement
                expect(disclaimer).not.toContain("endorsed");
                expect(disclaimer).not.toContain("affiliated");
                expect(disclaimer).not.toContain("approved");

                // Should only "inspire" or reference
                expect(persona.organization || "").toContain("Inspired");
            });
        });

        it("should state these are presentation frameworks only", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect(persona.disclaimerText).toContain("presentation framework");
            });
        });

        it("should clarify these are for analysis only", () => {
            Object.values(ADVISOR_PERSONAS).forEach((persona) => {
                expect(persona.disclaimerText).toContain("analysis only");
            });
        });
    });

    describe("Edge Cases", () => {
        it("should handle persona with no organization reference", () => {
            // While our initial personas all have org references, this should be allowed
            const customPersona: AdvisorPersona = {
                id: "custom-1" as EntityId,
                key: "custom_framework",
                name: "Custom Framework",
                description: "A custom analytical framework",
                focusAreas: ["Focus 1", "Focus 2"],
                communicationStyle: "Direct and analytical",
                analyticalPriorities: ["Priority 1", "Priority 2"],
                isFictionalized: true,
                disclaimerText: "This is a custom framework for analysis only",
                disclaimerVersion: 1,
                enabled: true,
                version: 1,
                createdAt: new Date(),
            };

            expect(personaIsForPresentationOnly(customPersona)).toBe(true);
        });

        it("should support deprecating older personas", () => {
            const deprecatedPersona: AdvisorPersona = {
                ...ADVISOR_PERSONAS.KITCES,
                deprecatedAt: new Date("2026-12-31"),
                enabled: false,
            };

            expect(deprecatedPersona.deprecatedAt).toBeDefined();
            expect(deprecatedPersona.enabled).toBe(false);
        });
    });
});
