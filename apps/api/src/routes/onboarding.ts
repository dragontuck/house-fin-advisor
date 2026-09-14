/**
 * Onboarding API Routes
 * 
 * Express route handlers for all onboarding endpoints.
 * 
 * **Implementation Note**: Handlers are stubs.
 * Implementation will be completed in Phase 2.
 */

import { Express, Request, Response } from 'express';
import { OnboardingService } from '../../domain/services/onboarding.service';

export interface OnboardingRouteContext {
    app: Express;
    onboardingService: OnboardingService;
}

/**
 * Register all onboarding routes
 */
export function registerOnboardingRoutes(context: OnboardingRouteContext): void {
    const { app, onboardingService } = context;

    // ===== Session Management =====

    /**
     * POST /api/onboarding/start
     * Start new onboarding session
     */
    app.post('/api/onboarding/start', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    /**
     * GET /api/onboarding/progress
     * Get current onboarding progress
     */
    app.get('/api/onboarding/progress', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    // ===== Phase Completion =====

    /**
     * POST /api/onboarding/phase/:phaseNumber/complete
     * Complete a phase with data
     */
    app.post('/api/onboarding/phase/:phaseNumber/complete', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    /**
     * POST /api/onboarding/phase/:phaseNumber/skip
     * Skip to a different phase
     */
    app.post('/api/onboarding/phase/:phaseNumber/skip', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    /**
     * GET /api/onboarding/validate/:phaseNumber
     * Validate phase data without completing
     */
    app.get('/api/onboarding/validate/:phaseNumber', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    // ===== Workflow Control =====

    /**
     * POST /api/onboarding/restart
     * Restart onboarding from Phase 1
     */
    app.post('/api/onboarding/restart', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    /**
     * POST /api/onboarding/pause
     * Pause onboarding
     */
    app.post('/api/onboarding/pause', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    /**
     * POST /api/onboarding/resume
     * Resume paused onboarding
     */
    app.post('/api/onboarding/resume', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    /**
     * POST /api/onboarding/abandon
     * Abandon onboarding
     */
    app.post('/api/onboarding/abandon', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    // ===== Checkpoint (Resume) =====

    /**
     * GET /api/onboarding/progress/checkpoint
     * Get latest checkpoint for resume
     */
    app.get('/api/onboarding/progress/checkpoint', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    /**
     * POST /api/onboarding/progress/checkpoint
     * Save checkpoint
     */
    app.post('/api/onboarding/progress/checkpoint', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    /**
     * POST /api/onboarding/progress/checkpoint/restore
     * Restore from checkpoint
     */
    app.post('/api/onboarding/progress/checkpoint/restore', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    // ===== Phase-Specific: Phase 2 =====

    /**
     * POST /api/onboarding/accounts
     * Create accounts in batch during Phase 2
     */
    app.post('/api/onboarding/accounts', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    /**
     * GET /api/onboarding/accounts
     * Get declared accounts
     */
    app.get('/api/onboarding/accounts', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    /**
     * PATCH /api/onboarding/accounts/:accountId
     * Update account details
     */
    app.patch('/api/onboarding/accounts/:accountId', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    // ===== Phase-Specific: Phase 3 =====

    /**
     * GET /api/onboarding/accounts/:accountId/collection-status
     * Get statement collection status for account
     */
    app.get('/api/onboarding/accounts/:accountId/collection-status', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    /**
     * GET /api/onboarding/accounts/:accountId/guidance
     * Get statement upload guidance for account
     */
    app.get('/api/onboarding/accounts/:accountId/guidance', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    // ===== Phase-Specific: Phase 4 =====

    /**
     * POST /api/onboarding/detect-income
     * Detect income from bank transactions
     */
    app.post('/api/onboarding/detect-income', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    /**
     * POST /api/onboarding/detect-expenses
     * Detect recurring expenses from bank transactions
     */
    app.post('/api/onboarding/detect-expenses', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    /**
     * POST /api/onboarding/financial-context/confirm
     * Confirm financial context (income + expenses)
     */
    app.post('/api/onboarding/financial-context/confirm', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    // ===== Phase-Specific: Phase 6 =====

    /**
     * POST /api/onboarding/launch
     * Launch onboarding (complete all phases)
     */
    app.post('/api/onboarding/launch', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    /**
     * GET /api/onboarding/initial-insights
     * Get initial insights after launch
     */
    app.get('/api/onboarding/initial-insights', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    // ===== Analytics =====

    /**
     * GET /api/onboarding/stats
     * Get onboarding completion statistics
     */
    app.get('/api/onboarding/stats', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });

    /**
     * GET /api/onboarding/stats/household
     * Get metrics for specific household
     */
    app.get('/api/onboarding/stats/household', async (req: Request, res: Response) => {
        // TODO: Implement in Phase 2
        res.status(501).json({ error: 'Not implemented' });
    });
}
