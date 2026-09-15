/**
 * PostgreSQL implementation of ExpenseDetectionRepository
 *
 * Data access layer for onboarding_expense_detection table.
 * Stores results from expense pattern detection during Phase 4.
 */

import { query } from '../connection';
import { EntityId } from '@house-fin/domain/types/common.types';
import { v4 as uuidv4 } from 'uuid';

export type ExpenseCategory =
    | 'Groceries'
    | 'Utilities'
    | 'Transportation'
    | 'Entertainment'
    | 'Dining Out'
    | 'Healthcare'
    | 'Insurance'
    | 'Shopping'
    | 'Other';

export interface DetectedExpensesByCategory {
    [category: string]: {
        monthlyAverageCents: number;
        confidence: 'HIGH' | 'MEDIUM' | 'LOW';
        transactionCount: number;
        transactionSamples: Array<{ merchant: string; amount: number }>;
    };
}

export interface ExpenseDetectionRecord {
    id: EntityId;
    onboardingId: EntityId;
    householdId: EntityId;
    expenses: DetectedExpensesByCategory;
    totalMonthlyExpensesCents: number;
    detectedAt: Date;
}

type DbRow = Record<string, unknown>;

export interface IExpenseDetectionRepository {
    saveDetection(
        onboardingId: EntityId,
        householdId: EntityId,
        expenses: DetectedExpensesByCategory,
        totalMonthlyExpensesCents: number
    ): Promise<ExpenseDetectionRecord>;

    getLatest(householdId: EntityId): Promise<ExpenseDetectionRecord | null>;

    getByOnboarding(onboardingId: EntityId): Promise<ExpenseDetectionRecord | null>;
}

export class PgExpenseDetectionRepository implements IExpenseDetectionRepository {
    async saveDetection(
        onboardingId: EntityId,
        householdId: EntityId,
        expenses: DetectedExpensesByCategory,
        totalMonthlyExpensesCents: number
    ): Promise<ExpenseDetectionRecord> {
        const id = uuidv4() as EntityId;
        const now = new Date();

        const result = await query(
            `INSERT INTO finhouse.onboarding_expense_detection
             (id, onboarding_id, household_id, expenses, total_monthly_expenses_cents, detected_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                id,
                onboardingId,
                householdId,
                JSON.stringify(expenses),
                totalMonthlyExpensesCents,
                now,
            ]
        );

        return this.rowToRecord(result.rows[0]);
    }

    async getLatest(householdId: EntityId): Promise<ExpenseDetectionRecord | null> {
        const result = await query(
            `SELECT * FROM finhouse.onboarding_expense_detection
             WHERE household_id = $1
             ORDER BY detected_at DESC
             LIMIT 1`,
            [householdId]
        );

        if (result.rows.length === 0) return null;
        return this.rowToRecord(result.rows[0]);
    }

    async getByOnboarding(onboardingId: EntityId): Promise<ExpenseDetectionRecord | null> {
        const result = await query(
            `SELECT * FROM finhouse.onboarding_expense_detection
             WHERE onboarding_id = $1`,
            [onboardingId]
        );

        if (result.rows.length === 0) return null;
        return this.rowToRecord(result.rows[0]);
    }

    private rowToRecord(row: DbRow): ExpenseDetectionRecord {
        return {
            id: row.id as EntityId,
            onboardingId: row.onboarding_id as EntityId,
            householdId: row.household_id as EntityId,
            expenses: JSON.parse(row.expenses as string) as DetectedExpensesByCategory,
            totalMonthlyExpensesCents: row.total_monthly_expenses_cents as number,
            detectedAt: new Date(row.detected_at as string),
        };
    }
}
