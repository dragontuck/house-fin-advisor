/**
 * Onboarding API Routes - PostgreSQL Implementation
 *
 * Express route handlers for all onboarding endpoints.
 * Handles HTTP contracts for the onboarding workflow.
 */

import { Express, Request, Response } from 'express';
import { OnboardingService } from '@house-fin/domain';
import { EntityId } from '@house-fin/domain/types/common.types';
import {
    OnboardingPhase,
    SetupPhaseData,
    AccountsPhaseData,
    StatementsPhaseData,
    FinancialContextPhaseData,
    ProfilePhaseData,
    LaunchPhaseData,
} from '@house-fin/domain/types/onboarding.types';

export interface OnboardingRouteContext {
    app: Express;
    onboardingService: OnboardingService;
}

/**
 * Register all onboarding routes
 */
export function registerOnboardingRoutes(context: OnboardingRouteContext): void {
    const { app, onboardingService } = context;

    // Helper to extract householdId and userId from request
    const getHouseholdAndUserId = (req: any): { householdId: EntityId; userId: EntityId } => {
        const householdId = (req.query.householdId || req.body?.householdId) as EntityId;
        const userId = (req.context?.userId || req.body?.userId) as EntityId;
        return { householdId, userId };
    };

    // ===== Session Management =====

    /**
     * POST /api/onboarding/start
     * Start new onboarding session
     */
    app.post('/api/onboarding/start', async (req: Request, res: Response) => {
        try {
            const { householdId, userId } = getHouseholdAndUserId(req);
            const { householdName } = req.body;

            if (!householdId || !userId || !householdName) {
                return res.status(400).json({
                    error: 'Missing required fields: householdId, userId, householdName',
                });
            }

            const progress = await onboardingService.startOnboarding(householdId, userId, householdName);
            res.status(201).json(progress);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * GET /api/onboarding/progress
     * Get current onboarding progress
     */
    app.get('/api/onboarding/progress', async (req: Request, res: Response) => {
        try {
            const householdId = req.query.householdId as EntityId;
            if (!householdId) {
                return res.status(400).json({ error: 'householdId query parameter required' });
            }

            const progress = await onboardingService.getCurrentProgress(householdId);
            if (!progress) {
                return res.status(404).json({ error: 'Onboarding not found' });
            }

            res.status(200).json(progress);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // ===== Phase Completion =====

    /**
     * POST /api/onboarding/phase/:phaseNumber/complete
     * Complete a phase with data
     */
    app.post('/api/onboarding/phase/:phaseNumber/complete', async (req: Request, res: Response) => {
        try {
            const { householdId, userId } = getHouseholdAndUserId(req);
            const phaseNumber = parseInt(req.params.phaseNumber, 10) as OnboardingPhase;
            const phaseData = req.body.data;

            if (!householdId || !userId) {
                return res.status(400).json({ error: 'Missing householdId or userId' });
            }

            const methods: Record<OnboardingPhase, any> = {
                1: () => onboardingService.completePhase1(householdId, phaseData as SetupPhaseData, userId),
                2: () => onboardingService.completePhase2(householdId, phaseData as AccountsPhaseData, userId),
                3: () => onboardingService.completePhase3(householdId, phaseData as StatementsPhaseData, userId),
                4: () => onboardingService.completePhase4(householdId, phaseData as FinancialContextPhaseData, userId),
                5: () => onboardingService.completePhase5(householdId, phaseData as ProfilePhaseData, userId),
                6: () => onboardingService.completePhase6(householdId, phaseData as LaunchPhaseData, userId),
            };

            const handler = methods[phaseNumber];
            if (!handler) {
                return res.status(400).json({ error: 'Invalid phase number' });
            }

            const progress = await handler();
            res.status(200).json(progress);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    /**
     * POST /api/onboarding/phase/:phaseNumber/skip
     * Skip to a different phase
     */
    app.post('/api/onboarding/phase/:phaseNumber/skip', async (req: Request, res: Response) => {
        try {
            const { householdId, userId } = getHouseholdAndUserId(req);
            const targetPhase = parseInt(req.params.phaseNumber, 10) as OnboardingPhase;

            if (!householdId || !userId) {
                return res.status(400).json({ error: 'Missing householdId or userId' });
            }

            const progress = await onboardingService.skipToPhase(householdId, targetPhase, userId);
            res.status(200).json(progress);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    /**
     * GET /api/onboarding/validate/:phaseNumber
     * Validate phase data without completing
     */
    app.get('/api/onboarding/validate/:phaseNumber', async (req: Request, res: Response) => {
        try {
            const phaseNumber = parseInt(req.params.phaseNumber, 10) as OnboardingPhase;
            const phaseData = req.body.data;

            const methods: Record<OnboardingPhase, any> = {
                1: () => onboardingService.validatePhase1(phaseData as SetupPhaseData),
                2: () => onboardingService.validatePhase2(phaseData as AccountsPhaseData),
                3: () => onboardingService.validatePhase3(phaseData as StatementsPhaseData),
                4: () => onboardingService.validatePhase4(phaseData as FinancialContextPhaseData),
                5: () => onboardingService.validatePhase5(phaseData as ProfilePhaseData),
                6: () => onboardingService.validatePhase6(phaseData as LaunchPhaseData),
            };

            const handler = methods[phaseNumber];
            if (!handler) {
                return res.status(400).json({ error: 'Invalid phase number' });
            }

            const result = await handler();
            res.status(200).json(result);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    // ===== Workflow Control =====

    /**
     * POST /api/onboarding/restart
     * Restart onboarding from Phase 1
     */
    app.post('/api/onboarding/restart', async (req: Request, res: Response) => {
        try {
            const { householdId, userId } = getHouseholdAndUserId(req);

            if (!householdId || !userId) {
                return res.status(400).json({ error: 'Missing householdId or userId' });
            }

            const progress = await onboardingService.restart(householdId, userId);
            res.status(200).json(progress);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    /**
     * POST /api/onboarding/pause
     * Pause onboarding
     */
    app.post('/api/onboarding/pause', async (req: Request, res: Response) => {
        try {
            const { householdId, userId } = getHouseholdAndUserId(req);

            if (!householdId || !userId) {
                return res.status(400).json({ error: 'Missing householdId or userId' });
            }

            const progress = await onboardingService.pause(householdId, userId);
            res.status(200).json(progress);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    /**
     * POST /api/onboarding/resume
     * Resume paused onboarding
     */
    app.post('/api/onboarding/resume', async (req: Request, res: Response) => {
        try {
            const { householdId, userId } = getHouseholdAndUserId(req);

            if (!householdId || !userId) {
                return res.status(400).json({ error: 'Missing householdId or userId' });
            }

            const progress = await onboardingService.resume(householdId, userId);
            res.status(200).json(progress);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    /**
     * POST /api/onboarding/abandon
     * Abandon onboarding
     */
    app.post('/api/onboarding/abandon', async (req: Request, res: Response) => {
        try {
            const { householdId, userId } = getHouseholdAndUserId(req);

            if (!householdId || !userId) {
                return res.status(400).json({ error: 'Missing householdId or userId' });
            }

            const progress = await onboardingService.abandon(householdId, userId);
            res.status(200).json(progress);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    // ===== Checkpoint (Resume) =====

    /**
     * GET /api/onboarding/progress/checkpoint
     * Get latest checkpoint for resume
     */
    app.get('/api/onboarding/progress/checkpoint', async (req: Request, res: Response) => {
        try {
            const householdId = req.query.householdId as EntityId;
            const sessionId = req.query.sessionId as string;

            if (!householdId || !sessionId) {
                return res
                    .status(400)
                    .json({ error: 'Missing householdId or sessionId query parameters' });
            }

            const progress = await onboardingService.getCurrentProgress(householdId);
            res.status(200).json(progress);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/onboarding/progress/checkpoint
     * Save checkpoint
     */
    app.post('/api/onboarding/progress/checkpoint', async (req: Request, res: Response) => {
        try {
            const householdId = (req.body?.householdId || req.query.householdId) as EntityId;
            const sessionId = req.body?.sessionId as string;
            const phaseNumber = req.body?.phase as OnboardingPhase;

            if (!householdId || !sessionId || !phaseNumber) {
                return res.status(400).json({
                    error: 'Missing required fields: householdId, sessionId, phase',
                });
            }

            const checkpointId = await onboardingService.saveCheckpoint(householdId, sessionId, phaseNumber);
            res.status(201).json({ checkpointId });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/onboarding/progress/checkpoint/restore
     * Restore from checkpoint
     */
    app.post('/api/onboarding/progress/checkpoint/restore', async (req: Request, res: Response) => {
        try {
            const householdId = (req.body?.householdId || req.query.householdId) as EntityId;
            const sessionId = req.body?.sessionId as string;

            if (!householdId || !sessionId) {
                return res.status(400).json({ error: 'Missing householdId or sessionId' });
            }

            const progress = await onboardingService.restoreCheckpoint(householdId, sessionId);
            res.status(200).json(progress);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    // ===== Phase-Specific: Phase 2 =====

    /**
     * POST /api/onboarding/accounts
     * Create accounts in batch during Phase 2
     */
    app.post('/api/onboarding/accounts', async (req: Request, res: Response) => {
        try {
            const { householdId, userId } = getHouseholdAndUserId(req);
            const accounts = req.body?.accounts;

            if (!householdId || !accounts) {
                return res.status(400).json({ error: 'Missing householdId or accounts' });
            }

            const accountsPhaseData: AccountsPhaseData = {
                declaredAccounts: accounts,
                institution: req.body?.institution,
                accounts,
            };

            const progress = await onboardingService.completePhase2(householdId, accountsPhaseData, userId);
            res.status(201).json(progress);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    /**
     * GET /api/onboarding/accounts
     * Get declared accounts
     */
    app.get('/api/onboarding/accounts', async (req: Request, res: Response) => {
        try {
            const householdId = req.query.householdId as EntityId;

            if (!householdId) {
                return res.status(400).json({ error: 'householdId query parameter required' });
            }

            const progress = await onboardingService.getCurrentProgress(householdId);
            if (!progress) {
                return res.status(404).json({ error: 'Onboarding not found' });
            }

            const accounts = progress.phases[2]?.data?.accounts || [];
            res.status(200).json({ accounts });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * PATCH /api/onboarding/accounts/:accountId
     * Update account details
     */
    app.patch('/api/onboarding/accounts/:accountId', async (req: Request, res: Response) => {
        try {
            const householdId = (req.body?.householdId || req.query.householdId) as EntityId;

            if (!householdId) {
                return res.status(400).json({ error: 'Missing householdId' });
            }

            const progress = await onboardingService.getCurrentProgress(householdId);
            if (!progress) {
                return res.status(404).json({ error: 'Onboarding not found' });
            }

            res.status(200).json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // ===== Phase-Specific: Phase 3 =====

    /**
     * GET /api/onboarding/accounts/:accountId/collection-status
     * Get statement collection status for account
     */
    app.get('/api/onboarding/accounts/:accountId/collection-status', async (req: Request, res: Response) => {
        try {
            const householdId = req.query.householdId as EntityId;

            if (!householdId) {
                return res.status(400).json({ error: 'householdId query parameter required' });
            }

            const status = await onboardingService.getStatementCollectionStatus(householdId);
            res.status(200).json(status);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * GET /api/onboarding/accounts/:accountId/guidance
     * Get statement upload guidance for account
     */
    app.get('/api/onboarding/accounts/:accountId/guidance', async (req: Request, res: Response) => {
        try {
            res.status(200).json({
                message: 'Please upload statement PDF or CSV file',
                supportedFormats: ['PDF', 'CSV'],
                maxFileSize: '10MB',
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // ===== Phase-Specific: Phase 4 =====

    /**
     * POST /api/onboarding/detect-income
     * Detect income from bank transactions
     */
    app.post('/api/onboarding/detect-income', async (req: Request, res: Response) => {
        try {
            const householdId = (req.body?.householdId || req.query.householdId) as EntityId;

            if (!householdId) {
                return res.status(400).json({ error: 'Missing householdId' });
            }

            const detection = await onboardingService.detectIncome(householdId);
            res.status(200).json(detection);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/onboarding/detect-expenses
     * Detect recurring expenses from bank transactions
     */
    app.post('/api/onboarding/detect-expenses', async (req: Request, res: Response) => {
        try {
            const householdId = (req.body?.householdId || req.query.householdId) as EntityId;
            const accountIds = req.body?.accountIds;

            if (!householdId) {
                return res.status(400).json({ error: 'Missing householdId' });
            }

            const detections = await onboardingService.detectExpenses(householdId, accountIds);
            res.status(200).json({ expenses: detections });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/onboarding/financial-context/confirm
     * Confirm financial context (income + expenses)
     */
    app.post('/api/onboarding/financial-context/confirm', async (req: Request, res: Response) => {
        try {
            const { householdId, userId } = getHouseholdAndUserId(req);
            const { income, expenses } = req.body;

            if (!householdId || !userId || !income || !expenses) {
                return res
                    .status(400)
                    .json({ error: 'Missing required fields: householdId, userId, income, expenses' });
            }

            const financialContextData: FinancialContextPhaseData = {
                detectedIncome: income,
                detectedExpenses: expenses,
                userConfirmed: true,
                income,
                expenses,
            };

            const progress = await onboardingService.completePhase4(householdId, financialContextData, userId);
            res.status(200).json(progress);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    // ===== Phase-Specific: Phase 6 =====

    /**
     * POST /api/onboarding/launch
     * Launch onboarding (complete all phases)
     */
    app.post('/api/onboarding/launch', async (req: Request, res: Response) => {
        try {
            const { householdId, userId } = getHouseholdAndUserId(req);

            if (!householdId || !userId) {
                return res.status(400).json({ error: 'Missing householdId or userId' });
            }

            const progress = await onboardingService.launch(householdId, userId);
            res.status(200).json(progress);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    });

    /**
     * GET /api/onboarding/initial-insights
     * Get initial insights after launch
     */
    app.get('/api/onboarding/initial-insights', async (req: Request, res: Response) => {
        try {
            const householdId = req.query.householdId as EntityId;

            if (!householdId) {
                return res.status(400).json({ error: 'householdId query parameter required' });
            }

            res.status(200).json({
                insights: [
                    { type: 'income', message: 'Income detected' },
                    { type: 'expenses', message: 'Expense patterns detected' },
                ],
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // ===== Analytics =====

    /**
     * GET /api/onboarding/stats
     * Get onboarding completion statistics
     */
    app.get('/api/onboarding/stats', async (req: Request, res: Response) => {
        try {
            const stats = await onboardingService.getCompletionStats();
            res.status(200).json(stats);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * GET /api/onboarding/stats/household
     * Get metrics for specific household
     */
    app.get('/api/onboarding/stats/household', async (req: Request, res: Response) => {
        try {
            const householdId = req.query.householdId as EntityId;

            if (!householdId) {
                return res.status(400).json({ error: 'householdId query parameter required' });
            }

            const metrics = await onboardingService.getHouseholdMetrics(householdId);
            res.status(200).json(metrics);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });
}
