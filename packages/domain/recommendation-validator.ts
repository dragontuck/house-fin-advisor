/**
 * Recommendation Validator
 *
 * Independently challenges and validates candidate recommendations.
 *
 * Checks:
 * - Mathematical correctness (recalculate from scenarios)
 * - Rule correctness (policy compliance)
 * - Evidence correctness (freshness, tier)
 * - Assumption sensitivity (what breaks this?)
 * - Alternative quality (were meaningful alternatives considered?)
 * - Downside assessment (worst plausible outcome)
 * - Bias detection (systematic favoring of product/provider/behavior/risk)
 * - Data freshness (are facts current enough?)
 *
 * Output: PASS / PASS_WITH_WARNINGS / FAIL / INSUFFICIENT_INFORMATION
 *
 * A FAIL blocks the recommendation from becoming final.
 * PASS_WITH_WARNINGS allows approval but flags concerns.
 */

import {
    EntityId,
    Money,
    FinancialSnapshot,
    FinancialHealthStatus,
    ConfidenceLevel,
    Scenario,
    ScenarioType,
} from "@house-fin/contracts";
import { RecommendationCandidate } from "./recommendation-builder";

/**
 * Validation detail for one check
 */
export interface ValidationDetail {
    category:
    | "MATH"
    | "POLICY"
    | "EVIDENCE"
    | "ASSUMPTIONS"
    | "ALTERNATIVES"
    | "DOWNSIDE"
    | "BIAS"
    | "FRESHNESS";
    status: "PASS" | "WARN" | "FAIL";
    title: string;
    description: string;
    evidence?: string; // Supporting detail
    severity?: "INFO" | "WARNING" | "ERROR";
}

/**
 * Challenge: what would break this recommendation?
 */
export interface AdversarialChallenge {
    type:
    | "ASSUMPTION"
    | "DATA_FRESHNESS"
    | "INCOME_CHANGE"
    | "EXPENSE_CHANGE"
    | "INTEREST_RATE"
    | "TAX_CONSEQUENCE"
    | "GOAL_DEADLINE"
    | "EMERGENCY"
    | "BENEFIT_OVERSTATEMENT"
    | "MISSING_DEBT"
    | "OUTDATED_TERMS"
    | "HIDDEN_COST"
    | "TIMING_RISK";
    scenario: string; // Plausible scenario
    impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; // How bad if it happens?
    likelihood: "UNLIKELY" | "POSSIBLE" | "LIKELY" | "PROBABLE";
    recommendation?: string; // What should user do instead?
}

/**
 * Complete validation result
 */
export interface ValidationResult {
    status: "PASS" | "PASS_WITH_WARNINGS" | "FAIL" | "INSUFFICIENT_INFORMATION";
    summary: string; // Human-readable summary
    passedChecks: number;
    failedChecks: number;
    warningChecks: number;
    details: ValidationDetail[];
    adversarialReview: {
        question: string; // "What would make this recommendation wrong?"
        challenges: AdversarialChallenge[];
        weaknesses: string[];
        potentialAlternatives?: string[];
    };
    confidenceAfterValidation: ConfidenceLevel;
    recommendations?: string[]; // Suggestions for user
}

/**
 * Validator input
 */
export interface ValidatorInput {
    candidate: RecommendationCandidate;
    financialSnapshot: FinancialSnapshot;
    scenarios: Scenario[];
    historicalSnapshots?: FinancialSnapshot[]; // For freshness checking
}

/**
 * Validate a candidate recommendation
 */
export function validateRecommendation(input: ValidatorInput): ValidationResult {
    const details: ValidationDetail[] = [];
    const adversarialChallenges: AdversarialChallenge[] = [];
    const weaknesses: string[] = [];
    let passedChecks = 0;
    let failedChecks = 0;
    let warningChecks = 0;

    // 1. MATHEMATICAL CORRECTNESS
    const mathCheck = validateMathematicalCorrectness(input);
    details.push(...mathCheck.details);
    passedChecks += mathCheck.passed;
    failedChecks += mathCheck.failed;
    warningChecks += mathCheck.warnings;

    // 2. POLICY COMPLIANCE
    const policyCheck = validatePolicyCompliance(input);
    details.push(...policyCheck.details);
    passedChecks += policyCheck.passed;
    failedChecks += policyCheck.failed;
    warningChecks += policyCheck.warnings;

    // 3. EVIDENCE QUALITY
    const evidenceCheck = validateEvidenceQuality(input);
    details.push(...evidenceCheck.details);
    passedChecks += evidenceCheck.passed;
    failedChecks += evidenceCheck.failed;
    warningChecks += evidenceCheck.warnings;
    if (evidenceCheck.weaknesses) {
        weaknesses.push(...evidenceCheck.weaknesses);
    }

    // 4. ASSUMPTION SENSITIVITY
    const sensitivityCheck = analyzeAssumptionSensitivity(input);
    details.push(...sensitivityCheck.details);
    passedChecks += sensitivityCheck.passed;
    failedChecks += sensitivityCheck.failed;
    warningChecks += sensitivityCheck.warnings;
    if (sensitivityCheck.challenges) {
        adversarialChallenges.push(...sensitivityCheck.challenges);
    }

    // 5. ALTERNATIVE QUALITY
    const altCheck = validateAlternativeQuality(input);
    details.push(...altCheck.details);
    passedChecks += altCheck.passed;
    failedChecks += altCheck.failed;
    warningChecks += altCheck.warnings;

    // 6. DOWNSIDE ASSESSMENT
    const downsideCheck = assessDownside(input);
    details.push(...downsideCheck.details);
    passedChecks += downsideCheck.passed;
    failedChecks += downsideCheck.failed;
    warningChecks += downsideCheck.warnings;
    if (downsideCheck.challenges) {
        adversarialChallenges.push(...downsideCheck.challenges);
    }
    if (downsideCheck.weaknesses) {
        weaknesses.push(...downsideCheck.weaknesses);
    }

    // 7. BIAS DETECTION
    const biasCheck = detectBias(input);
    details.push(...biasCheck.details);
    passedChecks += biasCheck.passed;
    failedChecks += biasCheck.failed;
    warningChecks += biasCheck.warnings;
    if (biasCheck.weaknesses) {
        weaknesses.push(...biasCheck.weaknesses);
    }

    // 8. DATA FRESHNESS
    const freshnessCheck = checkDataFreshness(input);
    details.push(...freshnessCheck.details);
    passedChecks += freshnessCheck.passed;
    failedChecks += freshnessCheck.failed;
    warningChecks += freshnessCheck.warnings;

    // Determine overall status
    let status: "PASS" | "PASS_WITH_WARNINGS" | "FAIL" | "INSUFFICIENT_INFORMATION";
    if (failedChecks > 0) {
        status = "FAIL";
    } else if (warningChecks > 0) {
        status = "PASS_WITH_WARNINGS";
    } else if (passedChecks === 0 && details.length === 0) {
        status = "INSUFFICIENT_INFORMATION";
    } else {
        status = "PASS";
    }

    // Adjust confidence based on validation outcome
    const confidenceAfterValidation = recalibrateConfidence(
        input.candidate.confidence,
        status,
        input.candidate.confidenceFactors
    );

    // Build summary
    const summary = buildValidationSummary(
        status,
        passedChecks,
        failedChecks,
        warningChecks,
        adversarialChallenges
    );

    return {
        status,
        summary,
        passedChecks,
        failedChecks,
        warningChecks,
        details,
        adversarialReview: {
            question: "What would make this recommendation wrong?",
            challenges: adversarialChallenges,
            weaknesses,
        },
        confidenceAfterValidation,
        recommendations: generateRecommendations(status, details, adversarialChallenges),
    };
}

/**
 * Validate mathematical correctness
 *
 * Recalculate key financial impacts from scenarios.
 * Check that impact matches claimed expectations.
 */
function validateMathematicalCorrectness(input: ValidatorInput): {
    details: ValidationDetail[];
    passed: number;
    failed: number;
    warnings: number;
} {
    const details: ValidationDetail[] = [];
    let passed = 0;
    let failed = 0;
    let warnings = 0;

    const { candidate, scenarios } = input;

    // Find supporting scenarios
    const supportingScenarios = scenarios.filter((s) => candidate.scenarioIds.includes(s.id));

    if (supportingScenarios.length === 0) {
        details.push({
            category: "MATH",
            status: "FAIL",
            title: "No supporting scenarios found",
            description: "Candidate references scenarios that don't exist or weren't provided",
            severity: "ERROR",
        });
        failed++;
        return { details, passed, failed, warnings };
    }

    // Verify wealth increase is at least as good as any scenario
    const maxWealthIncrease = Math.max(
        ...supportingScenarios.map((s) => s.impact.wealthIncrease)
    );
    if (candidate.expectedImpact.wealthIncrease > Money(Math.round(maxWealthIncrease * 1.05))) {
        details.push({
            category: "MATH",
            status: "FAIL",
            title: "Claimed wealth increase exceeds scenarios",
            description: `Candidate claims wealth increase of ${candidate.expectedImpact.wealthIncrease}, but max scenario only produces ${maxWealthIncrease}`,
            severity: "ERROR",
        });
        failed++;
    } else {
        details.push({
            category: "MATH",
            status: "PASS",
            title: "Wealth impact validated against scenarios",
            description: "Financial impacts align with supporting scenarios",
        });
        passed++;
    }

    // Verify debt reduction
    const maxDebtReduction = Math.max(...supportingScenarios.map((s) => s.impact.debtReduction));
    if (candidate.expectedImpact.debtReduction > Money(Math.round(maxDebtReduction * 1.05))) {
        details.push({
            category: "MATH",
            status: "WARN",
            title: "Debt reduction may be overstated",
            description: `Claimed ${candidate.expectedImpact.debtReduction}, max scenario produces ${maxDebtReduction}`,
            severity: "WARNING",
        });
        warnings++;
    } else if (candidate.expectedImpact.debtReduction > Money(0)) {
        details.push({
            category: "MATH",
            status: "PASS",
            title: "Debt reduction calculations verified",
            description: "Debt impact supported by scenarios",
        });
        passed++;
    }

    // Check for impossible scenarios
    const snapshot = input.financialSnapshot;
    if (candidate.expectedImpact.wealthIncrease < Money(0) && snapshot.netWorth < Money(1000)) {
        details.push({
            category: "MATH",
            status: "WARN",
            title: "Negative wealth impact on weak position",
            description: "Recommendation would reduce wealth when household is already fragile",
            severity: "WARNING",
        });
        warnings++;
    }

    return { details, passed, failed, warnings };
}

/**
 * Validate policy compliance
 *
 * Check if recommendation violates household financial policy
 */
function validatePolicyCompliance(input: ValidatorInput): {
    details: ValidationDetail[];
    passed: number;
    failed: number;
    warnings: number;
} {
    const details: ValidationDetail[] = [];
    let passed = 0;
    let failed = 0;
    let warnings = 0;

    const { candidate, scenarios } = input;

    // Use the primary scenario for resulting state
    const primaryScenario = scenarios.find((s) => candidate.scenarioIds[0] === s.id);
    if (!primaryScenario) {
        details.push({
            category: "POLICY",
            status: "FAIL",
            title: "Primary scenario missing",
            description: "Cannot validate policy without primary scenario",
            severity: "ERROR",
        });
        failed++;
        return { details, passed, failed, warnings };
    }

    const resultingState = primaryScenario.resultingState;

    // Check emergency fund policy (≥50% of target)
    const efTarget = input.financialSnapshot.monthlyEssentialExpenses * 6;
    const efMinimum = Money(Math.round(efTarget * 0.5));
    if (resultingState.emergencyFundBalance < efMinimum) {
        details.push({
            category: "POLICY",
            status: "FAIL",
            title: "Emergency fund policy violation",
            description: `Would leave ${resultingState.emergencyFundBalance} cents, below minimum ${efMinimum}`,
            severity: "ERROR",
        });
        failed++;
    } else if (resultingState.emergencyFundBalance < Money(Math.round(efTarget * 0.75))) {
        details.push({
            category: "POLICY",
            status: "WARN",
            title: "Emergency fund below target",
            description: `Would leave ${resultingState.emergencyFundBalance} cents, below ideal target ${efTarget}`,
            severity: "WARNING",
        });
        warnings++;
    } else {
        details.push({
            category: "POLICY",
            status: "PASS",
            title: "Emergency fund policy compliant",
            description: "Will maintain adequate emergency reserves",
        });
        passed++;
    }

    // Check debt-to-income ratio (≤50%)
    if (resultingState.debtToIncomeRatio > 0.5) {
        details.push({
            category: "POLICY",
            status: "FAIL",
            title: "Debt-to-income ratio violation",
            description: `DTI would be ${(resultingState.debtToIncomeRatio * 100).toFixed(1)}%, exceeds 50% limit`,
            severity: "ERROR",
        });
        failed++;
    } else if (resultingState.debtToIncomeRatio > 0.4) {
        details.push({
            category: "POLICY",
            status: "WARN",
            title: "High debt-to-income ratio",
            description: `DTI would be ${(resultingState.debtToIncomeRatio * 100).toFixed(1)}%, approaching concern level`,
            severity: "WARNING",
        });
        warnings++;
    } else {
        details.push({
            category: "POLICY",
            status: "PASS",
            title: "Debt-to-income ratio compliant",
            description: "Debt obligations remain manageable",
        });
        passed++;
    }

    // Check minimum emergency fund months (≥1 month)
    if (resultingState.emergencyFundMonths < 1) {
        details.push({
            category: "POLICY",
            status: "FAIL",
            title: "Insufficient emergency fund duration",
            description: `Would leave only ${resultingState.emergencyFundMonths.toFixed(2)} months of expenses in reserve`,
            severity: "ERROR",
        });
        failed++;
    } else if (resultingState.emergencyFundMonths < 2) {
        details.push({
            category: "POLICY",
            status: "WARN",
            title: "Low emergency fund coverage",
            description: `Only ${resultingState.emergencyFundMonths.toFixed(2)} months of expenses in reserve`,
            severity: "WARNING",
        });
        warnings++;
    } else {
        details.push({
            category: "POLICY",
            status: "PASS",
            title: "Emergency fund duration adequate",
            description: "Sufficient months of living expenses in reserve",
        });
        passed++;
    }

    if (candidate.compliesWithPolicy === false) {
        details.push({
            category: "POLICY",
            status: "FAIL",
            title: "Candidate marked non-compliant",
            description: `Violations: ${(candidate.policyViolations || []).join(", ")}`,
            severity: "ERROR",
        });
        failed++;
    }

    return { details, passed, failed, warnings };
}

/**
 * Validate evidence quality
 *
 * Check freshness, tier, and source credibility
 */
function validateEvidenceQuality(input: ValidatorInput): {
    details: ValidationDetail[];
    passed: number;
    failed: number;
    warnings: number;
    weaknesses?: string[];
} {
    const details: ValidationDetail[] = [];
    let passed = 0;
    let failed = 0;
    let warnings = 0;
    const weaknesses: string[] = [];

    const { candidate } = input;

    if (candidate.evidence.length === 0) {
        details.push({
            category: "EVIDENCE",
            status: "WARN",
            title: "No supporting evidence provided",
            description: "Recommendation has no external research backing",
            severity: "WARNING",
        });
        warnings++;
        weaknesses.push("Lacks external research support");
        return { details, passed, failed, warnings, weaknesses };
    }

    // Check for expired evidence
    const expiredCount = candidate.evidence.filter((e) => e.freshness === "EXPIRED").length;
    if (expiredCount > 0) {
        details.push({
            category: "EVIDENCE",
            status: "FAIL",
            title: "Expired evidence used",
            description: `${expiredCount} of ${candidate.evidence.length} evidence items are expired`,
            severity: "ERROR",
        });
        failed++;
        weaknesses.push(`Uses ${expiredCount} expired evidence item(s)`);
    }

    // Check for stale evidence (>90 days)
    const staleCount = candidate.evidence.filter((e) => e.freshness === "STALE").length;
    if (staleCount > candidate.evidence.length * 0.5) {
        details.push({
            category: "EVIDENCE",
            status: "WARN",
            title: "Majority of evidence is stale",
            description: `${staleCount} of ${candidate.evidence.length} items are >90 days old`,
            severity: "WARNING",
        });
        warnings++;
        weaknesses.push("Relies on outdated research");
    } else if (staleCount > 0) {
        details.push({
            category: "EVIDENCE",
            status: "WARN",
            title: "Some evidence is stale",
            description: `${staleCount} items are >90 days old`,
            severity: "WARNING",
        });
        warnings++;
    }

    // Check source tier distribution
    const tier1Count = candidate.evidence.filter(
        (e) => e.sourceTier === "TIER_1_GOVERNMENT"
    ).length;
    const tier4Count = candidate.evidence.filter((e) => e.sourceTier === "TIER_4_MEDIA").length;

    if (tier4Count > tier1Count && candidate.evidence.length >= 3) {
        details.push({
            category: "EVIDENCE",
            status: "WARN",
            title: "Evidence weighted toward media sources",
            description: `${tier4Count} media sources vs ${tier1Count} government sources`,
            severity: "WARNING",
        });
        warnings++;
        weaknesses.push("Relies more on media than authoritative sources");
    }

    if (tier1Count > 0 && expiredCount === 0 && staleCount <= candidate.evidence.length * 0.3) {
        details.push({
            category: "EVIDENCE",
            status: "PASS",
            title: "Evidence quality is strong",
            description: `Good mix of sources (${tier1Count} government), mostly current`,
        });
        passed++;
    }

    return { details, passed, failed, warnings, weaknesses };
}

/**
 * Analyze assumption sensitivity
 *
 * Which assumptions, if changed by 10-20%, would break this recommendation?
 */
function analyzeAssumptionSensitivity(input: ValidatorInput): {
    details: ValidationDetail[];
    passed: number;
    failed: number;
    warnings: number;
    challenges?: AdversarialChallenge[];
} {
    const details: ValidationDetail[] = [];
    const challenges: AdversarialChallenge[] = [];
    let passed = 0;
    let failed = 0;
    let warnings = 0;

    const { candidate } = input;

    if (candidate.assumptions.length === 0) {
        details.push({
            category: "ASSUMPTIONS",
            status: "WARN",
            title: "No assumptions documented",
            description: "All recommendations rest on assumptions; none are recorded",
            severity: "WARNING",
        });
        warnings++;

        // Generate a challenge for income stability
        challenges.push({
            type: "INCOME_CHANGE",
            scenario: "If household income decreases 20% due to job change or recession",
            impact: "HIGH",
            likelihood: "POSSIBLE",
            recommendation: "Verify this recommendation still works with 20% lower income",
        });

        return { details, passed, failed, warnings, challenges };
    }

    // Check confidence of assumptions
    const lowConfidenceAssumptions = candidate.assumptions.filter(
        (a) => a.confidence === ConfidenceLevel.LOW || a.confidence === ConfidenceLevel.INSUFFICIENT_INFORMATION
    );

    if (lowConfidenceAssumptions.length > candidate.assumptions.length * 0.5) {
        details.push({
            category: "ASSUMPTIONS",
            status: "WARN",
            title: "Many low-confidence assumptions",
            description: `${lowConfidenceAssumptions.length} of ${candidate.assumptions.length} assumptions have low confidence`,
            severity: "WARNING",
        });
        warnings++;

        // Generate challenges for each low-confidence assumption
        lowConfidenceAssumptions.forEach((assumption) => {
            challenges.push({
                type: "ASSUMPTION",
                scenario: `If "${assumption.key}" changes from "${assumption.value}"`,
                impact: "MEDIUM",
                likelihood: "LIKELY",
                recommendation: "Verify this assumption before proceeding",
            });
        });
    } else if (lowConfidenceAssumptions.length > 0) {
        details.push({
            category: "ASSUMPTIONS",
            status: "WARN",
            title: "Some low-confidence assumptions",
            description: `${lowConfidenceAssumptions.length} assumptions have low confidence`,
            severity: "WARNING",
        });
        warnings++;
    } else {
        details.push({
            category: "ASSUMPTIONS",
            status: "PASS",
            title: "Assumptions well-documented and confident",
            description: "All key assumptions are documented with high or medium confidence",
        });
        passed++;
    }

    // Check for income/expense assumptions
    const incomeAssumption = candidate.assumptions.find((a) => a.key.includes("income"));
    if (!incomeAssumption) {
        challenges.push({
            type: "INCOME_CHANGE",
            scenario: "If household income drops 10% due to job change or reduced hours",
            impact: "MEDIUM",
            likelihood: "POSSIBLE",
            recommendation: "Have backup plan if income changes",
        });
    }

    return { details, passed, failed, warnings, challenges };
}

/**
 * Validate alternative quality
 *
 * Were meaningful competing options considered?
 */
function validateAlternativeQuality(input: ValidatorInput): {
    details: ValidationDetail[];
    passed: number;
    failed: number;
    warnings: number;
} {
    const details: ValidationDetail[] = [];
    let passed = 0;
    let failed = 0;
    let warnings = 0;

    const { candidate } = input;

    if (candidate.alternatives.length === 0) {
        details.push({
            category: "ALTERNATIVES",
            status: "WARN",
            title: "No alternatives presented",
            description: "Recommendation has no competing options for user to consider",
            severity: "WARNING",
        });
        warnings++;
        return { details, passed, failed, warnings };
    }

    // Check for preferred alternative
    const preferredCount = candidate.alternatives.filter((a) => a.isPreferred).length;
    if (preferredCount !== 1) {
        details.push({
            category: "ALTERNATIVES",
            status: "WARN",
            title: "Preferred alternative not clearly marked",
            description: `Expected 1 preferred alternative, found ${preferredCount}`,
            severity: "WARNING",
        });
        warnings++;
    } else {
        details.push({
            category: "ALTERNATIVES",
            status: "PASS",
            title: "Preferred alternative clearly marked",
            description: "One alternative identified as recommended choice",
        });
        passed++;
    }

    // Check for competing options
    const preferred = candidate.alternatives.find((p) => p.isPreferred);
    const meaningfulDifferences = candidate.alternatives.filter(
        (a) =>
            !a.isPreferred &&
            (a.impactDirection !== preferred?.impactDirection ||
                (a.estimatedImpact !== undefined && preferred?.estimatedImpact !== undefined &&
                    Math.abs(a.estimatedImpact - preferred.estimatedImpact) > 100000)) // Meaningful difference
    ).length;

    if (meaningfulDifferences >= 2) {
        details.push({
            category: "ALTERNATIVES",
            status: "PASS",
            title: "Multiple meaningful alternatives presented",
            description: `${meaningfulDifferences} alternatives with substantively different tradeoffs`,
        });
        passed++;
    } else if (candidate.alternatives.length >= 2) {
        details.push({
            category: "ALTERNATIVES",
            status: "WARN",
            title: "Limited alternative differentiation",
            description: "Alternatives are similar; limited competing options",
            severity: "WARNING",
        });
        warnings++;
    }

    return { details, passed, failed, warnings };
}

/**
 * Assess downside
 *
 * What's the worst plausible consequence?
 */
function assessDownside(input: ValidatorInput): {
    details: ValidationDetail[];
    passed: number;
    failed: number;
    warnings: number;
    challenges?: AdversarialChallenge[];
    weaknesses?: string[];
} {
    const details: ValidationDetail[] = [];
    const challenges: AdversarialChallenge[] = [];
    const weaknesses: string[] = [];
    let passed = 0;
    let failed = 0;
    let warnings = 0;

    const { candidate } = input;

    if (candidate.risks.length === 0) {
        details.push({
            category: "DOWNSIDE",
            status: "WARN",
            title: "No downside risks identified",
            description: "Recommendation has no identified potential negative outcomes",
            severity: "WARNING",
        });
        warnings++;
        weaknesses.push("Lacks downside risk assessment");
        return { details, passed, failed, warnings, challenges, weaknesses };
    }

    // Check for critical risks
    const criticalRisks = candidate.risks.filter((r) => r.severity === "CRITICAL");
    if (criticalRisks.length > 0) {
        details.push({
            category: "DOWNSIDE",
            status: "FAIL",
            title: "Critical risks identified",
            description: `${criticalRisks.length} critical-severity risks: ${criticalRisks.map((r) => r.description).join("; ")}`,
            severity: "ERROR",
        });
        failed++;

        criticalRisks.forEach((risk) => {
            challenges.push({
                type: "EMERGENCY",
                scenario: risk.description,
                impact: "CRITICAL",
                likelihood: "POSSIBLE",
                recommendation: `Have mitigation: ${(risk.mitigations || ["unclear"])[0]}`,
            });
        });
    }

    // Check for high-severity risks without mitigations
    const highRisksNoMitigation = candidate.risks.filter(
        (r) => r.severity === "HIGH" && (!r.mitigations || r.mitigations.length === 0)
    );
    if (highRisksNoMitigation.length > 0) {
        details.push({
            category: "DOWNSIDE",
            status: "WARN",
            title: "High-severity risks without mitigations",
            description: `${highRisksNoMitigation.length} risks are high-severity but lack defined mitigations`,
            severity: "WARNING",
        });
        warnings++;
        weaknesses.push(`${highRisksNoMitigation.length} high-severity risks unmitigated`);
    }

    // Check risk distribution
    if (criticalRisks.length === 0 && highRisksNoMitigation.length === 0) {
        if (candidate.risks.length >= 2) {
            details.push({
                category: "DOWNSIDE",
                status: "PASS",
                title: "Comprehensive downside assessment",
                description: `${candidate.risks.length} potential risks identified and characterized`,
            });
            passed++;
        } else if (candidate.risks.length === 1) {
            details.push({
                category: "DOWNSIDE",
                status: "PASS",
                title: "Downside risks identified",
                description: `${candidate.risks.length} potential risk identified`,
            });
            passed++;
        }
    }

    return { details, passed, failed, warnings, challenges, weaknesses };
}

/**
 * Detect bias
 *
 * Is the recommendation systematically favoring:
 * - A particular product or provider
 * - A particular financial behavior
 * - Overly aggressive or conservative strategy
 */
function detectBias(input: ValidatorInput): {
    details: ValidationDetail[];
    passed: number;
    failed: number;
    warnings: number;
    weaknesses?: string[];
} {
    const details: ValidationDetail[] = [];
    const weaknesses: string[] = [];
    let passed = 0;
    let failed = 0;
    let warnings = 0;

    const { candidate } = input;

    // Check for product-specific recommendations without comparison
    const hasProductName = /Chase|Bank|Wells Fargo|Citibank|American Express|Visa|MasterCard|Capital One|Ally|Marcus|Wealthfront|Vanguard|Fidelity|Schwab/i.test(
        candidate.recommendedAction
    );
    const hasProviderSource = candidate.evidence.some(
        (e) => e.sourceTier === "TIER_2_PROVIDER"
    );

    if (hasProductName && candidate.alternatives.length === 0) {
        details.push({
            category: "BIAS",
            status: "WARN",
            title: "Product-specific recommendation without comparison",
            description: "Recommendation names specific provider without comparing alternatives",
            severity: "WARNING",
        });
        warnings++;
        weaknesses.push("Recommends specific product without product comparison");
    } else if (hasProductName && hasProviderSource && candidate.alternatives.length < 2) {
        details.push({
            category: "BIAS",
            status: "WARN",
            title: "Product-specific recommendation with provider source bias",
            description: "Recommendation favors specific provider based on provider-sourced evidence",
            severity: "WARNING",
        });
        warnings++;
        weaknesses.push("Provider source bias in evidence");
    }

    // Check for aggressive strategy bias
    const aggressiveKeywords = [
        "maximize",
        "aggressive",
        "all-in",
        "highest-return",
        "best-case",
    ];
    const isAggressive = aggressiveKeywords.some((keyword) =>
        (candidate.summary + candidate.rationale).toLowerCase().includes(keyword)
    );

    if (
        isAggressive &&
        candidate.risks.filter((r) => r.severity === "HIGH" || r.severity === "CRITICAL")
            .length === 0
    ) {
        details.push({
            category: "BIAS",
            status: "WARN",
            title: "Aggressive strategy without downside emphasis",
            description:
                "Recommendation uses aggressive framing but minimizes downside risks",
            severity: "WARNING",
        });
        warnings++;
        weaknesses.push("Aggressive strategy not adequately stress-tested");
    }

    // Check for conservative strategy bias
    const conservativeKeywords = [
        "safest",
        "minimize risk",
        "avoid",
        "don't",
        "nothing risky",
    ];
    const isConservative = conservativeKeywords.some((keyword) =>
        (candidate.summary + candidate.rationale).toLowerCase().includes(keyword)
    );

    if (
        isConservative &&
        candidate.alternatives.some((a) => a.impactDirection === "POSITIVE")
    ) {
        // Conservative rec with positive alternatives is potentially biased toward status quo
        details.push({
            category: "BIAS",
            status: "WARN",
            title: "Potential status quo bias",
            description:
                "Recommendation heavily emphasizes safety over other alternatives with positive outcomes",
            severity: "WARNING",
        });
        warnings++;
        weaknesses.push("May favor status quo over opportunities");
    }

    if (weaknesses.length === 0) {
        details.push({
            category: "BIAS",
            status: "PASS",
            title: "No systematic bias detected",
            description:
                "Recommendation appears balanced between product options, strategies, and risk profiles",
        });
        passed++;
    }

    return { details, passed, failed, warnings, weaknesses };
}

/**
 * Check data freshness
 *
 * Are financial state and external facts current enough?
 */
function checkDataFreshness(input: ValidatorInput): {
    details: ValidationDetail[];
    passed: number;
    failed: number;
    warnings: number;
} {
    const details: ValidationDetail[] = [];
    let passed = 0;
    let failed = 0;
    let warnings = 0;

    const { financialSnapshot, candidate } = input;

    // Check snapshot age
    const snapshotAgeMs = Date.now() - financialSnapshot.asOf.getTime();
    const snapshotAgeDays = snapshotAgeMs / (1000 * 60 * 60 * 24);

    if (snapshotAgeDays > 90) {
        details.push({
            category: "FRESHNESS",
            status: "FAIL",
            title: "Financial snapshot too old",
            description: `Snapshot is ${Math.floor(snapshotAgeDays)} days old; data likely stale`,
            severity: "ERROR",
        });
        failed++;
    } else if (snapshotAgeDays > 30) {
        details.push({
            category: "FRESHNESS",
            status: "WARN",
            title: "Financial snapshot aging",
            description: `Snapshot is ${Math.floor(snapshotAgeDays)} days old`,
            severity: "WARNING",
        });
        warnings++;
    } else {
        details.push({
            category: "FRESHNESS",
            status: "PASS",
            title: "Financial snapshot is current",
            description: `Snapshot age: ${Math.floor(snapshotAgeDays)} days`,
        });
        passed++;
    }

    // Check evidence freshness (already checked in evidence validation)
    if (candidate.evidence.length > 0) {
        const allCurrent = candidate.evidence.every((e) => e.freshness === "CURRENT");
        if (allCurrent) {
            details.push({
                category: "FRESHNESS",
                status: "PASS",
                title: "All evidence is current",
                description: "Supporting research is recent",
            });
            passed++;
        }
    }

    return { details, passed, failed, warnings };
}

/**
 * Generate recommendations for user based on validation
 */
function generateRecommendations(
    status: string,
    details: ValidationDetail[],
    challenges: AdversarialChallenge[]
): string[] {
    const recommendations: string[] = [];

    if (status === "FAIL") {
        recommendations.push("This recommendation has failed validation and cannot be approved as-is");
        const failedChecks = details.filter((d) => d.status === "FAIL");
        failedChecks.forEach((check) => {
            recommendations.push(`Address: ${check.description}`);
        });
    }

    if (status === "PASS_WITH_WARNINGS") {
        recommendations.push("This recommendation passes but has concerns to consider:");
        const warnings = details.filter((d) => d.status === "WARN");
        warnings.forEach((warn) => {
            recommendations.push(`- ${warn.description}`);
        });
    }

    // Add adversarial recommendations
    const criticalChallenges = challenges.filter((c) => c.impact === "CRITICAL");
    if (criticalChallenges.length > 0) {
        recommendations.push("Before proceeding, prepare for these critical scenarios:");
        criticalChallenges.forEach((challenge) => {
            recommendations.push(`- ${challenge.recommendation}`);
        });
    }

    return recommendations;
}

/**
 * Recalibrate confidence after validation
 */
function recalibrateConfidence(
    originalConfidence: ConfidenceLevel,
    validationStatus: string,
    factors: any
): ConfidenceLevel {
    // If validation failed, reduce confidence significantly
    if (validationStatus === "FAIL") {
        return ConfidenceLevel.LOW;
    }

    // If validation passed with warnings, slightly reduce confidence
    if (validationStatus === "PASS_WITH_WARNINGS") {
        if (originalConfidence === ConfidenceLevel.HIGH) {
            return ConfidenceLevel.MEDIUM;
        }
        return originalConfidence;
    }

    // If validation passed and data quality is good, maintain or increase confidence
    if (validationStatus === "PASS") {
        if (factors.dataQuality === "HIGH" && factors.evidenceFreshness === "CURRENT") {
            return ConfidenceLevel.HIGH;
        }
        return originalConfidence;
    }

    return ConfidenceLevel.INSUFFICIENT_INFORMATION;
}

/**
 * Build human-readable validation summary
 */
function buildValidationSummary(
    status: string,
    passed: number,
    failed: number,
    warnings: number,
    challenges: AdversarialChallenge[]
): string {
    let summary = "";

    if (status === "PASS") {
        summary = `✓ Recommendation PASSES validation (${passed} checks passed).`;
    } else if (status === "PASS_WITH_WARNINGS") {
        summary = `⚠ Recommendation PASSES with ${warnings} warning(s). Review cautions before approving.`;
    } else if (status === "FAIL") {
        summary = `✗ Recommendation FAILS validation (${failed} critical issue(s)). Cannot approve as-is.`;
    } else {
        summary = `? Validation is INCONCLUSIVE. Insufficient information to determine validity.`;
    }

    if (challenges.length > 0) {
        const criticalCount = challenges.filter((c) => c.impact === "CRITICAL").length;
        if (criticalCount > 0) {
            summary += ` [${criticalCount} critical scenario(s) identified]`;
        }
    }

    return summary;
}
