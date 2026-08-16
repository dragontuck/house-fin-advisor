/**
 * Domain service for Household, HouseholdMember, and Account operations
 */
import { Household, HouseholdMember, Account, FinancialSnapshot, HouseholdSettings, FinancialDocument, HouseholdMemberRole, EntityId, CreateHouseholdRequest, CreateAccountRequest, DocumentProcessingStatus } from "@house-fin/contracts";
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
    findByIdentityId(householdId: EntityId, identityId: string): Promise<HouseholdMember | null>;
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
    findByHouseholdAndDate(householdId: EntityId, date: Date): Promise<FinancialSnapshot | null>;
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
    findByChecksum(householdId: EntityId, checksum: string): Promise<FinancialDocument | null>;
    update(id: EntityId, document: Partial<FinancialDocument>): Promise<FinancialDocument>;
    updateStatus(id: EntityId, status: DocumentProcessingStatus, errorCode?: string, errorMessageUser?: string, correlationId?: string, reason?: string): Promise<FinancialDocument>;
    softDelete(id: EntityId, reason?: string): Promise<void>;
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
export declare class HouseholdService {
    private householdRepo;
    private memberRepo;
    private accountRepo;
    private snapshotRepo;
    private settingsRepo;
    constructor(householdRepo: HouseholdRepository, memberRepo: HouseholdMemberRepository, accountRepo: AccountRepository, snapshotRepo: FinancialSnapshotRepository, settingsRepo: HouseholdSettingsRepository);
    createHousehold(req: CreateHouseholdRequest): Promise<Household>;
    getHousehold(id: EntityId): Promise<Household>;
    getHouseholdMembers(householdId: EntityId): Promise<HouseholdMember[]>;
    addMember(householdId: EntityId, identityId: string, displayName: string, role?: HouseholdMemberRole): Promise<HouseholdMember>;
    getHouseholdAccounts(householdId: EntityId): Promise<Account[]>;
    addAccount(req: CreateAccountRequest): Promise<Account>;
    updateAccount(id: EntityId, update: Partial<Account>): Promise<Account>;
    getLatestSnapshot(householdId: EntityId): Promise<FinancialSnapshot | null>;
    getHouseholdSettings(householdId: EntityId): Promise<HouseholdSettings | null>;
    saveSnapshot(snapshot: Omit<FinancialSnapshot, "id" | "createdAt">): Promise<FinancialSnapshot>;
}
/**
 * Factory function to create HouseholdService with repositories
 */
export declare function createHouseholdService(householdRepo: HouseholdRepository, memberRepo: HouseholdMemberRepository, accountRepo: AccountRepository, snapshotRepo: FinancialSnapshotRepository, settingsRepo: HouseholdSettingsRepository): HouseholdService;
export { FinancialSnapshotCalculator, CalculateSnapshotInput, createFinancialSnapshotCalculator } from "./snapshot-calculator";
export { calculateFileChecksum, generateObjectStorageKey, validateDocumentUpload, validateFileContent, isValidStatusTransition, createUserFacingError, VALID_STATUS_TRANSITIONS, } from "./statements";
export { CsvStatementParser } from "./csv-statement-parser";
export { PdfStatementParser } from "./pdf-statement-parser";
export { ImageStatementParser } from "./image-statement-parser";
export { StatementParserRegistry, StatementParserConfig, ParserSelection, SecureParserInput, createStatementParserRegistry, parseStatement, } from "./statement-parser-registry";
export { normalizeTransaction, normalizeBatch, createNormalizedTransaction, } from "./transaction-normalizer";
export { ReconciliationContext, ExistingTransaction, reconcileTransaction, reconcileBatch, checkIdempotency, } from "./transaction-reconciler";
export { ReviewQueueService, IReviewRepository, CreateReviewItemInput, ResolveReviewItemInput, } from "./review-queue";
export { TransactionPostingService, IPostingRepository, IFinancialDocumentRepository, IReconciliationRepository, IFinancialSnapshotCalculator, IReviewQueueService, PostingConfig, PostingContext, } from "./posting-service";
//# sourceMappingURL=index.d.ts.map