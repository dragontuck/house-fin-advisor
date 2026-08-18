/**
 * AI Tool Execution Routes
 * Provides API endpoints for invoking AI tools through the deterministic budget engine.
 * 
 * Tools available:
 * - POST /tools/create_initial_budget
 * - POST /tools/analyze_budget_variance
 * - POST /tools/plan_next_month_budget
 * - POST /tools/simulate_budget_change
 * 
 * All tools require household context and return deterministic, auditable results.
 */

import { Request, Response, NextFunction } from "express";
import { RouteContext, RouteRegistrar } from "./types";
import { EntityId, Money } from "@house-fin/contracts";
import {
    createInitialBudget,
    analyzeBudgetVariance,
    planNextMonthBudget,
    simulateBudgetChange,
    createToolDependencies,
} from "@house-fin/ai";
import { createBudgetService, createCashFlowService } from "@house-fin/domain";

class ApiError extends Error {
    constructor(
        public statusCode: number,
        public userMessage: string,
        public errorCode: string,
        public retryable: boolean = false,
        message?: string
    ) {
        super(message || userMessage);
        this.name = "ApiError";
    }
}

/**
 * Register tool execution routes
 */
export const registerToolExecutionRoutes: RouteRegistrar = (context: RouteContext) => {
    const {
        app,
        budgetRepo,
        cashFlowRepo,
        settingsRepo,
    } = context;

    // Create tool dependencies
    const budgetService = createBudgetService();
    const cashFlowService = createCashFlowService();

    // Create repository adapter for tools - delegates to actual repositories
    const toolRepos = {
        findByPeriod: async (householdId: EntityId, year: number, month: number) => {
            return await budgetRepo.findByHouseholdAndPeriod(householdId, year, month);
        },
        findByHouseholdIdRange: async (
            householdId: EntityId,
            startYear: number,
            startMonth: number,
            endYear: number,
            endMonth: number
        ) => {
            // Collect budgets across multiple months by calling period method multiple times
            const budgets = [];
            let year = startYear;
            let month = startMonth;
            while (year < endYear || (year === endYear && month <= endMonth)) {
                const periodBudgets = await budgetRepo.findByHouseholdAndPeriod(householdId, year, month);
                budgets.push(...periodBudgets);
                month++;
                if (month > 12) {
                    month = 1;
                    year++;
                }
            }
            return budgets;
        },
        findByHouseholdAndPeriod: async (householdId: EntityId, year: number, month: number) => {
            return await budgetRepo.getTransactionsForPeriod(householdId, year, month);
        },
        findByHouseholdDateRange: async (householdId: EntityId, startDate: Date, endDate: Date) => {
            return await cashFlowRepo.getTransactionsForRange(householdId, startDate, endDate);
        },
        findByHouseholdId: async (householdId: EntityId) => {
            return await settingsRepo.findByHouseholdId(householdId);
        },
    };

    const toolDeps = createToolDependencies(
        budgetService,
        cashFlowService,
        toolRepos as any
    );

    /**
     * POST /tools/create_initial_budget
     * Create an initial budget based on income and spending history
     */
    app.post("/tools/create_initial_budget", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId as EntityId;
            const { month, incomeMethodCents, essentialExpensesCents, discretionaryExpensesCents } = req.body;

            if (!month) {
                throw new ApiError(400, "Month is required (format: YYYY-M)", "MISSING_MONTH");
            }

            const result = await createInitialBudget(householdId, month, toolDeps, {
                incomeMethodCents,
                essentialExpensesCents,
                discretionaryExpensesCents,
            });

            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    /**
     * POST /tools/analyze_budget_variance
     * Analyze budget variance patterns across months
     */
    app.post("/tools/analyze_budget_variance", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId as EntityId;
            const { categories, months } = req.body;

            const result = await analyzeBudgetVariance(householdId, toolDeps, {
                categories,
                months,
            });

            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    /**
     * POST /tools/plan_next_month_budget
     * Plan next month's budget based on trends and recurring patterns
     */
    app.post("/tools/plan_next_month_budget", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId as EntityId;
            const { incomeOverrideCents, knownUpcomingExpenses } = req.body;

            const result = await planNextMonthBudget(householdId, toolDeps, {
                incomeOverrideCents,
                knownUpcomingExpenses,
            });

            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    /**
     * POST /tools/simulate_budget_change
     * Simulate the impact of budget reallocations
     */
    app.post("/tools/simulate_budget_change", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId as EntityId;
            const { changes, month } = req.body;

            if (!changes || !Array.isArray(changes)) {
                throw new ApiError(400, "Budget changes array is required", "MISSING_CHANGES");
            }

            const result = await simulateBudgetChange(householdId, changes, toolDeps, {
                month,
            });

            res.json(result);
        } catch (error) {
            next(error);
        }
    });
};
