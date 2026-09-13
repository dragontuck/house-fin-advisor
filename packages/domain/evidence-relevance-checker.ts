import { Evidence } from "@house-fin/contracts";

/**
 * Verify that evidence actually supports a claimed fact.
 * Prevents generic evidence from being used for specific claims.
 * 
 * Deterministic scoring based on term overlap between claim and evidence.
 * No external calls or non-deterministic behavior.
 */
export class EvidenceRelevanceChecker {
    /**
     * Check if evidence supports a specific claim.
     * Returns confidence level (HIGH, MEDIUM, LOW) or IRRELEVANT.
     * 
     * @param claim The financial claim that needs supporting evidence
     * @param evidence Array of Evidence objects to evaluate
     * @returns Object containing relevance assessment and supporting evidence
     */
    checkRelevance(claim: string, evidence: Evidence[]): {
        isRelevant: boolean;
        confidence: "HIGH" | "MEDIUM" | "LOW" | "IRRELEVANT";
        reasoning: string;
        supportingEvidence: Evidence[];
    } {
        if (!evidence || evidence.length === 0) {
            return {
                isRelevant: false,
                confidence: "IRRELEVANT",
                reasoning: "No evidence provided to check against claim",
                supportingEvidence: [],
            };
        }

        // Extract key terms from claim (words >3 chars, lowercase)
        const claimTerms = this.extractKeyTerms(claim);

        if (claimTerms.length === 0) {
            return {
                isRelevant: false,
                confidence: "IRRELEVANT",
                reasoning: "Unable to extract meaningful terms from claim",
                supportingEvidence: [],
            };
        }

        // Score each evidence against claim
        const scores = evidence.map(e => {
            // Combine claim and source text for scoring
            const evidenceText = `${e.claim} ${e.sourceText}`.toLowerCase();
            const evidenceTerms = this.extractKeyTerms(evidenceText);

            // Count how many claim terms appear in evidence (with substring matching)
            const matches = claimTerms.filter(term =>
                evidenceTerms.some(et => et.includes(term) || term.includes(et))
            );

            // Calculate relevance score: proportion of claim terms found in evidence
            // Use Math.max with 1 to avoid division by zero
            const relevanceScore = claimTerms.length > 0
                ? matches.length / Math.max(claimTerms.length, 1)
                : 0;

            return {
                evidence: e,
                relevanceScore,
                matchedTerms: matches.length,
                totalClaimTerms: claimTerms.length,
            };
        });

        // Filter for relevant evidence (>30% term match, lower threshold for financial domain)
        const relevantEvidences = scores.filter(s => s.relevanceScore >= 0.3);

        if (relevantEvidences.length === 0) {
            return {
                isRelevant: false,
                confidence: "IRRELEVANT",
                reasoning: `No evidence found that directly addresses the claim: "${claim}". Required at least 30% term overlap.`,
                supportingEvidence: [],
            };
        }

        // Sort by relevance score descending
        relevantEvidences.sort((a, b) => b.relevanceScore - a.relevanceScore);

        // Determine confidence level based on top score
        const topScore = relevantEvidences[0].relevanceScore;
        const confidence = topScore >= 0.7 ? "HIGH" : topScore >= 0.5 ? "MEDIUM" : "LOW";

        return {
            isRelevant: true,
            confidence,
            reasoning: `Found ${relevantEvidences.length} piece(s) of evidence supporting this claim with ${confidence} confidence (top match: ${(topScore * 100).toFixed(0)}% alignment).`,
            supportingEvidence: relevantEvidences.map(s => s.evidence),
        };
    }

    /**
     * Extract meaningful terms from text for relevance comparison.
     * Filters out very short words, common articles, and prepositions.
     * 
     * @param text Text to extract terms from
     * @returns Array of lowercase terms (words >3 chars)
     */
    private extractKeyTerms(text: string): string[] {
        return text
            .toLowerCase()
            .split(/[\s\-.,;:()]+/)
            .filter(t => t.length > 3 && !this.isCommonWord(t));
    }

    /**
     * Check if word is too common to be meaningful for relevance.
     * 
     * @param word Word to check
     * @returns true if word is common/meaningless for relevance scoring
     */
    private isCommonWord(word: string): boolean {
        const commonWords = new Set([
            "the", "that", "this", "with", "from", "into", "have", "been",
            "will", "would", "should", "could", "also", "just", "only",
            "more", "some", "about", "which", "their", "there", "these",
            "what", "when", "where", "your", "they", "them",
        ]);
        return commonWords.has(word);
    }
}
