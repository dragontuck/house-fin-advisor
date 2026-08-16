/**
 * MinIO object storage adapter for document/statement files
 * Handles secure file storage, retrieval, and lifecycle management
 */

import { Client as MinioClient } from "minio";
import { EntityId } from "@house-fin/contracts";

/**
 * Configuration for MinIO connection
 */
export interface MinioConfig {
    endPoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    bucketName: string;
}

/**
 * File metadata returned from storage operations
 */
export interface StorageFileInfo {
    key: string;
    size: number;
    lastModified: Date;
    etag: string;
}

/**
 * MinIO storage adapter for documents
 * Provides secure, versioned storage with deterministic key generation
 */
export class ObjectStorageAdapter {
    private client: MinioClient;
    private bucketName: string;

    constructor(config: MinioConfig) {
        this.client = new MinioClient({
            endPoint: config.endPoint,
            port: config.port,
            useSSL: config.useSSL,
            accessKey: config.accessKey,
            secretKey: config.secretKey,
        });

        this.bucketName = config.bucketName;
    }

    /**
     * Ensures bucket exists, creating if necessary
     * Call once during initialization
     */
    async ensureBucket(): Promise<void> {
        try {
            const exists = await this.client.bucketExists(this.bucketName);
            if (!exists) {
                await this.client.makeBucket(this.bucketName, "us-east-1");
                console.log(`Created bucket: ${this.bucketName}`);
            }
        } catch (error) {
            throw new Error(`Failed to ensure bucket exists: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Uploads file to storage with deterministic key
     * @param objectKey Deterministic object storage key (not user filename)
     * @param fileBuffer File contents as buffer
     * @param mimeType MIME type for content-type header
     * @returns Storage file info including key and size
     */
    async uploadFile(
        objectKey: string,
        fileBuffer: Buffer,
        mimeType: string
    ): Promise<StorageFileInfo> {
        try {
            // Validate key format for security
            this.validateObjectKey(objectKey);

            const result = await this.client.putObject(
                this.bucketName,
                objectKey,
                fileBuffer,
                fileBuffer.length,
                {
                    "Content-Type": mimeType,
                    // Add metadata for audit trail
                    "X-Amz-Meta-Uploaded-At": new Date().toISOString(),
                }
            );

            // Get file stats to confirm upload
            const stat = await this.client.statObject(this.bucketName, objectKey);

            return {
                key: objectKey,
                size: stat.size,
                lastModified: stat.lastModified,
                etag: stat.etag,
            };
        } catch (error) {
            throw new Error(
                `Failed to upload file to storage: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Downloads file from storage
     * @param objectKey Object storage key
     * @returns File buffer
     */
    async downloadFile(objectKey: string): Promise<Buffer> {
        try {
            this.validateObjectKey(objectKey);

            // Check if object exists
            await this.client.statObject(this.bucketName, objectKey);

            // Download as buffer
            const chunks: Buffer[] = [];
            const stream = await this.client.getObject(this.bucketName, objectKey);

            return new Promise((resolve, reject) => {
                stream.on("data", (chunk: any) => chunks.push(Buffer.from(chunk)));
                stream.on("error", (error: any) => reject(error));
                stream.on("end", () => resolve(Buffer.concat(chunks)));
            });
        } catch (error) {
            throw new Error(
                `Failed to download file from storage: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Checks if file exists in storage
     * @param objectKey Object storage key
     * @returns true if file exists, false otherwise
     */
    async fileExists(objectKey: string): Promise<boolean> {
        try {
            this.validateObjectKey(objectKey);
            await this.client.statObject(this.bucketName, objectKey);
            return true;
        } catch (error: unknown) {
            // Check if error is "not found" or other error
            if (
                error instanceof Error &&
                error.message &&
                error.message.includes("Not Found")
            ) {
                return false;
            }
            throw error;
        }
    }

    /**
     * Gets file metadata without downloading full content
     * @param objectKey Object storage key
     * @returns File metadata
     */
    async getFileInfo(objectKey: string): Promise<StorageFileInfo> {
        try {
            this.validateObjectKey(objectKey);
            const stat = await this.client.statObject(this.bucketName, objectKey);

            return {
                key: objectKey,
                size: stat.size,
                lastModified: stat.lastModified,
                etag: stat.etag,
            };
        } catch (error) {
            throw new Error(
                `Failed to get file info: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Deletes file from storage
     * Should only be called as part of permanent document removal (not normal reprocessing)
     * @param objectKey Object storage key
     */
    async deleteFile(objectKey: string): Promise<void> {
        try {
            this.validateObjectKey(objectKey);
            await this.client.removeObject(this.bucketName, objectKey);
        } catch (error) {
            throw new Error(
                `Failed to delete file from storage: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Lists all objects for a household (for audit/cleanup)
     * @param householdId Household ID to filter by
     * @returns List of object keys
     */
    async listHouseholdDocuments(householdId: EntityId): Promise<string[]> {
        try {
            const prefix = `household-${householdId}/statements/`;
            const objectsList: string[] = [];

            return new Promise((resolve, reject) => {
                const stream = this.client.listObjects(this.bucketName, prefix, true);

                stream.on("data", (obj: any) => {
                    if (obj.name) {
                        objectsList.push(obj.name);
                    }
                });

                stream.on("error", (error: any) => reject(error));
                stream.on("end", () => resolve(objectsList));
            });
        } catch (error) {
            throw new Error(
                `Failed to list household documents: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Validates object key format for security
     * Prevents path traversal and other injection attacks
     * @param objectKey Key to validate
     * @throws Error if key is invalid
     */
    private validateObjectKey(objectKey: string): void {
        // Prevent encoded path traversal (URL-encoded ../, ..\\, etc)
        const decodedKey = decodeURIComponent(objectKey);
        if (decodedKey !== objectKey) {
            // Key was URL-encoded, verify it doesn't attempt traversal
            if (decodedKey.includes("..") || decodedKey.includes("~")) {
                throw new Error("Invalid object key: contains encoded path traversal sequences");
            }
        }

        // Must not contain literal path traversal sequences
        if (objectKey.includes("..") || objectKey.includes("~")) {
            throw new Error("Invalid object key: contains path traversal sequences");
        }

        // Must not contain null bytes or other dangerous characters
        if (objectKey.includes("\0") || objectKey.includes("\r") || objectKey.includes("\n")) {
            throw new Error("Invalid object key: contains dangerous characters");
        }

        // Strict UUID format validation: 8-4-4-4-12 hexadecimal digits
        const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        const keyParts = objectKey.split("/");

        // Expected format: household-{UUID}/statements/{UUID}/{timestamp}.{ext}
        if (keyParts.length !== 4) {
            throw new Error("Invalid object key: incorrect path structure");
        }

        // Validate household ID (householdId is in first part after household- prefix)
        const householdPart = keyParts[0];
        if (!householdPart.startsWith("household-")) {
            throw new Error("Invalid object key: missing household prefix");
        }

        const householdId = householdPart.replace("household-", "");
        if (!uuidPattern.test(householdId)) {
            throw new Error("Invalid object key: invalid household ID format");
        }

        // Validate 'statements' directory name
        if (keyParts[1] !== "statements") {
            throw new Error("Invalid object key: missing statements directory");
        }

        // Validate document ID (second UUID in path)
        if (!uuidPattern.test(keyParts[2])) {
            throw new Error("Invalid object key: invalid document ID format");
        }

        // Validate file name format (timestamp.ext)
        const fileName = keyParts[3];
        const fileNamePattern = /^[0-9]{17,}\.[a-z0-9]{1,10}$/; // YYYYMMDDHHMMSSMMM.ext
        if (!fileNamePattern.test(fileName)) {
            throw new Error("Invalid object key: invalid filename format");
        }

        // Must not exceed reasonable length
        if (objectKey.length > 512) {
            throw new Error("Invalid object key: too long");
        }
    }

    /**
     * Creates a temporary signed URL for file download
     * URL expires after specified duration
     * 
     * SECURITY: Caller MUST verify householdId ownership before calling this method.
     * This method validates key format but does NOT check authorization.
     * 
     * @param objectKey Object storage key
     * @param expirySeconds How long URL is valid (default: 1 hour)
     * @returns Signed URL for download
     */
    async getSignedDownloadUrl(objectKey: string, expirySeconds: number = 3600): Promise<string> {
        try {
            this.validateObjectKey(objectKey);

            // Verify file exists before generating URL
            await this.client.statObject(this.bucketName, objectKey);

            return await this.client.presignedGetObject(
                this.bucketName,
                objectKey,
                expirySeconds
            );
        } catch (error) {
            throw new Error(
                `Failed to generate signed URL: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Creates a temporary signed URL for file download with authorization check
     * Verifies that the document belongs to the specified household before generating URL
     * 
     * @param householdId Household ID requesting download
     * @param documentId Document ID to download
     * @param objectKey Object storage key
     * @param documentRepo Repository to verify ownership
     * @param expirySeconds How long URL is valid (default: 1 hour)
     * @returns Signed URL for download
     * @throws Error if document not found or access denied
     */
    async getAuthorizedDownloadUrl(
        householdId: string,
        documentId: string,
        objectKey: string,
        documentRepo: any, // FinancialDocumentRepository interface
        expirySeconds: number = 3600
    ): Promise<string> {
        // Verify document belongs to household
        const document = await documentRepo.findById(documentId);
        if (!document) {
            throw new Error("Document not found");
        }
        if (document.householdId !== householdId) {
            throw new Error("Access denied: document does not belong to this household");
        }
        if (document.objectStorageKey !== objectKey) {
            throw new Error("Access denied: object key mismatch");
        }

        // Authorization verified - generate signed URL
        return this.getSignedDownloadUrl(objectKey, expirySeconds);
    }
}

/**
 * Factory function to create storage adapter from environment variables
 * @returns Configured ObjectStorageAdapter
 */
export function createObjectStorageAdapter(): ObjectStorageAdapter {
    let endpoint = process.env.MINIO_ENDPOINT || "localhost";
    let port = 9000;

    // Parse endpoint if it includes protocol (e.g., "http://minio:9000")
    if (endpoint.includes("://")) {
        const url = new URL(`http://${endpoint.replace(/^https?:\/\//, "")}`);
        endpoint = url.hostname;
        if (url.port) {
            port = parseInt(url.port, 10);
        }
    }

    // Override with explicit port if provided
    if (process.env.MINIO_PORT) {
        port = parseInt(process.env.MINIO_PORT, 10);
    }

    const config: MinioConfig = {
        endPoint: endpoint,
        port: port,
        useSSL: process.env.MINIO_USE_SSL === "true",
        accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
        secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
        bucketName: process.env.MINIO_BUCKET || "financial-documents",
    };

    return new ObjectStorageAdapter(config);
}
