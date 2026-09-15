/**
 * Onboarding Service
 * 
 * Business logic layer orchestrating all 6 phases of onboarding.
 * Coordinates repositories, validators, and external services.
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
    PhaseValidationResult,
    PhaseRequirements,
    IncomeDetection,
    ExpenseDetection,
} from '../types/onboarding.types';
import { EntityId } from '../types/common.types';

export interface IOnboardingService {
    // ===== Core Orchestration =====

    /**
     * Start new onboarding session for household
     */
    startOnboarding(householdId: EntityId, userId: EntityId, householdName: string): Promise<OnboardingProgress>;

    /**
     * Get current onboarding progress
     */
    getCurrentProgress(householdId: EntityId): Promise<OnboardingProgress | null>;

    /**
     * Get requirements/guidance for a phase
     */
    getPhaseRequirements(householdId: EntityId, phaseNumber: OnboardingPhase): Promise<PhaseRequirements>;

    // ===== Phase 1: Setup =====

    /**
     * Complete Phase 1: Setup household
     */
    completePhase1(householdId: EntityId, data: SetupPhaseData, userId: EntityId): Promise<OnboardingProgress>;

    /**
     * Validate Phase 1 data
     */
    validatePhase1(data: SetupPhaseData): Promise<PhaseValidationResult>;

    // ===== Phase 2: Account Declaration =====

    /**
     * Complete Phase 2: Declare accounts
     */
    completePhase2(householdId: EntityId, data: AccountsPhaseData, userId: EntityId): Promise<OnboardingProgress>;

    /**
     * Validate Phase 2 data
     */
    validatePhase2(data: AccountsPhaseData): Promise<PhaseValidationResult>;

    // ===== Phase 3: Statement Upload =====

    /**
     * Complete Phase 3: Upload statements
     */
    completePhase3(householdId: EntityId, data: StatementsPhaseData, userId: EntityId): Promise<OnboardingProgress>;

    /**
     * Validate Phase 3 data
     */
    validatePhase3(data: StatementsPhaseData): Promise<PhaseValidationResult>;

    /**
     * Get statement collection status for household accounts
     */
    getStatementCollectionStatus(householdId: EntityId): Promise<Record<EntityId, any>>;

    // ===== Phase 4: Financial Context =====

    /**
     * Complete Phase 4: Enter financial context
     */
    completePhase4(householdId: EntityId, data: FinancialContextPhaseData, userId: EntityId): Promise<OnboardingProgress>;

    /**
     * Validate Phase 4 data
     */
    validatePhase4(data: FinancialContextPhaseData): Promise<PhaseValidationResult>;

    /**
     * Detect income from bank transactions
     */
    detectIncome(householdId: EntityId): Promise<IncomeDetection | null>;

    /**
     * Detect recurring expenses from bank transactions
     */
    detectExpenses(householdId: EntityId, accountIds?: EntityId[]): Promise<ExpenseDetection[]>;

    // ===== Phase 5: Profile =====

    /**
     * Complete Phase 5: Set household profile
     */
    completePhase5(householdId: EntityId, data: ProfilePhaseData, userId: EntityId): Promise<OnboardingProgress>;

    /**
     * Validate Phase 5 data
     */
    validatePhase5(data: ProfilePhaseData): Promise<PhaseValidationResult>;

    // ===== Phase 6: Launch =====

    /**
     * Complete Phase 6: Launch onboarding
     */
    completePhase6(householdId: EntityId, data: LaunchPhaseData, userId: EntityId): Promise<OnboardingProgress>;

    /**
     * Validate Phase 6 data
     */
    validatePhase6(data: LaunchPhaseData): Promise<PhaseValidationResult>;

    /**
     * Launch onboarding (complete all phases)
     */
    launch(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress>;

    // ===== Workflow Control =====

    /**
     * Skip to a different phase
     */
    skipToPhase(householdId: EntityId, targetPhase: OnboardingPhase, userId: EntityId): Promise<OnboardingProgress>;

    /**
     * Restart onboarding from beginning
     */
    restart(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress>;

    /**
     * Pause onboarding
     */
    pause(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress>;

    /**
     * Resume paused onboarding
     */
    resume(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress>;

    /**
     * Abandon onboarding
     */
    abandon(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress>;

    // ===== Checkpoint (Resume) =====

    /**
     * Save checkpoint for resume
     */
    saveCheckpoint(householdId: EntityId, sessionId: string, phaseNumber: OnboardingPhase): Promise<EntityId>;

    /**
     * Restore from checkpoint
     */
    restoreCheckpoint(householdId: EntityId, sessionId: string): Promise<OnboardingProgress>;

    // ===== Analytics =====

    /**
     * Get completion statistics
     */
    getCompletionStats(): Promise<{
        totalStarted: number;
        totalCompleted: number;
        completionRate: number;
        averageTimeMinutes: number;
        dropoffByPhase: Record<OnboardingPhase, number>;
    }>;

    /**
     * Get individual household metrics
     */
    getHouseholdMetrics(householdId: EntityId): Promise<{
        phase: OnboardingPhase;
        state: OnboardingState;
        timeElapsedMinutes: number;
        phaseCompletionTimes: Record<OnboardingPhase, number | null>;
    }>;
}

// Import the actual PostgreSQL implementation
import { PgOnboardingService } from './pg-onboarding.service';

// Export the PostgreSQL implementation as the default
export class OnboardingService extends PgOnboardingService implements IOnboardingService {
    constructor() {
        super();
    }
}
