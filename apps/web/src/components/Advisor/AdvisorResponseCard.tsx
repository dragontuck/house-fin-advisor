/**
 * Renders an advisor answer using the layout appropriate to its workflow mode:
 * Information (answer + details), Diagnosis (found/why/evidence/causes),
 * Planning (proposed plan/changes/impact/assumptions + approval actions), or
 * Scenario (result/impact/alternatives/assumptions).
 */
import { useState } from "react";
import { formatCents } from "../../api";
import type { AdvisorToolResult, AdvisorUxMode } from "../../api";
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

function buildValidation(toolResults: AdvisorToolResult[]): RecommendationExperienceModel["validation"] {
    const failedResults = toolResults.filter((result) => !result.success);
    return {
        status: failedResults.length === 0 ? "PASS" : "PASS_WITH_WARNINGS",
        summary: failedResults.length === 0
            ? "The supporting financial tools completed successfully."
            : "Some supporting information could not be verified.",
        details: toolResults.map((result) => ({
            category: "FINANCIAL DATA",
            status: result.success ? "PASS" : "WARN",
            description: result.success ? result.friendlyActivity : (result.error ?? "Source unavailable"),
        })),
    };
}

function buildScenarioImpact(toolResults: AdvisorToolResult[]): RecommendationExperienceModel["financialImpact"] {
    const impact: RecommendationExperienceModel["financialImpact"] = {};
    const facts = toolResults.flatMap((result) => extractFacts(result.data));

    for (const fact of facts) {
        const label = fact.label.toLowerCase();
        if (!impact.cash && /(cash|surplus|liquidity)/.test(label)) impact.cash = fact.value;
        if (!impact.budget && /(budget|expense|spending)/.test(label)) impact.budget = fact.value;
        if (!impact.goals && /(goal|saving|investment)/.test(label)) impact.goals = fact.value;
        if (!impact.debt && /(debt|payment|interest)/.test(label)) impact.debt = fact.value;
        if (!impact.emergencyFund && /emergency/.test(label)) impact.emergencyFund = fact.value;
        if (!impact.financialIndependence && /(retirement|independence)/.test(label)) {
            impact.financialIndependence = fact.value;
        }
    }

    return impact;
}

function extractRecommendationEvidence(
    toolResults: AdvisorToolResult[]
): RecommendationExperienceModel["evidence"] {
    return toolResults.flatMap((result) => {
        const evidence = result.data?.evidence;
        if (!Array.isArray(evidence)) return [];

        return evidence.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const record = item as Record<string, unknown>;
            if (
                typeof record.claim !== "string" ||
                typeof record.sourceName !== "string" ||
                typeof record.retrievalDate !== "string"
            ) return [];

            const sourceUrl = typeof record.sourceUrl === "string" && /^https?:\/\//i.test(record.sourceUrl)
                ? record.sourceUrl
                : undefined;

            return [{
                claim: record.claim,
                sourceName: record.sourceName,
                sourceUrl,
                retrievalDate: record.retrievalDate,
            }];
        });
    });
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

function PlanningResponse({ assistantMessage, toolResults, conversationId }: Props) {
    const plan = extractProposedPlan(toolResults);
    const recommendations = extractRecommendations(toolResults);
    const { headline, rest } = splitHeadline(assistantMessage);
    const [status, setStatus] = useState<"idle" | "reviewing" | "approving" | "approved" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const recommendation: RecommendationExperienceModel = {
        action: headline,
        why: rest || "This plan uses your current budget and recent household data.",
        financialImpact: {
            ...(plan.projectedSurplusCents !== undefined
                ? { cash: `${formatCents(plan.projectedSurplusCents)} projected monthly surplus` }
                : {}),
            ...(plan.totalCents !== undefined
                ? { budget: `${formatCents(plan.totalCents)} total monthly budget` }
                : {}),
        },
        alternatives: recommendations.map((item, index) => ({
            title: `Alternative ${index + 1}`,
            rationale: item,
        })),
        assumptions: [{
            value: "Income and expenses remain close to the most recent household data.",
            sensitivity: "A material income or spending change could change the proposed amounts.",
        }],
        risks: [{
            description: "Actual spending may differ from the proposed budget.",
            severity: "MEDIUM",
            impact: "A lower surplus would reduce the amount available for goals or debt.",
        }],
        evidence: extractRecommendationEvidence(toolResults),
        validation: buildValidation(toolResults),
        confidence: toolResults.every((result) => result.success) ? "MEDIUM" : "LOW",
        confidenceReasoning: "Confidence reflects the availability of current household data and successful financial checks.",
    };

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
            <RecommendationExperience recommendation={recommendation} />

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

function ScenarioResponse({ assistantMessage, toolResults }: Props) {
    const { headline, rest } = splitHeadline(assistantMessage);
    const recommendations = extractRecommendations(toolResults);
    const recommendation: RecommendationExperienceModel = {
        action: headline,
        why: rest || "This option best fits the scenario and the household data available.",
        financialImpact: buildScenarioImpact(toolResults),
        alternatives: recommendations.map((item, index) => ({
            title: `Alternative ${index + 1}`,
            rationale: item,
        })),
        assumptions: [{
            value: "Current balances, income, expenses, and household settings remain unchanged.",
            sensitivity: "Changes to those inputs may change the result.",
        }],
        risks: [{
            description: "Unexpected expenses could reduce the cash available for this option.",
            severity: "MEDIUM",
            impact: "The timing or amount may need to be adjusted.",
        }],
        evidence: extractRecommendationEvidence(toolResults),
        validation: buildValidation(toolResults),
        confidence: toolResults.every((result) => result.success) ? "MEDIUM" : "LOW",
        confidenceReasoning: "Confidence reflects the completeness of the scenario inputs and financial checks.",
    };
    return (
        <div className="advisor-card">
            <RecommendationExperience recommendation={recommendation} />
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
