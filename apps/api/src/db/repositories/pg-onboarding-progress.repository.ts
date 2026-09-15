/**
 * PostgreSQL implementation of OnboardingProgressRepository
 *
 * Data access layer for onboarding_progress table.
 * Handles CRUD operations and state transitions for household onboarding.
 */

import { query, getClient } from '../connection';
import {
    OnboardingProgress,
    OnboardingPhase,
    OnboardingState,
    SetupPhaseData,
    AccountsPhaseData,
    StatementsPhaseData,
    FinancialContextPhaseData,
    ProfilePhaseData,
    LaunchPhaseData,
} from '@house-fin/domain/types/onboarding.types';
import { EntityId } from '@house-fin/domain/types/common.types';

type DbRow = Record<string, unknown>;

export interface IOnboardingProgressRepository {
    start(householdId: EntityId, userId: EntityId, householdName: string): Promise<OnboardingProgress>;
    getByHouseholdId(householdId: EntityId): Promise<OnboardingProgress | null>;
    completePhase(
        householdId: EntityId,
        phaseNumber: OnboardingPhase,
        data: SetupPhaseData | AccountsPhaseData | StatementsPhaseData | FinancialContextPhaseData | ProfilePhaseData | LaunchPhaseData,
        userId: EntityId
    ): Promise<OnboardingProgress>;
    skipPhase(householdId: EntityId, targetPhase: OnboardingPhase, userId: EntityId): Promise<OnboardingProgress>;
    savePhaseData(
        householdId: EntityId,
        phaseNumber: OnboardingPhase,
        data: Record<string, unknown>,
        userId: EntityId
    ): Promise<OnboardingProgress>;
    launch(householdId: EntityId, launchData: LaunchPhaseData, userId: EntityId): Promise<OnboardingProgress>;
    restart(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress>;
    getByStatus(status: OnboardingState, limit?: number): Promise<OnboardingProgress[]>;
    getAverageTimeToComplete(): Promise<number>;
    getCompletionRate(): Promise<number>;
    getPhaseDropoffRates(): Promise<Record<OnboardingPhase, number>>;
    updateLastActivity(householdId: EntityId): Promise<void>;
    getByStartDate(fromDate: Date, toDate: Date): Promise<OnboardingProgress[]>;
}

export class PgOnboardingProgressRepository implements IOnboardingProgressRepository {
    async start(
        householdId: EntityId,
        userId: EntityId,
        householdName: string
    ): Promise<OnboardingProgress> {
        const result = await query(
            `INSERT INTO finhouse.onboarding_progress
             (household_id, current_phase, current_state, phases, started_at, last_activity_at,
              completed_at, total_time_minutes, last_checkpoint, created_by, updated_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [
                householdId,
                1, // Start at phase 1
                OnboardingState.IN_PROGRESS,
                JSON.stringify({
                    1: { completed: false, completedAt: null, data: null },
                    2: { completed: false, completedAt: null, data: null },
                    3: { completed: false, completedAt: null, data: null },
                    4: { completed: false, completedAt: null, data: null },
                    5: { completed: false, completedAt: null, data: null },
                    6: { completed: false, completedAt: null, data: null },
                }),
                new Date(),
                new Date(),
                null, // not completed yet
                0,
                null,
                userId,
                userId,
                new Date(),
                new Date(),
            ]
        );

        return this.rowToOnboardingProgress(result.rows[0]);
    }

    async getByHouseholdId(householdId: EntityId): Promise<OnboardingProgress | null> {
        const result = await query(
            `SELECT * FROM finhouse.onboarding_progress WHERE household_id = $1`,
            [householdId]
        );

        if (result.rows.length === 0) return null;
        return this.rowToOnboardingProgress(result.rows[0]);
    }

    async completePhase(
        householdId: EntityId,
        phaseNumber: OnboardingPhase,
        data: SetupPhaseData | AccountsPhaseData | StatementsPhaseData | FinancialContextPhaseData | ProfilePhaseData | LaunchPhaseData,
        userId: EntityId
    ): Promise<OnboardingProgress> {
        const progress = await this.getByHouseholdId(householdId);
        if (!progress) {
            throw new Error(`Onboarding not found for household ${householdId}`);
        }

        // Update phase data
        const phases = progress.phases as Record<OnboardingPhase, any>;
        phases[phaseNumber].completed = true;
        phases[phaseNumber].completedAt = new Date();
        phases[phaseNumber].data = data;

        // Determine next phase and state
        let nextPhase = progress.currentPhase;
        let nextState = progress.currentState;

        if (phaseNumber === progress.currentPhase && phaseNumber < 6) {
            nextPhase = (phaseNumber + 1) as OnboardingPhase;
            nextState = OnboardingState.IN_PROGRESS;
        }

        // Check if all phases complete
        let completedAt: Date | null = null;
        let totalTimeMinutes = 0;
        if (
            phases[1].completed &&
            phases[2].completed &&
            phases[3].completed &&
            phases[4].completed &&
            phases[5].completed &&
            phases[6].completed
        ) {
            nextState = OnboardingState.COMPLETE;
            completedAt = new Date();
            totalTimeMinutes = Math.floor(
                (completedAt.getTime() - progress.startedAt.getTime()) / 60000
            );
        }

        const result = await query(
            `UPDATE finhouse.onboarding_progress
             SET current_phase = $1, current_state = $2, phases = $3, last_activity_at = $4,
                 completed_at = $5, total_time_minutes = $6, updated_by = $7, updated_at = $8
             WHERE household_id = $9
             RETURNING *`,
            [
                nextPhase,
                nextState,
                JSON.stringify(phases),
                new Date(),
                completedAt,
                totalTimeMinutes,
                userId,
                new Date(),
                householdId,
            ]
        );

        return this.rowToOnboardingProgress(result.rows[0]);
    }

    async skipPhase(
        householdId: EntityId,
        targetPhase: OnboardingPhase,
        userId: EntityId
    ): Promise<OnboardingProgress> {
        if (targetPhase < 1 || targetPhase > 6) {
            throw new Error('Invalid phase number');
        }

        const result = await query(
            `UPDATE finhouse.onboarding_progress
             SET current_phase = $1, last_activity_at = $2, updated_by = $3, updated_at = $4
             WHERE household_id = $5
             RETURNING *`,
            [targetPhase, new Date(), userId, new Date(), householdId]
        );

        if (result.rows.length === 0) {
            throw new Error(`Onboarding not found for household ${householdId}`);
        }

        return this.rowToOnboardingProgress(result.rows[0]);
    }

    async savePhaseData(
        householdId: EntityId,
        phaseNumber: OnboardingPhase,
        data: Record<string, unknown>,
        userId: EntityId
    ): Promise<OnboardingProgress> {
        const progress = await this.getByHouseholdId(householdId);
        if (!progress) {
            throw new Error(`Onboarding not found for household ${householdId}`);
        }

        const phases = progress.phases as Record<OnboardingPhase, any>;
        phases[phaseNumber].data = data;

        const result = await query(
            `UPDATE finhouse.onboarding_progress
             SET phases = $1, last_activity_at = $2, updated_by = $3, updated_at = $4
             WHERE household_id = $5
             RETURNING *`,
            [JSON.stringify(phases), new Date(), userId, new Date(), householdId]
        );

        return this.rowToOnboardingProgress(result.rows[0]);
    }

    async launch(
        householdId: EntityId,
        launchData: LaunchPhaseData,
        userId: EntityId
    ): Promise<OnboardingProgress> {
        const completedAt = new Date();
        const progress = await this.getByHouseholdId(householdId);
        if (!progress) {
            throw new Error(`Onboarding not found for household ${householdId}`);
        }

        const totalTimeMinutes = Math.floor(
            (completedAt.getTime() - progress.startedAt.getTime()) / 60000
        );

        const result = await query(
            `UPDATE finhouse.onboarding_progress
             SET current_phase = 6, current_state = $1, completed_at = $2, 
                 total_time_minutes = $3, updated_by = $4, updated_at = $5
             WHERE household_id = $6
             RETURNING *`,
            [
                OnboardingState.COMPLETE,
                completedAt,
                totalTimeMinutes,
                userId,
                new Date(),
                householdId,
            ]
        );

        return this.rowToOnboardingProgress(result.rows[0]);
    }

    async restart(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress> {
        const now = new Date();
        const emptyPhases = {
            1: { completed: false, completedAt: null, data: null },
            2: { completed: false, completedAt: null, data: null },
            3: { completed: false, completedAt: null, data: null },
            4: { completed: false, completedAt: null, data: null },
            5: { completed: false, completedAt: null, data: null },
            6: { completed: false, completedAt: null, data: null },
        };

        const result = await query(
            `UPDATE finhouse.onboarding_progress
             SET current_phase = 1, current_state = $1, phases = $2, started_at = $3,
                 last_activity_at = $4, completed_at = NULL, total_time_minutes = 0,
                 updated_by = $5, updated_at = $6
             WHERE household_id = $7
             RETURNING *`,
            [
                OnboardingState.IN_PROGRESS,
                JSON.stringify(emptyPhases),
                now,
                now,
                userId,
                now,
                householdId,
            ]
        );

        if (result.rows.length === 0) {
            throw new Error(`Onboarding not found for household ${householdId}`);
        }

        return this.rowToOnboardingProgress(result.rows[0]);
    }

    async getByStatus(
        status: OnboardingState,
        limit: number = 100
    ): Promise<OnboardingProgress[]> {
        const result = await query(
            `SELECT * FROM finhouse.onboarding_progress 
             WHERE current_state = $1
             ORDER BY started_at DESC
             LIMIT $2`,
            [status, limit]
        );

        return result.rows.map((row) => this.rowToOnboardingProgress(row));
    }

    async getAverageTimeToComplete(): Promise<number> {
        const result = await query(
            `SELECT AVG(total_time_minutes) as avg_minutes
             FROM finhouse.onboarding_progress
             WHERE completed_at IS NOT NULL`
        );

        const avgMinutes = result.rows[0]?.avg_minutes;
        return avgMinutes ? Math.round(Number(avgMinutes)) : 0;
    }

    async getCompletionRate(): Promise<number> {
        const result = await query(
            `SELECT 
               COUNT(*) FILTER (WHERE completed_at IS NOT NULL) as completed,
               COUNT(*) as total
             FROM finhouse.onboarding_progress`
        );

        const { completed, total } = result.rows[0];
        if (total === 0) return 0;
        return Math.round((Number(completed) / Number(total)) * 100);
    }

    async getPhaseDropoffRates(): Promise<Record<OnboardingPhase, number>> {
        const result = await query(
            `SELECT 
               COUNT(*) as total_started
             FROM finhouse.onboarding_progress`
        );

        const totalStarted = Number(result.rows[0]?.total_started || 0);
        if (totalStarted === 0) return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

        const rates: Record<OnboardingPhase, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

        for (let phase = 1; phase <= 6; phase++) {
            const phaseResult = await query(
                `SELECT COUNT(*) as completed_count
                 FROM finhouse.onboarding_progress
                 WHERE phases->'${phase}'->>'completed' = 'true'`
            );

            const completedCount = Number(phaseResult.rows[0]?.completed_count || 0);
            rates[phase as OnboardingPhase] = Math.round(
                (completedCount / totalStarted) * 100
            );
        }

        return rates;
    }

    async updateLastActivity(householdId: EntityId): Promise<void> {
        await query(
            `UPDATE finhouse.onboarding_progress
             SET last_activity_at = $1, updated_at = $2
             WHERE household_id = $3`,
            [new Date(), new Date(), householdId]
        );
    }

    async getByStartDate(fromDate: Date, toDate: Date): Promise<OnboardingProgress[]> {
        const result = await query(
            `SELECT * FROM finhouse.onboarding_progress
             WHERE started_at BETWEEN $1 AND $2
             ORDER BY started_at DESC`,
            [fromDate, toDate]
        );

        return result.rows.map((row) => this.rowToOnboardingProgress(row));
    }

    private rowToOnboardingProgress(row: DbRow): OnboardingProgress {
        return {
            id: row.id as EntityId,
            householdId: row.household_id as EntityId,
            currentPhase: row.current_phase as OnboardingPhase,
            currentState: row.current_state as OnboardingState,
            phases: JSON.parse(row.phases as string) as Record<OnboardingPhase, any>,
            startedAt: new Date(row.started_at as string),
            lastActivityAt: new Date(row.last_activity_at as string),
            completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
            totalTimeMinutes: row.total_time_minutes as number,
            lastCheckpoint: row.last_checkpoint as EntityId | null,
            createdBy: row.created_by as EntityId,
            updatedBy: row.updated_by as EntityId,
            createdAt: new Date(row.created_at as string),
            updatedAt: new Date(row.updated_at as string),
        };
    }
}
