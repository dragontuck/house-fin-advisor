import { useState } from "react";
import { AttentionItem, AttentionSeverity } from "../api";

interface Props {
    items: AttentionItem[];
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

function ItemCard({ item }: { item: AttentionItem }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <li
            className={`attention-item severity-${item.severity.toLowerCase()}`}
            data-testid="attention-item"
        >
            <div className="attention-item-header">
                <span className="attention-title">{item.title}</span>
                <button
                    className="details-link"
                    onClick={() => setExpanded(!expanded)}
                    aria-expanded={expanded}
                >
                    {expanded ? "Less" : "Show details"}
                </button>
            </div>
            <p className="attention-explanation">{item.explanation}</p>
            {expanded && (
                <dl className="details-list attention-details">
                    <dt>{item.metric.label}</dt>
                    <dd>{item.metric.value} {item.metric.unit}</dd>
                    <dt>Source</dt>
                    <dd>{item.source}</dd>
                </dl>
            )}
        </li>
    );
}

export default function AttentionSection({ items }: Props) {
    const visible = items
        .filter(i => i.status === "ACTIVE" && i.severity !== "INFO")
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
        .slice(0, 3);

    if (visible.length === 0) return null;

    return (
        <div className="dashboard-section" data-testid="attention-section">
            <h2 className="section-heading">What needs attention</h2>
            <ul className="attention-list">
                {visible.map(item => (
                    <ItemCard key={item.id} item={item} />
                ))}
            </ul>
        </div>
    );
}
