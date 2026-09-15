/**
 * Onboarding API Routes
 *
 * Express route handlers for all onboarding endpoints.
 * Routes the onboarding workflow through the service layer.
 */

import { Express } from 'express';
import { OnboardingService } from '@house-fin/domain';
import { registerOnboardingRoutes as registerRoutes } from './pg-onboarding.routes';

export interface OnboardingRouteContext {
    app: Express;
    onboardingService: OnboardingService;
}

/**
 * Register all onboarding routes with actual implementations
 */
export function registerOnboardingRoutes(context: OnboardingRouteContext): void {
    return registerRoutes(context);
}
