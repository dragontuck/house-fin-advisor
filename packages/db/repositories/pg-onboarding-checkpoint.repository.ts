/**
 * PostgreSQL implementation of OnboardingCheckpointRepository
 *
 * Data access layer for onboarding_checkpoints table.
 * Handles saving and restoring onboarding progress checkpoints for resume functionality.
 */

import { query } from '../connection';
import {
    OnboardingSessionCheckpoint,
    OnboardingPhase,
} from '../../domain/types/onboarding.types';
import { EntityId } from '../../domain/types/common.types';
import { v4 as uuidv4 } from 'uuid';

type DbRow = Record<string, unknown>;

export interface IOnboardingCheckpointRepository {
    saveCheckpoint(
        householdId: EntityId,
        sessionId: string,
        phase: OnboardingPhase,
        checkpointData: Record<string, unknown>
    ): Promise<OnboardingSessionCheckpoint>;
    
    getLatestCheckpoint(
        householdId: EntityId,
        sessionId: string
    ): Promise<OnboardingSessionCheckpoint | null>;
    
    getCheckpointHistory(
        householdId: EntityId,
        sessionId: string
    ): Promise<OnboardingSessionCheckpoint[]>;
    
    cleanupOlderThan(days: number): Promise<number>;
}

export class PgOnboardingCheckpointRepository implements IOnboardingCheckpointRepository {
    async saveCheckpoint(
        householdId: EntityId,
        sessionId: string,
        phase: OnboardingPhase,
        checkpointData: Record<string, unknown>
    ): Promise<OnboardingSessionCheckpoint> {
        const id = uuidv4() as EntityId;
        const now = new Date();

        const result = await query(
            `INSERT INTO finhouse.onboarding_checkpoints
             (id, household_id, session_id, phase, checkpoint_data, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [id, householdId, sessionId, phase, JSON.stringify(checkpointData), now]
        );

        return this.rowToCheckpoint(result.rows[0]);
    }

    async getLatestCheckpoint(
        householdId: EntityId,
        sessionId: string
    ): Promise<OnboardingSessionCheckpoint | null> {
        const result = await query(
            `SELECT * FROM finhouse.onboarding_checkpoints
             WHERE household_id = $1 AND session_id = $2
             ORDER BY created_at DESC
             LIMIT 1`,
            [householdId, sessionId]
        );

        if (result.rows.length === 0) return null;
        return this.rowToCheckpoint(result.rows[0]);
    }

    async getCheckpointHistory(
        householdId: EntityId,
        sessionId: string
    ): Promise<OnboardingSessionCheckpoint[]> {
        const result = await query(
            `SELECT * FROM finhouse.onboarding_checkpoints
             WHERE household_id = $1 AND session_id = $2
             ORDER BY created_at ASC`,
            [householdId, sessionId]
        );

        return result.rows.map((row) => this.rowToCheckpoint(row));
    }

    async cleanupOlderThan(days: number): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const result = await query(
            `DELETE FROM finhouse.onboarding_checkpoints
             WHERE created_at < $1`,
            [cutoffDate]
        );

        return result.rowCount || 0;
    }

    private rowToCheckpoint(row: DbRow): OnboardingSessionCheckpoint {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            sessionId: row.session_id as string,
            phase: row.phase as OnboardingPhase,
            checkpointData: JSON.parse(row.checkpoint_data as string) as Record<string, unknown>,
            createdAt: new Date(row.created_at as string),
        };
    }
}
