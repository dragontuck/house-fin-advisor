import { useState } from "react";
import { FinancialHealthStatus, HealthSummary } from "../api";

interface Props {
    health: HealthSummary;
}

const CONSUMER_MESSAGE: Record<FinancialHealthStatus, string> = {
    HEALTHY: "Your household finances look healthy.",
    WATCH: "Your finances are on track with a few things to monitor.",
    AT_RISK: "Some areas of your finances need attention.",
    CRITICAL: "Your finances need immediate attention.",
};

const STATUS_ICON: Record<FinancialHealthStatus, string> = {
    HEALTHY: "✓",
    WATCH: "→",
    AT_RISK: "⚠",
    CRITICAL: "!",
};

function statusClass(status: FinancialHealthStatus): string {
    return status === "AT_RISK" ? "at-risk" : status.toLowerCase();
}

export default function StatusBanner({ health }: Props) {
    const [showWhy, setShowWhy] = useState(false);
    const [showDetails, setShowDetails] = useState(false);

    return (
        <div
            className={`dashboard-section status-banner ${statusClass(health.status)}`}
            data-testid="status-banner"
        >
            <div className="status-banner-row">
                <div className={`status-icon-circle ${statusClass(health.status)}`} aria-hidden="true">
                    {STATUS_ICON[health.status]}
                </div>
                <p className="status-headline" data-testid="status-headline">
                    {CONSUMER_MESSAGE[health.status]}
                </p>
                <button
                    className="why-btn"
                    onClick={() => { setShowWhy(!showWhy); setShowDetails(false); }}
                    aria-expanded={showWhy}
                >
                    {showWhy ? "Close" : "Why?"}
                </button>
            </div>

            {showWhy && (
                <div className="disclosure-panel">
                    <p>{health.statusDescription}</p>
                    {!showDetails ? (
                        <button className="details-link" onClick={() => setShowDetails(true)}>
                            Show details
                        </button>
                    ) : (
                        <dl className="details-list">
                            <dt>As of</dt>
                            <dd>{new Date(health.asOf).toLocaleDateString()}</dd>
                            <dt>Calculation version</dt>
                            <dd>{health.calculationVersion}</dd>
                            <dt>Factors evaluated</dt>
                            <dd>{health.factors.length}</dd>
                            <dd>
                                <button className="details-link" onClick={() => setShowDetails(false)}>
                                    Hide details
                                </button>
                            </dd>
                        </dl>
                    )}
                </div>
            )}
        </div>
    );
}
