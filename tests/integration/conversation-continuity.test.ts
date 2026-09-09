/**
 * Conversation Continuity Tests
 *
 * Verifies that follow-up questions ("What if it costs $6,000?") are resolved against
 * prior conversation turns, that unrelated questions are never contaminated by a stale
 * scenario, and that reused financial figures which have since changed are disclosed
 * to the user rather than silently swapped in - current structured financial data
 * always wins over conversation history (AGENTS.md).
 */

import { describe, it, expect } from "@jest/globals";
import { EntityId, AdvisorWorkflow } from "@house-fin/contracts";
import {
    AIOrchestrator,
    AIToolPlanner,
    AIToolExecutor,
    OrchestratorRequest,
    ConversationTurn,
    resolveConversationalReference,
    findLastScenarioReference,
    detectStaleFinancialConflict,
    extractNumericFacts,
    STALE_FINANCIAL_DATA_EXPLANATION,
    LLMProvider,
    LLMRequest,
    LLMResponse,
} from "@house-fin/ai";
import { PrivacyGateway, SanitizedFinancialContext } from "@house-fin/security";

function userTurn(content: string): ConversationTurn {
    return { role: "user", content };
}

function assistantTurn(content: string): ConversationTurn {
    return { role: "assistant", content };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pronoun references
// ─────────────────────────────────────────────────────────────────────────────

describe("Conversation Continuity - pronoun references", () => {
    it("resolves 'it' to the prior scenario's subject", () => {
        const history: ConversationTurn[] = [
            userTurn("Can we afford a $4,000 kitchen project?"),
            assistantTurn("Yes, with conditions."),
        ];

        const resolved = resolveConversationalReference("What if it costs $6,000?", history);

        expect(resolved.isFollowUp).toBe(true);
        expect(resolved.isTopicSwitch).toBe(false);
        expect(resolved.referencedScenario?.subject).toBe("kitchen project");
        expect(resolved.resolvedMessage).toContain("kitchen project");
        expect(resolved.resolvedMessage).not.toMatch(/\bit\b/i);
    });

    it("resolves 'that' and 'this' the same way", () => {
        const history: ConversationTurn[] = [userTurn("Can we afford a $4,000 kitchen project?")];

        expect(resolveConversationalReference("Is that still affordable?", history).referencedScenario?.subject).toBe(
            "kitchen project"
        );
        expect(resolveConversationalReference("What about this?", history).isFollowUp).toBe(true);
    });

    it("does nothing when there is no prior scenario to resolve against", () => {
        const resolved = resolveConversationalReference("What if it costs $6,000?", []);
        expect(resolved.isFollowUp).toBe(false);
        expect(resolved.isTopicSwitch).toBe(false);
        expect(resolved.referencedScenario).toBeUndefined();
        expect(resolved.resolvedMessage).toBe("What if it costs $6,000?");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Follow-up questions
// ─────────────────────────────────────────────────────────────────────────────

describe("Conversation Continuity - follow-up questions", () => {
    it("finds the most recent user scenario for follow-up resolution", () => {
        const history: ConversationTurn[] = [
            userTurn("Can we afford a $4,000 kitchen project?"),
            assistantTurn("Yes, with conditions."),
            userTurn("What if it costs $6,000?"),
            assistantTurn("Still affordable, but tighter."),
        ];

        const reference = findLastScenarioReference(history);
        expect(reference?.subject).toBe("kitchen project");
    });

    it("treats restating the same subject explicitly as a follow-up", () => {
        const history: ConversationTurn[] = [userTurn("Can we afford a $4,000 kitchen project?")];

        const resolved = resolveConversationalReference(
            "What about the kitchen project at $8,000?",
            history
        );

        expect(resolved.isFollowUp).toBe(true);
        expect(resolved.isTopicSwitch).toBe(false);
        expect(resolved.referencedScenario?.subject).toBe("kitchen project");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Changing scenarios (bare amount changes, no explicit subject or pronoun)
// ─────────────────────────────────────────────────────────────────────────────

describe("Conversation Continuity - changing scenarios", () => {
    it("treats a bare new amount as continuing the prior scenario", () => {
        const history: ConversationTurn[] = [userTurn("Can we afford a $4,000 kitchen project?")];

        const resolved = resolveConversationalReference("What about $8,000 instead?", history);

        expect(resolved.isFollowUp).toBe(true);
        expect(resolved.isTopicSwitch).toBe(false);
        expect(resolved.referencedScenario?.subject).toBe("kitchen project");
        expect(resolved.resolvedMessage).toContain("kitchen project");
    });

    it("always uses the new amount from the current message, never the old one", () => {
        const history: ConversationTurn[] = [userTurn("Can we afford a $4,000 kitchen project?")];
        const resolved = resolveConversationalReference("What if it costs $6,000?", history);

        // The prior scenario's own amount is preserved for reference...
        expect(resolved.referencedScenario?.amountCents).toBe(400000);
        // ...but the resolved message still carries the NEW amount, not the old one.
        expect(resolved.resolvedMessage).toContain("$6,000");
        expect(resolved.resolvedMessage).not.toContain("$4,000");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Topic switches
// ─────────────────────────────────────────────────────────────────────────────

describe("Conversation Continuity - topic switches", () => {
    it("flags an unrelated question as a topic switch, not a follow-up", () => {
        const history: ConversationTurn[] = [
            userTurn("Can we afford a $4,000 kitchen project?"),
            assistantTurn("Yes, with conditions."),
        ];

        const resolved = resolveConversationalReference("How much did we spend on groceries last month?", history);

        expect(resolved.isFollowUp).toBe(false);
        expect(resolved.isTopicSwitch).toBe(true);
        expect(resolved.referencedScenario).toBeUndefined();
        expect(resolved.resolvedMessage).toBe("How much did we spend on groceries last month?");
    });

    it("flags a distinct new subject with its own amount as a topic switch", () => {
        const history: ConversationTurn[] = [userTurn("Can we afford a $4,000 kitchen project?")];

        const resolved = resolveConversationalReference("Can we afford a $3,000 vacation?", history);

        expect(resolved.isTopicSwitch).toBe(true);
        expect(resolved.isFollowUp).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stale conversations / conflicting old information (pure function level)
// ─────────────────────────────────────────────────────────────────────────────

describe("Conversation Continuity - stale conversations and conflicting old information", () => {
    it("detects no conflict when reused figures still match current data", () => {
        const prior = extractNumericFacts({ currentLiquidCashCents: 500000 });
        const current = extractNumericFacts({ currentLiquidCashCents: 500000 });

        expect(detectStaleFinancialConflict(prior, current).hasConflict).toBe(false);
    });

    it("detects a conflict when current data has changed since the prior turn", () => {
        const prior = extractNumericFacts({ currentLiquidCashCents: 500000 });
        const current = extractNumericFacts({ currentLiquidCashCents: 120000 });

        const check = detectStaleFinancialConflict(prior, current);
        expect(check.hasConflict).toBe(true);
        expect(check.explanation).toBe(STALE_FINANCIAL_DATA_EXPLANATION);
    });

    it("never flags a conflict when there is no prior data to compare against", () => {
        const current = extractNumericFacts({ currentLiquidCashCents: 120000 });
        expect(detectStaleFinancialConflict(undefined, current).hasConflict).toBe(false);
    });

    it("extracts nested *Cents fields for comparison", () => {
        const facts = extractNumericFacts({
            projectedImpact: { currentLiquidCashCents: 500000, projectedLiquidCashCents: 100000 },
            isAffordable: true,
        });

        expect(facts["projectedImpact.currentLiquidCashCents"]).toBe(500000);
        expect(facts["projectedImpact.projectedLiquidCashCents"]).toBe(100000);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end: orchestrator discloses stale data when reusing a scenario
// ─────────────────────────────────────────────────────────────────────────────

class StubLLMProvider implements LLMProvider {
    getName(): string {
        return "stub";
    }
    getConfig(): Record<string, unknown> {
        return {};
    }
    getMaxContextTokens(): number {
        return 100000;
    }
    validateRequest(): { valid: boolean; errors?: string[] } {
        return { valid: true };
    }
    async generateResponse(_request: LLMRequest): Promise<LLMResponse> {
        return {
            content: "Based on your current cash position, this purchase looks affordable.",
            toolCalls: [],
            usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
            stopReason: "END_TURN",
            generatedAt: new Date(),
        };
    }
}

class StubPrivacyGateway extends PrivacyGateway {
    constructor() {
        super(undefined as any);
    }
    override sanitizeContextForLLM(
        context: Record<string, unknown>,
        correlationId: EntityId
    ): SanitizedFinancialContext {
        return {
            sanitized_amounts: context.tools,
            categories: "safe",
            timestamp: new Date(),
            correlationId,
            sanitizationApplied: true,
        };
    }
    override isContextSafe(): boolean {
        return true;
    }
}

describe("Conversation Continuity - end-to-end stale data disclosure", () => {
    function buildOrchestrator(currentLiquidCashCents: number): AIOrchestrator {
        const planner = new AIToolPlanner();
        const executor = new AIToolExecutor();

        executor.registerTool("get_financial_snapshot", async () => ({ netWorthCents: 100000 }));
        executor.registerTool("get_cash_flow", async () => ({ monthlySurplusCents: 20000 }));
        executor.registerTool("get_debt_summary", async () => ({ totalDebtCents: 0 }));
        executor.registerTool("get_goal_status", async () => ({ goals: [] }));
        executor.registerTool("simulate_purchase", async () => ({
            projectedImpact: { currentLiquidCashCents, projectedLiquidCashCents: currentLiquidCashCents - 400000 },
            isAffordable: true,
            recommendations: ["This purchase fits within your current cash position."],
        }));

        return new AIOrchestrator(planner, executor, new StubLLMProvider(), new StubPrivacyGateway());
    }

    it("discloses that current financial data has changed since the earlier conversation", async () => {
        // Turn 1 established the scenario against a $5,000 cash position (prior tool execution facts).
        const priorScenarioFacts = extractNumericFacts({
            projectedImpact: { currentLiquidCashCents: 500000 },
        });
        const history: ConversationTurn[] = [
            userTurn("Can we afford a $4,000 kitchen project?"),
            assistantTurn("Yes, with conditions."),
        ];

        // Turn 2: cash position has since dropped to $1,200 - current data always wins.
        const orchestrator = buildOrchestrator(120000);

        const request: OrchestratorRequest = {
            correlationId: "req-stale" as EntityId,
            userMessage: "What if it costs $6,000?",
            workflowType: AdvisorWorkflow.AFFORDABILITY,
            householdId: "hh-1" as EntityId,
            memberId: "member-1" as EntityId,
            isHouseholdOwner: true,
            conversationHistory: history,
            priorScenarioFacts,
        };

        const response = await orchestrator.processRequest(request);

        expect(response.success).toBe(true);
        expect(response.metadata.continuity?.isFollowUp).toBe(true);
        expect(response.metadata.continuity?.referencedSubject).toBe("kitchen project");
        expect(response.metadata.continuity?.staleDataDetected).toBe(true);
        expect(response.assistantMessage).toContain(STALE_FINANCIAL_DATA_EXPLANATION);
    });

    it("does not disclose staleness when the reused figures still match", async () => {
        const priorScenarioFacts = extractNumericFacts({
            projectedImpact: { currentLiquidCashCents: 500000 },
        });
        const history: ConversationTurn[] = [userTurn("Can we afford a $4,000 kitchen project?")];

        const orchestrator = buildOrchestrator(500000);

        const request: OrchestratorRequest = {
            correlationId: "req-fresh" as EntityId,
            userMessage: "What if it costs $6,000?",
            workflowType: AdvisorWorkflow.AFFORDABILITY,
            householdId: "hh-1" as EntityId,
            memberId: "member-1" as EntityId,
            isHouseholdOwner: true,
            conversationHistory: history,
            priorScenarioFacts,
        };

        const response = await orchestrator.processRequest(request);

        expect(response.metadata.continuity?.staleDataDetected).toBe(false);
        expect(response.assistantMessage).not.toContain(STALE_FINANCIAL_DATA_EXPLANATION);
    });

    it("does not carry a stale scenario forward into an unrelated topic switch", async () => {
        const priorScenarioFacts = extractNumericFacts({
            projectedImpact: { currentLiquidCashCents: 500000 },
        });
        const history: ConversationTurn[] = [userTurn("Can we afford a $4,000 kitchen project?")];

        const orchestrator = buildOrchestrator(120000);

        const request: OrchestratorRequest = {
            correlationId: "req-switch" as EntityId,
            userMessage: "How much did we spend on groceries last month?",
            workflowType: AdvisorWorkflow.AFFORDABILITY,
            householdId: "hh-1" as EntityId,
            memberId: "member-1" as EntityId,
            isHouseholdOwner: true,
            conversationHistory: history,
            priorScenarioFacts,
        };

        const response = await orchestrator.processRequest(request);

        expect(response.metadata.continuity?.isTopicSwitch).toBe(true);
        expect(response.metadata.continuity?.staleDataDetected).toBe(false);
        expect(response.assistantMessage).not.toContain(STALE_FINANCIAL_DATA_EXPLANATION);
    });
});
