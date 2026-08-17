/**
 * SavingsGoalService unit tests
 *
 * Covers:
 *  calculateGoal:
 *   - no funding (zero contribution)
 *   - fully funded goal
 *   - goal ahead of schedule
 *   - goal behind schedule
 *   - missed target date (date passed, not complete)
 *   - projectedCompletionDate calculation
 *   - requiredMonthlyContribution calculation
 *   - percentComplete precision
 *
 *  analyzeEmergencyFund:
 *   - CRITICAL (no cash)
 *   - WATCH (below minimum — spec example)
 *   - ADEQUATE (between min and target)
 *   - ON_TARGET (between target and stretch)
 *   - FULLY_FUNDED (at or above stretch)
 *   - zero essential expenses
 *   - policy changes affect status boundaries
 *   - IMPROVING trend with active contribution
 *   - DECLINING trend with no contribution below minimum
 *   - statusDescription includes coverage months and thresholds
 */

import {
    SavingsGoalService,
    CalculateGoalInput,
    AnalyzeEmergencyFundInput,
    createSavingsGoalService,
    SAVINGS_GOAL_CALCULATION_VERSION,
} from "@house-fin/domain";
import {
    GoalStatus,
    GoalType,
    EmergencyFundStatus,
    EmergencyFundTrend,
    EntityId,
    Money,
    SavingsGoal,
} from "@house-fin/contracts";

// ── helpers ──────────────────────────────────────────────────────────────────

function id(s: string): EntityId { return s as EntityId; }
function money(cents: number): Money { return cents as Money; }
function date(y: number, m: number, d: number): Date { return new Date(y, m - 1, d); }

const HH = id("hh-1");
const GOAL_ID = id("goal-1");

function makeGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
    return {
        id: GOAL_ID,
        householdId: HH,
        name: "Vacation Fund",
        type: GoalType.VACATION,
        targetAmountCents: money(500000),
        currentAmountCents: money(0),
        monthlyContributionCents: money(0),
        targetDate: null,
        startDate: date(2024, 1, 1),
        notes: null,
        version: 1,
        createdAt: date(2024, 1, 1),
        updatedAt: date(2024, 1, 1),
        ...overrides,
    };
}

const DEFAULT_POLICY = { minimumMonths: 3, targetMonths: 6, stretchMonths: 9 };

// ── SavingsGoalService.calculateGoal ─────────────────────────────────────────

describe("SavingsGoalService.calculateGoal", () => {
    let service: SavingsGoalService;
    beforeEach(() => { service = createSavingsGoalService(); });

    describe("factory", () => {
        it("createSavingsGoalService returns a SavingsGoalService", () => {
            expect(service).toBeInstanceOf(SavingsGoalService);
        });
    });

    describe("COMPLETED status", () => {
        it("status is COMPLETED when currentAmount equals targetAmount", () => {
            const result = service.calculateGoal({
                goal: makeGoal({ currentAmountCents: money(500000), targetAmountCents: money(500000) }),
                asOf: date(2024, 6, 1),
            });
            expect(result.status).toBe(GoalStatus.COMPLETED);
        });

        it("status is COMPLETED when currentAmount exceeds targetAmount", () => {
            const result = service.calculateGoal({
                goal: makeGoal({ currentAmountCents: money(600000), targetAmountCents: money(500000) }),
                asOf: date(2024, 6, 1),
            });
            expect(result.status).toBe(GoalStatus.COMPLETED);
        });

        it("remainingAmountCents is 0 when completed", () => {
            const result = service.calculateGoal({
                goal: makeGoal({ currentAmountCents: money(500000), targetAmountCents: money(500000) }),
                asOf: date(2024, 6, 1),
            });
            expect(result.remainingAmountCents).toBe(0);
        });

        it("percentComplete is 100 when completed", () => {
            const result = service.calculateGoal({
                goal: makeGoal({ currentAmountCents: money(600000), targetAmountCents: money(500000) }),
                asOf: date(2024, 6, 1),
            });
            expect(result.percentComplete).toBe(100);
        });
    });

    describe("no goal funding", () => {
        it("AT_RISK when no contribution and targetDate is set", () => {
            const result = service.calculateGoal({
                goal: makeGoal({
                    monthlyContributionCents: money(0),
                    targetDate: date(2025, 12, 1),
                }),
                asOf: date(2024, 6, 1),
            });
            expect(result.status).toBe(GoalStatus.AT_RISK);
        });

        it("AT_RISK when no contribution and no targetDate", () => {
            const result = service.calculateGoal({
                goal: makeGoal({ monthlyContributionCents: money(0), targetDate: null }),
                asOf: date(2024, 6, 1),
            });
            expect(result.status).toBe(GoalStatus.AT_RISK);
        });

        it("projectedCompletionDate is null when no contribution", () => {
            const result = service.calculateGoal({
                goal: makeGoal({ monthlyContributionCents: money(0) }),
                asOf: date(2024, 6, 1),
            });
            expect(result.projectedCompletionDate).toBeNull();
        });

        it("ON_TRACK when contribution is positive and no targetDate", () => {
            const result = service.calculateGoal({
                goal: makeGoal({ monthlyContributionCents: money(10000), targetDate: null }),
                asOf: date(2024, 6, 1),
            });
            expect(result.status).toBe(GoalStatus.ON_TRACK);
        });
    });

    describe("fully funded goal", () => {
        it("projectedCompletionDate is null when goal is already complete", () => {
            const result = service.calculateGoal({
                goal: makeGoal({ currentAmountCents: money(500000), targetAmountCents: money(500000) }),
                asOf: date(2024, 6, 1),
            });
            expect(result.projectedCompletionDate).toBeNull();
        });

        it("requiredMonthlyContributionCents is 0 when fully funded", () => {
            const result = service.calculateGoal({
                goal: makeGoal({
                    currentAmountCents: money(500000),
                    targetAmountCents: money(500000),
                    targetDate: date(2025, 1, 1),
                }),
                asOf: date(2024, 6, 1),
            });
            expect(result.requiredMonthlyContributionCents).toBe(0);
        });
    });

    describe("goal ahead of schedule", () => {
        it("AHEAD when projected completion is <90% of months to target", () => {
            // Target: 24 months away; at $5000/month needing only $50000 → 10 months (< 24*0.9=21.6)
            const result = service.calculateGoal({
                goal: makeGoal({
                    targetAmountCents: money(50000),
                    currentAmountCents: money(0),
                    monthlyContributionCents: money(5000),
                    targetDate: date(2026, 6, 1), // 24 months from asOf
                }),
                asOf: date(2024, 6, 1),
            });
            expect(result.status).toBe(GoalStatus.AHEAD);
        });
    });

    describe("goal behind schedule", () => {
        it("BEHIND when projected completion is after target date but within 20% overrun", () => {
            // Target: 10 months away; need $50000 at $4000/month → 13 months (13/10 = 1.3 > 1.0, ≤ 1.20 → AT_RISK)
            // Let me use: need $50000 at $4500/month → ceil(50000/4500)=12 months; target 11 months → 12/11 ≈ 1.09 < 1.20 → BEHIND
            const result = service.calculateGoal({
                goal: makeGoal({
                    targetAmountCents: money(50000),
                    currentAmountCents: money(0),
                    monthlyContributionCents: money(4500),
                    targetDate: date(2025, 5, 1), // 11 months from asOf
                }),
                asOf: date(2024, 6, 1),
            });
            expect(result.status).toBe(GoalStatus.BEHIND);
        });

        it("AT_RISK when projected completion overruns target by >20%", () => {
            // Target: 10 months away; need $50000 at $3000/month → 17 months → 17/10=1.7 > 1.20 → AT_RISK
            const result = service.calculateGoal({
                goal: makeGoal({
                    targetAmountCents: money(50000),
                    currentAmountCents: money(0),
                    monthlyContributionCents: money(3000),
                    targetDate: date(2025, 4, 1), // 10 months away
                }),
                asOf: date(2024, 6, 1),
            });
            expect(result.status).toBe(GoalStatus.AT_RISK);
        });
    });

    describe("missed target date", () => {
        it("BEHIND when target date passed and still contributing", () => {
            const result = service.calculateGoal({
                goal: makeGoal({
                    targetAmountCents: money(100000),
                    currentAmountCents: money(60000),
                    monthlyContributionCents: money(5000),
                    targetDate: date(2024, 1, 1), // in the past
                }),
                asOf: date(2024, 6, 1),
            });
            expect(result.status).toBe(GoalStatus.BEHIND);
        });

        it("AT_RISK when target date passed and no contribution", () => {
            const result = service.calculateGoal({
                goal: makeGoal({
                    targetAmountCents: money(100000),
                    currentAmountCents: money(60000),
                    monthlyContributionCents: money(0),
                    targetDate: date(2024, 1, 1),
                }),
                asOf: date(2024, 6, 1),
            });
            expect(result.status).toBe(GoalStatus.AT_RISK);
        });
    });

    describe("projectedCompletionDate", () => {
        it("is set correctly for positive contribution", () => {
            // $30000 remaining at $5000/month = 6 months
            const asOf = date(2024, 6, 1);
            const result = service.calculateGoal({
                goal: makeGoal({
                    targetAmountCents: money(50000),
                    currentAmountCents: money(20000),
                    monthlyContributionCents: money(5000),
                }),
                asOf,
            });
            expect(result.projectedCompletionDate).not.toBeNull();
            const months = (result.projectedCompletionDate!.getFullYear() - asOf.getFullYear()) * 12
                + (result.projectedCompletionDate!.getMonth() - asOf.getMonth());
            expect(months).toBe(6);
        });
    });

    describe("requiredMonthlyContributionCents", () => {
        it("is 0 when no targetDate", () => {
            const result = service.calculateGoal({
                goal: makeGoal({ targetDate: null }),
                asOf: date(2024, 6, 1),
            });
            expect(result.requiredMonthlyContributionCents).toBe(0);
        });

        it("equals remaining / monthsToTarget (rounded up)", () => {
            // $50000 remaining, 5 months to target → ceil(50000/5) = 10000
            const result = service.calculateGoal({
                goal: makeGoal({
                    targetAmountCents: money(50000),
                    currentAmountCents: money(0),
                    targetDate: date(2024, 11, 1), // 5 months from June
                }),
                asOf: date(2024, 6, 1),
            });
            expect(result.requiredMonthlyContributionCents).toBe(10000);
        });

        it("equals remaining when target date has passed", () => {
            const result = service.calculateGoal({
                goal: makeGoal({
                    targetAmountCents: money(50000),
                    currentAmountCents: money(20000),
                    targetDate: date(2024, 1, 1), // in the past
                }),
                asOf: date(2024, 6, 1),
            });
            expect(result.requiredMonthlyContributionCents).toBe(30000);
        });
    });

    describe("percentComplete", () => {
        it("is 0 when no funding", () => {
            const result = service.calculateGoal({
                goal: makeGoal({ currentAmountCents: money(0) }),
                asOf: date(2024, 6, 1),
            });
            expect(result.percentComplete).toBe(0);
        });

        it("is 50 when half funded", () => {
            const result = service.calculateGoal({
                goal: makeGoal({ currentAmountCents: money(250000), targetAmountCents: money(500000) }),
                asOf: date(2024, 6, 1),
            });
            expect(result.percentComplete).toBe(50);
        });

        it("is capped at 100 when over-funded", () => {
            const result = service.calculateGoal({
                goal: makeGoal({ currentAmountCents: money(700000), targetAmountCents: money(500000) }),
                asOf: date(2024, 6, 1),
            });
            expect(result.percentComplete).toBe(100);
        });
    });

    describe("calculationVersion and fields", () => {
        it("includes calculationVersion", () => {
            const result = service.calculateGoal({
                goal: makeGoal(),
                asOf: date(2024, 6, 1),
            });
            expect(result.calculationVersion).toBe(SAVINGS_GOAL_CALCULATION_VERSION);
        });

        it("includes goalId, householdId, name, type", () => {
            const result = service.calculateGoal({
                goal: makeGoal(),
                asOf: date(2024, 6, 1),
            });
            expect(result.goalId).toBe(GOAL_ID);
            expect(result.householdId).toBe(HH);
            expect(result.name).toBe("Vacation Fund");
            expect(result.type).toBe(GoalType.VACATION);
        });
    });
});

// ── SavingsGoalService.analyzeEmergencyFund ───────────────────────────────────

describe("SavingsGoalService.analyzeEmergencyFund", () => {
    let service: SavingsGoalService;
    beforeEach(() => { service = createSavingsGoalService(); });

    function analyze(
        eligibleCash: number,
        essentialMonthly: number,
        policy = DEFAULT_POLICY,
        activeContribution = 0,
    ) {
        return service.analyzeEmergencyFund({
            householdId: HH,
            eligibleCashCents: eligibleCash,
            essentialMonthlyExpensesCents: essentialMonthly,
            policy,
            activeMonthlyContributionCents: activeContribution,
            asOf: date(2024, 6, 15),
        });
    }

    describe("status classification", () => {
        it("CRITICAL when eligible cash is zero", () => {
            expect(analyze(0, 700000).status).toBe(EmergencyFundStatus.CRITICAL);
        });

        it("WATCH when coverage is below minimum — spec example ($14k / $7k = 2 months, min=3)", () => {
            const result = analyze(1400000, 700000);
            expect(result.status).toBe(EmergencyFundStatus.WATCH);
            expect(result.currentCoverageMonths).toBeCloseTo(2.0, 1);
        });

        it("ADEQUATE when coverage is between min and target", () => {
            // 4 months coverage, min=3, target=6
            expect(analyze(2800000, 700000).status).toBe(EmergencyFundStatus.ADEQUATE);
        });

        it("ON_TARGET when coverage is between target and stretch", () => {
            // 7 months coverage, target=6, stretch=9
            expect(analyze(4900000, 700000).status).toBe(EmergencyFundStatus.ON_TARGET);
        });

        it("FULLY_FUNDED when coverage meets or exceeds stretch", () => {
            // 9 months coverage, stretch=9
            expect(analyze(6300000, 700000).status).toBe(EmergencyFundStatus.FULLY_FUNDED);
        });
    });

    describe("spec example", () => {
        it("$14,000 cash / $7,000 monthly expenses → WATCH, 2 months coverage", () => {
            const result = analyze(1400000, 700000);
            expect(result.status).toBe(EmergencyFundStatus.WATCH);
            expect(result.currentCoverageMonths).toBeCloseTo(2.0, 1);
            expect(result.statusDescription).toContain("2 months");
            expect(result.statusDescription).toContain("minimum");
            expect(result.statusDescription).not.toMatch(/you should|recommend/i);
        });
    });

    describe("gap calculations", () => {
        it("gapToMinimumCents is negative when underfunded", () => {
            const result = analyze(1400000, 700000); // 2 months, min=3 → gap = 1400000 - 2100000 = -700000
            expect(result.gapToMinimumCents).toBe(1400000 - 2100000);
        });

        it("gapToMinimumCents is positive when above minimum", () => {
            const result = analyze(4200000, 700000); // 6 months, min=3 → gap = 4200000 - 2100000 = 2100000
            expect(result.gapToMinimumCents).toBeGreaterThan(0);
        });

        it("target amounts equal expenses × policy months", () => {
            const result = analyze(0, 700000);
            expect(result.minimumTargetCents).toBe(700000 * 3);
            expect(result.preferredTargetCents).toBe(700000 * 6);
            expect(result.stretchTargetCents).toBe(700000 * 9);
        });
    });

    describe("zero essential expenses", () => {
        it("FULLY_FUNDED when expenses are zero but cash is positive", () => {
            expect(analyze(100000, 0).status).toBe(EmergencyFundStatus.FULLY_FUNDED);
        });

        it("CRITICAL when both cash and expenses are zero", () => {
            expect(analyze(0, 0).status).toBe(EmergencyFundStatus.CRITICAL);
        });
    });

    describe("trend", () => {
        it("IMPROVING when below fully funded and has active contribution", () => {
            const result = analyze(1400000, 700000, DEFAULT_POLICY, 50000);
            expect(result.trend).toBe(EmergencyFundTrend.IMPROVING);
        });

        it("DECLINING when below minimum with no active contribution", () => {
            const result = analyze(1400000, 700000, DEFAULT_POLICY, 0);
            expect(result.trend).toBe(EmergencyFundTrend.DECLINING);
        });

        it("STABLE when fully funded", () => {
            const result = analyze(6300000, 700000, DEFAULT_POLICY, 0);
            expect(result.trend).toBe(EmergencyFundTrend.STABLE);
        });
    });

    describe("policy changes", () => {
        it("tighter policy (min=6) makes ADEQUATE→WATCH at 4 months coverage", () => {
            const tighterPolicy = { minimumMonths: 6, targetMonths: 9, stretchMonths: 12 };
            const result = analyze(2800000, 700000, tighterPolicy); // 4 months coverage
            expect(result.status).toBe(EmergencyFundStatus.WATCH);
        });

        it("looser policy (min=1) makes same amount ADEQUATE at 2 months coverage", () => {
            const looserPolicy = { minimumMonths: 1, targetMonths: 3, stretchMonths: 6 };
            const result = analyze(1400000, 700000, looserPolicy); // 2 months coverage
            expect(result.status).toBe(EmergencyFundStatus.ADEQUATE);
        });

        it("policy is included in the result", () => {
            const policy = { minimumMonths: 4, targetMonths: 8, stretchMonths: 12 };
            const result = analyze(0, 700000, policy);
            expect(result.policy).toEqual(policy);
        });
    });

    describe("statusDescription", () => {
        it("does not include recommendation language", () => {
            const result = analyze(1400000, 700000);
            expect(result.statusDescription).not.toMatch(/you should|we recommend|action/i);
        });

        it("ADEQUATE description mentions minimum and preferred months", () => {
            const result = analyze(2800000, 700000); // 4 months, min=3, target=6
            expect(result.statusDescription).toContain("3");
            expect(result.statusDescription).toContain("6");
        });

        it("CRITICAL description mentions empty fund", () => {
            const result = analyze(0, 700000);
            expect(result.statusDescription.toLowerCase()).toContain("empty");
        });

        it("FULLY_FUNDED description mentions stretch target", () => {
            const result = analyze(6300000, 700000); // 9 months = stretch
            expect(result.statusDescription).toContain("9");
        });
    });

    describe("calculationVersion and fields", () => {
        it("includes calculationVersion", () => {
            expect(analyze(0, 700000).calculationVersion).toBe(SAVINGS_GOAL_CALCULATION_VERSION);
        });

        it("eligibleCashCents and essentialMonthlyExpensesCents are echoed back", () => {
            const result = analyze(1400000, 700000);
            expect(result.eligibleCashCents).toBe(1400000);
            expect(result.essentialMonthlyExpensesCents).toBe(700000);
        });
    });
});
