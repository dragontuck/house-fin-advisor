/**
 * Budget Endpoints
 * Handles budget CRUD, calculations, and variance tracking
 */

import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { EntityId, CreateBudgetRequest, UpdateBudgetRequest, Budget } from "@house-fin/contracts";
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
    const { app, budgetRepo, accountRepo } = context;
    const budgetService = createBudgetService(budgetRepo);

    /**
     * POST /budgets
     * Create a new budget
     */
    app.post("/budgets", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;
            const { categoryName, monthlyLimitCents, description, isEssential } = req.body as CreateBudgetRequest;

            if (!categoryName || typeof monthlyLimitCents !== "number") {
                throw new ApiError(400, "Missing required fields: categoryName, monthlyLimitCents", "BUDGET_INVALID_REQUEST");
            }

            const budget = await budgetRepo.create({
                householdId,
                categoryName,
                monthlyLimitCents,
                description: description || undefined,
                isEssential: isEssential ?? false,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            res.status(201).json({
                id: budget.id,
                categoryName: budget.categoryName,
                monthlyLimitCents: budget.monthlyLimitCents,
                monthlyLimitDollars: budget.monthlyLimitCents / 100,
                description: budget.description,
                isEssential: budget.isEssential,
                createdAt: budget.createdAt,
            });
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

            const budgets = await budgetRepo.findByHouseholdId(householdId);

            const results = await Promise.all(
                budgets.map(async (b) => {
                    const result = budgetService.calculateBudgetResults({
                        budget: b,
                        asOf: new Date(),
                    });

                    return {
                        id: b.id,
                        categoryName: b.categoryName,
                        monthlyLimitDollars: b.monthlyLimitCents / 100,
                        actualSpendingDollars: result.actualSpendingCents / 100,
                        variance: {
                            amountDollars: result.varianceCents / 100,
                            isOver: result.varianceCents > 0,
                            percentageOver: ((result.varianceCents / b.monthlyLimitCents) * 100).toFixed(1),
                        },
                        status: result.status,
                        isEssential: b.isEssential,
                    };
                })
            );

            res.json(results);
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

            const result = budgetService.calculateBudgetResults({
                budget,
                asOf: new Date(),
            });

            res.json({
                id: budget.id,
                categoryName: budget.categoryName,
                monthlyLimitDollars: budget.monthlyLimitCents / 100,
                actualSpendingDollars: result.actualSpendingCents / 100,
                variance: {
                    amountDollars: result.varianceCents / 100,
                    isOver: result.varianceCents > 0,
                },
                status: result.status,
                description: budget.description,
                isEssential: budget.isEssential,
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
            const { monthlyLimitCents, description, isEssential } = req.body as UpdateBudgetRequest;

            const budget = await budgetRepo.findById(budgetId);
            if (!budget || budget.householdId !== householdId) {
                throw new ApiError(404, "Budget not found", "BUDGET_NOT_FOUND");
            }

            const updated = await budgetRepo.update(budgetId, {
                monthlyLimitCents: monthlyLimitCents ?? budget.monthlyLimitCents,
                description: description ?? budget.description,
                isEssential: isEssential ?? budget.isEssential,
                updatedAt: new Date(),
            });

            res.json({
                id: updated.id,
                categoryName: updated.categoryName,
                monthlyLimitDollars: updated.monthlyLimitCents / 100,
                description: updated.description,
                isEssential: updated.isEssential,
            });
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

            await budgetRepo.delete(budgetId);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    });
};
