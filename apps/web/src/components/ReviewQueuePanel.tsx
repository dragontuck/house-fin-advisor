import React, { useEffect, useState } from "react";
import { ReviewItem, ReviewType, ReviewSeverity, ReviewStatus } from "@house-fin/contracts";
import "./ReviewQueuePanel.css";

interface ReviewQueuePanelProps {
    householdId: string;
    onItemSelected?: (item: ReviewItem) => void;
}

interface ReviewQueueStats {
    householdId: string;
    totalItems: number;
    byStatus: Record<ReviewStatus, number>;
    byType: Record<ReviewType, number>;
    bySeverity: Record<ReviewSeverity, number>;
    oldestPendingAge?: number;
}

export const ReviewQueuePanel: React.FC<ReviewQueuePanelProps> = ({ householdId, onItemSelected }) => {
    const [stats, setStats] = useState<ReviewQueueStats | null>(null);
    const [items, setItems] = useState<ReviewItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchQueueStats();
        fetchItems();
    }, [householdId]);

    const fetchQueueStats = async () => {
        try {
            const response = await fetch(`/api/review-queue`, {
                headers: {
                    "x-household-id": householdId,
                },
            });
            if (!response.ok) throw new Error("Failed to fetch queue stats");
            const data = await response.json();
            setStats(data);
        } catch (err) {
            console.error("Error fetching queue stats:", err);
            setError("Failed to load review queue");
        }
    };

    const fetchItems = async () => {
        try {
            const response = await fetch(`/api/review-queue/items?status=PENDING`, {
                headers: {
                    "x-household-id": householdId,
                },
            });
            if (!response.ok) throw new Error("Failed to fetch items");
            const data = await response.json();
            setItems(data.items || []);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching items:", err);
            setError("Failed to load review items");
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="review-queue-panel loading">Loading review queue...</div>;
    }

    if (error) {
        return <div className="review-queue-panel error">{error}</div>;
    }

    if (!stats || stats.totalItems === 0) {
        return (
            <div className="review-queue-panel empty">
                <div className="empty-message">✓ All caught up! No items need review.</div>
            </div>
        );
    }

    const pendingCount = stats.byStatus?.PENDING || 0;
    const errorCount = (stats.bySeverity?.ERROR || 0);
    const warningCount = (stats.bySeverity?.WARNING || 0);

    return (
        <div className="review-queue-panel">
            <div className="queue-header">
                <h2 className="queue-title">
                    <span className="attention-badge">{pendingCount}</span>
                    item{pendingCount !== 1 ? "s" : ""} need{pendingCount !== 1 ? "" : "s"} your attention
                </h2>
                <div className="queue-summary">
                    {errorCount > 0 && (
                        <span className="severity-badge error">{errorCount} Error{errorCount !== 1 ? "s" : ""}</span>
                    )}
                    {warningCount > 0 && (
                        <span className="severity-badge warning">{warningCount} Warning{warningCount !== 1 ? "s" : ""}</span>
                    )}
                </div>
            </div>

            <div className="items-list">
                {items.map((item) => (
                    <ReviewItemCard
                        key={item.id}
                        item={item}
                        onSelect={() => onItemSelected?.(item)}
                    />
                ))}
            </div>
        </div>
    );
};

interface ReviewItemCardProps {
    item: ReviewItem;
    onSelect: () => void;
}

const ReviewItemCard: React.FC<ReviewItemCardProps> = ({ item, onSelect }) => {
    const severityClass = item.severity.toLowerCase();
    const typeLabel = formatReviewType(item.type);

    return (
        <div className={`review-item-card ${severityClass}`} onClick={onSelect}>
            <div className="item-header">
                <div className="item-title-section">
                    <h3 className="item-title">{item.title}</h3>
                    <span className="item-type">{typeLabel}</span>
                </div>
                <span className={`severity-badge ${severityClass}`}>{item.severity}</span>
            </div>

            <p className="item-message">{item.userMessage}</p>

            {item.recommendedAction && (
                <div className="recommended-action">
                    <strong>Suggested:</strong> {item.recommendedAction}
                </div>
            )}

            <div className="item-footer">
                <span className="item-meta">
                    Created {formatDate(item.createdAt)}
                </span>
                <button className="action-button">Review</button>
            </div>
        </div>
    );
};

function formatReviewType(type: ReviewType): string {
    const typeNames: Record<ReviewType, string> = {
        AMBIGUOUS_TRANSACTION: "Ambiguous",
        POSSIBLE_DUPLICATE: "Possible Duplicate",
        RECONCILIATION_CONFLICT: "Conflict",
        UNKNOWN_ACCOUNT: "Unknown Account",
        UNKNOWN_STATEMENT_PERIOD: "Unknown Period",
        PARSE_WARNING: "Parse Warning",
        BALANCE_MISMATCH: "Balance Mismatch",
    };
    return typeNames[type] || type;
}

function formatDate(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date;
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
}

export default ReviewQueuePanel;
