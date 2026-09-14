/**
 * Expense Detection Service
 * 
 * Business logic for detecting recurring household expenses from bank transactions.
 * Used during Phase 4 (Financial Context).
 * 
 * **Implementation Note**: Methods are stub signatures.
 * Implementation will be completed in Phase 2.
 */

import { ExpenseDetection, ConfidenceLevel } from '../types/onboarding.types';
import { EntityId } from '../types/common.types';

export interface IExpenseDetectionService {
    /**
     * Analyze bank transactions to detect recurring expenses
     */
    detectExpenses(householdId: EntityId, accountIds?: EntityId[], minMonthsOfData?: number): Promise<ExpenseDetection[]>;

    /**
     * Detect expenses in specific expense categories
     */
    detectExpensesByCategory(householdId: EntityId, categories: string[]): Promise<ExpenseDetection[]>;

    /**
     * Categorize transactions and aggregate by category
     */
    aggregateByCategory(householdId: EntityId, accountIds: EntityId[]): Promise<Map<string, ExpenseDetection[]>>;

    /**
     * Calculate confidence level for expense detection
     */
    calculateConfidence(frequency: string, consistency: number): ConfidenceLevel;

    /**
     * Validate detected expense
     */
    validateDetection(detection: ExpenseDetection): boolean;

    /**
     * Get expense detection explanation for user
     */
    getDetectionExplanation(detection: ExpenseDetection): string;

    /**
     * Get suggested expense categories based on transaction patterns
     */
    suggestCategories(householdId: EntityId): Promise<string[]>;
}

export class ExpenseDetectionService implements IExpenseDetectionService {
    constructor() { }

    async detectExpenses(householdId: EntityId, accountIds?: EntityId[], minMonthsOfData?: number): Promise<ExpenseDetection[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async detectExpensesByCategory(householdId: EntityId, categories: string[]): Promise<ExpenseDetection[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async aggregateByCategory(householdId: EntityId, accountIds: EntityId[]): Promise<Map<string, ExpenseDetection[]>> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    calculateConfidence(frequency: string, consistency: number): ConfidenceLevel {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    validateDetection(detection: ExpenseDetection): boolean {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    getDetectionExplanation(detection: ExpenseDetection): string {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async suggestCategories(householdId: EntityId): Promise<string[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }
}
