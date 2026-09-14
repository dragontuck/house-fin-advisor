/**
 * Expense Detection Repository
 * 
 * Data access layer for onboarding_expense_detection table.
 * Stores and retrieves expense detection results from Phase 4.
 * 
 * **Implementation Note**: Methods are stub signatures.
 * Implementation will be completed in Phase 2.
 */

import { ExpenseDetectionRecord } from '../../domain/types/onboarding.types';
import { EntityId } from '../../domain/types/common.types';

export interface IExpenseDetectionRepository {
    /**
     * Create expense detection record
     */
    create(
        householdId: EntityId,
        onboardingId: EntityId,
        record: Omit<ExpenseDetectionRecord, 'id' | 'createdAt'>
    ): Promise<ExpenseDetectionRecord>;

    /**
     * Get all expense detections for household
     */
    getByHouseholdId(householdId: EntityId): Promise<ExpenseDetectionRecord[]>;

    /**
     * Get all expense detections for specific onboarding session
     */
    getByOnboardingId(onboardingId: EntityId): Promise<ExpenseDetectionRecord[]>;

    /**
     * Get expense detections for a specific category
     */
    getByCategory(householdId: EntityId, category: string): Promise<ExpenseDetectionRecord[]>;

    /**
     * Mark expense detection as user confirmed
     */
    confirm(recordId: EntityId, confirmedAmount?: number): Promise<ExpenseDetectionRecord>;

    /**
     * Delete expense detection record
     */
    delete(recordId: EntityId): Promise<boolean>;

    /**
     * Get unconfirmed detections (awaiting user confirmation)
     */
    getUnconfirmed(householdId: EntityId): Promise<ExpenseDetectionRecord[]>;

    /**
     * Get monthly expense summary by category
     */
    getMonthlyExpenseSummary(householdId: EntityId): Promise<Record<string, number>>;

    /**
     * Get total monthly expenses
     */
    getTotalMonthlyExpenses(householdId: EntityId): Promise<number>;
}

export class ExpenseDetectionRepository implements IExpenseDetectionRepository {
    constructor(private db: any) { }

    async create(
        householdId: EntityId,
        onboardingId: EntityId,
        record: Omit<ExpenseDetectionRecord, 'id' | 'createdAt'>
    ): Promise<ExpenseDetectionRecord> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getByHouseholdId(householdId: EntityId): Promise<ExpenseDetectionRecord[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getByOnboardingId(onboardingId: EntityId): Promise<ExpenseDetectionRecord[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getByCategory(householdId: EntityId, category: string): Promise<ExpenseDetectionRecord[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async confirm(recordId: EntityId, confirmedAmount?: number): Promise<ExpenseDetectionRecord> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async delete(recordId: EntityId): Promise<boolean> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getUnconfirmed(householdId: EntityId): Promise<ExpenseDetectionRecord[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getMonthlyExpenseSummary(householdId: EntityId): Promise<Record<string, number>> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getTotalMonthlyExpenses(householdId: EntityId): Promise<number> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }
}
