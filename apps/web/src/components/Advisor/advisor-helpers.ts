/**
 * Shared helpers for rendering AI Advisor responses.
 * Keep all number formatting/derivation here so the components stay presentational.
 */
import { formatCents } from "../../api";
import type { AdvisorToolResult } from "../../api";

/** Client-side mirror of the server's friendly activity phrases, used while waiting for a response. */
export const FRIENDLY_ACTIVITY_BY_TOOL: Record<string, string> = {
    get_financial_snapshot: "Reviewing your overall financial picture...",
    get_cash_flow: "Checking your current cash flow...",
    get_current_budget: "Looking at your current budget...",
    get_budget_status: "Comparing your budget to actual spending...",
    get_historical_budget_performance: "Reviewing past months for patterns...",
    get_goal_status: "Checking progress on your savings goals...",
    get_debt_summary: "Reviewing your debt obligations...",
    get_attention_items: "Looking for anything that needs your attention...",
    get_recurring_financial_items: "Identifying recurring bills and income...",
    simulate_purchase: "Running the numbers on this purchase...",
    simulate_budget_change: "Testing out that budget change...",
    analyze_budget_variance: "Digging into why spending differs from plan...",
    create_initial_budget: "Building your first budget...",
    plan_next_month_budget: "Building a proposed budget for next month...",
};

export function friendlyActivityForTool(toolName: string): string {
    return FRIENDLY_ACTIVITY_BY_TOOL[toolName] ?? "Gathering the information I need...";
}

/** Splits an assistant message into a short headline and the remaining detail. */
export function splitHeadline(message: string): { headline: string; rest: string } {
    const match = message.match(/^(.+?[.!?])(\s+([\s\S]*))?$/);
    if (!match) return { headline: message, rest: "" };
    return { headline: match[1], rest: match[3]?.trim() ?? "" };
}

function titleCase(key: string): string {
    return key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
}

/** Renders a single primitive value, formatting *Cents fields as currency. */
export function formatFactValue(key: string, value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "number" && /Cents$/.test(key)) return formatCents(value);
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.length === 0 ? "None" : `${value.length} item(s)`;
    return String(value);
}

export interface Fact {
    label: string;
    value: string;
}

/**
 * Flattens a tool's structured data into label/value facts for display, skipping
 * nested arrays/objects (those get their own dedicated renderer) and internal fields.
 */
export function extractFacts(data: Record<string, unknown> | undefined, exclude: string[] = []): Fact[] {
    if (!data) return [];
    const skip = new Set(["error", "householdId", "recommendations", ...exclude]);
    return Object.entries(data)
        .filter(([key, value]) => !skip.has(key) && typeof value !== "object")
        .map(([key, value]) => ({ label: titleCase(key), value: formatFactValue(key, value) }));
}

export function extractRecommendations(toolResults: AdvisorToolResult[]): string[] {
    const all: string[] = [];
    for (const result of toolResults) {
        const recs = result.data?.recommendations;
        if (Array.isArray(recs)) all.push(...recs.filter((r): r is string => typeof r === "string"));
    }
    return Array.from(new Set(all));
}

export interface NormalizedBudgetChange {
    category: string;
    currentBudgetCents: number;
    proposedBudgetCents: number;
    reason: string;
}

export interface ProposedBudgetPlan {
    changes: NormalizedBudgetChange[];
    month?: string;
    totalCents?: number;
    projectedSurplusCents?: number;
}

/** Finds the first tool result that proposed a set of budget categories (create/revise budget). */
export function extractProposedPlan(toolResults: AdvisorToolResult[]): ProposedBudgetPlan {
    for (const result of toolResults) {
        const data = result.data;
        const list = data?.proposedBudgets as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(list) || list.length === 0) continue;

        const changes: NormalizedBudgetChange[] = list.map((item) => ({
            category: String(item.category ?? "Uncategorized"),
            currentBudgetCents: Number(item.currentBudgetCents ?? 0),
            proposedBudgetCents: Number(item.proposedBudgetCents ?? item.recommendedBudgetCents ?? 0),
            reason: String(item.rationale ?? ""),
        }));

        return {
            changes,
            month: (data?.month as string) ?? (data?.nextMonth as string) ?? undefined,
            totalCents: Number(data?.totalBudgetedCents ?? data?.totalProposedBudgetCents ?? 0),
            projectedSurplusCents: data?.projectedSurplusCents !== undefined ? Number(data.projectedSurplusCents) : undefined,
        };
    }
    return { changes: [] };
}

/** Parses a "YYYY-M" month string into { year, month }. Falls back to next calendar month. */
export function parsePeriod(monthStr?: string): { year: number; month: number } {
    if (monthStr) {
        const [y, m] = monthStr.split("-").map((n) => parseInt(n, 10));
        if (Number.isInteger(y) && Number.isInteger(m)) return { year: y, month: m };
    }
    const now = new Date();
    const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const month = ((now.getMonth() + 1) % 12) + 1;
    return { year, month };
}
