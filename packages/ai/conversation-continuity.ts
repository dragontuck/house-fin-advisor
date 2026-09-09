/**
 * Conversation Continuity — resolves pronoun/elliptical follow-ups against prior
 * conversation turns, and detects when a reused scenario's financial data has
 * gone stale.
 *
 * Deterministic, regex-based (no ML). Conversation history is contextual only,
 * never authoritative — current structured financial data always wins (AGENTS.md).
 * These helpers only fill in a missing *subject* ("kitchen project"); the dollar
 * amount and every financial figure always come from the current message and a
 * fresh tool execution against live data.
 */

export interface ConversationTurn {
    role: "user" | "assistant" | "system" | "tool";
    content: string;
}

export interface ScenarioReference {
    /** Free-text subject of the prior scenario, e.g. "kitchen project" */
    subject: string;
    /** Dollar amount (cents) mentioned alongside that subject, if any */
    amountCents?: number;
    /** The user message the reference was extracted from */
    sourceMessage: string;
}

export interface ContinuityResolution {
    /** userMessage rewritten with pronouns/ellipsis resolved to the prior subject */
    resolvedMessage: string;
    /** true when this message continues a prior scenario (pronoun or bare amount change) */
    isFollowUp: boolean;
    /** true when this message appears to introduce a topic unrelated to the prior scenario */
    isTopicSwitch: boolean;
    /** the prior scenario used to resolve the reference, if any */
    referencedScenario?: ScenarioReference;
}

export interface StaleDataCheck {
    hasConflict: boolean;
    explanation?: string;
}

/** Fixed, user-facing disclosure shown whenever reused financial figures no longer match current data. */
export const STALE_FINANCIAL_DATA_EXPLANATION =
    "I'm using your current financial information, which has changed since our earlier conversation.";

const DOLLAR_PATTERN = /\$\s?[\d,]+(?:\.\d{1,2})?/g;
const PRONOUN_PATTERN = /\b(it|that|this|those|these|the same(?: thing)?)\b/i;
const SUBJECT_PATTERN =
    /\b(?:a|an|the)\s+([a-z][a-z]*(?:\s+[a-z][a-z]*){0,4}?)(?=\s*(?:for|that|which|costing|costs?|at|worth|would|will|instead|\?|\.|!|,|$))/i;
const GENERIC_SUBJECT_STOPWORDS = new Set(["same", "same thing"]);

/**
 * Extracts a dollar amount (e.g. "$4,000" or "4000 dollars") from free text and
 * converts it to cents. Returns 0 if no amount is found — never guessed.
 */
export function extractDollarAmountCents(text: string): number {
    const match = text.match(/\$\s?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s?(?:dollars|usd)/i);
    const raw = match?.[1] ?? match?.[2];
    if (!raw) return 0;
    const dollars = parseFloat(raw.replace(/,/g, ""));
    return Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
}

/** Infers the intended payment method from free text. Defaults to CASH when unspecified. */
export function extractPaymentMethod(text: string): "CASH" | "CREDIT_CARD" | "LOAN" | "SAVINGS" {
    const lower = text.toLowerCase();
    if (/credit card|credit\b/.test(lower)) return "CREDIT_CARD";
    if (/loan|finance(d)?|financing/.test(lower)) return "LOAN";
    if (/savings/.test(lower)) return "SAVINGS";
    return "CASH";
}

function stripDollarAmounts(text: string): string {
    return text.replace(DOLLAR_PATTERN, " ").replace(/\s+/g, " ").trim();
}

/** Extracts the free-text subject of a scenario, e.g. "a $4,000 kitchen project" → "kitchen project". */
export function extractScenarioSubject(message: string): string | undefined {
    const cleaned = stripDollarAmounts(message);
    const match = SUBJECT_PATTERN.exec(cleaned);
    if (!match) return undefined;
    const subject = match[1].trim().toLowerCase();
    if (subject.length < 3 || GENERIC_SUBJECT_STOPWORDS.has(subject)) return undefined;
    return subject;
}

export function containsPronounReference(message: string): boolean {
    return PRONOUN_PATTERN.test(message);
}

/** "What if it's $X instead" style follow-ups: a new amount with no subject of its own. */
function isBareAmountFollowUp(message: string, hasOwnSubject: boolean): boolean {
    if (hasOwnSubject) return false;
    if (extractDollarAmountCents(message) <= 0) return false;
    return /\b(what if|what about|instead|rather)\b/i.test(message) || message.trim().split(/\s+/).length <= 8;
}

/** Scans user turns backward for the most recent scenario with an identifiable subject. */
export function findLastScenarioReference(history: ConversationTurn[]): ScenarioReference | undefined {
    for (let i = history.length - 1; i >= 0; i--) {
        const turn = history[i];
        if (turn.role !== "user") continue;
        const subject = extractScenarioSubject(turn.content);
        if (subject) {
            const amountCents = extractDollarAmountCents(turn.content);
            return { subject, amountCents: amountCents > 0 ? amountCents : undefined, sourceMessage: turn.content };
        }
    }
    return undefined;
}

/**
 * Resolves pronoun/elliptical references in the current message against prior turns.
 * Only the missing *subject* is carried forward from history — amounts and all other
 * financial figures always come from the current message and live data.
 */
export function resolveConversationalReference(
    currentMessage: string,
    history: ConversationTurn[]
): ContinuityResolution {
    const priorScenario = findLastScenarioReference(history);
    if (!priorScenario) {
        return { resolvedMessage: currentMessage, isFollowUp: false, isTopicSwitch: false };
    }

    const hasPronoun = containsPronounReference(currentMessage);
    const ownSubject = extractScenarioSubject(currentMessage);

    const isPronounFollowUp = hasPronoun && (!ownSubject || ownSubject === priorScenario.subject);
    const isFollowUp = isPronounFollowUp || isBareAmountFollowUp(currentMessage, !!ownSubject);

    if (isFollowUp) {
        const resolvedMessage = hasPronoun
            ? currentMessage.replace(PRONOUN_PATTERN, priorScenario.subject)
            : `${currentMessage} (regarding the ${priorScenario.subject})`;
        return { resolvedMessage, isFollowUp: true, isTopicSwitch: false, referencedScenario: priorScenario };
    }

    // Explicitly restating the same subject (no pronoun needed) still continues the scenario.
    if (ownSubject && ownSubject === priorScenario.subject) {
        return {
            resolvedMessage: currentMessage,
            isFollowUp: true,
            isTopicSwitch: false,
            referencedScenario: priorScenario,
        };
    }

    // Anything else (a distinct new subject, or no subject/pronoun/amount at all) is unrelated
    // to the prior scenario — never carry stale context into an unrelated question.
    return { resolvedMessage: currentMessage, isFollowUp: false, isTopicSwitch: true };
}

/**
 * Extracts flat numeric "*Cents" financial facts from a tool result payload (one level
 * of nesting), for stale-data comparison across conversation turns.
 */
export function extractNumericFacts(data: Record<string, unknown> | undefined): Record<string, number> {
    const facts: Record<string, number> = {};
    if (!data) return facts;
    const visit = (obj: Record<string, unknown>, prefix: string) => {
        for (const [key, value] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (typeof value === "number" && key.endsWith("Cents")) {
                facts[path] = value;
            } else if (value && typeof value === "object" && !Array.isArray(value)) {
                visit(value as Record<string, unknown>, path);
            }
        }
    };
    visit(data, "");
    return facts;
}

/**
 * Compares numeric financial facts referenced earlier in the conversation against facts
 * computed just now from live, current data. Current data always wins — if they differ,
 * callers must surface {@link STALE_FINANCIAL_DATA_EXPLANATION} rather than letting the
 * number silently change without comment.
 */
export function detectStaleFinancialConflict(
    priorFacts: Record<string, number> | undefined,
    currentFacts: Record<string, number>
): StaleDataCheck {
    if (!priorFacts) return { hasConflict: false };
    for (const key of Object.keys(currentFacts)) {
        if (key in priorFacts && priorFacts[key] !== currentFacts[key]) {
            return { hasConflict: true, explanation: STALE_FINANCIAL_DATA_EXPLANATION };
        }
    }
    return { hasConflict: false };
}
