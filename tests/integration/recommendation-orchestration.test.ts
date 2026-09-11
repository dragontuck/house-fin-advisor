import {
    AdvisorWorkflow,
    ConfidenceLevel,
    EntityId,
    SourceAuthority,
    SourceTier,
} from "@house-fin/contracts";
import {
    AIOrchestrator,
    AIToolExecutor,
    AIToolPlanner,
    AdvisorFailureCategory,
    LLMProvider,
    LLMProviderConfig,
    LLMRequest,
    LLMResponse,
    RecommendationResearchProvider,
    ResearchQuery,
} from "@house-fin/ai";
import { PrivacyGateway, SanitizedFinancialContext } from "@house-fin/security";

class CapturingLLMProvider implements LLMProvider {
    calls: LLMRequest[] = [];

    getName() { return "capturing"; }
    getConfig(): LLMProviderConfig { return {}; }
    getMaxContextTokens() { return 100000; }
    validateRequest() { return { valid: true }; }
    async generateResponse(request: LLMRequest): Promise<LLMResponse> {
        this.calls.push(request);
        return {
            content: "The verified issuer terms show a $95 annual fee. Keep the card.",
            usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
            stopReason: "END_TURN",
            generatedAt: new Date(),
        };
    }
}

class CapturingPrivacyGateway extends PrivacyGateway {
    contexts: Record<string, unknown>[] = [];

    constructor() {
        super(undefined as never);
    }

    override sanitizeContextForLLM(
        context: Record<string, unknown>,
        correlationId: EntityId
    ): SanitizedFinancialContext {
        this.contexts.push(context);
        return {
            sanitized_amounts: context,
            categories: "recommendation",
            timestamp: new Date(),
            correlationId,
            sanitizationApplied: true,
        };
    }
}

class VerifiedResearchProvider implements RecommendationResearchProvider {
    queries: ResearchQuery[] = [];

    async research(query: ResearchQuery, context: { householdId: EntityId }) {
        this.queries.push(query);
        return {
            claim: query.claim,
            status: "VERIFIED" as const,
            results: [{
                relevanceScore: 100,
                evidence: {
                    id: "evidence-1" as EntityId,
                    householdId: context.householdId,
                    claim: "The card's current annual fee is $95.",
                    source: {
                        name: "Issuer",
                        type: "PROVIDER" as const,
                        tier: SourceTier.TIER_2_PROVIDER,
                        authority: SourceAuthority.OFFICIAL,
                    },
                    sourceUrl: "https://issuer.example/card-terms",
                    sourceText: "Raw source content must not enter the LLM context.",
                    retrievalDate: new Date("2026-09-11T00:00:00.000Z"),
                    freshness: "CURRENT" as const,
                    confidence: ConfidenceLevel.HIGH,
                    usedIn: [],
                    verificationStatus: "VERIFIED" as const,
                    createdAt: new Date("2026-09-11T00:00:00.000Z"),
                },
            }],
        };
    }
}

function createOrchestrator(researchProvider?: RecommendationResearchProvider) {
    const executor = new AIToolExecutor();
    executor.registerTool("get_financial_snapshot", async () => ({
        snapshot: { netWorthCents: 100000 },
        recommendations: ["Keep the card."],
    }));
    const llm = new CapturingLLMProvider();
    const privacy = new CapturingPrivacyGateway();
    const orchestrator = new AIOrchestrator(
        new AIToolPlanner(),
        executor,
        llm,
        privacy,
        researchProvider
    );
    return { orchestrator, llm, privacy };
}

function creditCardRequest(advisorPersonaKey?: string) {
    return {
        correlationId: "request-1" as EntityId,
        userMessage: "Should we keep this credit card?",
        workflowType: AdvisorWorkflow.GENERAL_FINANCIAL_QUESTION,
        householdId: "household-1" as EntityId,
        memberId: "member-1" as EntityId,
        isHouseholdOwner: true,
        advisorPersonaKey,
    };
}

describe("research-aware recommendation orchestration", () => {
    test("does not call the LLM when required current research is unavailable", async () => {
        const { orchestrator, llm } = createOrchestrator();

        const response = await orchestrator.processRequest(creditCardRequest());

        expect(response.success).toBe(false);
        expect(response.metadata.failureCategory).toBe(AdvisorFailureCategory.RESEARCH_UNAVAILABLE);
        expect(response.metadata.retryable).toBe(true);
        expect(response.metadata.research).toEqual({
            requirement: "REQUIRED",
            status: "UNAVAILABLE",
            evidenceCount: 0,
        });
        expect(response.assistantMessage).toContain("couldn't verify");
        expect(llm.calls).toHaveLength(0);
    });

    test("passes only verified, minimized evidence into the recommendation workflow", async () => {
        const research = new VerifiedResearchProvider();
        const { orchestrator, llm, privacy } = createOrchestrator(research);

        const response = await orchestrator.processRequest(creditCardRequest("carson_framework"));

        expect(response.success).toBe(true);
        expect(research.queries[0]).toMatchObject({
            topic: "ISSUER_TERMS",
            preferredTiers: [SourceTier.TIER_2_PROVIDER],
        });
        expect(response.metadata.research).toEqual({
            requirement: "REQUIRED",
            status: "VERIFIED",
            evidenceCount: 1,
        });
        expect(response.metadata.recommendation).toEqual({
            candidateCount: 1,
            validationStatus: "PASS",
            finalRecommendationProduced: true,
        });
        expect(response.metadata.advisorStyle).toBe("Family Planning");
        expect(response.metadata.groundingPassed).toBe(true);
        expect(response.assistantMessage).toContain("$95 annual fee");
        expect(llm.calls).toHaveLength(1);

        const serializedContext = JSON.stringify(privacy.contexts[0]);
        expect(serializedContext).toContain("The card's current annual fee is $95.");
        expect(serializedContext).toContain("Keep the card.");
        expect(serializedContext).not.toContain("Raw source content");
        expect(llm.calls[0].messages[0].content).toContain("household decision-making");
        expect(llm.calls[0].messages[0].content).toContain("never change calculations");
    });
});
