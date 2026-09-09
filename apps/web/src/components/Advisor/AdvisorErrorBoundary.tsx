/**
 * Isolates AI Advisor rendering failures so the rest of the financial dashboard
 * keeps working even if the advisor UI itself breaks unexpectedly.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import "./Advisor.css";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
}

export default class AdvisorErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("[ADVISOR_UI_CRASH]", error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <section className="dashboard-section advisor-section">
                    <div className="section-header">
                        <h3 className="section-heading">AI Advisor</h3>
                    </div>
                    <p className="advisor-error">
                        The AI advisor is temporarily unavailable. The rest of your financial
                        dashboard is unaffected.
                    </p>
                </section>
            );
        }
        return this.props.children;
    }
}
