/**
 * End-to-End Tests for Document Upload and Processing
 * Tests the complete workflow: upload → storage → database → status checking
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import { createServer } from "../../src/server";
import { query } from "../../src/db/connection";
import { EntityId, DocumentProcessingStatus } from "@house-fin/contracts";
import { calculateFileChecksum } from "@house-fin/domain";

/**
 * Helper to create test context
 */
interface TestContext {
    app: ReturnType<typeof createServer>;
    householdId: EntityId;
    correlationId: string;
    authToken?: string;
}

let testContext: TestContext;

beforeAll(() => {
    testContext = {
        app: createServer(),
        householdId: EntityId(uuidv4()),
        correlationId: uuidv4(),
    };
});

afterAll(async () => {
    // Clean up test data
    await query(
        "DELETE FROM finhouse.financial_documents WHERE household_id = $1",
        [testContext.householdId]
    );
});

describe("Document Upload E2E", () => {
    /**
     * Happy path: Upload valid CSV, store in MinIO, create DB record, query status
     */
    test("should upload CSV file and retrieve status", async () => {
        // Create valid CSV content
        const csvContent = `Date,Description,Amount\n2024-01-01,Deposit,1000.00\n2024-01-02,Purchase,-50.00`;
        const fileBuffer = Buffer.from(csvContent, "utf8");
        const fileChecksum = calculateFileChecksum(fileBuffer);

        // Upload file
        const uploadResponse = await request(testContext.app)
            .post("/documents/upload")
            .set("X-Household-Id", testContext.householdId)
            .set("X-Correlation-Id", testContext.correlationId)
            .send({
                fileName: "statement.csv",
                mimeType: "text/csv",
                fileSize: fileBuffer.length,
                sourceType: "CSV",
                fileContent: fileBuffer.toString("base64"),
            });

        expect(uploadResponse.status).toBe(202); // Accepted
        expect(uploadResponse.body.id).toBeDefined();
        expect(uploadResponse.body.status).toBe(DocumentProcessingStatus.UPLOADED);

        const documentId = uploadResponse.body.id;

        // Verify document in database
        const dbResult = await query(
            "SELECT * FROM finhouse.financial_documents WHERE id = $1",
            [documentId]
        );

        expect(dbResult.rows.length).toBe(1);
        const dbDoc = dbResult.rows[0];
        expect(dbDoc.household_id).toBe(testContext.householdId);
        expect(dbDoc.file_checksum).toBe(fileChecksum);
        expect(dbDoc.file_size_bytes).toBe(fileBuffer.length);
        expect(dbDoc.mime_type).toBe("text/csv");
        expect(dbDoc.file_name).toBe("statement.csv");
        expect(dbDoc.processing_status).toBe(DocumentProcessingStatus.UPLOADED);

        // Query document status
        const statusResponse = await request(testContext.app)
            .get(`/documents/${documentId}`)
            .set("X-Household-Id", testContext.householdId)
            .set("X-Correlation-Id", testContext.correlationId);

        expect(statusResponse.status).toBe(200);
        expect(statusResponse.body.id).toBe(documentId);
        expect(statusResponse.body.processingStatus).toBe(DocumentProcessingStatus.UPLOADED);
    });

    /**
     * Idempotency: Upload same file twice should return existing document
     */
    test("should return existing document on duplicate upload", async () => {
        const csvContent = `Date,Description,Amount\n2024-01-01,Transfer,500.00`;
        const fileBuffer = Buffer.from(csvContent, "utf8");

        // Upload once
        const upload1 = await request(testContext.app)
            .post("/documents/upload")
            .set("X-Household-Id", testContext.householdId)
            .set("X-Correlation-Id", uuidv4())
            .send({
                fileName: "recurring.csv",
                mimeType: "text/csv",
                fileSize: fileBuffer.length,
                sourceType: "CSV",
                fileContent: fileBuffer.toString("base64"),
            });

        expect(upload1.status).toBe(202);
        const doc1Id = upload1.body.id;

        // Upload again with same content
        const upload2 = await request(testContext.app)
            .post("/documents/upload")
            .set("X-Household-Id", testContext.householdId)
            .set("X-Correlation-Id", uuidv4())
            .send({
                fileName: "recurring.csv",
                mimeType: "text/csv",
                fileSize: fileBuffer.length,
                sourceType: "CSV",
                fileContent: fileBuffer.toString("base64"),
            });

        // Should return 200 (idempotent) with same document ID
        expect(upload2.status).toBe(200);
        expect(upload2.body.id).toBe(doc1Id);
    });

    /**
     * Error case: Invalid file type
     */
    test("should reject unsupported file type", async () => {
        const exeContent = Buffer.from("MZ\\x90\\x00", "utf8"); // PE executable header

        const response = await request(testContext.app)
            .post("/documents/upload")
            .set("X-Household-Id", testContext.householdId)
            .set("X-Correlation-Id", testContext.correlationId)
            .send({
                fileName: "malware.exe",
                mimeType: "application/octet-stream",
                fileSize: exeContent.length,
                sourceType: "CSV",
                fileContent: exeContent.toString("base64"),
            });

        expect(response.status).toBe(400);
        expect(response.body.errorCode).toContain("UNSUPPORTED_TYPE");
    });

    /**
     * Error case: File too large
     */
    test("should reject oversized file", async () => {
        const maxSize = 50 * 1024 * 1024; // 50MB
        const oversizedContent = Buffer.alloc(maxSize + 1, "A");

        const response = await request(testContext.app)
            .post("/documents/upload")
            .set("X-Household-Id", testContext.householdId)
            .set("X-Correlation-Id", testContext.correlationId)
            .send({
                fileName: "huge.csv",
                mimeType: "text/csv",
                fileSize: maxSize + 1,
                sourceType: "CSV",
                fileContent: oversizedContent.toString("base64"),
            });

        expect(response.status).toBe(400);
        expect(response.body.errorCode).toContain("FILE_TOO_LARGE");
    });

    /**
     * Error case: File content doesn't match MIME type
     */
    test("should reject PDF file with wrong magic numbers", async () => {
        // Create buffer that looks like CSV but claims to be PDF
        const csvContent = Buffer.from("Date,Amount\\n2024-01-01,100");

        const response = await request(testContext.app)
            .post("/documents/upload")
            .set("X-Household-Id", testContext.householdId)
            .set("X-Correlation-Id", testContext.correlationId)
            .send({
                fileName: "fake.pdf",
                mimeType: "application/pdf",
                fileSize: csvContent.length,
                sourceType: "CSV",
                fileContent: csvContent.toString("base64"),
            });

        expect(response.status).toBe(400);
        expect(response.body.errorCode).toContain("PDF_CONTENT");
    });

    /**
     * Rate limiting: Too many uploads per minute
     */
    test("should rate limit excessive uploads", async () => {
        const csvContent = Buffer.from("Date,Amount\\n2024-01-01,100");
        const payload = {
            fileName: "test.csv",
            mimeType: "text/csv",
            fileSize: csvContent.length,
            sourceType: "CSV",
            fileContent: csvContent.toString("base64"),
        };

        // Make 11 uploads rapidly (limit is 10 per minute)
        const responses = await Promise.all(
            Array(11)
                .fill(null)
                .map(() =>
                    request(testContext.app)
                        .post("/documents/upload")
                        .set("X-Household-Id", testContext.householdId)
                        .set("X-Correlation-Id", uuidv4())
                        .send(payload)
                )
        );

        // Last one should be rate limited
        const lastResponse = responses[responses.length - 1];
        expect(lastResponse.status).toBe(429); // Too Many Requests
    });

    /**
     * List documents: Verify all uploaded documents appear
     */
    test("should list all household documents", async () => {
        // Upload multiple documents
        const csvContent = Buffer.from("Date,Amount\\n2024-01-01,100");
        const files = ["file1.csv", "file2.csv", "file3.csv"];

        const uploadIds: string[] = [];
        for (const fileName of files) {
            const response = await request(testContext.app)
                .post("/documents/upload")
                .set("X-Household-Id", testContext.householdId)
                .set("X-Correlation-Id", uuidv4())
                .send({
                    fileName,
                    mimeType: "text/csv",
                    fileSize: csvContent.length,
                    sourceType: "CSV",
                    fileContent: csvContent.toString("base64"),
                });

            if (response.status === 202 || response.status === 200) {
                uploadIds.push(response.body.id);
            }
        }

        // List documents
        const listResponse = await request(testContext.app)
            .get("/documents")
            .set("X-Household-Id", testContext.householdId)
            .set("X-Correlation-Id", testContext.correlationId);

        expect(listResponse.status).toBe(200);
        expect(listResponse.body.documents.length).toBeGreaterThanOrEqual(uploadIds.length);

        // Verify all uploaded documents are in list
        const listedIds = listResponse.body.documents.map((doc: any) => doc.id);
        for (const uploadId of uploadIds) {
            expect(listedIds).toContain(uploadId);
        }
    });

    /**
     * Document summary: Verify detailed metadata is returned
     */
    test("should return document summary with processing details", async () => {
        const csvContent = Buffer.from("Date,Amount\\n2024-01-01,100");

        const uploadResponse = await request(testContext.app)
            .post("/documents/upload")
            .set("X-Household-Id", testContext.householdId)
            .set("X-Correlation-Id", testContext.correlationId)
            .send({
                fileName: "summary-test.csv",
                mimeType: "text/csv",
                fileSize: csvContent.length,
                sourceType: "CSV",
                fileContent: csvContent.toString("base64"),
            });

        expect(uploadResponse.status).toBe(202);
        const documentId = uploadResponse.body.id;

        // Get summary
        const summaryResponse = await request(testContext.app)
            .get(`/documents/${documentId}/summary`)
            .set("X-Household-Id", testContext.householdId)
            .set("X-Correlation-Id", testContext.correlationId);

        expect(summaryResponse.status).toBe(200);
        expect(summaryResponse.body.id).toBe(documentId);
        expect(summaryResponse.body.fileName).toBe("summary-test.csv");
        expect(summaryResponse.body.processingStatus).toBeDefined();
        expect(summaryResponse.body.uploadedAt).toBeDefined();
        expect(summaryResponse.body.processingMetrics).toBeDefined();
    });
});

describe("Authorization E2E", () => {
    /**
     * Household isolation: Cannot access other household's documents
     */
    test("should not allow accessing documents from different household", async () => {
        const csvContent = Buffer.from("Date,Amount\\n2024-01-01,100");
        const household1 = EntityId(uuidv4());
        const household2 = EntityId(uuidv4());

        // Upload to household 1
        const uploadResponse = await request(testContext.app)
            .post("/documents/upload")
            .set("X-Household-Id", household1)
            .set("X-Correlation-Id", uuidv4())
            .send({
                fileName: "private.csv",
                mimeType: "text/csv",
                fileSize: csvContent.length,
                sourceType: "CSV",
                fileContent: csvContent.toString("base64"),
            });

        expect(uploadResponse.status).toBe(202);
        const documentId = uploadResponse.body.id;

        // Try to access from household 2
        const accessResponse = await request(testContext.app)
            .get(`/documents/${documentId}`)
            .set("X-Household-Id", household2)
            .set("X-Correlation-Id", uuidv4());

        expect(accessResponse.status).toBe(403); // Forbidden
        expect(accessResponse.body.errorCode).toContain("UNAUTHORIZED");
    });

    /**
     * List documents filtered by household
     */
    test("should only list documents for requested household", async () => {
        const csvContent = Buffer.from("Date,Amount\\n2024-01-01,100");
        const household1 = EntityId(uuidv4());
        const household2 = EntityId(uuidv4());

        // Upload to household 1
        await request(testContext.app)
            .post("/documents/upload")
            .set("X-Household-Id", household1)
            .set("X-Correlation-Id", uuidv4())
            .send({
                fileName: "household1.csv",
                mimeType: "text/csv",
                fileSize: csvContent.length,
                sourceType: "CSV",
                fileContent: csvContent.toString("base64"),
            });

        // Upload to household 2
        await request(testContext.app)
            .post("/documents/upload")
            .set("X-Household-Id", household2)
            .set("X-Correlation-Id", uuidv4())
            .send({
                fileName: "household2.csv",
                mimeType: "text/csv",
                fileSize: csvContent.length,
                sourceType: "CSV",
                fileContent: csvContent.toString("base64"),
            });

        // List from household 1
        const list1 = await request(testContext.app)
            .get("/documents")
            .set("X-Household-Id", household1)
            .set("X-Correlation-Id", uuidv4());

        expect(list1.status).toBe(200);
        const household1Docs = list1.body.documents.filter(
            (doc: any) => doc.fileName === "household1.csv"
        );
        expect(household1Docs.length).toBe(1);

        // Verify household 2 docs not included
        const household2Docs = list1.body.documents.filter(
            (doc: any) => doc.fileName === "household2.csv"
        );
        expect(household2Docs.length).toBe(0);
    });
});
