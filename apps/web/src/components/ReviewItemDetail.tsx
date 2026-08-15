import React, { useEffect, useState } from "react";
import { ReviewItem, ReviewType } from "@house-fin/contracts";
import "./ReviewItemDetail.css";

interface ReviewItemDetailProps {
    itemId: string;
    householdId: string;
    onResolved?: () => void;
    onClosed?: () => void;
}

export const ReviewItemDetail: React.FC<ReviewItemDetailProps> = ({
    itemId,
    householdId,
    onResolved,
    onClosed,
}) => {
    const [item, setItem] = useState<ReviewItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedAction, setSelectedAction] = useState<string | null>(null);
    const [reasoning, setReasoning] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchItem();
    }, [itemId, householdId]);

    const fetchItem = async () => {
        try {
            const response = await fetch(`/api/review-queue/items/${itemId}`, {
                headers: {
                    "x-household-id": householdId,
                },
            });
            if (!response.ok) throw new Error("Failed to fetch review item");
            const data = await response.json();
            setItem(data);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching item:", err);
            setError("Failed to load review item");
            setLoading(false);
        }
    };

    const handleResolve = async () => {
        if (!selectedAction || !reasoning.trim()) {
            alert("Please select an action and provide reasoning");
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch(`/api/review-queue/items/${itemId}/resolve`, {
                method: "POST",
                headers: {
                    "x-household-id": householdId,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    chosenAction: selectedAction,
                    reasoning: reasoning.trim(),
                }),
            });

            if (!response.ok) throw new Error("Failed to resolve item");
            onResolved?.();
        } catch (err) {
            console.error("Error resolving item:", err);
            alert("Failed to resolve review item");
        } finally {
            setSubmitting(false);
        }
    };

    const handleArchive = async () => {
        setSubmitting(true);
        try {
            const response = await fetch(`/api/review-queue/items/${itemId}/archive`, {
                method: "POST",
                headers: {
                    "x-household-id": householdId,
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) throw new Error("Failed to archive item");
            onClosed?.();
        } catch (err) {
            console.error("Error archiving item:", err);
            alert("Failed to archive review item");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="review-detail loading">Loading...</div>;
    }

    if (error || !item) {
        return <div className="review-detail error">{error || "Item not found"}</div>;
    }

    const actions = getActionsForType(item.type);

    return (
        <div className="review-detail">
            <div className="detail-header">
                <h2>{item.title}</h2>
                <button className="close-btn" onClick={onClosed}>
                    ✕
                </button>
            </div>

            <div className="detail-content">
                {/* Main question/message */}
                <div className="message-section">
                    <p className="user-message">{item.userMessage}</p>
                </div>

                {/* Supporting evidence */}
                <div className="evidence-section">
                    <h3>Evidence</h3>
                    {item.supportingEvidence && item.supportingEvidence.length > 0 ? (
                        <div className="evidence-list">
                            {item.supportingEvidence.map((evidence, idx) => (
                                <div key={idx} className="evidence-item">
                                    <div className="evidence-type">{evidence.type}</div>
                                    <div className="evidence-description">{evidence.description}</div>
                                    {Object.keys(evidence.data).length > 0 && (
                                        <div className="evidence-data">
                                            <pre>{JSON.stringify(evidence.data, null, 2)}</pre>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="no-evidence">No supporting evidence available</p>
                    )}
                </div>

                {/* Candidate values / choices */}
                <div className="choices-section">
                    <h3>What would you like to do?</h3>
                    <div className="choices-list">
                        {actions.map((action) => (
                            <label key={action.value} className="choice-label">
                                <input
                                    type="radio"
                                    name="action"
                                    value={action.value}
                                    checked={selectedAction === action.value}
                                    onChange={(e) => setSelectedAction(e.target.value)}
                                    disabled={submitting}
                                />
                                <span className="choice-text">
                                    <strong>{action.label}</strong>
                                    {action.description && <p>{action.description}</p>}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Reasoning */}
                <div className="reasoning-section">
                    <label htmlFor="reasoning">
                        <strong>Your reasoning (required)</strong>
                        <p>Help us understand why you're making this choice</p>
                    </label>
                    <textarea
                        id="reasoning"
                        value={reasoning}
                        onChange={(e) => setReasoning(e.target.value)}
                        placeholder="Explain your decision..."
                        disabled={submitting}
                        rows={4}
                    />
                </div>
            </div>

            {/* Action buttons */}
            <div className="detail-footer">
                <button
                    className="btn btn-secondary"
                    onClick={handleArchive}
                    disabled={submitting}
                >
                    Review Later
                </button>
                <button
                    className="btn btn-primary"
                    onClick={handleResolve}
                    disabled={submitting || !selectedAction || !reasoning.trim()}
                >
                    {submitting ? "Saving..." : "Save Decision"}
                </button>
            </div>
        </div>
    );
};

function getActionsForType(type: ReviewType): Array<{
    value: string;
    label: string;
    description?: string;
}> {
    const actionMap: Record<ReviewType, Array<{ value: string; label: string; description?: string }>> = {
        AMBIGUOUS_TRANSACTION: [
            { value: "CATEGORIZE_SHOPPING", label: "Shopping" },
            { value: "CATEGORIZE_GROCERIES", label: "Groceries" },
            { value: "CATEGORIZE_ENTERTAINMENT", label: "Entertainment" },
            { value: "CATEGORIZE_OTHER", label: "Other / Need more info" },
        ],
        POSSIBLE_DUPLICATE: [
            {
                value: "USE_EXISTING",
                label: "Use Existing Transaction",
                description: "Keep the existing record, discard this new one",
            },
            {
                value: "KEEP_BOTH",
                label: "Keep Both",
                description: "Both records are correct (e.g., split transaction)",
            },
            {
                value: "DELETE_NEW",
                label: "Delete New",
                description: "Remove the newly imported transaction",
            },
            {
                value: "MERGE_TRANSACTIONS",
                label: "Merge",
                description: "Combine into a single transaction",
            },
        ],
        RECONCILIATION_CONFLICT: [
            { value: "ACCEPT_CSV", label: "Accept Imported Data" },
            { value: "ACCEPT_BANK", label: "Trust Existing Data" },
            { value: "SPLIT_DIFFERENCE", label: "Split the Difference" },
            { value: "MANUAL_ENTRY", label: "Enter Correct Value" },
        ],
        UNKNOWN_ACCOUNT: [
            { value: "CREATE_NEW_ACCOUNT", label: "Create New Account" },
            { value: "ASSIGN_TO_EXISTING", label: "Assign to Existing Account" },
            { value: "SKIP_TRANSACTION", label: "Skip This Transaction" },
            { value: "MARK_AS_TRANSFER", label: "Mark as Transfer" },
        ],
        UNKNOWN_STATEMENT_PERIOD: [
            { value: "SET_PERIOD_START", label: "Set Statement Start Date" },
            { value: "SET_PERIOD_END", label: "Set Statement End Date" },
            { value: "USE_DOCUMENT_DATE", label: "Use Document Date" },
            { value: "SKIP_STATEMENT", label: "Skip Statement" },
        ],
        PARSE_WARNING: [
            { value: "ACCEPT_PARSED", label: "Accept Parsed Data" },
            { value: "PROVIDE_CORRECTION", label: "Provide Correction" },
            { value: "SKIP_ROWS", label: "Skip Problem Rows" },
            { value: "REUPLOAD_DOCUMENT", label: "Re-upload Document" },
        ],
        BALANCE_MISMATCH: [
            { value: "ACCEPT_DISCREPANCY", label: "Accept Discrepancy" },
            { value: "INVESTIGATE", label: "Investigate Issue" },
            { value: "ADJUST_OPENING_BALANCE", label: "Adjust Opening Balance" },
            {
                value: "MARK_AS_EXPECTED_DRIFT",
                label: "Mark as Expected",
                description: "This discrepancy is acceptable",
            },
        ],
    };

    return actionMap[type] || [];
}

export default ReviewItemDetail;
