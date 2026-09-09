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

/**
 * Scenario types for financial recommendations
 *
 * Scenarios explore the impact of financial decisions or events.
 * Each scenario type has different inputs and uses different financial services.
 */
export enum ScenarioType {
    WINDFALL = "WINDFALL",
    SURPRISE_EXPENSE = "SURPRISE_EXPENSE",
    SAVINGS_ALLOCATION = "SAVINGS_ALLOCATION",
    DEBT_ACTION = "DEBT_ACTION",
    BUDGET_CHANGE = "BUDGET_CHANGE",
    GOAL_PRIORITY = "GOAL_PRIORITY",
    CASH_ALLOCATION = "CASH_ALLOCATION",
    AFFORDABILITY = "AFFORDABILITY",
    FINANCIAL_INDEPENDENCE = "FINANCIAL_INDEPENDENCE",
}

/**
 * Baseline state for a scenario
 *
 * Represents the current financial position before any proposed action.
 * Extracted from the financial snapshot.
 */
export interface ScenarioBaseline {
    // Account balances
    emergencyFundBalance: Money; // Total in emergency fund accounts
    emergencyFundTarget: Money; // Desired emergency fund amount
    emergencyFundMonths: number; // Months of expenses covered

    // Debt situation
    totalDebt: Money; // All debt balances combined
    debtToIncomeRatio: number; // Total debt / monthly income
    highestInterestRate: number; // Highest APR among debts
    monthlyDebtPayments: Money; // Total minimum payments

    // Cash flow
    monthlyIncome: Money;
    monthlyExpenses: Money;
    monthlySavingsCapacity: Money; // Income - expenses

    // Goals
    activeGoals: number;
    goalFundingGap: Money; // Total shortfall across all goals
    retirementYearsAway: number;

    // Health
    financialHealthScore: number; // 0-100
    healthStatus: FinancialHealthStatus;
}

/**
 * A single action proposed in a scenario
 *
 * Example:
 * - Allocate $5,000 to emergency fund
 * - Pay down credit card with 22% APR by $3,000
 * - Increase monthly savings to $1,200
 */
export interface ScenarioAction {
    id: string; // Deterministic ID
    title: string; // e.g., "Allocate $5,000 to emergency fund"
    description: string; // More detailed explanation
    accountId?: EntityId; // Which account to affect
    amount?: Money; // How much (for transfers, payments, allocations)
    percentOfAmount?: number; // Or as percentage (0-100)
    frequencyMonths?: number; // If recurring, how often?
}

/**
 * Impact assessment for a scenario
 *
 * Quantifies how the scenario affects key financial metrics.
 */
export interface ScenarioImpact {
    // Timing
    immediatelyAffected: boolean; // Happens now vs over time?
    timeframeMonths?: number; // How many months to full impact?

    // Financial effects
    cashFlowImpact: Money; // Change in monthly cash flow
    debtReduction: Money; // How much debt is paid
    emergencyFundIncrease: Money; // How much EF grows
    investmentIncrease: Money; // How much investment grows
    savingsIncrease: Money; // How much savings grow
    wealthIncrease: Money; // Total net worth change

    // Ratio improvements
    debtToIncomeChange: number; // Percentage point change
    healthScoreChange: number; // Points gained/lost
    emergencyFundMonthsChange: number; // Months of coverage gained

    // Risk adjustments
    riskReduction: "HIGH" | "MEDIUM" | "LOW" | "NONE";
    flexibilityChange: "INCREASED" | "MAINTAINED" | "REDUCED"; // Can they still change course?
    liquidityChange: "IMPROVED" | "MAINTAINED" | "DECREASED";
}

/**
 * Resulting financial state after a scenario is implemented
 *
 * Projection of where the household would be if they took the proposed action.
 */
export interface ScenarioResultingState {
    // Account balances after action
    emergencyFundBalance: Money;
    emergencyFundMonths: number;

    // Debt position
    totalDebt: Money;
    debtToIncomeRatio: number;
    monthlyDebtPayments: Money;

    // Cash flow
    monthlySavingsCapacity: Money;
    monthlyAllocableAmount: Money; // How much can go to goals/investing?

    // Goals
    goalFundingGap: Money; // Remaining shortfall
    goalsOnTrack: number; // How many goals now achievable?

    // Overall health
    financialHealthScore: number;
    healthStatus: FinancialHealthStatus;

    // Metadata
    achievedAt?: Date; // When this state is reached
    requiresMonthlyCommitment?: Money; // Ongoing commitment needed?
}

/**
 * Assumption used in scenario generation
 *
 * Example:
 * - "Income remains stable at $6,000/month"
 * - "Interest rates stay constant"
 * - "No new debt incurred"
 */
export interface ScenarioAssumption {
    key: string; // Machine-readable: "income_stable", "no_new_debt"
    statement: string; // Human-readable: "Monthly income remains constant"
    confidence: ConfidenceLevel; // How confident are we?
    impact: "HIGH" | "MEDIUM" | "LOW"; // How much does this affect the outcome?
}

/**
 * Sensitivity analysis: how sensitive is the outcome to assumptions?
 *
 * Tests: "What if income drops 10%?" or "What if interest rates rise?"
 * Shows which assumptions matter most.
 */
export interface ScenarioSensitivity {
    assumptionKey: string; // Which assumption to test
    scenarios: Array<{
        change: string; // e.g., "Income -10%", "Interest rate +1%"
        resultingHealthScore: number;
        resultingDebtRatio: number;
        stillAchievesGoal: boolean;
        recommendation: string; // Should they proceed if this happens?
    }>;
}

/**
 * Complete scenario definition
 *
 * A scenario is a self-contained analysis of one decision:
 * "If we do X, here's what happens: Y"
 *
 * Key properties:
 * - Deterministic: same snapshot always produces same scenarios
 * - Immutable: scenarios don't change once generated
 * - Traceable: lineage to snapshot and calculation version
 * - Independent: doesn't affect household state
 */
export interface Scenario {
    id: EntityId; // Unique ID for this scenario
    householdId: EntityId;
    financialSnapshotId: EntityId; // From which snapshot?
    financialSnapshotVersion: number;

    type: ScenarioType;
    title: string; // e.g., "Emergency Fund First: Use windfall to reach 6-month target"
    description: string;

    // Input data
    input: {
        [key: string]: any; // Type-specific input (see ScenarioInput unions below)
    };

    // Analysis
    baseline: ScenarioBaseline;
    proposedActions: ScenarioAction[];
    impact: ScenarioImpact;
    resultingState: ScenarioResultingState;

    // Reasoning
    assumptions: ScenarioAssumption[];
    sensitivities: ScenarioSensitivity[];

    // Ordering
    order: number; // For presenting to user (A, B, C, etc.)
    rationale: string; // Why this scenario is worth considering

    // Metadata
    calculationVersion: number; // Which financial service version?
    policyVersion?: number; // Any policy applied?
    createdAt: Date;

    // Quality metrics
    confidence: ConfidenceLevel;
    dataCompleteness: number; // 0-100, how much data was available?
}

/**
 * Request to generate scenarios for a windfall
 *
 * Example: "I got a $10,000 bonus"
 */
export interface WindfallScenarioInput {
    amount: Money; // $10,000
    source: string; // "Bonus", "Tax refund", "Inheritance", etc.
    mustAllocateBy?: Date; // By when must this be allocated?
    restrictions?: string; // Any constraints?
}

/**
 * Request to generate scenarios for a surprise expense
 *
 * Example: "My car needs a $3,000 repair"
 */
export interface SurpriseExpenseScenarioInput {
    amount: Money; // $3,000
    category: string; // "Car", "Medical", "Home", etc.
    isRecurring: boolean; // One-time or regular?
    mustPayBy?: Date; // Deadline?
}

/**
 * Request to generate scenarios for savings allocation
 *
 * Example: "I can save an extra $500/month"
 */
export interface SavingsAllocationScenarioInput {
    monthlyAmount: Money; // $500
    monthsAvailable: number; // For how long can you maintain this?
    purpose?: string; // Goal or general savings?
}

/**
 * Request to generate debt action scenarios
 *
 * Example: "Should I pay off my credit card?"
 */
export interface DebtActionScenarioInput {
    debtId?: EntityId; // Specific debt to target
    debtType?: string; // Or: "credit_card", "personal_loan", etc.
    action: "ACCELERATED_PAYOFF" | "SNOWBALL" | "AVALANCHE" | "CONSOLIDATE";
    extraPayment?: Money; // How much extra can you pay?
}

/**
 * Request to generate budget change scenarios
 *
 * Example: "Can we reduce spending by $200/month?"
 */
export interface BudgetChangeScenarioInput {
    categories?: {
        [category: string]: Money; // Changes by category
    };
    targetReduction?: Money; // Or just a total target
    affectedMonths: number; // For how long?
}

/**
 * Request to generate goal priority scenarios
 *
 * Example: "Should I prioritize my down payment savings?"
 */
export interface GoalPriorityScenarioInput {
    goalId?: EntityId; // Which goal to prioritize?
    increaseAllocationTo?: Money; // New monthly amount?
    affectOtherGoals?: boolean; // Reduce other goal funding?
}

/**
 * Request to generate cash allocation scenarios
 *
 * Example: "I have $8,000 available. How should I split it?"
 */
export interface CashAllocationScenarioInput {
    availableAmount: Money; // Total to allocate
    options?: string[]; // Suggested buckets (EF, debt, goals, investment)
}

/**
 * Request to generate affordability scenarios
 *
 * Example: "Can we afford a $1,500/month car payment?"
 */
export interface AffordabilityScenarioInput {
    newMonthlyObligation: Money; // $1,500
    itemDescription: string; // "Car", "Home", "Childcare"
    downPaymentAvailable?: Money; // If applicable
}

/**
 * Request to generate financial independence impact scenarios
 *
 * Example: "What if I save an extra $10k/year for retirement?"
 */
export interface FinancialIndependenceScenarioInput {
    yearsToRetirement?: number;
    additionalAnnualSavings?: Money;
    retirementIncomeNeeded?: Money;
    strategy?: "AGGRESSIVE" | "MODERATE" | "CONSERVATIVE";
}

/**
 * Request to generate scenarios
 *
 * Contains input specific to scenario type.
 */
export type ScenarioInput =
    | WindfallScenarioInput
    | SurpriseExpenseScenarioInput
    | SavingsAllocationScenarioInput
    | DebtActionScenarioInput
    | BudgetChangeScenarioInput
    | GoalPriorityScenarioInput
    | CashAllocationScenarioInput
    | AffordabilityScenarioInput
    | FinancialIndependenceScenarioInput;

/**
 * Response from scenario generation
 *
 * Returns multiple scenarios (alternatives) for the user to consider.
 */
export interface GenerateScenarioResponse {
    householdId: EntityId;
    financialSnapshotId: EntityId;
    scenarioType: ScenarioType;
    scenarios: Scenario[];
    summary: {
        totalScenarios: number;
        recommendedFirstAlternative: EntityId; // Which is best?
        tradeoffSummary: string; // Quick explanation of tradeoffs
    };
}
