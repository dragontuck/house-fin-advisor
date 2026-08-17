import { useState } from "react";
import { DebtSummary, DebtHealthStatus, formatCents } from "../api";

interface Props {
    debt: DebtSummary;
}

const DEBT_STATUS_TEXT: Record<DebtHealthStatus, string> = {
    HEALTHY: "Debt levels are manageable.",
    WATCH: "Debt warrants monitoring.",
    AT_RISK: "Debt levels are elevated.",
    CRITICAL: "Debt levels require immediate attention.",
};

function debtStatusClass(status: DebtHealthStatus): string {
    return status === "AT_RISK" ? "at-risk" : status.toLowerCase();
}

export default function DebtSection({ debt }: Props) {
    const [showWhy, setShowWhy] = useState(false);
    const [showDetails, setShowDetails] = useState(false);

    return (
        <div className="dashboard-section" data-testid="debt-section">
            <div className="section-header">
                <h2 className="section-heading">Debt</h2>
                <button
                    className="why-btn"
                    onClick={() => { setShowWhy(!showWhy); setShowDetails(false); }}
                    aria-expanded={showWhy}
                >
                    {showWhy ? "Close" : "Why?"}
                </button>
            </div>

            <div className="debt-metrics">
                <div className="debt-metric-row">
                    <span className="debt-metric-label">Total debt</span>
                    <span className="debt-metric-value" data-testid="total-debt-value">
                        {formatCents(debt.totalDebtCents)}
                    </span>
                </div>
                {debt.revolvingDebtCents > 0 && (
                    <div className="debt-metric-row">
                        <span className="debt-metric-label">Revolving credit</span>
                        <span className="debt-metric-value" data-testid="revolving-debt-value">
                            {formatCents(debt.revolvingDebtCents)}
                        </span>
                    </div>
                )}
                <div className={`debt-status-badge ${debtStatusClass(debt.status)}`} data-testid="debt-status">
                    {DEBT_STATUS_TEXT[debt.status]}
                </div>
            </div>

            {showWhy && (
                <div className="disclosure-panel">
                    <p>{debt.statusDescription}</p>
                    {debt.observations.length > 0 && (
                        <ul className="observations-list">
                            {debt.observations.map(o => (
                                <li key={o.code}>{o.message}</li>
                            ))}
                        </ul>
                    )}
                    {!showDetails ? (
                        <button className="details-link" onClick={() => setShowDetails(true)}>
                            Show details
                        </button>
                    ) : (
                        <dl className="details-list">
                            {debt.debtToIncomeRatio != null && (
                                <>
                                    <dt>Debt-to-income ratio</dt>
                                    <dd>{(debt.debtToIncomeRatio * 100).toFixed(1)}%</dd>
                                </>
                            )}
                            {debt.weightedAverageRateBps != null && (
                                <>
                                    <dt>Weighted average rate</dt>
                                    <dd>{(debt.weightedAverageRateBps / 100).toFixed(2)}%</dd>
                                </>
                            )}
                            {debt.mortgageDebtCents > 0 && (
                                <>
                                    <dt>Mortgage</dt>
                                    <dd>{formatCents(debt.mortgageDebtCents)}</dd>
                                </>
                            )}
                            {debt.installmentDebtCents > 0 && (
                                <>
                                    <dt>Installment loans</dt>
                                    <dd>{formatCents(debt.installmentDebtCents)}</dd>
                                </>
                            )}
                            <dt>Calculation version</dt>
                            <dd>{debt.calculationVersion}</dd>
                            <dt>As of</dt>
                            <dd>{new Date(debt.asOf).toLocaleDateString()}</dd>
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
