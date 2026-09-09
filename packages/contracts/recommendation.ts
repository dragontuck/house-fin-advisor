/**
 * Recommendation Domain Contracts for Slice 5
 *
 * Core types for building, validating, and tracking financial recommendations.
 * Recommendations are deterministic outputs from financial scenarios and research.
 *
 * Key principles:
 * - Recommendations are immutable once created
 * - Status changes create new entries (append-only audit trail)
 * - Versioning is explicit (not silent modifications)
 * - All recommendations require explicit user approval to affect household state
 * - Complete lineage is preserved (snapshot, scenarios, evidence, validation)
 */

import { EntityId, Money, FinancialHealthStatus } from "./index";

/**
 * Recommendation types (from Slice 5 spec section 3)
 */
export enum RecommendationType {
    BUDGET_CHANGE = "BUDGET_CHANGE",
    SAVINGS_ALLOCATION = "SAVINGS_ALLOCATION",
    EMERGENCY_FUND = "EMERGENCY_FUND",
    DEBT_ACTION = "DEBT_ACTION",
    WINDFALL_ALLOCATION = "WINDFALL_ALLOCATION",
    SURPRISE_EXPENSE = "SURPRISE_EXPENSE",
    GOAL_PRIORITY = "GOAL_PRIORITY",
    CASH_MANAGEMENT = "CASH_MANAGEMENT",
    CREDIT_CARD_DECISION = "CREDIT_CARD_DECISION",
    FINANCIAL_INDEPENDENCE = "FINANCIAL_INDEPENDENCE",
    GENERAL_FINANCIAL_DECISION = "GENERAL_FINANCIAL_DECISION",
}

/**
 * Recommendation status lifecycle
 *
 * PROPOSED: Initial state, waiting for user review
 * REVIEWED: User has viewed it, not yet decided
 * APPROVED: User approved the recommendation
 * DECLINED: User explicitly declined
 * EXPIRED: Recommendation is no longer valid (based on time or household state change)
 * INVALIDATED: Recommendation was valid but is now invalid due to data inconsistency
 */
export enum RecommendationStatus {
    PROPOSED = "PROPOSED",
    REVIEWED = "REVIEWED",
    APPROVED = "APPROVED",
    DECLINED = "DECLINED",
    EXPIRED = "EXPIRED",
    INVALIDATED = "INVALIDATED",
}

/**
 * Confidence level in the recommendation
 * NOT just LLM confidence, but based on:
 * - Data quality (freshness, completeness)
 * - Calculation confidence (complexity, edge cases)
 * - Evidence quality (tier, currency, specificity)
 * - Validation outcome (pass/warn/fail)
 * - Assumption sensitivity
 */
export enum ConfidenceLevel {
    HIGH = "HIGH",
    MEDIUM = "MEDIUM",
    LOW = "LOW",
    INSUFFICIENT_INFORMATION = "INSUFFICIENT_INFORMATION",
}

/**
 * One alternative to the recommended action
 *
 * Recommendations should normally include:
 * - Preferred: What we recommend
 * - Alternative A: Strongest competing choice
 * - Alternative B: Lower-risk or lower-effort option
 */
export interface RecommendationAlternative {
    id: string; // Deterministic ID (e.g., hash of title + description)
    title: string; // e.g., "Put $4,000 toward mortgage principal"
    description: string; // Why this alternative exists
    rationale: string; // Why someone might choose this instead
    tradeoffs?: string[]; // What you gain/lose vs preferred
    estimatedImpact?: Money; // Financial impact in cents
    impactDirection: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
    isPreferred: boolean; // Only one should be true
}

/**
 * An assumption the recommendation is based on
 *
 * Examples:
 * - "Income remains stable at $6,000/month"
 * - "Emergency fund policy is 3-6 months of essential expenses"
 * - "Credit card annual fee is $550"
 */
export interface RecommendationAssumption {
    id: string;
    key: string; // Machine-readable: "income_stability", "efund_policy", "card_fee"
    value: string; // Human-readable: "Monthly income stable at $6,000"
    confidence: ConfidenceLevel; // How confident are we in this assumption?
    reason: string; // Why we're making this assumption
    sensitivity?: string; // How much does outcome change if this is wrong?
    // e.g., "If income drops 20%, impact reduces by $800/month"
}

/**
 * A risk or downside to the recommendation
 */
export interface RecommendationRisk {
    id: string;
    description: string; // What could go wrong
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    likelihood: "UNLIKELY" | "POSSIBLE" | "LIKELY" | "PROBABLE";
    mitigations?: string[]; // How to reduce the risk
    impact?: string; // What happens if this risk occurs
}

/**
 * A piece of evidence supporting or informing the recommendation
 *
 * Links to external evidence stored in the Evidence table.
 * Includes source tier and freshness for audit trail.
 */
export interface RecommendationEvidence {
    id: string;
    evidenceId: EntityId; // Reference to Evidence table
    claim: string; // What the evidence claims
    sourceName: string; // e.g., "IRS", "Chase", "Morningstar"
    sourceTier: "TIER_1_GOVERNMENT" | "TIER_2_PROVIDER" | "TIER_3_RESEARCH" | "TIER_4_MEDIA";
    sourceUrl?: string;
    retrievalDate: Date;
    freshness: "CURRENT" | "RECENT" | "STALE" | "EXPIRED";
    confidence: ConfidenceLevel;
}

/**
 * Validation result from independent challenge process
 *
 * Records the outcome of:
 * - Math verification
 * - Policy compliance
 * - Data freshness checks
 * - Assumption sensitivity analysis
 * - Adversarial review
 */
export interface RecommendationValidation {
    id: string; // Validation execution ID
    status: "PASS" | "PASS_WITH_WARNINGS" | "FAIL" | "INSUFFICIENT_INFORMATION";
    summary: string; // High-level summary
    details: ValidationDetail[];
    adversarialReview?: AdversarialReview;
    warnings?: string[];
    suggestions?: string[];
    performedAt: Date;
    performedBy?: string; // "SYSTEM" for automated validation
}

/**
 * Individual validation check result
 */
export interface ValidationDetail {
    category:
    | "MATH"
    | "RULES"
    | "POLICY"
    | "FRESHNESS"
    | "ASSUMPTIONS"
    | "ALTERNATIVES"
    | "DOWNSIDE"
    | "SENSITIVITY"
    | "CONFLICTS"
    | "BIAS"
    | "CLAIMS"
    | "RESEARCH";
    status: "PASS" | "WARN" | "FAIL";
    description: string;
    evidence?: string;
}

/**
 * Adversarial review challenges the recommendation
 *
 * Asks: "What would make this recommendation wrong?"
 * Attempts to build counter-recommendations
 */
export interface AdversarialReview {
    question: string; // "What would make this recommendation wrong?"
    challenges: Challenge[];
    weaknesses: string[];
    potentialAlternatives: string[];
}

/**
 * One challenge to the recommendation
 */
export interface Challenge {
    type:
    | "ASSUMPTION"
    | "DATA_FRESHNESS"
    | "INCOME_CHANGE"
    | "EXPENSE_CHANGE"
    | "INTEREST_RATE"
    | "TAX_CONSEQUENCE"
    | "GOAL_DEADLINE"
    | "EMERGENCY"
    | "BENEFIT_OVERSTATEMENT"
    | "MISSING_DEBT"
    | "OUTDATED_TERMS";
    description: string;
    impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    likelihood: "UNLIKELY" | "POSSIBLE" | "LIKELY" | "PROBABLE";
}

/**
 * Approval state of a recommendation
 *
 * Tracks who approved/declined and when.
 * Enables audit trail and prevents accidental approval.
 */
export interface RecommendationApproval {
    status: RecommendationStatus;
    approvedAt?: Date;
    approvedBy?: EntityId;
    approvalNotes?: string;
    declinedAt?: Date;
    declinedBy?: EntityId;
    declinationReason?: string;
    expiresAt?: Date; // When recommendation is no longer valid
}

/**
 * Core Recommendation entity
 *
 * Immutable once created. Changes create a new version.
 * References financial snapshot, scenarios, evidence, and validation.
 */
export interface Recommendation {
    // Identity
    id: EntityId;
    householdId: EntityId;
    memberId: EntityId; // Which household member requested/received this
    conversationId?: EntityId; // Optional: conversation this came from

    // Classification
    type: RecommendationType;
    title: string; // e.g., "Allocate $10,000 bonus to emergency fund"
    summary: string; // Paragraph summary of recommendation

    // The recommendation itself
    recommendedAction: string; // What to do (detailed)
    alternatives: RecommendationAlternative[]; // Why preferred over alternatives

    // Financial basis (immutable reference)
    financialSnapshotId: EntityId; // Snapshot this was based on
    financialSnapshotVersion: number; // Snapshot version for reproducibility
    policyVersion: number; // Version of household financial policy applied

    // Related financial scenarios (optional)
    // Links to Scenario entities that supported this recommendation
    scenarioIds?: EntityId[];

    // Evidence and reasoning
    evidence: RecommendationEvidence[]; // What we know to be true
    assumptions: RecommendationAssumption[]; // What we're assuming
    risks: RecommendationRisk[]; // What could go wrong

    // Validation (may be populated later, but can exist at creation)
    validation?: RecommendationValidation;

    // Confidence in this recommendation
    confidence: ConfidenceLevel;
    confidenceReasoning: string; // Why we have this confidence level

    // Approval workflow
    approval: RecommendationApproval;
    approvalRequired: boolean; // Does this need explicit user approval?

    // Versioning
    version: number; // Starts at 1, increments for material changes
    previousVersionId?: EntityId; // If this supersedes a prior version

    // Lifecycle
    createdAt: Date;
    createdBy: EntityId;
    updatedAt: Date;

    // Audit trail
    correlationId: EntityId; // Trace ID for all related operations
}

/**
 * Recommendation version history
 *
 * Tracks all versions of a recommendation.
 * Enables comparison between versions.
 * Preserves complete audit trail.
 */
export interface RecommendationVersion {
    id: EntityId;
    recommendationId: EntityId; // Which recommendation this version belongs to
    householdId: EntityId;
    version: number; // 1, 2, 3, ...

    // What changed from previous version
    reason: "INITIAL" | "ASSUMPTION_CHANGE" | "EVIDENCE_UPDATE" | "VALIDATION_CHANGE" | "POLICY_CHANGE" | "DATA_REFRESH" | "SUPERSEDED";
    changeDescription?: string; // Why this version exists

    // Full snapshot of this version's state
    recommendation: Recommendation; // Immutable snapshot

    // Comparison to previous version
    previousVersionId?: EntityId;
    materialllyDifferent: boolean; // Did meaningful recommendation change?

    createdAt: Date;
    createdBy: EntityId;
}

/**
 * Request to create a new recommendation
 */
export interface CreateRecommendationRequest {
    householdId: EntityId;
    memberId: EntityId;
    conversationId?: EntityId;
    type: RecommendationType;
    title: string;
    summary: string;
    recommendedAction: string;
    alternatives: RecommendationAlternative[];
    financialSnapshotId: EntityId;
    financialSnapshotVersion: number;
    policyVersion: number;
    scenarioIds?: EntityId[];
    evidence: RecommendationEvidence[];
    assumptions: RecommendationAssumption[];
    risks: RecommendationRisk[];
    confidence: ConfidenceLevel;
    confidenceReasoning: string;
    approvalRequired?: boolean;
    expiresAt?: Date;
}

/**
 * Request to update recommendation status
 */
export interface UpdateRecommendationStatusRequest {
    status: RecommendationStatus;
    approvalNotes?: string;
    declinationReason?: string;
}

/**
 * Request to approve a recommendation
 */
export interface ApproveRecommendationRequest {
    approvalNotes?: string;
}

/**
 * Request to decline a recommendation
 */
export interface DeclineRecommendationRequest {
    reason: string;
}

/**
 * Response from recommendation creation
 */
export interface CreateRecommendationResponse {
    recommendation: Recommendation;
    version: RecommendationVersion;
    createdAt: Date;
}

/**
 * Response from recommendation approval
 */
export interface ApproveRecommendationResponse {
    recommendation: Recommendation;
    approval: RecommendationApproval;
    approvedAt: Date;
}

/**
 * Response from recommendation decline
 */
export interface DeclineRecommendationResponse {
    recommendation: Recommendation;
    declinedAt: Date;
    reason: string;
}

/**
 * List recommendations response
 */
export interface ListRecommendationsResponse {
    recommendations: Recommendation[];
    total: number;
    hasMore: boolean;
}

/**
 * Research source with tier hierarchy
 *
 * Sources are ranked by authority and reliability.
 * Preferences:
 * 1. Government/regulator sources (most authoritative)
 * 2. Primary provider sources (official channel)
 * 3. Independent research (peer-reviewed, academic)
 * 4. Secondary/media (general information)
 */
export enum SourceTier {
    TIER_1_GOVERNMENT = "TIER_1_GOVERNMENT",
    TIER_2_PROVIDER = "TIER_2_PROVIDER",
    TIER_3_RESEARCH = "TIER_3_RESEARCH",
    TIER_4_MEDIA = "TIER_4_MEDIA",
}

/**
 * Source authority classification
 */
export enum SourceAuthority {
    REGULATORY = "REGULATORY", // Government, SEC, Federal Reserve
    OFFICIAL = "OFFICIAL", // Banks, providers, official channels
    ACADEMIC = "ACADEMIC", // Universities, peer-reviewed research
    INSTITUTIONAL = "INSTITUTIONAL", // Research firms, think tanks
    COMMERCIAL = "COMMERCIAL", // For-profit research, vendors
    COMMUNITY = "COMMUNITY", // Forums, blogs, community sources
}

/**
 * Research source metadata
 *
 * Identifies and ranks sources used for evidence.
 */
export interface ResearchSource {
    name: string; // e.g., "IRS", "Federal Reserve", "Chase Bank", "Morningstar"
    type: "GOVERNMENT" | "PROVIDER" | "RESEARCH" | "MEDIA" | "CUSTOM";
    tier: SourceTier;
    authority: SourceAuthority;
    url?: string; // Source website
    description?: string; // Context about the source
}

/**
 * Evidence with complete provenance
 *
 * A single piece of evidence supporting or informing recommendations.
 * Includes full source tracking, freshness status, and confidence level.
 *
 * Key principles:
 * - Never fabricate evidence
 * - Always track source tier and authority
 * - Mark stale evidence explicitly
 * - Cannot be modified once created (audit trail)
 */
export interface Evidence {
    id: EntityId;
    householdId: EntityId; // Which household this evidence was retrieved for

    // The claim
    claim: string; // e.g., "2024 IRS standard deduction is $14,600 for single filers"

    // Source information
    source: ResearchSource; // Who/where this came from
    sourceUrl?: string; // URL where evidence was found
    sourceText?: string; // Quoted text from source
    sourceQuote?: string; // Extracted relevant quote

    // Temporal tracking
    retrievalDate: Date; // When we retrieved this
    publicationDate?: Date; // When source published/updated it
    expiresAt?: Date; // When this evidence is no longer valid

    // Freshness and quality
    freshness: "CURRENT" | "RECENT" | "STALE" | "EXPIRED"; // Age relative to today
    confidence: ConfidenceLevel; // How confident we are in this evidence

    // Usage tracking
    usedIn: EntityId[]; // Recommendations using this evidence
    verificationStatus: "VERIFIED" | "UNVERIFIED" | "CONFLICTED"; // Can it be confirmed?

    // Metadata
    createdAt: Date;
}

/**
 * Request to search for research on a claim
 */
export interface SearchResearchRequest {
    claim: string; // What we're researching
    context?: string; // Additional context (e.g., "2024", "IRS", household situation)
    preferredTiers?: SourceTier[]; // Prefer sources from these tiers
}

/**
 * Response from research search
 */
export interface SearchResearchResponse {
    claim: string;
    results: {
        evidence: Evidence;
        relevanceScore: number; // 0-100, how relevant this is
    }[];
    status: "VERIFIED" | "UNVERIFIED" | "CONFLICTED"; // Overall verification status
    conflictDetails?: string; // If sources conflict
}

/**
 * Request to retrieve and extract evidence from a source
 */
export interface RetrieveSourceRequest {
    sourceUrl: string;
    claim?: string; // What specific claim we're looking for
}

/**
 * Response from source retrieval
 */
export interface RetrieveSourceResponse {
    source: ResearchSource;
    sourceUrl: string;
    status: "SUCCESS" | "UNVERIFIED" | "UNAVAILABLE" | "FORBIDDEN"; // Retrieval outcome
    evidence?: Evidence; // If successful
    errorMessage?: string; // If failed
}

/**
 * Freshness assessment result
 */
export interface FreshnessAssessment {
    status: "CURRENT" | "RECENT" | "STALE" | "EXPIRED";
    daysOld: number;
    recommendation: string; // e.g., "Consider refreshing this data"
    requiresVerification: boolean; // Must be re-verified?
}
