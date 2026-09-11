import { AdvisorWorkflow } from "@house-fin/contracts";
import { ToolExecutionResult } from "./ai-tool-executor";
import { RecommendationResearchOutcome, ResearchRequirement } from "./recommendation-research";

export interface OrchestratedRecommendationWorkflow {
    scenarioConstruction: {
        sourceTools: string[];
    };
    candidates: string[];
    validation: {
        status: "PASS" | "INSUFFICIENT_INFORMATION";
        summary: string;
    };
    finalRecommendation?: string;
}

const RECOMMENDATION_WORKFLOWS = new Set<AdvisorWorkflow>([
    AdvisorWorkflow.BUDGET_CREATE,
    AdvisorWorkflow.BUDGET_REVISE,
    AdvisorWorkflow.BUDGET_SCENARIO,
    AdvisorWorkflow.AFFORDABILITY,
]);

export function isRecommendationWorkflow(
    workflowType: AdvisorWorkflow,
    researchRequirement: ResearchRequirement
): boolean {
    return RECOMMENDATION_WORKFLOWS.has(workflowType) || researchRequirement.level !== "NOT_REQUIRED";
}

function collectCandidateStrings(value: unknown, candidates: string[]): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
        value.forEach((item) => collectCandidateStrings(item, candidates));
        return;
    }

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (key === "recommendations" && Array.isArray(child)) {
            candidates.push(...child.filter((item): item is string => typeof item === "string" && item.trim().length > 0));
            continue;
        }
        collectCandidateStrings(child, candidates);
    }
}

export function buildToolBackedRecommendationWorkflow(
    toolResults: ToolExecutionResult[],
    researchRequirement: ResearchRequirement,
    research: RecommendationResearchOutcome
): OrchestratedRecommendationWorkflow {
    const successfulResults = toolResults.filter((result) => result.success);
    const candidates: string[] = [];
    successfulResults.forEach((result) => collectCandidateStrings(result.data, candidates));
    const uniqueCandidates = Array.from(new Set(candidates));
    const researchSatisfied = researchRequirement.level !== "REQUIRED" || research.status === "VERIFIED";
    const validationPassed = uniqueCandidates.length > 0 && researchSatisfied;

    return {
        scenarioConstruction: {
            sourceTools: successfulResults.map((result) => result.toolName),
        },
        candidates: uniqueCandidates,
        validation: {
            status: validationPassed ? "PASS" : "INSUFFICIENT_INFORMATION",
            summary: validationPassed
                ? "Candidate provenance and required research were independently checked."
                : "No tool-grounded candidate recommendation could be independently validated.",
        },
        finalRecommendation: validationPassed ? uniqueCandidates[0] : undefined,
    };
}

export interface AdvisorStyle {
    key: string;
    label: string;
    instruction: string;
}

const ADVISOR_STYLES: Record<string, AdvisorStyle> = {
    kitces_framework: {
        key: "kitces_framework",
        label: "Retirement Planning",
        instruction: "Use a structured retirement-planning perspective with clear planning horizons.",
    },
    edelman_framework: {
        key: "edelman_framework",
        label: "Longevity Planning",
        instruction: "Use a long-term resilience and longevity-planning perspective.",
    },
    carson_framework: {
        key: "carson_framework",
        label: "Family Planning",
        instruction: "Use a household decision-making and family-planning perspective.",
    },
    weg_framework: {
        key: "weg_framework",
        label: "Integrated Tax Planning",
        instruction: "Use an integrated tax and financial-planning perspective.",
    },
    capital_group_framework: {
        key: "capital_group_framework",
        label: "Multigenerational Planning",
        instruction: "Use a multigenerational and education-planning perspective.",
    },
};

export function resolveAdvisorStyle(personaKey?: string): AdvisorStyle {
    return (personaKey && ADVISOR_STYLES[personaKey]) || ADVISOR_STYLES.kitces_framework;
}
