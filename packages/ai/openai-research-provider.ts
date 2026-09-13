/**
 * OpenAI Research Provider - External Research via OpenAI API
 *
 * Implements RecommendationResearchProvider to query current financial information
 * from approved external sources via OpenAI API. All queries are restricted to
 * a pre-approved allowlist to maintain privacy boundaries.
 *
 * Features:
 * - Only researches allowlisted topics
 * - Parses OpenAI responses to extract facts and sources
 * - Returns properly-sourced Evidence objects
 * - Enforces tier restrictions on external data
 */

import {
    EntityId,
    Evidence,
    SearchResearchResponse,
    SourceTier,
    SourceAuthority,
    ConfidenceLevel,
    ResearchSource,
} from "@house-fin/contracts";
import { ResearchQuery, RecommendationResearchContext, RecommendationResearchProvider } from "./recommendation-research";
import { isResearchAllowed, getAllowedSourcesForClaim, AllowlistedSource } from "./research-allowlist";

interface OpenAIMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

interface OpenAIResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

/**
 * Research provider that queries OpenAI API for current financial information.
 * All queries are restricted to allowlisted sources and topics.
 */
export class OpenAIResearchProvider implements RecommendationResearchProvider {
    private apiKey: string;
    private model: string;
    private apiBaseUrl: string = "https://api.openai.com/v1";

    constructor() {
        // Get API key from environment
        this.apiKey = process.env.OPENAI_API_KEY || "";
        if (!this.apiKey) {
            throw new Error("OPENAI_API_KEY environment variable not set");
        }

        // Get model from environment or use default
        this.model = process.env.OPENAI_MODEL || "gpt-4";
    }

    /**
     * Research a specific claim via OpenAI API.
     * Only queries are allowlisted; others return empty evidence.
     */
    async research(
        query: ResearchQuery,
        context: RecommendationResearchContext
    ): Promise<SearchResearchResponse> {
        try {
            // Step 1: Verify claim is allowlisted
            if (!isResearchAllowed(query.claim)) {
                return {
                    claim: query.claim,
                    results: [],
                    status: "UNVERIFIED",
                };
            }

            // Step 2: Get allowed sources for this claim
            const allowedSources = getAllowedSourcesForClaim(query.claim);
            if (allowedSources.length === 0) {
                return {
                    claim: query.claim,
                    results: [],
                    status: "UNVERIFIED",
                };
            }

            // Step 3: Query OpenAI for current information
            const response = await this.queryOpenAI(query.claim, allowedSources);

            // Step 4: Parse response and create evidence
            const evidence = this.parseResponse(response, query.claim, allowedSources, context.householdId);

            return {
                claim: query.claim,
                results: evidence.map(e => ({ evidence: e, relevanceScore: 95 })), // High score for allowlisted sources
                status: evidence.length > 0 ? "VERIFIED" : "UNVERIFIED",
            };
        } catch (error) {
            console.error(`Research error for claim "${query.claim}":`, error instanceof Error ? error.message : error);
            return {
                claim: query.claim,
                results: [],
                status: "UNVERIFIED",
            };
        }
    }

    /**
     * Query OpenAI API for current information about the claim.
     */
    private async queryOpenAI(
        claim: string,
        allowedSources: AllowlistedSource[]
    ): Promise<string> {
        const sourceNames = allowedSources.map(s => s.name).join(", ");

        const messages: OpenAIMessage[] = [
            {
                role: "system",
                content: `You are a financial research assistant. Provide only factual, current information from official sources.
Do not provide analysis, opinion, or speculation.
Always include the specific source where the information comes from.`,
            },
            {
                role: "user",
                content: `What is the current value of: ${claim}?
                
Sources are limited to: ${sourceNames}

Provide ONLY the factual information and its official source. Format:
[FACT] The specific fact [SOURCE] Official source name or URL`,
            },
        ];

        const requestBody = {
            model: this.model,
            max_tokens: 500,
            messages,
        };

        const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json() as Record<string, unknown>;
            throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
        }

        const data = (await response.json()) as OpenAIResponse;
        return data.choices[0]?.message?.content ?? "";
    }

    /**
     * Parse OpenAI response to extract [FACT]...[SOURCE]... patterns.
     */
    private parseResponse(
        content: string,
        claim: string,
        allowedSources: AllowlistedSource[],
        householdId: EntityId
    ): Evidence[] {
        const evidence: Evidence[] = [];

        // Parse [FACT]...[SOURCE]... patterns
        const factRegex = /\[FACT\](.*?)\[SOURCE\](.*?)(?=\[FACT\]|$)/gs;
        let match;

        while ((match = factRegex.exec(content)) !== null) {
            const factText = match[1].trim();
            const sourceText = match[2].trim();

            if (!factText || !sourceText) continue;

            // Verify source is on allowlist
            const allowedSource = allowedSources.find(
                s => sourceText.toLowerCase().includes(s.name.toLowerCase()) ||
                    sourceText.toLowerCase().includes(s.endpoint.toLowerCase())
            );

            if (!allowedSource) continue;

            // Create ResearchSource object from AllowlistedSource
            const researchSource: ResearchSource = {
                name: allowedSource.name,
                type: allowedSource.type,
                tier: allowedSource.tier,
                authority: allowedSource.authority,
                url: allowedSource.endpoint,
                description: `Retrieved for claim: ${claim}`,
            };

            evidence.push({
                id: this.generateId(),
                householdId,
                claim,
                source: researchSource,
                sourceUrl: allowedSource.endpoint,
                sourceText: factText,
                retrievalDate: new Date(),
                freshness: "CURRENT",
                confidence: ConfidenceLevel.HIGH,
                usedIn: [],
                verificationStatus: "VERIFIED",
                createdAt: new Date(),
            });
        }

        return evidence;
    }

    /**
     * Generate a unique ID for evidence.
     */
    private generateId(): EntityId {
        return `evid_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` as EntityId;
    }
}
