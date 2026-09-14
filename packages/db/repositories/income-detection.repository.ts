/**
 * Income Detection Repository
 * 
 * Data access layer for onboarding_income_detection table.
 * Stores and retrieves income detection results from Phase 4.
 * 
 * **Implementation Note**: Methods are stub signatures.
 * Implementation will be completed in Phase 2.
 */

import { IncomeDetectionRecord } from '../../domain/types/onboarding.types';
import { EntityId } from '../../domain/types/common.types';

export interface IIncomeDetectionRepository {
    /**
     * Create income detection record
     */
    create(
        householdId: EntityId,
        onboardingId: EntityId,
        record: Omit<IncomeDetectionRecord, 'id' | 'createdAt'>
    ): Promise<IncomeDetectionRecord>;

    /**
     * Get all income detections for household
     */
    getByHouseholdId(householdId: EntityId): Promise<IncomeDetectionRecord[]>;

    /**
     * Get all income detections for specific onboarding session
     */
    getByOnboardingId(onboardingId: EntityId): Promise<IncomeDetectionRecord[]>;

    /**
     * Get latest income detection for household
     */
    getLatest(householdId: EntityId): Promise<IncomeDetectionRecord | null>;

    /**
     * Mark income detection as user confirmed
     */
    confirm(recordId: EntityId, confirmedAmount?: number): Promise<IncomeDetectionRecord>;

    /**
     * Delete income detection record
     */
    delete(recordId: EntityId): Promise<boolean>;

    /**
     * Get unconfirmed detections (awaiting user confirmation)
     */
    getUnconfirmed(householdId: EntityId): Promise<IncomeDetectionRecord[]>;
}

export class IncomeDetectionRepository implements IIncomeDetectionRepository {
    constructor(private db: any) { }

    async create(
        householdId: EntityId,
        onboardingId: EntityId,
        record: Omit<IncomeDetectionRecord, 'id' | 'createdAt'>
    ): Promise<IncomeDetectionRecord> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getByHouseholdId(householdId: EntityId): Promise<IncomeDetectionRecord[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getByOnboardingId(onboardingId: EntityId): Promise<IncomeDetectionRecord[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getLatest(householdId: EntityId): Promise<IncomeDetectionRecord | null> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async confirm(recordId: EntityId, confirmedAmount?: number): Promise<IncomeDetectionRecord> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async delete(recordId: EntityId): Promise<boolean> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getUnconfirmed(householdId: EntityId): Promise<IncomeDetectionRecord[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }
}
