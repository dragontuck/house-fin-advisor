/**
 * Household context middleware
 * Extracts and validates household context from requests
 * For Slice 1: Uses hardcoded household ID
 * For Slice 2: Will be replaced to extract from JWT/auth context
 */

import { Request, Response, NextFunction } from "express";
import { EntityId } from "@house-fin/contracts";

/**
 * Middleware to extract and attach household context
 * Currently uses hardcoded household ID for Slice 1
 * Will be updated in Slice 2 to extract from JWT claims
 */
export function householdContextMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    // Slice 1: householdId already set by correlation middleware
    // In Slice 2, this will extract from JWT claims and potentially override

    // For now, ensure isAuthorized is set
    req.context.isAuthorized = true; // Slice 1: always authorized

    next();
}

/**
 * Middleware to verify that household context is present
 * Should be placed after householdContextMiddleware in the middleware chain
 */
export function verifyHouseholdContext(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    if (!req.context.householdId) {
        res.status(401).json({
            userMessage: "Unable to determine household context",
            errorCode: "MISSING_HOUSEHOLD_CONTEXT",
            correlationId: req.context.correlationId || "unknown",
            retryable: false,
        });
        return;
    }

    // Slice 2: Add authorization check here
    // - Verify user belongs to household
    // - Check membership role/permissions
    // - Return 403 if not authorized
    if (!req.context.isAuthorized) {
        res.status(403).json({
            userMessage: "You do not have access to this household",
            errorCode: "FORBIDDEN",
            correlationId: req.context.correlationId,
            retryable: false,
        });
        return;
    }

    next();
}
