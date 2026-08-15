/**
 * Statement Upload Component
 * Provides drag-drop file upload, progress tracking, and status polling
 */

import React, { useState, useRef, useEffect } from "react";
import {
    uploadStatement,
    getDocumentStatus,
    getStatementSummary,
    DocumentProcessingStatus,
    DocumentSourceType,
    StatementSummary,
} from "../api";
import "./StatementUpload.css";

// User-friendly state messages for processing pipeline
const STATE_MESSAGES: Record<DocumentProcessingStatus, { title: string; description: string }> = {
    UPLOADED: { title: "Statement received", description: "Preparing to process your statement" },
    VALIDATING: { title: "Reading statement", description: "Checking file format and structure" },
    VALIDATION_FAILED: { title: "Could not read statement", description: "This file may be corrupted or in an unsupported format" },
    IDENTIFYING: { title: "Identifying account", description: "Matching the account to your financial accounts" },
    PARSING: { title: "Reading transactions", description: "Extracting transaction details from the statement" },
    PARSE_FAILED: { title: "Could not read transactions", description: "The statement format may have changed or contain unexpected data" },
    NORMALIZING: { title: "Organizing transactions", description: "Standardizing transaction data for analysis" },
    RECONCILING: { title: "Checking for duplicates", description: "Checking this statement against your existing transactions" },
    REVIEW_REQUIRED: { title: "We need your help", description: "A few transactions need your review" },
    READY_TO_POST: { title: "Almost ready", description: "Final validation in progress" },
    POSTING: { title: "Updating your accounts", description: "Adding transactions to your financial accounts" },
    COMPLETED: { title: "All set!", description: "Your statement has been successfully processed" },
    PARTIALLY_COMPLETED: { title: "Mostly complete", description: "Some transactions were processed, others need review" },
    FAILED: { title: "Processing failed", description: "An unexpected error occurred while processing your statement" },
};

// Error recovery guidance
const ERROR_GUIDANCE: Record<string, { what: string; why: string; action: string }> = {
    INVALID_FORMAT: {
        what: "Your statement could not be read.",
        why: "This PDF may be password-protected or scanned.",
        action: "Upload a different file or enter the PDF password",
    },
    INVALID_MIME_TYPE: {
        what: "This file type is not supported.",
        why: "We support CSV, PDF, PNG, JPEG, TIFF, and text files.",
        action: "Convert your statement to one of these formats",
    },
    FILE_TOO_LARGE: {
        what: "Your file is too large.",
        why: "File uploads are limited to 50 MB.",
        action: "Split the file into smaller parts or compress it",
    },
    INVALID_FILENAME: {
        what: "The filename is invalid.",
        why: "Filenames must be 1-255 characters.",
        action: "Rename your file and try again",
    },
    ACCOUNT_NOT_FOUND: {
        what: "Could not match the account.",
        why: "The statement account doesn't match any of your existing accounts.",
        action: "Check your account settings or select the correct account",
    },
};

interface UploadState {
    stage: "idle" | "uploading" | "processing" | "success" | "error" | "review";
    progress: number;
    documentId?: string;
    fileName?: string;
    processingStatus?: DocumentProcessingStatus;
    errorCode?: string;
    errorMessage?: string;
    summary?: StatementSummary;
}

export default function StatementUpload() {
    const [state, setState] = useState<UploadState>({ stage: "idle", progress: 0 });
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollIntervalRef = useRef<number>();

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, []);

    /**
     * Start polling for document status
     */
    const startPolling = (documentId: string) => {
        let retries = 0;
        const maxRetries = 300; // 5 minutes with 1-second interval

        const poll = async () => {
            try {
                const status = await getDocumentStatus(documentId);

                setState((prev) => ({
                    ...prev,
                    processingStatus: status.processingStatus,
                    errorCode: status.errorCode || undefined,
                    errorMessage: status.errorMessageUser || undefined,
                }));

                // Check if processing is complete
                const terminalStates: DocumentProcessingStatus[] = [
                    "COMPLETED",
                    "PARTIALLY_COMPLETED",
                    "FAILED",
                ];
                const reviewStates: DocumentProcessingStatus[] = ["REVIEW_REQUIRED"];

                if (terminalStates.includes(status.processingStatus)) {
                    // Fetch detailed summary for completed/partially completed
                    if (status.processingStatus !== "FAILED") {
                        try {
                            const summary = await getStatementSummary(documentId);
                            setState((prev) => ({
                                ...prev,
                                stage: "success",
                                summary,
                            }));
                        } catch (summaryError) {
                            console.error("Failed to fetch summary:", summaryError);
                            setState((prev) => ({
                                ...prev,
                                stage: "success",
                            }));
                        }
                    } else {
                        setState((prev) => ({
                            ...prev,
                            stage: "error",
                        }));
                    }
                    if (pollIntervalRef.current) {
                        clearInterval(pollIntervalRef.current);
                    }
                } else if (reviewStates.includes(status.processingStatus)) {
                    setState((prev) => ({
                        ...prev,
                        stage: "review",
                    }));
                    if (pollIntervalRef.current) {
                        clearInterval(pollIntervalRef.current);
                    }
                }
            } catch (error) {
                console.error("Polling error:", error);
                retries++;

                if (retries >= maxRetries) {
                    setState((prev) => ({
                        ...prev,
                        stage: "error",
                        errorMessage: "Processing status check timed out. Your statement is still being processed.",
                    }));
                    if (pollIntervalRef.current) {
                        clearInterval(pollIntervalRef.current);
                    }
                }
            }
        };

        // Poll every 1 second
        pollIntervalRef.current = window.setInterval(poll, 1000);

        // Initial poll immediately
        poll();
    };

    /**
     * Handle file upload
     */
    const handleUpload = async (file: File) => {
        // Validate file
        const supportedTypes = [
            "text/csv",
            "application/csv",
            "text/plain",
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/tiff",
            "application/octet-stream",
        ];

        if (!supportedTypes.includes(file.type) && !file.name.endsWith(".csv")) {
            setState({
                stage: "error",
                progress: 0,
                fileName: file.name,
                errorCode: "INVALID_MIME_TYPE",
                errorMessage: ERROR_GUIDANCE.INVALID_MIME_TYPE.what,
            });
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            setState({
                stage: "error",
                progress: 0,
                fileName: file.name,
                errorCode: "FILE_TOO_LARGE",
                errorMessage: ERROR_GUIDANCE.FILE_TOO_LARGE.what,
            });
            return;
        }

        setState({ stage: "uploading", progress: 30, fileName: file.name });

        try {
            // Determine source type from file
            let sourceType: DocumentSourceType = "MANUAL";
            if (file.type.includes("csv") || file.name.endsWith(".csv")) {
                sourceType = "CSV";
            } else if (file.type.includes("pdf")) {
                sourceType = "PDF";
            } else if (file.type.includes("image")) {
                sourceType = "IMAGE";
            }

            setState({ stage: "uploading", progress: 60, fileName: file.name });

            const response = await uploadStatement(file, sourceType);

            setState({
                stage: "processing",
                progress: 80,
                documentId: response.id,
                fileName: file.name,
                processingStatus: response.status,
            });

            // Start polling for status
            startPolling(response.id);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to upload statement";
            setState({
                stage: "error",
                progress: 0,
                fileName: file.name,
                errorMessage,
            });
        }
    };

    /**
     * Handle drag and drop
     */
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleUpload(files[0]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            handleUpload(files[0]);
        }
    };

    const handleReset = () => {
        setState({ stage: "idle", progress: 0 });
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    // Render based on state
    if (state.stage === "idle") {
        return (
            <div
                className={`statement-upload-container ${dragActive ? "drag-active" : ""}`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div className="upload-box">
                    <div className="upload-icon">📄</div>
                    <h2>Add a Statement</h2>
                    <p className="upload-description">
                        Drag and drop your statement or click to browse
                    </p>
                    <div className="upload-formats">
                        <small>Supports: CSV, PDF, PNG, JPEG, TIFF</small>
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        Choose File
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileSelect}
                        className="hidden-input"
                        accept=".csv,.pdf,.png,.jpg,.jpeg,.tiff,.tif,.txt"
                    />
                </div>
            </div>
        );
    }

    if (state.stage === "uploading") {
        return (
            <div className="statement-upload-container">
                <div className="status-box">
                    <h2>Uploading Statement</h2>
                    <p className="file-name">{state.fileName}</p>
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${state.progress}%` }}></div>
                    </div>
                    <p className="progress-text">{state.progress}%</p>
                </div>
            </div>
        );
    }

    if (state.stage === "processing" && state.processingStatus) {
        const stateInfo = STATE_MESSAGES[state.processingStatus] || STATE_MESSAGES.UPLOADED;
        const isTerminal = ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"].includes(
            state.processingStatus
        );

        return (
            <div className="statement-upload-container">
                <div className="status-box processing">
                    <div className="spinner"></div>
                    <h2>{stateInfo.title}</h2>
                    <p className="status-description">{stateInfo.description}</p>
                    <p className="status-detail">{state.fileName}</p>
                    {isTerminal && (
                        <button className="btn btn-primary" onClick={handleReset}>
                            Upload Another Statement
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (state.stage === "success") {
        const summary = state.summary;

        return (
            <div className="statement-upload-container">
                <div className="status-box success">
                    <div className="success-icon">✓</div>
                    <h2>Statement processed successfully.</h2>

                    {summary && (
                        <div className="success-summary">
                            <div className="summary-metrics">
                                <div className="metric-item">
                                    <div className="metric-number">{summary.totalTransactionsFound}</div>
                                    <div className="metric-label">transactions found</div>
                                </div>

                                <div className="metric-item">
                                    <div className="metric-number">{summary.importedTransactionCount}</div>
                                    <div className="metric-label">imported</div>
                                </div>

                                <div className="metric-item">
                                    <div className="metric-number">{summary.reviewItemCount}</div>
                                    <div className="metric-label">need your attention</div>
                                </div>

                                <div className="metric-item">
                                    <div className="metric-number">
                                        {summary.duplicateCount === 0 ? "Nothing" : summary.duplicateCount}
                                    </div>
                                    <div className="metric-label">
                                        {summary.duplicateCount === 0 ? "was duplicated" : "were duplicated"}
                                    </div>
                                </div>
                            </div>

                            <div className="success-actions">
                                {summary.importedTransactionCount > 0 && (
                                    <button className="btn btn-primary">
                                        View Transactions
                                    </button>
                                )}
                                {summary.reviewItemCount > 0 && (
                                    <button className="btn btn-secondary">
                                        Review {summary.reviewItemCount} Item{summary.reviewItemCount !== 1 ? "s" : ""}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    <button className="btn btn-tertiary" onClick={handleReset}>
                        Upload Another Statement
                    </button>
                </div>
            </div>
        );
    }

    if (state.stage === "review") {
        return (
            <div className="statement-upload-container">
                <div className="status-box review">
                    <div className="review-icon">⚠</div>
                    <h2>We need your help</h2>
                    <p className="status-description">
                        A few transactions in your statement need your review before we can finalize everything.
                    </p>
                    <p className="file-name">{state.fileName}</p>
                    <button className="btn btn-primary">
                        Review Transactions
                    </button>
                    <button className="btn btn-secondary" onClick={handleReset}>
                        Upload Another Statement
                    </button>
                </div>
            </div>
        );
    }

    if (state.stage === "error") {
        const guidance = state.errorCode ? ERROR_GUIDANCE[state.errorCode] : undefined;

        return (
            <div className="statement-upload-container">
                <div className="status-box error">
                    <div className="error-icon">✕</div>
                    <h2>{guidance?.what || "Upload failed"}</h2>
                    {guidance && (
                        <>
                            <p className="error-why">
                                <strong>Why:</strong> {guidance.why}
                            </p>
                            <p className="error-action">
                                <strong>What to do:</strong> {guidance.action}
                            </p>
                        </>
                    )}
                    {state.errorMessage && !guidance && (
                        <p className="error-message">{state.errorMessage}</p>
                    )}
                    <p className="file-name">{state.fileName}</p>
                    <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
                        Try Another File
                    </button>
                    <button className="btn btn-secondary" onClick={handleReset}>
                        Cancel
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileSelect}
                        className="hidden-input"
                        accept=".csv,.pdf,.png,.jpg,.jpeg,.tiff,.tif,.txt"
                    />
                </div>
            </div>
        );
    }

    return null;
}
