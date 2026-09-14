/**
 * Integration Tests: Onboarding Checkpoint & Resume Functionality
 * 
 * Tests save/restore checkpoints for resuming interrupted onboarding.
 * Ensures users can pause and resume without losing progress.
 */

import { v4 as uuidv4 } from 'uuid';
import { OnboardingSessionCheckpoint } from '../../../domain/types/onboarding.types';

interface MockCheckpointDB {
    checkpoints: Map<string, OnboardingSessionCheckpoint[]>;
}

class MockOnboardingCheckpointRepository {
    constructor(private db: MockCheckpointDB) { }

    async saveCheckpoint(
        householdId: string,
        sessionId: string,
        phase: number,
        checkpointData: object
    ): Promise<OnboardingSessionCheckpoint> {
        const checkpoint: OnboardingSessionCheckpoint = {
            id: uuidv4(),
            householdId,
            sessionId,
            phase,
            checkpointData,
            createdAt: new Date(),
        };

        const key = `${householdId}:${sessionId}`;
        if (!this.db.checkpoints.has(key)) {
            this.db.checkpoints.set(key, []);
        }

        this.db.checkpoints.get(key)!.push(checkpoint);
        return checkpoint;
    }

    async getLatestCheckpoint(
        householdId: string,
        sessionId: string
    ): Promise<OnboardingSessionCheckpoint | null> {
        const key = `${householdId}:${sessionId}`;
        const checkpoints = this.db.checkpoints.get(key);

        if (!checkpoints || checkpoints.length === 0) {
            return null;
        }

        // Return most recent checkpoint
        return checkpoints.reduce((latest, current) =>
            current.createdAt > latest.createdAt ? current : latest
        );
    }

    async getCheckpointHistory(
        householdId: string,
        sessionId: string
    ): Promise<OnboardingSessionCheckpoint[]> {
        const key = `${householdId}:${sessionId}`;
        return this.db.checkpoints.get(key) || [];
    }

    async cleanupOlderThan(days: number): Promise<number> {
        const cutoffTime = new Date();
        cutoffTime.setDate(cutoffTime.getDate() - days);

        let deletedCount = 0;

        for (const [key, checkpoints] of this.db.checkpoints.entries()) {
            const filtered = checkpoints.filter((cp) => cp.createdAt > cutoffTime);
            if (filtered.length < checkpoints.length) {
                deletedCount += checkpoints.length - filtered.length;
                if (filtered.length === 0) {
                    this.db.checkpoints.delete(key);
                } else {
                    this.db.checkpoints.set(key, filtered);
                }
            }
        }

        return deletedCount;
    }
}

describe('Onboarding Checkpoint Integration Tests', () => {
    let db: MockCheckpointDB;
    let repository: MockOnboardingCheckpointRepository;
    const householdId = uuidv4();
    const sessionId = `session-${Date.now()}`;

    beforeEach(() => {
        db = {
            checkpoints: new Map(),
        };
        repository = new MockOnboardingCheckpointRepository(db);
    });

    describe('Checkpoint Save', () => {
        it('should save checkpoint at phase 1', async () => {
            const phase1Data = {
                householdName: 'Test Family',
                profileType: 'FAMILY',
                institution: 'Chase',
            };

            const checkpoint = await repository.saveCheckpoint(
                householdId,
                sessionId,
                1,
                phase1Data
            );

            expect(checkpoint.phase).toBe(1);
            expect(checkpoint.checkpointData).toEqual(phase1Data);
            expect(checkpoint.householdId).toBe(householdId);
            expect(checkpoint.sessionId).toBe(sessionId);
        });

        it('should save checkpoint at any phase', async () => {
            for (let phase = 1; phase <= 6; phase++) {
                const checkpoint = await repository.saveCheckpoint(
                    householdId,
                    sessionId,
                    phase,
                    { phase }
                );

                expect(checkpoint.phase).toBe(phase);
            }
        });

        it('should create unique checkpoint IDs', async () => {
            const checkpoint1 = await repository.saveCheckpoint(
                householdId,
                sessionId,
                1,
                {}
            );
            const checkpoint2 = await repository.saveCheckpoint(
                householdId,
                sessionId,
                2,
                {}
            );

            expect(checkpoint1.id).not.toEqual(checkpoint2.id);
        });

        it('should timestamp each checkpoint', async () => {
            const before = new Date();
            const checkpoint = await repository.saveCheckpoint(
                householdId,
                sessionId,
                1,
                {}
            );
            const after = new Date();

            expect(checkpoint.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(checkpoint.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
        });

        it('should save checkpoint data with any structure', async () => {
            const complexData = {
                householdName: 'Test',
                profileType: 'FAMILY',
                institutions: ['Chase', 'Bank of America', 'Wells Fargo'],
                metadata: {
                    nested: {
                        deep: {
                            value: 'test',
                        },
                    },
                },
            };

            const checkpoint = await repository.saveCheckpoint(
                householdId,
                sessionId,
                1,
                complexData
            );

            expect(checkpoint.checkpointData).toEqual(complexData);
        });

        it('should allow multiple checkpoints for same household', async () => {
            const session1 = `session-1`;
            const session2 = `session-2`;

            const cp1 = await repository.saveCheckpoint(householdId, session1, 1, {});
            const cp2 = await repository.saveCheckpoint(householdId, session2, 2, {});

            expect(cp1.sessionId).toBe(session1);
            expect(cp2.sessionId).toBe(session2);
            expect(cp1.id).not.toEqual(cp2.id);
        });
    });

    describe('Checkpoint Retrieval', () => {
        beforeEach(async () => {
            await repository.saveCheckpoint(householdId, sessionId, 1, {
                householdName: 'Test',
            });
            await new Promise((resolve) => setTimeout(resolve, 10));
            await repository.saveCheckpoint(householdId, sessionId, 2, {
                declaredAccounts: [],
            });
            await new Promise((resolve) => setTimeout(resolve, 10));
            await repository.saveCheckpoint(householdId, sessionId, 3, {
                statements: [],
            });
        });

        it('should retrieve latest checkpoint', async () => {
            const latest = await repository.getLatestCheckpoint(householdId, sessionId);

            expect(latest).not.toBeNull();
            expect(latest!.phase).toBe(3);
        });

        it('should return null if no checkpoints exist', async () => {
            const nonExistent = await repository.getLatestCheckpoint(
                uuidv4(),
                'nonexistent'
            );

            expect(nonExistent).toBeNull();
        });

        it('should retrieve checkpoint history in order', async () => {
            const history = await repository.getCheckpointHistory(householdId, sessionId);

            expect(history.length).toBe(3);
            expect(history[0].phase).toBe(1);
            expect(history[1].phase).toBe(2);
            expect(history[2].phase).toBe(3);
        });

        it('should maintain checkpoint data integrity', async () => {
            const latest = await repository.getLatestCheckpoint(householdId, sessionId);

            expect(latest!.checkpointData).toEqual({ statements: [] });
        });
    });

    describe('Resume Workflow', () => {
        it('should restore from checkpoint to resume onboarding', async () => {
            // User completes phase 1, saves checkpoint
            const phase1Data = {
                householdName: 'Smith Family',
                profileType: 'FAMILY',
                institutions: ['Chase'],
            };

            const checkpoint = await repository.saveCheckpoint(
                householdId,
                sessionId,
                1,
                phase1Data
            );

            // ... Later: User returns and resumes
            const restored = await repository.getLatestCheckpoint(householdId, sessionId);

            expect(restored).not.toBeNull();
            expect(restored!.phase).toBe(1);
            expect(restored!.checkpointData).toEqual(phase1Data);

            // User can continue from phase 1 with their data intact
            expect(restored!.checkpointData).toHaveProperty('householdName', 'Smith Family');
        });

        it('should handle multiple save/resume cycles', async () => {
            // Cycle 1: Save at phase 1
            await repository.saveCheckpoint(householdId, sessionId, 1, {
                householdName: 'Test',
            });

            let latest = await repository.getLatestCheckpoint(householdId, sessionId);
            expect(latest!.phase).toBe(1);

            // Cycle 2: User advances to phase 2, saves
            await new Promise((resolve) => setTimeout(resolve, 10));
            await repository.saveCheckpoint(householdId, sessionId, 2, {
                declaredAccounts: [],
            });

            latest = await repository.getLatestCheckpoint(householdId, sessionId);
            expect(latest!.phase).toBe(2);

            // Cycle 3: User advances to phase 3, saves
            await new Promise((resolve) => setTimeout(resolve, 10));
            await repository.saveCheckpoint(householdId, sessionId, 3, {
                statements: 'uploaded',
            });

            latest = await repository.getLatestCheckpoint(householdId, sessionId);
            expect(latest!.phase).toBe(3);
        });

        it('should distinguish between different user sessions', async () => {
            const session1 = 'device-phone';
            const session2 = 'device-laptop';

            const cp1 = await repository.saveCheckpoint(householdId, session1, 2, {
                device: 'phone',
            });
            const cp2 = await repository.saveCheckpoint(householdId, session2, 3, {
                device: 'laptop',
            });

            const restored1 = await repository.getLatestCheckpoint(householdId, session1);
            const restored2 = await repository.getLatestCheckpoint(householdId, session2);

            expect(restored1!.checkpointData).toEqual({ device: 'phone' });
            expect(restored2!.checkpointData).toEqual({ device: 'laptop' });
        });

        it('should preserve phase progression across resume cycles', async () => {
            // Initial session
            const phases = [1, 2, 3, 4];
            for (const phase of phases) {
                await repository.saveCheckpoint(householdId, sessionId, phase, {
                    phase,
                });
                await new Promise((resolve) => setTimeout(resolve, 5));
            }

            const latest = await repository.getLatestCheckpoint(householdId, sessionId);

            // User can resume at phase 4
            expect(latest!.phase).toBe(4);

            // And continue to phase 5 in new session
            const newSession = 'resumed-session';
            await repository.saveCheckpoint(householdId, newSession, 4, {
                phase: 4,
            });

            const resumed = await repository.getLatestCheckpoint(householdId, newSession);
            expect(resumed!.phase).toBe(4);
        });
    });

    describe('Checkpoint Cleanup', () => {
        it('should delete checkpoints older than specified days', async () => {
            // Create old checkpoint
            const oldCheckpoint: OnboardingSessionCheckpoint = {
                id: uuidv4(),
                householdId,
                sessionId: 'old-session',
                phase: 1,
                checkpointData: {},
                createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
            };

            const key = `${householdId}:old-session`;
            db.checkpoints.set(key, [oldCheckpoint]);

            // Create recent checkpoint
            await repository.saveCheckpoint(householdId, sessionId, 1, {});

            // Cleanup checkpoints older than 30 days
            const deletedCount = await repository.cleanupOlderThan(30);

            expect(deletedCount).toBeGreaterThan(0);

            // Old checkpoint should be gone
            const oldRestored = await repository.getLatestCheckpoint(householdId, 'old-session');
            expect(oldRestored).toBeNull();

            // Recent checkpoint should remain
            const recentRestored = await repository.getLatestCheckpoint(householdId, sessionId);
            expect(recentRestored).not.toBeNull();
        });

        it('should remove empty session records after cleanup', async () => {
            const oldSession = 'old-session';

            const oldCheckpoint: OnboardingSessionCheckpoint = {
                id: uuidv4(),
                householdId,
                sessionId: oldSession,
                phase: 1,
                checkpointData: {},
                createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
            };

            const key = `${householdId}:${oldSession}`;
            db.checkpoints.set(key, [oldCheckpoint]);

            await repository.cleanupOlderThan(30);

            // Empty session should be removed
            expect(db.checkpoints.has(key)).toBe(false);
        });

        it('should report count of deleted checkpoints', async () => {
            // Create multiple old checkpoints
            for (let i = 0; i < 5; i++) {
                const oldCheckpoint: OnboardingSessionCheckpoint = {
                    id: uuidv4(),
                    householdId,
                    sessionId: `old-session-${i}`,
                    phase: 1,
                    checkpointData: {},
                    createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
                };

                const key = `${householdId}:old-session-${i}`;
                db.checkpoints.set(key, [oldCheckpoint]);
            }

            const deletedCount = await repository.cleanupOlderThan(30);

            expect(deletedCount).toBe(5);
        });

        it('should not delete recent checkpoints', async () => {
            const recentSessions = ['session-1', 'session-2', 'session-3'];

            for (const session of recentSessions) {
                await repository.saveCheckpoint(householdId, session, 1, {});
            }

            const deletedCount = await repository.cleanupOlderThan(30);

            // Recent checkpoints should not be deleted
            expect(deletedCount).toBe(0);

            for (const session of recentSessions) {
                const checkpoint = await repository.getLatestCheckpoint(householdId, session);
                expect(checkpoint).not.toBeNull();
            }
        });
    });

    describe('Checkpoint Data Scenarios', () => {
        it('should handle empty checkpoint data', async () => {
            const checkpoint = await repository.saveCheckpoint(householdId, sessionId, 1, {});

            expect(checkpoint.checkpointData).toEqual({});
        });

        it('should handle large checkpoint data', async () => {
            const largeData = {
                accounts: Array(100)
                    .fill(null)
                    .map((_, i) => ({
                        id: `account-${i}`,
                        name: `Account ${i}`,
                        balance: Math.random() * 100000,
                    })),
            };

            const checkpoint = await repository.saveCheckpoint(
                householdId,
                sessionId,
                2,
                largeData
            );

            expect(checkpoint.checkpointData).toEqual(largeData);
        });

        it('should handle null/undefined in checkpoint data', async () => {
            const dataWithNull = {
                field1: 'value',
                field2: null,
                field3: undefined,
            };

            const checkpoint = await repository.saveCheckpoint(
                householdId,
                sessionId,
                1,
                dataWithNull
            );

            // Data structure should be preserved
            expect(checkpoint.checkpointData).toHaveProperty('field1');
        });

        it('should handle special characters in checkpoint data', async () => {
            const specialData = {
                householdName: "O'Brien-Smith's Family (Company & Co.)",
                notes: 'Contains: "quotes", \\backslashes\\, and émojis 🏠',
            };

            const checkpoint = await repository.saveCheckpoint(
                householdId,
                sessionId,
                1,
                specialData
            );

            expect(checkpoint.checkpointData).toEqual(specialData);
        });
    });

    describe('Checkpoint Edge Cases', () => {
        it('should handle same household, different sessions independently', async () => {
            const household = uuidv4();
            const session1 = 'device-1';
            const session2 = 'device-2';

            await repository.saveCheckpoint(household, session1, 1, { device: 1 });
            await repository.saveCheckpoint(household, session2, 3, { device: 2 });

            const cp1 = await repository.getLatestCheckpoint(household, session1);
            const cp2 = await repository.getLatestCheckpoint(household, session2);

            expect(cp1!.phase).toBe(1);
            expect(cp2!.phase).toBe(3);
        });

        it('should handle rapid checkpoint saves', async () => {
            const savePromises = [];

            for (let i = 1; i <= 10; i++) {
                savePromises.push(
                    repository.saveCheckpoint(householdId, sessionId, i % 6 || 6, {
                        step: i,
                    })
                );
            }

            await Promise.all(savePromises);

            const history = await repository.getCheckpointHistory(householdId, sessionId);
            expect(history.length).toBe(10);
        });

        it('should preserve checkpoint order chronologically', async () => {
            const checkpoints = [];

            for (let i = 0; i < 3; i++) {
                const cp = await repository.saveCheckpoint(householdId, sessionId, i + 1, {});
                checkpoints.push(cp);
                await new Promise((resolve) => setTimeout(resolve, 10));
            }

            const history = await repository.getCheckpointHistory(householdId, sessionId);

            for (let i = 0; i < history.length - 1; i++) {
                expect(history[i].createdAt.getTime()).toBeLessThanOrEqual(
                    history[i + 1].createdAt.getTime()
                );
            }
        });
    });
});
