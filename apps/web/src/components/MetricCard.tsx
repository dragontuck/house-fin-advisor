import { useState } from "react";

interface MetricCardProps {
    label: string;
    value: number;
    explanation: string;
    tooltip: string;
    isPositive?: boolean;
    isNegative?: boolean;
}

export default function MetricCard({
    label,
    value,
    explanation,
    tooltip,
    isPositive,
    isNegative,
}: MetricCardProps) {
    const [showTooltip, setShowTooltip] = useState(false);

    const formatCurrency = (num: number) => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(num);
    };

    let valueClassName = "";
    if (isPositive) valueClassName = "positive";
    if (isNegative) valueClassName = "negative";

    return (
        <div className="metric-card">
            <button
                className={`metric-why ${showTooltip ? "active" : ""}`}
                onClick={() => setShowTooltip(!showTooltip)}
                title="Click to learn more"
            >
                ?
                {showTooltip && <div className="metric-tooltip">{tooltip}</div>}
            </button>
            <div className="metric-label">{label}</div>
            <div className={`metric-value ${valueClassName}`}>{formatCurrency(value)}</div>
            <div className="metric-explanation">{explanation}</div>
        </div>
    );
}
