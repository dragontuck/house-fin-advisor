import { useState } from "react";
import "./Advisor.css";

export type RecommendationConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_INFORMATION";

type ImpactKey = "cash" | "budget" | "goals" | "debt" | "emergencyFund" | "financialIndependence";

export interface RecommendationExperienceModel {
    action: string;
    why: string;
    financialImpact: Partial<Record<ImpactKey, string>>;
    alternatives: Array<{ title: string; rationale: string; tradeoffs?: string[] }>;
    assumptions: Array<{ value: string; sensitivity?: string }>;
    risks: Array<{ description: string; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; impact?: string }>;
    evidence: Array<{ claim: string; sourceName: string; sourceUrl?: string; retrievalDate: string }>;
    validation: {
        status: "PASS" | "PASS_WITH_WARNINGS" | "FAIL" | "INSUFFICIENT_INFORMATION";
        summary: string;
        details: Array<{ category: string; status: "PASS" | "WARN" | "FAIL"; description: string }>;
    };
    confidence: RecommendationConfidence;
    confidenceReasoning: string;
}

const IMPACT_LABELS: Record<ImpactKey, string> = {
    cash: "Cash",
    budget: "Budget",
    goals: "Goals",
    debt: "Debt",
    emergencyFund: "Emergency fund",
    financialIndependence: "Financial independence",
};

const ADVISOR_STYLES = [
    {
        key: "retirement",
        label: "Retirement Planning",
        framing: "From a retirement-planning perspective",
    },
    {
        key: "longevity",
        label: "Longevity Planning",
        framing: "From a long-term resilience perspective",
    },
    {
        key: "family",
        label: "Family Planning",
        framing: "From a household-planning perspective",
    },
    {
        key: "integrated-tax",
        label: "Integrated Tax Planning",
        framing: "From an integrated tax-planning perspective",
    },
    {
        key: "multigenerational",
        label: "Multigenerational Planning",
        framing: "From a multigenerational-planning perspective",
    },
] as const;

interface Props {
    recommendation: RecommendationExperienceModel;
}

function formatRetrievalDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    }).format(date);
}

function formatConfidence(value: RecommendationConfidence): string {
    return value.replace(/_/g, " ");
}

export default function RecommendationExperience({ recommendation }: Props) {
    const [personaKey, setPersonaKey] = useState<(typeof ADVISOR_STYLES)[number]["key"]>("retirement");
    const [showValidation, setShowValidation] = useState(false);
    const selectedStyle = ADVISOR_STYLES.find((style) => style.key === personaKey) ?? ADVISOR_STYLES[0];
    const impactEntries = Object.entries(recommendation.financialImpact) as Array<[ImpactKey, string]>;
    const independentlyChecked = recommendation.validation.status === "PASS" ||
        recommendation.validation.status === "PASS_WITH_WARNINGS";

    return (
        <article className="recommendation-experience" aria-labelledby="recommendation-heading">
            <header className="recommendation-header">
                <div>
                    <p className="recommendation-eyebrow">Recommendation</p>
                    <h4 id="recommendation-heading" className="recommendation-action">{recommendation.action}</h4>
                </div>
                <span className={`recommendation-confidence confidence-${recommendation.confidence.toLowerCase()}`}>
                    {formatConfidence(recommendation.confidence)}
                </span>
            </header>

            <section className="recommendation-section" aria-labelledby="recommendation-why">
                <h5 id="recommendation-why">Why</h5>
                <p>{selectedStyle.framing}, {recommendation.why}</p>
            </section>

            {impactEntries.length > 0 && (
                <section className="recommendation-section" aria-labelledby="recommendation-impact">
                    <h5 id="recommendation-impact">Financial Impact</h5>
                    <dl className="recommendation-impact-grid">
                        {impactEntries.map(([key, value]) => (
                            <div key={key}>
                                <dt>{IMPACT_LABELS[key]}</dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            )}

            <section className="recommendation-section" aria-labelledby="recommendation-alternatives">
                <h5 id="recommendation-alternatives">What I Considered</h5>
                {recommendation.alternatives.length > 0 ? (
                    <ul className="recommendation-detail-list">
                        {recommendation.alternatives.map((alternative) => (
                            <li key={alternative.title}>
                                <strong>{alternative.title}</strong>
                                <span>{alternative.rationale}</span>
                                {alternative.tradeoffs?.map((tradeoff) => <small key={tradeoff}>{tradeoff}</small>)}
                            </li>
                        ))}
                    </ul>
                ) : <p>No material alternatives were identified.</p>}
            </section>

            <div className="recommendation-two-column">
                <section className="recommendation-section" aria-labelledby="recommendation-assumptions">
                    <h5 id="recommendation-assumptions">Assumptions</h5>
                    <ul className="recommendation-detail-list compact">
                        {recommendation.assumptions.map((assumption) => (
                            <li key={assumption.value}>
                                <span>{assumption.value}</span>
                                {assumption.sensitivity && <small>{assumption.sensitivity}</small>}
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="recommendation-section" aria-labelledby="recommendation-risks">
                    <h5 id="recommendation-risks">Risks</h5>
                    <ul className="recommendation-detail-list compact">
                        {recommendation.risks.map((risk) => (
                            <li key={risk.description}>
                                <span><strong>{risk.severity}</strong> {risk.description}</span>
                                {risk.impact && <small>{risk.impact}</small>}
                            </li>
                        ))}
                    </ul>
                </section>
            </div>

            <section className="recommendation-section" aria-labelledby="recommendation-evidence">
                <h5 id="recommendation-evidence">Evidence</h5>
                {recommendation.evidence.length > 0 ? (
                    <ul className="recommendation-source-list">
                        {recommendation.evidence.map((item) => (
                            <li key={`${item.sourceName}-${item.claim}`}>
                                {item.sourceUrl ? (
                                    <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceName}</a>
                                ) : <strong>{item.sourceName}</strong>}
                                <span>{item.claim}</span>
                                <small>Retrieved {formatRetrievalDate(item.retrievalDate)}</small>
                            </li>
                        ))}
                    </ul>
                ) : <p>No external evidence was used for this recommendation.</p>}
            </section>

            <section className="recommendation-section recommendation-validation" aria-labelledby="recommendation-validation">
                <div>
                    <h5 id="recommendation-validation">Validation</h5>
                    <p className={independentlyChecked ? "validation-pass" : "validation-attention"}>
                        {independentlyChecked ? "Independently checked" : "Independent check needs attention"}
                    </p>
                </div>
                <button
                    type="button"
                    className="advisor-link-button"
                    aria-expanded={showValidation}
                    onClick={() => setShowValidation((visible) => !visible)}
                >
                    {showValidation ? "Hide validation details" : "Show validation details"}
                </button>
                {showValidation && (
                    <div className="recommendation-validation-details">
                        <p>{recommendation.validation.summary}</p>
                        <ul className="recommendation-detail-list compact">
                            {recommendation.validation.details.map((detail) => (
                                <li key={`${detail.category}-${detail.description}`}>
                                    <strong>{detail.status}</strong> {detail.category}: {detail.description}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>

            <section className="recommendation-section" aria-labelledby="recommendation-confidence-heading">
                <h5 id="recommendation-confidence-heading">Confidence</h5>
                <p><strong>{formatConfidence(recommendation.confidence)}</strong> {recommendation.confidenceReasoning}</p>
            </section>

            <footer className="recommendation-persona">
                <label htmlFor="advisor-style">Advisor Style: {selectedStyle.label}</label>
                <select
                    id="advisor-style"
                    value={personaKey}
                    onChange={(event) => setPersonaKey(event.target.value as (typeof ADVISOR_STYLES)[number]["key"])}
                >
                    {ADVISOR_STYLES.map((style) => (
                        <option key={style.key} value={style.key}>{style.label}</option>
                    ))}
                </select>
                <p>Changes explanation style only. Financial calculations, evidence, validation, and confidence stay the same.</p>
            </footer>
        </article>
    );
}
