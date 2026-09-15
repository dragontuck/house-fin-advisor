/**
 * PostgreSQL implementation of IncomeDetectionRepository
 *
 * Data access layer for onboarding_income_detection table.
 * Stores results from income pattern detection during Phase 4.
 */

import { query } from '../connection';
import { EntityId } from '@house-fin/domain/types/common.types';
import { v4 as uuidv4 } from 'uuid';

export interface DetectedIncome {
    monthlyGrossCents: number;
    annualGrossCents: number;
    monthlyNetCents?: number;
    frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'IRREGULAR';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    detectionMethod: string;
}

export interface IncomeDetectionRecord {
    id: EntityId;
    onboardingId: EntityId;
    householdId: EntityId;
    detectedIncome: DetectedIncome;
    detectedAt: Date;
}

type DbRow = Record<string, unknown>;

export interface IIncomeDetectionRepository {
    saveDetection(
        onboardingId: EntityId,
        householdId: EntityId,
        detection: DetectedIncome
    ): Promise<IncomeDetectionRecord>;

    getLatest(householdId: EntityId): Promise<IncomeDetectionRecord | null>;

    getByOnboarding(onboardingId: EntityId): Promise<IncomeDetectionRecord | null>;
}

export class PgIncomeDetectionRepository implements IIncomeDetectionRepository {
    async saveDetection(
        onboardingId: EntityId,
        householdId: EntityId,
        detection: DetectedIncome
    ): Promise<IncomeDetectionRecord> {
        const id = uuidv4() as EntityId;
        const now = new Date();

        const result = await query(
            `INSERT INTO finhouse.onboarding_income_detection
             (id, onboarding_id, household_id, detected_income, detected_at)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [id, onboardingId, householdId, JSON.stringify(detection), now]
        );

        return this.rowToRecord(result.rows[0]);
    }

    async getLatest(householdId: EntityId): Promise<IncomeDetectionRecord | null> {
        const result = await query(
            `SELECT * FROM finhouse.onboarding_income_detection
             WHERE household_id = $1
             ORDER BY detected_at DESC
             LIMIT 1`,
            [householdId]
        );

        if (result.rows.length === 0) return null;
        return this.rowToRecord(result.rows[0]);
    }

    async getByOnboarding(onboardingId: EntityId): Promise<IncomeDetectionRecord | null> {
        const result = await query(
            `SELECT * FROM finhouse.onboarding_income_detection
             WHERE onboarding_id = $1`,
            [onboardingId]
        );

        if (result.rows.length === 0) return null;
        return this.rowToRecord(result.rows[0]);
    }

    private rowToRecord(row: DbRow): IncomeDetectionRecord {
        return {
            id: row.id as EntityId,
            onboardingId: row.onboarding_id as EntityId,
            householdId: row.household_id as EntityId,
            detectedIncome: JSON.parse(row.detected_income as string) as DetectedIncome,
            detectedAt: new Date(row.detected_at as string),
        };
    }
}
