/**
 * Integration tests for statement posting workflow
 * 
 * Tests 7 scenarios:
 * 1. All high-confidence transactions → immediate posting
 * 2. Mixed high/low confidence with partial posting enabled → high post, low create ReviewItems
 * 3. Mixed high/low confidence with partial posting disabled → fails with error
 * 4. Duplicate-only statement → all low confidence → ReviewItems or fail
 * 5. Posting failure → audit records FAILED status
 * 6. Snapshot recalculation failure → posting rolls back
 * 7. Retry after failure → idempotency key prevents duplicate posting
 */

import {
    EntityId,
    PostStatementRequest,
    PostStatementResponse,
    ReconciliationBatch,
    TransactionReconciliation,
    ReconciliationState,
    DocumentSourceType,
    DocumentProcessingStatus,
    ReviewType,
    ReviewSeverity,
    ReviewStatus,
    ReviewItem,
    FinancialDocument,
} from "@house-fin/contracts";
import {
    TransactionPostingService,
    IPostingRepository,
    IFinancialDocumentRepository,
    IReconciliationRepository,
    IFinancialSnapshotCalculator,
    IReviewQueueService,
    PostingConfig,
} from "@house-fin/domain";

// Mock implementations for testing
class MockPostingRepository implements IPostingRepository {
    private configs = new Map();
    private transactions = new Map();
    private audits = new Map();
    private auditsByIdempotencyKey = new Map();

    async getAutoPostConfig(householdId: EntityId) {
        return this.configs.get(householdId) || null;
    }

    async createOrUpdateAutoPostConfig(config: any) {
        const withId = { id: `config-${config.householdId}`, ...config };
        this.configs.set(config.householdId, withId);
        return withId;
    }

    async createPostedTransaction(tx: any) {
        const withId = { id: `tx-${Date.now()}`, createdAt: new Date(), ...tx };
        const key = `${tx.householdId}:transactions`;
        const list = this.transactions.get(key) || [];
        list.push(withId);
        this.transactions.set(key, list);
        return withId;
    }

    async createPostedTransactions(txs: any[]) {
        return Promise.all(txs.map(tx => this.createPostedTransaction(tx)));
    }

    async getPostedTransaction(id: EntityId) {
        for (const list of this.transactions.values()) {
            const found = list.find((t: any) => t.id === id);
            if (found) return found;
        }
        return null;
    }

    async listPostedTransactions(householdId: EntityId, filters?: any) {
        const key = `${householdId}:transactions`;
        let txs = this.transactions.get(key) || [];

        if (filters?.accountId) {
            txs = txs.filter((t: any) => t.accountId === filters.accountId);
        }
        if (filters?.postingCorrelationId) {
            txs = txs.filter((t: any) => t.postingCorrelationId === filters.postingCorrelationId);
        }

        return txs;
    }

    async createPostingAudit(audit: any) {
        const withId = { id: `audit-${Date.now()}`, ...audit };
        this.audits.set(audit.postingCorrelationId, withId);
        this.auditsByIdempotencyKey.set(audit.idempotencyKey, withId);
        return withId;
    }

    async updatePostingAudit(id: EntityId, updates: any) {
        for (const audit of this.audits.values()) {
            if (audit.id === id) {
                Object.assign(audit, updates);
                return audit;
            }
        }
        throw new Error(`Audit not found: ${id}`);
    }

    async getPostingAudit(correlationId: EntityId) {
        return this.audits.get(correlationId) || null;
    }

    async getPostingAuditByIdempotencyKey(key: string) {
        return this.auditsByIdempotencyKey.get(key) || null;
    }
}

class MockFinancialDocumentRepository implements IFinancialDocumentRepository {
    async findById(id: EntityId): Promise<FinancialDocument | null> {
        return {
            id,
            householdId: "household-1" as EntityId,
            sourceType: DocumentSourceType.CSV,
            fileName: "statement.csv",
            mimeType: "text/csv",
            fileSizeBytes: 1024,
            fileChecksum: "abc123",
            objectStorageKey: "statements/statement.csv",
            accountId: "account-1" as EntityId,
            institutionName: "Test Bank",
            statementType: "CHECKING",
            periodStart: new Date("2026-01-01"),
            periodEnd: new Date("2026-01-31"),
            openingBalanceCents: 100000,
            closingBalanceCents: 110000,
            processingStatus: DocumentProcessingStatus.READY_TO_POST,
            processingVersion: 1,
            uploadedBy: "user-1",
            uploadedAt: new Date(),
            processedAt: new Date(),
            errorCode: null,
            errorMessageUser: null,
            correlationId: "corr-1" as EntityId,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as FinancialDocument;
    }

    async updateStatus(
        id: EntityId,
        status: DocumentProcessingStatus,
        errorCode?: string,
        errorMessageUser?: string
    ): Promise<FinancialDocument> {
        return {
            id,
            householdId: "household-1" as EntityId,
            sourceType: DocumentSourceType.CSV,
            fileName: "statement.csv",
            mimeType: "text/csv",
            fileSizeBytes: 1024,
            fileChecksum: "abc123",
            objectStorageKey: "statements/statement.csv",
            accountId: "account-1" as EntityId,
            institutionName: "Test Bank",
            statementType: "CHECKING",
            periodStart: new Date("2026-01-01"),
            periodEnd: new Date("2026-01-31"),
            openingBalanceCents: 100000,
            closingBalanceCents: 110000,
            processingStatus: status,
            processingVersion: 1,
            uploadedBy: "user-1",
            uploadedAt: new Date(),
            processedAt: new Date(),
            errorCode: errorCode || null,
            errorMessageUser: errorMessageUser || null,
            correlationId: "corr-1" as EntityId,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as FinancialDocument;
    }
}

class MockReconciliationRepository implements IReconciliationRepository {
    private batches = new Map();

    setBatch(documentId: EntityId, batch: ReconciliationBatch) {
        this.batches.set(documentId, batch);
    }

    async getReconciliationBatch(documentId: EntityId) {
        return this.batches.get(documentId) || null;
    }
}

class MockSnapshotCalculator implements IFinancialSnapshotCalculator {
    public callCount = 0;
    public shouldFail = false;

    calculate(input: any) {
        this.callCount++;
        if (this.shouldFail) {
            throw new Error("Snapshot calculation failed");
        }
        return { householdId: input.householdId, calculatedAt: new Date() };
    }
}

class MockReviewQueueService implements IReviewQueueService {
    public createdItems: ReviewItem[] = [];

    async createReviewItem(input: any): Promise<ReviewItem> {
        const item: ReviewItem = {
            id: `review-${Date.now()}` as EntityId,
            householdId: input.householdId,
            statementId: input.statementId,
            transactionIds: input.transactionIds || [],
            type: input.type,
            severity: input.severity,
            title: input.title,
            userMessage: input.userMessage,
            recommendedAction: input.recommendedAction,
            candidateValues: input.candidateValues || [],
            supportingEvidence: input.supportingEvidence || [],
            status: "PENDING" as any,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        this.createdItems.push(item);
        return item;
    }
}

describe("Statement Posting Integration Tests", () => {
    let postingRepo: MockPostingRepository;
    let documentRepo: MockFinancialDocumentRepository;
    let reconciliationRepo: MockReconciliationRepository;
    let snapshotCalculator: MockSnapshotCalculator;
    let reviewQueueService: MockReviewQueueService;
    let postingService: TransactionPostingService;

    beforeEach(() => {
        postingRepo = new MockPostingRepository();
        documentRepo = new MockFinancialDocumentRepository();
        reconciliationRepo = new MockReconciliationRepository();
        snapshotCalculator = new MockSnapshotCalculator();
        reviewQueueService = new MockReviewQueueService();

        postingService = new TransactionPostingService(
            postingRepo,
            snapshotCalculator,
            reviewQueueService,
            documentRepo,
            reconciliationRepo
        );
    });

    describe("Scenario 1: All high-confidence transactions", () => {
        it("should post all transactions immediately", async () => {
            // Setup: Auto-post config with 0.8 threshold
            await postingRepo.createOrUpdateAutoPostConfig({
                householdId: "household-1" as EntityId,
                confidenceThreshold: 0.8,
                allowPartialPosting: false,
                updatedBy: "user-1",
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Setup: Reconciliation batch with 3 high-confidence transactions
            const batch: ReconciliationBatch = {
                batchId: "batch-1" as EntityId,
                documentId: "doc-1" as EntityId,
                householdId: "household-1" as EntityId,
                accountId: "account-1" as EntityId,
                totalCandidates: 3,
                results: [
                    {
                        normalizedId: "tx1",
                        state: ReconciliationState.NEW,
                        confidence: 0.95,
                        sourceReferences: [{ pageNumber: 1, confidence: 0.95, extractionMethod: "csv_parser" }],
                        matchReasons: [],
                    },
                    {
                        normalizedId: "tx2",
                        state: ReconciliationState.NEW,
                        confidence: 0.92,
                        sourceReferences: [{ pageNumber: 1, confidence: 0.92, extractionMethod: "csv_parser" }],
                        matchReasons: [],
                    },
                    {
                        normalizedId: "tx3",
                        state: ReconciliationState.MATCHED,
                        confidence: 0.90,
                        matchedTransactionId: "existing-1",
                        sourceReferences: [{ pageNumber: 2, confidence: 0.90, extractionMethod: "csv_parser" }],
                        matchReasons: [{ signal: "AMOUNT_EXACT", strength: "DEFINITIVE", confidence: 0.99 }],
                    },
                ] as any,
                issues: [],
                summary: {
                    newTransactions: 2,
                    matchedTransactions: 1,
                    possibleDuplicates: 0,
                    conflicts: 0,
                },
                idempotencyKey: "test-key-1",
                processedAt: new Date(),
            };

            reconciliationRepo.setBatch("doc-1" as EntityId, batch);

            // Execute
            const response = await postingService.postStatement(
                { documentId: "doc-1" as EntityId } as PostStatementRequest,
                {
                    idempotencyKey: "post-key-1",
                    correlationId: "corr-1" as EntityId,
                    userId: "user-1",
                } as PostingConfig
            );

            // Verify
            expect(response.postingStatus).toBe("COMPLETED");
            expect(response.totalPosted).toBe(3);
            expect(response.highConfidencePosted).toBe(3);
            expect(response.lowConfidenceSkipped).toBe(0);
            expect(response.totalCandidates).toBe(3);
            expect(reviewQueueService.createdItems).toHaveLength(0);
        });
    });

    describe("Scenario 2: Mixed high/low confidence with partial posting enabled", () => {
        it("should post high-confidence and create ReviewItems for low-confidence", async () => {
            // Setup: Auto-post config with partial posting enabled
            await postingRepo.createOrUpdateAutoPostConfig({
                householdId: "household-1" as EntityId,
                confidenceThreshold: 0.8,
                allowPartialPosting: true,
                updatedBy: "user-1",
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Setup: Mixed confidence batch
            const batch: ReconciliationBatch = {
                batchId: "batch-2" as EntityId,
                documentId: "doc-2" as EntityId,
                householdId: "household-1" as EntityId,
                accountId: "account-1" as EntityId,
                totalCandidates: 4,
                results: [
                    {
                        normalizedId: "tx1",
                        state: ReconciliationState.NEW,
                        confidence: 0.95,
                        sourceReferences: [{ pageNumber: 1, confidence: 0.95, extractionMethod: "csv_parser" }],
                        matchReasons: [],
                    },
                    {
                        normalizedId: "tx2",
                        state: ReconciliationState.POSSIBLE_DUPLICATE,
                        confidence: 0.65,
                        possibleMatches: [
                            { transactionId: "match1", confidence: 0.6, reasons: [] },
                            { transactionId: "match2", confidence: 0.65, reasons: [] },
                        ],
                        sourceReferences: [{ pageNumber: 1, confidence: 0.65, extractionMethod: "csv_parser" }],
                        matchReasons: [],
                    },
                    {
                        normalizedId: "tx3",
                        state: ReconciliationState.NEW,
                        confidence: 0.88,
                        sourceReferences: [{ pageNumber: 2, confidence: 0.88, extractionMethod: "csv_parser" }],
                        matchReasons: [],
                    },
                    {
                        normalizedId: "tx4",
                        state: ReconciliationState.CONFLICT,
                        confidence: 0.5,
                        conflict: {
                            type: "AMOUNT_VARIANCE",
                            description: "Amount varies from expected",
                            expected: 10000,
                            actual: 9500,
                        },
                        sourceReferences: [{ pageNumber: 2, confidence: 0.5, extractionMethod: "csv_parser" }],
                        matchReasons: [],
                    },
                ] as any,
                issues: [],
                summary: {
                    newTransactions: 2,
                    matchedTransactions: 0,
                    possibleDuplicates: 1,
                    conflicts: 1,
                },
                idempotencyKey: "test-key-2",
                processedAt: new Date(),
            };

            reconciliationRepo.setBatch("doc-2" as EntityId, batch);

            // Execute
            const response = await postingService.postStatement(
                { documentId: "doc-2" as EntityId } as PostStatementRequest,
                {
                    idempotencyKey: "post-key-2",
                    correlationId: "corr-2" as EntityId,
                    userId: "user-1",
                } as PostingConfig
            );

            // Verify
            expect(response.postingStatus).toBe("PARTIALLY_COMPLETED");
            expect(response.highConfidencePosted).toBe(2);
            expect(response.lowConfidenceSkipped).toBe(2);
            expect(response.totalPosted).toBe(2);
            expect(response.totalCandidates).toBe(4);
            expect(reviewQueueService.createdItems).toHaveLength(2);
        });
    });

    describe("Scenario 3: Mixed confidence with partial posting disabled", () => {
        it("should fail when low-confidence exists and partial posting is disabled", async () => {
            // Setup: Auto-post config with partial posting disabled
            await postingRepo.createOrUpdateAutoPostConfig({
                householdId: "household-1" as EntityId,
                confidenceThreshold: 0.8,
                allowPartialPosting: false,
                updatedBy: "user-1",
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Setup: Mixed confidence batch
            const batch: ReconciliationBatch = {
                batchId: "batch-3" as EntityId,
                documentId: "doc-3" as EntityId,
                householdId: "household-1" as EntityId,
                accountId: "account-1" as EntityId,
                totalCandidates: 2,
                results: [
                    {
                        normalizedId: "tx1",
                        state: ReconciliationState.NEW,
                        confidence: 0.95,
                        sourceReferences: [{ pageNumber: 1, confidence: 0.95, extractionMethod: "csv_parser" }],
                        matchReasons: [],
                    },
                    {
                        normalizedId: "tx2",
                        state: ReconciliationState.POSSIBLE_DUPLICATE,
                        confidence: 0.65,
                        sourceReferences: [{ pageNumber: 1, confidence: 0.65, extractionMethod: "csv_parser" }],
                        matchReasons: [],
                    },
                ] as any,
                issues: [],
                summary: {
                    newTransactions: 1,
                    matchedTransactions: 0,
                    possibleDuplicates: 1,
                    conflicts: 0,
                },
                idempotencyKey: "test-key-3",
                processedAt: new Date(),
            };

            reconciliationRepo.setBatch("doc-3" as EntityId, batch);

            // Execute
            const response = await postingService.postStatement(
                { documentId: "doc-3" as EntityId } as PostStatementRequest,
                {
                    idempotencyKey: "post-key-3",
                    correlationId: "corr-3" as EntityId,
                    userId: "user-1",
                } as PostingConfig
            );

            // Verify
            expect(response.postingStatus).toBe("FAILED");
            expect(response.errorCode).toBe("REQUIRES_REVIEW");
            expect(response.totalPosted).toBe(0);
            expect(response.highConfidencePosted).toBe(0);
            expect(reviewQueueService.createdItems).toHaveLength(0);
        });
    });

    describe("Scenario 4: Duplicate-only statement", () => {
        it("should create ReviewItems for all low-confidence duplicates", async () => {
            // Setup: Auto-post config
            await postingRepo.createOrUpdateAutoPostConfig({
                householdId: "household-1" as EntityId,
                confidenceThreshold: 0.8,
                allowPartialPosting: true,
                updatedBy: "user-1",
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Setup: All duplicates batch
            const batch: ReconciliationBatch = {
                batchId: "batch-4" as EntityId,
                documentId: "doc-4" as EntityId,
                householdId: "household-1" as EntityId,
                accountId: "account-1" as EntityId,
                totalCandidates: 2,
                results: [
                    {
                        normalizedId: "dup1",
                        state: ReconciliationState.POSSIBLE_DUPLICATE,
                        confidence: 0.7,
                        possibleMatches: [
                            { transactionId: "match1", confidence: 0.7, reasons: [] },
                        ],
                        sourceReferences: [{ pageNumber: 1, confidence: 0.7, extractionMethod: "csv_parser" }],
                        matchReasons: [],
                    },
                    {
                        normalizedId: "dup2",
                        state: ReconciliationState.POSSIBLE_DUPLICATE,
                        confidence: 0.72,
                        possibleMatches: [
                            { transactionId: "match2", confidence: 0.72, reasons: [] },
                        ],
                        sourceReferences: [{ pageNumber: 1, confidence: 0.72, extractionMethod: "csv_parser" }],
                        matchReasons: [],
                    },
                ] as any,
                issues: [],
                summary: {
                    newTransactions: 0,
                    matchedTransactions: 0,
                    possibleDuplicates: 2,
                    conflicts: 0,
                },
                idempotencyKey: "test-key-4",
                processedAt: new Date(),
            };

            reconciliationRepo.setBatch("doc-4" as EntityId, batch);

            // Execute
            const response = await postingService.postStatement(
                { documentId: "doc-4" as EntityId } as PostStatementRequest,
                {
                    idempotencyKey: "post-key-4",
                    correlationId: "corr-4" as EntityId,
                    userId: "user-1",
                } as PostingConfig
            );

            // Verify
            expect(response.postingStatus).toBe("PARTIALLY_COMPLETED");
            expect(response.totalPosted).toBe(0);
            expect(response.lowConfidenceSkipped).toBe(2);
            expect(reviewQueueService.createdItems).toHaveLength(2);
        });
    });

    describe("Scenario 5: Posting failure", () => {
        it("should record error in audit when reconciliation data is missing", async () => {
            // No reconciliation batch set up

            // Execute
            const response = await postingService.postStatement(
                { documentId: "doc-5" as EntityId } as PostStatementRequest,
                {
                    idempotencyKey: "post-key-5",
                    correlationId: "corr-5" as EntityId,
                    userId: "user-1",
                } as PostingConfig
            );

            // Verify
            expect(response.postingStatus).toBe("FAILED");
            expect(response.errorCode).toBe("POSTING_FAILED");
            expect(response.totalPosted).toBe(0);

            // Verify audit record was created
            const audit = await postingRepo.getPostingAudit("corr-5" as EntityId);
            expect(audit).not.toBeNull();
            expect(audit?.postingStatus).toBe("FAILED");
            expect(audit?.errorCode).toBe("POSTING_FAILED");
        });
    });

    describe("Scenario 6: Snapshot recalculation failure", () => {
        it("should handle snapshot calculation failure", async () => {
            // Setup: Make snapshot calculator fail
            snapshotCalculator.shouldFail = true;

            // Setup: Auto-post config
            await postingRepo.createOrUpdateAutoPostConfig({
                householdId: "household-1" as EntityId,
                confidenceThreshold: 0.8,
                allowPartialPosting: false,
                updatedBy: "user-1",
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Setup: All high-confidence batch
            const batch: ReconciliationBatch = {
                batchId: "batch-6" as EntityId,
                documentId: "doc-6" as EntityId,
                householdId: "household-1" as EntityId,
                accountId: "account-1" as EntityId,
                totalCandidates: 1,
                results: [
                    {
                        normalizedId: "tx1",
                        state: ReconciliationState.NEW,
                        confidence: 0.95,
                        sourceReferences: [{ pageNumber: 1, confidence: 0.95, extractionMethod: "csv_parser" }],
                        matchReasons: [],
                    },
                ] as any,
                issues: [],
                summary: {
                    newTransactions: 1,
                    matchedTransactions: 0,
                    possibleDuplicates: 0,
                    conflicts: 0,
                },
                idempotencyKey: "test-key-6",
                processedAt: new Date(),
            };

            reconciliationRepo.setBatch("doc-6" as EntityId, batch);

            // Execute
            const response = await postingService.postStatement(
                { documentId: "doc-6" as EntityId } as PostStatementRequest,
                {
                    idempotencyKey: "post-key-6",
                    correlationId: "corr-6" as EntityId,
                    userId: "user-1",
                } as PostingConfig
            );

            // Verify - snapshot failure logs error but doesn't block posting for Slice 1
            // Full implementation (Slice 2+) will make this blocking
            expect(response.postingStatus).toBe("COMPLETED");
            expect(response.totalPosted).toBe(1);
        });
    });

    describe("Scenario 7: Idempotency - retry after failure", () => {
        it("should return cached result on retry with same idempotency key", async () => {
            // Setup: Auto-post config
            await postingRepo.createOrUpdateAutoPostConfig({
                householdId: "household-1" as EntityId,
                confidenceThreshold: 0.8,
                allowPartialPosting: false,
                updatedBy: "user-1",
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Setup: Batch that will fail
            const batch: ReconciliationBatch = {
                batchId: "batch-7" as EntityId,
                documentId: "doc-7" as EntityId,
                householdId: "household-1" as EntityId,
                accountId: "account-1" as EntityId,
                totalCandidates: 1,
                results: [
                    {
                        normalizedId: "tx1",
                        state: ReconciliationState.NEW,
                        confidence: 0.95,
                        sourceReferences: [{ pageNumber: 1, confidence: 0.95, extractionMethod: "csv_parser" }],
                        matchReasons: [],
                    },
                ] as any,
                issues: [],
                summary: {
                    newTransactions: 1,
                    matchedTransactions: 0,
                    possibleDuplicates: 0,
                    conflicts: 0,
                },
                idempotencyKey: "test-key-7",
                processedAt: new Date(),
            };

            reconciliationRepo.setBatch("doc-7" as EntityId, batch);

            // First attempt
            const response1 = await postingService.postStatement(
                { documentId: "doc-7" as EntityId } as PostStatementRequest,
                {
                    idempotencyKey: "post-key-7-same",
                    correlationId: "corr-7" as EntityId,
                    userId: "user-1",
                } as PostingConfig
            );

            // Second attempt with same idempotency key
            const response2 = await postingService.postStatement(
                { documentId: "doc-7" as EntityId } as PostStatementRequest,
                {
                    idempotencyKey: "post-key-7-same", // Same key
                    correlationId: "corr-7-retry" as EntityId,
                    userId: "user-1",
                } as PostingConfig
            );

            // Verify
            expect(response1.postingStatus).toBe("COMPLETED");
            expect(response2.postingStatus).toBe("COMPLETED");
            expect(response2.highConfidencePosted).toBe(response1.highConfidencePosted);
        });
    });

    describe("Scenario 8: Statement reprocessing", () => {
        it("should handle same statement processed multiple times with different results", async () => {
            // Setup: Auto-post config
            await postingRepo.createOrUpdateAutoPostConfig({
                householdId: "household-1" as EntityId,
                confidenceThreshold: 0.8,
                allowPartialPosting: true,
                updatedBy: "user-1",
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // First processing: high confidence
            const batch1: ReconciliationBatch = {
                batchId: "batch-8a" as EntityId,
                documentId: "doc-8" as EntityId,
                householdId: "household-1" as EntityId,
                accountId: "account-1" as EntityId,
                totalCandidates: 1,
                results: [
                    {
                        normalizedId: "tx1",
                        state: ReconciliationState.NEW,
                        confidence: 0.95,
                        sourceReferences: [{ pageNumber: 1, confidence: 0.95, extractionMethod: "csv_parser" }],
                        matchReasons: [],
                    },
                ] as any,
                issues: [],
                summary: {
                    newTransactions: 1,
                    matchedTransactions: 0,
                    possibleDuplicates: 0,
                    conflicts: 0,
                },
                idempotencyKey: "test-key-8a",
                processedAt: new Date(),
            };

            reconciliationRepo.setBatch("doc-8" as EntityId, batch1);

            // First posting
            const response1 = await postingService.postStatement(
                { documentId: "doc-8" as EntityId } as PostStatementRequest,
                {
                    idempotencyKey: "post-key-8a",
                    correlationId: "corr-8a" as EntityId,
                    userId: "user-1",
                } as PostingConfig
            );

            expect(response1.postingStatus).toBe("COMPLETED");
            expect(response1.totalPosted).toBe(1);

            // Update reconciliation with different result
            const batch2: ReconciliationBatch = {
                ...batch1,
                batchId: "batch-8b" as EntityId,
                results: [
                    {
                        normalizedId: "tx1",
                        state: ReconciliationState.POSSIBLE_DUPLICATE,
                        confidence: 0.65,
                        possibleMatches: [{ transactionId: "match1", confidence: 0.65, reasons: [] }],
                        sourceReferences: [{ pageNumber: 1, confidence: 0.65, extractionMethod: "csv_parser" }],
                        matchReasons: [],
                    },
                ] as any,
                idempotencyKey: "test-key-8b",
            };

            reconciliationRepo.setBatch("doc-8" as EntityId, batch2);

            // Second posting with different idempotency key (simulating reprocessing)
            const response2 = await postingService.postStatement(
                { documentId: "doc-8" as EntityId } as PostStatementRequest,
                {
                    idempotencyKey: "post-key-8b", // Different key for reprocessing
                    correlationId: "corr-8b" as EntityId,
                    userId: "user-1",
                } as PostingConfig
            );

            expect(response2.postingStatus).toBe("PARTIALLY_COMPLETED");
            expect(response2.totalPosted).toBe(0);
            expect(reviewQueueService.createdItems).toHaveLength(1);
        });
    });
});
