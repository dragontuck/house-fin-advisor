/**
 * Domain service for Household, HouseholdMember, and Account operations
 */

import {
    Household,
    HouseholdMember,
    Account,
    FinancialSnapshot,
    HouseholdSettings,
    FinancialDocument,
    HouseholdMemberRole,
    HouseholdMemberVisibility,
    EntityId,
    CreateHouseholdRequest,
    CreateAccountRequest,
    DocumentProcessingStatus,
    PostedTransaction,
    StatementPostingAudit,
    AutoPostConfig,
} from "@house-fin/contracts";

/**
 * HouseholdRepository interface - to be implemented by persistence layer
 */
export interface HouseholdRepository {
    create(req: CreateHouseholdRequest): Promise<Household>;
    findById(id: EntityId): Promise<Household | null>;
    findAll(): Promise<Household[]>;
    update(id: EntityId, household: Partial<Household>): Promise<Household>;
}

/**
 * HouseholdMemberRepository interface
 */
export interface HouseholdMemberRepository {
    create(member: Omit<HouseholdMember, "id" | "createdAt">): Promise<HouseholdMember>;
    findByHouseholdId(householdId: EntityId): Promise<HouseholdMember[]>;
    findByIdentityId(
        householdId: EntityId,
        identityId: string
    ): Promise<HouseholdMember | null>;
    findAll(): Promise<HouseholdMember[]>;
}

/**
 * AccountRepository interface
 */
export interface AccountRepository {
    create(req: CreateAccountRequest): Promise<Account>;
    findById(id: EntityId): Promise<Account | null>;
    findByHouseholdId(householdId: EntityId): Promise<Account[]>;
    findAll(): Promise<Account[]>;
    update(id: EntityId, account: Partial<Account>): Promise<Account>;
}

/**
 * FinancialSnapshotRepository interface
 */
export interface FinancialSnapshotRepository {
    create(snapshot: Omit<FinancialSnapshot, "id" | "createdAt">): Promise<FinancialSnapshot>;
    findLatestByHouseholdId(householdId: EntityId): Promise<FinancialSnapshot | null>;
    findByHouseholdAndDate(
        householdId: EntityId,
        date: Date
    ): Promise<FinancialSnapshot | null>;
    findAll(): Promise<FinancialSnapshot[]>;
    /** Returns snapshots on or after `since`, ascending by as_of. */
    findByHouseholdIdSince(householdId: EntityId, since: Date): Promise<FinancialSnapshot[]>;
}

/**
 * HouseholdSettingsRepository interface
 */
export interface HouseholdSettingsRepository {
    create(settings: Omit<HouseholdSettings, "id">): Promise<HouseholdSettings>;
    findByHouseholdId(householdId: EntityId): Promise<HouseholdSettings | null>;
    update(id: EntityId, settings: Partial<HouseholdSettings>): Promise<HouseholdSettings>;
}

/**
 * FinancialDocumentRepository interface - for statement uploads
 */
export type CreateFinancialDocumentInput = Omit<FinancialDocument, "id" | "createdAt" | "updatedAt" | "accountId" | "institutionName" | "statementType" | "periodStart" | "periodEnd" | "openingBalanceCents" | "closingBalanceCents" | "processedAt" | "errorCode" | "errorMessageUser"> & {
    accountId?: EntityId | null;
    institutionName?: string | null;
    statementType?: string | null;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    openingBalanceCents?: number | null;
    closingBalanceCents?: number | null;
    processedAt?: Date | null;
    errorCode?: string | null;
    errorMessageUser?: string | null;
};

export interface FinancialDocumentRepository {
    create(document: CreateFinancialDocumentInput): Promise<FinancialDocument>;
    findById(id: EntityId): Promise<FinancialDocument | null>;
    findByHouseholdId(householdId: EntityId): Promise<FinancialDocument[]>;
    findByChecksum(
        householdId: EntityId,
        checksum: string
    ): Promise<FinancialDocument | null>; // Duplicate detection
    update(id: EntityId, document: Partial<FinancialDocument>): Promise<FinancialDocument>;
    updateStatus(
        id: EntityId,
        status: DocumentProcessingStatus,
        errorCode?: string,
        errorMessageUser?: string,
        correlationId?: string,
        reason?: string
    ): Promise<FinancialDocument>;
    softDelete(id: EntityId, reason?: string): Promise<void>; // Soft delete for audit trail
    getProcessingHistory(documentId: EntityId): Promise<Array<{
        previousStatus: DocumentProcessingStatus | null;
        newStatus: DocumentProcessingStatus;
        changedAt: Date;
        reason: string | null;
    }>>;
}

/**
 * HouseholdService - domain service for household operations
 */
export class HouseholdService {
    constructor(
        private householdRepo: HouseholdRepository,
        private memberRepo: HouseholdMemberRepository,
        private accountRepo: AccountRepository,
        private snapshotRepo: FinancialSnapshotRepository,
        private settingsRepo: HouseholdSettingsRepository
    ) { }

    async createHousehold(req: CreateHouseholdRequest): Promise<Household> {
        return this.householdRepo.create(req);
    }

    async getHousehold(id: EntityId): Promise<Household> {
        const household = await this.householdRepo.findById(id);
        if (!household) {
            throw new Error(`Household not found: ${id}`);
        }
        return household;
    }

    async getHouseholdMembers(householdId: EntityId): Promise<HouseholdMember[]> {
        return this.memberRepo.findByHouseholdId(householdId);
    }

    async addMember(
        householdId: EntityId,
        identityId: string,
        displayName: string,
        role: HouseholdMemberRole = HouseholdMemberRole.MEMBER
    ): Promise<HouseholdMember> {
        // Check if member already exists
        const existing = await this.memberRepo.findByIdentityId(
            householdId,
            identityId
        );
        if (existing) {
            throw new Error(
                `Member ${identityId} already exists in household ${householdId}`
            );
        }

        return this.memberRepo.create({
            householdId,
            identityId,
            displayName,
            role,
            visibility: HouseholdMemberVisibility.VISIBLE,
        });
    }

    async getHouseholdAccounts(householdId: EntityId): Promise<Account[]> {
        return this.accountRepo.findByHouseholdId(householdId);
    }

    async addAccount(req: CreateAccountRequest): Promise<Account> {
        // Validate household exists
        await this.getHousehold(req.householdId);

        return this.accountRepo.create(req);
    }

    async updateAccount(id: EntityId, update: Partial<Account>): Promise<Account> {
        return this.accountRepo.update(id, update);
    }

    async getLatestSnapshot(householdId: EntityId): Promise<FinancialSnapshot | null> {
        return this.snapshotRepo.findLatestByHouseholdId(householdId);
    }

    async getHouseholdSettings(householdId: EntityId): Promise<HouseholdSettings | null> {
        return this.settingsRepo.findByHouseholdId(householdId);
    }

    async saveSnapshot(
        snapshot: Omit<FinancialSnapshot, "id" | "createdAt">
    ): Promise<FinancialSnapshot> {
        return this.snapshotRepo.create(snapshot);
    }
}

/**
 * Factory function to create HouseholdService with repositories
 */
export function createHouseholdService(
    householdRepo: HouseholdRepository,
    memberRepo: HouseholdMemberRepository,
    accountRepo: AccountRepository,
    snapshotRepo: FinancialSnapshotRepository,
    settingsRepo: HouseholdSettingsRepository
): HouseholdService {
    return new HouseholdService(householdRepo, memberRepo, accountRepo, snapshotRepo, settingsRepo);
}

// Export FinancialSnapshotCalculator for deterministic calculations
export { FinancialSnapshotCalculator, CalculateSnapshotInput, createFinancialSnapshotCalculator } from "./snapshot-calculator";

// Export Statement domain services
export {
    calculateFileChecksum,
    generateObjectStorageKey,
    validateDocumentUpload,
    validateFileContent,
    isValidStatusTransition,
    createUserFacingError,
    VALID_STATUS_TRANSITIONS,
} from "./statements";

// Export Statement Parsers
export { CsvStatementParser } from "./csv-statement-parser";
export { PdfStatementParser } from "./pdf-statement-parser";
export { ImageStatementParser } from "./image-statement-parser";
export {
    StatementParserRegistry,
    StatementParserConfig,
    ParserSelection,
    SecureParserInput,
    createStatementParserRegistry,
    parseStatement,
} from "./statement-parser-registry";

// Export Transaction Normalization
export {
    normalizeTransaction,
    normalizeBatch,
    createNormalizedTransaction,
} from "./transaction-normalizer";

// Export Transaction Reconciliation
export {
    ReconciliationContext,
    ExistingTransaction,
    reconcileTransaction,
    reconcileBatch,
    checkIdempotency,
} from "./transaction-reconciler";

// Export Review Queue
export {
    ReviewQueueService,
    IReviewRepository,
    CreateReviewItemInput,
    ResolveReviewItemInput,
} from "./review-queue";

// Export Transaction Posting
export {
    TransactionPostingService,
    IPostingRepository,
    IFinancialDocumentRepository,
    IReconciliationRepository,
    IFinancialSnapshotCalculator,
    IReviewQueueService,
    PostingConfig,
    PostingContext,
} from "./posting-service";

// Export Budget Service
export {
    BudgetService,
    BudgetTransaction,
    CalculateBudgetInput,
    BUDGET_CALCULATION_VERSION,
    createBudgetService,
} from "./budget-service";

// Export Recurring Detector
export {
    RecurringDetector,
    CashFlowTransaction,
    RECURRING_CALCULATION_VERSION,
    createRecurringDetector,
} from "./recurring-detector";

// Export Cash Flow Service
export {
    CashFlowService,
    CashFlowProjectionInput,
    HistoryCashFlowInput,
    ForecastInput,
    CASHFLOW_CALCULATION_VERSION,
    ESSENTIAL_CATEGORIES,
    createCashFlowService,
} from "./cash-flow-service";

// ── Slice 3: Budget Repository interface ──────────────────────────────────────

import { Budget, EntityId as EId } from "@house-fin/contracts";
import { BudgetTransaction as BT } from "./budget-service";

export interface IBudgetRepository {
    create(budget: Omit<Budget, "id" | "createdAt" | "updatedAt" | "version">): Promise<Budget>;
    findById(id: EId): Promise<Budget | null>;
    findByHouseholdAndPeriod(householdId: EId, year: number, month: number): Promise<Budget[]>;
    findByCategory(householdId: EId, year: number, month: number, category: string): Promise<Budget | null>;
    update(id: EId, updates: { amountCents?: number; notes?: string }, expectedVersion: number): Promise<Budget>;
    delete(id: EId, householdId: EId): Promise<void>;

    /** Returns posted transactions for the household that fall within the given period (inclusive). */
    getTransactionsForPeriod(householdId: EId, year: number, month: number): Promise<BT[]>;

    /** Assigns a category to a posted transaction. Empty string clears the category. */
    categorizeTransaction(transactionId: string, householdId: EId, category: string): Promise<void>;
}

// ── Slice 3: Cash Flow Repository interface ────────────────────────────────────

import { CashFlowTransaction as CFT } from "./recurring-detector";

export interface ICashFlowRepository {
    /** All posted transactions between fromDate (inclusive) and toDate (exclusive). */
    getTransactionsForRange(householdId: EId, fromDate: Date, toDate: Date): Promise<CFT[]>;
    /** Sum of CHECKING + SAVINGS account balances. */
    getLiquidCashCents(householdId: EId): Promise<number>;
    getHouseholdSettings(householdId: EId): Promise<HouseholdSettings | null>;
    getBudgetsForPeriod(householdId: EId, year: number, month: number): Promise<Budget[]>;
}

// Export Savings Goal Service
export {
    SavingsGoalService,
    CalculateGoalInput,
    AnalyzeEmergencyFundInput,
    SAVINGS_GOAL_CALCULATION_VERSION,
    createSavingsGoalService,
} from "./savings-goal-service";

// ── Slice 3: Savings Goal Repository interface ────────────────────────────────

import { SavingsGoal as SG } from "@house-fin/contracts";

export interface ISavingsGoalRepository {
    create(goal: Omit<SG, "id" | "createdAt" | "updatedAt" | "version">): Promise<SG>;
    findById(id: EId): Promise<SG | null>;
    findByHouseholdId(householdId: EId): Promise<SG[]>;
    /** Returns null when no EMERGENCY_FUND goal exists for the household. */
    findEmergencyFundGoal(householdId: EId): Promise<SG | null>;
    update(
        id: EId,
        updates: {
            name?: string;
            targetAmountCents?: number;
            currentAmountCents?: number;
            monthlyContributionCents?: number;
            targetDate?: Date | null;
            notes?: string | null;
        },
        expectedVersion: number,
    ): Promise<SG>;
    delete(id: EId, householdId: EId): Promise<void>;
}

// ── Slice 3: Debt Intelligence ────────────────────────────────────────────────

import { Account as Acct } from "@house-fin/contracts";

export {
    DebtIntelligenceService,
    AnalyzeDebtInput,
    DEBT_INTELLIGENCE_VERSION,
    createDebtIntelligenceService,
} from "./debt-intelligence-service";

export interface IDebtRepository {
    /** All ACTIVE accounts for the household. */
    findActiveAccountsByHousehold(householdId: EId): Promise<Acct[]>;
    /** Update debt-specific columns for a single account. */
    updateDebtDetails(
        accountId: EId,
        householdId: EId,
        details: {
            creditLimitCents?: number | null;
            interestRateBps?: number | null;
            minimumPaymentCents?: number | null;
            scheduledPaymentCents?: number | null;
            statementBalanceCents?: number | null;
            revolvingBalanceCents?: number | null;
        },
    ): Promise<Acct>;
}

// ── Slice 3: Health & Attention Engine ───────────────────────────────────────

export {
    HealthEngine,
    HealthEngineInput,
    OverBudgetEntry,
    GoalSummary,
    RecurringChangeEntry,
    HEALTH_ENGINE_VERSION,
    createHealthEngine,
} from "./health-engine";

// ── Slice 3: Snapshot History & Explainability ────────────────────────────────
export {
    buildSnapshotExplanation,
    buildSnapshotHistory,
    buildSurplusExplanationText,
    SNAPSHOT_HISTORY_VERSION,
} from "./snapshot-history";

// ── Slice 4: Conversational Financial Advisor ──────────────────────────────────

export {
    AdvisorService,
    AdvisorConversationRepository,
    AdvisorMessageRepository,
    WorkflowStateRepository,
    ToolExecutionRepository,
    createAdvisorService,
} from "./advisor-service";

// ── Slice 4: AI Tool Contracts ──────────────────────────────────────────────────
// Re-export from contracts to make available to API layer
export {
    ToolAuthorizationLevel,
    ToolDataClassification,
    AIToolDefinition,
    AIToolRegistry,
    GetFinancialSnapshotTool,
    GetCashFlowTool,
    GetCurrentBudgetTool,
    GetBudgetStatusTool,
    GetHistoricalBudgetPerformanceTool,
    GetGoalStatusTool,
    GetDebtSummaryTool,
    GetAttentionItemsTool,
    GetRecurringFinancialItemsTool,
    SimulatePurchaseTool,
    SimulateBudgetChangeTool,
    CreateInitialBudgetTool,
    AnalyzeBudgetVarianceTool,
    PlanNextMonthBudgetTool,
    type AIToolInput,
    type AIToolOutput,
} from "@house-fin/contracts";


