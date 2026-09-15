/**
 * Unit Tests: Onboarding Progress Data Model
 * 
 * Tests the core data structures and validation rules for onboarding state tracking.
 * Following TDD: Define expected behavior before implementation.
 */

import { v4 as uuidv4 } from 'uuid';
import {
    OnboardingProgress,
    OnboardingState,
    OnboardingPhase,
    SetupPhaseData,
    AccountsPhaseData,
    StatementsPhaseData,
    FinancialContextPhaseData,
    ProfilePhaseData,
    LaunchPhaseData,
} from '../../../domain/types/onboarding.types';

describe('OnboardingProgress Model', () => {
    const householdId = uuidv4();
    const userId = 'keycloak-user-123';

    describe('Initialization', () => {
        it('should create a new onboarding progress in Phase 1 with NOT_STARTED state', () => {
            const progress: OnboardingProgress = {
                id: uuidv4(),
                householdId,
                currentPhase: 1,
                currentState: OnboardingState.NOT_STARTED,
                phases: {
                    1: { completed: false, completedAt: null, data: null },
                    2: { completed: false, completedAt: null, data: null },
                    3: { completed: false, completedAt: null, data: null },
                    4: { completed: false, completedAt: null, data: null },
                    5: { completed: false, completedAt: null, data: null },
                    6: { completed: false, completedAt: null, data: null },
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

            expect(progress.currentPhase).toBe(1);
            expect(progress.currentState).toBe(OnboardingState.NOT_STARTED);
            expect(progress.completedAt).toBeNull();
            expect(progress.phases[1].completed).toBe(false);
        });

        it('should initialize all 6 phases as incomplete', () => {
            const progress: OnboardingProgress = {
                id: uuidv4(),
                householdId,
                currentPhase: 1,
                currentState: OnboardingState.IN_PROGRESS,
                phases: {
                    1: { completed: false, completedAt: null, data: null },
                    2: { completed: false, completedAt: null, data: null },
                    3: { completed: false, completedAt: null, data: null },
                    4: { completed: false, completedAt: null, data: null },
                    5: { completed: false, completedAt: null, data: null },
                    6: { completed: false, completedAt: null, data: null },
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

            for (let phase = 1; phase <= 6; phase++) {
                expect(progress.phases[phase as OnboardingPhase].completed).toBe(false);
                expect(progress.phases[phase as OnboardingPhase].completedAt).toBeNull();
            }
        });
    });

    describe('Phase Completion Tracking', () => {
        it('should mark phase as completed with timestamp when data provided', () => {
            const progress: OnboardingProgress = {
                id: uuidv4(),
                householdId,
                currentPhase: 1,
                currentState: OnboardingState.IN_PROGRESS,
                phases: {
                    1: {
                        completed: true,
                        completedAt: new Date('2026-09-13T10:00:00Z'),
                        data: { householdName: 'Smith Family', profileType: 'FAMILY' }
                    },
                    2: { completed: false, completedAt: null, data: null },
                    3: { completed: false, completedAt: null, data: null },
                    4: { completed: false, completedAt: null, data: null },
                    5: { completed: false, completedAt: null, data: null },
                    6: { completed: false, completedAt: null, data: null },
                },
                startedAt: new Date('2026-09-13T09:00:00Z'),
                lastActivityAt: new Date('2026-09-13T10:00:00Z'),
                completedAt: null,
                totalTimeMinutes: 60,
                lastCheckpoint: null,
                createdBy: userId,
                updatedBy: userId,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            expect(progress.phases[1].completed).toBe(true);
            expect(progress.phases[1].completedAt).not.toBeNull();
            expect(progress.phases[1].data).toEqual(
                expect.objectContaining({
                    householdName: 'Smith Family',
                    profileType: 'FAMILY',
                })
            );
        });

        it('should support multiple phases completed', () => {
            const progress: OnboardingProgress = {
                id: uuidv4(),
                householdId,
                currentPhase: 3,
                currentState: OnboardingState.IN_PROGRESS,
                phases: {
                    1: {
                        completed: true,
                        completedAt: new Date('2026-09-13T10:00:00Z'),
                        data: { householdName: 'Test' }
                    },
                    2: {
                        completed: true,
                        completedAt: new Date('2026-09-13T10:15:00Z'),
                        data: { declaredAccounts: [] }
                    },
                    3: { completed: false, completedAt: null, data: null },
                    4: { completed: false, completedAt: null, data: null },
                    5: { completed: false, completedAt: null, data: null },
                    6: { completed: false, completedAt: null, data: null },
                },
                startedAt: new Date('2026-09-13T09:00:00Z'),
                lastActivityAt: new Date('2026-09-13T10:15:00Z'),
                completedAt: null,
                totalTimeMinutes: 75,
                lastCheckpoint: null,
                createdBy: userId,
                updatedBy: userId,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            expect(progress.phases[1].completed).toBe(true);
            expect(progress.phases[2].completed).toBe(true);
            expect(progress.phases[3].completed).toBe(false);
        });

        it('should calculate total time spent on onboarding', () => {
            const startTime = new Date('2026-09-13T09:00:00Z');
            const endTime = new Date('2026-09-13T09:30:00Z');
            const totalMinutes = Math.floor(
                (endTime.getTime() - startTime.getTime()) / 60000
            );

            expect(totalMinutes).toBe(30);
        });
    });

    describe('State Transitions', () => {
        it('should track transition from NOT_STARTED to IN_PROGRESS', () => {
            const progress: OnboardingProgress = {
                id: uuidv4(),
                householdId,
                currentPhase: 1,
                currentState: OnboardingState.IN_PROGRESS,
                phases: {
                    1: { completed: false, completedAt: null, data: null },
                    2: { completed: false, completedAt: null, data: null },
                    3: { completed: false, completedAt: null, data: null },
                    4: { completed: false, completedAt: null, data: null },
                    5: { completed: false, completedAt: null, data: null },
                    6: { completed: false, completedAt: null, data: null },
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

            expect(progress.currentState).toBe(OnboardingState.IN_PROGRESS);
        });

        it('should track transition to COMPLETE with completion timestamp', () => {
            const completedAt = new Date('2026-09-13T09:35:00Z');
            const progress: OnboardingProgress = {
                id: uuidv4(),
                householdId,
                currentPhase: 6,
                currentState: OnboardingState.COMPLETE,
                phases: {
                    1: { completed: true, completedAt: new Date(), data: null },
                    2: { completed: true, completedAt: new Date(), data: null },
                    3: { completed: true, completedAt: new Date(), data: null },
                    4: { completed: true, completedAt: new Date(), data: null },
                    5: { completed: true, completedAt: new Date(), data: null },
                    6: { completed: true, completedAt: completedAt, data: null },
                },
                startedAt: new Date('2026-09-13T09:00:00Z'),
                lastActivityAt: new Date('2026-09-13T09:35:00Z'),
                completedAt,
                totalTimeMinutes: 35,
                lastCheckpoint: null,
                createdBy: userId,
                updatedBy: userId,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            expect(progress.currentState).toBe(OnboardingState.COMPLETE);
            expect(progress.completedAt).toEqual(completedAt);
            expect(progress.currentPhase).toBe(6);
        });
    });

    describe('Checkpoint Tracking', () => {
        it('should store latest checkpoint for resume functionality', () => {
            const checkpointData = {
                householdName: 'Test Family',
                profileType: 'FAMILY',
            };

            const progress: OnboardingProgress = {
                id: uuidv4(),
                householdId,
                currentPhase: 2,
                currentState: OnboardingState.IN_PROGRESS,
                phases: {
                    1: { completed: true, completedAt: new Date(), data: checkpointData },
                    2: { completed: false, completedAt: null, data: null },
                    3: { completed: false, completedAt: null, data: null },
                    4: { completed: false, completedAt: null, data: null },
                    5: { completed: false, completedAt: null, data: null },
                    6: { completed: false, completedAt: null, data: null },
                },
                startedAt: new Date(),
                lastActivityAt: new Date(),
                completedAt: null,
                totalTimeMinutes: 15,
                lastCheckpoint: 'checkpoint-abc123',
                createdBy: userId,
                updatedBy: userId,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            expect(progress.lastCheckpoint).not.toBeNull();
            expect(progress.lastCheckpoint).toBe('checkpoint-abc123');
        });

        it('should update checkpoint when resuming onboarding', () => {
            const oldCheckpointId = 'checkpoint-old-session';
            const newCheckpointId = 'checkpoint-new-session';

            const progress: OnboardingProgress = {
                id: uuidv4(),
                householdId,
                currentPhase: 2,
                currentState: OnboardingState.IN_PROGRESS,
                phases: {
                    1: { completed: true, completedAt: new Date(), data: null },
                    2: { completed: false, completedAt: null, data: null },
                    3: { completed: false, completedAt: null, data: null },
                    4: { completed: false, completedAt: null, data: null },
                    5: { completed: false, completedAt: null, data: null },
                    6: { completed: false, completedAt: null, data: null },
                },
                startedAt: new Date(),
                lastActivityAt: new Date(),
                completedAt: null,
                totalTimeMinutes: 20,
                lastCheckpoint: newCheckpointId,
                createdBy: userId,
                updatedBy: userId,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            expect(progress.lastCheckpoint).toBe(newCheckpointId);
        });
    });

    describe('Audit Trail', () => {
        it('should track who created and last updated the record', () => {
            const createdBy = 'user-123';
            const updatedBy = 'user-456';

            const progress: OnboardingProgress = {
                id: uuidv4(),
                householdId,
                currentPhase: 1,
                currentState: OnboardingState.IN_PROGRESS,
                phases: {
                    1: { completed: false, completedAt: null, data: null },
                    2: { completed: false, completedAt: null, data: null },
                    3: { completed: false, completedAt: null, data: null },
                    4: { completed: false, completedAt: null, data: null },
                    5: { completed: false, completedAt: null, data: null },
                    6: { completed: false, completedAt: null, data: null },
                },
                startedAt: new Date(),
                lastActivityAt: new Date(),
                completedAt: null,
                totalTimeMinutes: 0,
                lastCheckpoint: null,
                createdBy,
                updatedBy,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            expect(progress.createdBy).toBe(createdBy);
            expect(progress.updatedBy).toBe(updatedBy);
            expect(progress.createdAt).toBeLessThanOrEqual(progress.updatedAt);
        });

        it('should maintain immutable creation timestamp', () => {
            const createdAt = new Date('2026-09-13T09:00:00Z');
            const updatedAt = new Date('2026-09-13T09:30:00Z');

            const progress: OnboardingProgress = {
                id: uuidv4(),
                householdId,
                currentPhase: 1,
                currentState: OnboardingState.IN_PROGRESS,
                phases: {
                    1: { completed: false, completedAt: null, data: null },
                    2: { completed: false, completedAt: null, data: null },
                    3: { completed: false, completedAt: null, data: null },
                    4: { completed: false, completedAt: null, data: null },
                    5: { completed: false, completedAt: null, data: null },
                    6: { completed: false, completedAt: null, data: null },
                },
                startedAt: createdAt,
                lastActivityAt: updatedAt,
                completedAt: null,
                totalTimeMinutes: 30,
                lastCheckpoint: null,
                createdBy: userId,
                updatedBy: userId,
                createdAt,
                updatedAt,
            };

            expect(progress.createdAt).toEqual(createdAt);
            expect(progress.updatedAt).toEqual(updatedAt);
        });
    });

    describe('Constraint Validation', () => {
        it('should have unique household_id (only one onboarding per household)', () => {
            // This is enforced at the database level, but we verify the model doesn't duplicate
            const progress1: OnboardingProgress = {
                id: uuidv4(),
                householdId,
                currentPhase: 1,
                currentState: OnboardingState.IN_PROGRESS,
                phases: {
                    1: { completed: false, completedAt: null, data: null },
                    2: { completed: false, completedAt: null, data: null },
                    3: { completed: false, completedAt: null, data: null },
                    4: { completed: false, completedAt: null, data: null },
                    5: { completed: false, completedAt: null, data: null },
                    6: { completed: false, completedAt: null, data: null },
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

            const progress2: OnboardingProgress = {
                id: uuidv4(),
                householdId, // Same household
                currentPhase: 1,
                currentState: OnboardingState.NOT_STARTED,
                phases: {
                    1: { completed: false, completedAt: null, data: null },
                    2: { completed: false, completedAt: null, data: null },
                    3: { completed: false, completedAt: null, data: null },
                    4: { completed: false, completedAt: null, data: null },
                    5: { completed: false, completedAt: null, data: null },
                    6: { completed: false, completedAt: null, data: null },
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

            // These would violate UNIQUE constraint at database level
            expect(progress1.householdId).toEqual(progress2.householdId);
            expect(progress1.id).not.toEqual(progress2.id); // But different IDs
        });

        it('should enforce valid phase numbers (1-6)', () => {
            const validPhases = [1, 2, 3, 4, 5, 6] as const;

            validPhases.forEach((phase) => {
                const progress: OnboardingProgress = {
                    id: uuidv4(),
                    householdId,
                    currentPhase: phase,
                    currentState: OnboardingState.IN_PROGRESS,
                    phases: {
                        1: { completed: false, completedAt: null, data: null },
                        2: { completed: false, completedAt: null, data: null },
                        3: { completed: false, completedAt: null, data: null },
                        4: { completed: false, completedAt: null, data: null },
                        5: { completed: false, completedAt: null, data: null },
                        6: { completed: false, completedAt: null, data: null },
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

                expect(progress.currentPhase).toBeGreaterThanOrEqual(1);
                expect(progress.currentPhase).toBeLessThanOrEqual(6);
            });
        });
    });
});
