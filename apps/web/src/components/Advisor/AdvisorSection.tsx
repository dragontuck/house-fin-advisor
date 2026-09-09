/**
 * Primary AI Advisor interaction: a conversational input with suggested prompts.
 * Never surfaces tool or workflow names - only friendly, human language.
 */
import { useState } from "react";
import {
    createAdvisorConversation,
    sendAdvisorMessage,
    orchestrateAdvisorResponse,
    type AdvisorUxMode,
    type AdvisorToolResult,
} from "../../api";
import AdvisorResponseCard from "./AdvisorResponseCard";
import { friendlyActivityForTool } from "./advisor-helpers";
import "./Advisor.css";

const SUGGESTED_PROMPTS: Array<{ group: string; prompts: string[] }> = [
    { group: "Understand", prompts: ["How are we doing financially?", "What changed this month?"] },
    {
        group: "Budget",
        prompts: [
            "Help me create an initial budget.",
            "Why am I always over budget?",
            "How much do I have left this month?",
        ],
    },
    { group: "Plan", prompts: ["Help me revise next month's budget."] },
    { group: "Scenario", prompts: ["Can we afford a $4,000 kitchen project?"] },
];

interface Exchange {
    id: string;
    question: string;
    status: "working" | "done" | "out_of_scope" | "error" | "failed";
    workingActivities: string[];
    assistantMessage?: string;
    mode?: AdvisorUxMode;
    toolResults?: AdvisorToolResult[];
    conversationId?: string;
    workflowType?: string;
    errorMessage?: string;
    retryable?: boolean;
}

export default function AdvisorSection() {
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [input, setInput] = useState("");
    const [exchanges, setExchanges] = useState<Exchange[]>([]);
    const [busy, setBusy] = useState(false);

    async function ensureConversation(): Promise<string> {
        if (conversationId) return conversationId;
        const conversation = await createAdvisorConversation("Financial Planning Discussion");
        setConversationId(conversation.id);
        return conversation.id;
    }

    async function runOrchestration(exchangeId: string, convoId: string, workflowType: string) {
        const response = await orchestrateAdvisorResponse(convoId, workflowType);

        setExchanges((prev) =>
            prev.map((e) =>
                e.id === exchangeId
                    ? {
                        ...e,
                        status: response.success ? "done" : "failed",
                        assistantMessage: response.assistantMessage,
                        mode: response.mode,
                        toolResults: response.toolResults,
                        conversationId: convoId,
                        workflowType,
                        retryable: response.retryable,
                    }
                    : e
            )
        );
    }

    async function ask(question: string) {
        const trimmed = question.trim();
        if (!trimmed || busy) return;

        setBusy(true);
        setInput("");
        const exchangeId = `${Date.now()}`;
        setExchanges((prev) => [
            { id: exchangeId, question: trimmed, status: "working", workingActivities: ["Reading your question..."] },
            ...prev,
        ]);

        try {
            const convoId = await ensureConversation();
            const classification = await sendAdvisorMessage(convoId, trimmed);

            if (classification.out_of_scope) {
                setExchanges((prev) =>
                    prev.map((e) =>
                        e.id === exchangeId
                            ? { ...e, status: "out_of_scope", assistantMessage: classification.assistantMessage }
                            : e
                    )
                );
                return;
            }

            const workingActivities = classification.availableTools.map((t) => friendlyActivityForTool(t.name));
            setExchanges((prev) =>
                prev.map((e) => (e.id === exchangeId ? { ...e, workingActivities } : e))
            );

            const workflowType =
                typeof classification.intent === "string" ? classification.intent : classification.intent.type;
            await runOrchestration(exchangeId, convoId, workflowType);
        } catch (err) {
            setExchanges((prev) =>
                prev.map((e) =>
                    e.id === exchangeId
                        ? {
                            ...e,
                            status: "error",
                            errorMessage:
                                "Something went wrong while getting your answer. Please try again in a moment.",
                        }
                        : e
                )
            );
        } finally {
            setBusy(false);
        }
    }

    async function retry(exchange: Exchange) {
        if (busy || !exchange.conversationId || !exchange.workflowType) return;
        setBusy(true);
        setExchanges((prev) =>
            prev.map((e) =>
                e.id === exchange.id
                    ? { ...e, status: "working", workingActivities: ["Trying again..."] }
                    : e
            )
        );
        try {
            await runOrchestration(exchange.id, exchange.conversationId, exchange.workflowType);
        } catch (err) {
            setExchanges((prev) =>
                prev.map((e) =>
                    e.id === exchange.id
                        ? {
                            ...e,
                            status: "error",
                            errorMessage:
                                "Something went wrong while getting your answer. Please try again in a moment.",
                        }
                        : e
                )
            );
        } finally {
            setBusy(false);
        }
    }


    return (
        <section className="dashboard-section advisor-section">
            <div className="section-header">
                <h3 className="section-heading">AI Advisor</h3>
            </div>

            <form
                className="advisor-input-row"
                onSubmit={(e) => {
                    e.preventDefault();
                    ask(input);
                }}
            >
                <input
                    className="advisor-input"
                    type="text"
                    placeholder="What would you like help with?"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={busy}
                />
                <button className="advisor-button advisor-button-primary" type="submit" disabled={busy || !input.trim()}>
                    Ask
                </button>
            </form>

            <div className="advisor-suggestions">
                {SUGGESTED_PROMPTS.map((group) => (
                    <div className="advisor-suggestion-group" key={group.group}>
                        <span className="advisor-suggestion-label">{group.group}</span>
                        <div className="advisor-suggestion-chips">
                            {group.prompts.map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    className="advisor-chip"
                                    onClick={() => ask(prompt)}
                                    disabled={busy}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="advisor-history">
                {exchanges.map((exchange) => (
                    <div className="advisor-exchange" key={exchange.id}>
                        <p className="advisor-question">{exchange.question}</p>

                        {exchange.status === "working" && (
                            <div className="advisor-working">
                                {exchange.workingActivities.map((activity) => (
                                    <p key={activity} className="advisor-working-line">
                                        {activity}
                                    </p>
                                ))}
                            </div>
                        )}

                        {exchange.status === "out_of_scope" && (
                            <div className="advisor-card">
                                <p className="advisor-answer">{exchange.assistantMessage}</p>
                            </div>
                        )}

                        {exchange.status === "error" && <p className="advisor-error">{exchange.errorMessage}</p>}

                        {exchange.status === "failed" && (
                            <div className="advisor-card">
                                <p className="advisor-answer">{exchange.assistantMessage}</p>
                                {exchange.retryable && (
                                    <div className="advisor-actions">
                                        <button
                                            className="advisor-button advisor-button-primary"
                                            onClick={() => retry(exchange)}
                                            disabled={busy}
                                        >
                                            Try Again
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {exchange.status === "done" && exchange.mode && exchange.toolResults && (
                            <AdvisorResponseCard
                                mode={exchange.mode}
                                assistantMessage={exchange.assistantMessage ?? ""}
                                toolResults={exchange.toolResults}
                                conversationId={exchange.conversationId ?? ""}
                            />
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
