/**
 * Repository tests for FinancialDocument persistence
 * Tests database operations: create, read, update, duplicate detection
 */

import { v4 as uuidv4 } from "uuid";
import { EntityId, DocumentProcessingStatus, DocumentSourceType } from "@house-fin/contracts";
import { PgFinancialDocumentRepository } from "../../apps/api/src/db/repositories";
import { query } from "../../apps/api/src/db/connection";

describe("PgFinancialDocumentRepository", () => {
    const repo = new PgFinancialDocumentRepository();

    // Setup: Create test household
    let testHouseholdId: EntityId;

    beforeAll(async () => {
        // Create a test household for document tests
        const result = await query(
            "INSERT INTO finhouse.households (name) VALUES ($1) RETURNING id",
            ["Test Household for Documents"]
        );
        testHouseholdId = EntityId(result.rows[0].id);
    });

    afterAll(async () => {
        // Cleanup: Delete test household (cascades to documents)
        await query("DELETE FROM finhouse.households WHERE id = $1", [testHouseholdId]);
    });

    describe("create", () => {
        it("should create a document with all fields", async () => {
            const doc = await repo.create({
                householdId: testHouseholdId,
                sourceType: DocumentSourceType.CSV,
                fileName: "statement.csv",
                mimeType: "text/csv",
                fileSizeBytes: 1024,
                fileChecksum: "a".repeat(64),
                objectStorageKey: `household-${testHouseholdId}/statements/${uuidv4()}/statement.csv`,
                processingStatus: DocumentProcessingStatus.UPLOADED,
                processingVersion: 1,
                uploadedBy: "test-user",
                uploadedAt: new Date(),
                correlationId: EntityId(uuidv4()),
            });

            expect(doc.id).toBeDefined();
            expect(doc.householdId).toBe(testHouseholdId);
            expect(doc.sourceType).toBe(DocumentSourceType.CSV);
            expect(doc.fileName).toBe("statement.csv");
            expect(doc.processingStatus).toBe(DocumentProcessingStatus.UPLOADED);
            expect(doc.createdAt).toBeDefined();
            expect(doc.updatedAt).toBeDefined();
        });

        it("should create document with optional fields", async () => {
            const doc = await repo.create({
                householdId: testHouseholdId,
                sourceType: DocumentSourceType.PDF,
                fileName: "statement.pdf",
                mimeType: "application/pdf",
                fileSizeBytes: 5000,
                fileChecksum: "b".repeat(64),
                objectStorageKey: `household-${testHouseholdId}/statements/${uuidv4()}/statement.pdf`,
                accountId: null,
                institutionName: "Chase Bank",
                statementType: "CHECKING",
                periodStart: new Date("2026-01-01"),
                periodEnd: new Date("2026-01-31"),
                openingBalanceCents: 50000,
                closingBalanceCents: 55000,
                processingStatus: DocumentProcessingStatus.UPLOADED,
                processingVersion: 1,
                uploadedBy: "test-user",
                uploadedAt: new Date(),
                correlationId: EntityId(uuidv4()),
            });

            expect(doc.accountId).toBeNull();
            expect(doc.institutionName).toBe("Chase Bank");
            expect(doc.statementType).toBe("CHECKING");
            expect(doc.periodStart).toBeDefined();
            expect(doc.openingBalanceCents).toBe(50000);
        });

        it("should enforce unique constraint on checksum per household", async () => {
            const checksum = "c".repeat(64);
            const objectKey1 = `household-${testHouseholdId}/statements/${uuidv4()}/statement1.csv`;
            const objectKey2 = `household-${testHouseholdId}/statements/${uuidv4()}/statement2.csv`;

            // Create first document
            const doc1 = await repo.create({
                householdId: testHouseholdId,
                sourceType: DocumentSourceType.CSV,
                fileName: "statement1.csv",
                mimeType: "text/csv",
                fileSizeBytes: 1000,
                fileChecksum: checksum,
                objectStorageKey: objectKey1,
                processingStatus: DocumentProcessingStatus.UPLOADED,
                processingVersion: 1,
                uploadedBy: "test-user",
                uploadedAt: new Date(),
                correlationId: EntityId(uuidv4()),
            });

            expect(doc1.id).toBeDefined();

            // Try to create second document with same checksum should fail
            try {
                await repo.create({
                    householdId: testHouseholdId,
                    sourceType: DocumentSourceType.CSV,
                    fileName: "statement2.csv",
                    mimeType: "text/csv",
                    fileSizeBytes: 1000,
                    fileChecksum: checksum,
                    objectStorageKey: objectKey2,
                    processingStatus: DocumentProcessingStatus.UPLOADED,
                    processingVersion: 1,
                    uploadedBy: "test-user",
                    uploadedAt: new Date(),
                    correlationId: EntityId(uuidv4()),
                });
                fail("Should have thrown duplicate key error");
            } catch (error: any) {
                expect(error.message).toContain("duplicate");
            }
        });
    });

    describe("findById", () => {
        it("should find document by ID", async () => {
            const created = await repo.create({
                householdId: testHouseholdId,
                sourceType: DocumentSourceType.CSV,
                fileName: "test.csv",
                mimeType: "text/csv",
                fileSizeBytes: 500,
                fileChecksum: "d".repeat(64),
                objectStorageKey: `household-${testHouseholdId}/statements/${uuidv4()}/test.csv`,
                processingStatus: DocumentProcessingStatus.UPLOADED,
                processingVersion: 1,
                uploadedBy: "test-user", uploadedAt: new Date(), correlationId: EntityId(uuidv4()),
            });

            const found = await repo.findById(created.id);
            expect(found).not.toBeNull();
            expect(found?.id).toBe(created.id);
            expect(found?.fileName).toBe("test.csv");
        });

        it("should return null for non-existent ID", async () => {
            const found = await repo.findById(EntityId(uuidv4()));
            expect(found).toBeNull();
        });
    });

    describe("findByHouseholdId", () => {
        it("should find all documents for household", async () => {
            const household2 = await query(
                "INSERT INTO finhouse.households (name) VALUES ($1) RETURNING id",
                ["Test Household 2"]
            );
            const household2Id = EntityId(household2.rows[0].id);

            // Create 3 documents for household2
            for (let i = 0; i < 3; i++) {
                await repo.create({
                    householdId: household2Id,
                    sourceType: DocumentSourceType.CSV,
                    fileName: `statement${i}.csv`,
                    mimeType: "text/csv",
                    fileSizeBytes: 100 + i,
                    fileChecksum: `${"e".repeat(63)}${i}`,
                    objectStorageKey: `household-${household2Id}/statements/${uuidv4()}/statement${i}.csv`,
                    processingStatus: DocumentProcessingStatus.UPLOADED,
                    processingVersion: 1,
                    uploadedBy: "test-user",
                    uploadedAt: new Date(),
                    correlationId: EntityId(uuidv4()),
                });
            }

            const docs = await repo.findByHouseholdId(household2Id);
            expect(docs.length).toBeGreaterThanOrEqual(3);
            expect(docs.every((d) => d.householdId === household2Id)).toBe(true);

            // Cleanup
            await query("DELETE FROM finhouse.households WHERE id = $1", [household2Id]);
        });

        it("should return empty array for household with no documents", async () => {
            const docs = await repo.findByHouseholdId(EntityId(uuidv4()));
            expect(docs).toEqual([]);
        });
    });

    describe("findByChecksum", () => {
        it("should find document by checksum within household", async () => {
            const checksum = "f".repeat(64);
            const created = await repo.create({
                householdId: testHouseholdId,
                sourceType: DocumentSourceType.CSV,
                fileName: "checksum-test.csv",
                mimeType: "text/csv",
                fileSizeBytes: 200,
                fileChecksum: checksum,
                objectStorageKey: `household-${testHouseholdId}/statements/${uuidv4()}/checksum-test.csv`,
                processingStatus: DocumentProcessingStatus.UPLOADED,
                processingVersion: 1,
                uploadedBy: "test-user",
                uploadedAt: new Date(),
                correlationId: EntityId(uuidv4()),
            });

            const found = await repo.findByChecksum(testHouseholdId, checksum);
            expect(found).not.toBeNull();
            expect(found?.id).toBe(created.id);
        });

        it("should return null for checksum not in household", async () => {
            const found = await repo.findByChecksum(testHouseholdId, "0".repeat(64));
            expect(found).toBeNull();
        });

        it("should not find checksum from different household", async () => {
            const household3 = await query(
                "INSERT INTO finhouse.households (name) VALUES ($1) RETURNING id",
                ["Test Household 3"]
            );
            const household3Id = EntityId(household3.rows[0].id);

            const checksum = "1".repeat(64);
            const created = await repo.create({
                householdId: household3Id,
                sourceType: DocumentSourceType.CSV,
                fileName: "isolation-test.csv",
                mimeType: "text/csv",
                fileSizeBytes: 300,
                fileChecksum: checksum,
                objectStorageKey: `household-${household3Id}/statements/${uuidv4()}/isolation-test.csv`,
                processingStatus: DocumentProcessingStatus.UPLOADED,
                processingVersion: 1,
                uploadedBy: "test-user",
                uploadedAt: new Date(),
                correlationId: EntityId(uuidv4()),
            });

            // Try to find from different household - should not find
            const found = await repo.findByChecksum(testHouseholdId, checksum);
            expect(found).toBeNull();

            // Cleanup
            await query("DELETE FROM finhouse.households WHERE id = $1", [household3Id]);
        });
    });

    describe("updateStatus", () => {
        it("should update processing status", async () => {
            const created = await repo.create({
                householdId: testHouseholdId,
                sourceType: DocumentSourceType.CSV,
                fileName: "status-test.csv",
                mimeType: "text/csv",
                fileSizeBytes: 400,
                fileChecksum: "2".repeat(64),
                objectStorageKey: `household-${testHouseholdId}/statements/${uuidv4()}/status-test.csv`,
                processingStatus: DocumentProcessingStatus.UPLOADED,
                processingVersion: 1,
                uploadedBy: "test-user",
                uploadedAt: new Date(),
                correlationId: EntityId(uuidv4()),
            });

            const updated = await repo.updateStatus(
                created.id,
                DocumentProcessingStatus.VALIDATING
            );

            expect(updated.processingStatus).toBe(DocumentProcessingStatus.VALIDATING);
            expect(updated.processedAt).toBeNull(); // Not yet processed to completion
        });

        it("should set error code and message", async () => {
            const created = await repo.create({
                householdId: testHouseholdId,
                sourceType: DocumentSourceType.CSV,
                fileName: "error-test.csv",
                mimeType: "text/csv",
                fileSizeBytes: 500,
                fileChecksum: "3".repeat(64),
                objectStorageKey: `household-${testHouseholdId}/statements/${uuidv4()}/error-test.csv`,
                processingStatus: DocumentProcessingStatus.UPLOADED,
                processingVersion: 1,
                uploadedBy: "test-user",
                uploadedAt: new Date(),
                correlationId: EntityId(uuidv4()),
            });

            const updated = await repo.updateStatus(
                created.id,
                DocumentProcessingStatus.VALIDATION_FAILED,
                "INVALID_FORMAT",
                "The file format could not be recognized"
            );

            expect(updated.processingStatus).toBe(DocumentProcessingStatus.VALIDATION_FAILED);
            expect(updated.errorCode).toBe("INVALID_FORMAT");
            expect(updated.errorMessageUser).toBe("The file format could not be recognized");
        });
    });

    describe("update", () => {
        it("should update document metadata", async () => {
            const created = await repo.create({
                householdId: testHouseholdId,
                sourceType: DocumentSourceType.PDF,
                fileName: "original.pdf",
                mimeType: "application/pdf",
                fileSizeBytes: 2000,
                fileChecksum: "4".repeat(64),
                objectStorageKey: `household-${testHouseholdId}/statements/${uuidv4()}/original.pdf`,
                processingStatus: DocumentProcessingStatus.UPLOADED,
                processingVersion: 1,
                uploadedBy: "test-user",
                uploadedAt: new Date(),
                correlationId: EntityId(uuidv4()),
            });

            const updated = await repo.update(created.id, {
                institutionName: "Bank of Test",
                statementType: "SAVINGS",
                periodStart: new Date("2026-02-01"),
            });

            expect(updated.institutionName).toBe("Bank of Test");
            expect(updated.statementType).toBe("SAVINGS");
            // Compare dates as ISO strings since DATE columns don't have timezone info
            expect(updated.periodStart?.toISOString().split('T')[0]).toBe("2026-02-01");
        });
    });
});
