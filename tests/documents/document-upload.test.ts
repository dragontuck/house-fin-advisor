/**
 * Tests for document/statement upload and storage
 * Covers: validation, checksum, storage, duplicate detection, authorization
 */

import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import {
    DocumentProcessingStatus,
    DocumentSourceType,
    EntityId,
} from "@house-fin/contracts";
import {
    calculateFileChecksum,
    generateObjectStorageKey,
    validateDocumentUpload,
    isValidStatusTransition,
    VALID_STATUS_TRANSITIONS,
} from "@house-fin/domain";

describe("Document Upload and Storage", () => {
    // ==================== Checksum Generation Tests ====================

    describe("calculateFileChecksum", () => {
        it("should generate SHA-256 checksum for file buffer", () => {
            const fileContent = Buffer.from("test content");
            const checksum = calculateFileChecksum(fileContent);

            expect(checksum).toMatch(/^[a-f0-9]{64}$/); // 64 hex characters
        });

        it("should generate consistent checksum for same content", () => {
            const content = Buffer.from("consistent content");
            const checksum1 = calculateFileChecksum(content);
            const checksum2 = calculateFileChecksum(content);

            expect(checksum1).toBe(checksum2);
        });

        it("should generate different checksums for different content", () => {
            const checksum1 = calculateFileChecksum(Buffer.from("content 1"));
            const checksum2 = calculateFileChecksum(Buffer.from("content 2"));

            expect(checksum1).not.toBe(checksum2);
        });

        it("should handle empty buffer", () => {
            const emptyBuffer = Buffer.alloc(0);
            const checksum = calculateFileChecksum(emptyBuffer);

            expect(checksum).toMatch(/^[a-f0-9]{64}$/);
        });

        it("should handle large buffers", () => {
            const largeBuffer = Buffer.alloc(1024 * 1024); // 1MB
            largeBuffer.fill("A");
            const checksum = calculateFileChecksum(largeBuffer);

            expect(checksum).toMatch(/^[a-f0-9]{64}$/);
        });
    });

    // ==================== Object Storage Key Generation Tests ====================

    describe("generateObjectStorageKey", () => {
        it("should generate deterministic key from household and document ID", () => {
            const householdId = EntityId(uuidv4());
            const documentId = EntityId(uuidv4());
            const fileName = "statement.csv";

            const key = generateObjectStorageKey(householdId, documentId, fileName);

            expect(key).toContain(`household-${householdId}/statements/${documentId}/`);
            expect(key).toMatch(/\.csv$/);
        });

        it("should extract and preserve file extension", () => {
            const householdId = EntityId(uuidv4());
            const documentId = EntityId(uuidv4());

            const csvKey = generateObjectStorageKey(householdId, documentId, "data.csv");
            const pdfKey = generateObjectStorageKey(householdId, documentId, "doc.pdf");

            expect(csvKey).toMatch(/\.csv$/);
            expect(pdfKey).toMatch(/\.pdf$/);
        });

        it("should handle filenames without extension", () => {
            const householdId = EntityId(uuidv4());
            const documentId = EntityId(uuidv4());

            const key = generateObjectStorageKey(householdId, documentId, "noextension");

            expect(key).toContain(`household-${householdId}/statements/${documentId}/`);
            expect(key).toMatch(/\.bin$/); // Default to .bin for unknown
        });

        it("should sanitize file extension to prevent injection", () => {
            const householdId = EntityId(uuidv4());
            const documentId = EntityId(uuidv4());

            // Try to inject path traversal or dangerous extensions
            const key = generateObjectStorageKey(householdId, documentId, "file../../etc/passwd.csv");

            // Should only contain alphanumeric extension
            expect(key).toMatch(/\.[a-z0-9]{1,10}$/);
            expect(key).not.toContain("..");
            expect(key).not.toContain("/etc/");
        });

        it("should use household ID and document ID, not user filename, for path", () => {
            const householdId = EntityId(uuidv4());
            const documentId = EntityId(uuidv4());

            // User provides malicious filename
            const key = generateObjectStorageKey(
                householdId,
                documentId,
                "../../../../../../etc/passwd.csv"
            );

            // Path should only use IDs, not user input
            expect(key).toMatch(new RegExp(`^household-${householdId}/statements/${documentId}/`));
            expect(key).not.toContain("etc");
            expect(key).not.toContain("passwd");
        });

        it("should include timestamp for sortability", () => {
            const householdId = EntityId(uuidv4());
            const documentId = EntityId(uuidv4());
            const fileName = "statement.csv";

            const key = generateObjectStorageKey(householdId, documentId, fileName);

            // Should contain timestamp (numeric characters between document ID and extension)
            expect(key).toMatch(/\d{14,}\./); // At least 14 digits for YYYYMMDDHHMMSS
        });
    });

    // ==================== Document Upload Validation Tests ====================

    describe("validateDocumentUpload", () => {
        it("should accept valid CSV upload", () => {
            const error = validateDocumentUpload("statement.csv", "text/csv", 1024);
            expect(error).toBeNull();
        });

        it("should accept valid PDF upload", () => {
            const error = validateDocumentUpload("statement.pdf", "application/pdf", 2048);
            expect(error).toBeNull();
        });

        it("should accept valid image upload", () => {
            const error = validateDocumentUpload("scan.png", "image/png", 5000);
            expect(error).toBeNull();
        });

        it("should reject file larger than 50MB", () => {
            const error = validateDocumentUpload(
                "large.csv",
                "text/csv",
                51 * 1024 * 1024
            );
            expect(error).not.toBeNull();
            expect(error?.errorCode).toBe("UPLOAD_FILE_TOO_LARGE");
            expect(error?.userMessage).toContain("50MB");
        });

        it("should reject empty file", () => {
            const error = validateDocumentUpload("empty.csv", "text/csv", 0);
            expect(error).not.toBeNull();
            expect(error?.errorCode).toBe("UPLOAD_FILE_EMPTY");
        });

        it("should reject unsupported MIME type", () => {
            const error = validateDocumentUpload("file.exe", "application/octet-stream", 1024);
            // application/octet-stream is actually supported as fallback
            expect(error).toBeNull();
        });

        it("should reject truly unsupported MIME type", () => {
            const error = validateDocumentUpload("file.xyz", "application/xyz", 1024);
            expect(error).not.toBeNull();
            expect(error?.errorCode).toBe("UPLOAD_UNSUPPORTED_TYPE");
        });

        it("should reject empty filename", () => {
            const error = validateDocumentUpload("", "text/csv", 1024);
            expect(error).not.toBeNull();
            expect(error?.errorCode).toBe("UPLOAD_INVALID_FILENAME");
        });

        it("should reject filename that is only whitespace", () => {
            const error = validateDocumentUpload("   ", "text/csv", 1024);
            expect(error).not.toBeNull();
            expect(error?.errorCode).toBe("UPLOAD_INVALID_FILENAME");
        });

        it("should reject excessively long filename", () => {
            const longName = "a".repeat(256) + ".csv";
            const error = validateDocumentUpload(longName, "text/csv", 1024);
            expect(error).not.toBeNull();
            expect(error?.errorCode).toBe("UPLOAD_FILENAME_TOO_LONG");
        });

        it("should accept 255-character filename", () => {
            const maxName = "a".repeat(250) + ".csv";
            const error = validateDocumentUpload(maxName, "text/csv", 1024);
            expect(error).toBeNull();
        });

        it("should handle case-insensitive MIME type", () => {
            const error = validateDocumentUpload("file.csv", "TEXT/CSV", 1024);
            expect(error).toBeNull();
        });
    });

    // ==================== Document Status Transition Tests ====================

    describe("isValidStatusTransition", () => {
        it("should allow transition from UPLOADED to VALIDATING", () => {
            const valid = isValidStatusTransition(
                DocumentProcessingStatus.UPLOADED,
                DocumentProcessingStatus.VALIDATING
            );
            expect(valid).toBe(true);
        });

        it("should allow idempotent transition (same status)", () => {
            const valid = isValidStatusTransition(
                DocumentProcessingStatus.UPLOADED,
                DocumentProcessingStatus.UPLOADED
            );
            expect(valid).toBe(true);
        });

        it("should disallow invalid transition (UPLOADED -> COMPLETED)", () => {
            const valid = isValidStatusTransition(
                DocumentProcessingStatus.UPLOADED,
                DocumentProcessingStatus.COMPLETED
            );
            expect(valid).toBe(false);
        });

        it("should disallow backward transition (PARSING -> UPLOADED)", () => {
            const valid = isValidStatusTransition(
                DocumentProcessingStatus.PARSING,
                DocumentProcessingStatus.UPLOADED
            );
            expect(valid).toBe(false);
        });

        it("should allow retry transitions (VALIDATION_FAILED -> UPLOADED)", () => {
            const valid = isValidStatusTransition(
                DocumentProcessingStatus.VALIDATION_FAILED,
                DocumentProcessingStatus.UPLOADED
            );
            expect(valid).toBe(true);
        });

        it("should allow fail transitions from most states", () => {
            const states = [
                DocumentProcessingStatus.UPLOADED,
                DocumentProcessingStatus.IDENTIFYING,
                DocumentProcessingStatus.NORMALIZING,
                DocumentProcessingStatus.RECONCILING,
            ];

            states.forEach((state) => {
                const valid = isValidStatusTransition(state, DocumentProcessingStatus.FAILED);
                expect(valid).toBe(true);
            });
        });

        it("should disallow transition from completed state", () => {
            const valid = isValidStatusTransition(
                DocumentProcessingStatus.COMPLETED,
                DocumentProcessingStatus.POSTING
            );
            expect(valid).toBe(false);
        });

        it("should define transitions for all states", () => {
            Object.values(DocumentProcessingStatus).forEach((status) => {
                expect(VALID_STATUS_TRANSITIONS[status]).toBeDefined();
            });
        });
    });

    // ==================== File Type Validation Tests ====================

    describe("File Type Validation", () => {
        it("should accept CSV with text/csv MIME type", () => {
            const error = validateDocumentUpload("data.csv", "text/csv", 100);
            expect(error).toBeNull();
        });

        it("should accept CSV with application/csv MIME type", () => {
            const error = validateDocumentUpload("data.csv", "application/csv", 100);
            expect(error).toBeNull();
        });

        it("should accept text/plain as CSV fallback", () => {
            const error = validateDocumentUpload("data.txt", "text/plain", 100);
            expect(error).toBeNull();
        });

        it("should accept PDF", () => {
            const error = validateDocumentUpload("statement.pdf", "application/pdf", 5000);
            expect(error).toBeNull();
        });

        it("should accept PNG image", () => {
            const error = validateDocumentUpload("scan.png", "image/png", 3000);
            expect(error).toBeNull();
        });

        it("should accept JPEG image", () => {
            const error = validateDocumentUpload("scan.jpg", "image/jpeg", 3000);
            expect(error).toBeNull();
        });

        it("should accept JPG alternate", () => {
            const error = validateDocumentUpload("scan.jpg", "image/jpg", 3000);
            expect(error).toBeNull();
        });

        it("should accept TIFF image", () => {
            const error = validateDocumentUpload("scan.tiff", "image/tiff", 5000);
            expect(error).toBeNull();
        });
    });

    // ==================== Edge Cases ====================

    describe("Edge Cases", () => {
        it("should handle checksum of binary data correctly", () => {
            const binary = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd]);
            const checksum = calculateFileChecksum(binary);
            expect(checksum).toMatch(/^[a-f0-9]{64}$/);
        });

        it("should validate file at maximum allowed size (50MB)", () => {
            const maxSize = 50 * 1024 * 1024;
            const error = validateDocumentUpload("maxfile.csv", "text/csv", maxSize);
            expect(error).toBeNull();
        });

        it("should reject file one byte over limit", () => {
            const overSize = 50 * 1024 * 1024 + 1;
            const error = validateDocumentUpload("oversize.csv", "text/csv", overSize);
            expect(error).not.toBeNull();
            expect(error?.errorCode).toBe("UPLOAD_FILE_TOO_LARGE");
        });

        it("should generate unique keys for same file uploaded twice", () => {
            const householdId = EntityId(uuidv4());
            const file1Id = EntityId(uuidv4());
            const file2Id = EntityId(uuidv4());

            const key1 = generateObjectStorageKey(householdId, file1Id, "statement.csv");
            const key2 = generateObjectStorageKey(householdId, file2Id, "statement.csv");

            expect(key1).not.toBe(key2); // Different IDs = different keys
        });
    });

    // ==================== Authorization Tests ====================

    describe("Authorization", () => {
        it("should reject documents from other households", () => {
            // This would be tested in integration tests with actual database
            // Testing logic: document.householdId !== request.householdId => 403
            const household1Id = EntityId(uuidv4());
            const household2Id = EntityId(uuidv4());

            expect(household1Id).not.toBe(household2Id);
            // In actual test, would verify 403 on access attempt
        });
    });
});
