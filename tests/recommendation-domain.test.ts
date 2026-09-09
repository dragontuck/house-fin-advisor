/**
 * Tests for Slice 5 Recommendation Domain
 *
 * Coverage:
 * - Recommendation contracts and validation
 * - Building recommendations
 * - Status transitions
 * - Versioning logic
 * - Expiration and invalidation
 * - Confidence calculation
 */

import {
    EntityId,
    Recommendation,
    RecommendationStatus,
    RecommendationType,
    ConfidenceLevel,
    CreateRecommendationRequest,
} from "@house-fin/contracts";
import {
    buildRecommendation,
    isExpired,
    shouldInvalidate,
    isMateriallyDifferent,
    canTransitionStatus,
    calculateConfidenceLevel,
    summarizeRecommendation,
    validateRecommendationStructure,
} from "@house-fin/domain";

describe("Slice 5: Recommendation Domain", () => {
    const householdId = "household-1" as EntityId;
    const memberId = "member-1" as EntityId;
    const snapshotId = "snapshot-1" as EntityId;
    const correlationId = "correlation-1" as EntityId;

    describe("Building Recommendations", () => {
        it("should build a valid recommendation", () => {
            const req: CreateRecommendationRequest = {
                householdId,
                memberId,
                type: RecommendationType.EMERGENCY_FUND,
                title: "Build Emergency Fund",
                summary: "Your household needs a 3-month emergency fund",
                recommendedAction: "Save $5,000 to emergency fund account",
                alternatives: [
                    {
                        id: "alt-1",
                        title: "Build Emergency Fund",
                        description: "Standard approach",
                        rationale: "Most stable",
                        isPreferred: true,
                        impactDirection: "POSITIVE",
                    },
                    {
                        id: "alt-2",
                        title: "Split: Emergency + Investment",
                        description: "Lower emergency fund, invest rest",
                        rationale: "Faster wealth building",
                        isPreferred: false,
                        impactDirection: "POSITIVE",
                    },
                ],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [
                    {
                        id: "assume-1",
                        key: "efund_target",
                        value: "3 months of expenses = $6,000",
                        confidence: ConfidenceLevel.HIGH,
                        reason: "Household policy",
                    },
                ],
                risks: [
                    {
                        id: "risk-1",
                        description: "Income drops 20%",
                        severity: "HIGH",
                        likelihood: "POSSIBLE",
                    },
                ],
                confidence: ConfidenceLevel.MEDIUM,
                confidenceReasoning: "Good data but some uncertainty in income",
            };

            const rec = buildRecommendation(req, memberId, correlationId);

            expect(rec).toMatchObject({
                householdId,
                memberId,
                type: RecommendationType.EMERGENCY_FUND,
                title: "Build Emergency Fund",
                confidence: ConfidenceLevel.MEDIUM,
                version: 1,
            });
            expect(rec.approval.status).toBe(RecommendationStatus.PROPOSED);
            expect(rec.alternatives).toHaveLength(2);
            expect(rec.alternatives.filter((a: any) => a.isPreferred)).toHaveLength(1);
        });

        it("should reject recommendations without preferred alternative", () => {
            const req: CreateRecommendationRequest = {
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [
                    {
                        id: "alt-1",
                        title: "Option A",
                        description: "Option A",
                        rationale: "A",
                        isPreferred: false,
                        impactDirection: "NEUTRAL",
                    },
                    {
                        id: "alt-2",
                        title: "Option B",
                        description: "Option B",
                        rationale: "B",
                        isPreferred: false,
                        impactDirection: "NEUTRAL",
                    },
                ],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [
                    {
                        id: "assume-1",
                        key: "test",
                        value: "test",
                        confidence: ConfidenceLevel.HIGH,
                        reason: "test",
                    },
                ],
                risks: [],
                confidence: ConfidenceLevel.LOW,
                confidenceReasoning: "test",
            };

            expect(() => buildRecommendation(req, memberId, correlationId)).toThrow(
                /exactly one alternative must be marked as preferred/i
            );
        });

        it("should require at least one assumption", () => {
            const req: CreateRecommendationRequest = {
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [
                    {
                        id: "alt-1",
                        title: "Option A",
                        description: "Option A",
                        rationale: "A",
                        isPreferred: true,
                        impactDirection: "NEUTRAL",
                    },
                ],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: ConfidenceLevel.LOW,
                confidenceReasoning: "test",
            };

            expect(() => buildRecommendation(req, memberId, correlationId)).toThrow(
                /at least one assumption is required/i
            );
        });
    });

    describe("Expiration", () => {
        it("should detect expired recommendations", () => {
            const rec: Recommendation = {
                id: "rec-1" as EntityId,
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: ConfidenceLevel.MEDIUM,
                confidenceReasoning: "test",
                approval: {
                    status: RecommendationStatus.PROPOSED,
                    expiresAt: new Date(Date.now() - 1000), // 1 second ago
                },
                approvalRequired: true,
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: memberId,
                correlationId,
            };

            expect(isExpired(rec)).toBe(true);
        });

        it("should not expire future-dated recommendations", () => {
            const rec: Recommendation = {
                id: "rec-1" as EntityId,
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: ConfidenceLevel.MEDIUM,
                confidenceReasoning: "test",
                approval: {
                    status: RecommendationStatus.PROPOSED,
                    expiresAt: new Date(Date.now() + 1000), // 1 second from now
                },
                approvalRequired: true,
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: memberId,
                correlationId,
            };

            expect(isExpired(rec)).toBe(false);
        });

        it("should not expire if no expiration date set", () => {
            const rec: Recommendation = {
                id: "rec-1" as EntityId,
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: ConfidenceLevel.MEDIUM,
                confidenceReasoning: "test",
                approval: {
                    status: RecommendationStatus.PROPOSED,
                },
                approvalRequired: true,
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: memberId,
                correlationId,
            };

            expect(isExpired(rec)).toBe(false);
        });
    });

    describe("Invalidation", () => {
        it("should invalidate if snapshot version changed", () => {
            const rec: Recommendation = {
                id: "rec-1" as EntityId,
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: ConfidenceLevel.MEDIUM,
                confidenceReasoning: "test",
                approval: { status: RecommendationStatus.PROPOSED },
                approvalRequired: true,
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: memberId,
                correlationId,
            };

            // Snapshot was updated
            const result = shouldInvalidate(rec, 2, 1);
            expect(result).toBe(true);
        });

        it("should invalidate if policy version changed", () => {
            const rec: Recommendation = {
                id: "rec-1" as EntityId,
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: ConfidenceLevel.MEDIUM,
                confidenceReasoning: "test",
                approval: { status: RecommendationStatus.PROPOSED },
                approvalRequired: true,
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: memberId,
                correlationId,
            };

            // Policy was updated
            const result = shouldInvalidate(rec, 1, 2);
            expect(result).toBe(true);
        });

        it("should not invalidate if no changes", () => {
            const rec: Recommendation = {
                id: "rec-1" as EntityId,
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: ConfidenceLevel.MEDIUM,
                confidenceReasoning: "test",
                approval: { status: RecommendationStatus.PROPOSED },
                approvalRequired: true,
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: memberId,
                correlationId,
            };

            const result = shouldInvalidate(rec, 1, 1);
            expect(result).toBe(false);
        });
    });

    describe("Status Transitions", () => {
        it("should allow PROPOSED → REVIEWED", () => {
            expect(canTransitionStatus(RecommendationStatus.PROPOSED, RecommendationStatus.REVIEWED)).toBe(true);
        });

        it("should allow REVIEWED → APPROVED", () => {
            expect(canTransitionStatus(RecommendationStatus.REVIEWED, RecommendationStatus.APPROVED)).toBe(true);
        });

        it("should allow REVIEWED → DECLINED", () => {
            expect(canTransitionStatus(RecommendationStatus.REVIEWED, RecommendationStatus.DECLINED)).toBe(true);
        });

        it("should allow PROPOSED → DECLINED (skip REVIEWED)", () => {
            expect(canTransitionStatus(RecommendationStatus.PROPOSED, RecommendationStatus.DECLINED)).toBe(true);
        });

        it("should prevent APPROVED → DECLINED", () => {
            expect(canTransitionStatus(RecommendationStatus.APPROVED, RecommendationStatus.DECLINED)).toBe(false);
        });

        it("should always allow transition to INVALIDATED", () => {
            expect(canTransitionStatus(RecommendationStatus.APPROVED, RecommendationStatus.INVALIDATED)).toBe(true);
            expect(canTransitionStatus(RecommendationStatus.DECLINED, RecommendationStatus.INVALIDATED)).toBe(true);
            expect(canTransitionStatus(RecommendationStatus.EXPIRED, RecommendationStatus.INVALIDATED)).toBe(true);
        });

        it("should not allow no-op transitions to change status", () => {
            expect(canTransitionStatus(RecommendationStatus.PROPOSED, RecommendationStatus.PROPOSED)).toBe(true);
        });
    });

    describe("Material Differences", () => {
        const baseRec: Recommendation = {
            id: "rec-1" as EntityId,
            householdId,
            memberId,
            type: RecommendationType.BUDGET_CHANGE,
            title: "Test",
            summary: "Test",
            recommendedAction: "Original action",
            alternatives: [
                {
                    id: "alt-1",
                    title: "Preferred",
                    description: "desc",
                    rationale: "rationale",
                    isPreferred: true,
                    impactDirection: "POSITIVE" as const,
                },
                {
                    id: "alt-2",
                    title: "Alternative",
                    description: "desc",
                    rationale: "rationale",
                    isPreferred: false,
                    impactDirection: "POSITIVE" as const,
                },
            ],
            financialSnapshotId: snapshotId,
            financialSnapshotVersion: 1,
            policyVersion: 1,
            evidence: [],
            assumptions: [],
            risks: [],
            confidence: ConfidenceLevel.MEDIUM,
            confidenceReasoning: "test",
            approval: { status: RecommendationStatus.PROPOSED },
            approvalRequired: true,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: memberId,
            correlationId,
        };

        it("should detect changed recommended action", () => {
            const modified: Recommendation = {
                ...baseRec,
                recommendedAction: "Modified action",
            };

            expect(isMateriallyDifferent(baseRec, modified)).toBe(true);
        });

        it("should detect changed preferred alternative", () => {
            const modified: Recommendation = {
                ...baseRec,
                alternatives: [
                    {
                        id: "alt-1",
                        title: "Preferred",
                        description: "desc",
                        rationale: "rationale",
                        isPreferred: false,
                        impactDirection: "POSITIVE" as const,
                    },
                    {
                        id: "alt-2",
                        title: "Alternative",
                        description: "desc",
                        rationale: "rationale",
                        isPreferred: true,
                        impactDirection: "POSITIVE" as const,
                    },
                ],
            };

            expect(isMateriallyDifferent(baseRec, modified)).toBe(true);
        });

        it("should detect changed confidence level", () => {
            const modified: Recommendation = {
                ...baseRec,
                confidence: ConfidenceLevel.LOW,
            };

            expect(isMateriallyDifferent(baseRec, modified)).toBe(true);
        });

        it("should not detect adding evidence as material change", () => {
            const modified: Recommendation = {
                ...baseRec,
                evidence: [
                    {
                        id: "ev-1",
                        evidenceId: "ev-1" as EntityId,
                        claim: "Some claim",
                        sourceName: "IRS",
                        sourceTier: "TIER_1_GOVERNMENT",
                        sourceUrl: undefined,
                        retrievalDate: new Date(),
                        freshness: "CURRENT",
                        confidence: ConfidenceLevel.HIGH,
                    },
                ],
            };

            expect(isMateriallyDifferent(baseRec, modified)).toBe(false);
        });

        it("should not detect status change as material", () => {
            const modified: Recommendation = {
                ...baseRec,
                approval: { status: RecommendationStatus.REVIEWED },
            };

            expect(isMateriallyDifferent(baseRec, modified)).toBe(false);
        });
    });

    describe("Confidence Calculation", () => {
        it("should calculate HIGH confidence with all good factors", () => {
            const factors = {
                dataFreshness: "CURRENT" as const,
                dataCompleteness: 1.0,
                calculationComplexity: "SIMPLE" as const,
                evidenceTier: "TIER_1" as const,
                evidenceFreshness: "CURRENT" as const,
                validationStatus: "PASS" as const,
                assumptionSensitivity: "LOW" as const,
                assumptions: [],
            };

            const confidence = calculateConfidenceLevel(factors);
            expect(confidence).toBe(ConfidenceLevel.HIGH);
        });

        it("should calculate LOW confidence with poor factors", () => {
            const factors = {
                dataFreshness: "RECENT" as const,
                dataCompleteness: 0.5,
                calculationComplexity: "MODERATE" as const,
                evidenceTier: "TIER_3" as const,
                evidenceFreshness: "RECENT" as const,
                validationStatus: "FAIL" as const,
                assumptionSensitivity: "HIGH" as const,
                assumptions: [
                    {
                        id: "a1",
                        key: "test",
                        value: "test",
                        confidence: ConfidenceLevel.LOW,
                        reason: "test",
                    },
                ],
            };

            const confidence = calculateConfidenceLevel(factors);
            expect(confidence).toBe(ConfidenceLevel.LOW);
        });

        it("should reduce confidence for LOW confidence assumptions", () => {
            const factorsWithoutLowAssumptions = {
                dataFreshness: "CURRENT" as const,
                dataCompleteness: 1.0,
                calculationComplexity: "SIMPLE" as const,
                evidenceTier: "TIER_1" as const,
                evidenceFreshness: "CURRENT" as const,
                validationStatus: "PASS" as const,
                assumptionSensitivity: "LOW" as const,
                assumptions: [],
            };

            const factorsWithLowAssumptions = {
                ...factorsWithoutLowAssumptions,
                assumptions: [
                    {
                        id: "a1",
                        key: "test",
                        value: "test",
                        confidence: ConfidenceLevel.LOW,
                        reason: "test",
                    },
                    {
                        id: "a2",
                        key: "test2",
                        value: "test2",
                        confidence: ConfidenceLevel.LOW,
                        reason: "test",
                    },
                ],
            };

            const c1 = calculateConfidenceLevel(factorsWithoutLowAssumptions);
            const c2 = calculateConfidenceLevel(factorsWithLowAssumptions);

            // With LOW assumptions, confidence should be lower or equal
            const levels = [ConfidenceLevel.HIGH, ConfidenceLevel.MEDIUM, ConfidenceLevel.LOW, ConfidenceLevel.INSUFFICIENT_INFORMATION];
            expect(levels.indexOf(c2)).toBeGreaterThanOrEqual(levels.indexOf(c1));
        });
    });

    describe("Structure Validation", () => {
        const validRec: Partial<Recommendation> = {
            householdId,
            memberId,
            title: "Test",
            summary: "Test summary",
            recommendedAction: "Do this",
            alternatives: [
                {
                    id: "alt-1",
                    title: "Preferred",
                    description: "desc",
                    rationale: "rationale",
                    isPreferred: true,
                    impactDirection: "POSITIVE",
                },
            ],
            assumptions: [
                {
                    id: "a1",
                    key: "test",
                    value: "test",
                    confidence: ConfidenceLevel.HIGH,
                    reason: "test",
                },
            ],
            financialSnapshotId: snapshotId,
            financialSnapshotVersion: 1,
            policyVersion: 1,
            confidence: ConfidenceLevel.HIGH,
            approval: { status: RecommendationStatus.PROPOSED },
        };

        it("should validate a well-formed recommendation", () => {
            const result = validateRecommendationStructure(validRec);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it("should detect missing title", () => {
            const rec = { ...validRec, title: "" };
            const result = validateRecommendationStructure(rec);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("Title"))).toBe(true);
        });

        it("should detect missing householdId", () => {
            const rec = { ...validRec };
            delete rec.householdId;
            const result = validateRecommendationStructure(rec);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("householdId"))).toBe(true);
        });

        it("should detect multiple errors", () => {
            const rec = { ...validRec, title: "", summary: "" };
            const result = validateRecommendationStructure(rec);
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(1);
        });
    });

    describe("Summarization", () => {
        it("should produce readable summary", () => {
            const rec: Recommendation = {
                id: "rec-1" as EntityId,
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test Recommendation",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [
                    {
                        id: "alt-1",
                        title: "Preferred Action",
                        description: "desc",
                        rationale: "rationale",
                        isPreferred: true,
                        impactDirection: "POSITIVE",
                    },
                ],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: ConfidenceLevel.MEDIUM,
                confidenceReasoning: "test",
                approval: { status: RecommendationStatus.REVIEWED },
                approvalRequired: true,
                version: 2,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: memberId,
                correlationId,
            };

            const summary = summarizeRecommendation(rec);

            expect(summary).toContain("Test Recommendation");
            expect(summary).toContain("Preferred Action");
            expect(summary).toContain("MEDIUM");
            expect(summary).toContain("REVIEWED");
            expect(summary).toContain("v2");
        });
    });
});

describe("Slice 5: Recommendation Domain", () => {
    const householdId = "household-1" as EntityId;
    const memberId = "member-1" as EntityId;
    const snapshotId = "snapshot-1" as EntityId;
    const correlationId = "correlation-1" as EntityId;

    describe("Building Recommendations", () => {
        it("should build a valid recommendation", () => {
            const req: CreateRecommendationRequest = {
                householdId,
                memberId,
                type: RecommendationType.EMERGENCY_FUND,
                title: "Build Emergency Fund",
                summary: "Your household needs a 3-month emergency fund",
                recommendedAction: "Save $5,000 to emergency fund account",
                alternatives: [
                    {
                        id: "alt-1",
                        title: "Build Emergency Fund",
                        description: "Standard approach",
                        rationale: "Most stable",
                        isPreferred: true,
                        impactDirection: "POSITIVE",
                    },
                    {
                        id: "alt-2",
                        title: "Split: Emergency + Investment",
                        description: "Lower emergency fund, invest rest",
                        rationale: "Faster wealth building",
                        isPreferred: false,
                        impactDirection: "POSITIVE",
                    },
                ],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [
                    {
                        id: "assume-1",
                        key: "efund_target",
                        value: "3 months of expenses = $6,000",
                        confidence: "HIGH" as ConfidenceLevel,
                        reason: "Household policy",
                    },
                ],
                risks: [
                    {
                        id: "risk-1",
                        description: "Income drops 20%",
                        severity: "HIGH",
                        likelihood: "POSSIBLE",
                    },
                ],
                confidence: "MEDIUM" as ConfidenceLevel,
                confidenceReasoning: "Good data but some uncertainty in income",
            };

            const rec = buildRecommendation(req, memberId, correlationId);

            expect(rec).toMatchObject({
                householdId,
                memberId,
                type: RecommendationType.EMERGENCY_FUND,
                title: "Build Emergency Fund",
                confidence: ConfidenceLevel.MEDIUM,
                version: 1,
            });
            expect(rec.approval.status).toBe(RecommendationStatus.PROPOSED);
            expect(rec.alternatives).toHaveLength(2);
            expect(rec.alternatives.filter((a) => a.isPreferred)).toHaveLength(1);
        });

        it("should reject recommendations without preferred alternative", () => {
            const req: CreateRecommendationRequest = {
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [
                    {
                        id: "alt-1",
                        title: "Option A",
                        description: "Option A",
                        rationale: "A",
                        isPreferred: false,
                        impactDirection: "NEUTRAL",
                    },
                    {
                        id: "alt-2",
                        title: "Option B",
                        description: "Option B",
                        rationale: "B",
                        isPreferred: false,
                        impactDirection: "NEUTRAL",
                    },
                ],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [
                    {
                        id: "assume-1",
                        key: "test",
                        value: "test",
                        confidence: "HIGH" as ConfidenceLevel,
                        reason: "test",
                    },
                ],
                risks: [],
                confidence: "LOW" as ConfidenceLevel,
                confidenceReasoning: "test",
            };

            expect(() => buildRecommendation(req, memberId, correlationId)).toThrow(
                /exactly one alternative must be marked as preferred/i
            );
        });

        it("should require at least one assumption", () => {
            const req: CreateRecommendationRequest = {
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [
                    {
                        id: "alt-1",
                        title: "Option A",
                        description: "Option A",
                        rationale: "A",
                        isPreferred: true,
                        impactDirection: "NEUTRAL",
                    },
                ],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: "LOW" as ConfidenceLevel,
                confidenceReasoning: "test",
            };

            expect(() => buildRecommendation(req, memberId, correlationId)).toThrow(
                /at least one assumption is required/i
            );
        });
    });

    describe("Expiration", () => {
        it("should detect expired recommendations", () => {
            const rec: Recommendation = {
                id: "rec-1" as EntityId,
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: ConfidenceLevel.MEDIUM,
                confidenceReasoning: "test",
                approval: {
                    status: RecommendationStatus.PROPOSED,
                    expiresAt: new Date(Date.now() - 1000), // 1 second ago
                },
                approvalRequired: true,
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: memberId,
                correlationId,
            };

            expect(isExpired(rec)).toBe(true);
        });

        it("should not expire future-dated recommendations", () => {
            const rec: Recommendation = {
                id: "rec-1" as EntityId,
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: ConfidenceLevel.MEDIUM,
                confidenceReasoning: "test",
                approval: {
                    status: RecommendationStatus.PROPOSED,
                    expiresAt: new Date(Date.now() + 1000), // 1 second from now
                },
                approvalRequired: true,
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: memberId,
                correlationId,
            };

            expect(isExpired(rec)).toBe(false);
        });

        it("should not expire if no expiration date set", () => {
            const rec: Recommendation = {
                id: "rec-1" as EntityId,
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: ConfidenceLevel.MEDIUM,
                confidenceReasoning: "test",
                approval: {
                    status: RecommendationStatus.PROPOSED,
                },
                approvalRequired: true,
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: memberId,
                correlationId,
            };

            expect(isExpired(rec)).toBe(false);
        });
    });

    describe("Invalidation", () => {
        it("should invalidate if snapshot version changed", () => {
            const rec: Recommendation = {
                id: "rec-1" as EntityId,
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: ConfidenceLevel.MEDIUM,
                confidenceReasoning: "test",
                approval: { status: RecommendationStatus.PROPOSED },
                approvalRequired: true,
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: memberId,
                correlationId,
            };

            // Snapshot was updated
            const result = shouldInvalidate(rec, 2, 1);
            expect(result).toBe(true);
        });

        it("should invalidate if policy version changed", () => {
            const rec: Recommendation = {
                id: "rec-1" as EntityId,
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: ConfidenceLevel.MEDIUM,
                confidenceReasoning: "test",
                approval: { status: RecommendationStatus.PROPOSED },
                approvalRequired: true,
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: memberId,
                correlationId,
            };

            // Policy was updated
            const result = shouldInvalidate(rec, 1, 2);
            expect(result).toBe(true);
        });

        it("should not invalidate if no changes", () => {
            const rec: Recommendation = {
                id: "rec-1" as EntityId,
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: ConfidenceLevel.MEDIUM,
                confidenceReasoning: "test",
                approval: { status: RecommendationStatus.PROPOSED },
                approvalRequired: true,
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: memberId,
                correlationId,
            };

            const result = shouldInvalidate(rec, 1, 1);
            expect(result).toBe(false);
        });
    });

    describe("Status Transitions", () => {
        it("should allow PROPOSED → REVIEWED", () => {
            expect(canTransitionStatus("PROPOSED" as RecommendationStatus, "REVIEWED" as RecommendationStatus)).toBe(
                true
            );
        });

        it("should allow REVIEWED → APPROVED", () => {
            expect(canTransitionStatus("REVIEWED" as RecommendationStatus, "APPROVED" as RecommendationStatus)).toBe(
                true
            );
        });

        it("should allow REVIEWED → DECLINED", () => {
            expect(canTransitionStatus("REVIEWED" as RecommendationStatus, "DECLINED" as RecommendationStatus)).toBe(
                true
            );
        });

        it("should allow PROPOSED → DECLINED (skip REVIEWED)", () => {
            expect(canTransitionStatus("PROPOSED" as RecommendationStatus, "DECLINED" as RecommendationStatus)).toBe(
                true
            );
        });

        it("should prevent APPROVED → DECLINED", () => {
            expect(canTransitionStatus("APPROVED" as RecommendationStatus, "DECLINED" as RecommendationStatus)).toBe(
                false
            );
        });

        it("should always allow transition to INVALIDATED", () => {
            expect(canTransitionStatus("APPROVED" as RecommendationStatus, "INVALIDATED" as RecommendationStatus)).toBe(
                true
            );
            expect(canTransitionStatus("DECLINED" as RecommendationStatus, "INVALIDATED" as RecommendationStatus)).toBe(
                true
            );
            expect(canTransitionStatus("EXPIRED" as RecommendationStatus, "INVALIDATED" as RecommendationStatus)).toBe(
                true
            );
        });

        it("should not allow no-op transitions to change status", () => {
            expect(canTransitionStatus(RecommendationStatus.PROPOSED, RecommendationStatus.PROPOSED)).toBe(true);
        });
    });

    describe("Structure Validation", () => {
        const validRec: Partial<Recommendation> = {
            householdId,
            memberId,
            title: "Test",
            summary: "Test summary",
            recommendedAction: "Do this",
            alternatives: [
                {
                    id: "alt-1",
                    title: "Preferred",
                    description: "desc",
                    rationale: "rationale",
                    isPreferred: true,
                    impactDirection: "POSITIVE",
                },
            ],
            assumptions: [
                {
                    id: "a1",
                    key: "test",
                    value: "test",
                    confidence: "HIGH" as ConfidenceLevel,
                    reason: "test",
                },
            ],
            financialSnapshotId: snapshotId,
            financialSnapshotVersion: 1,
            policyVersion: 1,
            confidence: "HIGH" as ConfidenceLevel,
            approval: { status: "PROPOSED" as RecommendationStatus },
        };

        it("should validate a well-formed recommendation", () => {
            const result = validateRecommendationStructure(validRec);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it("should detect missing title", () => {
            const rec = { ...validRec, title: "" };
            const result = validateRecommendationStructure(rec);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("Title"))).toBe(true);
        });

        it("should detect missing householdId", () => {
            const rec = { ...validRec };
            delete rec.householdId;
            const result = validateRecommendationStructure(rec);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("householdId"))).toBe(true);
        });

        it("should detect multiple errors", () => {
            const rec = { ...validRec, title: "", summary: "" };
            const result = validateRecommendationStructure(rec);
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(1);
        });
    });

    describe("Summarization", () => {
        it("should produce readable summary", () => {
            const rec: Recommendation = {
                id: "rec-1" as EntityId,
                householdId,
                memberId,
                type: RecommendationType.BUDGET_CHANGE,
                title: "Test Recommendation",
                summary: "Test",
                recommendedAction: "Test",
                alternatives: [
                    {
                        id: "alt-1",
                        title: "Preferred Action",
                        description: "desc",
                        rationale: "rationale",
                        isPreferred: true,
                        impactDirection: "POSITIVE",
                    },
                ],
                financialSnapshotId: snapshotId,
                financialSnapshotVersion: 1,
                policyVersion: 1,
                evidence: [],
                assumptions: [],
                risks: [],
                confidence: ConfidenceLevel.MEDIUM,
                confidenceReasoning: "test",
                approval: { status: RecommendationStatus.REVIEWED },
                approvalRequired: true,
                version: 2,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: memberId,
                correlationId,
            };

            const summary = summarizeRecommendation(rec);

            expect(summary).toContain("Test Recommendation");
            expect(summary).toContain("Preferred Action");
            expect(summary).toContain("MEDIUM");
            expect(summary).toContain("REVIEWED");
            expect(summary).toContain("v2");
        });
    });
});
