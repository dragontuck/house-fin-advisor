/**
 * Onboarding Checkpoint Repository
 * 
 * Data access layer for onboarding_checkpoints table.
 * Handles pause/resume functionality via session-based checkpoints.
 * 
 * **Implementation Note**: Methods are stub signatures.
 * Implementation will be completed in Phase 2.
 */

import { OnboardingSessionCheckpoint, OnboardingPhase } from '../../domain/types/onboarding.types';
import { EntityId } from '../../domain/types/common.types';

export interface IOnboardingCheckpointRepository {
    /**
     * Save a checkpoint of current phase data
     */
    saveCheckpoint(
        householdId: EntityId,
        sessionId: string,
        phase: OnboardingPhase,
        checkpointData: Record<string, unknown>
    ): Promise<OnboardingSessionCheckpoint>;

    /**
     * Get the most recent checkpoint for a household session
     */
    getLatestCheckpoint(householdId: EntityId, sessionId: string): Promise<OnboardingSessionCheckpoint | null>;

    /**
     * Get all checkpoints for a household session in chronological order
     */
    getCheckpointHistory(householdId: EntityId, sessionId: string): Promise<OnboardingSessionCheckpoint[]>;

    /**
     * Delete checkpoints older than N days, return count deleted
     */
    cleanupOlderThan(days: number): Promise<number>;

    /**
     * Get checkpoints for a household across all sessions
     */
    getByHouseholdId(householdId: EntityId): Promise<OnboardingSessionCheckpoint[]>;

    /**
     * Get checkpoints for a specific phase
     */
    getByPhase(householdId: EntityId, phase: OnboardingPhase): Promise<OnboardingSessionCheckpoint[]>;

    /**
     * Delete a specific checkpoint
     */
    delete(checkpointId: EntityId): Promise<boolean>;

    /**
     * Get total count of checkpoints for a household
     */
    countByHousehold(householdId: EntityId): Promise<number>;
}

export class OnboardingCheckpointRepository implements IOnboardingCheckpointRepository {
    constructor(private db: any) { }

    async saveCheckpoint(
        householdId: EntityId,
        sessionId: string,
        phase: OnboardingPhase,
        checkpointData: Record<string, unknown>
    ): Promise<OnboardingSessionCheckpoint> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getLatestCheckpoint(householdId: EntityId, sessionId: string): Promise<OnboardingSessionCheckpoint | null> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getCheckpointHistory(householdId: EntityId, sessionId: string): Promise<OnboardingSessionCheckpoint[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async cleanupOlderThan(days: number): Promise<number> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getByHouseholdId(householdId: EntityId): Promise<OnboardingSessionCheckpoint[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getByPhase(householdId: EntityId, phase: OnboardingPhase): Promise<OnboardingSessionCheckpoint[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async delete(checkpointId: EntityId): Promise<boolean> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async countByHousehold(householdId: EntityId): Promise<number> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }
}
