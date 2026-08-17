import { useState } from "react";
import { BudgetResultSet, formatCents } from "../api";

interface Props {
    budget: BudgetResultSet;
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

function fillClass(pct: number): string {
    if (pct > 100) return "over";
    if (pct > 85) return "warning";
    return "ok";
}

export default function BudgetSection({ budget }: Props) {
    const [showWhy, setShowWhy] = useState(false);
    const [showDetails, setShowDetails] = useState(false);

    const totalPlanned = budget.totalPlannedCents;
    const totalActual = budget.totalActualCents;
    const spendPct = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

    const overBudgetItems = budget.results
        .filter(r => r.status === "OVER_BUDGET" && r.varianceCents > 0)
        .sort((a, b) => (b.variancePercent ?? 0) - (a.variancePercent ?? 0))
        .slice(0, 3);

    const projectedTotal = budget.results.reduce((sum, r) => sum + r.projectedMonthEndCents, 0);

    const periodLabel = `${MONTH_NAMES[budget.period.month - 1]} ${budget.period.year}`;

    return (
        <div className="dashboard-section" data-testid="budget-section">
            <div className="section-header">
                <h2 className="section-heading">Budget — {periodLabel}</h2>
                <button
                    className="why-btn"
                    onClick={() => { setShowWhy(!showWhy); setShowDetails(false); }}
                    aria-expanded={showWhy}
                >
                    {showWhy ? "Close" : "Why?"}
                </button>
            </div>

            <div className="budget-overview">
                <div className="budget-totals-row">
                    <span className="budget-spent">{formatCents(totalActual)}</span>
                    <span className="budget-of"> spent of </span>
                    <span className="budget-planned">{formatCents(totalPlanned)}</span>
                </div>
                <div className="progress-bar" role="progressbar" aria-valuenow={Math.round(spendPct)} aria-valuemin={0} aria-valuemax={100}>
                    <div
                        className={`progress-fill ${fillClass(spendPct)}`}
                        style={{ width: `${Math.min(100, spendPct)}%` }}
                    />
                </div>
            </div>

            {overBudgetItems.length > 0 && (
                <div className="budget-alerts">
                    <p className="budget-alerts-label">Over budget</p>
                    {overBudgetItems.map(r => (
                        <div key={r.category} className="budget-alert-row">
                            <span className="budget-category">{r.category}</span>
                            <span className="budget-over-amount">
                                +{formatCents(r.varianceCents)}
                                {r.variancePercent != null && ` (${Math.round(r.variancePercent)}% over)`}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <div className="budget-projection">
                <span className="budget-proj-label">Projected month-end: </span>
                <span className="budget-proj-value">{formatCents(projectedTotal)}</span>
            </div>

            {showWhy && (
                <div className="disclosure-panel">
                    <p>Actual spending compared to your planned budgets for {periodLabel}.</p>
                    {!showDetails ? (
                        <button className="details-link" onClick={() => setShowDetails(true)}>
                            Show details
                        </button>
                    ) : (
                        <dl className="details-list">
                            <dt>Total planned</dt>
                            <dd>{formatCents(totalPlanned)}</dd>
                            <dt>Total actual</dt>
                            <dd>{formatCents(totalActual)}</dd>
                            <dt>Unbudgeted spending</dt>
                            <dd>{formatCents(budget.unbudgetedSpendingCents)}</dd>
                            <dt>Categories tracked</dt>
                            <dd>{budget.results.filter(r => r.hasBudget).length}</dd>
                            <dt>Calculation version</dt>
                            <dd>{budget.calculationVersion}</dd>
                            <dt>As of</dt>
                            <dd>{new Date(budget.asOf).toLocaleDateString()}</dd>
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
