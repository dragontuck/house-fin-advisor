/**
 * Document and Statement Endpoints
 * Handles file upload, processing status, listing
 */

import { Request, Response, NextFunction, Express } from "express";
import { v4 as uuidv4 } from "uuid";
import { EntityId, DocumentSourceType, DocumentProcessingStatus, DocumentUploadResponse, DocumentStatusResponse } from "@house-fin/contracts";
import { validateDocumentUpload, validateFileContent, calculateFileChecksum, generateObjectStorageKey } from "@house-fin/domain";
import { RouteContext, RouteRegistrar } from "./types";

class ApiError extends Error {
    constructor(
        public statusCode: number,
        public userMessage: string,
        public errorCode: string,
        public retryable: boolean = false,
        message?: string
    ) {
        super(message || userMessage);
        this.name = "ApiError";
    }
}

/**
 * Register document endpoints
 */
export const registerDocumentRoutes: RouteRegistrar = (context: RouteContext) => {
    const { app, documentRepo, storageAdapter, reviewQueueService, postingRepo } = context;

    /**
     * POST /documents/upload
     * Upload a financial statement/document
     */
    app.post(
        "/documents/upload",
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const householdId = req.context!.householdId;
                const correlationId = req.context!.correlationId;

                const {
                    fileName,
                    mimeType,
                    fileSize,
                    sourceType,
                    fileContent,
                    accountId,
                    institutionName,
                    statementType,
                    periodStart,
                    periodEnd,
                } = req.body;

                if (!fileName || !mimeType || !fileSize || !sourceType || !fileContent) {
                    throw new ApiError(
                        400,
                        "Missing required fields: fileName, mimeType, fileSize, sourceType, fileContent",
                        "UPLOAD_INVALID_REQUEST"
                    );
                }

                if (!Object.values(DocumentSourceType).includes(sourceType)) {
                    throw new ApiError(
                        400,
                        `Invalid source type. Allowed: ${Object.values(DocumentSourceType).join(", ")}`,
                        "UPLOAD_INVALID_SOURCE_TYPE"
                    );
                }

                const validationError = validateDocumentUpload(fileName, mimeType, fileSize);
                if (validationError) {
                    throw new ApiError(400, validationError.userMessage, validationError.errorCode);
                }

                let fileBuffer: Buffer;
                try {
                    fileBuffer = Buffer.from(fileContent, "base64");
                } catch (error) {
                    throw new ApiError(400, "Invalid file content encoding", "UPLOAD_INVALID_ENCODING");
                }

                if (fileBuffer.length !== fileSize) {
                    throw new ApiError(400, "File size mismatch after decoding", "UPLOAD_SIZE_MISMATCH");
                }

                const contentValidationError = validateFileContent(fileBuffer, mimeType);
                if (contentValidationError) {
                    throw new ApiError(
                        400,
                        contentValidationError.userMessage,
                        contentValidationError.errorCode
                    );
                }

                const fileChecksum = calculateFileChecksum(fileBuffer);

                const existingDoc = await documentRepo.findByChecksum(householdId, fileChecksum);
                if (existingDoc) {
                    const statusResponse: DocumentStatusResponse = {
                        id: existingDoc.id,
                        fileName: existingDoc.fileName,
                        sourceType: existingDoc.sourceType,
                        processingStatus: existingDoc.processingStatus,
                        uploadedAt: existingDoc.uploadedAt,
                        processedAt: existingDoc.processedAt,
                        errorCode: existingDoc.errorCode,
                        errorMessageUser: existingDoc.errorMessageUser,
                    };
                    return res.status(200).json(statusResponse);
                }

                const documentId = EntityId(uuidv4());
                const objectStorageKey = generateObjectStorageKey(householdId, documentId, fileName);

                await storageAdapter.uploadFile(objectStorageKey, fileBuffer, mimeType);

                let document;
                try {
                    document = await documentRepo.create({
                        householdId,
                        sourceType: sourceType as DocumentSourceType,
                        fileName,
                        mimeType,
                        fileSizeBytes: fileSize,
                        fileChecksum,
                        objectStorageKey,
                        accountId: accountId ? (accountId as EntityId) : undefined,
                        institutionName: institutionName || undefined,
                        statementType: statementType || undefined,
                        periodStart: periodStart ? new Date(periodStart) : undefined,
                        periodEnd: periodEnd ? new Date(periodEnd) : undefined,
                        processingStatus: DocumentProcessingStatus.UPLOADED,
                        processingVersion: 1,
                        uploadedBy: "system",
                        uploadedAt: new Date(),
                        correlationId: EntityId(correlationId),
                    });
                } catch (dbError) {
                    try {
                        await storageAdapter.deleteFile(objectStorageKey);
                        console.error("[UPLOAD_CLEANUP] Deleted orphaned file", {
                            correlationId,
                            objectStorageKey,
                            householdId,
                        });
                    } catch (cleanupError) {
                        console.error("[UPLOAD_CLEANUP_FAILED] Failed to delete orphaned file", {
                            correlationId,
                            objectStorageKey,
                            householdId,
                            cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                        });
                    }
                    throw dbError;
                }

                try {
                    // TODO: Enqueue document for processing
                } catch (queueError) {
                    console.error("[QUEUE_ENQUEUE_FAILED] Failed to enqueue document", {
                        correlationId,
                        documentId: document.id,
                        householdId,
                    });
                }

                const response: DocumentUploadResponse = {
                    id: document.id,
                    correlationId: document.correlationId,
                    objectStorageKey: document.objectStorageKey,
                    status: document.processingStatus,
                    message: "Document uploaded successfully. Processing will begin shortly.",
                };

                res.status(202).json(response);
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /documents/:id
     * Get document status
     */
    app.get("/documents/:id", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;
            const documentId = req.params.id as EntityId;

            const document = await documentRepo.findById(documentId);
            if (!document) {
                throw new ApiError(404, "Document not found", "DOCUMENT_NOT_FOUND");
            }

            if (document.householdId !== householdId) {
                throw new ApiError(403, "You do not have permission to access this document", "DOCUMENT_ACCESS_DENIED");
            }

            const response: DocumentStatusResponse = {
                id: document.id,
                fileName: document.fileName,
                sourceType: document.sourceType,
                processingStatus: document.processingStatus,
                uploadedAt: document.uploadedAt,
                processedAt: document.processedAt,
                errorCode: document.errorCode,
                errorMessageUser: document.errorMessageUser,
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    });

    /**
     * GET /documents
     * List documents for household
     */
    app.get("/documents", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;

            const documents = await documentRepo.findByHouseholdId(householdId);

            const reviewItems = await reviewQueueService.listReviewItems(householdId);
            const reviewsByStatement = new Map<string, number>();
            for (const item of reviewItems) {
                if (item.statementId) {
                    reviewsByStatement.set(item.statementId, (reviewsByStatement.get(item.statementId) || 0) + 1);
                }
            }

            const responses = await Promise.all(
                documents.map(async (doc) => {
                    const postedTxs = await postingRepo.listPostedTransactions(householdId, {
                        sourceDocumentId: doc.id,
                    });

                    return {
                        id: doc.id,
                        fileName: doc.fileName,
                        sourceType: doc.sourceType,
                        processingStatus: doc.processingStatus,
                        uploadedAt: doc.uploadedAt,
                        processedAt: doc.processedAt,
                        errorCode: doc.errorCode,
                        errorMessageUser: doc.errorMessageUser,
                        accountId: doc.accountId,
                        periodStart: doc.periodStart,
                        periodEnd: doc.periodEnd,
                        importedTransactionCount: postedTxs.length,
                        reviewCount: reviewsByStatement.get(doc.id) || 0,
                    };
                })
            );

            res.json(responses);
        } catch (error) {
            next(error);
        }
    });
};
