/**
 * Recommendation Candidate Builder
 *
 * Generates structured candidate recommendations from:
 * - Financial scenarios
 * - Household policy
 * - Evidence/research
 * - Current financial state
 * - User intent
 *
 * Key principles:
 * - NO unsupported claims (all facts from evidence, calculations from tools)
 * - Multiple candidates where meaningful alternatives exist
 * - All financial impacts from scenario tool outputs
 * - Candidates are immutable, deterministic, reproducible
 * - Confidence based on data quality + evidence freshness + calculation strength
 */

import {
    EntityId,
    Money,
    FinancialSnapshot,
    FinancialHealthStatus,
    RecommendationType,
    RecommendationAlternative,
    RecommendationAssumption,
    RecommendationRisk,
    RecommendationEvidence,
    ConfidenceLevel,
    Scenario,
    ScenarioType,
    Evidence,
    SourceTier,
} from "@house-fin/contracts";

/**
 * Candidate recommendation before validation and approval
 *
 * A candidate is not yet a final recommendation - it's a potential option
 * that has been structured but not yet validated or approved.
 */
export interface RecommendationCandidate {
    // Identification
    id: string; // Deterministic ID (hash of key elements)
    type: RecommendationType;
    title: string; // e.g., "Allocate $10,000 bonus to emergency fund"
    summary: string; // Paragraph summary

    // The actual recommendation
    recommendedAction: string; // What to do and why
    alternatives: RecommendationAlternative[]; // Alternatives with rationale

    // Financial basis
    scenarioIds: EntityId[]; // Which scenarios support this?
    expectedImpact: {
        cashFlowImpact: Money;
        wealthIncrease: Money;
        debtReduction: Money;
        timeframeMonths?: number;
    };

    // Reasoning
    evidence: RecommendationEvidence[]; // What facts support this?
    assumptions: RecommendationAssumption[]; // What are we assuming?
    risks: RecommendationRisk[]; // What could go wrong?

    // Confidence
    confidence: ConfidenceLevel;
    confidenceReasoning: string;
    confidenceFactors: {
        dataQuality: "HIGH" | "MEDIUM" | "LOW"; // Snapshot age, completeness
        calculationStrength: "HIGH" | "MEDIUM" | "LOW"; // Complexity, edge cases
        evidenceFreshness: "CURRENT" | "RECENT" | "STALE" | "EXPIRED"; // Research age
        evidenceTier: "TIER_1_GOVERNMENT" | "TIER_2_PROVIDER" | "TIER_3_RESEARCH" | "TIER_4_MEDIA"; // Best source used
    };

    // Policy compliance
    compliesWithPolicy: boolean;
    policyViolations?: string[]; // If any
    policyVersion: number;

    // Metadata
    createdAt: Date;
    rationale: string; // Why we're proposing this
    rationale_detailed?: string; // Detailed reasoning
}

/**
 * Builder input: all context needed to generate candidates
 */
export interface RecommendationBuilderInput {
    householdId: EntityId;
    memberId: EntityId;
    conversationId?: EntityId;
    intent: RecommendationType;
    financialSnapshot: FinancialSnapshot;
    policyVersion: number;
    scenarios: Scenario[]; // From scenario-service
    availableEvidence: Evidence[]; // From evidence tracker
    userGoals?: string[]; // What does user want to achieve?
    constraints?: string[]; // Any limitations?
}

/**
 * Build candidate recommendations from scenarios and policy
 *
 * This function:
 * 1. Maps scenarios to recommendation types
 * 2. Groups related scenarios as alternatives
 * 3. Applies household policy constraints
 * 4. Links relevant evidence
 * 5. Calculates confidence levels
 * 6. Returns multiple candidates where alternatives exist
 *
 * Does NOT use LLM - pure deterministic logic.
 */
export function generateCandidateRecommendations(
    input: RecommendationBuilderInput
): RecommendationCandidate[] {
    const candidates: RecommendationCandidate[] = [];

    // Map scenarios to recommendation types and group
    const scenariosByType = groupScenariosByType(input.scenarios);

    // Generate candidates based on intent
    switch (input.intent) {
        case RecommendationType.WINDFALL_ALLOCATION:
            return generateWindfallCandidates(input, scenariosByType);

        case RecommendationType.SAVINGS_ALLOCATION:
            return generateSavingsAllocationCandidates(input, scenariosByType);

        case RecommendationType.DEBT_ACTION:
            return generateDebtActionCandidates(input, scenariosByType);

        case RecommendationType.CASH_MANAGEMENT:
            // Handle affordability scenarios under CASH_MANAGEMENT
            if (scenariosByType.has(ScenarioType.AFFORDABILITY)) {
                return generateAffordabilityCandidates(input, scenariosByType);
            }
            return generateGenericDecisionCandidates(input, scenariosByType);

        case RecommendationType.EMERGENCY_FUND:
            return generateEmergencyFundCandidates(input, scenariosByType);

        case RecommendationType.FINANCIAL_INDEPENDENCE:
            return generateRetirementCandidates(input, scenariosByType);

        default:
            // Generic decision recommendation
            return generateGenericDecisionCandidates(input, scenariosByType);
    }
}

/**
 * Generate windfall allocation candidates
 *
 * Takes windfall scenarios and produces alternatives ranked by policy priority.
 */
function generateWindfallCandidates(
    input: RecommendationBuilderInput,
    scenariosByType: Map<ScenarioType, Scenario[]>
): RecommendationCandidate[] {
    const candidates: RecommendationCandidate[] = [];
    const scenarios = scenariosByType.get(ScenarioType.WINDFALL) || [];

    if (scenarios.length === 0) {
        return candidates;
    }

    // Primary candidate: recommended order by policy
    const efFirstScenario = scenarios.find((s) => s.title.includes("Emergency Fund First"));
    if (efFirstScenario) {
        const candidate = buildCandidateFromScenario(
            input,
            efFirstScenario,
            "Emergency Fund First",
            RecommendationType.WINDFALL_ALLOCATION,
            "Allocate bonus to emergency fund, then goals",
            true // isPreferred
        );
        candidates.push(candidate);
    }

    // Alternative: debt reduction (if applicable)
    const debtScenario = scenarios.find((s) => s.title.includes("Debt Reduction") || s.title.includes("High-Interest"));
    if (debtScenario && input.financialSnapshot.debt > Money(0)) {
        const altCandidate = buildCandidateFromScenario(
            input,
            debtScenario,
            "Pay Down High-Interest Debt",
            RecommendationType.WINDFALL_ALLOCATION,
            "Reduce high-interest debt, improve cash flow",
            false
        );
        candidates.push(altCandidate);
    }

    // Alternative: balanced allocation
    const balancedScenario = scenarios.find((s) => s.title.includes("Balanced"));
    if (balancedScenario) {
        const altCandidate = buildCandidateFromScenario(
            input,
            balancedScenario,
            "Balanced Allocation",
            RecommendationType.WINDFALL_ALLOCATION,
            "Split windfall across emergency fund, debt, and goals",
            false
        );
        candidates.push(altCandidate);
    }

    return candidates;
}

/**
 * Generate savings allocation candidates
 */
function generateSavingsAllocationCandidates(
    input: RecommendationBuilderInput,
    scenariosByType: Map<ScenarioType, Scenario[]>
): RecommendationCandidate[] {
    const candidates: RecommendationCandidate[] = [];
    const scenarios = scenariosByType.get(ScenarioType.SAVINGS_ALLOCATION) || [];

    if (scenarios.length === 0) {
        return candidates;
    }

    // Preferred: emergency fund if below target
    const efScenario = scenarios.find((s) => s.title.includes("Emergency Fund"));
    if (efScenario) {
        const candidate = buildCandidateFromScenario(
            input,
            efScenario,
            "Build Emergency Fund",
            RecommendationType.SAVINGS_ALLOCATION,
            "Dedicate monthly savings to reaching 6-month emergency fund",
            true
        );
        candidates.push(candidate);
    }

    // Alternative: debt payoff
    const debtScenario = scenarios.find((s) => s.title.includes("Debt") || s.title.includes("Payoff"));
    if (debtScenario) {
        const altCandidate = buildCandidateFromScenario(
            input,
            debtScenario,
            "Accelerate Debt Payoff",
            RecommendationType.SAVINGS_ALLOCATION,
            "Allocate extra savings to high-interest debt",
            false
        );
        candidates.push(altCandidate);
    }

    return candidates;
}

/**
 * Generate debt action candidates
 */
function generateDebtActionCandidates(
    input: RecommendationBuilderInput,
    scenariosByType: Map<ScenarioType, Scenario[]>
): RecommendationCandidate[] {
    const candidates: RecommendationCandidate[] = [];
    const scenarios = scenariosByType.get(ScenarioType.DEBT_ACTION) || [];

    if (scenarios.length === 0) {
        return candidates;
    }

    // Baseline: continue current payments
    const baselineScenario = scenarios.find((s) => s.title.includes("Continue"));
    if (baselineScenario) {
        const candidate = buildCandidateFromScenario(
            input,
            baselineScenario,
            "Continue Current Approach",
            RecommendationType.DEBT_ACTION,
            "Maintain minimum debt payments (baseline)",
            true // baseline as default
        );
        candidates.push(candidate);
    }

    // Alternative: avalanche method
    const avalancheScenario = scenarios.find((s) => s.title.includes("Avalanche") || s.title.includes("High-Interest"));
    if (avalancheScenario) {
        const altCandidate = buildCandidateFromScenario(
            input,
            avalancheScenario,
            "Pay Highest-Interest Debt First (Avalanche)",
            RecommendationType.DEBT_ACTION,
            "Target highest-interest debt first to minimize interest costs",
            false
        );
        candidates.push(altCandidate);
    }

    return candidates;
}

/**
 * Generate affordability candidates
 */
function generateAffordabilityCandidates(
    input: RecommendationBuilderInput,
    scenariosByType: Map<ScenarioType, Scenario[]>
): RecommendationCandidate[] {
    const candidates: RecommendationCandidate[] = [];
    const scenarios = scenariosByType.get(ScenarioType.AFFORDABILITY) || [];

    if (scenarios.length === 0) {
        return candidates;
    }

    // Primary candidate: recommended order by policy
    const proceedScenario = scenarios.find((s) => s.title.includes("Affordable") || s.title.includes("Proceed"));
    if (proceedScenario) {
        const candidate = buildCandidateFromScenario(
            input,
            proceedScenario,
            "You Can Afford This",
            RecommendationType.CASH_MANAGEMENT,
            "Debt-to-income ratio remains healthy",
            true
        );
        candidates.push(candidate);
    }

    // Alternative: "Proceed with Caution"
    const cautionScenario = scenarios.find((s) => s.title.includes("Borderline") || s.title.includes("Caution"));
    if (cautionScenario) {
        const altCandidate = buildCandidateFromScenario(
            input,
            cautionScenario,
            "Borderline - Proceed with Caution",
            RecommendationType.CASH_MANAGEMENT,
            "Technically affordable but leaves limited flexibility",
            false
        );
        candidates.push(altCandidate);
    }

    // Alternative: "Wait and Build Emergency Fund"
    const waitScenario = scenarios.find((s) => s.title.includes("Wait") || s.title.includes("Not Affordable"));
    if (waitScenario) {
        const altCandidate = buildCandidateFromScenario(
            input,
            waitScenario,
            "Delay Purchase - Strengthen Position First",
            RecommendationType.CASH_MANAGEMENT,
            "Better to wait 12 months and build emergency fund",
            false
        );
        candidates.push(altCandidate);
    }

    return candidates;
}

/**
 * Generate emergency fund candidates
 */
function generateEmergencyFundCandidates(
    input: RecommendationBuilderInput,
    scenariosByType: Map<ScenarioType, Scenario[]>
): RecommendationCandidate[] {
    const candidates: RecommendationCandidate[] = [];

    // Check current emergency fund status
    const essentials = input.financialSnapshot.monthlyEssentialExpenses || Money(0);
    const cashAvailable = input.financialSnapshot.cash || Money(0);
    const monthsCovered = essentials > 0 ? cashAvailable / essentials : 0;

    if (monthsCovered < 3) {
        // Build emergency fund scenario
        const candidates_list: RecommendationCandidate[] = [];
        const scenario = scenariosByType.get(ScenarioType.SAVINGS_ALLOCATION)?.[0];

        if (scenario) {
            const candidate = buildCandidateFromScenario(
                input,
                scenario,
                "Build Emergency Fund",
                RecommendationType.EMERGENCY_FUND,
                `You have ${monthsCovered.toFixed(1)} months of expenses covered. Target is 3-6 months.`,
                true
            );
            candidates_list.push(candidate);
        }

        return candidates_list;
    }

    return candidates;
}

/**
 * Generate retirement/financial independence candidates
 */
function generateRetirementCandidates(
    input: RecommendationBuilderInput,
    scenariosByType: Map<ScenarioType, Scenario[]>
): RecommendationCandidate[] {
    const candidates: RecommendationCandidate[] = [];
    const scenarios = scenariosByType.get(ScenarioType.FINANCIAL_INDEPENDENCE) || [];

    if (scenarios.length === 0) {
        return candidates;
    }

    // Status quo scenario
    const statusQuoScenario = scenarios.find((s) => s.title.includes("Status Quo"));
    if (statusQuoScenario) {
        const candidate = buildCandidateFromScenario(
            input,
            statusQuoScenario,
            "Continue Current Retirement Plan",
            RecommendationType.FINANCIAL_INDEPENDENCE,
            "Maintain current savings rate",
            true
        );
        candidates.push(candidate);
    }

    // Increased savings scenario
    const increasedScenario = scenarios.find((s) => s.title.includes("Increased") || s.title.includes("Boost"));
    if (increasedScenario) {
        const altCandidate = buildCandidateFromScenario(
            input,
            increasedScenario,
            "Increase Retirement Savings",
            RecommendationType.FINANCIAL_INDEPENDENCE,
            "Boost monthly contributions for faster wealth accumulation",
            false
        );
        candidates.push(altCandidate);
    }

    return candidates;
}

/**
 * Generate generic financial decision candidates
 */
function generateGenericDecisionCandidates(
    input: RecommendationBuilderInput,
    scenariosByType: Map<ScenarioType, Scenario[]>
): RecommendationCandidate[] {
    const candidates: RecommendationCandidate[] = [];

    // Use first available scenario as primary candidate
    const firstScenario = Array.from(scenariosByType.values()).flat()[0];
    if (firstScenario) {
        const candidate = buildCandidateFromScenario(
            input,
            firstScenario,
            firstScenario.title,
            RecommendationType.GENERAL_FINANCIAL_DECISION,
            firstScenario.description,
            true
        );
        candidates.push(candidate);
    }

    // Include alternatives
    const allScenarios = Array.from(scenariosByType.values()).flat();
    for (let i = 1; i < Math.min(allScenarios.length, 3); i++) {
        const scenario = allScenarios[i];
        const candidate = buildCandidateFromScenario(
            input,
            scenario,
            scenario.title,
            RecommendationType.GENERAL_FINANCIAL_DECISION,
            scenario.description,
            false
        );
        candidates.push(candidate);
    }

    return candidates;
}

/**
 * Build a candidate recommendation from a scenario
 */
function buildCandidateFromScenario(
    input: RecommendationBuilderInput,
    scenario: Scenario,
    title: string,
    type: RecommendationType,
    summary: string,
    isPreferred: boolean
): RecommendationCandidate {
    const stableId = (prefix: string, value: string): string => {
        let hash = 2166136261;
        for (const character of value) {
            hash ^= character.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return `${prefix}-${(hash >>> 0).toString(36)}`;
    };
    // Extract assumptions from scenario
    const assumptions: RecommendationAssumption[] = scenario.assumptions.map((sa) => ({
        id: stableId("assumption", `${scenario.id}:${sa.key}`),
        key: sa.key,
        value: sa.statement,
        confidence: sa.confidence,
        reason: `Based on current financial position`,
        sensitivity: `Impact: ${sa.impact}`,
    }));

    // Add policy assumptions
    assumptions.push({
        id: "policy-efund-target",
        key: "emergency_fund_policy",
        value: "Target is 3-6 months of essential expenses",
        confidence: ConfidenceLevel.HIGH,
        reason: "Standard financial planning principle",
    });

    // Build risks from scenario sensitivities
    const risks: RecommendationRisk[] = [];
    if (scenario.sensitivities && scenario.sensitivities.length > 0) {
        scenario.sensitivities.forEach((sens) => {
            risks.push({
                id: stableId("risk", `${scenario.id}:${sens.assumptionKey}`),
                description: `Sensitivity to ${sens.assumptionKey} changes`,
                severity: "MEDIUM",
                likelihood: "POSSIBLE",
                mitigations: ["Monitor key assumptions regularly", "Be prepared to adjust plan if conditions change"],
            });
        });
    }

    // Add inherent financial risks
    if (input.financialSnapshot.financialHealthStatus === FinancialHealthStatus.CRITICAL) {
        risks.push({
            id: "risk-health-critical",
            description: "Financial health is critical - limited margin for error",
            severity: "CRITICAL",
            likelihood: "PROBABLE",
            impact: "Any unexpected expense could trigger emergency",
        });
    }

    // Link relevant evidence
    const evidence: RecommendationEvidence[] = [];
    input.availableEvidence.forEach((ev) => {
        // Match evidence to scenario type or topic
        if (isEvidenceRelevant(ev.claim, scenario)) {
            evidence.push({
                id: stableId("evidence", `${scenario.id}:${ev.id}`),
                evidenceId: ev.id,
                claim: ev.claim,
                sourceName: ev.source.name,
                sourceTier: ev.source.tier,
                sourceUrl: ev.sourceUrl,
                retrievalDate: ev.retrievalDate,
                freshness: ev.freshness,
                confidence: ev.confidence,
            });
        }
    });

    // Calculate confidence factors
    const dataQuality = assessDataQuality(input.financialSnapshot);
    const calculationStrength = assessCalculationStrength(scenario);
    const evidenceFreshness = (evidence.length > 0 ? evidence[0].freshness : "RECENT") as "CURRENT" | "RECENT" | "STALE" | "EXPIRED";
    const evidenceTier = (evidence.length > 0 ? evidence[0].sourceTier : SourceTier.TIER_3_RESEARCH) as "TIER_1_GOVERNMENT" | "TIER_2_PROVIDER" | "TIER_3_RESEARCH" | "TIER_4_MEDIA";

    // Determine overall confidence
    const confidence =
        dataQuality === "HIGH" && calculationStrength === "HIGH" && evidenceFreshness === "CURRENT"
            ? ConfidenceLevel.HIGH
            : dataQuality === "LOW" || calculationStrength === "LOW" || evidenceFreshness === "STALE"
                ? ConfidenceLevel.LOW
                : ConfidenceLevel.MEDIUM;

    // Build alternatives from other scenarios of same type
    const alternatives: RecommendationAlternative[] = [
        {
            id: stableId("alt", `${scenario.id}:${title}`),
            title,
            description: summary,
            rationale: scenario.rationale || "Based on financial analysis",
            estimatedImpact: scenario.impact.wealthIncrease,
            impactDirection: scenario.impact.wealthIncrease >= Money(0) ? "POSITIVE" : "NEGATIVE",
            isPreferred,
        },
    ];

    // Check policy compliance
    const { complies, violations } = checkPolicyCompliance(input, scenario);

    return {
        id: stableId("candidate", `${scenario.id}:${type}:${title}`),
        type,
        title,
        summary,
        recommendedAction: buildRecommendationText(scenario, isPreferred),
        alternatives,
        scenarioIds: [scenario.id],
        expectedImpact: {
            cashFlowImpact: scenario.impact.cashFlowImpact,
            wealthIncrease: scenario.impact.wealthIncrease,
            debtReduction: scenario.impact.debtReduction,
            timeframeMonths: scenario.impact.timeframeMonths,
        },
        evidence,
        assumptions,
        risks,
        confidence,
        confidenceReasoning: buildConfidenceReasoning(dataQuality, calculationStrength, evidenceFreshness),
        confidenceFactors: {
            dataQuality,
            calculationStrength,
            evidenceFreshness,
            evidenceTier,
        },
        compliesWithPolicy: complies,
        policyViolations: violations.length > 0 ? violations : undefined,
        policyVersion: input.policyVersion,
        createdAt: new Date(),
        rationale: scenario.rationale || "Financial analysis recommends this approach",
        rationale_detailed: buildDetailedRationale(scenario, input),
    };
}

/**
 * Group scenarios by type
 */
function groupScenariosByType(scenarios: Scenario[]): Map<ScenarioType, Scenario[]> {
    const grouped = new Map<ScenarioType, Scenario[]>();

    scenarios.forEach((scenario) => {
        if (!grouped.has(scenario.type)) {
            grouped.set(scenario.type, []);
        }
        grouped.get(scenario.type)!.push(scenario);
    });

    return grouped;
}

/**
 * Assess data quality of financial snapshot
 */
function assessDataQuality(snapshot: FinancialSnapshot): "HIGH" | "MEDIUM" | "LOW" {
    // Check completeness of snapshot
    const hasEssentials = snapshot.monthlyEssentialExpenses !== undefined;
    const hasDiscretionary = snapshot.monthlyDiscretionaryExpenses !== undefined;
    const hasIncome = snapshot.monthlyIncome !== undefined;
    const hasCash = snapshot.cash !== undefined;
    const hasDebt = snapshot.debt !== undefined;

    const completeness = [hasEssentials, hasDiscretionary, hasIncome, hasCash, hasDebt].filter(Boolean).length;

    if (completeness === 5) return "HIGH";
    if (completeness >= 3) return "MEDIUM";
    return "LOW";
}

/**
 * Assess strength of scenario calculations
 */
function assessCalculationStrength(scenario: Scenario): "HIGH" | "MEDIUM" | "LOW" {
    // Simple scenarios (windfall allocation) are high confidence
    // Complex scenarios (retirement projections) are lower confidence
    if (
        scenario.type === ScenarioType.WINDFALL ||
        scenario.type === ScenarioType.AFFORDABILITY ||
        scenario.type === ScenarioType.DEBT_ACTION
    ) {
        return "HIGH";
    }
    if (scenario.type === ScenarioType.FINANCIAL_INDEPENDENCE) {
        return "LOW"; // Long-term projections are less reliable
    }
    return "MEDIUM";
}

/**
 * Check if evidence is relevant to scenario
 */
function isEvidenceRelevant(claim: string, scenario: Scenario): boolean {
    const scenarioKeywords =
        scenario.type === ScenarioType.WINDFALL
            ? ["emergency fund", "savings", "allocation", "investment", "bonus", "tax"]
            : scenario.type === ScenarioType.DEBT_ACTION
                ? ["interest rate", "debt", "APR", "minimum payment", "credit"]
                : scenario.type === ScenarioType.AFFORDABILITY
                    ? ["debt-to-income", "credit", "loan", "affordability", "approval"]
                    : ["retirement", "savings", "investment", "income", "card", "annual fee", "issuer", "tax", "rate"];

    const lowerClaim = claim.toLowerCase();
    return scenarioKeywords.some((keyword) => lowerClaim.includes(keyword));
}

/**
 * Check if recommendation complies with household policy
 */
function checkPolicyCompliance(
    input: RecommendationBuilderInput,
    scenario: Scenario
): { complies: boolean; violations: string[] } {
    const violations: string[] = [];

    // Check emergency fund policy
    const efTarget = (input.financialSnapshot.monthlyEssentialExpenses || Money(0)) * 6;
    const efHalfTarget = Money(Math.round(efTarget * 0.5));
    if (scenario.resultingState.emergencyFundBalance < efHalfTarget) {
        violations.push("Would reduce emergency fund below 50% of target");
    }

    // Check debt-to-income ratio
    if (scenario.resultingState.debtToIncomeRatio > 0.5) {
        violations.push("Debt-to-income ratio would exceed 50%");
    }

    // Check minimum emergency fund
    if (scenario.resultingState.emergencyFundMonths < 1) {
        violations.push("Would leave less than 1 month emergency fund");
    }

    return {
        complies: violations.length === 0,
        violations,
    };
}

/**
 * Build recommended action text
 */
function buildRecommendationText(scenario: Scenario, isPreferred: boolean): string {
    const actionList = scenario.proposedActions.map((action) => `• ${action.title}: ${action.description}`).join("\n");

    const prefix = isPreferred ? "We recommend: " : "Alternative: ";

    return (
        prefix +
        scenario.title +
        "\n\n" +
        "Proposed actions:\n" +
        actionList +
        "\n\n" +
        `Expected impact: ${scenario.impact.wealthIncrease >= Money(0) ? "+" : "-"}$${Math.abs(scenario.impact.wealthIncrease) / 100}`
    );
}

/**
 * Build confidence reasoning
 */
function buildConfidenceReasoning(
    dataQuality: string,
    calculationStrength: string,
    evidenceFreshness: string
): string {
    const factors: string[] = [];

    if (dataQuality === "HIGH") factors.push("Complete financial data");
    else if (dataQuality === "LOW") factors.push("Incomplete financial data");

    if (calculationStrength === "HIGH") factors.push("Straightforward calculation");
    else if (calculationStrength === "LOW") factors.push("Complex long-term projection");

    if (evidenceFreshness === "CURRENT") factors.push("Current research");
    else if (evidenceFreshness === "STALE") factors.push("Older research data");

    return factors.join(". ") + ".";
}

/**
 * Build detailed rationale
 */
function buildDetailedRationale(scenario: Scenario, input: RecommendationBuilderInput): string {
    const lines: string[] = [];

    lines.push(`Current situation:`);
    lines.push(`  - Emergency fund: ${scenario.baseline.emergencyFundMonths.toFixed(1)} months of expenses`);
    lines.push(`  - Debt-to-income ratio: ${(scenario.baseline.debtToIncomeRatio * 100).toFixed(0)}%`);
    lines.push(`  - Monthly savings capacity: $${scenario.baseline.monthlySavingsCapacity / 100}`);

    lines.push(``);
    lines.push(`Proposed action:`);
    scenario.proposedActions.forEach((action) => {
        lines.push(`  - ${action.title}`);
    });

    lines.push(``);
    lines.push(`Projected outcome:`);
    lines.push(`  - Emergency fund: ${scenario.resultingState.emergencyFundMonths.toFixed(1)} months`);
    lines.push(`  - Debt-to-income ratio: ${(scenario.resultingState.debtToIncomeRatio * 100).toFixed(0)}%`);
    lines.push(`  - Wealth increase: $${scenario.impact.wealthIncrease / 100}`);
    lines.push(`  - Health score change: ${scenario.impact.healthScoreChange >= 0 ? "+" : ""}${scenario.impact.healthScoreChange} points`);

    return lines.join("\n");
}
