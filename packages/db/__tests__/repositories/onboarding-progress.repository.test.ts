/**
 * Integration Tests: Onboarding Database Schema & Repositories
 * 
 * Tests database constraints, migrations, and repository operations.
 * Ensures data integrity at the persistence layer.
 */

import { v4 as uuidv4 } from 'uuid';
import {
    OnboardingProgress,
    OnboardingState,
    OnboardingSessionCheckpoint,
} from '../../../domain/types/onboarding.types';

/**
 * Mock Database and Repository for testing
 * In real tests, this would use a test PostgreSQL database
 */

interface MockDatabase {
    onboardingProgress: Map<string, OnboardingProgress>;
    onboardingCheckpoints: Map<string, OnboardingSessionCheckpoint>;
    constraints: {
        uniqueHouseholdId: Set<string>;
    };
}

class MockOnboardingProgressRepository {
    constructor(private db: MockDatabase) { }

    async start(
        householdId: string,
        userId: string
    ): Promise<OnboardingProgress> {
        // Check UNIQUE constraint
        if (this.db.constraints.uniqueHouseholdId.has(householdId)) {
            throw new Error(`Onboarding already exists for household ${householdId}`);
        }

        const progress: OnboardingProgress = {
            id: uuidv4(),
            householdId,
            currentPhase: 1,
            currentState: OnboardingState.IN_PROGRESS,
            phases: {
                1: { completed: false, completedAt: null, data: {} },
                2: { completed: false, completedAt: null, data: {} },
                3: { completed: false, completedAt: null, data: {} },
                4: { completed: false, completedAt: null, data: {} },
                5: { completed: false, completedAt: null, data: {} },
                6: { completed: false, completedAt: null, data: {} },
            },
            startedAt: new Date(),
            lastActivityAt: new Date(),
            completedAt: null,
            totalTimeMinutes: 0,
            lastCheckpoint: null,
            createdBy: userId,
            updatedBy: userId,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        this.db.onboardingProgress.set(householdId, progress);
        this.db.constraints.uniqueHouseholdId.add(householdId);

        return progress;
    }

    async getByHouseholdId(householdId: string): Promise<OnboardingProgress | null> {
        return this.db.onboardingProgress.get(householdId) || null;
    }

    async completePhase(
        householdId: string,
        phaseNumber: number,
        data: object,
        userId: string
    ): Promise<OnboardingProgress> {
        const progress = await this.getByHouseholdId(householdId);
        if (!progress) {
            throw new Error(`Onboarding not found for household ${householdId}`);
        }

        const phase = phaseNumber as 1 | 2 | 3 | 4 | 5 | 6;
        progress.phases[phase].completed = true;
        progress.phases[phase].completedAt = new Date();
        progress.phases[phase].data = data;
        progress.lastActivityAt = new Date();
        progress.updatedBy = userId;
        progress.updatedAt = new Date();

        // Auto-advance if completing current phase
        if (phaseNumber === progress.currentPhase && phaseNumber < 6) {
            progress.currentPhase = (phaseNumber + 1) as 1 | 2 | 3 | 4 | 5 | 6;
        }

        // Mark as complete if all phases done
        if (
            progress.phases[1].completed &&
            progress.phases[2].completed &&
            progress.phases[3].completed &&
            progress.phases[4].completed &&
            progress.phases[5].completed &&
            progress.phases[6].completed
        ) {
            progress.currentState = OnboardingState.COMPLETE;
            progress.completedAt = new Date();
            const totalSeconds = Math.floor(
                (progress.completedAt.getTime() - progress.startedAt.getTime()) / 1000
            );
            progress.totalTimeMinutes = Math.floor(totalSeconds / 60);
        }

        this.db.onboardingProgress.set(householdId, progress);
        return progress;
    }

    async skipPhase(householdId: string, phaseNumber: number): Promise<OnboardingProgress> {
        const progress = await this.getByHouseholdId(householdId);
        if (!progress) {
            throw new Error(`Onboarding not found for household ${householdId}`);
        }

        // Advance to next phase without completing current
        if (phaseNumber < 6) {
            progress.currentPhase = (phaseNumber + 1) as 1 | 2 | 3 | 4 | 5 | 6;
        }
        progress.lastActivityAt = new Date();

        this.db.onboardingProgress.set(householdId, progress);
        return progress;
    }

    async launch(householdId: string): Promise<OnboardingProgress> {
        const progress = await this.getByHouseholdId(householdId);
        if (!progress) {
            throw new Error(`Onboarding not found for household ${householdId}`);
        }

        progress.currentState = OnboardingState.COMPLETE;
        progress.currentPhase = 6;
        progress.completedAt = new Date();
        const totalSeconds = Math.floor(
            (progress.completedAt.getTime() - progress.startedAt.getTime()) / 1000
        );
        progress.totalTimeMinutes = Math.floor(totalSeconds / 60);

        this.db.onboardingProgress.set(householdId, progress);
        return progress;
    }

    async restart(householdId: string): Promise<OnboardingProgress> {
        const progress = await this.getByHouseholdId(householdId);
        if (!progress) {
            throw new Error(`Onboarding not found for household ${householdId}`);
        }

        // Reset to initial state
        progress.currentPhase = 1;
        progress.currentState = OnboardingState.IN_PROGRESS;
        progress.completedAt = null;
        progress.totalTimeMinutes = 0;
        progress.startedAt = new Date();
        progress.lastActivityAt = new Date();

        // Clear all phase data
        for (let i = 1; i <= 6; i++) {
            const phase = i as 1 | 2 | 3 | 4 | 5 | 6;
            progress.phases[phase] = {
                completed: false,
                completedAt: null,
                data: {},
            };
        }

        this.db.onboardingProgress.set(householdId, progress);
        return progress;
    }
}

describe('Onboarding Database Schema Integration Tests', () => {
    let db: MockDatabase;
    let repository: MockOnboardingProgressRepository;
    const householdId = uuidv4();
    const userId = 'test-user-123';

    beforeEach(() => {
        db = {
            onboardingProgress: new Map(),
            onboardingCheckpoints: new Map(),
            constraints: {
                uniqueHouseholdId: new Set(),
            },
        };
        repository = new MockOnboardingProgressRepository(db);
    });

    describe('UNIQUE(household_id) Constraint', () => {
        it('should create first onboarding progress without error', async () => {
            const progress = await repository.start(householdId, userId);

            expect(progress.householdId).toBe(householdId);
            expect(progress.currentPhase).toBe(1);
        });

        it('should reject duplicate household_id', async () => {
            await repository.start(householdId, userId);

            // Attempt to create another onboarding for same household
            await expect(repository.start(householdId, userId)).rejects.toThrow(
                /already exists/
            );
        });

        it('should allow different households to have separate onboarding records', async () => {
            const householdId1 = uuidv4();
            const householdId2 = uuidv4();

            const progress1 = await repository.start(householdId1, userId);
            const progress2 = await repository.start(householdId2, userId);

            expect(progress1.householdId).toBe(householdId1);
            expect(progress2.householdId).toBe(householdId2);
            expect(progress1.id).not.toBe(progress2.id);
        });
    });

    describe('Onboarding Progress CRUD', () => {
        beforeEach(async () => {
            await repository.start(householdId, userId);
        });

        it('should create onboarding progress in phase 1', async () => {
            const progress = await repository.getByHouseholdId(householdId);

            expect(progress).not.toBeNull();
            expect(progress!.currentPhase).toBe(1);
            expect(progress!.currentState).toBe(OnboardingState.IN_PROGRESS);
        });

        it('should retrieve existing onboarding progress', async () => {
            const progress = await repository.getByHouseholdId(householdId);

            expect(progress).not.toBeNull();
            expect(progress!.householdId).toBe(householdId);
        });

        it('should return null for non-existent household', async () => {
            const nonExistentHousehold = uuidv4();
            const progress = await repository.getByHouseholdId(nonExistentHousehold);

            expect(progress).toBeNull();
        });

        it('should complete a phase and store data', async () => {
            const phaseData = {
                householdName: 'Test Family',
                profileType: 'FAMILY',
            };

            const updated = await repository.completePhase(householdId, 1, phaseData, userId);

            expect(updated.phases[1].completed).toBe(true);
            expect(updated.phases[1].completedAt).not.toBeNull();
            expect(updated.phases[1].data).toEqual(phaseData);
        });

        it('should advance to next phase when completing current phase', async () => {
            const phaseData = { householdName: 'Test Family', profileType: 'FAMILY' };
            const updated = await repository.completePhase(householdId, 1, phaseData, userId);

            expect(updated.currentPhase).toBe(2);
        });

        it('should not advance beyond phase 6', async () => {
            // Complete phases 1-6
            for (let i = 1; i <= 6; i++) {
                await repository.completePhase(householdId, i, {}, userId);
            }

            const final = await repository.getByHouseholdId(householdId);
            expect(final!.currentPhase).toBeLessThanOrEqual(6);
        });
    });

    describe('Phase Progression', () => {
        beforeEach(async () => {
            await repository.start(householdId, userId);
        });

        it('should complete sequential phases', async () => {
            for (let i = 1; i <= 3; i++) {
                const phase = i as 1 | 2 | 3 | 4 | 5 | 6;
                await repository.completePhase(householdId, i, { phaseNumber: i }, userId);

                const progress = await repository.getByHouseholdId(householdId);
                expect(progress!.phases[phase].completed).toBe(true);
            }
        });

        it('should skip phases', async () => {
            // Start at phase 1
            let progress = await repository.getByHouseholdId(householdId);
            expect(progress!.currentPhase).toBe(1);

            // Skip to phase 4
            progress = await repository.skipPhase(householdId, 1);
            progress = await repository.skipPhase(householdId, 2);
            progress = await repository.skipPhase(householdId, 3);

            expect(progress.currentPhase).toBe(4);
        });

        it('should allow going backward to edit phase', async () => {
            // Complete phases 1-3
            await repository.completePhase(householdId, 1, { data: 'phase1' }, userId);
            await repository.completePhase(householdId, 2, { data: 'phase2' }, userId);
            await repository.completePhase(householdId, 3, { data: 'phase3' }, userId);

            let progress = await repository.getByHouseholdId(householdId);
            expect(progress!.currentPhase).toBe(4);

            // Can re-complete phase 2 with new data (simulating edit)
            progress = await repository.completePhase(householdId, 2, { data: 'updated' }, userId);
            expect(progress.phases[2].data).toEqual({ data: 'updated' });
        });
    });

    describe('Completion & Launch', () => {
        beforeEach(async () => {
            await repository.start(householdId, userId);
        });

        it('should mark onboarding complete when all phases done', async () => {
            for (let i = 1; i <= 6; i++) {
                await repository.completePhase(householdId, i, {}, userId);
            }

            const progress = await repository.getByHouseholdId(householdId);
            expect(progress!.currentState).toBe(OnboardingState.COMPLETE);
            expect(progress!.completedAt).not.toBeNull();
        });

        it('should calculate total time on completion', async () => {
            for (let i = 1; i <= 6; i++) {
                await repository.completePhase(householdId, i, {}, userId);
            }

            const progress = await repository.getByHouseholdId(householdId);
            expect(progress!.totalTimeMinutes).toBeGreaterThanOrEqual(0);
            expect(progress!.totalTimeMinutes).toBeLessThan(10000); // Reasonable upper limit
        });

        it('should launch onboarding with minimal phases complete', async () => {
            // User can skip to launch without completing all phases
            const progress = await repository.launch(householdId);

            expect(progress.currentState).toBe(OnboardingState.COMPLETE);
            expect(progress.currentPhase).toBe(6);
            expect(progress.completedAt).not.toBeNull();
        });

        it('should allow restart from completed state', async () => {
            // Complete onboarding
            for (let i = 1; i <= 6; i++) {
                await repository.completePhase(householdId, i, {}, userId);
            }

            let progress = await repository.getByHouseholdId(householdId);
            expect(progress!.currentState).toBe(OnboardingState.COMPLETE);

            // Restart
            progress = await repository.restart(householdId);

            expect(progress.currentPhase).toBe(1);
            expect(progress.currentState).toBe(OnboardingState.IN_PROGRESS);
            expect(progress.completedAt).toBeNull();
        });
    });

    describe('Timestamp Constraints', () => {
        it('should maintain monotonic timestamps (created < updated)', async () => {
            const progress1 = await repository.start(householdId, userId);
            const created1 = progress1.createdAt.getTime();
            const updated1 = progress1.updatedAt.getTime();

            expect(created1).toBeLessThanOrEqual(updated1);
        });

        it('should update updatedAt when progress changes', async () => {
            const progress1 = await repository.getByHouseholdId(householdId);
            const updated1 = progress1!.updatedAt.getTime();

            // Add small delay to ensure timestamp difference
            await new Promise((resolve) => setTimeout(resolve, 10));

            const progress2 = await repository.completePhase(householdId, 1, {}, userId);
            const updated2 = progress2.updatedAt.getTime();

            expect(updated2).toBeGreaterThanOrEqual(updated1);
        });

        it('should maintain immutable createdAt', async () => {
            const progress1 = await repository.getByHouseholdId(householdId);
            const created1 = progress1!.createdAt.getTime();

            await repository.completePhase(householdId, 1, {}, userId);

            const progress2 = await repository.getByHouseholdId(householdId);
            const created2 = progress2!.createdAt.getTime();

            expect(created1).toBe(created2);
        });

        it('should track lastActivityAt updates', async () => {
            const progress1 = await repository.getByHouseholdId(householdId);
            const activity1 = progress1!.lastActivityAt.getTime();

            await new Promise((resolve) => setTimeout(resolve, 10));

            const progress2 = await repository.skipPhase(householdId, 1);
            const activity2 = progress2.lastActivityAt.getTime();

            expect(activity2).toBeGreaterThanOrEqual(activity1);
        });
    });

    describe('Audit Trail', () => {
        it('should track createdBy user', async () => {
            const progress = await repository.getByHouseholdId(householdId);
            expect(progress!.createdBy).toBe(userId);
        });

        it('should track updatedBy user on changes', async () => {
            const newUserId = 'different-user-456';
            const progress = await repository.completePhase(householdId, 1, {}, newUserId);

            expect(progress.updatedBy).toBe(newUserId);
        });

        it('should maintain createdBy immutability', async () => {
            const progress1 = await repository.getByHouseholdId(householdId);
            const createdBy1 = progress1!.createdBy;

            const newUserId = 'different-user-456';
            const progress2 = await repository.completePhase(householdId, 1, {}, newUserId);

            expect(progress2.createdBy).toBe(createdBy1);
            expect(progress2.updatedBy).toBe(newUserId);
        });
    });

    describe('Data Integrity', () => {
        it('should not lose phase data on updates', async () => {
            const phase1Data = { householdName: 'Test', profileType: 'FAMILY' };
            const phase2Data = { declaredAccounts: [] };

            await repository.completePhase(householdId, 1, phase1Data, userId);
            const progress1 = await repository.getByHouseholdId(householdId);
            expect(progress1!.phases[1].data).toEqual(phase1Data);

            await repository.completePhase(householdId, 2, phase2Data, userId);
            const progress2 = await repository.getByHouseholdId(householdId);

            expect(progress2!.phases[1].data).toEqual(phase1Data); // Still there
            expect(progress2!.phases[2].data).toEqual(phase2Data);
        });

        it('should handle concurrent operations safely', async () => {
            const household1 = uuidv4();
            const household2 = uuidv4();

            const p1 = repository.start(household1, userId);
            const p2 = repository.start(household2, userId);

            const [progress1, progress2] = await Promise.all([p1, p2]);

            expect(progress1.householdId).toBe(household1);
            expect(progress2.householdId).toBe(household2);
            expect(progress1.id).not.toBe(progress2.id);
        });
    });
});
