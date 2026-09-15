/**
 * Onboarding Domain Types
 * 
 * Defines all TypeScript interfaces and enums for the household onboarding workflow.
 * These types are shared across domain, data access, API, and UI layers.
 */

import { EntityId } from './common.types';

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Onboarding state machine states
 */
export enum OnboardingState {
    NOT_STARTED = 'NOT_STARTED',
    IN_PROGRESS = 'IN_PROGRESS',
    PAUSED = 'PAUSED',
    COMPLETE = 'COMPLETE',
    ABANDONED = 'ABANDONED',
}

/**
 * Onboarding phases (1-6)
 */
export type OnboardingPhase = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Confidence levels for AI detections
 */
export enum ConfidenceLevel {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
}

/**
 * Income source type
 */
export enum IncomeSourceType {
    AUTO_DETECTED = 'AUTO_DETECTED',
    MANUAL_ENTRY = 'MANUAL_ENTRY',
}

/**
 * Expense source type
 */
export enum ExpenseSourceType {
    AUTO_DETECTED = 'AUTO_DETECTED',
    MANUAL_ENTRY = 'MANUAL_ENTRY',
}

/**
 * Severity of validation error
 */
export enum ValidationSeverity {
    ERROR = 'ERROR',      // Blocks phase completion
    WARNING = 'WARNING',  // Allows phase completion
}

/**
 * Household profile type
 */
export enum HouseholdProfileType {
    SOLO = 'SOLO',
    COUPLE = 'COUPLE',
    FAMILY = 'FAMILY',
}

/**
 * Account types
 */
export enum AccountType {
    CHECKING = 'CHECKING',
    SAVINGS = 'SAVINGS',
    MONEY_MARKET = 'MONEY_MARKET',
    CREDIT_CARD = 'CREDIT_CARD',
    AUTO_LOAN = 'AUTO_LOAN',
    STUDENT_LOAN = 'STUDENT_LOAN',
    MORTGAGE = 'MORTGAGE',
    INVESTMENT = 'INVESTMENT',
    RETIREMENT = 'RETIREMENT',
    OTHER = 'OTHER',
}

/**
 * Financial health status
 */
export enum FinancialHealthStatus {
    CRITICAL = 'CRITICAL',
    POOR = 'POOR',
    FAIR = 'FAIR',
    GOOD = 'GOOD',
    EXCELLENT = 'EXCELLENT',
}

/**
 * Insight types
 */
export enum InsightType {
    OPPORTUNITY = 'OPPORTUNITY',
    WARNING = 'WARNING',
    INFO = 'INFO',
}

/**
 * Notification frequency
 */
export enum NotificationFrequency {
    DAILY = 'DAILY',
    WEEKLY = 'WEEKLY',
    MONTHLY = 'MONTHLY',
}

/**
 * Collection status for uploaded statements
 */
export enum StatementCollectionStatus {
    NOT_STARTED = 'NOT_STARTED',
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETE = 'COMPLETE',
    ERROR = 'ERROR',
}

// ============================================================================
// PHASE DATA TYPES
// ============================================================================

/**
 * Phase 1: Setup household and select banking institutions
 */
export interface SetupPhaseData {
    householdName: string;
    profileType: HouseholdProfileType;
    primaryMemberId: EntityId;
    initialInstitutions: string[];
}

/**
 * Single account declaration in Phase 2
 */
export interface DeclaredAccount {
    tempId: string;
    institution: string;
    accountType: AccountType;
    nickname?: string;                     // User-friendly account name
    accountName?: string;                  // Backward compatibility
    balance?: number;
    accountNumberSuffix?: string;
}

/**
 * Phase 2: Declare accounts
 */
export interface AccountsPhaseData {
    declaredAccounts: DeclaredAccount[];
    institution?: string;                  // Service compatibility
    accounts?: DeclaredAccount[];           // Service compatibility (alias)
}

/**
 * Account collection status tracking
 */
export interface AccountCollectionStatus {
    accountId: EntityId;
    uploadedCount: number;
    requiredCount: number;
    lastUploadAt?: Date;
    status: StatementCollectionStatus;
    lastError?: string;
}

/**
 * Phase 3: Upload statements
 */
export interface StatementsPhaseData {
    accountStatementCollectionStatus?: Record<EntityId, AccountCollectionStatus>;  // Optional for testing
    statementUploadStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'PARTIAL';
    uploadedDocuments: any[];              // List of uploaded document objects
    uploadStatus?: string;                 // Backward compatibility
    documents?: any[];                     // Backward compatibility
}

/**
 * Detected income from transactions
 */
export interface IncomeDetection {
    source: IncomeSourceType;
    confidence: ConfidenceLevel;
    monthlyGrossCents: number;              // Primary property for service usage
    monthlyGrossAmountCents?: number;       // Backward compat
    monthlyNetAmountCents?: number;
    annualGrossCents?: number;              // Primary property for service usage
    annualGrossAmountCents?: number;        // Backward compat
    frequency?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'IRREGULAR';
    detectionMethod?: string;
    detectionDetails?: string;
}

/**
 * Detected expense from transactions
 */
export interface ExpenseDetection {
    category: string;
    monthlyAmountCents: number;
    monthlyAverageCents?: number;           // Service compatibility
    confidence: ConfidenceLevel;
    detectionSource: ExpenseSourceType;
    transactionCount?: number;              // Service compatibility
    detectedFromTransactionCount?: number;
    transactionSamples?: any[];
}

/**
 * Phase 4: Financial context (income/expenses)
 */
export interface FinancialContextPhaseData {
    detectedIncome: IncomeDetection;
    detectedExpenses: ExpenseDetection[];
    userConfirmed: boolean;
    income?: IncomeDetection;               // Service compatibility (alias)
    expenses?: ExpenseDetection[];          // Service compatibility (alias)
}

/**
 * Household member in profile
 */
export interface HouseholdMember {
    id: EntityId;
    name: string;
    email?: string;
}

/**
 * Notification preferences
 */
export interface NotificationPreferences {
    budgetAlerts: boolean;
    savingsAlerts: boolean;
    spendingAlerts: boolean;
    frequency: NotificationFrequency;
}

/**
 * Phase 5: Household profile
 */
export interface ProfilePhaseData {
    householdMembers: HouseholdMember[];
    privacyConfirmed: boolean;
    notificationPreferences: NotificationPreferences;
    twoFactorEnabled: boolean;
    goals?: any[];                         // Service compatibility (financial goals list)
}

/**
 * Budget readiness indicator
 */
export interface BudgetReadiness {
    hasIncomeData: boolean;
    hasExpenseData: boolean;
    hasAccountData: boolean;
    canCreateBudget: boolean;
}

/**
 * Initial insight/recommendation
 */
export interface InitialInsight {
    type: InsightType;
    title: string;
    description: string;
    actionUrl?: string;
}

/**
 * Phase 6: Launch (complete onboarding)
 */
export interface LaunchPhaseData {
    financialSnapshotId: EntityId;
    initialHealthStatus: FinancialHealthStatus;
    budgetReadiness: BudgetReadiness;
    initialInsights: InitialInsight[];
}

// ============================================================================
// CORE DOMAIN TYPES
// ============================================================================

/**
 * Core onboarding progress tracking entity
 */
export interface OnboardingProgress {
    id: EntityId;
    householdId: EntityId;

    // State tracking
    currentPhase: OnboardingPhase;
    currentState: OnboardingState;

    // Phase completion tracking
    phases: {
        1: { completed: boolean; completedAt: Date | null; data: SetupPhaseData | null };
        2: { completed: boolean; completedAt: Date | null; data: AccountsPhaseData | null };
        3: { completed: boolean; completedAt: Date | null; data: StatementsPhaseData | null };
        4: { completed: boolean; completedAt: Date | null; data: FinancialContextPhaseData | null };
        5: { completed: boolean; completedAt: Date | null; data: ProfilePhaseData | null };
        6: { completed: boolean; completedAt: Date | null; data: LaunchPhaseData | null };
    };

    // Timing & engagement metrics
    startedAt: Date;
    lastActivityAt: Date;
    completedAt: Date | null;
    totalTimeMinutes: number; // Calculated: (completedAt - startedAt) / 60000

    // Last checkpoint for resume
    lastCheckpoint: EntityId | null;   // ID of the last saved checkpoint session

    // Audit trail
    createdBy: EntityId;
    updatedBy: EntityId;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Session checkpoint for pause/resume functionality
 */
export interface OnboardingSessionCheckpoint {
    id: EntityId;
    householdId: EntityId;
    sessionId: string;
    phase: OnboardingPhase;
    checkpointData: Record<string, unknown>;
    createdAt: Date;
}

/**
 * Income detection record in database
 */
export interface IncomeDetectionRecord {
    id: EntityId;
    householdId: EntityId;
    onboardingId: EntityId;
    detectionSource: IncomeSourceType;
    confidence: ConfidenceLevel;
    monthlyGrossAmountCents: number;
    monthlyNetAmountCents?: number;
    annualGrossAmountCents?: number;
    detectionDetails?: Record<string, unknown>;
    userConfirmed: boolean;
    confirmedAt: Date | null;
    createdAt: Date;
}

/**
 * Expense detection record in database
 */
export interface ExpenseDetectionRecord {
    id: EntityId;
    householdId: EntityId;
    onboardingId: EntityId;
    expenseCategory: string;
    monthlyAmountCents: number;
    confidence: ConfidenceLevel;
    detectionSource: ExpenseSourceType;
    detectedFromTransactionCount?: number;
    userConfirmed: boolean;
    userAmountCents?: number;
    confirmedAt: Date | null;
    createdAt: Date;
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

/**
 * Single validation error
 */
export interface ValidationError {
    field: string;
    message: string;
    severity: ValidationSeverity;
    code?: string; // Machine-readable error code
}

/**
 * Phase validation result
 */
export interface PhaseValidationResult {
    phase?: OnboardingPhase;                // Service compatibility
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
    canProceed: boolean; // true if no ERROR severity issues
}

/**
 * Phase requirements for UI guidance
 */
export interface PhaseRequirements {
    phase: OnboardingPhase;
    phaseNumber?: OnboardingPhase;          // Service compatibility (alias)
    title: string;
    description: string;
    estimatedMinutes: number;
    requiredFields: string[];
    optionalFields: string[];
    helpUrl?: string;
}

// ============================================================================
// API TYPES
// ============================================================================

/**
 * Request to complete a phase
 */
export interface CompletePhaseRequest {
    phaseNumber: OnboardingPhase;
    data: Record<string, unknown>;
}

/**
 * Response from phase completion
 */
export interface CompletePhaseResponse {
    success: boolean;
    progress: OnboardingProgress | null;
    errors: ValidationError[];
    nextPhase: OnboardingPhase;
}

/**
 * Request to skip phase
 */
export interface SkipPhaseRequest {
    targetPhase: OnboardingPhase;
}

/**
 * Response from skip phase
 */
export interface SkipPhaseResponse {
    success: boolean;
    progress: OnboardingProgress;
    currentPhase: OnboardingPhase;
}

/**
 * Checkpoint save request
 */
export interface SaveCheckpointRequest {
    phase: OnboardingPhase;
    data: Record<string, unknown>;
}

/**
 * Checkpoint save response
 */
export interface SaveCheckpointResponse {
    checkpointId: EntityId;
    phase: OnboardingPhase;
    createdAt: Date;
}

/**
 * Launch request
 */
export interface LaunchOnboardingRequest {
    confirmationPhrase: string;
}

/**
 * Launch response
 */
export interface LaunchOnboardingResponse {
    success: boolean;
    status: 'OK' | 'DATA_INCOMPLETE';
    financialSnapshotId?: EntityId;
    errors?: string[];
    nextSteps?: string[];
}

/**
 * Income detection request
 */
export interface DetectIncomeRequest {
    householdId: EntityId;
    minConfidence?: ConfidenceLevel;
}

/**
 * Income detection response
 */
export interface DetectIncomeResponse {
    detectedIncome: IncomeDetection | null;
    confidence: ConfidenceLevel;
    message: string;
}

/**
 * Expense detection request
 */
export interface DetectExpensesRequest {
    householdId: EntityId;
    accountIds: EntityId[];
    minConfidence?: ConfidenceLevel;
}

/**
 * Expense detection response
 */
export interface DetectExpensesResponse {
    detectedExpenses: ExpenseDetection[];
    monthlyTotal: number; // cents
    confidence: ConfidenceLevel;
    message: string;
}

// ============================================================================
// SERVICE TYPES
// ============================================================================

/**
 * Options for starting onboarding
 */
export interface StartOnboardingOptions {
    householdId: EntityId;
    userId: EntityId;
    householdName: string;
    profileType?: HouseholdProfileType;
}

/**
 * Income detection options
 */
export interface IncomeDetectionOptions {
    householdId: EntityId;
    accountIds?: EntityId[];
    minMonthsOfData?: number;
    minConfidence?: ConfidenceLevel;
}

/**
 * Expense detection options
 */
export interface ExpenseDetectionOptions {
    householdId: EntityId;
    accountIds: EntityId[];
    minMonthsOfData?: number;
    minConfidence?: ConfidenceLevel;
    categories?: string[];
}

// ============================================================================
// STATE MACHINE TYPES
// ============================================================================

/**
 * Valid state transitions
 */
export const STATE_TRANSITIONS: Record<OnboardingState, OnboardingState[]> = {
    [OnboardingState.NOT_STARTED]: [OnboardingState.IN_PROGRESS],
    [OnboardingState.IN_PROGRESS]: [OnboardingState.PAUSED, OnboardingState.COMPLETE, OnboardingState.ABANDONED],
    [OnboardingState.PAUSED]: [OnboardingState.IN_PROGRESS, OnboardingState.ABANDONED],
    [OnboardingState.COMPLETE]: [], // Terminal state
    [OnboardingState.ABANDONED]: [OnboardingState.IN_PROGRESS], // Allow restart
};

/**
 * Check if transition is valid
 */
export function isValidStateTransition(from: OnboardingState, to: OnboardingState): boolean {
    return STATE_TRANSITIONS[from].includes(to);
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Page size options for paginated queries
 */
export enum PageSize {
    SMALL = 10,
    MEDIUM = 25,
    LARGE = 50,
}

/**
 * Sorting direction
 */
export enum SortDirection {
    ASC = 'ASC',
    DESC = 'DESC',
}

/**
 * Generic paginated response
 */
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
}
