/**
 * Household context middleware
 * Extracts and validates household context from requests
 * Integrated with Keycloak authentication
 */

import { Request, Response, NextFunction } from "express";
import { EntityId } from "@house-fin/contracts";

/**
 * Middleware to extract and attach household context
 * Extracts household ID from Keycloak token claims or header
 * Falls back to header value if token claim is not available
 */
export function householdContextMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    // Get household ID from different sources in order of preference:
    // 1. From Keycloak token (if authenticated)
    // 2. From x-household-id header
    // 3. Already set by correlation middleware (fallback)

    if (req.keycloakToken) {
        // Try to get household ID from token custom claims
        const householdIdFromToken =
            (req.keycloakToken as any).household_id ||
            (req.keycloakToken as any).householdId;

        if (householdIdFromToken) {
            req.context.householdId = householdIdFromToken as EntityId;
        }

        // Mark as authenticated
        req.context.isAuthorized = true;
    } else {
        // No Keycloak token - check if header-based household ID is provided
        // This allows for development/testing scenarios
        const headerHouseholdId = req.headers["x-household-id"] as string;
        if (headerHouseholdId) {
            req.context.householdId = headerHouseholdId as EntityId;
            req.context.isAuthorized = true;
        }
    }

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
