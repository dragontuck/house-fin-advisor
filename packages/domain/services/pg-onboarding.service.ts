/**
 * PostgreSQL implementation of OnboardingService
 *
 * Business logic layer orchestrating all 6 phases of onboarding.
 * Coordinates repositories, validators, and external services.
 */

import { v4 as uuidv4 } from 'uuid';
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
    ValidationError,
    ValidationSeverity,
    FinancialHealthStatus,
    InsightType,
} from '../types/onboarding.types';
import { EntityId } from '../types/common.types';
import { PgOnboardingProgressRepository } from '../../db/repositories/pg-onboarding-progress.repository';
import { PgOnboardingCheckpointRepository } from '../../db/repositories/pg-onboarding-checkpoint.repository';
import { IncomeDetectionService } from './income-detection.service';
import { ExpenseDetectionService } from './expense-detection.service';

export interface IOnboardingService {
    startOnboarding(householdId: EntityId, userId: EntityId, householdName: string): Promise<OnboardingProgress>;
    getCurrentProgress(householdId: EntityId): Promise<OnboardingProgress | null>;
    getPhaseRequirements(householdId: EntityId, phaseNumber: OnboardingPhase): Promise<PhaseRequirements>;
    completePhase1(householdId: EntityId, data: SetupPhaseData, userId: EntityId): Promise<OnboardingProgress>;
    validatePhase1(data: SetupPhaseData): Promise<PhaseValidationResult>;
    completePhase2(householdId: EntityId, data: AccountsPhaseData, userId: EntityId): Promise<OnboardingProgress>;
    validatePhase2(data: AccountsPhaseData): Promise<PhaseValidationResult>;
    completePhase3(householdId: EntityId, data: StatementsPhaseData, userId: EntityId): Promise<OnboardingProgress>;
    validatePhase3(data: StatementsPhaseData): Promise<PhaseValidationResult>;
    getStatementCollectionStatus(householdId: EntityId): Promise<Record<EntityId, any>>;
    completePhase4(householdId: EntityId, data: FinancialContextPhaseData, userId: EntityId): Promise<OnboardingProgress>;
    validatePhase4(data: FinancialContextPhaseData): Promise<PhaseValidationResult>;
    detectIncome(householdId: EntityId): Promise<IncomeDetection | null>;
    detectExpenses(householdId: EntityId, accountIds?: EntityId[]): Promise<ExpenseDetection[]>;
    completePhase5(householdId: EntityId, data: ProfilePhaseData, userId: EntityId): Promise<OnboardingProgress>;
    validatePhase5(data: ProfilePhaseData): Promise<PhaseValidationResult>;
    completePhase6(householdId: EntityId, data: LaunchPhaseData, userId: EntityId): Promise<OnboardingProgress>;
    validatePhase6(data: LaunchPhaseData): Promise<PhaseValidationResult>;
    launch(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress>;
    skipToPhase(householdId: EntityId, targetPhase: OnboardingPhase, userId: EntityId): Promise<OnboardingProgress>;
    restart(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress>;
    pause(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress>;
    resume(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress>;
    abandon(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress>;
    saveCheckpoint(householdId: EntityId, sessionId: string, phaseNumber: OnboardingPhase): Promise<EntityId>;
    restoreCheckpoint(householdId: EntityId, sessionId: string): Promise<OnboardingProgress>;
    getCompletionStats(): Promise<{
        totalStarted: number;
        totalCompleted: number;
        completionRate: number;
        averageTimeMinutes: number;
        dropoffByPhase: Record<OnboardingPhase, number>;
    }>;
    getHouseholdMetrics(householdId: EntityId): Promise<{
        phase: OnboardingPhase;
        state: OnboardingState;
        timeElapsedMinutes: number;
        phaseCompletionTimes: Record<OnboardingPhase, number | null>;
    }>;
}

export class PgOnboardingService implements IOnboardingService {
    private progressRepo = new PgOnboardingProgressRepository();
    private checkpointRepo = new PgOnboardingCheckpointRepository();
    private incomeService = new IncomeDetectionService();
    private expenseService = new ExpenseDetectionService();

    /**
     * Helper to create ValidationError objects
     */
    private createError(
        field: string,
        message: string,
        severity: ValidationSeverity = ValidationSeverity.ERROR
    ): ValidationError {
        return { field, message, severity };
    }

    async startOnboarding(
        householdId: EntityId,
        userId: EntityId,
        householdName: string
    ): Promise<OnboardingProgress> {
        return this.progressRepo.start(householdId, userId, householdName);
    }

    async getCurrentProgress(householdId: EntityId): Promise<OnboardingProgress | null> {
        return this.progressRepo.getByHouseholdId(householdId);
    }

    async getPhaseRequirements(
        householdId: EntityId,
        phaseNumber: OnboardingPhase
    ): Promise<PhaseRequirements> {
        // Return phase-specific requirements
        const requirements: Record<OnboardingPhase, PhaseRequirements> = {
            1: {
                phase: 1,
                phaseNumber: 1,
                title: 'Setup Household',
                description: 'Set up your household profile and select banking institutions',
                requiredFields: ['householdName', 'profileType', 'primaryMemberId'],
                optionalFields: ['members'],
                estimatedMinutes: 5,
            },
            2: {
                phase: 2,
                phaseNumber: 2,
                title: 'Declare Accounts',
                description: 'List all your bank accounts and financial institutions',
                requiredFields: ['accounts'],
                optionalFields: ['accountNicknames'],
                estimatedMinutes: 10,
            },
            3: {
                phase: 3,
                phaseNumber: 3,
                title: 'Upload Statements',
                description: 'Upload bank statements for transaction analysis',
                requiredFields: ['statements'],
                optionalFields: ['alternateStatements'],
                estimatedMinutes: 15,
            },
            4: {
                phase: 4,
                phaseNumber: 4,
                title: 'Financial Context',
                description: 'Analyze income and expense patterns from transactions',
                requiredFields: ['income', 'expenses'],
                optionalFields: ['investments', 'savings'],
                estimatedMinutes: 10,
            },
            5: {
                phase: 5,
                phaseNumber: 5,
                title: 'Profile Settings',
                description: 'Customize your financial profile and preferences',
                requiredFields: ['goals', 'preferences'],
                optionalFields: ['emergencyContacts', 'notifications'],
                estimatedMinutes: 5,
            },
            6: {
                phase: 6,
                phaseNumber: 6,
                title: 'Review & Launch',
                description: 'Review your information and launch your financial advisor',
                requiredFields: [],
                optionalFields: [],
                estimatedMinutes: 2,
            },
        };
        return requirements[phaseNumber];
    }

    async completePhase1(
        householdId: EntityId,
        data: SetupPhaseData,
        userId: EntityId
    ): Promise<OnboardingProgress> {
        const validation = await this.validatePhase1(data);
        if (!validation.isValid) {
            throw new Error(`Phase 1 validation failed: ${validation.errors.join(', ')}`);
        }
        return this.progressRepo.completePhase(householdId, 1, data, userId);
    }

    async validatePhase1(data: SetupPhaseData): Promise<PhaseValidationResult> {
        const errors: ValidationError[] = [];

        if (!data.householdName || data.householdName.length < 1 || data.householdName.length > 100) {
            errors.push(this.createError('householdName', 'Household name must be 1-100 characters'));
        }

        if (!data.profileType || !['SOLO', 'COUPLE', 'FAMILY'].includes(data.profileType)) {
            errors.push(this.createError('profileType', 'Invalid profile type'));
        }

        if (!data.primaryMemberId) {
            errors.push(this.createError('primaryMemberId', 'Primary member ID is required'));
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: [],
            canProceed: errors.length === 0,
            phase: 1,
        };
    }

    async completePhase2(
        householdId: EntityId,
        data: AccountsPhaseData,
        userId: EntityId
    ): Promise<OnboardingProgress> {
        const validation = await this.validatePhase2(data);
        if (!validation.isValid) {
            throw new Error(`Phase 2 validation failed: ${validation.errors.join(', ')}`);
        }
        return this.progressRepo.completePhase(householdId, 2, data, userId);
    }

    async validatePhase2(data: AccountsPhaseData): Promise<PhaseValidationResult> {
        const errors: ValidationError[] = [];

        if (!data.institution && (!data.declaredAccounts || data.declaredAccounts.length === 0)) {
            errors.push(this.createError('institution', 'Institution is required'));
        }

        if (!data.accounts && (!data.declaredAccounts || data.declaredAccounts.length === 0)) {
            errors.push(this.createError('accounts', 'At least one account is required'));
        }

        const validAccountTypes = ['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'RETIREMENT', 'MORTGAGE', 'AUTO_LOAN', 'OTHER'];
        for (const account of (data.accounts || data.declaredAccounts) || []) {
            if (!validAccountTypes.includes(account.accountType)) {
                errors.push(this.createError('accounts', `Invalid account type: ${account.accountType}`));
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: [],
            canProceed: errors.length === 0,
            phase: 2,
        };
    }

    async completePhase3(
        householdId: EntityId,
        data: StatementsPhaseData,
        userId: EntityId
    ): Promise<OnboardingProgress> {
        const validation = await this.validatePhase3(data);
        if (!validation.isValid) {
            throw new Error(`Phase 3 validation failed: ${validation.errors.join(', ')}`);
        }
        return this.progressRepo.completePhase(householdId, 3, data, userId);
    }

    async validatePhase3(data: StatementsPhaseData): Promise<PhaseValidationResult> {
        const errors: ValidationError[] = [];

        const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETE', 'PARTIAL'];
        if (!data.statementUploadStatus || !validStatuses.includes(data.statementUploadStatus)) {
            errors.push(this.createError('statementUploadStatus', 'Invalid statement upload status'));
        }

        if (!Array.isArray(data.uploadedDocuments)) {
            errors.push(this.createError('uploadedDocuments', 'Documents must be an array'));
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: [],
            canProceed: errors.length === 0,
            phase: 3,
        };
    }

    async getStatementCollectionStatus(householdId: EntityId): Promise<Record<EntityId, any>> {
        // TODO: Implement document status tracking
        return {};
    }

    async completePhase4(
        householdId: EntityId,
        data: FinancialContextPhaseData,
        userId: EntityId
    ): Promise<OnboardingProgress> {
        const validation = await this.validatePhase4(data);
        if (!validation.isValid) {
            throw new Error(`Phase 4 validation failed: ${validation.errors.join(', ')}`);
        }
        return this.progressRepo.completePhase(householdId, 4, data, userId);
    }

    async validatePhase4(data: FinancialContextPhaseData): Promise<PhaseValidationResult> {
        const errors: ValidationError[] = [];
        const income = data.income || data.detectedIncome;
        const expenses = data.expenses || data.detectedExpenses;

        if (!income || income.monthlyGrossCents <= 0) {
            errors.push(this.createError('income', 'Valid monthly income is required'));
        }

        if (!expenses || expenses.length === 0) {
            errors.push(this.createError('expenses', 'At least one expense category is required'));
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: [],
            canProceed: errors.length === 0,
            phase: 4,
        };
    }

    async detectIncome(householdId: EntityId): Promise<IncomeDetection | null> {
        // TODO: Fetch transactions and detect income
        return null;
    }

    async detectExpenses(householdId: EntityId, accountIds?: EntityId[]): Promise<ExpenseDetection[]> {
        // TODO: Fetch transactions and detect expenses
        return [];
    }

    async completePhase5(
        householdId: EntityId,
        data: ProfilePhaseData,
        userId: EntityId
    ): Promise<OnboardingProgress> {
        const validation = await this.validatePhase5(data);
        if (!validation.isValid) {
            throw new Error(`Phase 5 validation failed: ${validation.errors.join(', ')}`);
        }
        return this.progressRepo.completePhase(householdId, 5, data, userId);
    }

    async validatePhase5(data: ProfilePhaseData): Promise<PhaseValidationResult> {
        const errors: ValidationError[] = [];

        if (!data.goals || data.goals.length === 0) {
            errors.push(this.createError('goals', 'At least one financial goal is required'));
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings: [],
            canProceed: errors.length === 0,
            phase: 5,
        };
    }

    async completePhase6(
        householdId: EntityId,
        data: LaunchPhaseData,
        userId: EntityId
    ): Promise<OnboardingProgress> {
        const validation = await this.validatePhase6(data);
        if (!validation.isValid) {
            throw new Error(`Phase 6 validation failed: ${validation.errors.join(', ')}`);
        }
        return this.progressRepo.launch(householdId, data, userId);
    }

    async validatePhase6(data: LaunchPhaseData): Promise<PhaseValidationResult> {
        return {
            isValid: true,
            errors: [],
            warnings: [],
            canProceed: true,
            phase: 6,
        };
    }


    async launch(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress> {
        const launchData: LaunchPhaseData = {
            financialSnapshotId: uuidv4(),
            initialHealthStatus: FinancialHealthStatus.FAIR,
            budgetReadiness: {
                hasIncomeData: true,
                hasExpenseData: true,
                hasAccountData: true,
                canCreateBudget: true,
            },
            initialInsights: [
                {
                    type: InsightType.INFO,
                    title: 'Onboarding Complete',
                    description: 'Your financial advisor is now ready to help you manage your finances.',
                },
            ],
        };
        return this.progressRepo.launch(householdId, launchData, userId);
    }

    async skipToPhase(
        householdId: EntityId,
        targetPhase: OnboardingPhase,
        userId: EntityId
    ): Promise<OnboardingProgress> {
        return this.progressRepo.skipPhase(householdId, targetPhase, userId);
    }

    async restart(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress> {
        return this.progressRepo.restart(householdId, userId);
    }

    async pause(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress> {
        // Pause by changing state but keeping progress
        const progress = await this.progressRepo.getByHouseholdId(householdId);
        if (!progress) {
            throw new Error('Onboarding not found');
        }
        // TODO: Set state to PAUSED
        return progress;
    }

    async resume(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress> {
        // Resume by changing state back to IN_PROGRESS
        const progress = await this.progressRepo.getByHouseholdId(householdId);
        if (!progress) {
            throw new Error('Onboarding not found');
        }
        // TODO: Set state to IN_PROGRESS
        return progress;
    }

    async abandon(householdId: EntityId, userId: EntityId): Promise<OnboardingProgress> {
        // Abandon by setting state to ABANDONED
        const progress = await this.progressRepo.getByHouseholdId(householdId);
        if (!progress) {
            throw new Error('Onboarding not found');
        }
        // TODO: Set state to ABANDONED
        return progress;
    }

    async saveCheckpoint(
        householdId: EntityId,
        sessionId: string,
        phaseNumber: OnboardingPhase
    ): Promise<EntityId> {
        const progress = await this.progressRepo.getByHouseholdId(householdId);
        if (!progress) {
            throw new Error('Onboarding not found');
        }

        const checkpoint = await this.checkpointRepo.saveCheckpoint(
            householdId,
            sessionId,
            phaseNumber,
            progress.phases[phaseNumber]
        );

        return checkpoint.id;
    }

    async restoreCheckpoint(householdId: EntityId, sessionId: string): Promise<OnboardingProgress> {
        const checkpoint = await this.checkpointRepo.getLatestCheckpoint(householdId, sessionId);
        if (!checkpoint) {
            throw new Error('Checkpoint not found');
        }

        return this.progressRepo.getByHouseholdId(householdId) as Promise<OnboardingProgress>;
    }

    async getCompletionStats(): Promise<{
        totalStarted: number;
        totalCompleted: number;
        completionRate: number;
        averageTimeMinutes: number;
        dropoffByPhase: Record<OnboardingPhase, number>;
    }> {
        // Get all sessions in progress or completed
        const inProgress = await this.progressRepo.getByStatus(OnboardingState.IN_PROGRESS);
        const completed = await this.progressRepo.getByStatus(OnboardingState.COMPLETE);

        return {
            totalStarted: inProgress.length + completed.length,
            totalCompleted: completed.length,
            completionRate: await this.progressRepo.getCompletionRate(),
            averageTimeMinutes: await this.progressRepo.getAverageTimeToComplete(),
            dropoffByPhase: await this.progressRepo.getPhaseDropoffRates(),
        };
    }

    async getHouseholdMetrics(householdId: EntityId): Promise<{
        phase: OnboardingPhase;
        state: OnboardingState;
        timeElapsedMinutes: number;
        phaseCompletionTimes: Record<OnboardingPhase, number | null>;
    }> {
        const progress = await this.progressRepo.getByHouseholdId(householdId);
        if (!progress) {
            throw new Error('Onboarding not found');
        }

        const timeElapsedMinutes = Math.floor(
            (new Date().getTime() - progress.startedAt.getTime()) / 60000
        );

        const phaseCompletionTimes: Record<OnboardingPhase, number | null> = {
            1: null,
            2: null,
            3: null,
            4: null,
            5: null,
            6: null,
        };

        for (const phase of [1, 2, 3, 4, 5, 6] as OnboardingPhase[]) {
            const phaseData = progress.phases[phase];
            if (phaseData.completedAt && phaseData.completedAt instanceof Date) {
                phaseCompletionTimes[phase] = Math.floor(
                    (phaseData.completedAt.getTime() - progress.startedAt.getTime()) / 60000
                );
            }
        }

        return {
            phase: progress.currentPhase,
            state: progress.currentState,
            timeElapsedMinutes,
            phaseCompletionTimes,
        };
    }
}
