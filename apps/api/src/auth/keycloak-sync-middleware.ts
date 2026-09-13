/**
 * Keycloak user sync middleware
 * Automatically syncs authenticated Keycloak users with household members
 */

import { Request, Response, NextFunction } from "express";
import { KeycloakUserSyncService, UserSyncResult } from "./keycloak-sync";

/**
 * Extend Express Request to include sync result
 */
declare global {
    namespace Express {
        interface Request {
            keycloakUserSync?: UserSyncResult;
        }
    }
}

/**
 * Create Keycloak user sync middleware
 * Must be used after keycloakOptionalAuth middleware
 * 
 * @param syncService - Keycloak user sync service instance
 */
export function createKeycloakSyncMiddleware(syncService: KeycloakUserSyncService) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // Only sync if user is authenticated with Keycloak
            if (!req.keycloakToken) {
                next();
                return;
            }

            // Only sync if we have household context
            if (!req.context?.householdId) {
                next();
                return;
            }

            // Perform the sync
            const syncResult = await syncService.syncUser(
                req.keycloakToken,
                req.context.householdId
            );

            // Store sync result in request for potential later use
            req.keycloakUserSync = syncResult;

            // Continue regardless of sync success/failure
            next();
        } catch (error) {
            // Log unexpected errors but don't fail the request
            console.error("[KEYCLOAK_SYNC_MIDDLEWARE_ERROR]", {
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: new Date().toISOString(),
            });

            // Continue to next middleware even on error
            next();
        }
    };
}
