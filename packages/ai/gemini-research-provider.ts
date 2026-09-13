/**
 * Google Gemini Research Provider - External Research via Google Generative AI API
 *
 * Implements RecommendationResearchProvider to query current financial information
 * from approved external sources via Google Gemini API. All queries are restricted to
 * a pre-approved allowlist to maintain privacy boundaries.
 *
 * Features:
 * - Only researches allowlisted topics
 * - Parses Gemini responses to extract facts and sources
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

interface GeminiContent {
    role: string;
    parts: Array<{
        text: string;
    }>;
}

interface GeminiResponse {
    candidates: Array<{
        content: {
            parts: Array<{
                text: string;
            }>;
        };
    }>;
}

/**
 * Research provider that queries Google Gemini API for current financial information.
 * All queries are restricted to allowlisted sources and topics.
 */
export class GeminiResearchProvider implements RecommendationResearchProvider {
    private apiKey: string;
    private model: string;
    private apiBaseUrl: string = "https://generativelanguage.googleapis.com/v1beta/models";

    constructor() {
        // Get API key from environment
        this.apiKey = process.env.GOOGLE_API_KEY || "";
        if (!this.apiKey) {
            throw new Error("GOOGLE_API_KEY environment variable not set");
        }

        // Get model from environment or use default
        this.model = process.env.GEMINI_MODEL || "gemini-pro";
    }

    /**
     * Research a specific claim via Google Gemini API.
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

            // Step 3: Query Gemini for current information
            const response = await this.queryGemini(query.claim, allowedSources);

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
     * Query Google Gemini API for current information about the claim.
     */
    private async queryGemini(
        claim: string,
        allowedSources: AllowlistedSource[]
    ): Promise<string> {
        const sourceNames = allowedSources.map(s => s.name).join(", ");

        const requestBody = {
            contents: [
                {
                    parts: [
                        {
                            text: `What is the current value of: ${claim}?
                
Sources are limited to: ${sourceNames}

Provide ONLY the factual information and its official source. Format:
[FACT] The specific fact [SOURCE] Official source name or URL

You are a financial research assistant. Provide only factual, current information from official sources.
Do not provide analysis, opinion, or speculation.
Always include the specific source where the information comes from.`,
                        },
                    ],
                },
            ],
            generationConfig: {
                maxOutputTokens: 500,
                temperature: 0.1, // Low temperature for factual responses
            },
            safetySettings: [
                {
                    category: "HARM_CATEGORY_UNSPECIFIED",
                    threshold: "BLOCK_NONE",
                },
            ],
        };

        const url = `${this.apiBaseUrl}/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json() as Record<string, unknown>;
            throw new Error(`Gemini API error: ${JSON.stringify(errorData)}`);
        }

        const data = (await response.json()) as GeminiResponse;
        return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }

    /**
     * Parse Gemini response to extract [FACT]...[SOURCE]... patterns.
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
