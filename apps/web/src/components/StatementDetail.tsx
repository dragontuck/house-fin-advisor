/**
 * Statement Detail Component
 * Shows comprehensive information about a single statement
 */

import { useEffect, useState } from "react";
import { getStatementSummary, StatementSummary } from "../api";
import "./StatementDetail.css";

interface DetailState {
    loading: boolean;
    error: string | null;
    summary: StatementSummary | null;
}

interface StatementDetailProps {
    documentId: string;
    onClose?: () => void;
}

export default function StatementDetail({ documentId, onClose }: StatementDetailProps) {
    const [state, setState] = useState<DetailState>({
        loading: true,
        error: null,
        summary: null,
    });

    useEffect(() => {
        loadStatement();
    }, [documentId]);

    const loadStatement = async () => {
        try {
            setState((prev) => ({ ...prev, loading: true, error: null }));
            const summary = await getStatementSummary(documentId);
            setState((prev) => ({ ...prev, summary, loading: false }));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to load statement details";
            setState((prev) => ({ ...prev, error: errorMessage, loading: false }));
        }
    };

    const formatDate = (dateString: string | undefined | null) => {
        if (!dateString) return "—";
        const date = new Date(dateString);
        return date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    if (state.loading) {
        return (
            <div className="statement-detail-container">
                <div className="detail-loading">
                    <div className="spinner"></div>
                    <p>Loading statement details...</p>
                </div>
            </div>
        );
    }

    if (state.error) {
        return (
            <div className="statement-detail-container">
                <div className="detail-error">
                    <h3>Could not load details</h3>
                    <p>{state.error}</p>
                    <button className="btn btn-primary" onClick={loadStatement}>
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    if (!state.summary) {
        return null;
    }

    const { summary } = state;

    return (
        <div className="statement-detail-container">
            {onClose && (
                <button className="close-button" onClick={onClose} aria-label="Close">
                    ✕
                </button>
            )}

            {/* Processing Summary */}
            {(summary.processingStatus === "COMPLETED" ||
                summary.processingStatus === "PARTIALLY_COMPLETED") && (
                    <div className="processing-summary">
                        <div className="summary-title">
                            <h2>Processing Summary</h2>
                        </div>

                        <div className="summary-metrics">
                            <div className="metric">
                                <div className="metric-label">Transactions Found</div>
                                <div className="metric-value">{summary.totalTransactionsFound}</div>
                            </div>
                            <div className="metric">
                                <div className="metric-label">Imported</div>
                                <div className="metric-value">{summary.importedTransactionCount}</div>
                            </div>
                            <div className="metric">
                                <div className="metric-label">Need Your Attention</div>
                                <div className="metric-value">{summary.reviewItemCount}</div>
                            </div>
                            <div className="metric">
                                <div className="metric-label">
                                    {summary.duplicateCount === 1
                                        ? "Was Duplicated"
                                        : "Were Duplicated"}
                                </div>
                                <div className="metric-value">{summary.duplicateCount}</div>
                            </div>
                        </div>

                        <div className="summary-actions">
                            {summary.importedTransactionCount > 0 && (
                                <button className="btn btn-secondary">View Transactions</button>
                            )}
                            {summary.reviewItemCount > 0 && (
                                <button className="btn btn-secondary">
                                    Review {summary.reviewItemCount}{" "}
                                    {summary.reviewItemCount === 1 ? "Item" : "Items"}
                                </button>
                            )}
                        </div>
                    </div>
                )}

            {/* File Metadata */}
            <div className="detail-section">
                <h3>File Information</h3>
                <dl className="detail-list">
                    <dt>File Name</dt>
                    <dd>{summary.fileName}</dd>

                    <dt>Type</dt>
                    <dd className="source-type">{summary.sourceType}</dd>

                    <dt>Uploaded</dt>
                    <dd>{formatDate(summary.uploadedAt)}</dd>

                    <dt>Processed</dt>
                    <dd>{formatDate(summary.processedAt)}</dd>

                    <dt>Period</dt>
                    <dd>
                        {summary.periodStart && summary.periodEnd
                            ? `${formatDate(summary.periodStart)} to ${formatDate(
                                summary.periodEnd
                            )}`
                            : "—"}
                    </dd>

                    <dt>Account</dt>
                    <dd>
                        {summary.account?.name} ({summary.account?.type})
                    </dd>

                    {summary.institutionName && (
                        <>
                            <dt>Institution</dt>
                            <dd>{summary.institutionName}</dd>
                        </>
                    )}
                </dl>
            </div>

            {/* Processing Details */}
            <div className="detail-section">
                <h3>Processing Details</h3>
                <dl className="detail-list">
                    <dt>Status</dt>
                    <dd>
                        <span
                            className={`status-badge status-${summary.processingStatus.toLowerCase()}`}
                        >
                            {summary.processingStatus === "COMPLETED"
                                ? "Complete"
                                : summary.processingStatus === "PARTIALLY_COMPLETED"
                                    ? "Partial"
                                    : summary.processingStatus === "FAILED"
                                        ? "Failed"
                                        : "Processing"}
                        </span>
                    </dd>

                    <dt>Transactions Found</dt>
                    <dd>{summary.totalTransactionsFound}</dd>

                    <dt>Imported</dt>
                    <dd>{summary.importedTransactionCount}</dd>

                    <dt>Duplicates Prevented</dt>
                    <dd>{summary.duplicateCount}</dd>

                    <dt>Items Pending Review</dt>
                    <dd>{summary.reviewItemCount}</dd>

                    {summary.reviewItemsPending !== undefined && (
                        <>
                            <dt>Review Status</dt>
                            <dd>
                                {summary.reviewItemsPending} pending, {summary.reviewItemsResolved} resolved
                            </dd>
                        </>
                    )}
                </dl>
            </div>

            {/* Error State */}
            {summary.processingStatus === "FAILED" && summary.errorMessageUser && (
                <div className="detail-section error-section">
                    <h3>Processing Error</h3>
                    <div className="error-message">{summary.errorMessageUser}</div>
                    {summary.errorCode && (
                        <p className="error-code">Error code: {summary.errorCode}</p>
                    )}
                </div>
            )}
        </div>
    );
}