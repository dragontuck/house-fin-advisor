/**
 * Financial Context Builder
 * 
 * Converts user request + workflow state into minimal structured financial context
 * required to answer the request. Determines which tools are required.
 * 
 * Key Principles:
 * - Minimal context (retrieve only what's needed)
 * - Include metadata (versions, timestamps, assumptions, confidence)
 * - Never use conversation history as authoritative data
 * - Efficient queries without over-fetching
 * - Deterministic and auditable
 */

import {
    EntityId,
    Money,
    Budget,
    FinancialSnapshot,
    HouseholdSettings,
    RecurringPattern,
    RecurringFrequency,
    AdvisorWorkflow,
    WorkflowState,
    DebtAnalysis,
    SavingsGoal,
    PostedTransaction,
} from "@house-fin/contracts";

/**
 * Metadata about a data point in the financial context
 */
export interface DataPointMetadata {
    version: number;
    calculatedAt: Date;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    assumptions: string[];
}

/**
 * Represents the current month's budget with variance info
 */
export interface CurrentBudgetContext {
    period: { year: number; month: number };
    categories: Array<{
        category: string;
        budgetCents: Money;
        actualCents: Money;
        varianceCents: Money;
        percentSpent: number;
    }>;
    totalBudgetCents: Money;
    totalActualCents: Money;
    totalVarianceCents: Money;
    percentOverBudget: number;
    metadata: DataPointMetadata;
}

/**
 * Represents budget performance over time
 */
export interface BudgetPerformanceContext {
    periods: Array<{
        period: { year: number; month: number };
        totalBudgetCents: Money;
        totalActualCents: Money;
        varianceCents: Money;
        overBudget: boolean;
    }>;
    trend: "IMPROVING" | "DECLINING" | "STABLE" | "UNKNOWN";
    overBudgetCount: number;
    averageVarianceCents: Money;
    metadata: DataPointMetadata;
}

/**
 * Recurring financial obligations (for planning)
 */
export interface RecurringObligationsContext {
    patterns: RecurringPattern[];
    totalMonthlyProjectionCents: Money;
    metadata: DataPointMetadata;
}

/**
 * Projected cash flow for planning horizon
 */
export interface CashFlowContext {
    period: { year: number; month: number };
    projectedIncomeCents: Money;
    projectedExpensesCents: Money;
    projectedSurplusCents: Money;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    assumptions: string[];
    calculatedAt: Date;
}

/**
 * Financial items requiring attention (over/under budget, goal at risk, etc.)
 */
export interface AttentionItem {
    id: string;
    type:
    | "OVER_BUDGET_CATEGORY"
    | "UNDER_BUDGET_OPPORTUNITY"
    | "GOAL_AT_RISK"
    | "INSUFFICIENT_CASH_RESERVE"
    | "DEBT_CONCERN"
    | "UNUSUAL_SPENDING";
    severity: "HIGH" | "MEDIUM" | "LOW";
    description: string;
    affectedAmountCents?: Money;
    suggestedAction: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
}

/**
 * Complete financial context for an AI workflow
 * Contains only the minimum data needed to answer user's request
 */
export interface FinancialContext {
    householdId: EntityId;
    asOf: Date;

    // Core financial state (minimal)
    snapshot?: FinancialSnapshot;
    settings?: HouseholdSettings;

    // Budget context (for budget-related workflows)
    currentBudget?: CurrentBudgetContext;
    budgetPerformance?: BudgetPerformanceContext;

    // Cash flow (for planning workflows)
    projectedCashFlow?: CashFlowContext;

    // Recurring patterns (for forecasting)
    recurringObligations?: RecurringObligationsContext;

    // Debt and goals (for holistic planning)
    debt?: DebtAnalysis;
    goals?: SavingsGoal[];

    // Attention items (what's important to address)
    attentionItems?: AttentionItem[];

    // Workflow-specific context
    workflowType: AdvisorWorkflow;
    workflowId?: EntityId;

    // Metadata for reproducibility
    contextVersions: {
        snapshotVersion?: number;
        settingsVersion?: number;
        budgetDataVersion?: number;
    };
    toolsRequired: string[]; // Which tools will be needed
}

/**
 * Repository interfaces required by context builder
 */
export interface ContextBuilderDependencies {
    budgetRepo: {
        findByHouseholdAndPeriod(
            householdId: EntityId,
            year: number,
            month: number
        ): Promise<Budget[]>;
        findByHouseholdIdRange(
            householdId: EntityId,
            startYear: number,
            startMonth: number,
            endYear: number,
            endMonth: number
        ): Promise<Budget[]>;
    };
    transactionRepo: {
        findByHouseholdAndPeriod(
            householdId: EntityId,
            year: number,
            month: number
        ): Promise<
            Array<{
                id: string;
                category: string | null;
                amountCents: number;
                transactionDate: Date;
            }>
        >;
        findByHouseholdDateRange(
            householdId: EntityId,
            startDate: Date,
            endDate: Date
        ): Promise<
            Array<{
                id: string;
                category: string | null;
                amountCents: number;
                transactionDate: Date;
            }>
        >;
    };
    settingsRepo: {
        findByHouseholdId(householdId: EntityId): Promise<HouseholdSettings | null>;
    };
    recurringPatternsRepo: {
        findByHouseholdId(householdId: EntityId): Promise<RecurringPattern[]>;
    };
    snapshotRepo: {
        findLatest(householdId: EntityId): Promise<FinancialSnapshot | null>;
    };
    debtRepo: {
        findByHouseholdId(householdId: EntityId): Promise<DebtAnalysis | null>;
    };
    goalsRepo: {
        findByHouseholdId(householdId: EntityId): Promise<SavingsGoal[]>;
    };
}

/**
 * Financial Context Builder
 *
 * Builds minimal financial context for AI workflows by analyzing user request
 * and determining what data is actually needed.
 */
export class FinancialContextBuilder {
    constructor(private deps: ContextBuilderDependencies) { }

    /**
     * Build complete financial context for a workflow
     */
    async buildContext(
        householdId: EntityId,
        userRequest: string,
        workflowState: WorkflowState
    ): Promise<FinancialContext> {
        const context: FinancialContext = {
            householdId,
            asOf: new Date(),
            workflowType: workflowState.workflowType,
            workflowId: workflowState.id,
            contextVersions: {},
            toolsRequired: [],
        };

        // Determine what context is required based on workflow type
        const requirements = this.determineContextRequirements(
            workflowState.workflowType
        );

        // Fetch context in parallel
        const promises: Promise<void>[] = [];

        // Always fetch settings
        promises.push(
            (async () => {
                const settings = await this.deps.settingsRepo.findByHouseholdId(householdId);
                if (settings) context.settings = settings;
            })()
        );

        // Always fetch latest snapshot
        promises.push(
            (async () => {
                const snapshot = await this.deps.snapshotRepo.findLatest(householdId);
                if (snapshot) {
                    context.snapshot = snapshot;
                    context.contextVersions.snapshotVersion = snapshot.version;
                }
            })()
        );

        // Fetch current budget if needed
        if (requirements.needsCurrentBudget) {
            promises.push(
                (async () => {
                    const now = new Date();
                    const currentMonth = now.getMonth() + 1;
                    const currentYear = now.getFullYear();

                    context.currentBudget = await this.fetchCurrentBudgetContext(
                        householdId,
                        currentYear,
                        currentMonth
                    );
                })()
            );
        }

        // Fetch budget performance if needed
        if (requirements.needsBudgetPerformance) {
            promises.push(
                (async () => {
                    const now = new Date();
                    const currentMonth = now.getMonth() + 1;
                    const currentYear = now.getFullYear();
                    const lookbackMonths = requirements.lookbackMonths || 3;

                    context.budgetPerformance = await this.fetchBudgetPerformanceContext(
                        householdId,
                        currentYear,
                        currentMonth,
                        lookbackMonths
                    );
                })()
            );
        }

        // Fetch cash flow if needed
        if (requirements.needsCashFlow) {
            promises.push(
                (async () => {
                    const planningPeriod = workflowState.planningPeriod || {
                        year: new Date().getFullYear(),
                        month: new Date().getMonth() + 2, // Next month
                    };

                    context.projectedCashFlow = await this.fetchCashFlowContext(
                        householdId,
                        planningPeriod.year,
                        planningPeriod.month
                    );
                })()
            );
        }

        // Fetch recurring patterns if needed
        if (requirements.needsRecurringPatterns) {
            promises.push(
                (async () => {
                    const patterns = await this.deps.recurringPatternsRepo.findByHouseholdId(
                        householdId
                    );
                    context.recurringObligations = {
                        patterns,
                        totalMonthlyProjectionCents: this.projectMonthlyFromPatterns(patterns),
                        metadata: {
                            version: 1,
                            calculatedAt: new Date(),
                            confidence: patterns.length > 0 ? "MEDIUM" : "LOW",
                            assumptions: [
                                `Projections based on ${patterns.length} recurring patterns`,
                                "Patterns must have confidence ≥ 0.5 to be included",
                            ],
                        },
                    };
                })()
            );
        }

        // Fetch debt if needed
        if (requirements.needsDebt) {
            promises.push(
                (async () => {
                    const debt = await this.deps.debtRepo.findByHouseholdId(householdId);
                    if (debt) context.debt = debt;
                })()
            );
        }

        // Fetch goals if needed
        if (requirements.needsGoals) {
            promises.push(
                (async () => {
                    context.goals = await this.deps.goalsRepo.findByHouseholdId(householdId);
                })()
            );
        }

        // Fetch attention items if needed
        if (requirements.needsAttentionItems) {
            promises.push(
                (async () => {
                    context.attentionItems = await this.fetchAttentionItems(
                        householdId,
                        context
                    );
                })()
            );
        }

        // Execute all fetches in parallel
        await Promise.all(promises);

        // Determine which tools are required
        context.toolsRequired = this.determineToolsRequired(workflowState, context);

        return context;
    }

    /**
     * Determine what financial context is required for a workflow
     */
    private determineContextRequirements(workflowType: AdvisorWorkflow): {
        needsCurrentBudget: boolean;
        needsBudgetPerformance: boolean;
        needsCashFlow: boolean;
        needsRecurringPatterns: boolean;
        needsDebt: boolean;
        needsGoals: boolean;
        needsAttentionItems: boolean;
        lookbackMonths?: number;
    } {
        switch (workflowType) {
            // Informational workflows - minimal context
            case AdvisorWorkflow.FINANCIAL_HEALTH:
                return {
                    needsCurrentBudget: false,
                    needsBudgetPerformance: false,
                    needsCashFlow: false,
                    needsRecurringPatterns: false,
                    needsDebt: true,
                    needsGoals: true,
                    needsAttentionItems: true,
                };

            case AdvisorWorkflow.BUDGET_STATUS:
                return {
                    needsCurrentBudget: true,
                    needsBudgetPerformance: true,
                    needsCashFlow: false,
                    needsRecurringPatterns: false,
                    needsDebt: false,
                    needsGoals: false,
                    needsAttentionItems: true,
                    lookbackMonths: 3,
                };

            case AdvisorWorkflow.CASH_FLOW:
                return {
                    needsCurrentBudget: false,
                    needsBudgetPerformance: false,
                    needsCashFlow: true,
                    needsRecurringPatterns: true,
                    needsDebt: false,
                    needsGoals: false,
                    needsAttentionItems: false,
                };

            case AdvisorWorkflow.GOAL_STATUS:
                return {
                    needsCurrentBudget: true,
                    needsBudgetPerformance: false,
                    needsCashFlow: true,
                    needsRecurringPatterns: false,
                    needsDebt: false,
                    needsGoals: true,
                    needsAttentionItems: true,
                };

            case AdvisorWorkflow.DEBT_STATUS:
                return {
                    needsCurrentBudget: false,
                    needsBudgetPerformance: false,
                    needsCashFlow: true,
                    needsRecurringPatterns: false,
                    needsDebt: true,
                    needsGoals: false,
                    needsAttentionItems: true,
                };

            // Diagnostic workflows
            case AdvisorWorkflow.BUDGET_DIAGNOSE:
                return {
                    needsCurrentBudget: true,
                    needsBudgetPerformance: true,
                    needsCashFlow: false,
                    needsRecurringPatterns: true,
                    needsDebt: false,
                    needsGoals: false,
                    needsAttentionItems: true,
                    lookbackMonths: 6, // Look back farther for diagnosis
                };

            // Planning workflows - comprehensive context
            case AdvisorWorkflow.BUDGET_CREATE:
                return {
                    needsCurrentBudget: true,
                    needsBudgetPerformance: true,
                    needsCashFlow: true,
                    needsRecurringPatterns: true,
                    needsDebt: true,
                    needsGoals: true,
                    needsAttentionItems: true,
                    lookbackMonths: 3,
                };

            case AdvisorWorkflow.BUDGET_REVISE:
                return {
                    needsCurrentBudget: true,
                    needsBudgetPerformance: false,
                    needsCashFlow: true,
                    needsRecurringPatterns: true,
                    needsDebt: false,
                    needsGoals: true,
                    needsAttentionItems: false,
                };

            // Scenario workflows
            case AdvisorWorkflow.BUDGET_SCENARIO:
                return {
                    needsCurrentBudget: true,
                    needsBudgetPerformance: false,
                    needsCashFlow: false,
                    needsRecurringPatterns: false,
                    needsDebt: false,
                    needsGoals: false,
                    needsAttentionItems: false,
                };

            case AdvisorWorkflow.AFFORDABILITY:
                return {
                    needsCurrentBudget: false,
                    needsBudgetPerformance: false,
                    needsCashFlow: true,
                    needsRecurringPatterns: true,
                    needsDebt: true,
                    needsGoals: true,
                    needsAttentionItems: false,
                };

            // Default/fallback
            case AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION:
            default:
                return {
                    needsCurrentBudget: false,
                    needsBudgetPerformance: false,
                    needsCashFlow: false,
                    needsRecurringPatterns: false,
                    needsDebt: false,
                    needsGoals: false,
                    needsAttentionItems: false,
                };
        }
    }

    /**
     * Fetch current month's budget with actual spending
     */
    private async fetchCurrentBudgetContext(
        householdId: EntityId,
        year: number,
        month: number
    ): Promise<CurrentBudgetContext | undefined> {
        try {
            const [budgets, transactions] = await Promise.all([
                this.deps.budgetRepo.findByHouseholdAndPeriod(householdId, year, month),
                this.deps.transactionRepo.findByHouseholdAndPeriod(householdId, year, month),
            ]);

            if (!budgets || budgets.length === 0) {
                return undefined;
            }

            // Group transactions by category
            const categoryActuals = new Map<string, number>();
            for (const trans of transactions) {
                const category = trans.category || "Uncategorized";
                const current = categoryActuals.get(category) ?? 0;
                categoryActuals.set(category, current + Math.abs(trans.amountCents));
            }

            // Build category comparison
            const categories = budgets.map((b) => ({
                category: b.category,
                budgetCents: b.amountCents,
                actualCents: (categoryActuals.get(b.category) ?? 0) as Money,
                varianceCents: (b.amountCents - (categoryActuals.get(b.category) ?? 0)) as Money,
                percentSpent: Math.round(
                    ((categoryActuals.get(b.category) ?? 0) / b.amountCents) * 100
                ),
            }));

            const totalBudgetCents = budgets.reduce((sum, b) => sum + b.amountCents, 0) as Money;
            const totalActualCents = Array.from(categoryActuals.values()).reduce(
                (sum, amt) => sum + amt,
                0
            ) as Money;

            return {
                period: { year, month },
                categories,
                totalBudgetCents,
                totalActualCents,
                totalVarianceCents: (totalBudgetCents - totalActualCents) as Money,
                percentOverBudget: Math.round(
                    ((totalActualCents - totalBudgetCents) / totalBudgetCents) * 100
                ),
                metadata: {
                    version: 1,
                    calculatedAt: new Date(),
                    confidence: "HIGH",
                    assumptions: [
                        `Current month: ${year}-${month}`,
                        `Actual spending includes all categorized transactions`,
                    ],
                },
            };
        } catch (error) {
            return undefined;
        }
    }

    /**
     * Fetch budget performance over multiple months
     */
    private async fetchBudgetPerformanceContext(
        householdId: EntityId,
        currentYear: number,
        currentMonth: number,
        lookbackMonths: number
    ): Promise<BudgetPerformanceContext | undefined> {
        try {
            // Calculate start month
            let startMonth = currentMonth - lookbackMonths;
            let startYear = currentYear;
            if (startMonth <= 0) {
                startYear -= Math.ceil(Math.abs(startMonth) / 12);
                startMonth = 12 + (startMonth % 12);
            }

            // Fetch all budgets for the range
            const budgets = await this.deps.budgetRepo.findByHouseholdIdRange(
                householdId,
                startYear,
                startMonth,
                currentYear,
                currentMonth
            );

            if (!budgets || budgets.length === 0) {
                return undefined;
            }

            // Group by period
            const byPeriod = new Map<string, Budget[]>();
            for (const budget of budgets) {
                const key = `${budget.periodYear}-${budget.periodMonth}`;
                if (!byPeriod.has(key)) {
                    byPeriod.set(key, []);
                }
                byPeriod.get(key)!.push(budget);
            }

            // Fetch transactions for the same range
            const startDate = new Date(startYear, startMonth - 1, 1);
            const endDate = new Date(currentYear, currentMonth, 0);
            const transactions = await this.deps.transactionRepo.findByHouseholdDateRange(
                householdId,
                startDate,
                endDate
            );

            // Group transactions by period
            const transByPeriod = new Map<string, Array<{ amountCents: number }>>();
            for (const trans of transactions) {
                const month = trans.transactionDate.getMonth() + 1;
                const year = trans.transactionDate.getFullYear();
                const key = `${year}-${month}`;
                if (!transByPeriod.has(key)) {
                    transByPeriod.set(key, []);
                }
                transByPeriod.get(key)!.push({ amountCents: Math.abs(trans.amountCents) });
            }

            // Calculate performance per period
            let overBudgetCount = 0;
            let totalVariance = 0 as Money;
            const periods = Array.from(byPeriod.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, periodBudgets]) => {
                    const totalBudgetCents = periodBudgets.reduce(
                        (sum, b) => sum + b.amountCents,
                        0
                    ) as Money;
                    const actualCents = (
                        transByPeriod.get(key)?.reduce((sum, t) => sum + t.amountCents, 0) ?? 0
                    ) as Money;
                    const varianceCents = (totalBudgetCents - actualCents) as Money;
                    const overBudget = actualCents > totalBudgetCents;

                    if (overBudget) overBudgetCount++;
                    totalVariance = (totalVariance + Math.abs(varianceCents)) as Money;

                    return {
                        period: { year: parseInt(key.split("-")[0], 10), month: parseInt(key.split("-")[1], 10) },
                        totalBudgetCents,
                        totalActualCents: actualCents,
                        varianceCents,
                        overBudget,
                    };
                });

            // Determine trend
            let trend: "IMPROVING" | "DECLINING" | "STABLE" | "UNKNOWN" = "UNKNOWN";
            if (periods.length >= 2) {
                const recent = periods.slice(-2);
                const improvement = Math.abs(recent[1].varianceCents) - Math.abs(recent[0].varianceCents);
                if (Math.abs(improvement) > 10000) {
                    // > $100 difference
                    trend = improvement > 0 ? "IMPROVING" : "DECLINING";
                } else {
                    trend = "STABLE";
                }
            }

            return {
                periods,
                trend,
                overBudgetCount,
                averageVarianceCents: (totalVariance / periods.length) as Money,
                metadata: {
                    version: 1,
                    calculatedAt: new Date(),
                    confidence: periods.length >= 3 ? "HIGH" : "MEDIUM",
                    assumptions: [
                        `Looking back ${lookbackMonths} months`,
                        "Variance calculated as Budget - Actual",
                        "Positive variance = under budget (good)",
                    ],
                },
            };
        } catch (error) {
            return undefined;
        }
    }

    /**
     * Fetch projected cash flow for a month
     */
    private async fetchCashFlowContext(
        householdId: EntityId,
        year: number,
        month: number
    ): Promise<CashFlowContext | undefined> {
        try {
            const settings = await this.deps.settingsRepo.findByHouseholdId(householdId);
            const patterns = await this.deps.recurringPatternsRepo.findByHouseholdId(householdId);

            if (!settings) {
                return undefined;
            }

            // Project income
            const projectedIncomeCents = settings.monthlyIncome ?? (0 as Money);

            // Project expenses from patterns and settings
            const recurringSpendings: Money = patterns
                .filter((p) => p.direction === "DEBIT")
                .reduce((sum, p) => (sum + this.estimateMonthlyFromFrequency(p.typicalAmountCents as Money, p.frequency)) as Money, 0 as Money);

            const projectedExpensesCents = (
                (settings.monthlyEssentialExpenses ?? (0 as Money)) +
                (settings.monthlyDiscretionaryExpenses ?? (0 as Money)) +
                recurringSpendings
            ) as Money;

            const projectedSurplusCents = (projectedIncomeCents - projectedExpensesCents) as Money;

            return {
                period: { year, month },
                projectedIncomeCents,
                projectedExpensesCents,
                projectedSurplusCents,
                confidence: patterns.length > 0 ? "MEDIUM" : "LOW",
                assumptions: [
                    `Income from household settings: $${projectedIncomeCents / 100}`,
                    `Base expenses from settings: $${((settings.monthlyEssentialExpenses ?? 0) + (settings.monthlyDiscretionaryExpenses ?? 0)) / 100}`,
                    `Recurring patterns: ${patterns.length} found`,
                ],
                calculatedAt: new Date(),
            };
        } catch (error) {
            return undefined;
        }
    }

    /**
     * Project monthly spending from recurring patterns
     */
    private projectMonthlyFromPatterns(patterns: RecurringPattern[]): Money {
        return patterns
            .filter((p) => p.direction === "DEBIT")
            .reduce((sum, p) => (sum + this.estimateMonthlyFromFrequency(p.typicalAmountCents as Money, p.frequency)) as Money, 0 as Money);
    }

    /**
     * Convert frequency to monthly amount
     */
    private estimateMonthlyFromFrequency(amount: Money, frequency: RecurringFrequency): Money {
        switch (frequency) {
            case "WEEKLY":
                return (Math.round((amount * 52) / 12)) as Money;
            case "BIWEEKLY":
                return (Math.round((amount * 26) / 12)) as Money;
            case "MONTHLY":
                return amount;
            case "QUARTERLY":
                return (Math.round(amount / 3)) as Money;
            case "ANNUAL":
                return (Math.round(amount / 12)) as Money;
            default:
                return (0) as Money;
        }
    }

    /**
     * Fetch attention items that need user awareness
     */
    private async fetchAttentionItems(
        householdId: EntityId,
        context: Partial<FinancialContext>
    ): Promise<AttentionItem[]> {
        const items: AttentionItem[] = [];

        // Over-budget categories
        if (context.currentBudget) {
            for (const category of context.currentBudget.categories) {
                if (category.actualCents > category.budgetCents) {
                    items.push({
                        id: `over-budget-${category.category}`,
                        type: "OVER_BUDGET_CATEGORY",
                        severity: category.percentSpent > 150 ? "HIGH" : "MEDIUM",
                        description: `${category.category} is over budget`,
                        affectedAmountCents: (category.actualCents - category.budgetCents) as Money,
                        suggestedAction: `Review spending in ${category.category} category`,
                        confidence: "HIGH",
                    });
                }
            }
        }

        // Budget diagnosis issues
        if (context.budgetPerformance && context.budgetPerformance.overBudgetCount >= 2) {
            items.push({
                id: "recurring-over-budget",
                type: "OVER_BUDGET_CATEGORY",
                severity: "HIGH",
                description: `Over budget in ${context.budgetPerformance.overBudgetCount} of last ${context.budgetPerformance.periods.length} months`,
                suggestedAction: "Review budget allocation and spending patterns",
                confidence: "HIGH",
            });
        }

        // Cash flow issues
        if (context.projectedCashFlow && context.projectedCashFlow.projectedSurplusCents < 0) {
            items.push({
                id: "negative-cash-flow",
                type: "INSUFFICIENT_CASH_RESERVE",
                severity: "HIGH",
                description: "Projected deficit for next month",
                affectedAmountCents: (Math.abs(context.projectedCashFlow.projectedSurplusCents)) as Money,
                suggestedAction: "Consider increasing income or reducing expenses",
                confidence: context.projectedCashFlow.confidence === "HIGH" ? "HIGH" : "MEDIUM",
            });
        }

        return items;
    }

    /**
     * Determine which AI tools should be used based on context
     */
    private determineToolsRequired(workflowState: WorkflowState, context: FinancialContext): string[] {
        const tools: string[] = [];

        switch (context.workflowType) {
            case AdvisorWorkflow.BUDGET_CREATE:
                tools.push("create_initial_budget");
                break;

            case AdvisorWorkflow.BUDGET_REVISE:
            case AdvisorWorkflow.BUDGET_SCENARIO:
                tools.push("plan_next_month_budget");
                if (workflowState.currentScenario) {
                    tools.push("simulate_budget_change");
                }
                break;

            case AdvisorWorkflow.BUDGET_DIAGNOSE:
                tools.push("analyze_budget_variance");
                break;

            case AdvisorWorkflow.BUDGET_STATUS:
                tools.push("analyze_budget_variance");
                break;

            case AdvisorWorkflow.CASH_FLOW:
                // Cash flow analysis through data context
                break;

            case AdvisorWorkflow.AFFORDABILITY:
                tools.push("simulate_budget_change");
                break;

            case AdvisorWorkflow.FINANCIAL_HEALTH:
            case AdvisorWorkflow.GOAL_STATUS:
            case AdvisorWorkflow.DEBT_STATUS:
            case AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION:
            default:
                // Use data context only, no tools needed
                break;
        }

        return tools;
    }
}

/**
 * Factory function for creating context builder
 */
export function createFinancialContextBuilder(
    deps: ContextBuilderDependencies
): FinancialContextBuilder {
    return new FinancialContextBuilder(deps);
}
