import { useState } from "react";
import { FinancialPulseData, PulseCalculationDetails, formatDollars, formatCents } from "../api";

interface Props {
    metrics: FinancialPulseData["keyMetrics"];
    asOf: string;
    details?: PulseCalculationDetails;
}

export default function CashFlowSection({ metrics, asOf, details }: Props) {
    const [showWhy, setShowWhy] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const surplusPositive = metrics.monthlySurplus >= 0;

    return (
        <div className="dashboard-section" data-testid="cash-flow-section">
            <div className="section-header">
                <h2 className="section-heading">Monthly cash flow</h2>
                <button
                    className="why-btn"
                    onClick={() => { setShowWhy(!showWhy); setShowDetails(false); }}
                    aria-expanded={showWhy}
                >
                    {showWhy ? "Close" : "Why?"}
                </button>
            </div>

            <div className="cash-flow-rows">
                <div className="cf-row">
                    <span className="cf-label">Income</span>
                    <span className="cf-value positive" data-testid="income-value">
                        {formatDollars(metrics.monthlyIncome)}
                    </span>
                </div>
                <div className="cf-row">
                    <span className="cf-label">Expenses</span>
                    <span className="cf-value negative" data-testid="expenses-value">
                        {formatDollars(metrics.monthlyExpenses)}
                    </span>
                </div>
                <div className="cf-row cf-surplus-row">
                    <span className="cf-label">Surplus</span>
                    <span
                        className={`cf-value ${surplusPositive ? "positive" : "negative"}`}
                        data-testid="surplus-value"
                    >
                        {formatDollars(metrics.monthlySurplus)}
                    </span>
                </div>
            </div>

            {showWhy && (
                <div className="disclosure-panel">
                    {details ? (
                        <p>{details.surplusExplanation}</p>
                    ) : (
                        <p>Income minus all monthly expenses (essential and discretionary).</p>
                    )}
                    {!showDetails ? (
                        <button className="details-link" onClick={() => setShowDetails(true)}>
                            Show details
                        </button>
                    ) : (
                        <dl className="details-list">
                            {details ? (
                                <>
                                    <dt>Monthly income</dt>
                                    <dd>{formatCents(details.monthlyIncomeCents)}</dd>
                                    <dt>Essential expenses</dt>
                                    <dd>{formatCents(details.monthlyEssentialExpensesCents)}</dd>
                                    <dt>Discretionary expenses</dt>
                                    <dd>{formatCents(details.monthlyDiscretionaryExpensesCents)}</dd>
                                    <dt>Surplus</dt>
                                    <dd>
                                        {formatCents(
                                            details.monthlyIncomeCents
                                            - details.monthlyEssentialExpensesCents
                                            - details.monthlyDiscretionaryExpensesCents
                                        )}
                                    </dd>
                                    <dt>Snapshot</dt>
                                    <dd>{details.snapshotId.slice(0, 8)}…</dd>
                                    <dt>Calculation version</dt>
                                    <dd>{details.calculationVersion}</dd>
                                    <dt>Calculated at</dt>
                                    <dd>{new Date(details.calculatedAt).toLocaleString()}</dd>
                                </>
                            ) : (
                                <>
                                    <dt>Monthly income</dt>
                                    <dd>{formatDollars(metrics.monthlyIncome)}</dd>
                                    <dt>Monthly expenses</dt>
                                    <dd>{formatDollars(metrics.monthlyExpenses)}</dd>
                                    <dt>Monthly surplus</dt>
                                    <dd>{formatDollars(metrics.monthlySurplus)}</dd>
                                    <dt>As of</dt>
                                    <dd>{new Date(asOf).toLocaleDateString()}</dd>
                                </>
                            )}
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
