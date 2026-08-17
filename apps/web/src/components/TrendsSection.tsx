import { useState } from "react";
import {
    SnapshotHistory,
    SnapshotHistoryPoint,
    BudgetVarianceHistory,
    CalculationExplanation,
    formatCents,
} from "../api";

interface Props {
    snapshotHistory: SnapshotHistory | null;
    budgetVariance: BudgetVarianceHistory | null;
}

const PERIOD_OPTIONS = [3, 6, 12] as const;
type PeriodMonths = (typeof PERIOD_OPTIONS)[number];

type MetricKey = "income" | "expenses" | "surplus" | "debt" | "netWorth" | "budgetVariance";

const METRIC_LABELS: Record<MetricKey, string> = {
    income: "Income",
    expenses: "Expenses",
    surplus: "Surplus",
    debt: "Debt",
    netWorth: "Net Worth",
    budgetVariance: "Budget Variance",
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getMetricValue(point: SnapshotHistoryPoint, metric: MetricKey): number {
    switch (metric) {
        case "income": return point.incomeCents;
        case "expenses": return point.essentialExpensesCents + point.discretionaryExpensesCents;
        case "surplus": return point.surplusCents;
        case "debt": return point.debtCents;
        case "netWorth": return point.netWorthCents;
        default: return 0;
    }
}

function getMetricExplanation(point: SnapshotHistoryPoint, metric: MetricKey): CalculationExplanation | null {
    switch (metric) {
        case "income": return point.explanation.income;
        case "expenses": return point.explanation.expenses;
        case "surplus": return point.explanation.surplus;
        case "debt": return point.explanation.debt;
        default: return null;
    }
}

function ExplanationTooltip({ explanation }: { explanation: CalculationExplanation }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="trend-explain">
            <button className="trend-explain-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
                {open ? "▲" : "▼"}
            </button>
            {open && (
                <div className="trend-explain-panel">
                    <p>{explanation.summary}</p>
                    <dl className="details-list">
                        {explanation.inputs.map(i => (
                            <>
                                <dt key={`dt-${i.label}`}>{i.label}</dt>
                                <dd key={`dd-${i.label}`}>{formatCents(i.valueCents)}</dd>
                            </>
                        ))}
                        <dt>Version</dt>
                        <dd>{explanation.calculationVersion}</dd>
                        <dt>Source</dt>
                        <dd>{explanation.source}</dd>
                        <dt>Calculated</dt>
                        <dd>{new Date(explanation.calculatedAt).toLocaleDateString()}</dd>
                    </dl>
                    {explanation.assumptions.map((a, i) => (
                        <p key={i} className="trend-assumption">{a}</p>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function TrendsSection({ snapshotHistory, budgetVariance }: Props) {
    const [period, setPeriod] = useState<PeriodMonths>(6);
    const [metric, setMetric] = useState<MetricKey>("surplus");

    const snapshotMonths = snapshotHistory ? snapshotHistory.months.slice(-period) : [];
    const varianceMonths = budgetVariance ? budgetVariance.months.slice(-period) : [];

    const isBudgetVariance = metric === "budgetVariance";
    const activePoints = isBudgetVariance ? null : snapshotMonths;
    const budgetPoints = isBudgetVariance ? varianceMonths : null;

    const allValues = isBudgetVariance
        ? varianceMonths.map(m => Math.abs(m.varianceCents))
        : snapshotMonths.map(m => Math.abs(getMetricValue(m, metric)));
    const maxValue = Math.max(...allValues, 1);

    const metricKeys: MetricKey[] = ["income", "expenses", "surplus", "debt", "netWorth"];
    if (budgetVariance && budgetVariance.months.length > 0) metricKeys.push("budgetVariance");

    const isEmpty = isBudgetVariance ? varianceMonths.length === 0 : snapshotMonths.length === 0;

    return (
        <div className="dashboard-section" data-testid="trends-section">
            <div className="section-header">
                <h2 className="section-heading">Trends</h2>
                <div className="period-toggle" role="group" aria-label="Select time period">
                    {PERIOD_OPTIONS.map(p => (
                        <button
                            key={p}
                            className={`period-btn ${period === p ? "active" : ""}`}
                            onClick={() => setPeriod(p)}
                            aria-pressed={period === p}
                        >
                            {p}m
                        </button>
                    ))}
                </div>
            </div>

            <div className="metric-tabs" role="group" aria-label="Select metric">
                {metricKeys.map(k => (
                    <button
                        key={k}
                        className={`metric-tab ${metric === k ? "active" : ""}`}
                        onClick={() => setMetric(k)}
                        aria-pressed={metric === k}
                    >
                        {METRIC_LABELS[k]}
                    </button>
                ))}
            </div>

            {isEmpty ? (
                <p className="no-data-message">No historical data available for this period.</p>
            ) : (
                <>
                    <div className="trends-chart">
                        {isBudgetVariance
                            ? budgetPoints!.map(m => {
                                const val = m.varianceCents;
                                const pct = Math.round((Math.abs(val) / maxValue) * 100);
                                const positive = val <= 0;
                                return (
                                    <div key={`${m.period.year}-${m.period.month}`} className="trend-month" data-testid="trend-month">
                                        <div className="trend-bars">
                                            <div
                                                className={`trend-bar ${positive ? "income" : "expense"}`}
                                                style={{ height: `${pct}%` }}
                                                title={`${positive ? "Under" : "Over"} budget: ${formatCents(Math.abs(val))}`}
                                            />
                                        </div>
                                        <div className={`trend-surplus ${positive ? "positive" : "negative"}`}>
                                            {positive ? "-" : "+"}{formatCents(Math.abs(val))}
                                        </div>
                                        <div className="trend-label">{MONTH_SHORT[m.period.month - 1]}</div>
                                        <div className="trend-version">v{m.calculationVersion}</div>
                                    </div>
                                );
                            })
                            : activePoints!.map(m => {
                                const val = getMetricValue(m, metric);
                                const pct = Math.round((Math.abs(val) / maxValue) * 100);
                                const positive = val >= 0;
                                const expl = getMetricExplanation(m, metric);
                                return (
                                    <div key={`${m.period.year}-${m.period.month}`} className="trend-month" data-testid="trend-month">
                                        <div className="trend-bars">
                                            <div
                                                className={`trend-bar ${positive ? "income" : "expense"}`}
                                                style={{ height: `${pct}%` }}
                                                title={formatCents(val)}
                                            />
                                        </div>
                                        <div className={`trend-surplus ${positive ? "positive" : "negative"}`}>
                                            {formatCents(val)}
                                        </div>
                                        <div className="trend-label">{MONTH_SHORT[m.period.month - 1]}</div>
                                        <div className="trend-version">v{m.calculationVersion}</div>
                                        {expl && <ExplanationTooltip explanation={expl} />}
                                    </div>
                                );
                            })
                        }
                    </div>

                    {!isBudgetVariance && snapshotHistory && (
                        <p className="trend-source-note">
                            Based on persisted financial snapshots · calculation version preserved per period
                        </p>
                    )}
                </>
            )}
        </div>
    );
}

