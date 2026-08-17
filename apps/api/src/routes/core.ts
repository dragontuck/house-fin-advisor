/**
 * Core Financial Endpoints
 * Handles household info, accounts, financial pulse
 */

import { Request, Response, NextFunction } from "express";
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
 * Register core endpoints
 */
export const registerCoreRoutes: RouteRegistrar = (context: RouteContext) => {
    const { app, householdService } = context;

    /**
     * GET /household
     * Get household information
     */
    app.get("/household", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;
            const household = await householdService.getHousehold(householdId);

            res.json({
                id: household.id,
                name: household.name,
                createdAt: household.createdAt,
                updatedAt: household.updatedAt,
            });
        } catch (error) {
            next(error);
        }
    });

    /**
     * GET /household/members
     * Get household members
     */
    app.get("/household/members", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;
            const members = await householdService.getHouseholdMembers(householdId);

            res.json({
                members: members.map((m) => ({
                    id: m.id,
                    displayName: m.displayName,
                    role: m.role,
                    joinedAt: m.createdAt,
                })),
            });
        } catch (error) {
            next(error);
        }
    });

    // Additional account, pulse, and snapshot endpoints
    // would be registered here...
};
