import MetricCard from "./MetricCard";

interface KeyMetrics {
    netWorth: number;
    cashAvailable: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    monthlySurplus: number;
    totalDebt: number;
}

interface MetricsGridProps {
    metrics: KeyMetrics;
}

export default function MetricsGrid({ metrics }: MetricsGridProps) {
    const getExplanation = (value: number, type: string): string => {
        if (type === "surplus") {
            if (value > 0) return "Positive cash flow each month";
            if (value < 0) return "Spending more than income";
            return "Breaking even each month";
        }
        return "";
    };

    const getExplanationFull = (value: number, type: string): string => {
        switch (type) {
            case "netWorth":
                if (value > 0) return "Total value of your assets minus liabilities";
                if (value < 0) return "Your debts exceed your assets";
                return "Your assets equal your debts";
            case "cashAvailable":
                return "Liquid funds in checking and savings accounts";
            case "monthlyIncome":
                return "Your household's total monthly income";
            case "monthlyExpenses":
                return "Sum of essential and discretionary spending";
            case "monthlySurplus":
                if (value > 0) return "Money left over each month after expenses";
                if (value < 0) return "Monthly shortfall - you're overspending";
                return "No leftover money after expenses";
            case "totalDebt":
                return "Total amount owed on mortgages, loans, and credit cards";
            default:
                return "";
        }
    };

    return (
        <div className="metrics-grid">
            <MetricCard
                label="How much do we have?"
                value={metrics.netWorth}
                explanation={getExplanation(metrics.netWorth, "netWorth")}
                tooltip={getExplanationFull(metrics.netWorth, "netWorth")}
                isPositive={metrics.netWorth > 0}
                isNegative={metrics.netWorth < 0}
            />
            <MetricCard
                label="Available cash"
                value={metrics.cashAvailable}
                explanation="Ready to use right now"
                tooltip={getExplanationFull(metrics.cashAvailable, "cashAvailable")}
                isPositive={metrics.cashAvailable > 0}
            />
            <MetricCard
                label="Monthly income"
                value={metrics.monthlyIncome}
                explanation="Your household brings in"
                tooltip={getExplanationFull(metrics.monthlyIncome, "monthlyIncome")}
                isPositive={true}
            />
            <MetricCard
                label="Monthly expenses"
                value={metrics.monthlyExpenses}
                explanation="Everything you spend"
                tooltip={getExplanationFull(metrics.monthlyExpenses, "monthlyExpenses")}
                isNegative={true}
            />
            <MetricCard
                label="Are we generating positive cash flow?"
                value={metrics.monthlySurplus}
                explanation={getExplanation(metrics.monthlySurplus, "surplus")}
                tooltip={getExplanationFull(metrics.monthlySurplus, "surplus")}
                isPositive={metrics.monthlySurplus > 0}
                isNegative={metrics.monthlySurplus < 0}
            />
            <MetricCard
                label="Total debt"
                value={metrics.totalDebt}
                explanation="What we owe"
                tooltip={getExplanationFull(metrics.totalDebt, "totalDebt")}
                isNegative={true}
            />
        </div>
    );
}
