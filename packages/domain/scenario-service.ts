/**
 * Scenario Generation Service
 *
 * Generates structured scenarios showing the impact of financial decisions.
 *
 * Key principles:
 * - Uses existing deterministic financial services
 * - No LLM involved in calculations
 * - Generates multiple alternatives (A, B, C, D, E typically)
 * - Each scenario is independent (doesn't affect household state)
 * - All impacts computed from financial snapshot
 * - Results are immutable once generated
 */

import {
    EntityId,
    Money,
    FinancialSnapshot,
    FinancialHealthStatus,
    Scenario,
    ScenarioType,
    ScenarioBaseline,
    ScenarioImpact,
    ScenarioResultingState,
    ConfidenceLevel,
} from "@house-fin/contracts";

/**
 * Extract baseline financial state from snapshot
 */
export function extractBaseline(snapshot: FinancialSnapshot): ScenarioBaseline {
    const essentials = snapshot.monthlyEssentialExpenses || Money(0);
    const discretionary = snapshot.monthlyDiscretionaryExpenses || Money(0);
    const income = snapshot.monthlyIncome || Money(0);
    const debt = snapshot.debt || Money(0);
    const cash = snapshot.cash || Money(0);

    const target = Money(essentials * 6);
    const efBalance = Money(Math.min(cash, target));
    const efMonths = essentials > 0 ? efBalance / essentials : 0;
    const expenses = Money(essentials + discretionary);
    const savings = income > expenses ? Money(income - expenses) : Money(0);

    return {
        emergencyFundBalance: efBalance,
        emergencyFundTarget: target,
        emergencyFundMonths: efMonths,
        totalDebt: debt,
        debtToIncomeRatio: income > 0 ? debt / income : 0,
        highestInterestRate: 18,
        monthlyDebtPayments: Money(Math.max(0, debt * 0.04)),
        monthlyIncome: income,
        monthlyExpenses: expenses,
        monthlySavingsCapacity: savings,
        activeGoals: 0,
        goalFundingGap: Money(0),
        retirementYearsAway: 30,
        financialHealthScore:
            snapshot.financialHealthStatus === FinancialHealthStatus.HEALTHY ? 80 :
                snapshot.financialHealthStatus === FinancialHealthStatus.WATCH ? 60 :
                    snapshot.financialHealthStatus === FinancialHealthStatus.AT_RISK ? 40 : 20,
        healthStatus: snapshot.financialHealthStatus || FinancialHealthStatus.AT_RISK,
    };
}

/**
 * Generate windfall scenarios
 */
export function generateWindfallScenarios(
    householdId: EntityId,
    snapshotId: EntityId,
    input: any,
    baseline: ScenarioBaseline
): Scenario[] {
    const scenarios: Scenario[] = [];

    // Scenario A: Emergency fund first
    {
        const efGap = Money(Math.max(0, baseline.emergencyFundTarget - baseline.emergencyFundBalance));
        const toEF = Money(Math.min(input.amount, efGap));
        const remaining = Money(Math.max(0, input.amount - toEF));

        scenarios.push({
            id: `scenario-ef-${Date.now()}` as EntityId,
            householdId,
            financialSnapshotId: snapshotId,
            financialSnapshotVersion: 1,
            type: ScenarioType.WINDFALL,
            title: "Emergency Fund First",
            description: "Allocate to emergency fund, then goals",
            input,
            baseline,
            proposedActions: [
                {
                    id: "action-1",
                    title: "Emergency fund",
                    description: `Deposit ${toEF} to emergency fund`,
                    amount: toEF,
                },
                ...(remaining > 0 ? [{
                    id: "action-2",
                    title: "Goals",
                    description: `Allocate ${remaining} to goals`,
                    amount: remaining,
                }] : []),
            ],
            impact: {
                immediatelyAffected: true,
                cashFlowImpact: Money(0),
                debtReduction: Money(0),
                emergencyFundIncrease: toEF,
                investmentIncrease: Money(0),
                savingsIncrease: remaining,
                wealthIncrease: input.amount,
                debtToIncomeChange: 0,
                healthScoreChange: 8,
                emergencyFundMonthsChange: toEF / baseline.monthlyExpenses,
                riskReduction: "HIGH",
                flexibilityChange: "INCREASED",
                liquidityChange: "IMPROVED",
            },
            resultingState: {
                emergencyFundBalance: Money(baseline.emergencyFundBalance + toEF),
                emergencyFundMonths: baseline.emergencyFundMonths + (toEF / baseline.monthlyExpenses),
                totalDebt: baseline.totalDebt,
                debtToIncomeRatio: baseline.debtToIncomeRatio,
                monthlyDebtPayments: baseline.monthlyDebtPayments,
                monthlySavingsCapacity: baseline.monthlySavingsCapacity,
                monthlyAllocableAmount: baseline.monthlySavingsCapacity,
                goalFundingGap: Money(Math.max(0, baseline.goalFundingGap - remaining)),
                goalsOnTrack: baseline.activeGoals,
                financialHealthScore: Math.min(100, baseline.financialHealthScore + 8),
                healthStatus: FinancialHealthStatus.HEALTHY,
                requiresMonthlyCommitment: Money(0),
            },
            assumptions: [
                {
                    key: "allocation",
                    statement: "Allocation proceeds as planned",
                    confidence: ConfidenceLevel.HIGH,
                    impact: "HIGH",
                },
            ],
            sensitivities: [],
            order: 1,
            rationale: "Builds emergency fund safety. Recommended first.",
            calculationVersion: 1,
            createdAt: new Date(),
            confidence: ConfidenceLevel.HIGH,
            dataCompleteness: 90,
        });
    }

    // Scenario B: Debt reduction
    if (baseline.totalDebt > 0 && baseline.highestInterestRate > 15) {
        scenarios.push({
            id: `scenario-debt-${Date.now()}` as EntityId,
            householdId,
            financialSnapshotId: snapshotId,
            financialSnapshotVersion: 1,
            type: ScenarioType.WINDFALL,
            title: "High-Interest Debt Reduction",
            description: "Target highest-interest debt",
            input,
            baseline,
            proposedActions: [
                {
                    id: "action-1",
                    title: "Pay debt",
                    description: `Reduce debt by ${input.amount}`,
                    amount: input.amount,
                },
            ],
            impact: {
                immediatelyAffected: true,
                cashFlowImpact: Money(Math.round((input.amount * baseline.highestInterestRate) / 100 / 12)),
                debtReduction: input.amount,
                emergencyFundIncrease: Money(0),
                investmentIncrease: Money(0),
                savingsIncrease: Money(0),
                wealthIncrease: input.amount,
                debtToIncomeChange: -(input.amount / baseline.monthlyIncome),
                healthScoreChange: 6,
                emergencyFundMonthsChange: 0,
                riskReduction: "MEDIUM",
                flexibilityChange: "INCREASED",
                liquidityChange: "MAINTAINED",
            },
            resultingState: {
                emergencyFundBalance: baseline.emergencyFundBalance,
                emergencyFundMonths: baseline.emergencyFundMonths,
                totalDebt: Money(Math.max(0, baseline.totalDebt - input.amount)),
                debtToIncomeRatio: Math.max(0, baseline.debtToIncomeRatio - (input.amount / baseline.monthlyIncome)),
                monthlyDebtPayments: Money(Math.max(0, baseline.monthlyDebtPayments - Money(Math.round((input.amount * baseline.highestInterestRate) / 100 / 12)))),
                monthlySavingsCapacity: Money(baseline.monthlySavingsCapacity + Money(Math.round((input.amount * baseline.highestInterestRate) / 100 / 12))),
                monthlyAllocableAmount: baseline.monthlySavingsCapacity,
                goalFundingGap: baseline.goalFundingGap,
                goalsOnTrack: baseline.activeGoals,
                financialHealthScore: Math.min(100, baseline.financialHealthScore + 5),
                healthStatus: FinancialHealthStatus.HEALTHY,
                requiresMonthlyCommitment: Money(0),
            },
            assumptions: [
                {
                    key: "paydown",
                    statement: "Windfall used for debt principal",
                    confidence: ConfidenceLevel.HIGH,
                    impact: "HIGH",
                },
            ],
            sensitivities: [],
            order: 2,
            rationale: "Reduces interest costs and improves cash flow.",
            calculationVersion: 1,
            createdAt: new Date(),
            confidence: ConfidenceLevel.HIGH,
            dataCompleteness: 85,
        });
    }

    // Scenario C: Balanced split
    {
        const toEF = Money(Math.round(input.amount * 0.4));
        const toDebt = Money(Math.round(input.amount * 0.35));
        const toGoals = Money(Math.round(input.amount * 0.25));

        scenarios.push({
            id: `scenario-balanced-${Date.now()}` as EntityId,
            householdId,
            financialSnapshotId: snapshotId,
            financialSnapshotVersion: 1,
            type: ScenarioType.WINDFALL,
            title: "Balanced Allocation",
            description: "Split windfall: 40% EF, 35% debt, 25% goals",
            input,
            baseline,
            proposedActions: [
                {
                    id: "action-1",
                    title: "Emergency fund",
                    description: `Allocate ${toEF} (40%)`,
                    amount: toEF,
                },
                {
                    id: "action-2",
                    title: "Debt",
                    description: `Pay down ${toDebt} (35%)`,
                    amount: toDebt,
                },
                {
                    id: "action-3",
                    title: "Goals",
                    description: `Fund goals ${toGoals} (25%)`,
                    amount: toGoals,
                },
            ],
            impact: {
                immediatelyAffected: true,
                cashFlowImpact: Money(Math.round((toDebt * baseline.highestInterestRate) / 100 / 12)),
                debtReduction: toDebt,
                emergencyFundIncrease: toEF,
                investmentIncrease: Money(0),
                savingsIncrease: toGoals,
                wealthIncrease: input.amount,
                debtToIncomeChange: -(toDebt / baseline.monthlyIncome),
                healthScoreChange: 7,
                emergencyFundMonthsChange: toEF / baseline.monthlyExpenses,
                riskReduction: "MEDIUM",
                flexibilityChange: "INCREASED",
                liquidityChange: "IMPROVED",
            },
            resultingState: {
                emergencyFundBalance: Money(baseline.emergencyFundBalance + toEF),
                emergencyFundMonths: baseline.emergencyFundMonths + (toEF / baseline.monthlyExpenses),
                totalDebt: Money(Math.max(0, baseline.totalDebt - toDebt)),
                debtToIncomeRatio: Math.max(0, baseline.debtToIncomeRatio - (toDebt / baseline.monthlyIncome)),
                monthlyDebtPayments: Money(Math.max(0, baseline.monthlyDebtPayments - Money(Math.round((toDebt * baseline.highestInterestRate) / 100 / 12)))),
                monthlySavingsCapacity: Money(baseline.monthlySavingsCapacity + Money(Math.round((toDebt * baseline.highestInterestRate) / 100 / 12))),
                monthlyAllocableAmount: baseline.monthlySavingsCapacity,
                goalFundingGap: Money(Math.max(0, baseline.goalFundingGap - toGoals)),
                goalsOnTrack: baseline.activeGoals,
                financialHealthScore: Math.min(100, baseline.financialHealthScore + 6),
                healthStatus: FinancialHealthStatus.HEALTHY,
                requiresMonthlyCommitment: Money(0),
            },
            assumptions: [
                {
                    key: "allocation",
                    statement: "Balanced allocation proceeds",
                    confidence: ConfidenceLevel.HIGH,
                    impact: "HIGH",
                },
            ],
            sensitivities: [],
            order: 3,
            rationale: "Balanced approach addresses multiple priorities.",
            calculationVersion: 1,
            createdAt: new Date(),
            confidence: ConfidenceLevel.HIGH,
            dataCompleteness: 88,
        });
    }

    // Scenario D: Growth/Investment
    {
        scenarios.push({
            id: `scenario-invest-${Date.now()}` as EntityId,
            householdId,
            financialSnapshotId: snapshotId,
            financialSnapshotVersion: 1,
            type: ScenarioType.WINDFALL,
            title: "Long-term Investment Growth",
            description: "Invest windfall for retirement/wealth building",
            input,
            baseline,
            proposedActions: [
                {
                    id: "action-1",
                    title: "Invest for growth",
                    description: `Allocate ${input.amount} to investment account`,
                    amount: input.amount,
                },
            ],
            impact: {
                immediatelyAffected: false,
                timeframeMonths: 240,
                cashFlowImpact: Money(0),
                debtReduction: Money(0),
                emergencyFundIncrease: Money(0),
                investmentIncrease: Money(Math.round(input.amount * 3.2)),
                savingsIncrease: Money(0),
                wealthIncrease: Money(Math.round(input.amount * 3.2)),
                debtToIncomeChange: 0,
                healthScoreChange: 2,
                emergencyFundMonthsChange: 0,
                riskReduction: "LOW",
                flexibilityChange: "REDUCED",
                liquidityChange: "DECREASED",
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
                financialHealthScore: baseline.financialHealthScore + 1,
                healthStatus: baseline.healthStatus,
            },
            assumptions: [
                {
                    key: "market_returns",
                    statement: "Average 6-7% annual returns over 20 years",
                    confidence: ConfidenceLevel.MEDIUM,
                    impact: "HIGH",
                },
            ],
            sensitivities: [],
            order: 4,
            rationale: "Best if emergency fund already adequate.",
            calculationVersion: 1,
            createdAt: new Date(),
            confidence: ConfidenceLevel.MEDIUM,
            dataCompleteness: 75,
        });
    }

    // Scenario E: Save for opportunities
    {
        scenarios.push({
            id: `scenario-save-${Date.now()}` as EntityId,
            householdId,
            financialSnapshotId: snapshotId,
            financialSnapshotVersion: 1,
            type: ScenarioType.WINDFALL,
            title: "Keep for Opportunities",
            description: "Hold windfall for unexpected opportunities",
            input,
            baseline,
            proposedActions: [
                {
                    id: "action-1",
                    title: "Hold in savings",
                    description: `Keep ${input.amount} liquid in savings account`,
                    amount: input.amount,
                },
            ],
            impact: {
                immediatelyAffected: true,
                cashFlowImpact: Money(0),
                debtReduction: Money(0),
                emergencyFundIncrease: Money(0),
                investmentIncrease: Money(0),
                savingsIncrease: input.amount,
                wealthIncrease: Money(0),
                debtToIncomeChange: 0,
                healthScoreChange: 3,
                emergencyFundMonthsChange: 0,
                riskReduction: "NONE",
                flexibilityChange: "INCREASED",
                liquidityChange: "IMPROVED",
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
                financialHealthScore: baseline.financialHealthScore + 2,
                healthStatus: baseline.healthStatus,
            },
            assumptions: [
                {
                    key: "flexibility_need",
                    statement: "Unexpected opportunities may arise",
                    confidence: ConfidenceLevel.MEDIUM,
                    impact: "MEDIUM",
                },
            ],
            sensitivities: [],
            order: 5,
            rationale: "Keeps options open with maximum flexibility.",
            calculationVersion: 1,
            createdAt: new Date(),
            confidence: ConfidenceLevel.HIGH,
            dataCompleteness: 80,
        });
    }

    return scenarios;
}

/**
 * Generate savings allocation scenarios
 */
export function generateSavingsAllocationScenarios(
    householdId: EntityId,
    snapshotId: EntityId,
    input: any,
    baseline: ScenarioBaseline
): Scenario[] {
    const scenarios: Scenario[] = [];

    // Emergency fund scenario
    if (baseline.emergencyFundMonths < 6) {
        scenarios.push({
            id: `scenario-ef-save-${Date.now()}` as EntityId,
            householdId,
            financialSnapshotId: snapshotId,
            financialSnapshotVersion: 1,
            type: ScenarioType.SAVINGS_ALLOCATION,
            title: "Build Emergency Fund",
            description: "Direct savings to emergency fund",
            input,
            baseline,
            proposedActions: [
                {
                    id: "action-1",
                    title: "Monthly savings",
                    description: `Save ${input.monthlyAmount} monthly`,
                    amount: input.monthlyAmount,
                    frequencyMonths: 1,
                },
            ],
            impact: {
                immediatelyAffected: false,
                timeframeMonths: input.monthsAvailable,
                cashFlowImpact: Money(-input.monthlyAmount),
                debtReduction: Money(0),
                emergencyFundIncrease: Money(input.monthlyAmount * input.monthsAvailable),
                investmentIncrease: Money(0),
                savingsIncrease: Money(0),
                wealthIncrease: Money(input.monthlyAmount * input.monthsAvailable),
                debtToIncomeChange: 0,
                healthScoreChange: 10,
                emergencyFundMonthsChange: (input.monthlyAmount * input.monthsAvailable) / baseline.monthlyExpenses,
                riskReduction: "HIGH",
                flexibilityChange: "INCREASED",
                liquidityChange: "IMPROVED",
            },
            resultingState: {
                emergencyFundBalance: Money(baseline.emergencyFundBalance + (input.monthlyAmount * input.monthsAvailable)),
                emergencyFundMonths: Math.min(6, baseline.emergencyFundMonths + ((input.monthlyAmount * input.monthsAvailable) / baseline.monthlyExpenses)),
                totalDebt: baseline.totalDebt,
                debtToIncomeRatio: baseline.debtToIncomeRatio,
                monthlyDebtPayments: baseline.monthlyDebtPayments,
                monthlySavingsCapacity: Money(Math.max(0, baseline.monthlySavingsCapacity - input.monthlyAmount)),
                monthlyAllocableAmount: Money(Math.max(0, baseline.monthlySavingsCapacity - input.monthlyAmount)),
                goalFundingGap: baseline.goalFundingGap,
                goalsOnTrack: baseline.activeGoals,
                financialHealthScore: Math.min(100, baseline.financialHealthScore + 10),
                healthStatus: FinancialHealthStatus.HEALTHY,
                requiresMonthlyCommitment: input.monthlyAmount,
            },
            assumptions: [
                {
                    key: "consistency",
                    statement: `Can save ${input.monthlyAmount} monthly`,
                    confidence: ConfidenceLevel.MEDIUM,
                    impact: "HIGH",
                },
            ],
            sensitivities: [],
            order: 1,
            rationale: "Builds safety net. Recommended if EF below 3 months.",
            calculationVersion: 1,
            createdAt: new Date(),
            confidence: ConfidenceLevel.HIGH,
            dataCompleteness: 85,
        });
    }

    // Debt payoff scenario
    if (baseline.totalDebt > 0 && baseline.debtToIncomeRatio > 0.3) {
        scenarios.push({
            id: `scenario-debt-save-${Date.now()}` as EntityId,
            householdId,
            financialSnapshotId: snapshotId,
            financialSnapshotVersion: 1,
            type: ScenarioType.SAVINGS_ALLOCATION,
            title: "Accelerated Debt Payoff",
            description: "Apply savings to debt reduction",
            input,
            baseline,
            proposedActions: [
                {
                    id: "action-1",
                    title: "Extra debt payment",
                    description: `Pay extra ${input.monthlyAmount} monthly`,
                    amount: input.monthlyAmount,
                    frequencyMonths: 1,
                },
            ],
            impact: {
                immediatelyAffected: true,
                timeframeMonths: baseline.totalDebt > 0 ? Math.ceil(baseline.totalDebt / (baseline.monthlyDebtPayments + input.monthlyAmount)) : 12,
                cashFlowImpact: Money(-input.monthlyAmount),
                debtReduction: Money(input.monthlyAmount * input.monthsAvailable),
                emergencyFundIncrease: Money(0),
                investmentIncrease: Money(0),
                savingsIncrease: Money(0),
                wealthIncrease: Money(input.monthlyAmount * input.monthsAvailable),
                debtToIncomeChange: -((input.monthlyAmount * input.monthsAvailable) / baseline.monthlyIncome),
                healthScoreChange: 8,
                emergencyFundMonthsChange: 0,
                riskReduction: "MEDIUM",
                flexibilityChange: "INCREASED",
                liquidityChange: "MAINTAINED",
            },
            resultingState: {
                emergencyFundBalance: baseline.emergencyFundBalance,
                emergencyFundMonths: baseline.emergencyFundMonths,
                totalDebt: Money(Math.max(0, baseline.totalDebt - (input.monthlyAmount * input.monthsAvailable))),
                debtToIncomeRatio: Math.max(0, baseline.debtToIncomeRatio - ((input.monthlyAmount * input.monthsAvailable) / baseline.monthlyIncome)),
                monthlyDebtPayments: Money(Math.max(0, baseline.monthlyDebtPayments - Money(Math.round((input.monthlyAmount * baseline.highestInterestRate) / 100 / 12)))),
                monthlySavingsCapacity: Money(Math.max(0, baseline.monthlySavingsCapacity - input.monthlyAmount)),
                monthlyAllocableAmount: Money(Math.max(0, baseline.monthlySavingsCapacity - input.monthlyAmount)),
                goalFundingGap: baseline.goalFundingGap,
                goalsOnTrack: baseline.activeGoals,
                financialHealthScore: Math.min(100, baseline.financialHealthScore + 6),
                healthStatus: FinancialHealthStatus.HEALTHY,
                requiresMonthlyCommitment: input.monthlyAmount,
            },
            assumptions: [
                {
                    key: "consistency",
                    statement: `Can pay extra ${input.monthlyAmount} monthly`,
                    confidence: ConfidenceLevel.MEDIUM,
                    impact: "HIGH",
                },
            ],
            sensitivities: [],
            order: 2,
            rationale: "Reduces debt burden. Best if DTI is high.",
            calculationVersion: 1,
            createdAt: new Date(),
            confidence: ConfidenceLevel.HIGH,
            dataCompleteness: 80,
        });
    }

    return scenarios;
}

/**
 * Generate debt action scenarios
 */
export function generateDebtActionScenarios(
    householdId: EntityId,
    snapshotId: EntityId,
    input: any,
    baseline: ScenarioBaseline
): Scenario[] {
    const scenarios: Scenario[] = [];

    // Baseline: continue current payments
    scenarios.push({
        id: `scenario-debt-baseline-${Date.now()}` as EntityId,
        householdId,
        financialSnapshotId: snapshotId,
        financialSnapshotVersion: 1,
        type: ScenarioType.DEBT_ACTION,
        title: "Continue Current Payments",
        description: "Maintain minimum debt payments",
        input,
        baseline,
        proposedActions: [
            {
                id: "action-1",
                title: "Minimum payments",
                description: "No change to current approach",
                amount: baseline.monthlyDebtPayments,
                frequencyMonths: 1,
            },
        ],
        impact: {
            immediatelyAffected: false,
            timeframeMonths: 60,
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
            healthStatus: baseline.healthStatus,
            requiresMonthlyCommitment: baseline.monthlyDebtPayments,
        },
        assumptions: [
            {
                key: "status_quo",
                statement: "No change to current strategy",
                confidence: ConfidenceLevel.HIGH,
                impact: "MEDIUM",
            },
        ],
        sensitivities: [],
        order: 1,
        rationale: "Baseline comparison scenario.",
        calculationVersion: 1,
        createdAt: new Date(),
        confidence: ConfidenceLevel.HIGH,
        dataCompleteness: 100,
    });

    return scenarios;
}

/**
 * Generate affordability scenarios
 */
export function generateAffordabilityScenarios(
    householdId: EntityId,
    snapshotId: EntityId,
    input: any,
    baseline: ScenarioBaseline
): Scenario[] {
    const scenarios: Scenario[] = [];

    const resultingRatio = (baseline.monthlyDebtPayments + input.newMonthlyObligation) / baseline.monthlyIncome;

    // Scenario A: Affordable
    if (resultingRatio < 0.4) {
        scenarios.push({
            id: `scenario-aff-yes-${Date.now()}` as EntityId,
            householdId,
            financialSnapshotId: snapshotId,
            financialSnapshotVersion: 1,
            type: ScenarioType.AFFORDABILITY,
            title: "Affordable - Proceed",
            description: "Financially feasible based on current income",
            input,
            baseline,
            proposedActions: [
                {
                    id: "action-1",
                    title: `Add ${input.itemDescription}`,
                    description: `New obligation: ${input.newMonthlyObligation}`,
                    amount: input.newMonthlyObligation,
                    frequencyMonths: 1,
                },
            ],
            impact: {
                immediatelyAffected: true,
                cashFlowImpact: Money(-input.newMonthlyObligation),
                debtReduction: Money(0),
                emergencyFundIncrease: Money(0),
                investmentIncrease: Money(0),
                savingsIncrease: Money(0),
                wealthIncrease: Money(0),
                debtToIncomeChange: input.newMonthlyObligation / baseline.monthlyIncome,
                healthScoreChange: -2,
                emergencyFundMonthsChange: 0,
                riskReduction: "NONE",
                flexibilityChange: "REDUCED",
                liquidityChange: "IMPROVED",
            },
            resultingState: {
                emergencyFundBalance: baseline.emergencyFundBalance,
                emergencyFundMonths: baseline.emergencyFundMonths,
                totalDebt: Money(baseline.totalDebt + Money(input.newMonthlyObligation * 60)),
                debtToIncomeRatio: resultingRatio,
                monthlyDebtPayments: Money(baseline.monthlyDebtPayments + input.newMonthlyObligation),
                monthlySavingsCapacity: Money(Math.max(0, baseline.monthlySavingsCapacity - input.newMonthlyObligation)),
                monthlyAllocableAmount: Money(Math.max(0, baseline.monthlySavingsCapacity - input.newMonthlyObligation)),
                goalFundingGap: baseline.goalFundingGap,
                goalsOnTrack: baseline.activeGoals,
                financialHealthScore: Math.max(30, baseline.financialHealthScore - 1),
                healthStatus: FinancialHealthStatus.AT_RISK,
                requiresMonthlyCommitment: input.newMonthlyObligation,
            },
            assumptions: [
                {
                    key: "income_stable",
                    statement: "Income remains stable",
                    confidence: ConfidenceLevel.MEDIUM,
                    impact: "HIGH",
                },
            ],
            sensitivities: [],
            order: 1,
            rationale: "Healthy debt-to-income ratio.",
            calculationVersion: 1,
            createdAt: new Date(),
            confidence: ConfidenceLevel.HIGH,
            dataCompleteness: 85,
        });
    }

    // Scenario B: Borderline
    if (resultingRatio < 0.5 && resultingRatio >= 0.35) {
        scenarios.push({
            id: `scenario-aff-borderline-${Date.now()}` as EntityId,
            householdId,
            financialSnapshotId: snapshotId,
            financialSnapshotVersion: 1,
            type: ScenarioType.AFFORDABILITY,
            title: "Borderline - Caution",
            description: "Technically affordable but leaves limited flexibility",
            input,
            baseline,
            proposedActions: [
                {
                    id: "action-1",
                    title: "Proceed with conditions",
                    description: "Add but reduce other spending",
                    amount: input.newMonthlyObligation,
                    frequencyMonths: 1,
                },
            ],
            impact: {
                immediatelyAffected: true,
                cashFlowImpact: Money(-input.newMonthlyObligation),
                debtReduction: Money(0),
                emergencyFundIncrease: Money(0),
                investmentIncrease: Money(0),
                savingsIncrease: Money(0),
                wealthIncrease: Money(0),
                debtToIncomeChange: input.newMonthlyObligation / baseline.monthlyIncome,
                healthScoreChange: -4,
                emergencyFundMonthsChange: 0,
                riskReduction: "NONE",
                flexibilityChange: "REDUCED",
                liquidityChange: "DECREASED",
            },
            resultingState: {
                emergencyFundBalance: baseline.emergencyFundBalance,
                emergencyFundMonths: baseline.emergencyFundMonths,
                totalDebt: Money(baseline.totalDebt + Money(input.newMonthlyObligation * 60)),
                debtToIncomeRatio: resultingRatio,
                monthlyDebtPayments: Money(baseline.monthlyDebtPayments + input.newMonthlyObligation),
                monthlySavingsCapacity: Money(Math.max(0, baseline.monthlySavingsCapacity - input.newMonthlyObligation)),
                monthlyAllocableAmount: Money(Math.max(0, baseline.monthlySavingsCapacity - input.newMonthlyObligation)),
                goalFundingGap: baseline.goalFundingGap,
                goalsOnTrack: baseline.activeGoals,
                financialHealthScore: Math.max(30, baseline.financialHealthScore - 3),
                healthStatus: FinancialHealthStatus.AT_RISK,
                requiresMonthlyCommitment: input.newMonthlyObligation,
            },
            assumptions: [
                {
                    key: "spending_reduction",
                    statement: "Can reduce discretionary spending",
                    confidence: ConfidenceLevel.MEDIUM,
                    impact: "MEDIUM",
                },
            ],
            sensitivities: [],
            order: 2,
            rationale: "Tight but possible with spending discipline.",
            calculationVersion: 1,
            createdAt: new Date(),
            confidence: ConfidenceLevel.MEDIUM,
            dataCompleteness: 80,
        });
    }

    // Scenario C: Not affordable - wait
    {
        scenarios.push({
            id: `scenario-aff-wait-${Date.now()}` as EntityId,
            householdId,
            financialSnapshotId: snapshotId,
            financialSnapshotVersion: 1,
            type: ScenarioType.AFFORDABILITY,
            title: "Not Affordable - Wait",
            description: "Better to delay and strengthen position first",
            input,
            baseline,
            proposedActions: [
                {
                    id: "action-1",
                    title: "Delay purchase",
                    description: "Delay purchase for 12 months to strengthen financial position",
                    frequencyMonths: 12,
                },
                {
                    id: "action-2",
                    title: "Build safety",
                    description: "Allocate $500/month to emergency fund",
                    amount: Money(500),
                    frequencyMonths: 1,
                },
            ],
            impact: {
                immediatelyAffected: false,
                timeframeMonths: 12,
                cashFlowImpact: Money(0),
                debtReduction: Money(0),
                emergencyFundIncrease: Money(6000),
                investmentIncrease: Money(0),
                savingsIncrease: Money(0),
                wealthIncrease: Money(6000),
                debtToIncomeChange: 0,
                healthScoreChange: 5,
                emergencyFundMonthsChange: 6000 / baseline.monthlyExpenses,
                riskReduction: "HIGH",
                flexibilityChange: "INCREASED",
                liquidityChange: "IMPROVED",
            },
            resultingState: {
                emergencyFundBalance: Money(baseline.emergencyFundBalance + 6000),
                emergencyFundMonths: baseline.emergencyFundMonths + (6000 / baseline.monthlyExpenses),
                totalDebt: baseline.totalDebt,
                debtToIncomeRatio: baseline.debtToIncomeRatio,
                monthlyDebtPayments: baseline.monthlyDebtPayments,
                monthlySavingsCapacity: Money(Math.max(0, baseline.monthlySavingsCapacity - 500)),
                monthlyAllocableAmount: Money(Math.max(0, baseline.monthlySavingsCapacity - 500)),
                goalFundingGap: baseline.goalFundingGap,
                goalsOnTrack: baseline.activeGoals,
                financialHealthScore: Math.min(100, baseline.financialHealthScore + 5),
                healthStatus: FinancialHealthStatus.HEALTHY,
                requiresMonthlyCommitment: Money(500),
            },
            assumptions: [
                {
                    key: "can_delay",
                    statement: "Can defer purchase 12 months",
                    confidence: ConfidenceLevel.MEDIUM,
                    impact: "HIGH",
                },
            ],
            sensitivities: [],
            order: 3,
            rationale: "Recommended if DTI would exceed 50% or EF insufficient.",
            calculationVersion: 1,
            createdAt: new Date(),
            confidence: ConfidenceLevel.HIGH,
            dataCompleteness: 85,
        });
    }

    return scenarios;
}

/**
 * Generate financial independence scenarios
 */
export function generateFinancialIndependenceScenarios(
    householdId: EntityId,
    snapshotId: EntityId,
    input: any,
    baseline: ScenarioBaseline
): Scenario[] {
    const scenarios: Scenario[] = [];

    // Scenario A: Status quo
    scenarios.push({
        id: `scenario-fi-baseline-${Date.now()}` as EntityId,
        householdId,
        financialSnapshotId: snapshotId,
        financialSnapshotVersion: 1,
        type: ScenarioType.FINANCIAL_INDEPENDENCE,
        title: "Status Quo",
        description: "No change to retirement savings",
        input,
        baseline,
        proposedActions: [
            {
                id: "action-1",
                title: "Continue current path",
                description: "No additional savings",
            },
        ],
        impact: {
            immediatelyAffected: false,
            timeframeMonths: (input.yearsToRetirement || 30) * 12,
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
            healthStatus: baseline.healthStatus,
        },
        assumptions: [
            {
                key: "income_growth",
                statement: "Income grows with inflation",
                confidence: ConfidenceLevel.MEDIUM,
                impact: "MEDIUM",
            },
        ],
        sensitivities: [],
        order: 1,
        rationale: "Baseline for retirement planning comparison.",
        calculationVersion: 1,
        createdAt: new Date(),
        confidence: ConfidenceLevel.MEDIUM,
        dataCompleteness: 70,
    });

    // Scenario B: Increased savings
    if (input.additionalAnnualSavings) {
        const yearsToRetirement = input.yearsToRetirement || 30;
        const monthlyAdditional = Money(Math.round(input.additionalAnnualSavings / 12));
        const projectedWealth = Money(Math.round(
            (input.additionalAnnualSavings * (Math.pow(1.06, yearsToRetirement) - 1)) / 0.06
        ));

        scenarios.push({
            id: `scenario-fi-increased-${Date.now()}` as EntityId,
            householdId,
            financialSnapshotId: snapshotId,
            financialSnapshotVersion: 1,
            type: ScenarioType.FINANCIAL_INDEPENDENCE,
            title: "Increased Savings",
            description: `Save additional ${input.additionalAnnualSavings} annually`,
            input,
            baseline,
            proposedActions: [
                {
                    id: "action-1",
                    title: "Boost retirement contributions",
                    description: `Increase savings by ${monthlyAdditional} monthly`,
                    amount: monthlyAdditional,
                    frequencyMonths: 1,
                },
            ],
            impact: {
                immediatelyAffected: true,
                timeframeMonths: yearsToRetirement * 12,
                cashFlowImpact: Money(-monthlyAdditional),
                debtReduction: Money(0),
                emergencyFundIncrease: Money(0),
                investmentIncrease: projectedWealth,
                savingsIncrease: Money(0),
                wealthIncrease: projectedWealth,
                debtToIncomeChange: -(monthlyAdditional / baseline.monthlyIncome),
                healthScoreChange: 2,
                emergencyFundMonthsChange: 0,
                riskReduction: "NONE",
                flexibilityChange: "REDUCED",
                liquidityChange: "DECREASED",
            },
            resultingState: {
                emergencyFundBalance: baseline.emergencyFundBalance,
                emergencyFundMonths: baseline.emergencyFundMonths,
                totalDebt: baseline.totalDebt,
                debtToIncomeRatio: baseline.debtToIncomeRatio,
                monthlyDebtPayments: baseline.monthlyDebtPayments,
                monthlySavingsCapacity: Money(Math.max(0, baseline.monthlySavingsCapacity - monthlyAdditional)),
                monthlyAllocableAmount: Money(Math.max(0, baseline.monthlySavingsCapacity - monthlyAdditional)),
                goalFundingGap: baseline.goalFundingGap,
                goalsOnTrack: baseline.activeGoals,
                financialHealthScore: baseline.financialHealthScore + 1,
                healthStatus: baseline.healthStatus,
                requiresMonthlyCommitment: monthlyAdditional,
            },
            assumptions: [
                {
                    key: "consistent_contribution",
                    statement: `Can save ${monthlyAdditional} monthly consistently`,
                    confidence: ConfidenceLevel.MEDIUM,
                    impact: "HIGH",
                },
                {
                    key: "market_returns",
                    statement: "Investments return ~6% annually",
                    confidence: ConfidenceLevel.LOW,
                    impact: "HIGH",
                },
            ],
            sensitivities: [],
            order: 2,
            rationale: "Builds retirement security over time.",
            calculationVersion: 1,
            createdAt: new Date(),
            confidence: ConfidenceLevel.MEDIUM,
            dataCompleteness: 75,
        });
    }

    return scenarios;
}
