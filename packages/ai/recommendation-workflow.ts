import {
    AdvisorWorkflow,
    ConfidenceLevel,
    EntityId,
    FinancialHealthStatus,
    FinancialSnapshot,
    Money,
    RecommendationAlternative,
    RecommendationType,
    Scenario,
    ScenarioType,
} from "@house-fin/contracts";
import {
    extractBaseline,
    FinalRecommendation,
    generateCandidateRecommendations,
    selectFinalRecommendation,
    validateRecommendation,
    ValidationResult,
} from "@house-fin/domain";
import { ToolExecutionResult } from "./ai-tool-executor";
import { RecommendationResearchOutcome, ResearchRequirement } from "./recommendation-research";

export interface OrchestratedRecommendationWorkflow {
    scenarioConstruction: {
        sourceTools: string[];
        scenarios: Scenario[];
    };
    candidates: ReturnType<typeof generateCandidateRecommendations>;
    validations: ValidationResult[];
    validation: {
        status: ValidationResult["status"];
        summary: string;
    };
    finalRecommendation?: FinalRecommendation;
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

function getRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function findSnapshot(toolResults: ToolExecutionResult[]): FinancialSnapshot | undefined {
    const requiredMoneyFields = [
        "cash",
        "debt",
        "netWorth",
        "monthlyIncome",
        "monthlyEssentialExpenses",
        "monthlyDiscretionaryExpenses",
        "monthlySurplus",
    ];
    for (const result of toolResults) {
        if (!result.success) continue;
        const data = getRecord(result.data);
        const value = getRecord(data?.snapshot);
        if (
            !value ||
            typeof value.id !== "string" ||
            typeof value.householdId !== "string" ||
            typeof value.version !== "number" ||
            requiredMoneyFields.some((field) => !Number.isInteger(value[field]))
        ) continue;
        return {
            ...value,
            id: value.id as EntityId,
            householdId: value.householdId as EntityId,
            asOf: new Date(value.asOf as string | Date),
            calculatedAt: new Date(value.calculatedAt as string | Date),
            createdAt: new Date(value.createdAt as string | Date),
        } as FinancialSnapshot;
    }
    return undefined;
}

function collectRecommendations(value: unknown, recommendations: string[]): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
        value.forEach((item) => collectRecommendations(item, recommendations));
        return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (key === "recommendations" && Array.isArray(child)) {
            recommendations.push(...child.filter(
                (item): item is string => typeof item === "string" && item.trim().length > 0
            ));
        } else {
            collectRecommendations(child, recommendations);
        }
    }
}

function recommendationType(workflowType: AdvisorWorkflow, message: string): RecommendationType {
    if (/\b(bonus|windfall|inheritance|refund)\b/i.test(message)) return RecommendationType.WINDFALL_ALLOCATION;
    if (workflowType === AdvisorWorkflow.AFFORDABILITY) return RecommendationType.CASH_MANAGEMENT;
    if (workflowType === AdvisorWorkflow.BUDGET_CREATE || workflowType === AdvisorWorkflow.BUDGET_REVISE) {
        return RecommendationType.BUDGET_CHANGE;
    }
    if (/\b(card|amex|visa|mastercard|annual fee)\b/i.test(message)) return RecommendationType.CREDIT_CARD_DECISION;
    if (/\b(debt|loan|mortgage)\b/i.test(message)) return RecommendationType.DEBT_ACTION;
    if (/\b(retirement|401\(?k\)?|ira|financial independence)\b/i.test(message)) {
        return RecommendationType.FINANCIAL_INDEPENDENCE;
    }
    return RecommendationType.GENERAL_FINANCIAL_DECISION;
}

function scenarioType(type: RecommendationType): ScenarioType {
    switch (type) {
        case RecommendationType.WINDFALL_ALLOCATION: return ScenarioType.WINDFALL;
        case RecommendationType.DEBT_ACTION: return ScenarioType.DEBT_ACTION;
        case RecommendationType.BUDGET_CHANGE: return ScenarioType.BUDGET_CHANGE;
        case RecommendationType.CASH_MANAGEMENT: return ScenarioType.AFFORDABILITY;
        case RecommendationType.FINANCIAL_INDEPENDENCE: return ScenarioType.FINANCIAL_INDEPENDENCE;
        default: return ScenarioType.CASH_ALLOCATION;
    }
}

function buildProvenanceScenarios(
    toolResults: ToolExecutionResult[],
    snapshot: FinancialSnapshot,
    type: RecommendationType,
    policyVersion: number,
    generatedAt: Date
): Scenario[] {
    const baseline = extractBaseline(snapshot);
    const recommendations: string[] = [];
    toolResults.filter((result) => result.success).forEach((result) => collectRecommendations(result.data, recommendations));

    return Array.from(new Set(recommendations)).map((recommendation, index) => ({
        id: `scenario-${snapshot.id}-${index + 1}` as EntityId,
        householdId: snapshot.householdId,
        financialSnapshotId: snapshot.id,
        financialSnapshotVersion: snapshot.version,
        type: scenarioType(type),
        title: recommendation,
        description: recommendation,
        input: {
            sourceTools: toolResults.filter((result) => result.success).map((result) => result.toolName),
        },
        baseline,
        proposedActions: [{ id: `action-${index + 1}`, title: recommendation, description: recommendation }],
        impact: {
            immediatelyAffected: true,
            cashFlowImpact: Money(0),
            debtReduction: Money(0),
            emergencyFundIncrease: Money(0),
            investmentIncrease: Money(0),
            savingsIncrease: Money(0),
            wealthIncrease: Money(0),
            debtToIncomeChange: 0,
            healthScoreChange: 0,
            emergencyFundMonthsChange: 0,
            riskReduction: "NONE",
            flexibilityChange: "MAINTAINED",
            liquidityChange: "MAINTAINED",
        },
        resultingState: {
            emergencyFundBalance: baseline.emergencyFundBalance,
            emergencyFundMonths: baseline.emergencyFundMonths,
            totalDebt: baseline.totalDebt,
            debtToIncomeRatio: baseline.debtToIncomeRatio,
            monthlyDebtPayments: baseline.monthlyDebtPayments,
            monthlySavingsCapacity: baseline.monthlySavingsCapacity,
            monthlyAllocableAmount: baseline.monthlySavingsCapacity,
            goalFundingGap: baseline.goalFundingGap,
            goalsOnTrack: baseline.activeGoals,
            financialHealthScore: baseline.financialHealthScore,
            healthStatus: baseline.healthStatus ?? FinancialHealthStatus.AT_RISK,
        },
        assumptions: [{
            key: "financial_state_unchanged",
            statement: "Current balances, income, expenses, and household policy remain unchanged.",
            confidence: ConfidenceLevel.MEDIUM,
            impact: "HIGH",
        }],
        sensitivities: [{
            assumptionKey: "financial_state_unchanged",
            scenarios: [{
                change: "Material household financial change",
                resultingHealthScore: baseline.financialHealthScore,
                resultingDebtRatio: baseline.debtToIncomeRatio,
                stillAchievesGoal: false,
                recommendation: "Recalculate before acting.",
            }],
        }],
        order: index + 1,
        rationale: "Produced by a deterministic, household-scoped financial tool.",
        calculationVersion: 1,
        policyVersion,
        createdAt: generatedAt,
        confidence: ConfidenceLevel.MEDIUM,
        dataCompleteness: 80,
    }));
}

function includeAllAlternatives(candidates: ReturnType<typeof generateCandidateRecommendations>): void {
    const alternatives: RecommendationAlternative[] = candidates.map((candidate, index) => ({
        id: candidate.id,
        title: candidate.title,
        description: candidate.summary,
        rationale: candidate.rationale,
        estimatedImpact: candidate.expectedImpact.wealthIncrease,
        impactDirection: candidate.expectedImpact.wealthIncrease > 0 ? "POSITIVE" : "NEUTRAL",
        isPreferred: index === 0,
    }));
    candidates.forEach((candidate) => {
        candidate.alternatives = alternatives.map((alternative) => ({ ...alternative }));
    });
}

export interface BuildToolBackedRecommendationInput {
    toolResults: ToolExecutionResult[];
    researchRequirement: ResearchRequirement;
    research: RecommendationResearchOutcome;
    workflowType: AdvisorWorkflow;
    userMessage: string;
    householdId: EntityId;
    memberId: EntityId;
    conversationId?: EntityId;
    policyVersion: number;
    generatedAt?: Date;
}

export function buildToolBackedRecommendationWorkflow(
    input: BuildToolBackedRecommendationInput
): OrchestratedRecommendationWorkflow {
    const successfulResults = input.toolResults.filter((result) => result.success);
    const snapshot = findSnapshot(successfulResults);
    const emptyResult: OrchestratedRecommendationWorkflow = {
        scenarioConstruction: { sourceTools: successfulResults.map((result) => result.toolName), scenarios: [] },
        candidates: [],
        validations: [],
        validation: {
            status: "INSUFFICIENT_INFORMATION",
            summary: "A versioned financial snapshot and deterministic scenario are required.",
        },
    };
    if (!snapshot) return emptyResult;

    const generatedAt = input.generatedAt ?? new Date();
    const type = recommendationType(input.workflowType, input.userMessage);
    const scenarios = buildProvenanceScenarios(input.toolResults, snapshot, type, input.policyVersion, generatedAt);

    if (scenarios.length === 0) return emptyResult;

    const candidates = generateCandidateRecommendations({
        householdId: input.householdId,
        memberId: input.memberId,
        conversationId: input.conversationId,
        intent: type,
        financialSnapshot: snapshot,
        policyVersion: input.policyVersion,
        scenarios,
        availableEvidence: input.research.evidence,
    });
    includeAllAlternatives(candidates);
    const validatedCandidates = candidates.map((candidate) => ({
        candidate,
        validation: validateRecommendation({ candidate, financialSnapshot: snapshot, scenarios }),
    }));
    const finalRecommendation = selectFinalRecommendation(validatedCandidates) ?? undefined;
    const selectedValidation = finalRecommendation?.validation;

    return {
        scenarioConstruction: {
            sourceTools: successfulResults.map((result) => result.toolName),
            scenarios,
        },
        candidates,
        validations: validatedCandidates.map((item) => item.validation),
        validation: selectedValidation
            ? { status: selectedValidation.status, summary: selectedValidation.summary }
            : { status: "FAIL", summary: "Every candidate failed independent validation." },
        finalRecommendation,
    };
}

export interface AdvisorStyle {
    key: string;
    label: string;
    instruction: string;
}

const ADVISOR_STYLES: Record<string, AdvisorStyle> = {
    kitces_framework: { key: "kitces_framework", label: "Retirement Planning", instruction: "Use a structured retirement-planning perspective with clear planning horizons." },
    edelman_framework: { key: "edelman_framework", label: "Longevity Planning", instruction: "Use a long-term resilience and longevity-planning perspective." },
    carson_framework: { key: "carson_framework", label: "Family Planning", instruction: "Use a household decision-making and family-planning perspective." },
    weg_framework: { key: "weg_framework", label: "Integrated Tax Planning", instruction: "Use an integrated tax and financial-planning perspective." },
    capital_group_framework: { key: "capital_group_framework", label: "Multigenerational Planning", instruction: "Use a multigenerational and education-planning perspective." },
};

export function resolveAdvisorStyle(personaKey?: string): AdvisorStyle {
    return (personaKey && ADVISOR_STYLES[personaKey]) || ADVISOR_STYLES.kitces_framework;
}
