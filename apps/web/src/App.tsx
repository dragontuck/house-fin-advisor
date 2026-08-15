import { useState, useEffect } from "react";
import { FinancialPulseData, fetchFinancialPulse } from "./api";
import HouseholdHeader from "./components/HouseholdHeader";
import HealthStatus from "./components/HealthStatus";
import MetricsGrid from "./components/MetricsGrid";
import AccountsSection from "./components/AccountsSection";
import StatementUpload from "./components/StatementUpload";
import "./App.css";

function App() {
    const [data, setData] = useState<FinancialPulseData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showUpload, setShowUpload] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const pulse = await fetchFinancialPulse();
            setData(pulse);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load financial data";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="loading">Loading your financial overview...</div>;
    }

    if (error) {
        return (
            <div className="error">
                <div className="error-box">
                    <div className="error-title">Unable to Load</div>
                    <div className="error-message">{error}</div>
                </div>
                <button className="retry-button" onClick={loadData}>
                    Try Again
                </button>
            </div>
        );
    }

    if (!data) {
        return <div className="loading">No data available</div>;
    }

    return (
        <div className="app">
            <div className="app-container dashboard">
                <HouseholdHeader name={data.householdName} asOf={data.asOf} />
                <div className="section-controls">
                    <button
                        className="btn-add-statement"
                        onClick={() => setShowUpload(!showUpload)}
                    >
                        {showUpload ? "Hide Upload" : "Add Statement"}
                    </button>
                </div>
                {showUpload && <StatementUpload />}
                <HealthStatus status={data.healthStatus} message={data.healthMessage} />
                <MetricsGrid metrics={data.keyMetrics} />
                <AccountsSection summary={data.accountsSummary} />
            </div>
        </div>
    );
}

export default App;
