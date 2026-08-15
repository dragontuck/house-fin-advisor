/**
 * Document Processing Worker
 * Handles the state machine for statement/document processing
 * 
 * Lifecycle:
 * UPLOADED → VALIDATING → IDENTIFYING → PARSING → NORMALIZING → RECONCILING → READY_TO_POST
 *                ↓                           ↓                                    ↓
 *          VALIDATION_FAILED         PARSE_FAILED                        REVIEW_REQUIRED
 */

import { Job } from "bull";
import {
    EntityId,
    DocumentProcessingStatus,
    FinancialDocument,
} from "@house-fin/contracts";
import {
    isValidStatusTransition,
    VALID_STATUS_TRANSITIONS,
} from "@house-fin/domain";
import { PgFinancialDocumentRepository } from "../db/repositories";
import { DocumentProcessingJobData } from "./queue";

/**
 * Process a single document through the processing pipeline
 */
export async function processDocument(
    job: Job<DocumentProcessingJobData>,
    documentRepository: PgFinancialDocumentRepository
): Promise<FinancialDocument> {
    const { documentId, householdId, correlationId } = job.data;

    console.log(
        `[${correlationId}] Starting document processing for document ${documentId}`
    );

    // Fetch document from database
    const document = await documentRepository.findById(documentId);
    if (!document) {
        throw new Error(`Document not found: ${documentId}`);
    }

    // Verify household ownership
    if (document.householdId !== householdId) {
        throw new Error(`Household mismatch: document ${documentId} not owned by ${householdId}`);
    }

    // Verify document is in a state that should be processed
    if (document.processingStatus !== DocumentProcessingStatus.UPLOADED) {
        console.warn(
            `[${correlationId}] Document ${documentId} is in state ${document.processingStatus}, skipping processing`
        );
        return document;
    }

    try {
        // State 1: VALIDATING - Verify document integrity and format
        console.log(`[${correlationId}] Transitioning to VALIDATING`);
        await documentRepository.updateStatus(
            documentId,
            DocumentProcessingStatus.VALIDATING,
            undefined,
            undefined,
            correlationId,
            "Started validation phase"
        );

        // TODO: Implement actual validation logic
        // - Verify file checksum matches
        // - Parse headers to identify file type
        // - Validate file structure

        // State 2: IDENTIFYING - Determine statement type and source
        console.log(`[${correlationId}] Transitioning to IDENTIFYING`);
        await documentRepository.updateStatus(
            documentId,
            DocumentProcessingStatus.IDENTIFYING,
            undefined,
            undefined,
            correlationId,
            "Identified document type"
        );

        // TODO: Implement document identification
        // - Extract headers and metadata
        // - Match against known statement formats
        // - Identify financial institution

        // State 3: PARSING - Extract transaction data from document
        console.log(`[${correlationId}] Transitioning to PARSING`);
        await documentRepository.updateStatus(
            documentId,
            DocumentProcessingStatus.PARSING,
            undefined,
            undefined,
            correlationId,
            "Started parsing transactions"
        );

        // TODO: Implement document parsing
        // - Use appropriate parser (CSV/PDF/Image)
        // - Extract transactions
        // - Handle parse errors gracefully

        // State 4: NORMALIZING - Standardize transaction format
        console.log(`[${correlationId}] Transitioning to NORMALIZING`);
        await documentRepository.updateStatus(
            documentId,
            DocumentProcessingStatus.NORMALIZING,
            undefined,
            undefined,
            correlationId,
            "Normalized transaction data"
        );

        // TODO: Implement normalization
        // - Standardize date formats
        // - Normalize currency amounts
        // - Clean merchant names

        // State 5: RECONCILING - Match with existing data
        console.log(`[${correlationId}] Transitioning to RECONCILING`);
        await documentRepository.updateStatus(
            documentId,
            DocumentProcessingStatus.RECONCILING,
            undefined,
            undefined,
            correlationId,
            "Reconciling with existing data"
        );

        // TODO: Implement reconciliation
        // - Match transactions to existing posts
        // - Detect duplicates
        // - Flag anomalies

        // State 6: READY_TO_POST - Transactions ready for posting
        console.log(`[${correlationId}] Transitioning to READY_TO_POST`);
        const completedDocument = await documentRepository.updateStatus(
            documentId,
            DocumentProcessingStatus.READY_TO_POST,
            undefined,
            undefined,
            correlationId,
            "Document processing complete - ready to post transactions"
        );

        console.log(
            `[${correlationId}] Document ${documentId} successfully processed`
        );
        return completedDocument;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        console.error(
            `[${correlationId}] Document processing failed: ${errorMessage}`
        );

        // Determine which state failed and transition appropriately
        let failedStatus = DocumentProcessingStatus.FAILED;
        const currentDoc = await documentRepository.findById(documentId);

        if (currentDoc) {
            const currentStatus = currentDoc.processingStatus;

            // Try to transition to a failed state based on current state
            if (currentStatus === DocumentProcessingStatus.VALIDATING) {
                failedStatus = DocumentProcessingStatus.VALIDATION_FAILED;
            } else if (currentStatus === DocumentProcessingStatus.PARSING) {
                failedStatus = DocumentProcessingStatus.PARSE_FAILED;
            }
        }

        // Update document with failure status
        const failedDocument = await documentRepository.updateStatus(
            documentId,
            failedStatus,
            "PROCESSING_FAILED",
            `Failed during processing: ${errorMessage}`,
            correlationId,
            `Processing failed at ${new Date().toISOString()}`
        );

        throw error; // Re-throw to fail the job for retry
    }
}

/**
 * Register the document processing worker with Bull queue
 * This function should be called on application startup
 */
export function registerDocumentProcessingWorker(
    queue: any, // Bull Queue type
    documentRepository: PgFinancialDocumentRepository
): void {
    queue.process("*", async (job: Job<DocumentProcessingJobData>) => {
        return processDocument(job, documentRepository);
    });

    console.log("Document processing worker registered");
}
