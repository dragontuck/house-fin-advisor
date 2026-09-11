/**
 * Response Grounding Tests
 *
 * Verifies that AI advisor responses are validated against deterministic tool
 * results before reaching the user, and that intentionally hallucinated content
 * is detected and replaced with a safe, data-only fallback.
 */

import { describe, it, expect } from "@jest/globals";
import { EntityId } from "@house-fin/contracts";
import { validateGroundedResponse, buildSafeFallback } from "@house-fin/ai";
import type { ToolExecutionResult } from "@house-fin/ai";

function toolResult(toolName: string, data: Record<string, unknown>): ToolExecutionResult {
    return {
        sequence: 0,
        toolName,
        success: true,
        data,
        durationMs: 5,
        retries: 0,
        executedAt: new Date("2027-03-01T00:00:00Z"),
    };
}

const BUDGET_STATUS_RESULT = toolResult("get_budget_status", {
    householdId: "household-1" as EntityId,
    status: "OVER_BUDGET",
    totalPlannedCents: 500000,
    totalActualCents: 540000,
    totalRemainingCents: -40000,
    month: "2027-3",
});

const CASH_FLOW_RESULT = toolResult("get_cash_flow", {
    householdId: "household-1" as EntityId,
    monthlySurplusCents: 390000,
    asOf: "2027-03-01T00:00:00Z",
});

const GOAL_RESULT = toolResult("get_goal_status", {
    householdId: "household-1" as EntityId,
    status: "BEHIND",
    currentAmountCents: 250000,
});

describe("validateGroundedResponse", () => {
    it("passes a response that only cites tool-provided numbers", () => {
        const response = "Based on your current financial data, your monthly surplus is $3,900.";
        const result = validateGroundedResponse(response, [CASH_FLOW_RESULT]);
        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
    });

    it("tolerates narration rounded to the nearest whole dollar", () => {
        const response = "Your remaining budget this month is about -$400.";
        const result = validateGroundedResponse(response, [BUDGET_STATUS_RESULT]);
        // -40000 cents = -$400, and $400 (unsigned) rounds to a whole dollar match
        expect(result.valid).toBe(true);
    });

    it("detects an unsupported (hallucinated) dollar figure", () => {
        const response = "Your monthly surplus is $3,900, and you'll also receive a $10,000 bonus this quarter.";
        const result = validateGroundedResponse(response, [CASH_FLOW_RESULT]);
        expect(result.valid).toBe(false);
        expect(result.violations).toContainEqual(
            expect.objectContaining({ type: "UNSUPPORTED_NUMBER" })
        );
    });

    it("detects a fabricated account reference", () => {
        const response = "I moved $200 from account ending in 4821 to cover the shortfall.";
        const result = validateGroundedResponse(response, [CASH_FLOW_RESULT]);
        expect(result.valid).toBe(false);
        expect(result.violations).toContainEqual(
            expect.objectContaining({ type: "FABRICATED_ACCOUNT" })
        );
    });

    it("detects fabricated research claims", () => {
        const response = "I researched current mortgage rates online and found a better option for you.";
        const result = validateGroundedResponse(response, [CASH_FLOW_RESULT]);
        expect(result.valid).toBe(false);
        expect(result.violations).toContainEqual(
            expect.objectContaining({ type: "FABRICATED_RESEARCH" })
        );
    });

    it("accepts a current dollar fact backed by verified research", () => {
        const response = "The verified issuer terms show a $95 annual fee.";
        const result = validateGroundedResponse(response, [CASH_FLOW_RESULT], [{
            claim: "The card's current annual fee is $95.",
            retrievalDate: new Date("2026-09-11T00:00:00.000Z"),
        }]);

        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
    });

    it("detects unsupported assumptions stated as facts", () => {
        const response = "Your income will definitely increase next year, so this purchase is safe.";
        const result = validateGroundedResponse(response, [CASH_FLOW_RESULT]);
        expect(result.valid).toBe(false);
        expect(result.violations).toContainEqual(
            expect.objectContaining({ type: "UNSUPPORTED_ASSUMPTION" })
        );
    });

    it("detects a contradiction between the response and the tool-reported status", () => {
        const response = "Good news - you're under budget this month, so feel free to spend more.";
        const result = validateGroundedResponse(response, [BUDGET_STATUS_RESULT]);
        expect(result.valid).toBe(false);
        expect(result.violations).toContainEqual(
            expect.objectContaining({ type: "TOOL_RESULT_CONTRADICTION" })
        );
    });

    it("does not flag a status phrase that matches the tool-reported status", () => {
        const response = "You're over budget this month by $400.";
        const result = validateGroundedResponse(response, [BUDGET_STATUS_RESULT]);
        expect(result.violations.some((v) => v.type === "TOOL_RESULT_CONTRADICTION")).toBe(false);
    });

    it("detects an unsupported date not present in the tool data", () => {
        const response = "This budget was calculated as of March 2027, but expect changes by December 2028.";
        const result = validateGroundedResponse(response, [BUDGET_STATUS_RESULT]);
        expect(result.valid).toBe(false);
        expect(result.violations).toContainEqual(
            expect.objectContaining({ type: "UNSUPPORTED_DATE" })
        );
    });

    it("does not flag a date that matches the tool data", () => {
        const response = "This reflects your finances as of March 2027.";
        const result = validateGroundedResponse(response, [BUDGET_STATUS_RESULT]);
        expect(result.violations.some((v) => v.type === "UNSUPPORTED_DATE")).toBe(false);
    });

    it("can detect multiple simultaneous violations", () => {
        const response =
            "I researched market trends online and confirmed your $50,000 windfall will definitely arrive, " +
            "moving it into account ending in 1234.";
        const result = validateGroundedResponse(response, [CASH_FLOW_RESULT]);
        expect(result.valid).toBe(false);
        const types = result.violations.map((v) => v.type);
        expect(types).toEqual(
            expect.arrayContaining(["FABRICATED_RESEARCH", "FABRICATED_ACCOUNT", "UNSUPPORTED_NUMBER"])
        );
    });

    it("passes clean responses with no tool data to compare against", () => {
        const result = validateGroundedResponse("I'm not sure - could you clarify your question?", []);
        expect(result.valid).toBe(true);
    });
});

describe("buildSafeFallback", () => {
    it("builds the documented example fallback from a projected surplus figure", () => {
        const result = toolResult("plan_next_month_budget", { projectedSurplusCents: 390000 });
        const fallback = buildSafeFallback([result]);
        expect(fallback).toBe(
            "Based on your current financial data, your projected surplus is $3,900. I wasn't able to safely generate the full explanation."
        );
    });

    it("falls back further to a generic safe message when no known figure is present", () => {
        const fallback = buildSafeFallback([toolResult("get_attention_items", { items: [] })]);
        expect(fallback).toBe(
            "Based on your current financial data, I wasn't able to safely generate a full explanation. Please review the details below."
        );
    });

    it("prefers higher-priority fields (projected surplus) over lower-priority ones (total debt)", () => {
        const fallback = buildSafeFallback([
            toolResult("get_debt_summary", { totalDebtCents: 1200000 }),
            toolResult("get_cash_flow", { projectedSurplusCents: 15000 }),
        ]);
        expect(fallback).toContain("projected surplus is $150");
    });

    it("ignores failed tool results", () => {
        const failed: ToolExecutionResult = {
            sequence: 0,
            toolName: "get_cash_flow",
            success: false,
            error: "boom",
            durationMs: 1,
            retries: 0,
            executedAt: new Date(),
        };
        const fallback = buildSafeFallback([failed, toolResult("get_debt_summary", { totalDebtCents: 500000 })]);
        expect(fallback).toContain("total debt is $5,000");
    });
});

describe("end-to-end grounding behavior with intentionally hallucinated LLM output", () => {
    it("rejects a hallucinated response and produces a safe, data-grounded replacement", () => {
        const toolResults = [
            toolResult("get_cash_flow", { projectedSurplusCents: 390000, asOf: "2027-03-01T00:00:00Z" }),
        ];

        // Simulates what an ungrounded LLM might say: invented bonus figure + fabricated research.
        const hallucinatedResponse =
            "Great news! I researched your account online and found you'll get a $12,000 bonus this month.";

        const grounding = validateGroundedResponse(hallucinatedResponse, toolResults);
        expect(grounding.valid).toBe(false);

        const safeResponse = grounding.valid ? hallucinatedResponse : buildSafeFallback(toolResults);
        expect(safeResponse).toBe(
            "Based on your current financial data, your projected surplus is $3,900. I wasn't able to safely generate the full explanation."
        );
        expect(safeResponse).not.toContain("12,000");
        expect(safeResponse).not.toContain("researched");
    });
});
