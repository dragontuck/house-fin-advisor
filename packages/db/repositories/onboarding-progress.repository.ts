/**
 * Onboarding Progress Repository
 * 
 * Data access layer for onboarding_progress table.
 * Handles CRUD operations and state transitions.
 * 
 * **Implementation Note**: Methods are stub signatures.
 * Implementation will be completed in Phase 2.
 */

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
} from '../../domain/types/onboarding.types';
import { EntityId } from '../../domain/types/common.types';

export interface IOnboardingProgressRepository {
    /**
     * Create new onboarding session for a household
     */
    start(householdId: EntityId, userId: EntityId, householdName: string): Promise<OnboardingProgress>;

    /**
     * Get current onboarding progress for household
     */
    getByHouseholdId(householdId: EntityId): Promise<OnboardingProgress | null>;

    /**
     * Mark a phase as complete and store its data
     */
    completePhase(
        householdId: EntityId,
        phaseNumber: OnboardingPhase,
        data: SetupPhaseData | AccountsPhaseData | StatementsPhaseData | FinancialContextPhaseData | ProfilePhaseData | LaunchPhaseData,
        userId: EntityId
    ): Promise<OnboardingProgress>;

    /**
     * Skip to a different phase (forward or backward)
     */
    skipPhase(householdId: EntityId, targetPhase: OnboardingPhase, userId: EntityId): Promise<OnboardingProgress>;

    /**
     * Save partial phase data without marking phase complete
     */
    savePhaseData(
        householdId: EntityId,
        phaseNumber: OnboardingPhase,
        data: Record<string, unknown>,
        userId: EntityId
    ): Promise<OnboardingProgress>;

    /**
     * Mark onboarding as complete and create financial snapshot
     */
    launch(
        householdId: EntityId,
        launchData: LaunchPhaseData,
        userId: EntityId
    ): Promise<OnboardingProgress>;

    /**
     * Restart onboarding from Phase 1 (clears all data)
     */
    restart(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress>;

    /**
     * Get all onboarding sessions in a specific state (for analytics)
     */
    getByStatus(status: OnboardingState, limit?: number): Promise<OnboardingProgress[]>;

    /**
     * Calculate average time to complete onboarding (in minutes)
     */
    getAverageTimeToComplete(): Promise<number>;

    /**
     * Get completion rate as percentage (0-100)
     */
    getCompletionRate(): Promise<number>;

    /**
     * Get dropoff rate at each phase (phase → percentage who abandon)
     */
    getPhaseDropoffRates(): Promise<Record<OnboardingPhase, number>>;

    /**
     * Update last activity timestamp
     */
    updateLastActivity(householdId: EntityId): Promise<void>;

    /**
     * Get onboarding sessions started after a certain date
     */
    getByStartDate(fromDate: Date, toDate: Date): Promise<OnboardingProgress[]>;
}

export class OnboardingProgressRepository implements IOnboardingProgressRepository {
    constructor(private db: any) { }

    async start(householdId: EntityId, userId: EntityId, householdName: string): Promise<OnboardingProgress> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getByHouseholdId(householdId: EntityId): Promise<OnboardingProgress | null> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async completePhase(
        householdId: EntityId,
        phaseNumber: OnboardingPhase,
        data: Record<string, unknown>,
        userId: EntityId
    ): Promise<OnboardingProgress> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async skipPhase(householdId: EntityId, targetPhase: OnboardingPhase, userId: EntityId): Promise<OnboardingProgress> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async savePhaseData(
        householdId: EntityId,
        phaseNumber: OnboardingPhase,
        data: Record<string, unknown>,
        userId: EntityId
    ): Promise<OnboardingProgress> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async launch(
        householdId: EntityId,
        launchData: LaunchPhaseData,
        userId: EntityId
    ): Promise<OnboardingProgress> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async restart(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getByStatus(status: OnboardingState, limit?: number): Promise<OnboardingProgress[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getAverageTimeToComplete(): Promise<number> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getCompletionRate(): Promise<number> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getPhaseDropoffRates(): Promise<Record<OnboardingPhase, number>> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async updateLastActivity(householdId: EntityId): Promise<void> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }

    async getByStartDate(fromDate: Date, toDate: Date): Promise<OnboardingProgress[]> {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    }
}
