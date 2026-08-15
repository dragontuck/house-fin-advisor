/**
 * Statement List Component
 * Shows all uploaded statements with key metadata
 */

import { useEffect, useState } from "react";
import { listStatements, StatementListItem } from "../api";
import "./StatementList.css";

interface ListState {
    loading: boolean;
    error: string | null;
    statements: StatementListItem[];
}

export default function StatementList() {
    const [state, setState] = useState<ListState>({
        loading: true,
        error: null,
        statements: [],
    });

    useEffect(() => {
        loadStatements();
    }, []);

    const loadStatements = async () => {
        try {
            setState((prev) => ({ ...prev, loading: true, error: null }));
            const statements = await listStatements();
            setState((prev) => ({ ...prev, statements, loading: false }));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to load statements";
            setState((prev) => ({ ...prev, error: errorMessage, loading: false }));
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    const formatPeriod = (startStr?: string | null, endStr?: string | null) => {
        if (!startStr || !endStr) return "—";
        const start = new Date(startStr).toLocaleDateString("en-US", {
            year: "2-digit",
            month: "short",
        });
        const end = new Date(endStr).toLocaleDateString("en-US", {
            year: "2-digit",
            month: "short",
            day: "numeric",
        });
        return `${start} - ${end}`;
    };

    const getStatusBadgeClass = (status: string) => {
        switch (status) {
            case "COMPLETED":
                return "status-success";
            case "PARTIALLY_COMPLETED":
                return "status-warning";
            case "FAILED":
                return "status-error";
            case "PROCESSING":
            case "VALIDATING":
            case "PARSING":
            case "RECONCILING":
                return "status-processing";
            default:
                return "status-default";
        }
    };

    const getStatusLabel = (status: string) => {
        const labels: Record<string, string> = {
            UPLOADED: "Uploaded",
            VALIDATING: "Validating",
            VALIDATION_FAILED: "Failed",
            IDENTIFYING: "Processing",
            PARSING: "Reading",
            PARSE_FAILED: "Failed",
            NORMALIZING: "Processing",
            RECONCILING: "Checking",
            REVIEW_REQUIRED: "Review Needed",
            READY_TO_POST: "Ready",
            POSTING: "Posting",
            COMPLETED: "Completed",
            PARTIALLY_COMPLETED: "Partial",
            FAILED: "Failed",
        };
        return labels[status] || status;
    };

    if (state.loading) {
        return (
            <div className="statement-list-container">
                <div className="list-loading">
                    <div className="spinner"></div>
                    <p>Loading statements...</p>
                </div>
            </div>
        );
    }

    if (state.error) {
        return (
            <div className="statement-list-container">
                <div className="list-error">
                    <h3>Could not load statements</h3>
                    <p>{state.error}</p>
                    <button className="btn btn-primary" onClick={loadStatements}>
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    if (state.statements.length === 0) {
        return (
            <div className="statement-list-container">
                <div className="list-empty">
                    <h2>No statements yet</h2>
                    <p>Upload your first financial statement to get started</p>
                </div>
            </div>
        );
    }

    return (
        <div className="statement-list-container">
            <div className="list-header">
                <h2>Your Statements</h2>
                <p className="list-count">{state.statements.length} statement{state.statements.length !== 1 ? "s" : ""}</p>
            </div>

            <div className="list-table-wrapper">
                <table className="statements-table">
                    <thead>
                        <tr>
                            <th>File Name</th>
                            <th>Account</th>
                            <th>Period</th>
                            <th>Uploaded</th>
                            <th>Status</th>
                            <th>Transactions</th>
                            <th>Needs Review</th>
                        </tr>
                    </thead>
                    <tbody>
                        {state.statements.map((stmt) => (
                            <tr key={stmt.id} className="statement-row">
                                <td className="file-name" title={stmt.fileName}>
                                    <a href={`#/statements/${stmt.id}`}>{stmt.fileName}</a>
                                </td>
                                <td className="account">
                                    {stmt.accountId ? "Account" : "—"}
                                </td>
                                <td className="period">
                                    {formatPeriod(stmt.periodStart, stmt.periodEnd)}
                                </td>
                                <td className="uploaded">
                                    {formatDate(stmt.uploadedAt)}
                                </td>
                                <td className="status">
                                    <span className={`status-badge ${getStatusBadgeClass(stmt.processingStatus)}`}>
                                        {getStatusLabel(stmt.processingStatus)}
                                    </span>
                                </td>
                                <td className="transaction-count">
                                    {stmt.processingStatus === "COMPLETED" || stmt.processingStatus === "PARTIALLY_COMPLETED"
                                        ? stmt.importedTransactionCount
                                        : "—"}
                                </td>
                                <td className="review-count">
                                    {stmt.reviewCount > 0 ? (
                                        <span className="review-badge">{stmt.reviewCount}</span>
                                    ) : (
                                        "—"
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
