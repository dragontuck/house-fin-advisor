/**
 * Budget Endpoints
 * Handles budget CRUD, calculations, and variance tracking
 */

import { Request, Response, NextFunction } from "express";
import { EntityId, Money, CreateBudgetRequest, UpdateBudgetRequest } from "@house-fin/contracts";
import { createBudgetService } from "@house-fin/domain";
import { RouteContext, RouteRegistrar } from "./types";

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
 * Register budget endpoints
 */
export const registerBudgetRoutes: RouteRegistrar = (context: RouteContext) => {
    const { app, budgetRepo } = context;
    const budgetService = createBudgetService();

    /**
     * POST /budgets
     * Create a new budget
     */
    app.post("/budgets", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;
            const body = req.body as CreateBudgetRequest;

            try {
                budgetService.validateBudget(body.periodYear, body.periodMonth, body.category, body.amountCents);
            } catch (validationError) {
                throw new ApiError(
                    400,
                    validationError instanceof Error ? validationError.message : "Invalid budget data.",
                    "BUDGET_INVALID_REQUEST"
                );
            }

            const existing = await budgetRepo.findByCategory(
                householdId,
                body.periodYear,
                body.periodMonth,
                body.category
            );
            if (existing) {
                throw new ApiError(409, "A budget already exists for this category and period.", "BUDGET_ALREADY_EXISTS");
            }

            const budget = await budgetRepo.create({
                householdId,
                periodYear: body.periodYear,
                periodMonth: body.periodMonth,
                category: body.category.trim(),
                amountCents: body.amountCents as Money,
                goalId: body.goalId as EntityId | undefined,
                notes: body.notes,
            });

            res.status(201).json(budget);
        } catch (error) {
            next(error);
        }
    });

    /**
     * GET /budgets
     * List all budgets for household
     */
    app.get("/budgets", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;
            const year = Number(req.query.year);
            const month = Number(req.query.month);

            if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
                throw new ApiError(400, "Provide valid year and month query parameters.", "BUDGET_INVALID_PERIOD");
            }

            const budgets = await budgetRepo.findByHouseholdAndPeriod(householdId, year, month);
            res.json(budgets);
        } catch (error) {
            next(error);
        }
    });

    /**
     * GET /budgets/:id
     * Get budget details and variance
     */
    app.get("/budgets/:id", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;
            const budgetId = req.params.id as EntityId;

            const budget = await budgetRepo.findById(budgetId);
            if (!budget || budget.householdId !== householdId) {
                throw new ApiError(404, "Budget not found", "BUDGET_NOT_FOUND");
            }

            const transactions = await budgetRepo.getTransactionsForPeriod(
                householdId,
                budget.periodYear,
                budget.periodMonth
            );
            const resultSet = budgetService.calculateResults({
                householdId,
                period: { year: budget.periodYear, month: budget.periodMonth },
                budgets: [budget],
                transactions,
                asOf: new Date(),
            });

            res.json({
                budget,
                result: resultSet.results.find((item) => item.category === budget.category),
            });
        } catch (error) {
            next(error);
        }
    });

    /**
     * PUT /budgets/:id
     * Update budget
     */
    app.put("/budgets/:id", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;
            const budgetId = req.params.id as EntityId;
            const body = req.body as UpdateBudgetRequest & { version?: number };

            const budget = await budgetRepo.findById(budgetId);
            if (!budget || budget.householdId !== householdId) {
                throw new ApiError(404, "Budget not found", "BUDGET_NOT_FOUND");
            }

            if (typeof body.version !== "number") {
                throw new ApiError(400, "Include the current version number.", "BUDGET_VERSION_REQUIRED");
            }

            if (body.amountCents !== undefined) {
                try {
                    budgetService.validateBudget(
                        budget.periodYear,
                        budget.periodMonth,
                        budget.category,
                        body.amountCents
                    );
                } catch (validationError) {
                    throw new ApiError(
                        400,
                        validationError instanceof Error ? validationError.message : "Invalid budget amount.",
                        "BUDGET_INVALID_REQUEST"
                    );
                }
            }

            const updated = await budgetRepo.update(budgetId, {
                amountCents: body.amountCents,
                notes: body.notes,
            }, body.version);

            res.json(updated);
        } catch (error) {
            next(error);
        }
    });

    /**
     * DELETE /budgets/:id
     * Delete budget
     */
    app.delete("/budgets/:id", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;
            const budgetId = req.params.id as EntityId;

            const budget = await budgetRepo.findById(budgetId);
            if (!budget || budget.householdId !== householdId) {
                throw new ApiError(404, "Budget not found", "BUDGET_NOT_FOUND");
            }

            await budgetRepo.delete(budgetId, householdId);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    });
};
