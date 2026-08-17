import { useState, useEffect } from "react";
import {
    FinancialPulseData,
    HealthSummary,
    BudgetResultSet,
    GoalResult,
    DebtSummary,
    SnapshotHistory,
    BudgetVarianceHistory,
    fetchFinancialPulse,
    fetchHealthSummary,
    fetchBudgetResults,
    fetchGoals,
    fetchDebtSummary,
    fetchSnapshotHistory,
    fetchBudgetVarianceHistory,
} from "./api";
import HouseholdHeader from "./components/HouseholdHeader";
import StatusBanner from "./components/StatusBanner";
import AttentionSection from "./components/AttentionSection";
import CashFlowSection from "./components/CashFlowSection";
import BudgetSection from "./components/BudgetSection";
import GoalsSection from "./components/GoalsSection";
import DebtSection from "./components/DebtSection";
import TrendsSection from "./components/TrendsSection";
import StatementUpload from "./components/StatementUpload";
import "./App.css";

function App() {
    const [pulse, setPulse] = useState<FinancialPulseData | null>(null);
    const [health, setHealth] = useState<HealthSummary | null>(null);
    const [budget, setBudget] = useState<BudgetResultSet | null>(null);
    const [goals, setGoals] = useState<GoalResult[] | null>(null);
    const [debt, setDebt] = useState<DebtSummary | null>(null);
    const [snapshotHistory, setSnapshotHistory] = useState<SnapshotHistory | null>(null);
    const [budgetVariance, setBudgetVariance] = useState<BudgetVarianceHistory | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showUpload, setShowUpload] = useState(false);

    useEffect(() => {
        loadAll();
    }, []);

    const loadAll = async () => {
        try {
            setLoading(true);
            setError(null);
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth() + 1;

            const [pulseResult, healthResult, budgetResult, goalsResult, debtResult, historyResult, varianceResult] =
                await Promise.allSettled([
                    fetchFinancialPulse(),
                    fetchHealthSummary(),
                    fetchBudgetResults(year, month),
                    fetchGoals(),
                    fetchDebtSummary(),
                    fetchSnapshotHistory(12),
                    fetchBudgetVarianceHistory(12),
                ]);

            if (pulseResult.status === "rejected") {
                throw pulseResult.reason instanceof Error
                    ? pulseResult.reason
                    : new Error("Failed to load financial data");
            }
            setPulse(pulseResult.value);

            if (healthResult.status === "fulfilled") setHealth(healthResult.value);
            if (budgetResult.status === "fulfilled") setBudget(budgetResult.value);
            if (goalsResult.status === "fulfilled") setGoals(goalsResult.value);
            if (debtResult.status === "fulfilled") setDebt(debtResult.value);
            if (historyResult.status === "fulfilled") setSnapshotHistory(historyResult.value);
            if (varianceResult.status === "fulfilled") setBudgetVariance(varianceResult.value);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load financial data");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="loading">Loading your financial overview...</div>;
    }

    if (error || !pulse) {
        return (
            <div className="error">
                <div className="error-box">
                    <div className="error-title">Unable to Load</div>
                    <div className="error-message">{error ?? "No data available"}</div>
                </div>
                <button className="retry-button" onClick={loadAll}>
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="app">
            <div className="app-container dashboard">
                <HouseholdHeader name={pulse.householdName} asOf={pulse.asOf} />
                <div className="section-controls">
                    <button
                        className="btn-add-statement"
                        onClick={() => setShowUpload(!showUpload)}
                    >
                        {showUpload ? "Hide Upload" : "Add Statement"}
                    </button>
                </div>
                {showUpload && <StatementUpload />}

                {health && <StatusBanner health={health} />}
                {health && <AttentionSection items={health.attentionItems} />}
                <CashFlowSection
                    metrics={pulse.keyMetrics}
                    asOf={pulse.asOf}
                    details={pulse.calculationDetails}
                />
                {budget && <BudgetSection budget={budget} />}
                {goals && goals.length > 0 && <GoalsSection goals={goals} />}
                {debt && <DebtSection debt={debt} />}
                <TrendsSection snapshotHistory={snapshotHistory} budgetVariance={budgetVariance} />
            </div>
        </div>
    );
}

export default App;
