"use strict";
/**
 * Statement/Financial Document domain model and services
 * Implements document lifecycle, versioning, and storage key management
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_STATUS_TRANSITIONS = void 0;
exports.calculateFileChecksum = calculateFileChecksum;
exports.generateObjectStorageKey = generateObjectStorageKey;
exports.validateDocumentUpload = validateDocumentUpload;
exports.validateFileContent = validateFileContent;
exports.isValidStatusTransition = isValidStatusTransition;
exports.createUserFacingError = createUserFacingError;
const contracts_1 = require("@house-fin/contracts");
const crypto_1 = require("crypto");
/**
 * Calculates SHA-256 checksum of file buffer
 * @param fileBuffer Buffer containing file contents
 * @returns SHA-256 hex digest
 */
function calculateFileChecksum(fileBuffer) {
    return crypto_1.default.createHash("sha256").update(fileBuffer).digest("hex");
}
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
function generateObjectStorageKey(householdId, documentId, sourceFileName) {
    // Extract extension from original filename, sanitize to prevent injection
    const parts = sourceFileName.split(".");
    const ext = (parts.length > 1 ? parts.pop() : "bin")?.toLowerCase() || "bin";
    const safeExt = ext.replace(/[^a-z0-9]/g, "").slice(0, 10); // Limit to 10 chars, alphanumeric only
    // Use timestamp for sortability - YYYYMMDDHHMMSS (14 digits, no separators)
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0') +
        String(now.getMilliseconds()).padStart(3, '0');
    return `household-${householdId}/statements/${documentId}/${timestamp}.${safeExt || "bin"}`;
}
/**
 * Validates document upload request for security and correctness
 * @param fileName Original filename
 * @param mimeType MIME type of file
 * @param fileSizeBytes File size in bytes
 * @returns Validation error if invalid, null if valid
 */
function validateDocumentUpload(fileName, mimeType, fileSizeBytes) {
    // File size validation (50MB limit)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (fileSizeBytes > MAX_FILE_SIZE) {
        return {
            errorCode: "UPLOAD_FILE_TOO_LARGE",
            userMessage: "Your file is larger than 50MB. Please upload a smaller statement.",
        };
    }
    if (fileSizeBytes <= 0) {
        return {
            errorCode: "UPLOAD_FILE_EMPTY",
            userMessage: "The file is empty. Please select a valid statement file.",
        };
    }
    // MIME type validation
    const SUPPORTED_MIME_TYPES = [
        "text/csv",
        "application/csv",
        "text/plain",
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/tiff",
        "application/octet-stream", // Generic fallback for statements
    ];
    if (!SUPPORTED_MIME_TYPES.includes(mimeType.toLowerCase())) {
        return {
            errorCode: "UPLOAD_UNSUPPORTED_TYPE",
            userMessage: `File type "${mimeType}" is not supported. Please upload a CSV, PDF, or image file.`,
        };
    }
    // Filename validation
    if (!fileName || fileName.trim().length === 0) {
        return {
            errorCode: "UPLOAD_INVALID_FILENAME",
            userMessage: "Please provide a valid filename.",
        };
    }
    if (fileName.length > 255) {
        return {
            errorCode: "UPLOAD_FILENAME_TOO_LONG",
            userMessage: "Filename is too long. Please use a shorter filename.",
        };
    }
    return null;
}
/**
 * Validates file content by checking magic numbers (file headers)
 * Ensures actual file content matches claimed MIME type to prevent malicious uploads
 *
 * @param fileBuffer Buffer containing file contents
 * @param mimeType MIME type claimed by uploader
 * @returns Validation error if invalid, null if valid
 */
function validateFileContent(fileBuffer, mimeType) {
    if (fileBuffer.length === 0) {
        return {
            errorCode: "INVALID_FILE_CONTENT",
            userMessage: "File is empty. Please upload a valid statement file.",
        };
    }
    const mime = mimeType.toLowerCase();
    // Check for PDF
    if (mime.includes("pdf")) {
        // PDF files start with %PDF
        if (!fileBuffer.toString("utf8", 0, 4).startsWith("%PDF")) {
            return {
                errorCode: "INVALID_PDF_CONTENT",
                userMessage: "File does not appear to be a valid PDF. Please check the file and try again.",
            };
        }
    }
    // Check for PNG
    if (mime.includes("png")) {
        // PNG files start with 89 50 4E 47 (hex) = 0x89 0x50 0x4E 0x47
        if (fileBuffer.length < 4 || fileBuffer[0] !== 0x89 || fileBuffer[1] !== 0x50 ||
            fileBuffer[2] !== 0x4e || fileBuffer[3] !== 0x47) {
            return {
                errorCode: "INVALID_PNG_CONTENT",
                userMessage: "File does not appear to be a valid PNG image. Please check the file and try again.",
            };
        }
    }
    // Check for JPEG
    if (mime.includes("jpeg") || mime.includes("jpg")) {
        // JPEG files start with FF D8 FF (hex)
        if (fileBuffer.length < 3 || fileBuffer[0] !== 0xff || fileBuffer[1] !== 0xd8 || fileBuffer[2] !== 0xff) {
            return {
                errorCode: "INVALID_JPEG_CONTENT",
                userMessage: "File does not appear to be a valid JPEG image. Please check the file and try again.",
            };
        }
    }
    // Check for TIFF
    if (mime.includes("tiff")) {
        // TIFF files start with 0x49 0x49 (little-endian) or 0x4d 0x4d (big-endian)
        if (fileBuffer.length < 2 ||
            ((fileBuffer[0] !== 0x49 && fileBuffer[0] !== 0x4d) ||
                (fileBuffer[1] !== 0x49 && fileBuffer[1] !== 0x4d))) {
            return {
                errorCode: "INVALID_TIFF_CONTENT",
                userMessage: "File does not appear to be a valid TIFF image. Please check the file and try again.",
            };
        }
    }
    // Check for CSV/Text (very permissive - just check if it's text-like)
    if (mime.includes("csv") || mime.includes("text") || mime.includes("plain")) {
        // Try to parse first 1KB as text - if binary data found, it's likely invalid
        const sample = fileBuffer.slice(0, Math.min(1024, fileBuffer.length));
        const text = sample.toString("utf8");
        // Check for excessive null bytes or other binary indicators
        const nullByteCount = (text.match(/\0/g) || []).length;
        if (nullByteCount > 5) {
            return {
                errorCode: "INVALID_CSV_CONTENT",
                userMessage: "File does not appear to be a valid CSV. It contains binary data. Please check the file and try again.",
            };
        }
    }
    return null;
}
/**
 * Allowed state transitions for document processing
 * Defines the valid state machine for document lifecycle
 */
exports.VALID_STATUS_TRANSITIONS = {
    [contracts_1.DocumentProcessingStatus.UPLOADED]: [
        contracts_1.DocumentProcessingStatus.VALIDATING,
        contracts_1.DocumentProcessingStatus.FAILED,
    ],
    [contracts_1.DocumentProcessingStatus.VALIDATING]: [
        contracts_1.DocumentProcessingStatus.IDENTIFYING,
        contracts_1.DocumentProcessingStatus.VALIDATION_FAILED,
    ],
    [contracts_1.DocumentProcessingStatus.VALIDATION_FAILED]: [contracts_1.DocumentProcessingStatus.UPLOADED], // Retry
    [contracts_1.DocumentProcessingStatus.IDENTIFYING]: [
        contracts_1.DocumentProcessingStatus.PARSING,
        contracts_1.DocumentProcessingStatus.FAILED,
    ],
    [contracts_1.DocumentProcessingStatus.PARSING]: [
        contracts_1.DocumentProcessingStatus.NORMALIZING,
        contracts_1.DocumentProcessingStatus.PARSE_FAILED,
    ],
    [contracts_1.DocumentProcessingStatus.PARSE_FAILED]: [contracts_1.DocumentProcessingStatus.PARSING], // Retry with new parser
    [contracts_1.DocumentProcessingStatus.NORMALIZING]: [
        contracts_1.DocumentProcessingStatus.RECONCILING,
        contracts_1.DocumentProcessingStatus.FAILED,
    ],
    [contracts_1.DocumentProcessingStatus.RECONCILING]: [
        contracts_1.DocumentProcessingStatus.REVIEW_REQUIRED,
        contracts_1.DocumentProcessingStatus.READY_TO_POST,
        contracts_1.DocumentProcessingStatus.FAILED,
    ],
    [contracts_1.DocumentProcessingStatus.REVIEW_REQUIRED]: [
        contracts_1.DocumentProcessingStatus.READY_TO_POST,
        contracts_1.DocumentProcessingStatus.FAILED,
    ],
    [contracts_1.DocumentProcessingStatus.READY_TO_POST]: [
        contracts_1.DocumentProcessingStatus.POSTING,
        contracts_1.DocumentProcessingStatus.FAILED,
    ],
    [contracts_1.DocumentProcessingStatus.POSTING]: [
        contracts_1.DocumentProcessingStatus.COMPLETED,
        contracts_1.DocumentProcessingStatus.PARTIALLY_COMPLETED,
        contracts_1.DocumentProcessingStatus.FAILED,
    ],
    [contracts_1.DocumentProcessingStatus.COMPLETED]: [],
    [contracts_1.DocumentProcessingStatus.PARTIALLY_COMPLETED]: [],
    [contracts_1.DocumentProcessingStatus.FAILED]: [],
};
/**
 * Validates if a state transition is allowed
 * @param currentStatus Current processing status
 * @param targetStatus Desired new status
 * @returns true if transition is valid, false otherwise
 */
function isValidStatusTransition(currentStatus, targetStatus) {
    if (currentStatus === targetStatus) {
        return true; // Idempotent
    }
    const allowedTransitions = exports.VALID_STATUS_TRANSITIONS[currentStatus];
    return allowedTransitions?.includes(targetStatus) ?? false;
}
/**
 * Creates error response with user-facing message (no diagnostic details)
 * @param errorCode Machine-readable error code
 * @param userMessage User-facing message (plain language)
 * @returns Error object for response
 */
function createUserFacingError(errorCode, userMessage) {
    return { errorCode, userMessage };
}
//# sourceMappingURL=statements.js.map