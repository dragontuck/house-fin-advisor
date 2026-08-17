/**
 * DebtIntelligenceService — deterministic debt analysis.
 *
 * Rules:
 * - All money arithmetic uses integer cents.
 * - Same inputs always produce identical outputs.
 * - A credit-card statement balance is NEVER automatically treated as revolving debt.
 *   revolvingBalanceCents must be explicitly provided or it stays null.
 * - weightedAverageRateBps is null when ANY debt account is missing interestRateBps.
 * - totalMinimumPaymentCents / totalScheduledPaymentCents are null when ANY
 *   active debt account is missing that field.
 * - debtToIncomeRatio is null when monthlyIncomeCents is zero or payments are unknown.
 * - Observations are factual sentences — no payoff recommendations.
 *
 * Status rules:
 *  HEALTHY  — no revolving balance, DTI < 0.28 or unknown, no high-rate revolving
 *  WATCH    — revolving balance exists and utilisation > 0.30, or DTI 0.28–0.36
 *  AT_RISK  — revolving utilisation > 0.50 on any card, or DTI 0.36–0.43
 *  CRITICAL — revolving utilisation > 0.75 on any card, or DTI > 0.43
 *
 * The highest applicable severity determines overall status.
 */

import {
    EntityId,
    Account,
    AccountType,
    DebtAnalysis,
    DebtAccountDetail,
    DebtCategory,
    DebtHealthStatus,
    DebtObservation,
} from "@house-fin/contracts";

export const DEBT_INTELLIGENCE_VERSION = 1;

export interface AnalyzeDebtInput {
    householdId: EntityId;
    /** All accounts for the household (service filters to debt types). */
    accounts: Account[];
    /** Gross monthly income in cents; 0 when unknown. */
    monthlyIncomeCents: number;
    asOf: Date;
}

// ── Category mapping ──────────────────────────────────────────────────────────

function categoryFor(type: AccountType): DebtCategory {
    switch (type) {
        case AccountType.CREDIT_CARD: return DebtCategory.REVOLVING;
        case AccountType.LOAN: return DebtCategory.INSTALLMENT;
        case AccountType.MORTGAGE: return DebtCategory.MORTGAGE;
        default: return DebtCategory.UNKNOWN;
    }
}

const DEBT_ACCOUNT_TYPES = new Set<AccountType>([
    AccountType.CREDIT_CARD,
    AccountType.LOAN,
    AccountType.MORTGAGE,
]);

// ── Observation helpers ───────────────────────────────────────────────────────

/** Format cents as whole dollars with thousands separator (e.g. 123456 → "$1,235"). */
function dollars(cents: number): string {
    return "$" + Math.round(cents / 100).toLocaleString("en-US");
}

/** Format basis points as percentage string (e.g. 1975 → "19.75%"). */
function bpsToPercent(bps: number): string {
    return (bps / 100).toFixed(2) + "%";
}

// ── Debt detail builder ───────────────────────────────────────────────────────

function buildDetail(account: Account): DebtAccountDetail {
    const category = categoryFor(account.type);

    const creditLimitCents = account.creditLimitCents ?? null;
    const interestRateBps = account.interestRateBps ?? null;
    const minimumPaymentCents = account.minimumPaymentCents ?? null;
    const scheduledPaymentCents = account.scheduledPaymentCents ?? null;
    const statementBalanceCents = account.statementBalanceCents ?? null;
    const revolvingBalanceCents = account.revolvingBalanceCents ?? null;

    const currentBalanceCents = Math.abs(account.currentBalance as number);

    let utilizationRatio: number | null = null;
    if (category === DebtCategory.REVOLVING && creditLimitCents !== null && creditLimitCents > 0) {
        utilizationRatio = Math.min(1, currentBalanceCents / creditLimitCents);
    }

    return {
        accountId: account.id,
        accountName: account.name,
        accountType: account.type,
        category,
        currentBalanceCents,
        creditLimitCents,
        utilizationRatio,
        interestRateBps,
        minimumPaymentCents,
        scheduledPaymentCents,
        statementBalanceCents,
        revolvingBalanceCents,
    };
}

// ── Aggregate helpers ─────────────────────────────────────────────────────────

/** Sum of balances by category. */
function sumBy(details: DebtAccountDetail[], cat: DebtCategory): number {
    return details
        .filter(d => d.category === cat)
        .reduce((sum, d) => sum + d.currentBalanceCents, 0);
}

/**
 * Weighted average rate in basis points.
 * Returns null if any account has a null rate.
 */
function weightedAvgBps(details: DebtAccountDetail[]): number | null {
    const active = details.filter(d => d.currentBalanceCents > 0);
    if (active.length === 0) return null;
    if (active.some(d => d.interestRateBps === null)) return null;

    const totalBalance = active.reduce((s, d) => s + d.currentBalanceCents, 0);
    if (totalBalance === 0) return null;

    const weighted = active.reduce(
        (s, d) => s + d.interestRateBps! * d.currentBalanceCents,
        0,
    );
    return Math.round(weighted / totalBalance);
}

/** Sum a payment field; null if ANY active debt account is missing the field. */
function sumPayments(
    details: DebtAccountDetail[],
    field: "minimumPaymentCents" | "scheduledPaymentCents",
): number | null {
    const active = details.filter(d => d.currentBalanceCents > 0);
    if (active.length === 0) return 0;
    if (active.some(d => d[field] === null)) return null;
    return active.reduce((s, d) => s + d[field]!, 0);
}

// ── Status determination ──────────────────────────────────────────────────────

function determineStatus(
    details: DebtAccountDetail[],
    dti: number | null,
): DebtHealthStatus {
    // Start at HEALTHY and escalate.
    let status = DebtHealthStatus.HEALTHY;

    const escalate = (s: DebtHealthStatus) => {
        const order = [
            DebtHealthStatus.HEALTHY,
            DebtHealthStatus.WATCH,
            DebtHealthStatus.AT_RISK,
            DebtHealthStatus.CRITICAL,
        ];
        if (order.indexOf(s) > order.indexOf(status)) status = s;
    };

    // DTI thresholds
    if (dti !== null) {
        if (dti > 0.43) escalate(DebtHealthStatus.CRITICAL);
        else if (dti > 0.36) escalate(DebtHealthStatus.AT_RISK);
        else if (dti > 0.28) escalate(DebtHealthStatus.WATCH);
    }

    // Per-card revolving utilisation
    for (const d of details) {
        if (d.category !== DebtCategory.REVOLVING) continue;
        const util = d.utilizationRatio;
        if (util === null) continue;
        if (util > 0.75) escalate(DebtHealthStatus.CRITICAL);
        else if (util > 0.50) escalate(DebtHealthStatus.AT_RISK);
        else if (util > 0.30) escalate(DebtHealthStatus.WATCH);
    }

    // Any revolving balance with unknown utilisation → WATCH at minimum
    const hasRevolvingDebt = details.some(
        d => d.category === DebtCategory.REVOLVING && d.revolvingBalanceCents !== null && d.revolvingBalanceCents > 0,
    );
    if (hasRevolvingDebt) escalate(DebtHealthStatus.WATCH);

    return status;
}

// ── Observations ──────────────────────────────────────────────────────────────

function buildObservations(
    details: DebtAccountDetail[],
    totalDebt: number,
    weightedRate: number | null,
    dti: number | null,
): DebtObservation[] {
    const obs: DebtObservation[] = [];

    // No debt at all
    if (totalDebt === 0) {
        obs.push({ code: "NO_DEBT", message: "Your household carries no outstanding debt." });
        return obs;
    }

    // Revolving credit-card balance
    const revolving = details.filter(d => d.category === DebtCategory.REVOLVING);
    const knownRevolvingTotal = revolving
        .filter(d => d.revolvingBalanceCents !== null)
        .reduce((s, d) => s + d.revolvingBalanceCents!, 0);

    if (revolving.length > 0) {
        if (knownRevolvingTotal === 0 && revolving.every(d => d.revolvingBalanceCents !== null)) {
            obs.push({
                code: "NO_REVOLVING_BALANCE",
                message: "Your household has no revolving credit-card balance.",
            });
        } else if (knownRevolvingTotal > 0) {
            obs.push({
                code: "REVOLVING_BALANCE",
                message: `Your household is carrying a revolving credit-card balance of ${dollars(knownRevolvingTotal)}.`,
            });
        } else {
            // Some cards have null revolving balance — data insufficient
            obs.push({
                code: "REVOLVING_BALANCE_UNKNOWN",
                message: "Revolving credit-card balance status is Unknown — statement balance is not sufficient to determine what portion is being carried.",
            });
        }
    }

    // High utilisation per card
    for (const d of revolving) {
        if (d.utilizationRatio !== null && d.utilizationRatio > 0.50) {
            obs.push({
                code: "HIGH_UTILISATION",
                message: `${d.accountName} has a credit utilisation of ${Math.round(d.utilizationRatio * 100)}%, which is above 50%.`,
            });
        }
    }

    // APR disparity: credit card APR materially higher than non-revolving debt
    const cardRates = revolving.filter(d => d.interestRateBps !== null).map(d => d.interestRateBps!);
    const otherRates = details
        .filter(d => d.category !== DebtCategory.REVOLVING && d.interestRateBps !== null)
        .map(d => d.interestRateBps!);

    if (cardRates.length > 0 && otherRates.length > 0) {
        const maxCardRate = Math.max(...cardRates);
        const maxOtherRate = Math.max(...otherRates);
        // "materially higher" = >500 bps (5 pp) above the highest other debt rate
        if (maxCardRate - maxOtherRate > 500) {
            obs.push({
                code: "HIGH_CARD_APR",
                message: `Your credit-card APR (${bpsToPercent(maxCardRate)}) is materially higher than your other debts (up to ${bpsToPercent(maxOtherRate)}).`,
            });
        }
    }

    // DTI observation
    if (dti !== null) {
        obs.push({
            code: "DTI_RATIO",
            message: `Your monthly debt payments represent ${Math.round(dti * 100)}% of your gross monthly income.`,
        });
    } else if (totalDebt > 0) {
        obs.push({
            code: "DTI_UNKNOWN",
            message: "Debt-to-income ratio is Unknown — income or scheduled payment data is not available.",
        });
    }

    // Weighted rate observation (only when we have it)
    if (weightedRate !== null) {
        obs.push({
            code: "WEIGHTED_RATE",
            message: `Your weighted average interest rate across all debts is ${bpsToPercent(weightedRate)}.`,
        });
    }

    return obs;
}

// ── Status description ────────────────────────────────────────────────────────

function buildStatusDescription(
    status: DebtHealthStatus,
    totalDebt: number,
    dti: number | null,
    details: DebtAccountDetail[],
): string {
    if (totalDebt === 0) return "Your household carries no outstanding debt.";

    switch (status) {
        case DebtHealthStatus.HEALTHY:
            return "Your household's debt position appears manageable with no high-risk indicators.";
        case DebtHealthStatus.WATCH: {
            const util = details.find(
                d => d.category === DebtCategory.REVOLVING && d.utilizationRatio !== null && d.utilizationRatio > 0.30,
            );
            if (util) {
                return `One or more credit cards has utilisation above 30%. Your total outstanding debt is ${dollars(totalDebt)}.`;
            }
            if (dti !== null) {
                return `Your monthly debt payments represent ${Math.round(dti * 100)}% of gross income, which is above the 28% threshold.`;
            }
            return `Your household's debt position warrants monitoring. Total outstanding debt is ${dollars(totalDebt)}.`;
        }
        case DebtHealthStatus.AT_RISK: {
            const high = details.find(
                d => d.category === DebtCategory.REVOLVING && d.utilizationRatio !== null && d.utilizationRatio > 0.50,
            );
            if (high) {
                return `${high.accountName} has credit utilisation above 50%, which may affect credit health. Total debt: ${dollars(totalDebt)}.`;
            }
            if (dti !== null) {
                return `Monthly debt payments are ${Math.round(dti * 100)}% of gross income, above the 36% threshold. Total debt: ${dollars(totalDebt)}.`;
            }
            return `Your household's debt position indicates elevated risk. Total outstanding debt is ${dollars(totalDebt)}.`;
        }
        case DebtHealthStatus.CRITICAL: {
            const critical = details.find(
                d => d.category === DebtCategory.REVOLVING && d.utilizationRatio !== null && d.utilizationRatio > 0.75,
            );
            if (critical) {
                return `${critical.accountName} has credit utilisation above 75%. Total debt: ${dollars(totalDebt)}.`;
            }
            if (dti !== null) {
                return `Monthly debt payments are ${Math.round(dti * 100)}% of gross income, above the 43% critical threshold. Total debt: ${dollars(totalDebt)}.`;
            }
            return `Your household's debt position is at a critical level. Total outstanding debt is ${dollars(totalDebt)}.`;
        }
    }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class DebtIntelligenceService {
    analyze(input: AnalyzeDebtInput): DebtAnalysis {
        const { householdId, accounts, monthlyIncomeCents, asOf } = input;

        const debtAccounts = accounts.filter(
            a => DEBT_ACCOUNT_TYPES.has(a.type) && a.status === "ACTIVE",
        );

        const details = debtAccounts.map(buildDetail);

        const totalDebtCents = details.reduce((s, d) => s + d.currentBalanceCents, 0);
        const revolvingDebtCents = sumBy(details, DebtCategory.REVOLVING);
        const installmentDebtCents = sumBy(details, DebtCategory.INSTALLMENT);
        const mortgageDebtCents = sumBy(details, DebtCategory.MORTGAGE);

        const totalMinimumPaymentCents = sumPayments(details, "minimumPaymentCents");
        const totalScheduledPaymentCents = sumPayments(details, "scheduledPaymentCents");
        const weightedAverageRateBps = weightedAvgBps(details);

        // DTI uses scheduled payments when available, else minimum payments, else null
        const paymentForDti = totalScheduledPaymentCents ?? totalMinimumPaymentCents;
        const debtToIncomeRatio =
            paymentForDti !== null && monthlyIncomeCents > 0
                ? paymentForDti / monthlyIncomeCents
                : null;

        const status = determineStatus(details, debtToIncomeRatio);
        const statusDescription = buildStatusDescription(status, totalDebtCents, debtToIncomeRatio, details);
        const observations = buildObservations(details, totalDebtCents, weightedAverageRateBps, debtToIncomeRatio);

        return {
            householdId,
            asOf,
            calculationVersion: DEBT_INTELLIGENCE_VERSION,
            totalDebtCents,
            revolvingDebtCents,
            installmentDebtCents,
            mortgageDebtCents,
            totalMinimumPaymentCents,
            totalScheduledPaymentCents,
            weightedAverageRateBps,
            debtToIncomeRatio,
            status,
            statusDescription,
            accounts: details,
            observations,
        };
    }
}

export function createDebtIntelligenceService(): DebtIntelligenceService {
    return new DebtIntelligenceService();
}
