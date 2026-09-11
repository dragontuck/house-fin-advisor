/**
 * Renders an advisor answer using the layout appropriate to its workflow mode:
 * Information (answer + details), Diagnosis (found/why/evidence/causes),
 * Planning (proposed plan/changes/impact/assumptions + approval actions), or
 * Scenario (result/impact/alternatives/assumptions).
 */
import { useState } from "react";
import { formatCents } from "../../api";
import type { AdvisorToolResult, AdvisorUxMode, StructuredRecommendation } from "../../api";
import { createBudgetProposal, approveBudgetProposal } from "../../api";
import {
    splitHeadline,
    extractFacts,
    extractRecommendations,
    extractProposedPlan,
    parsePeriod,
    type Fact,
} from "./advisor-helpers";
import RecommendationExperience, { type RecommendationExperienceModel } from "./RecommendationExperience";
import "./Advisor.css";

interface Props {
    mode: AdvisorUxMode;
    assistantMessage: string;
    toolResults: AdvisorToolResult[];
    conversationId: string;
    recommendation?: StructuredRecommendation;
}

function FactGrid({ facts }: { facts: Fact[] }) {
    if (facts.length === 0) return null;
    return (
        <dl className="advisor-fact-grid">
            {facts.map((f) => (
                <div className="advisor-fact" key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                </div>
            ))}
        </dl>
    );
}

function EvidenceSection({ toolResults }: { toolResults: AdvisorToolResult[] }) {
    const facts = toolResults.flatMap((r) => extractFacts(r.data));
    if (facts.length === 0) return null;
    return <FactGrid facts={facts} />;
}

function toExperienceModel(recommendation: StructuredRecommendation): RecommendationExperienceModel {
    return {
        action: recommendation.recommendedAction,
        why: recommendation.why,
        financialImpact: {
            cash: formatCents(recommendation.impact.cashFlowImpact),
            debt: formatCents(recommendation.impact.debtReduction),
            financialIndependence: formatCents(recommendation.impact.wealthIncrease),
        },
        alternatives: recommendation.alternatives,
        assumptions: recommendation.assumptions,
        risks: recommendation.risks,
        evidence: recommendation.evidence,
        validation: recommendation.validation,
        confidence: recommendation.confidence,
        confidenceReasoning: recommendation.confidenceReasoning,
    };
}

function InformationResponse({ assistantMessage, toolResults }: Props) {
    const [showDetails, setShowDetails] = useState(false);
    return (
        <div className="advisor-card">
            <p className="advisor-answer">{assistantMessage}</p>
            <button className="advisor-link-button" onClick={() => setShowDetails((v) => !v)}>
                {showDetails ? "Hide details" : "Show details"}
            </button>
            {showDetails && (
                <div className="advisor-section-block">
                    <EvidenceSection toolResults={toolResults} />
                </div>
            )}
        </div>
    );
}

function DiagnosisResponse({ assistantMessage, toolResults }: Props) {
    const { headline, rest } = splitHeadline(assistantMessage);
    return (
        <div className="advisor-card">
            <div className="advisor-section-block">
                <h4 className="advisor-section-title">What I found</h4>
                <p>{headline}</p>
            </div>
            {rest && (
                <div className="advisor-section-block">
                    <h4 className="advisor-section-title">Why</h4>
                    <p>{rest}</p>
                </div>
            )}
            <div className="advisor-section-block">
                <h4 className="advisor-section-title">Evidence</h4>
                <EvidenceSection toolResults={toolResults} />
            </div>
            <div className="advisor-section-block">
                <h4 className="advisor-section-title">Possible causes</h4>
                <ul className="advisor-list">
                    {extractRecommendations(toolResults).map((r) => (
                        <li key={r}>{r}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function PlanningResponse({ assistantMessage, toolResults, conversationId, recommendation }: Props) {
    const plan = extractProposedPlan(toolResults);
    const [status, setStatus] = useState<"idle" | "reviewing" | "approving" | "approved" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const handleApprove = async () => {
        setStatus("approving");
        setErrorMessage(null);
        try {
            const { year, month } = parsePeriod(plan.month);
            const { proposal } = await createBudgetProposal(
                year,
                month,
                plan.changes.map((c) => ({
                    category: c.category,
                    proposedBudgetCents: c.proposedBudgetCents,
                    currentBudgetCents: c.currentBudgetCents,
                    reason: c.reason,
                })),
                { title: "Advisor budget proposal", conversationId }
            );
            await approveBudgetProposal(proposal.id);
            setStatus("approved");
        } catch (err) {
            setStatus("error");
            setErrorMessage(err instanceof Error ? err.message : "Could not update your budget. Please try again.");
        }
    };

    return (
        <div className="advisor-card">
            {recommendation
                ? <RecommendationExperience recommendation={toExperienceModel(recommendation)} />
                : <p className="advisor-answer">{assistantMessage}</p>}

            {plan.changes.length > 0 && (
                <div className="advisor-section-block">
                    <h4 className="advisor-section-title">Changes</h4>
                    <table className="advisor-table">
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>Current</th>
                                <th>Proposed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {plan.changes.map((c) => (
                                <tr key={c.category}>
                                    <td>{c.category}</td>
                                    <td>{formatCents(c.currentBudgetCents)}</td>
                                    <td>{formatCents(c.proposedBudgetCents)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {status === "approved" ? (
                <p className="advisor-success">Your budget has been updated.</p>
            ) : (
                <div className="advisor-actions">
                    <button className="advisor-button advisor-button-secondary" onClick={() => setStatus("reviewing")}>
                        Review
                    </button>
                    <button className="advisor-button advisor-button-secondary" disabled>
                        Change
                    </button>
                    <button
                        className="advisor-button advisor-button-primary"
                        onClick={handleApprove}
                        disabled={status === "approving" || plan.changes.length === 0}
                    >
                        {status === "approving" ? "Approving..." : "Approve"}
                    </button>
                </div>
            )}
            {status === "reviewing" && <p className="advisor-hint">Take a look at the changes and impact above, then approve when ready.</p>}
            {status === "error" && <p className="advisor-error">{errorMessage}</p>}
        </div>
    );
}

function ScenarioResponse({ assistantMessage, recommendation }: Props) {
    return (
        <div className="advisor-card">
            {recommendation
                ? <RecommendationExperience recommendation={toExperienceModel(recommendation)} />
                : <p className="advisor-answer">{assistantMessage}</p>}
        </div>
    );
}

export default function AdvisorResponseCard(props: Props) {
    switch (props.mode) {
        case "DIAGNOSIS":
            return <DiagnosisResponse {...props} />;
        case "PLANNING":
            return <PlanningResponse {...props} />;
        case "SCENARIO":
            return <ScenarioResponse {...props} />;
        default:
            return <InformationResponse {...props} />;
    }
}
