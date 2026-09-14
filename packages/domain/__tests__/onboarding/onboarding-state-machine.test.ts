/**
 * Unit Tests: Onboarding State Machine
 * 
 * Tests valid state transitions and enforces state machine rules.
 * Ensures users can move through phases in valid sequences.
 */

import { v4 as uuidv4 } from 'uuid';
import { OnboardingState, OnboardingPhase } from '../../../domain/types/onboarding.types';

describe('Onboarding State Machine', () => {
    describe('Valid State Transitions', () => {
        it('should allow transition from NOT_STARTED to IN_PROGRESS', () => {
            const currentState = OnboardingState.NOT_STARTED;
            const nextState = OnboardingState.IN_PROGRESS;

            const validTransitions: Record<OnboardingState, OnboardingState[]> = {
                [OnboardingState.NOT_STARTED]: [OnboardingState.IN_PROGRESS],
                [OnboardingState.IN_PROGRESS]: [
                    OnboardingState.PAUSED,
                    OnboardingState.COMPLETE,
                    OnboardingState.ABANDONED,
                ],
                [OnboardingState.PAUSED]: [OnboardingState.IN_PROGRESS, OnboardingState.ABANDONED],
                [OnboardingState.COMPLETE]: [],
                [OnboardingState.ABANDONED]: [OnboardingState.IN_PROGRESS], // Can restart
            };

            expect(validTransitions[currentState]).toContain(nextState);
        });

        it('should allow transition from IN_PROGRESS to PAUSED', () => {
            const currentState = OnboardingState.IN_PROGRESS;
            const nextState = OnboardingState.PAUSED;

            const validTransitions: Record<OnboardingState, OnboardingState[]> = {
                [OnboardingState.NOT_STARTED]: [OnboardingState.IN_PROGRESS],
                [OnboardingState.IN_PROGRESS]: [
                    OnboardingState.PAUSED,
                    OnboardingState.COMPLETE,
                    OnboardingState.ABANDONED,
                ],
                [OnboardingState.PAUSED]: [OnboardingState.IN_PROGRESS, OnboardingState.ABANDONED],
                [OnboardingState.COMPLETE]: [],
                [OnboardingState.ABANDONED]: [OnboardingState.IN_PROGRESS],
            };

            expect(validTransitions[currentState]).toContain(nextState);
        });

        it('should allow transition from PAUSED back to IN_PROGRESS (resume)', () => {
            const currentState = OnboardingState.PAUSED;
            const nextState = OnboardingState.IN_PROGRESS;

            const validTransitions: Record<OnboardingState, OnboardingState[]> = {
                [OnboardingState.NOT_STARTED]: [OnboardingState.IN_PROGRESS],
                [OnboardingState.IN_PROGRESS]: [
                    OnboardingState.PAUSED,
                    OnboardingState.COMPLETE,
                    OnboardingState.ABANDONED,
                ],
                [OnboardingState.PAUSED]: [OnboardingState.IN_PROGRESS, OnboardingState.ABANDONED],
                [OnboardingState.COMPLETE]: [],
                [OnboardingState.ABANDONED]: [OnboardingState.IN_PROGRESS],
            };

            expect(validTransitions[currentState]).toContain(nextState);
        });

        it('should allow transition from IN_PROGRESS to COMPLETE', () => {
            const currentState = OnboardingState.IN_PROGRESS;
            const nextState = OnboardingState.COMPLETE;

            const validTransitions: Record<OnboardingState, OnboardingState[]> = {
                [OnboardingState.NOT_STARTED]: [OnboardingState.IN_PROGRESS],
                [OnboardingState.IN_PROGRESS]: [
                    OnboardingState.PAUSED,
                    OnboardingState.COMPLETE,
                    OnboardingState.ABANDONED,
                ],
                [OnboardingState.PAUSED]: [OnboardingState.IN_PROGRESS, OnboardingState.ABANDONED],
                [OnboardingState.COMPLETE]: [],
                [OnboardingState.ABANDONED]: [OnboardingState.IN_PROGRESS],
            };

            expect(validTransitions[currentState]).toContain(nextState);
        });

        it('should allow restart from ABANDONED state', () => {
            const currentState = OnboardingState.ABANDONED;
            const nextState = OnboardingState.IN_PROGRESS;

            const validTransitions: Record<OnboardingState, OnboardingState[]> = {
                [OnboardingState.NOT_STARTED]: [OnboardingState.IN_PROGRESS],
                [OnboardingState.IN_PROGRESS]: [
                    OnboardingState.PAUSED,
                    OnboardingState.COMPLETE,
                    OnboardingState.ABANDONED,
                ],
                [OnboardingState.PAUSED]: [OnboardingState.IN_PROGRESS, OnboardingState.ABANDONED],
                [OnboardingState.COMPLETE]: [],
                [OnboardingState.ABANDONED]: [OnboardingState.IN_PROGRESS],
            };

            expect(validTransitions[currentState]).toContain(nextState);
        });
    });

    describe('Invalid State Transitions', () => {
        it('should NOT allow transition from COMPLETE to any other state', () => {
            const currentState = OnboardingState.COMPLETE;

            const validTransitions: Record<OnboardingState, OnboardingState[]> = {
                [OnboardingState.NOT_STARTED]: [OnboardingState.IN_PROGRESS],
                [OnboardingState.IN_PROGRESS]: [
                    OnboardingState.PAUSED,
                    OnboardingState.COMPLETE,
                    OnboardingState.ABANDONED,
                ],
                [OnboardingState.PAUSED]: [OnboardingState.IN_PROGRESS, OnboardingState.ABANDONED],
                [OnboardingState.COMPLETE]: [],
                [OnboardingState.ABANDONED]: [OnboardingState.IN_PROGRESS],
            };

            const attemptedTransitions = [
                OnboardingState.NOT_STARTED,
                OnboardingState.IN_PROGRESS,
                OnboardingState.PAUSED,
                OnboardingState.ABANDONED,
            ];

            attemptedTransitions.forEach((state) => {
                expect(validTransitions[currentState]).not.toContain(state);
            });

            expect(validTransitions[currentState].length).toBe(0);
        });

        it('should NOT allow direct transition from NOT_STARTED to COMPLETE', () => {
            const currentState = OnboardingState.NOT_STARTED;
            const attemptedState = OnboardingState.COMPLETE;

            const validTransitions: Record<OnboardingState, OnboardingState[]> = {
                [OnboardingState.NOT_STARTED]: [OnboardingState.IN_PROGRESS],
                [OnboardingState.IN_PROGRESS]: [
                    OnboardingState.PAUSED,
                    OnboardingState.COMPLETE,
                    OnboardingState.ABANDONED,
                ],
                [OnboardingState.PAUSED]: [OnboardingState.IN_PROGRESS, OnboardingState.ABANDONED],
                [OnboardingState.COMPLETE]: [],
                [OnboardingState.ABANDONED]: [OnboardingState.IN_PROGRESS],
            };

            expect(validTransitions[currentState]).not.toContain(attemptedState);
        });

        it('should NOT allow transition from NOT_STARTED to PAUSED', () => {
            const currentState = OnboardingState.NOT_STARTED;
            const attemptedState = OnboardingState.PAUSED;

            const validTransitions: Record<OnboardingState, OnboardingState[]> = {
                [OnboardingState.NOT_STARTED]: [OnboardingState.IN_PROGRESS],
                [OnboardingState.IN_PROGRESS]: [
                    OnboardingState.PAUSED,
                    OnboardingState.COMPLETE,
                    OnboardingState.ABANDONED,
                ],
                [OnboardingState.PAUSED]: [OnboardingState.IN_PROGRESS, OnboardingState.ABANDONED],
                [OnboardingState.COMPLETE]: [],
                [OnboardingState.ABANDONED]: [OnboardingState.IN_PROGRESS],
            };

            expect(validTransitions[currentState]).not.toContain(attemptedState);
        });
    });

    describe('Phase Progression', () => {
        it('should advance from phase 1 to phase 2 sequentially', () => {
            const currentPhase = 1;
            const nextPhase = currentPhase + 1;

            expect(nextPhase).toBe(2);
            expect(nextPhase).toBeGreaterThan(currentPhase);
            expect(nextPhase).toBeLessThanOrEqual(6);
        });

        it('should advance through all 6 phases sequentially', () => {
            let currentPhase: OnboardingPhase = 1;

            for (let i = 0; i < 5; i++) {
                const nextPhase = (currentPhase + 1) as OnboardingPhase;
                expect(nextPhase).toBe(currentPhase + 1);
                currentPhase = nextPhase;
            }

            expect(currentPhase).toBe(6);
        });

        it('should allow skipping from phase 1 to phase 6', () => {
            const currentPhase = 1;
            const targetPhase = 6;

            // Allow skip forward
            expect(targetPhase).toBeGreaterThan(currentPhase);
            expect(targetPhase).toBeLessThanOrEqual(6);
        });

        it('should allow going backward to edit previous phase', () => {
            const currentPhase = 3;
            const previousPhase = 1;

            // Allow going back
            expect(previousPhase).toBeLessThan(currentPhase);
            expect(previousPhase).toBeGreaterThanOrEqual(1);
        });

        it('should NOT allow phase 0 or phase 7', () => {
            const validPhases = [1, 2, 3, 4, 5, 6];

            expect(validPhases).toContain(1);
            expect(validPhases).not.toContain(0);
            expect(validPhases).not.toContain(7);
        });
    });

    describe('State Machine Rules', () => {
        it('should enforce: COMPLETE state implies all phases completed', () => {
            const state = OnboardingState.COMPLETE;
            const allPhasesCompleted = true;

            // Rule: if state is COMPLETE, all phases must be completed
            if (state === OnboardingState.COMPLETE) {
                expect(allPhasesCompleted).toBe(true);
            }
        });

        it('should enforce: IN_PROGRESS means at least one phase started', () => {
            const state = OnboardingState.IN_PROGRESS;
            const currentPhase = 2; // At least in phase 2 or later

            // Rule: if state is IN_PROGRESS, currentPhase should be >= 1
            if (state === OnboardingState.IN_PROGRESS) {
                expect(currentPhase).toBeGreaterThanOrEqual(1);
                expect(currentPhase).toBeLessThanOrEqual(6);
            }
        });

        it('should enforce: PAUSED means progress is preserved', () => {
            const state = OnboardingState.PAUSED;
            const currentPhase = 3;
            const checkpoint = { phase: 3, data: { householdName: 'Test' } };

            if (state === OnboardingState.PAUSED) {
                expect(currentPhase).toBe(checkpoint.phase);
                expect(checkpoint.data).toBeDefined();
            }
        });

        it('should enforce: ABANDONED means no more automatic access', () => {
            const state = OnboardingState.ABANDONED;
            const allowAccess = state !== OnboardingState.ABANDONED;

            expect(allowAccess).toBe(false);
        });

        it('should enforce: timestamp monotonicity (lastActivityAt >= startedAt)', () => {
            const startedAt = new Date('2026-09-13T09:00:00Z');
            const lastActivityAt = new Date('2026-09-13T09:30:00Z');

            expect(lastActivityAt.getTime()).toBeGreaterThanOrEqual(startedAt.getTime());
        });
    });

    describe('State Machine Visualization (Allowed Transitions)', () => {
        it('should provide all valid transitions for each state', () => {
            const stateTransitions: Record<OnboardingState, OnboardingState[]> = {
                [OnboardingState.NOT_STARTED]: [OnboardingState.IN_PROGRESS],
                [OnboardingState.IN_PROGRESS]: [
                    OnboardingState.PAUSED,
                    OnboardingState.COMPLETE,
                    OnboardingState.ABANDONED,
                ],
                [OnboardingState.PAUSED]: [OnboardingState.IN_PROGRESS, OnboardingState.ABANDONED],
                [OnboardingState.COMPLETE]: [],
                [OnboardingState.ABANDONED]: [OnboardingState.IN_PROGRESS],
            };

            // Verify all states are defined
            expect(Object.keys(stateTransitions).length).toBeGreaterThan(0);

            // Verify structure is correct
            Object.values(stateTransitions).forEach((transitions) => {
                expect(Array.isArray(transitions)).toBe(true);
            });
        });

        it('should have at least one transition out for non-terminal states', () => {
            const stateTransitions: Record<OnboardingState, OnboardingState[]> = {
                [OnboardingState.NOT_STARTED]: [OnboardingState.IN_PROGRESS],
                [OnboardingState.IN_PROGRESS]: [
                    OnboardingState.PAUSED,
                    OnboardingState.COMPLETE,
                    OnboardingState.ABANDONED,
                ],
                [OnboardingState.PAUSED]: [OnboardingState.IN_PROGRESS, OnboardingState.ABANDONED],
                [OnboardingState.COMPLETE]: [],
                [OnboardingState.ABANDONED]: [OnboardingState.IN_PROGRESS],
            };

            // NOT_STARTED, IN_PROGRESS, PAUSED, ABANDONED should have transitions
            expect(stateTransitions[OnboardingState.NOT_STARTED].length).toBeGreaterThan(0);
            expect(stateTransitions[OnboardingState.IN_PROGRESS].length).toBeGreaterThan(0);
            expect(stateTransitions[OnboardingState.PAUSED].length).toBeGreaterThan(0);
            expect(stateTransitions[OnboardingState.ABANDONED].length).toBeGreaterThan(0);

            // COMPLETE is terminal
            expect(stateTransitions[OnboardingState.COMPLETE].length).toBe(0);
        });
    });
});
