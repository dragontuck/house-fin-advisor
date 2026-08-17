import { useState } from "react";
import { GoalResult, GoalStatus, formatCents } from "../api";

interface Props {
    goals: GoalResult[];
}

const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
    ON_TRACK: "On track",
    AHEAD: "Ahead",
    BEHIND: "Behind schedule",
    AT_RISK: "At risk",
    COMPLETED: "Completed",
};

const GOAL_STATUS_CLASS: Record<GoalStatus, string> = {
    ON_TRACK: "on-track",
    AHEAD: "ahead",
    BEHIND: "behind",
    AT_RISK: "at-risk",
    COMPLETED: "completed",
};

function progressClass(status: GoalStatus): string {
    if (status === "BEHIND" || status === "AT_RISK") return "warning";
    if (status === "COMPLETED") return "ok";
    return "ok";
}

function GoalCard({ goal }: { goal: GoalResult }) {
    const [showDetails, setShowDetails] = useState(false);
    const pct = Math.min(100, Math.round(goal.percentComplete));

    return (
        <div className="goal-card" data-testid="goal-card">
            <div className="goal-header">
                <span className="goal-name">{goal.name}</span>
                <span className={`goal-badge ${GOAL_STATUS_CLASS[goal.status]}`} data-testid="goal-status">
                    {GOAL_STATUS_LABEL[goal.status]}
                </span>
            </div>
            <div
                className="progress-bar"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div
                    className={`progress-fill ${progressClass(goal.status)}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <div className="goal-meta">
                <span>
                    {formatCents(goal.currentAmountCents)} of {formatCents(goal.targetAmountCents)} ({pct}%)
                </span>
                <button
                    className="details-link"
                    onClick={() => setShowDetails(!showDetails)}
                    aria-expanded={showDetails}
                >
                    {showDetails ? "Hide details" : "Show details"}
                </button>
            </div>
            {showDetails && (
                <dl className="details-list">
                    {goal.targetDate && (
                        <>
                            <dt>Target date</dt>
                            <dd>{new Date(goal.targetDate).toLocaleDateString()}</dd>
                        </>
                    )}
                    {goal.projectedCompletionDate && (
                        <>
                            <dt>Projected completion</dt>
                            <dd>{new Date(goal.projectedCompletionDate).toLocaleDateString()}</dd>
                        </>
                    )}
                    {goal.monthlyContributionCents > 0 && (
                        <>
                            <dt>Monthly contribution</dt>
                            <dd>{formatCents(goal.monthlyContributionCents)}</dd>
                        </>
                    )}
                    {goal.requiredMonthlyContributionCents > 0 && (
                        <>
                            <dt>Required monthly</dt>
                            <dd>{formatCents(goal.requiredMonthlyContributionCents)}</dd>
                        </>
                    )}
                    <dt>Calculation version</dt>
                    <dd>{goal.calculationVersion}</dd>
                    <dd>
                        <button className="details-link" onClick={() => setShowDetails(false)}>
                            Hide details
                        </button>
                    </dd>
                </dl>
            )}
        </div>
    );
}

export default function GoalsSection({ goals }: Props) {
    return (
        <div className="dashboard-section" data-testid="goals-section">
            <h2 className="section-heading">Goals</h2>
            <div className="goals-list">
                {goals.map(goal => (
                    <GoalCard key={goal.goalId} goal={goal} />
                ))}
            </div>
        </div>
    );
}
