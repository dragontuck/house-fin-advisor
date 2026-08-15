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
