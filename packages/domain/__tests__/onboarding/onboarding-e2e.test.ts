/**
 * Integration Tests: End-to-End Onboarding Flow
 * 
 * Tests complete user journey through all phases of onboarding.
 * Simulates realistic scenarios: happy path, pause/resume, skip ahead, etc.
 */

import { v4 as uuidv4 } from 'uuid';
import { OnboardingState } from '../../../domain/types/onboarding.types';

/**
 * Simulated OnboardingOrchestrationService
 * Coordinates progress, checkpoints, and state transitions
 */

interface OnboardingContext {
    householdId: string;
    userId: string;
    sessionId: string;
    startedAt: Date;
}

class SimulatedOnboardingService {
    private progressData: Map<string, any> = new Map();
    private checkpoints: Map<string, any> = new Map();

    async initiateOnboarding(householdId: string, userId: string): Promise<OnboardingContext> {
        const sessionId = `session-${Date.now()}`;
        const context: OnboardingContext = {
            householdId,
            userId,
            sessionId,
            startedAt: new Date(),
        };

        this.progressData.set(householdId, {
            currentPhase: 1,
            currentState: OnboardingState.IN_PROGRESS,
            phases: {
                1: { completed: false, data: {} },
                2: { completed: false, data: {} },
                3: { completed: false, data: {} },
                4: { completed: false, data: {} },
                5: { completed: false, data: {} },
                6: { completed: false, data: {} },
            },
            startedAt: context.startedAt,
            lastActivityAt: new Date(),
            totalTimeMinutes: 0,
        });

        return context;
    }

    async completePhase(
        householdId: string,
        phaseNumber: number,
        data: object
    ): Promise<{ success: boolean; nextPhase: number }> {
        const progress = this.progressData.get(householdId);
        if (!progress) {
            throw new Error('Onboarding not found');
        }

        // Validate phase data
        if (!data || Object.keys(data).length === 0) {
            throw new Error('Phase data required');
        }

        // Mark phase complete
        const phase = phaseNumber as 1 | 2 | 3 | 4 | 5 | 6;
        progress.phases[phase].completed = true;
        progress.phases[phase].data = data;
        progress.lastActivityAt = new Date();

        // Auto-advance to next phase if completing current
        let nextPhase = phaseNumber;
        if (phaseNumber === progress.currentPhase && phaseNumber < 6) {
            progress.currentPhase = phaseNumber + 1;
            nextPhase = progress.currentPhase;
        }

        // Check if all phases complete
        const allComplete = Object.values(progress.phases).every(
            (p: any) => p.completed === true
        );
        if (allComplete) {
            progress.currentState = OnboardingState.COMPLETE;
            const totalSeconds = Math.floor(
                (new Date().getTime() - progress.startedAt.getTime()) / 1000
            );
            progress.totalTimeMinutes = Math.floor(totalSeconds / 60);
        }

        return { success: true, nextPhase };
    }

    async skipToPhase(
        householdId: string,
        targetPhase: number
    ): Promise<{ success: boolean; currentPhase: number }> {
        const progress = this.progressData.get(householdId);
        if (!progress) {
            throw new Error('Onboarding not found');
        }

        if (targetPhase < progress.currentPhase) {
            // Going back - allowed for editing
            progress.currentPhase = targetPhase;
        } else if (targetPhase <= 6) {
            // Going forward - skip ahead
            progress.currentPhase = targetPhase;
        } else {
            throw new Error('Invalid phase');
        }

        progress.lastActivityAt = new Date();
        return { success: true, currentPhase: progress.currentPhase };
    }

    async saveCheckpoint(
        householdId: string,
        sessionId: string,
        phaseNumber: number
    ): Promise<{ checkpointId: string }> {
        const progress = this.progressData.get(householdId);
        if (!progress) {
            throw new Error('Onboarding not found');
        }

        const checkpointId = uuidv4();
        const key = `${householdId}:${sessionId}`;

        this.checkpoints.set(key, {
            id: checkpointId,
            householdId,
            sessionId,
            phase: phaseNumber,
            progressSnapshot: JSON.parse(JSON.stringify(progress)),
            createdAt: new Date(),
        });

        return { checkpointId };
    }

    async resumeFromCheckpoint(householdId: string, sessionId: string): Promise<any> {
        const key = `${householdId}:${sessionId}`;
        const checkpoint = this.checkpoints.get(key);

        if (!checkpoint) {
            throw new Error('No checkpoint found');
        }

        // Restore progress from checkpoint
        this.progressData.set(householdId, JSON.parse(JSON.stringify(checkpoint.progressSnapshot)));

        return checkpoint;
    }

    async getProgress(householdId: string): Promise<any> {
        return this.progressData.get(householdId) || null;
    }

    async launchOnboarding(householdId: string): Promise<{ success: boolean; snapshotCreated: boolean }> {
        const progress = this.progressData.get(householdId);
        if (!progress) {
            throw new Error('Onboarding not found');
        }

        // User can launch even without completing all phases
        // (though typically would require minimum data)
        progress.currentState = OnboardingState.COMPLETE;
        progress.currentPhase = 6;

        const totalSeconds = Math.floor(
            (new Date().getTime() - progress.startedAt.getTime()) / 1000
        );
        progress.totalTimeMinutes = Math.floor(totalSeconds / 60);

        // Would trigger financial snapshot creation
        return { success: true, snapshotCreated: true };
    }
}

describe('Onboarding End-to-End Integration Tests', () => {
    let service: SimulatedOnboardingService;
    const householdId = uuidv4();
    const userId = 'test-user-123';

    beforeEach(() => {
        service = new SimulatedOnboardingService();
    });

    describe('Happy Path: Complete All Phases Sequentially', () => {
        it('should start onboarding', async () => {
            const context = await service.initiateOnboarding(householdId, userId);

            expect(context.householdId).toBe(householdId);
            expect(context.userId).toBe(userId);
            expect(context.sessionId).toBeDefined();
            expect(context.startedAt).toBeInstanceOf(Date);
        });

        it('should complete phases 1-6 sequentially', async () => {
            await service.initiateOnboarding(householdId, userId);

            // Phase 1: Setup
            let result = await service.completePhase(householdId, 1, {
                householdName: 'Test Family',
                profileType: 'FAMILY',
            });
            expect(result.nextPhase).toBe(2);

            // Phase 2: Accounts
            result = await service.completePhase(householdId, 2, {
                declaredAccounts: [
                    { institution: 'Chase', accountType: 'CHECKING' },
                ],
            });
            expect(result.nextPhase).toBe(3);

            // Phase 3: Statements
            result = await service.completePhase(householdId, 3, {
                accountStatementCollectionStatus: {},
            });
            expect(result.nextPhase).toBe(4);

            // Phase 4: Financial Context
            result = await service.completePhase(householdId, 4, {
                detectedIncome: { source: 'AUTO_DETECTED', amount: 9750 },
            });
            expect(result.nextPhase).toBe(5);

            // Phase 5: Profile
            result = await service.completePhase(householdId, 5, {
                householdMembers: [],
                privacyConfirmed: true,
            });
            expect(result.nextPhase).toBe(6);

            // Phase 6: Launch
            result = await service.completePhase(householdId, 6, {
                confirmationPhrase: 'ready',
            });

            const finalProgress = await service.getProgress(householdId);
            expect(finalProgress.currentState).toBe(OnboardingState.COMPLETE);
        });

        it('should track time from start to completion', async () => {
            const startTime = Date.now();
            await service.initiateOnboarding(householdId, userId);

            // Simulate completing all phases with delays
            for (let i = 1; i <= 6; i++) {
                await service.completePhase(householdId, i, { phase: i });
                if (i < 6) {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
            }

            const finalProgress = await service.getProgress(householdId);
            expect(finalProgress.totalTimeMinutes).toBeGreaterThan(0);
        });
    });

    describe('Partial Completion: Skip Phases', () => {
        it('should allow skipping forward from phase 1 to phase 5', async () => {
            await service.initiateOnboarding(householdId, userId);

            const result = await service.skipToPhase(householdId, 5);

            expect(result.success).toBe(true);
            expect(result.currentPhase).toBe(5);

            const progress = await service.getProgress(householdId);
            expect(progress.currentPhase).toBe(5);
            expect(progress.phases[1].completed).toBe(false); // Still incomplete
        });

        it('should allow launching with minimal data (skip ahead strategy)', async () => {
            await service.initiateOnboarding(householdId, userId);

            // Complete only essential phases
            await service.completePhase(householdId, 1, { householdName: 'Test' });
            await service.completePhase(householdId, 2, { declaredAccounts: [] });

            // Skip to launch
            await service.skipToPhase(householdId, 6);

            const result = await service.launchOnboarding(householdId);
            expect(result.success).toBe(true);

            const progress = await service.getProgress(householdId);
            expect(progress.currentState).toBe(OnboardingState.COMPLETE);
        });
    });

    describe('Pause & Resume: Checkpoint Workflow', () => {
        it('should pause at phase 2 and resume later', async () => {
            const sessionId1 = 'device-laptop';
            const sessionId2 = 'device-phone';

            // Initial session on laptop
            await service.initiateOnboarding(householdId, userId);
            await service.completePhase(householdId, 1, { householdName: 'Test' });
            await service.completePhase(householdId, 2, {
                declaredAccounts: [{ institution: 'Chase' }],
            });

            // Save checkpoint
            const checkpoint1 = await service.saveCheckpoint(householdId, sessionId1, 2);
            expect(checkpoint1.checkpointId).toBeDefined();

            // Pause (user closes browser)
            let progress = await service.getProgress(householdId);
            expect(progress.currentPhase).toBe(3);

            // Later: User returns on phone, resumes from checkpoint
            await service.resumeFromCheckpoint(householdId, sessionId1);

            progress = await service.getProgress(householdId);
            expect(progress.phases[1].completed).toBe(true);
            expect(progress.phases[2].completed).toBe(true);
            expect(progress.phases[2].data).toEqual(
                expect.objectContaining({ declaredAccounts: [{ institution: 'Chase' }] })
            );
        });

        it('should handle multiple save/resume cycles', async () => {
            const sessionId = 'session-abc';
            await service.initiateOnboarding(householdId, userId);

            // Cycle 1: Complete phase 1, save
            await service.completePhase(householdId, 1, { householdName: 'Test' });
            await service.saveCheckpoint(householdId, sessionId, 1);

            let progress = await service.getProgress(householdId);
            expect(progress.phases[1].completed).toBe(true);

            // Cycle 2: Complete phase 2, save
            await service.completePhase(householdId, 2, { declaredAccounts: [] });
            await service.saveCheckpoint(householdId, sessionId, 2);

            progress = await service.getProgress(householdId);
            expect(progress.currentPhase).toBe(3);

            // Cycle 3: Resume and complete phase 3
            await service.resumeFromCheckpoint(householdId, sessionId);
            await service.completePhase(householdId, 3, { statements: [] });
            await service.saveCheckpoint(householdId, sessionId, 3);

            progress = await service.getProgress(householdId);
            expect(progress.currentPhase).toBe(4);
        });

        it('should allow going back to edit previous phases', async () => {
            await service.initiateOnboarding(householdId, userId);

            // Complete phases 1-3
            await service.completePhase(householdId, 1, { householdName: 'Old Name' });
            await service.completePhase(householdId, 2, { declaredAccounts: [] });
            await service.completePhase(householdId, 3, { statements: [] });

            let progress = await service.getProgress(householdId);
            expect(progress.currentPhase).toBe(4);

            // Go back to edit phase 1
            await service.skipToPhase(householdId, 1);

            // Re-complete with updated data
            await service.completePhase(householdId, 1, { householdName: 'New Name' });

            progress = await service.getProgress(householdId);
            expect(progress.phases[1].data.householdName).toBe('New Name');
        });
    });

    describe('Error Scenarios & Recovery', () => {
        it('should reject phase completion without data', async () => {
            await service.initiateOnboarding(householdId, userId);

            await expect(service.completePhase(householdId, 1, {})).rejects.toThrow(
                /Phase data required/
            );
        });

        it('should reject operations on non-existent household', async () => {
            const invalidHouseholdId = uuidv4();

            await expect(
                service.completePhase(invalidHouseholdId, 1, { data: 'test' })
            ).rejects.toThrow(/Onboarding not found/);
        });

        it('should reject invalid phase numbers', async () => {
            await service.initiateOnboarding(householdId, userId);

            await expect(service.skipToPhase(householdId, 7)).rejects.toThrow(/Invalid phase/);
        });

        it('should reject resuming non-existent checkpoint', async () => {
            await service.initiateOnboarding(householdId, userId);

            await expect(
                service.resumeFromCheckpoint(householdId, 'nonexistent-session')
            ).rejects.toThrow(/No checkpoint found/);
        });

        it('should recover from partial phase data and retry', async () => {
            await service.initiateOnboarding(householdId, userId);

            // First attempt with empty data fails
            await expect(
                service.completePhase(householdId, 1, {})
            ).rejects.toThrow();

            // Retry with valid data succeeds
            const result = await service.completePhase(householdId, 1, {
                householdName: 'Test',
                profileType: 'FAMILY',
            });

            expect(result.success).toBe(true);

            const progress = await service.getProgress(householdId);
            expect(progress.phases[1].completed).toBe(true);
        });
    });

    describe('Real-World Scenarios', () => {
        it('should handle user abandoning onboarding mid-way', async () => {
            const sessionId = 'session-123';

            await service.initiateOnboarding(householdId, userId);
            await service.completePhase(householdId, 1, { householdName: 'Test' });
            await service.saveCheckpoint(householdId, sessionId, 1);

            // User abandons (in real scenario, would close browser or logout)
            let progress = await service.getProgress(householdId);
            expect(progress.currentState).toBe(OnboardingState.IN_PROGRESS);

            // Return days later and resume
            await service.resumeFromCheckpoint(householdId, sessionId);
            progress = await service.getProgress(householdId);
            expect(progress.phases[1].completed).toBe(true);

            // Can complete onboarding now
            await service.completePhase(householdId, 2, { declaredAccounts: [] });
            const launchResult = await service.launchOnboarding(householdId);
            expect(launchResult.success).toBe(true);
        });

        it('should handle user device switching', async () => {
            const laptopSession = 'device-laptop-abc';
            const phoneSession = 'device-phone-xyz';

            // User starts on laptop
            await service.initiateOnboarding(householdId, userId);
            await service.completePhase(householdId, 1, { householdName: 'Test' });
            await service.saveCheckpoint(householdId, laptopSession, 1);

            // Switch to phone - resume from phone checkpoint (new session)
            // Phone would create its own checkpoint for continuity
            await service.resumeFromCheckpoint(householdId, laptopSession);
            await service.completePhase(householdId, 2, { declaredAccounts: [] });
            await service.saveCheckpoint(householdId, phoneSession, 2);

            // Back to laptop - resume from latest
            await service.resumeFromCheckpoint(householdId, phoneSession);
            let progress = await service.getProgress(householdId);

            expect(progress.phases[1].completed).toBe(true);
            expect(progress.phases[2].completed).toBe(true);
        });

        it('should calculate accurate time spent across sessions', async () => {
            const sessionId = 'session-123';

            const startTime = Date.now();
            await service.initiateOnboarding(householdId, userId);

            // Session 1: 30 minutes
            await service.completePhase(householdId, 1, { householdName: 'Test' });
            await service.saveCheckpoint(householdId, sessionId, 1);

            // ... 12 hours pass (user sleeps) ...
            // Session 2: Resume and complete
            await service.resumeFromCheckpoint(householdId, sessionId);
            await service.completePhase(householdId, 2, { declaredAccounts: [] });
            await service.launchOnboarding(householdId);

            const finalProgress = await service.getProgress(householdId);

            // Total time should reflect elapsed time, not just active time
            expect(finalProgress.totalTimeMinutes).toBeGreaterThan(0);
            expect(finalProgress.completedAt).toBeDefined();
        });

        it('should support household member joining mid-onboarding', async () => {
            await service.initiateOnboarding(householdId, userId);

            // Primary member starts onboarding
            await service.completePhase(householdId, 1, {
                householdName: 'Smith Family',
                profileType: 'COUPLE', // Expecting spouse
            });

            // Spouse joins and wants to complete onboarding
            // In real system, spouse would login and see same onboarding session
            // Can edit or add data for themselves

            // Complete phases with both members in mind
            await service.completePhase(householdId, 5, {
                householdMembers: [
                    { id: 'user-1', name: 'John' },
                    { id: 'user-2', name: 'Jane' },
                ],
            });

            const progress = await service.getProgress(householdId);
            expect(progress.phases[5].data.householdMembers.length).toBe(2);
        });
    });

    describe('Performance & Scale', () => {
        it('should handle rapid phase transitions', async () => {
            await service.initiateOnboarding(householdId, userId);

            const promises = [];

            for (let i = 1; i <= 6; i++) {
                promises.push(
                    service.completePhase(householdId, i, { phase: i })
                );
            }

            // All should complete without errors
            const results = await Promise.all(promises);
            expect(results.length).toBe(6);

            const finalProgress = await service.getProgress(householdId);
            expect(finalProgress.currentState).toBe(OnboardingState.COMPLETE);
        });

        it('should handle multiple households concurrently', async () => {
            const households = Array.from({ length: 10 }).map(() => uuidv4());

            const promises = households.map((hh) =>
                service.initiateOnboarding(hh, userId)
            );

            const contexts = await Promise.all(promises);

            expect(contexts.length).toBe(10);
            contexts.forEach((ctx) => {
                expect(ctx.householdId).toBeDefined();
            });
        });
    });
});
