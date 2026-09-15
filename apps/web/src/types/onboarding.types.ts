/**
 * TypeScript types for Household Onboarding Flow
 * Defines interfaces for all 6 phases and supporting data structures
 */

export type OnboardingPhase = 1 | 2 | 3 | 4 | 5 | 6;
export type OnboardingState = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'ABANDONED';
export type HouseholdProfileType = 'SOLO' | 'COUPLE' | 'FAMILY';
export type AccountType = 'CHECKING' | 'SAVINGS' | 'MONEY_MARKET' | 'CREDIT_CARD' | 'AUTO_LOAN' | 'STUDENT_LOAN' | 'MORTGAGE' | 'OTHER';
export type IncomeFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'IRREGULAR';
export type ExpenseFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'OCCASIONAL';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type DetectionSource = 'AUTO_DETECTED' | 'MANUAL_ENTRY';

export interface OnboardingProgress {
    id: string;
    householdId: string;
    currentPhase: OnboardingPhase;
    currentState: OnboardingState;
    phases: {
        [key in OnboardingPhase]: {
            completed: boolean;
            completedAt: Date | null;
            data: Record<string, unknown>;
        };
    };
    startedAt: Date;
    lastActivityAt: Date;
    completedAt: Date | null;
    totalTimeMinutes: number;
    createdAt: Date;
    updatedAt: Date;
}

// Phase 1: Setup
export interface SetupPhaseData {
    householdName: string;
    profileType: HouseholdProfileType;
    initialInstitutions: string[];
}

// Phase 2: Accounts
export interface DeclaredAccount {
    tempId: string;
    name: string;
    accountType: AccountType;
    accountNumberSuffix?: string;
    estimatedBalance?: number;
}

export interface AccountsPhaseData {
    declaredAccounts: DeclaredAccount[];
}

// Phase 3: Statements
export interface AccountCollectionStatus {
    accountId: string;
    accountName: string;
    accountType: AccountType;
    minimumsRequired: {
        months: number;
        minDate: Date;
    };
    statementsReceived: {
        count: number;
        months: string[];
    };
    uploadedFiles: {
        fileName: string;
        uploadedAt: Date;
        status: 'PROCESSING' | 'COMPLETE' | 'ERROR';
        errorMessage?: string;
    }[];
    isComplete: boolean;
    lastError?: string;
}

export interface StatementsPhaseData {
    accountStatementCollectionStatus: Record<string, AccountCollectionStatus>;
}

// Phase 4: Financial Context
export interface DetectedIncome {
    source: DetectionSource;
    monthlyGrossCents: number;
    monthlyNetCents?: number;
    annualGrossCents: number;
    frequency: IncomeFrequency;
    confidence: ConfidenceLevel;
    detectionDetails?: string;
    detectionMethod: string;
}

export interface DetectedExpense {
    category: string;
    monthlyAverageCents: number;
    confidence: ConfidenceLevel;
    frequency: ExpenseFrequency;
    transactionCount: number;
    source: DetectionSource;
}

export interface FinancialContextPhaseData {
    detectedIncome: DetectedIncome | null;
    detectedExpenses: DetectedExpense[];
    userConfirmedIncome: boolean;
    userConfirmedIncome_Amount?: number;
    userConfirmedExpenses: Record<string, number>; // category -> amount in cents
}

// Phase 5: Profile
export interface HouseholdMember {
    id: string;
    name: string;
    email: string;
    role: 'OWNER' | 'MEMBER';
    visibility: 'FULL' | 'BUDGET_ONLY' | 'READ_ONLY';
}

export interface NotificationPreferences {
    budgetAlerts: boolean;
    financialMilestones: boolean;
    weeklyDigest: boolean;
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
}

export interface ProfilePhaseData {
    householdMembers: HouseholdMember[];
    privacyConfirmed: boolean;
    notificationPreferences: NotificationPreferences;
    twoFactorEnabled: boolean;
}

// Phase 6: Launch
export interface FinancialHealthStatus {
    score: number; // 0-100
    status: 'CRITICAL' | 'POOR' | 'FAIR' | 'GOOD' | 'HEALTHY';
    nextSteps: string[];
}

export interface InitialInsight {
    type: 'OPPORTUNITY' | 'WARNING' | 'INFO';
    title: string;
    description: string;
    action?: string;
    actionUrl?: string;
}

export interface LaunchPhaseData {
    confirmationPhrase: string;
    financialSnapshotId?: string;
    initialHealthStatus?: FinancialHealthStatus;
    initialInsights: InitialInsight[];
}

// API Responses
export interface OnboardingValidationError {
    field: string;
    message: string;
    code: string;
}

export interface OnboardingResponse {
    success: boolean;
    data?: OnboardingProgress;
    errors?: OnboardingValidationError[];
}

export interface PhaseRequirements {
    phaseNumber: OnboardingPhase;
    title: string;
    description: string;
    estimatedTime: number; // minutes
    required: string[];
    optional: string[];
    skippable: boolean;
}

export interface CollectionStatusMap {
    [accountId: string]: AccountCollectionStatus;
}
