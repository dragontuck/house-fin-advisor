/**
 * Admin Settings Routes
 * Endpoints for managing AI provider and model settings
 * Restricted to users with admin role via Keycloak JWT
 *
 * Routes:
 * - GET /admin/settings/ai-provider - Get current AI provider settings
 * - PUT /admin/settings/ai-provider - Update AI provider settings (admin only)
 */

import { Request, Response, NextFunction } from "express";
import { RouteContext, RouteRegistrar } from "./types";
import {
    UpdateAIProviderSettingsRequest,
    AIProviderSettingsResponse,
    AIProviderSettings,
} from "@house-fin/contracts";
import { AdminSettingsService } from "@house-fin/domain";
import { PostgresAIProviderSettingsRepository } from "@house-fin/db";

interface AdminSettingsRouteContext extends RouteContext {
    adminSettingsService: AdminSettingsService;
}

class AdminSettingsError extends Error {
    constructor(
        public statusCode: number,
        public errorCode: string,
        message?: string
    ) {
        super(message || errorCode);
        this.name = "AdminSettingsError";
    }
}

/**
 * GET /admin/settings/ai-provider
 * Get current AI provider settings for the household
 * No role restriction - users can see what model they're using
 */
async function getAIProviderSettings(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { adminSettingsService } = req.app.locals as AdminSettingsRouteContext;
        const householdId = req.householdId;

        if (!householdId) {
            throw new AdminSettingsError(400, "MISSING_HOUSEHOLD_ID", "Household ID is required");
        }

        const settingsWithOptions = await adminSettingsService.getSettingsWithOptions(householdId);

        const response: AIProviderSettingsResponse = {
            settings: settingsWithOptions.settings || {
                id: "" as any,
                householdId,
                provider: "anthropic",
                model: "claude-3-5-sonnet-20241022",
                providerConfig: {},
                configuredByMemberId: "" as any,
                configuredAt: new Date(),
                updatedAt: new Date(),
            },
            availableProviders: settingsWithOptions.availableProviders,
            availableModels: settingsWithOptions.availableModels,
        };

        res.json(response);
    } catch (error) {
        next(error);
    }
}

/**
 * PUT /admin/settings/ai-provider
 * Update AI provider settings (admin role required)
 * Only users with "admin" or "ADMIN" role in Keycloak can modify settings
 */
async function updateAIProviderSettings(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { adminSettingsService } = req.app.locals as AdminSettingsRouteContext;
        const householdId = req.householdId;
        const keycloakToken = req.keycloakToken;
        const memberId = req.memberId;

        if (!householdId) {
            throw new AdminSettingsError(400, "MISSING_HOUSEHOLD_ID", "Household ID is required");
        }

        if (!keycloakToken) {
            throw new AdminSettingsError(
                401,
                "MISSING_TOKEN",
                "Authentication required to update settings"
            );
        }

        if (!memberId) {
            throw new AdminSettingsError(
                401,
                "MISSING_MEMBER_ID",
                "Member ID required to track changes"
            );
        }

        const updateRequest: UpdateAIProviderSettingsRequest = req.body;

        // Validate request body
        if (!updateRequest.provider || !updateRequest.model) {
            throw new AdminSettingsError(
                400,
                "INVALID_REQUEST",
                "provider and model are required"
            );
        }

        // Update settings (service will validate admin role)
        const updatedSettings = await adminSettingsService.updateSettings(
            householdId,
            memberId,
            keycloakToken,
            updateRequest
        );

        res.json({
            success: true,
            settings: updatedSettings,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Register admin settings routes
 */
export const registerAdminSettingsRoutes: RouteRegistrar = (context: RouteContext): void => {
    const app = context.app;
    const pool = context.pool;

    // Initialize service
    const repository = new PostgresAIProviderSettingsRepository(pool);
    const adminSettingsService = new AdminSettingsService(repository);

    // Store service in app locals for route handlers
    app.locals.adminSettingsService = adminSettingsService;

    // Routes - both protected by middleware that ensures keycloakToken is present
    app.get(
        "/admin/settings/ai-provider",
        context.middleware.keycloakOptionalAuth,
        getAIProviderSettings
    );

    app.put(
        "/admin/settings/ai-provider",
        context.middleware.keycloakOptionalAuth,
        updateAIProviderSettings
    );
};
