/**
 * AI Tool Implementations - Deterministic Financial Planning Tools
 *
 * Each tool wraps existing domain services to provide structured financial data
 * to the LLM. All calculations are performed by domain services, ensuring
 * determinism, auditability, and financial correctness.
 *
 * Key Principles:
 * - No calculations performed here; only domain service delegation
 * - All outputs are deterministic (identical inputs → identical outputs)
 * - No randomness, no external APIs, no LLM reasoning
 * - Comprehensive error handling and validation
 */

import {
    EntityId,
    Money,
    Budget,
    BudgetPeriod,
    FinancialSnapshot,
    HouseholdSettings,
    RecurringPattern,
    RecurringFrequency,
} from "@house-fin/contracts";
import {
    BudgetService,
    CashFlowService,
    createBudgetService,
    createCashFlowService,
} from "@house-fin/domain";
import {
    CreateInitialBudgetOutput,
    AnalyzeBudgetVarianceOutput,
    PlanNextMonthBudgetOutput,
    SimulateBudgetChangeOutput,
    ProposedBudgetCategory,
    NextMonthBudgetProposal,
    VarianceTrend,
} from "@house-fin/contracts";

/**
 * Dependencies required by all tools
 */
export interface ToolDependencies {
    budgetService: BudgetService;
    cashFlowService: CashFlowService;
    // Repository access
    budgetRepo: {
        findByPeriod(householdId: EntityId, year: number, month: number): Promise<Budget[]>;
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
        ): Promise<Array<{
            id: string;
            category: string | null;
            amountCents: number;
            transactionDate: Date;
        }>>;
        findByHouseholdDateRange(
            householdId: EntityId,
            startDate: Date,
            endDate: Date
        ): Promise<Array<{
            id: string;
            category: string | null;
            amountCents: number;
            transactionDate: Date;
        }>>;
    };
    settingsRepo: {
        findByHouseholdId(householdId: EntityId): Promise<HouseholdSettings | null>;
    };
    recurringPatternsRepo: {
        findByHouseholdId(householdId: EntityId): Promise<RecurringPattern[]>;
    };
}

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL IMPLEMENTATION 1: create_initial_budget
 *
 * Creates an initial budget by analyzing historical spending patterns and
 * current household financial settings. No transactions are modified.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export async function createInitialBudget(
    householdId: EntityId,
    month: string, // "YYYY-M"
    deps: ToolDependencies,
    options?: {
        incomeMethodCents?: Money;
        essentialExpensesCents?: Money;
        discretionaryExpensesCents?: Money;
    }
): Promise<CreateInitialBudgetOutput> {
    try {
        // Parse month string
        const [yearStr, monthStr] = month.split("-");
        const year = parseInt(yearStr, 10);
        const periodMonth = parseInt(monthStr, 10);

        if (!Number.isInteger(year) || !Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
            throw new Error(`Invalid month format: ${month}. Expected YYYY-M`);
        }

        // Get household settings
        const settings = await deps.settingsRepo.findByHouseholdId(householdId);

        // Determine income
        let monthlyIncomeCents = (options?.incomeMethodCents ?? settings?.monthlyIncome ?? 0) as Money;

        // Get historical spending to inform category recommendations
        // Look back 3 months for patterns
        let lookbackStartMonth = periodMonth - 3;
        let lookbackStartYear = year;
        if (lookbackStartMonth < 1) {
            lookbackStartMonth += 12;
            lookbackStartYear--;
        }

        const historicalTransactions = await deps.transactionRepo.findByHouseholdDateRange(
            householdId,
            new Date(lookbackStartYear, lookbackStartMonth - 1, 1),
            new Date(year, periodMonth, 0) // Last day of previous month
        );

        // Get recurring patterns
        const recurringPatterns = await deps.recurringPatternsRepo.findByHouseholdId(householdId);

        // Group historical spending by category
        const categorySpending = new Map<string, Array<number>>();
        for (const tx of historicalTransactions) {
            if (!tx.category) continue;
            if (!categorySpending.has(tx.category)) {
                categorySpending.set(tx.category, []);
            }
            categorySpending.get(tx.category)!.push(tx.amountCents);
        }

        // Calculate average spending per category
        const categoryAverages = new Map<string, number>();
        for (const [category, amounts] of categorySpending) {
            const avg = amounts.reduce((a, b) => a + b, 0) / Math.max(amounts.length, 1);
            categoryAverages.set(category, avg);
        }

        // Add recurring pattern expectations
        for (const pattern of recurringPatterns) {
            if (pattern.direction === "DEBIT") {
                const categoryKey = pattern.mostCommonCategory ?? "Other";
                const existing = categoryAverages.get(categoryKey) ?? 0;
                const monthlyAmount = estimateMonthlyFromFrequency(pattern.typicalAmountCents, pattern.frequency);
                // Take max of historical or pattern (pessimistic)
                categoryAverages.set(categoryKey, Math.max(existing, monthlyAmount));
            }
        }

        // Determine essential vs discretionary
        const essentialCategories = new Set([
            "HOUSING",
            "UTILITIES",
            "GROCERIES",
            "HEALTHCARE",
            "INSURANCE",
            "TRANSPORTATION",
            "FUEL",
            "DEBT_PAYMENT",
            "CHILDCARE",
            "EDUCATION",
        ]);

        const proposedBudgets: ProposedBudgetCategory[] = [];
        let totalEssentialCents = 0;
        let totalDiscretionaryCents = 0;

        for (const [category, avgCents] of categoryAverages) {
            const isEssential = essentialCategories.has(category.toUpperCase());
            const roundedAmount = Math.ceil(avgCents / 100) * 100; // Round up to nearest $1

            proposedBudgets.push({
                category,
                recommendedBudgetCents: roundedAmount as Money,
                historicalAverageCents: avgCents as Money,
                rationale: isEssential
                    ? `Essential category based on ${historicalTransactions.length > 0 ? "historical spending" : "household settings"}`
                    : `Discretionary category based on spending patterns`,
            });

            if (isEssential) {
                totalEssentialCents += roundedAmount;
            } else {
                totalDiscretionaryCents += roundedAmount;
            }
        }

        // Sort for deterministic output
        proposedBudgets.sort((a, b) => a.category.localeCompare(b.category));

        const totalBudgetedCents = (totalEssentialCents + totalDiscretionaryCents) as Money;
        const monthlyExpensesCents = totalBudgetedCents;
        const projectedSurplusCents = ((monthlyIncomeCents - totalBudgetedCents) as unknown as number) as Money;

        return {
            householdId,
            month,
            proposedBudgets,
            totalBudgetedCents,
            monthlyIncomeCents,
            monthlyExpensesCents,
            projectedSurplusCents,
            recommendations: generateBudgetRecommendations(
                monthlyIncomeCents,
                monthlyExpensesCents,
                projectedSurplusCents
            ),
        };
    } catch (error) {
        return {
            householdId,
            month,
            proposedBudgets: [],
            totalBudgetedCents: 0 as Money,
            monthlyIncomeCents: 0 as Money,
            monthlyExpensesCents: 0 as Money,
            projectedSurplusCents: 0 as Money,
            recommendations: [],
            error: error instanceof Error ? error.message : "Unknown error creating initial budget",
        };
    }
}

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL IMPLEMENTATION 2: analyze_budget_variance
 *
 * Analyzes multi-month budget variance trends to identify where household
 * consistently overspends or underspends.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export async function analyzeBudgetVariance(
    householdId: EntityId,
    deps: ToolDependencies,
    options?: {
        categories?: string[];
        months?: number;
    }
): Promise<AnalyzeBudgetVarianceOutput> {
    try {
        const monthCount = Math.min(options?.months ?? 3, 12);
        const categoryFilter = new Set(options?.categories ?? []);

        // Get current month
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        // Determine analysis range
        let startYear = currentYear;
        let startMonth = currentMonth - monthCount + 1;
        while (startMonth < 1) {
            startMonth += 12;
            startYear--;
        }

        // Fetch budgets and transactions for the range
        const budgetsInRange = await deps.budgetRepo.findByHouseholdIdRange(
            householdId,
            startYear,
            startMonth,
            currentYear,
            currentMonth
        );

        // Group budgets by period
        const budgetsByPeriod = new Map<string, Budget[]>();
        for (const budget of budgetsInRange) {
            const key = `${budget.periodYear}-${budget.periodMonth}`;
            if (!budgetsByPeriod.has(key)) {
                budgetsByPeriod.set(key, []);
            }
            budgetsByPeriod.get(key)!.push(budget);
        }

        // Analyze each month
        const categoryVariances = new Map<string, VarianceTrend>();
        let overallTrend: "IMPROVING" | "WORSENING" | "STABLE" = "STABLE";
        let totalVarianceCents = 0;

        let year = startYear;
        let month = startMonth;

        for (let i = 0; i < monthCount; i++) {
            // Fetch transactions for this period
            const transactions = await deps.transactionRepo.findByHouseholdAndPeriod(
                householdId,
                year,
                month
            );

            // Use BudgetService to calculate results
            const budgets = budgetsByPeriod.get(`${year}-${month}`) ?? [];
            const periodResults = deps.budgetService.calculateResults({
                householdId,
                period: { year, month },
                budgets,
                transactions: transactions.map((tx) => ({
                    id: tx.id,
                    category: tx.category,
                    amountCents: tx.amountCents,
                    transactionDate: tx.transactionDate,
                })),
                asOf: now,
            });

            // Update category variance tracking
            for (const result of periodResults.results) {
                if (categoryFilter.size > 0 && !categoryFilter.has(result.category)) continue;

                if (!categoryVariances.has(result.category)) {
                    categoryVariances.set(result.category, {
                        category: result.category,
                        avgVarianceCents: 0,
                        maxVarianceCents: result.varianceCents,
                        minVarianceCents: result.varianceCents,
                        overBudgetMonthCount: result.status === "OVER_BUDGET" ? 1 : 0,
                        totalMonthsAnalyzed: 1,
                        trend: "STABLE",
                    });
                } else {
                    const existing = categoryVariances.get(result.category)!;
                    existing.maxVarianceCents = Math.max(existing.maxVarianceCents, result.varianceCents);
                    existing.minVarianceCents = Math.min(existing.minVarianceCents, result.varianceCents);
                    if (result.status === "OVER_BUDGET") {
                        existing.overBudgetMonthCount++;
                    }
                    existing.totalMonthsAnalyzed++;
                }
            }

            totalVarianceCents += periodResults.totalVarianceCents;

            // Advance to next month
            month++;
            if (month > 12) {
                month = 1;
                year++;
            }
        }

        // Calculate average variance and trends
        const trends: VarianceTrend[] = Array.from(categoryVariances.values());
        for (const trend of trends) {
            trend.avgVarianceCents = Math.round(trend.avgVarianceCents / trend.totalMonthsAnalyzed);
        }

        // Determine overall trend by looking at first vs last months
        const firstMonthVars = trends.map((t) => t.avgVarianceCents).slice(0, Math.ceil(trends.length / 2));
        const lastMonthVars = trends.map((t) => t.avgVarianceCents).slice(Math.floor(trends.length / 2));
        const firstAvg = firstMonthVars.reduce((a, b) => a + b, 0) / Math.max(firstMonthVars.length, 1);
        const lastAvg = lastMonthVars.reduce((a, b) => a + b, 0) / Math.max(lastMonthVars.length, 1);

        if (lastAvg < firstAvg - 1000) {
            overallTrend = "IMPROVING"; // Variance decreasing
        } else if (lastAvg > firstAvg + 1000) {
            overallTrend = "WORSENING"; // Variance increasing
        }

        return {
            householdId,
            periodAnalyzed: `${startYear}-${startMonth} through ${currentYear}-${currentMonth}`,
            monthsIncluded: monthCount,
            categoryVariances: trends,
            overallTrend,
            typicalVarianceCents: Math.round(totalVarianceCents / Math.max(monthCount, 1)),
            recommendations: generateVarianceRecommendations(trends),
        };
    } catch (error) {
        return {
            householdId,
            periodAnalyzed: "",
            monthsIncluded: 0,
            categoryVariances: [],
            overallTrend: "STABLE",
            typicalVarianceCents: 0,
            recommendations: [],
            error: error instanceof Error ? error.message : "Unknown error analyzing budget variance",
        };
    }
}

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL IMPLEMENTATION 3: plan_next_month_budget
 *
 * Proposes next month's budget based on current spending trends and
 * recurring patterns.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export async function planNextMonthBudget(
    householdId: EntityId,
    deps: ToolDependencies,
    options?: {
        incomeOverrideCents?: Money;
        knownUpcomingExpenses?: Array<{
            description: string;
            estimatedAmountCents: Money;
            category: string;
        }>;
    }
): Promise<PlanNextMonthBudgetOutput> {
    try {
        const now = new Date();
        const nextYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
        const nextMonth = (now.getMonth() + 1) % 12 + 1;

        // Get household settings
        const settings = await deps.settingsRepo.findByHouseholdId(householdId);

        // Determine income
        let estimatedIncomeCents = (options?.incomeOverrideCents ?? settings?.monthlyIncome ?? 0) as Money;

        // Get recurring patterns
        const recurringPatterns = await deps.recurringPatternsRepo.findByHouseholdId(householdId);

        // Get current month's budget as baseline
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentBudgets = await deps.budgetRepo.findByPeriod(
            householdId,
            currentYear,
            currentMonth
        );

        // Get historical transactions (last 3 months) for category averages
        let lookbackStart = currentMonth - 3;
        let lookbackYear = currentYear;
        if (lookbackStart < 1) {
            lookbackStart += 12;
            lookbackYear--;
        }

        const historicalTxs = await deps.transactionRepo.findByHouseholdDateRange(
            householdId,
            new Date(lookbackYear, lookbackStart - 1, 1),
            new Date(currentYear, currentMonth, 0)
        );

        // Build category spending map
        const categorySpending = new Map<string, number[]>();
        for (const tx of historicalTxs) {
            if (!tx.category) continue;
            if (!categorySpending.has(tx.category)) {
                categorySpending.set(tx.category, []);
            }
            categorySpending.get(tx.category)!.push(tx.amountCents);
        }

        // Create proposed budgets
        const proposedBudgets: NextMonthBudgetProposal[] = [];
        const existingCategorySet = new Set<string>();

        // Start with current budget categories
        for (const budget of currentBudgets) {
            existingCategorySet.add(budget.category);

            // Check historical spending
            const historicalAmounts = categorySpending.get(budget.category) ?? [];
            const avgHistorical =
                historicalAmounts.length > 0
                    ? Math.ceil(historicalAmounts.reduce((a, b) => a + b, 0) / historicalAmounts.length / 100) * 100
                    : 0;

            // Check recurring patterns for this category
            const patterns = recurringPatterns.filter((p) => p.mostCommonCategory === budget.category);
            const patternAmount = patterns.reduce((sum, p) => sum + estimateMonthlyFromFrequency(p.typicalAmountCents, p.frequency), 0);

            // Propose amount: max of current, historical average, or pattern
            const proposedAmount = Math.max(budget.amountCents, avgHistorical, patternAmount) as Money;

            proposedBudgets.push({
                category: budget.category,
                proposedBudgetCents: proposedAmount,
                currentBudgetCents: budget.amountCents,
                historicalAverageCents: avgHistorical as Money,
                isBasedOnRecurring: patternAmount > 0,
                rationale: `Based on historical spending and recurring patterns`,
            });
        }

        // Add any new categories from known upcoming expenses
        if (options?.knownUpcomingExpenses) {
            for (const expense of options.knownUpcomingExpenses) {
                if (!existingCategorySet.has(expense.category)) {
                    existingCategorySet.add(expense.category);
                    proposedBudgets.push({
                        category: expense.category,
                        proposedBudgetCents: expense.estimatedAmountCents,
                        currentBudgetCents: 0 as Money,
                        historicalAverageCents: 0 as Money,
                        isBasedOnRecurring: false,
                        rationale: `New category for known upcoming expense: ${expense.description}`,
                    });
                }
            }
        }

        // Add any high-frequency categories from transaction history that aren't budgeted yet
        for (const [category, amounts] of categorySpending) {
            if (existingCategorySet.has(category)) continue;
            if (amounts.length >= 2) {
                // Only add if it appears at least twice
                const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
                proposedBudgets.push({
                    category,
                    proposedBudgetCents: Math.ceil(avg / 100) * 100 as Money,
                    currentBudgetCents: 0 as Money,
                    historicalAverageCents: avg as Money,
                    isBasedOnRecurring: false,
                    rationale: `Recurring spending detected in historical data`,
                });
            }
        }

        // Sort for deterministic output
        proposedBudgets.sort((a, b) => a.category.localeCompare(b.category));

        const totalProposedCents = proposedBudgets.reduce((sum, b) => sum + b.proposedBudgetCents, 0) as Money;
        const projectedSurplusCents = (estimatedIncomeCents - totalProposedCents) as Money;
        const hasKnownExpenses = (options?.knownUpcomingExpenses?.length ?? 0) > 0;

        return {
            householdId,
            nextMonth: `${nextYear}-${nextMonth}`,
            estimatedIncomeCents,
            proposedBudgets,
            totalProposedBudgetCents: totalProposedCents,
            projectedSurplusCents,
            knownUpcomingExpensesAccountedFor: hasKnownExpenses,
            recommendations: generateNextMonthRecommendations(projectedSurplusCents, estimatedIncomeCents),
        };
    } catch (error) {
        return {
            householdId,
            nextMonth: "",
            estimatedIncomeCents: 0 as Money,
            proposedBudgets: [],
            totalProposedBudgetCents: 0 as Money,
            projectedSurplusCents: 0 as Money,
            knownUpcomingExpensesAccountedFor: false,
            recommendations: [],
            error: error instanceof Error ? error.message : "Unknown error planning next month budget",
        };
    }
}

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * TOOL IMPLEMENTATION 4: simulate_budget_change
 *
 * Simulates the impact of reallocating budget across categories.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export async function simulateBudgetChange(
    householdId: EntityId,
    changes: Array<{ category: string; newBudgetCents: Money }>,
    deps: ToolDependencies,
    options?: {
        month?: string;
    }
): Promise<SimulateBudgetChangeOutput> {
    try {
        const now = new Date();
        const targetYear = now.getFullYear();
        const targetMonth = now.getMonth() + 1;

        // Fetch current budget
        const currentBudgets = await deps.budgetRepo.findByPeriod(householdId, targetYear, targetMonth);

        // Fetch transactions for current month
        const currentTransactions = await deps.transactionRepo.findByHouseholdAndPeriod(
            householdId,
            targetYear,
            targetMonth
        );

        // Calculate current budget results
        const currentResults = deps.budgetService.calculateResults({
            householdId,
            period: { year: targetYear, month: targetMonth },
            budgets: currentBudgets,
            transactions: currentTransactions.map((tx) => ({
                id: tx.id,
                category: tx.category,
                amountCents: tx.amountCents,
                transactionDate: tx.transactionDate,
            })),
            asOf: now,
        });

        // Apply simulated changes
        const changesByCategory = new Map(changes.map((c) => [c.category, c.newBudgetCents]));
        const simulatedBudgets = currentBudgets.map((budget) => ({
            ...budget,
            amountCents: changesByCategory.has(budget.category)
                ? changesByCategory.get(budget.category)!
                : budget.amountCents,
        }));

        // Add new budget entries for changed categories not in current budget
        for (const change of changes) {
            if (!currentBudgets.some((b) => b.category === change.category)) {
                simulatedBudgets.push({
                    id: `sim-${change.category}` as EntityId,
                    householdId,
                    periodYear: targetYear,
                    periodMonth: targetMonth,
                    category: change.category,
                    amountCents: change.newBudgetCents,
                    version: 1,
                    createdAt: now,
                    updatedAt: now,
                });
            }
        }

        // Calculate simulated budget results (same transactions, different budgets)
        const simulatedResults = deps.budgetService.calculateResults({
            householdId,
            period: { year: targetYear, month: targetMonth },
            budgets: simulatedBudgets,
            transactions: currentTransactions.map((tx) => ({
                id: tx.id,
                category: tx.category,
                amountCents: tx.amountCents,
                transactionDate: tx.transactionDate,
            })),
            asOf: now,
        });

        // Extract budget changes
        const budgetChanges = [];
        for (const change of changes) {
            const current = currentBudgets.find((b) => b.category === change.category);
            budgetChanges.push({
                category: change.category,
                currentBudgetCents: current?.amountCents ?? (0 as Money),
                projectedBudgetCents: change.newBudgetCents,
                changeCents: (change.newBudgetCents - (current?.amountCents ?? 0)) as Money,
            });
        }

        // Summarize impact
        return {
            householdId,
            month: options?.month ?? `${targetYear}-${targetMonth}`,
            currentBudgetTotalCents: currentResults.totalPlannedCents,
            projectedBudgetTotalCents: simulatedResults.totalPlannedCents,
            budgetChanges,
            impactOnSurplus: {
                currentSurplusCents: currentResults.totalRemainingCents,
                projectedSurplusCents: simulatedResults.totalRemainingCents,
                changeCents: (simulatedResults.totalRemainingCents - currentResults.totalRemainingCents) as Money,
            },
            recommendations: generateSimulationRecommendations(
                currentResults.totalPlannedCents,
                simulatedResults.totalPlannedCents,
                simulatedResults.totalRemainingCents
            ),
        };
    } catch (error) {
        return {
            householdId,
            month: options?.month ?? "",
            currentBudgetTotalCents: 0 as Money,
            projectedBudgetTotalCents: 0 as Money,
            budgetChanges: [],
            recommendations: [],
            error: error instanceof Error ? error.message : "Unknown error simulating budget change",
        };
    }
}

/**
 * ──────────────────────────────────────────────────────────────────────────────
 * Helper Functions
 * ──────────────────────────────────────────────────────────────────────────────
 */

function estimateMonthlyFromFrequency(amountCents: number, frequency: string | RecurringFrequency): number {
    const freq = typeof frequency === "string" ? frequency : frequency;
    switch (freq) {
        case "WEEKLY":
            return Math.round((amountCents * 52) / 12);
        case "BIWEEKLY":
            return Math.round((amountCents * 26) / 12);
        case "MONTHLY":
            return amountCents;
        case "QUARTERLY":
            return Math.round(amountCents / 3);
        case "ANNUAL":
            return Math.round(amountCents / 12);
        case "IRREGULAR":
        case "UNKNOWN":
        default:
            return 0;
    }
}

function generateBudgetRecommendations(
    income: Money,
    expenses: Money,
    surplus: Money
): string[] {
    const recommendations: string[] = [];

    if (income === 0) {
        recommendations.push("Income not yet configured. Add income in household settings or through budget entries.");
    }

    if (surplus < 0) {
        recommendations.push(
            `Budget deficit of ${Math.abs(surplus) / 100}. Consider reducing discretionary categories or increasing income.`
        );
    } else if (surplus < 50000) {
        // Less than $500
        recommendations.push("Limited surplus for emergencies. Consider redirecting discretionary spending.");
    } else if (surplus > 200000) {
        // More than $2000
        recommendations.push("Strong surplus available. Consider allocating toward savings goals.");
    }

    if (expenses === 0) {
        recommendations.push("No spending patterns detected. Budget may need manual review.");
    }

    return recommendations;
}

function generateVarianceRecommendations(trends: VarianceTrend[]): string[] {
    const recommendations: string[] = [];

    const overBudgetCategories = trends.filter((t) => t.avgVarianceCents > 1000).slice(0, 3);
    if (overBudgetCategories.length > 0) {
        recommendations.push(
            `Categories consistently over budget: ${overBudgetCategories.map((c) => c.category).join(", ")}. ` +
            `Consider increasing allocations or tracking spending more closely.`
        );
    }

    const underBudgetCategories = trends.filter((t) => t.avgVarianceCents < -1000).slice(0, 3);
    if (underBudgetCategories.length > 0) {
        recommendations.push(
            `Categories consistently under budget: ${underBudgetCategories.map((c) => c.category).join(", ")}. ` +
            `Budget allocations may be too conservative.`
        );
    }

    return recommendations;
}

function generateNextMonthRecommendations(surplus: Money, income: Money): string[] {
    const recommendations: string[] = [];

    if (surplus < 0) {
        recommendations.push("Projected deficit next month. Review budget and income assumptions.");
    } else if (surplus > 0 && surplus < 50000) {
        recommendations.push("Tight margin next month. Monitor spending closely.");
    }

    if (income === 0) {
        recommendations.push("Income not configured for next month.");
    }

    return recommendations;
}

function generateSimulationRecommendations(
    currentTotal: Money,
    projectedTotal: Money,
    projectedSurplus: Money
): string[] {
    const recommendations: string[] = [];
    const changeCents = projectedTotal - currentTotal;

    if (changeCents > 0) {
        recommendations.push(`Proposed changes increase total budget by ${changeCents / 100}. Verify affordable.`);
    } else if (changeCents < 0) {
        recommendations.push(`Proposed changes decrease total budget by ${Math.abs(changeCents) / 100}.`);
    }

    if (projectedSurplus < 0) {
        recommendations.push("Simulated budget would result in deficit. Adjust allocations.");
    }

    return recommendations;
}

export function createToolDependencies(
    budgetService: BudgetService,
    cashFlowService: CashFlowService,
    repos: ToolDependencies["budgetRepo"] & ToolDependencies["transactionRepo"] & ToolDependencies["settingsRepo"] & ToolDependencies["recurringPatternsRepo"]
): ToolDependencies {
    return {
        budgetService,
        cashFlowService,
        budgetRepo: repos,
        transactionRepo: repos,
        settingsRepo: repos,
        recurringPatternsRepo: repos,
    };
}
