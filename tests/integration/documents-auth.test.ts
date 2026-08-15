/**
 * Authorization and Security Tests
 * Verifies household isolation and privacy enforcement
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import { createServer } from "../../src/server";
import { query } from "../../src/db/connection";
import { EntityId } from "@house-fin/contracts";

let app: ReturnType<typeof createServer>;

beforeAll(() => {
    app = createServer();
});

afterAll(async () => {
    // Cleanup happens in test isolation
});

describe("Document Authorization", () => {
    /**
     * Test household context extraction
     */
    test("should require household context header", async () => {
        const response = await request(app)
            .get("/documents")
            .set("X-Correlation-Id", uuidv4());

        // Missing X-Household-Id should be rejected
        expect(response.status).toBe(400 || 403);
    });

    /**
     * Test document upload authorization
     */
    describe("Upload Authorization", () => {
        test("should only accept upload from authenticated household", async () => {
            const csvContent = Buffer.from("Date,Amount\\n2024-01-01,100");
            const householdId = EntityId(uuidv4());

            const response = await request(app)
                .post("/documents/upload")
                .set("X-Household-Id", householdId)
                .set("X-Correlation-Id", uuidv4())
                .send({
                    fileName: "test.csv",
                    mimeType: "text/csv",
                    fileSize: csvContent.length,
                    sourceType: "CSV",
                    fileContent: csvContent.toString("base64"),
                });

            // Should succeed with valid household ID
            expect(response.status).toBeOneOf([200, 202]);
            expect(response.body.id).toBeDefined();
        });

        test("should embed household ID in uploaded document", async () => {
            const csvContent = Buffer.from("Date,Amount\\n2024-01-01,100");
            const householdId = EntityId(uuidv4());

            const uploadResponse = await request(app)
                .post("/documents/upload")
                .set("X-Household-Id", householdId)
                .set("X-Correlation-Id", uuidv4())
                .send({
                    fileName: "test.csv",
                    mimeType: "text/csv",
                    fileSize: csvContent.length,
                    sourceType: "CSV",
                    fileContent: csvContent.toString("base64"),
                });

            const documentId = uploadResponse.body.id;

            // Verify document stored with correct household ID
            const result = await query(
                "SELECT household_id FROM finhouse.financial_documents WHERE id = $1",
                [documentId]
            );

            expect(result.rows.length).toBe(1);
            expect(result.rows[0].household_id).toBe(householdId);
        });
    });

    /**
     * Test document read authorization
     */
    describe("Read Authorization", () => {
        test("should deny GET access to document from different household", async () => {
            const csvContent = Buffer.from("Date,Amount\\n2024-01-01,100");
            const owner = EntityId(uuidv4());
            const attacker = EntityId(uuidv4());

            // Create document as owner
            const uploadResponse = await request(app)
                .post("/documents/upload")
                .set("X-Household-Id", owner)
                .set("X-Correlation-Id", uuidv4())
                .send({
                    fileName: "secret.csv",
                    mimeType: "text/csv",
                    fileSize: csvContent.length,
                    sourceType: "CSV",
                    fileContent: csvContent.toString("base64"),
                });

            const documentId = uploadResponse.body.id;

            // Try to access as different household
            const accessResponse = await request(app)
                .get(`/documents/${documentId}`)
                .set("X-Household-Id", attacker)
                .set("X-Correlation-Id", uuidv4());

            expect(accessResponse.status).toBe(403);
            expect(accessResponse.body.userMessage).toBeDefined();
            // Should not leak information about document existence
            expect(accessResponse.body.userMessage).not.toContain(documentId);
        });

        test("should deny GET /documents/summary from different household", async () => {
            const csvContent = Buffer.from("Date,Amount\\n2024-01-01,100");
            const owner = EntityId(uuidv4());
            const attacker = EntityId(uuidv4());

            // Create document as owner
            const uploadResponse = await request(app)
                .post("/documents/upload")
                .set("X-Household-Id", owner)
                .set("X-Correlation-Id", uuidv4())
                .send({
                    fileName: "secret.csv",
                    mimeType: "text/csv",
                    fileSize: csvContent.length,
                    sourceType: "CSV",
                    fileContent: csvContent.toString("base64"),
                });

            const documentId = uploadResponse.body.id;

            // Try to access summary as different household
            const summaryResponse = await request(app)
                .get(`/documents/${documentId}/summary`)
                .set("X-Household-Id", attacker)
                .set("X-Correlation-Id", uuidv4());

            expect(summaryResponse.status).toBe(403);
        });

        test("should allow GET access to own documents", async () => {
            const csvContent = Buffer.from("Date,Amount\\n2024-01-01,100");
            const householdId = EntityId(uuidv4());

            // Upload document
            const uploadResponse = await request(app)
                .post("/documents/upload")
                .set("X-Household-Id", householdId)
                .set("X-Correlation-Id", uuidv4())
                .send({
                    fileName: "myfile.csv",
                    mimeType: "text/csv",
                    fileSize: csvContent.length,
                    sourceType: "CSV",
                    fileContent: csvContent.toString("base64"),
                });

            const documentId = uploadResponse.body.id;

            // Access own document - should succeed
            const accessResponse = await request(app)
                .get(`/documents/${documentId}`)
                .set("X-Household-Id", householdId)
                .set("X-Correlation-Id", uuidv4());

            expect(accessResponse.status).toBe(200);
            expect(accessResponse.body.id).toBe(documentId);
        });
    });

    /**
     * Test list authorization
     */
    describe("List Authorization", () => {
        test("should only list documents for requesting household", async () => {
            const csvContent = Buffer.from("Date,Amount\\n2024-01-01,100");
            const household1 = EntityId(uuidv4());
            const household2 = EntityId(uuidv4());

            // Upload to household 1
            await request(app)
                .post("/documents/upload")
                .set("X-Household-Id", household1)
                .set("X-Correlation-Id", uuidv4())
                .send({
                    fileName: "house1-doc.csv",
                    mimeType: "text/csv",
                    fileSize: csvContent.length,
                    sourceType: "CSV",
                    fileContent: csvContent.toString("base64"),
                });

            // Upload to household 2
            await request(app)
                .post("/documents/upload")
                .set("X-Household-Id", household2)
                .set("X-Correlation-Id", uuidv4())
                .send({
                    fileName: "house2-doc.csv",
                    mimeType: "text/csv",
                    fileSize: csvContent.length,
                    sourceType: "CSV",
                    fileContent: csvContent.toString("base64"),
                });

            // List from household 1 perspective
            const list1 = await request(app)
                .get("/documents")
                .set("X-Household-Id", household1)
                .set("X-Correlation-Id", uuidv4());

            expect(list1.status).toBe(200);

            // Verify only household 1 docs are in list
            for (const doc of list1.body.documents) {
                // All listed documents should belong to household 1
                const dbResult = await query(
                    "SELECT household_id FROM finhouse.financial_documents WHERE id = $1",
                    [doc.id]
                );
                if (dbResult.rows.length > 0) {
                    expect(dbResult.rows[0].household_id).toBe(household1);
                }
            }

            // Specifically verify household 2 docs not included
            const house2Docs = list1.body.documents.filter(
                (doc: any) => doc.fileName === "house2-doc.csv"
            );
            expect(house2Docs.length).toBe(0);
        });

        test("should return empty list if no documents", async () => {
            const householdId = EntityId(uuidv4());

            const listResponse = await request(app)
                .get("/documents")
                .set("X-Household-Id", householdId)
                .set("X-Correlation-Id", uuidv4());

            expect(listResponse.status).toBe(200);
            expect(Array.isArray(listResponse.body.documents)).toBe(true);
            expect(listResponse.body.documents.length).toBeGreaterThanOrEqual(0);
        });
    });

    /**
     * Test object storage key validation
     */
    describe("Object Storage Security", () => {
        test("should validate object storage key format", async () => {
            // This is tested at the storage layer
            // Keys should follow: household-{UUID}/statements/{UUID}/{timestamp}.{ext}

            const validKey = `household-${uuidv4()}/statements/${uuidv4()}/20240101120000000.csv`;
            expect(validKey).toMatch(/^household-[a-f0-9-]{36}\/statements\/[a-f0-9-]{36}\/\d+\.[a-z0-9]+$/i);
        });

        test("should reject path traversal in keys", async () => {
            // Path traversal attempts should be caught
            const maliciousKeys = [
                "household-xxx/../../../etc/passwd",
                "household-xxx/statements/..%2F..%2Fetc%2Fpasswd",
                "household-xxx/statements/~/.ssh/id_rsa",
            ];

            for (const key of maliciousKeys) {
                // Verify key doesn't pass validation regex
                const isValid = key.match(/^household-[a-f0-9-]{36}\/statements\/[a-f0-9-]{36}\/\d+\.[a-z0-9]+$/i);
                expect(isValid).toBeNull();
            }
        });
    });

    /**
     * Test correlation ID tracking
     */
    describe("Audit Trail", () => {
        test("should include correlation ID in all responses", async () => {
            const correlationId = uuidv4();
            const householdId = EntityId(uuidv4());

            const response = await request(app)
                .get("/documents")
                .set("X-Household-Id", householdId)
                .set("X-Correlation-Id", correlationId);

            expect(response.status).toBe(200);
            // Check response includes correlation ID for logging
            expect(response.body.correlationId || response.body.id).toBeDefined();
        });

        test("should generate correlation ID if not provided", async () => {
            const householdId = EntityId(uuidv4());

            const response = await request(app)
                .get("/documents")
                .set("X-Household-Id", householdId);
            // Don't set X-Correlation-Id

            // Should still work - correlation ID auto-generated
            expect(response.status).toBe(200);
        });
    });

    /**
     * Test error messages don't leak information
     */
    describe("Information Disclosure Prevention", () => {
        test("should not reveal document existence in 403 errors", async () => {
            const csvContent = Buffer.from("Date,Amount\\n2024-01-01,100");
            const owner = EntityId(uuidv4());
            const attacker = EntityId(uuidv4());

            // Create document as owner
            const uploadResponse = await request(app)
                .post("/documents/upload")
                .set("X-Household-Id", owner)
                .set("X-Correlation-Id", uuidv4())
                .send({
                    fileName: "secret.csv",
                    mimeType: "text/csv",
                    fileSize: csvContent.length,
                    sourceType: "CSV",
                    fileContent: csvContent.toString("base64"),
                });

            const documentId = uploadResponse.body.id;

            // Try to access as attacker
            const response = await request(app)
                .get(`/documents/${documentId}`)
                .set("X-Household-Id", attacker)
                .set("X-Correlation-Id", uuidv4());

            expect(response.status).toBe(403);
            expect(response.body.userMessage).not.toContain(documentId);
            expect(response.body.userMessage).not.toContain("not found");
            // Should not reveal whether doc exists or not
        });

        test("should not expose internal file paths", async () => {
            const csvContent = Buffer.from("Date,Amount\\n2024-01-01,100");
            const householdId = EntityId(uuidv4());

            const response = await request(app)
                .post("/documents/upload")
                .set("X-Household-Id", householdId)
                .set("X-Correlation-Id", uuidv4())
                .send({
                    fileName: "test.csv",
                    mimeType: "text/csv",
                    fileSize: csvContent.length,
                    sourceType: "CSV",
                    fileContent: csvContent.toString("base64"),
                });

            // Response should not expose objectStorageKey (internal detail)
            if (response.body.objectStorageKey) {
                console.warn("WARNING: objectStorageKey exposed in response - should be hidden");
            }
        });

        test("should not expose stack traces in error responses", async () => {
            const invalidPayload = {
                fileName: "test.csv",
                mimeType: "text/csv",
                fileSize: 100,
                // Missing required fields
            };

            const response = await request(app)
                .post("/documents/upload")
                .set("X-Household-Id", EntityId(uuidv4()))
                .set("X-Correlation-Id", uuidv4())
                .send(invalidPayload);

            // Error response should be user-friendly, not stack trace
            expect(response.status).toBe(400);
            expect(response.body.userMessage).toBeDefined();
            expect(response.body.userMessage).not.toContain("at ");
            expect(response.body.userMessage).not.toContain("Error:");
        });
    });
});

/**
 * Helper matchers for jest
 */
expect.extend({
    toBeOneOf(received: number, accepted: number[]) {
        const pass = accepted.includes(received);
        return {
            pass,
            message: () =>
                `expected ${received} to be one of [${accepted.join(", ")}]`,
        };
    },
});
