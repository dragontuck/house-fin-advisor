/**
 * Response Grounding — validates that an LLM-generated advisor response is fully
 * supported by the deterministic tool results before it ever reaches the user.
 *
 * Per AGENTS.md, financial calculations must never live in the LLM. This module
 * enforces that constraint at the boundary: the LLM may only narrate numbers,
 * dates, and statuses that the domain services already computed. Anything else
 * (invented numbers, invented accounts, invented research, overconfident
 * predictions, or a status that contradicts the tool output) is rejected and
 * replaced with a safe, deterministic fallback built from the tool results.
 */

import { ToolExecutionResult } from "./ai-tool-executor";

export type GroundingViolationType =
    | "UNSUPPORTED_NUMBER"
    | "FABRICATED_ACCOUNT"
    | "FABRICATED_RESEARCH"
    | "UNSUPPORTED_ASSUMPTION"
    | "TOOL_RESULT_CONTRADICTION"
    | "UNSUPPORTED_DATE";

export interface GroundingViolation {
    type: GroundingViolationType;
    detail: string;
}

export interface GroundingResult {
    valid: boolean;
    violations: GroundingViolation[];
}

export interface GroundingResearchEvidence {
    claim: string;
    retrievalDate: Date;
}

const FABRICATED_RESEARCH_PATTERNS: RegExp[] = [
    /I (?:researched|looked up|checked online|searched (?:the web|online))/i,
    /according to (?:recent |current )?(?:news|market reports|analysts|the internet)/i,
    /based on (?:current |today's )?(?:interest rates|mortgage rates|market data) (?:from|published|reported)/i,
    /I (?:found|read) (?:this )?(?:on|from) the (?:web|internet)/i,
];

const UNSUPPORTED_ASSUMPTION_PATTERNS: RegExp[] = [
    /will (?:definitely|certainly|surely) (?:increase|decrease|go up|go down|happen)/i,
    /guaranteed to/i,
    /I (?:confirmed|verified) that/i,
    /(?:it's|it is) certain that/i,
];

const ACCOUNT_IDENTIFIER_PATTERNS: RegExp[] = [
    /account\s*(?:number|#|ending in)\s*[:#]?\s*\d{3,}/i,
    /routing\s*(?:number|#)\s*[:#]?\s*\d{3,}/i,
    /card\s*(?:number|#)\s*[:#]?\s*\d{3,}/i,
];

/**
 * Mutually-exclusive status vocabularies used to detect tool-result contradictions.
 * A heuristic, not entity-linked to a specific tool - kept narrow to limit false positives.
 */
const STATUS_GROUPS: string[][] = [
    ["on track", "over budget", "under budget", "no budget"],
    ["ahead", "behind", "at risk", "completed"],
    ["healthy", "watch", "at risk", "critical"],
];

const MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
];

function toPhrase(enumValue: string): string {
    return enumValue.toLowerCase().replace(/_/g, " ");
}

function formatDollars(cents: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
    }).format(cents / 100);
}

/** Walks a tool result's data tree, invoking visit(value, key) for every leaf/branch. */
function walk(value: unknown, key: string | undefined, visit: (value: unknown, key?: string) => void): void {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
        value.forEach((v) => walk(v, undefined, visit));
        return;
    }
    if (typeof value === "object") {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            visit(v, k);
            walk(v, k, visit);
        }
        return;
    }
    visit(value, key);
}

function forEachSuccessfulResult(toolResults: ToolExecutionResult[], visit: (value: unknown, key?: string) => void): void {
    for (const result of toolResults) {
        if (!result.success || !result.data) continue;
        for (const [key, value] of Object.entries(result.data)) {
            visit(value, key);
            walk(value, key, visit);
        }
    }
}

/**
 * Money-typed fields that don't follow the `*Cents` naming convention (e.g. FinancialSnapshot's
 * cash/debt/netWorth). Grounding must still validate dollar figures derived from these - without
 * this list, any number the LLM states about cash position, debt, or net worth would be
 * completely unchecked.
 */
const BARE_MONEY_FIELD_NAMES = new Set([
    "cash",
    "debt",
    "netWorth",
    "monthlyIncome",
    "monthlyEssentialExpenses",
    "monthlyDiscretionaryExpenses",
    "monthlySurplus",
]);

/** Collects every `*Cents` figure (plus known bare-Money fields) from successful tool results, as dollar amounts. */
function collectGroundTruthDollarAmounts(toolResults: ToolExecutionResult[]): Set<number> {
    const amounts = new Set<number>();
    forEachSuccessfulResult(toolResults, (value, key) => {
        if (typeof value !== "number" || !key) return;
        if (!/Cents$/.test(key) && !BARE_MONEY_FIELD_NAMES.has(key)) return;
        const dollars = value / 100;
        const abs = Math.abs(dollars);
        // Register both signed and unsigned forms - narration ("-$400" vs "$400 over")
        // doesn't always carry the sign into the number a reader would quote.
        amounts.add(Math.round(dollars * 100) / 100);
        amounts.add(Math.round(dollars));
        amounts.add(Math.round(abs * 100) / 100);
        amounts.add(Math.round(abs));
    });
    return amounts;
}


/** Collects known status enum values (lowercased, "_" -> " ") present in tool results. */
function collectGroundTruthStatusPhrases(toolResults: ToolExecutionResult[]): Set<string> {
    const statusKeyPattern = /^(status|financialHealthStatus|debtHealthStatus|goalStatus|healthStatus)$/i;
    const phrases = new Set<string>();
    forEachSuccessfulResult(toolResults, (value, key) => {
        if (typeof value === "string" && key && statusKeyPattern.test(key)) {
            phrases.add(toPhrase(value));
        }
    });
    return phrases;
}

/** Phrases claiming something IS affordable vs. IS NOT - mutually exclusive by construction. */
const AFFORDABLE_PHRASES = ["can afford", "is affordable", "you can afford", "affordable"];
const UNAFFORDABLE_PHRASES = ["can't afford", "cannot afford", "not affordable", "unaffordable", "isn't affordable", "is not affordable"];

/** Finds the most recent `isAffordable` boolean among successful tool results (e.g. simulate_purchase). */
function collectGroundTruthAffordability(toolResults: ToolExecutionResult[]): boolean | undefined {
    let found: boolean | undefined;
    forEachSuccessfulResult(toolResults, (value, key) => {
        if (key === "isAffordable" && typeof value === "boolean") found = value;
    });
    return found;
}

/** Collects known "YYYY-M" year-month pairs from date-like fields in tool results. */
function collectGroundTruthYearMonths(toolResults: ToolExecutionResult[]): Set<string> {
    const dateKeyPattern = /^(asOf|calculatedAt|month|nextMonth|periodAnalyzed|createdAt)$/i;
    const yearMonths = new Set<string>();
    const addFromString = (raw: string) => {
        const isoMatch = raw.match(/(\d{4})-(\d{2})-\d{2}/);
        if (isoMatch) {
            yearMonths.add(`${isoMatch[1]}-${parseInt(isoMatch[2], 10)}`);
            return;
        }
        const shortMatches = raw.match(/\d{4}-\d{1,2}/g);
        shortMatches?.forEach((m) => {
            const [y, mo] = m.split("-");
            yearMonths.add(`${y}-${parseInt(mo, 10)}`);
        });
    };
    forEachSuccessfulResult(toolResults, (value, key) => {
        if (typeof value === "string" && key && dateKeyPattern.test(key)) addFromString(value);
    });
    return yearMonths;
}

/** Extracts "Month YYYY" style mentions from free text, normalized to "YYYY-M". */
function extractMonthYearMentions(text: string): string[] {
    const mentions: string[] = [];
    const regex = new RegExp(`(${MONTH_NAMES.join("|")})\\s+(\\d{4})`, "gi");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        const monthIndex = MONTH_NAMES.indexOf(match[1].toLowerCase()) + 1;
        mentions.push(`${match[2]}-${monthIndex}`);
    }
    return mentions;
}

/**
 * Validates that an LLM response is grounded in the deterministic tool results.
 * Read-only - never mutates or "fixes" the response, only reports what's unsupported.
 */
export function validateGroundedResponse(
    responseText: string,
    toolResults: ToolExecutionResult[],
    verifiedResearch: GroundingResearchEvidence[] = []
): GroundingResult {
    const violations: GroundingViolation[] = [];

    // Fabricated account/routing/card identifiers - the LLM never receives these values,
    // so any appearance means it invented them.
    for (const pattern of ACCOUNT_IDENTIFIER_PATTERNS) {
        const match = responseText.match(pattern);
        if (match) {
            violations.push({ type: "FABRICATED_ACCOUNT", detail: `Response references an account identifier: "${match[0]}"` });
        }
    }

    // Fabricated research - the advisor only has access to household data, never the internet.
    if (verifiedResearch.length === 0) {
        for (const pattern of FABRICATED_RESEARCH_PATTERNS) {
            const match = responseText.match(pattern);
            if (match) {
                violations.push({ type: "FABRICATED_RESEARCH", detail: `Response claims external research: "${match[0]}"` });
            }
        }
    }

    // Unsupported assumptions stated as facts.
    for (const pattern of UNSUPPORTED_ASSUMPTION_PATTERNS) {
        const match = responseText.match(pattern);
        if (match) {
            violations.push({ type: "UNSUPPORTED_ASSUMPTION", detail: `Response states an unverified assumption as fact: "${match[0]}"` });
        }
    }

    // Unsupported numbers - every dollar figure must trace back to a tool result.
    const groundTruthAmounts = collectGroundTruthDollarAmounts(toolResults);
    for (const evidence of verifiedResearch) {
        for (const match of evidence.claim.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)/g)) {
            const amount = parseFloat(match[1].replace(/,/g, ""));
            if (Number.isFinite(amount)) groundTruthAmounts.add(amount);
        }
    }
    if (groundTruthAmounts.size > 0) {
        for (const match of responseText.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)/g)) {
            const amount = parseFloat(match[1].replace(/,/g, ""));
            if (!Number.isFinite(amount)) continue;
            if (!groundTruthAmounts.has(amount) && !groundTruthAmounts.has(Math.round(amount))) {
                violations.push({
                    type: "UNSUPPORTED_NUMBER",
                    detail: `Response cites $${match[1]}, which does not match any tool-provided figure.`,
                });
            }
        }
    }

    // Tool-result contradictions - a status word that conflicts with the actual computed status.
    const actualStatusPhrases = collectGroundTruthStatusPhrases(toolResults);
    if (actualStatusPhrases.size > 0) {
        const lowerText = responseText.toLowerCase();
        for (const group of STATUS_GROUPS) {
            const actualInGroup = group.filter((phrase) => actualStatusPhrases.has(phrase));
            if (actualInGroup.length === 0) continue;
            for (const phrase of group) {
                if (actualInGroup.includes(phrase)) continue;
                if (lowerText.includes(phrase)) {
                    violations.push({
                        type: "TOOL_RESULT_CONTRADICTION",
                        detail: `Response says "${phrase}" but the data shows "${actualInGroup.join(", ")}".`,
                    });
                }
            }
        }
    }

    // Unsupported dates - a specific month/year mention not present anywhere in tool data.
    const groundTruthYearMonths = collectGroundTruthYearMonths(toolResults);
    for (const evidence of verifiedResearch) {
        const date = new Date(evidence.retrievalDate);
        if (!Number.isNaN(date.getTime())) {
            groundTruthYearMonths.add(`${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`);
        }
    }
    if (groundTruthYearMonths.size > 0) {
        for (const mention of extractMonthYearMentions(responseText)) {
            if (!groundTruthYearMonths.has(mention)) {
                violations.push({
                    type: "UNSUPPORTED_DATE",
                    detail: `Response references a date (${mention}) not found in the underlying data.`,
                });
            }
        }
    }

    // Affordability contradiction - e.g. simulate_purchase computed isAffordable:true but the
    // response's own conclusion says the opposite (or vice versa).
    const actualAffordability = collectGroundTruthAffordability(toolResults);
    if (actualAffordability !== undefined) {
        const lowerText = responseText.toLowerCase();
        const saysUnaffordable = UNAFFORDABLE_PHRASES.some((p) => lowerText.includes(p));
        const saysAffordable = !saysUnaffordable && AFFORDABLE_PHRASES.some((p) => lowerText.includes(p));
        if (actualAffordability && saysUnaffordable) {
            violations.push({
                type: "TOOL_RESULT_CONTRADICTION",
                detail: "Response suggests the purchase is not affordable, but the simulation found it affordable.",
            });
        } else if (!actualAffordability && saysAffordable) {
            violations.push({
                type: "TOOL_RESULT_CONTRADICTION",
                detail: "Response suggests the purchase is affordable, but the simulation found it is not.",
            });
        }
    }

    return { valid: violations.length === 0, violations };
}

/** Priority order of well-known cents fields used to build the safe fallback headline. */
const FALLBACK_FIELD_PRIORITY: Array<{ key: string; label: string }> = [
    { key: "projectedSurplusCents", label: "projected surplus" },
    { key: "monthlySurplusCents", label: "monthly surplus" },
    { key: "totalRemainingCents", label: "remaining budget this month" },
    { key: "projectedLiquidCashCents", label: "projected cash position" },
    { key: "currentLiquidCashCents", label: "current cash position" },
    { key: "totalDebtCents", label: "total debt" },
    { key: "netWorth", label: "net worth" },
    { key: "totalProposedBudgetCents", label: "proposed budget total" },
    { key: "totalBudgetedCents", label: "proposed budget total" },
    { key: "currentAmountCents", label: "goal balance" },
];

function findFallbackHeadline(toolResults: ToolExecutionResult[]): { label: string; cents: number } | null {
    for (const spec of FALLBACK_FIELD_PRIORITY) {
        for (const result of toolResults) {
            if (!result.success || !result.data) continue;
            const value = result.data[spec.key];
            if (typeof value === "number") return { label: spec.label, cents: value };
        }
    }
    return null;
}

/**
 * Builds a safe, deterministic fallback message from the tool results alone -
 * used whenever the LLM's response fails grounding validation.
 */
export function buildSafeFallback(toolResults: ToolExecutionResult[]): string {
    const headline = findFallbackHeadline(toolResults);
    if (!headline) {
        return "Based on your current financial data, I wasn't able to safely generate a full explanation. Please review the details below.";
    }
    return `Based on your current financial data, your ${headline.label} is ${formatDollars(headline.cents)}. I wasn't able to safely generate the full explanation.`;
}
