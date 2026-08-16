/**
 * Statement/Financial Document domain model and services
 * Implements document lifecycle, versioning, and storage key management
 */
import { EntityId, DocumentProcessingStatus } from "@house-fin/contracts";
/**
 * Calculates SHA-256 checksum of file buffer
 * @param fileBuffer Buffer containing file contents
 * @returns SHA-256 hex digest
 */
export declare function calculateFileChecksum(fileBuffer: Buffer): string;
/**
 * Generates deterministic object storage key for MinIO
 * Format: /household-{householdId}/statements/{documentId}/{timestamp}.{extension}
 *
 * Uses document ID (not user filename) for security - prevents path traversal,
 * protects against malicious filenames, ensures deterministic key generation
 *
 * @param householdId Household that owns the document
 * @param documentId Unique document ID
 * @param sourceFileName Original user filename (for extension only)
 * @returns Deterministic object storage key
 */
export declare function generateObjectStorageKey(householdId: EntityId, documentId: EntityId, sourceFileName: string): string;
/**
 * Validates document upload request for security and correctness
 * @param fileName Original filename
 * @param mimeType MIME type of file
 * @param fileSizeBytes File size in bytes
 * @returns Validation error if invalid, null if valid
 */
export declare function validateDocumentUpload(fileName: string, mimeType: string, fileSizeBytes: number): {
    errorCode: string;
    userMessage: string;
} | null;
/**
 * Validates file content by checking magic numbers (file headers)
 * Ensures actual file content matches claimed MIME type to prevent malicious uploads
 *
 * @param fileBuffer Buffer containing file contents
 * @param mimeType MIME type claimed by uploader
 * @returns Validation error if invalid, null if valid
 */
export declare function validateFileContent(fileBuffer: Buffer, mimeType: string): {
    errorCode: string;
    userMessage: string;
} | null;
/**
 * Allowed state transitions for document processing
 * Defines the valid state machine for document lifecycle
 */
export declare const VALID_STATUS_TRANSITIONS: Record<DocumentProcessingStatus, DocumentProcessingStatus[]>;
/**
 * Validates if a state transition is allowed
 * @param currentStatus Current processing status
 * @param targetStatus Desired new status
 * @returns true if transition is valid, false otherwise
 */
export declare function isValidStatusTransition(currentStatus: DocumentProcessingStatus, targetStatus: DocumentProcessingStatus): boolean;
/**
 * Creates error response with user-facing message (no diagnostic details)
 * @param errorCode Machine-readable error code
 * @param userMessage User-facing message (plain language)
 * @returns Error object for response
 */
export declare function createUserFacingError(errorCode: string, userMessage: string): {
    errorCode: string;
    userMessage: string;
};
//# sourceMappingURL=statements.d.ts.map