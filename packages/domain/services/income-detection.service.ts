/**
 * Income Detection Service
 * 
 * Business logic for detecting household income from bank transactions.
 * Used during Phase 4 (Financial Context).
 * 
 * **Implementation Note**: Methods are stub signatures.
 * Implementation will be completed in Phase 2.
 */

import { IncomeDetection, ConfidenceLevel } from '../types/onboarding.types';
import { EntityId } from '../types/common.types';

export interface IIncomeDetectionService {
    /**
     * Analyze bank transactions to detect income
     */
    detectIncome(householdId: EntityId, minMonthsOfData?: number): Promise<IncomeDetection | null>;

    /**
     * Detect income from specific accounts
     */
    detectIncomeFromAccounts(householdId: EntityId, accountIds: EntityId[]): Promise<IncomeDetection | null>;

    /**
     * Calculate confidence level based on detection metrics
     */
    calculateConfidence(frequency: string, consistency: number): ConfidenceLevel;

    /**
     * Validate detected income
     */
    validateDetection(detection: IncomeDetection): boolean;

    /**
     * Get income detection explanation for user
     */
    getDetectionExplanation(detection: IncomeDetection): string;
}

export class IncomeDetectionService implements IIncomeDetectionService {
    constructor() { }

    async detectIncome(householdId: EntityId, minMonthsOfData?: number): Promise<IncomeDetection | null> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async detectIncomeFromAccounts(householdId: EntityId, accountIds: EntityId[]): Promise<IncomeDetection | null> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    calculateConfidence(frequency: string, consistency: number): ConfidenceLevel {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    validateDetection(detection: IncomeDetection): boolean {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    getDetectionExplanation(detection: IncomeDetection): string {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }
}
