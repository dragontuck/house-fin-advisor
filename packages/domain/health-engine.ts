/**
 * HealthEngine — deterministic household financial health and attention analysis.
 *
 * Rules (HEALTH_ENGINE_VERSION = 1):
 *
 *  CRITICAL (any one of):
 *   - Monthly surplus is negative AND liquid cash covers < 1 month of essential expenses
 *   - Emergency fund coverage < 1 month (when essential expenses > 0)
 *   - Debt status is CRITICAL
 *
 *  AT_RISK (any one of):
 *   - Monthly surplus is negative
 *   - Emergency fund coverage < minimumCoverageMonths
 *   - Any budgeted category is over-budget by > 50%
 *   - Debt status is AT_RISK
 *
 *  WATCH (any one of):
 *   - Monthly surplus is positive but < 10% of monthly income
 *   - Emergency fund coverage < targetCoverageMonths (but >= minimum)
 *   - Any budgeted category is over-budget by > 20%
 *   - Debt status is WATCH
 *   - One or more goals are in BEHIND or AT_RISK status
 *
 *  HEALTHY:
 *   - None of the above triggered
 *
 * The overall status is the worst-case across all triggered rules.
 *
 * Attention items are factual condition descriptions — no recommendations.
 * They are generated deterministically; the same inputs always yield the same items.
 * DATA_STALE fires when lastTransactionDate is null or > 30 days before asOf.
 */

import {
    EntityId,
    FinancialHealthStatus,
    DebtHealthStatus,
    GoalStatus,
    AttentionItem,
    AttentionItemType,
    AttentionSeverity,
    AttentionItemStatus,
    AttentionItemMetric,
    HealthFactor,
    HealthAnalysis,
} from "@house-fin/contracts";

export const HEALTH_ENGINE_VERSION = 1;

/** Days of inactivity before a DATA_STALE item is emitted. */
const STALE_DAYS = 30;

/** Monthly surplus threshold below which WATCH fires (10% of income). */
const WATCH_SURPLUS_RATIO = 0.10;

/** Budget over-percentage thresholds. */
const BUDGET_WARN_PCT = 20;
const BUDGET_RISK_PCT = 50;

export interface OverBudgetEntry {
    category: string;
    varianceCents: number;
    /** Positive percentage, e.g. 35 means 35% over. */
    variancePercent: number;
}

export interface GoalSummary {
    goalId: EntityId;
    name: string;
    status: GoalStatus;
    percentComplete: number;
    targetDate: Date | null;
}

export interface RecurringChangeEntry {
    merchant: string;
    previousAmountCents: number;
    currentAmountCents: number;
    /** Positive = increase, negative = decrease (percent of previous). */
    changePercent: number;
}

export interface HealthEngineInput {
    householdId: EntityId;
    asOf: Date;

    // ── Cash flow ─────────────────────────────────────────────────────────────
    /** Positive = surplus, negative = deficit. */
    monthlySurplusCents: number;
    /** 0 when income is unknown. */
    monthlyIncomeCents: number;
    liquidCashCents: number;
    essentialMonthlyExpensesCents: number;

    // ── Emergency fund ────────────────────────────────────────────────────────
    /** null when essential expenses are zero or unknown. */
    emergencyFundCoverageMonths: number | null;
    emergencyFundMinimumMonths: number;
    emergencyFundTargetMonths: number;

    // ── Debt ──────────────────────────────────────────────────────────────────
    debtStatus: DebtHealthStatus;
    revolvingDebtCents: number;
    /** null when no prior period data. */
    previousRevolvingDebtCents: number | null;

    // ── Budget ────────────────────────────────────────────────────────────────
    overBudgetResults: OverBudgetEntry[];

    // ── Goals ─────────────────────────────────────────────────────────────────
    goalResults: GoalSummary[];

    // ── Data freshness ────────────────────────────────────────────────────────
    /** null when no transactions have ever been recorded. */
    lastTransactionDate: Date | null;

    // ── Recurring changes ─────────────────────────────────────────────────────
    recurringExpenseChanges: RecurringChangeEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dollars(cents: number): string {
    return "$" + Math.abs(Math.round(cents / 100)).toLocaleString("en-US");
}

function pct(n: number): string {
    return Math.round(n) + "%";
}

/** Build a deterministic EntityId for an attention item. */
function attentionId(householdId: string, type: AttentionItemType, key: string): EntityId {
    return `${householdId}::${type}::${key}` as EntityId;
}

function item(
    householdId: EntityId,
    asOf: Date,
    type: AttentionItemType,
    key: string,
    severity: AttentionSeverity,
    title: string,
    explanation: string,
    metric: AttentionItemMetric,
    source: string,
): AttentionItem {
    return {
        id: attentionId(householdId, type, key),
        householdId,
        severity,
        type,
        title,
        explanation,
        metric,
        source,
        createdAt: asOf,
        status: AttentionItemStatus.ACTIVE,
        dismissedAt: null,
        resolvedAt: null,
    };
}

// ── Status severity ordering ──────────────────────────────────────────────────

const STATUS_ORDER = [
    FinancialHealthStatus.HEALTHY,
    FinancialHealthStatus.WATCH,
    FinancialHealthStatus.AT_RISK,
    FinancialHealthStatus.CRITICAL,
];

function escalate(current: FinancialHealthStatus, next: FinancialHealthStatus): FinancialHealthStatus {
    return STATUS_ORDER.indexOf(next) > STATUS_ORDER.indexOf(current) ? next : current;
}

// ── Rule evaluators ───────────────────────────────────────────────────────────

function evalCashFlow(input: HealthEngineInput, items: AttentionItem[], factors: HealthFactor[]): FinancialHealthStatus {
    let status = FinancialHealthStatus.HEALTHY;
    const { monthlySurplusCents, monthlyIncomeCents, liquidCashCents, essentialMonthlyExpensesCents, householdId, asOf } = input;

    // CRITICAL: negative surplus AND cash < 1 month of essential expenses
    if (
        monthlySurplusCents < 0 &&
        essentialMonthlyExpensesCents > 0 &&
        liquidCashCents < essentialMonthlyExpensesCents
    ) {
        status = escalate(status, FinancialHealthStatus.CRITICAL);
        items.push(item(
            householdId, asOf,
            AttentionItemType.CASH_FLOW_WARNING, "deficit-critical",
            AttentionSeverity.CRITICAL,
            "Cash flow deficit with less than one month of reserves",
            `Monthly spending exceeds income by ${dollars(Math.abs(monthlySurplusCents))} and liquid cash covers less than one month of essential expenses.`,
            { label: "Monthly Surplus", value: Math.round(monthlySurplusCents / 100), unit: "dollars" },
            "cash-flow",
        ));
        factors.push({ rule: "CASH_FLOW_CRITICAL", triggered: true, severity: AttentionSeverity.CRITICAL, detail: `Surplus ${dollars(monthlySurplusCents)}, cash covers < 1 month` });
        return status;
    }

    // AT_RISK: negative surplus (but cash may still be OK)
    if (monthlySurplusCents < 0) {
        status = escalate(status, FinancialHealthStatus.AT_RISK);
        items.push(item(
            householdId, asOf,
            AttentionItemType.CASH_FLOW_WARNING, "deficit",
            AttentionSeverity.WARNING,
            "Monthly spending exceeds income",
            `Monthly spending exceeds income by ${dollars(Math.abs(monthlySurplusCents))}.`,
            { label: "Monthly Deficit", value: Math.round(Math.abs(monthlySurplusCents) / 100), unit: "dollars" },
            "cash-flow",
        ));
        factors.push({ rule: "CASH_FLOW_DEFICIT", triggered: true, severity: AttentionSeverity.WARNING, detail: `Deficit ${dollars(monthlySurplusCents)}` });
        return status;
    }

    // WATCH: surplus positive but < 10% of income
    if (monthlyIncomeCents > 0 && monthlySurplusCents < monthlyIncomeCents * WATCH_SURPLUS_RATIO) {
        status = escalate(status, FinancialHealthStatus.WATCH);
        const surplusPct = Math.round((monthlySurplusCents / monthlyIncomeCents) * 100);
        items.push(item(
            householdId, asOf,
            AttentionItemType.CASH_FLOW_WARNING, "tight",
            AttentionSeverity.INFO,
            "Monthly surplus is below 10% of income",
            `Monthly surplus is ${dollars(monthlySurplusCents)} (${surplusPct}% of income).`,
            { label: "Surplus % of Income", value: surplusPct, unit: "percent" },
            "cash-flow",
        ));
        factors.push({ rule: "CASH_FLOW_TIGHT", triggered: true, severity: AttentionSeverity.INFO, detail: `Surplus ${surplusPct}% of income` });
    } else {
        factors.push({ rule: "CASH_FLOW_TIGHT", triggered: false, severity: null, detail: `Surplus ${dollars(monthlySurplusCents)}` });
    }

    return status;
}

function evalEmergencyFund(input: HealthEngineInput, items: AttentionItem[], factors: HealthFactor[]): FinancialHealthStatus {
    let status = FinancialHealthStatus.HEALTHY;
    const { emergencyFundCoverageMonths, emergencyFundMinimumMonths, emergencyFundTargetMonths, householdId, asOf } = input;

    if (emergencyFundCoverageMonths === null) {
        factors.push({ rule: "EMERGENCY_FUND", triggered: false, severity: null, detail: "Coverage unknown (no expense data)" });
        return status;
    }

    const coverage = emergencyFundCoverageMonths;

    // CRITICAL: less than 1 month (when expenses are meaningful)
    if (coverage < 1 && input.essentialMonthlyExpensesCents > 0) {
        status = escalate(status, FinancialHealthStatus.CRITICAL);
        items.push(item(
            householdId, asOf,
            AttentionItemType.EMERGENCY_FUND_LOW, "critical",
            AttentionSeverity.CRITICAL,
            "Emergency fund covers less than one month of expenses",
            `Emergency savings covers approximately ${coverage.toFixed(1)} months of essential expenses.`,
            { label: "Coverage Months", value: parseFloat(coverage.toFixed(1)), unit: "months" },
            "emergency-fund",
        ));
        factors.push({ rule: "EMERGENCY_FUND_CRITICAL", triggered: true, severity: AttentionSeverity.CRITICAL, detail: `${coverage.toFixed(1)} months (< 1)` });
        return status;
    }

    // AT_RISK: below minimum
    if (coverage < emergencyFundMinimumMonths) {
        status = escalate(status, FinancialHealthStatus.AT_RISK);
        items.push(item(
            householdId, asOf,
            AttentionItemType.EMERGENCY_FUND_LOW, "below-minimum",
            AttentionSeverity.WARNING,
            `Emergency fund is below the ${emergencyFundMinimumMonths}-month minimum`,
            `Emergency savings covers ${coverage.toFixed(1)} months of essential expenses, below the household minimum of ${emergencyFundMinimumMonths} months.`,
            { label: "Coverage Months", value: parseFloat(coverage.toFixed(1)), unit: "months" },
            "emergency-fund",
        ));
        factors.push({ rule: "EMERGENCY_FUND_BELOW_MINIMUM", triggered: true, severity: AttentionSeverity.WARNING, detail: `${coverage.toFixed(1)} months < ${emergencyFundMinimumMonths}` });
        return status;
    }

    // WATCH: below target
    if (coverage < emergencyFundTargetMonths) {
        status = escalate(status, FinancialHealthStatus.WATCH);
        items.push(item(
            householdId, asOf,
            AttentionItemType.EMERGENCY_FUND_LOW, "below-target",
            AttentionSeverity.INFO,
            `Emergency fund is below the ${emergencyFundTargetMonths}-month target`,
            `Emergency savings covers ${coverage.toFixed(1)} months of essential expenses, below the ${emergencyFundTargetMonths}-month preferred target.`,
            { label: "Coverage Months", value: parseFloat(coverage.toFixed(1)), unit: "months" },
            "emergency-fund",
        ));
        factors.push({ rule: "EMERGENCY_FUND_BELOW_TARGET", triggered: true, severity: AttentionSeverity.INFO, detail: `${coverage.toFixed(1)} months < ${emergencyFundTargetMonths}` });
    } else {
        factors.push({ rule: "EMERGENCY_FUND_BELOW_TARGET", triggered: false, severity: null, detail: `${coverage.toFixed(1)} months >= ${emergencyFundTargetMonths}` });
    }

    return status;
}

function evalDebt(input: HealthEngineInput, items: AttentionItem[], factors: HealthFactor[]): FinancialHealthStatus {
    const { debtStatus, revolvingDebtCents, previousRevolvingDebtCents, householdId, asOf } = input;

    let status: FinancialHealthStatus;
    switch (debtStatus) {
        case DebtHealthStatus.CRITICAL:
            status = FinancialHealthStatus.CRITICAL;
            break;
        case DebtHealthStatus.AT_RISK:
            status = FinancialHealthStatus.AT_RISK;
            break;
        case DebtHealthStatus.WATCH:
            status = FinancialHealthStatus.WATCH;
            break;
        default:
            status = FinancialHealthStatus.HEALTHY;
    }

    factors.push({
        rule: "DEBT_STATUS",
        triggered: debtStatus !== DebtHealthStatus.HEALTHY,
        severity: debtStatus === DebtHealthStatus.CRITICAL ? AttentionSeverity.CRITICAL
            : debtStatus === DebtHealthStatus.AT_RISK ? AttentionSeverity.WARNING
                : debtStatus === DebtHealthStatus.WATCH ? AttentionSeverity.INFO
                    : null,
        detail: debtStatus,
    });

    // DEBT_INCREASE: revolving balance grew vs prior period
    if (
        previousRevolvingDebtCents !== null &&
        revolvingDebtCents > previousRevolvingDebtCents
    ) {
        const increaseCents = revolvingDebtCents - previousRevolvingDebtCents;
        items.push(item(
            householdId, asOf,
            AttentionItemType.DEBT_INCREASE, "revolving",
            AttentionSeverity.INFO,
            "Revolving credit-card balance increased",
            `Your revolving debt increased by ${dollars(increaseCents)} compared to the prior period.`,
            { label: "Balance Increase", value: Math.round(increaseCents / 100), unit: "dollars" },
            "debt",
        ));
        factors.push({ rule: "DEBT_INCREASE", triggered: true, severity: AttentionSeverity.INFO, detail: `+${dollars(increaseCents)}` });
    } else {
        factors.push({ rule: "DEBT_INCREASE", triggered: false, severity: null, detail: previousRevolvingDebtCents === null ? "no prior data" : "no increase" });
    }

    return status;
}

function evalBudget(input: HealthEngineInput, items: AttentionItem[], factors: HealthFactor[]): FinancialHealthStatus {
    let status = FinancialHealthStatus.HEALTHY;
    const { overBudgetResults, householdId, asOf } = input;

    let hasRisk = false;
    let hasWatch = false;

    for (const entry of overBudgetResults) {
        if (entry.variancePercent > BUDGET_RISK_PCT) {
            hasRisk = true;
            status = escalate(status, FinancialHealthStatus.AT_RISK);
            items.push(item(
                householdId, asOf,
                AttentionItemType.BUDGET_OVER, entry.category,
                AttentionSeverity.WARNING,
                `${entry.category} spending is ${pct(entry.variancePercent)} over budget`,
                `${entry.category} spending is ${dollars(entry.varianceCents)} (${pct(entry.variancePercent)}) above budget.`,
                { label: "Over Budget", value: Math.round(entry.varianceCents / 100), unit: "dollars" },
                "budget",
            ));
        } else if (entry.variancePercent > BUDGET_WARN_PCT) {
            hasWatch = true;
            status = escalate(status, FinancialHealthStatus.WATCH);
            items.push(item(
                householdId, asOf,
                AttentionItemType.BUDGET_OVER, entry.category,
                AttentionSeverity.INFO,
                `${entry.category} spending is ${pct(entry.variancePercent)} over budget`,
                `${entry.category} spending is ${dollars(entry.varianceCents)} (${pct(entry.variancePercent)}) above budget.`,
                { label: "Over Budget", value: Math.round(entry.varianceCents / 100), unit: "dollars" },
                "budget",
            ));
        }
    }

    factors.push({
        rule: "BUDGET_OVER",
        triggered: hasRisk || hasWatch,
        severity: hasRisk ? AttentionSeverity.WARNING : hasWatch ? AttentionSeverity.INFO : null,
        detail: overBudgetResults.length === 0 ? "no over-budget categories" : `${overBudgetResults.length} over-budget`,
    });

    return status;
}

function evalGoals(input: HealthEngineInput, items: AttentionItem[], factors: HealthFactor[]): FinancialHealthStatus {
    let status = FinancialHealthStatus.HEALTHY;
    const { goalResults, householdId, asOf } = input;

    let triggered = false;

    for (const g of goalResults) {
        if (g.status === GoalStatus.BEHIND || g.status === GoalStatus.AT_RISK) {
            triggered = true;
            status = escalate(status, FinancialHealthStatus.WATCH);
            const isAtRisk = g.status === GoalStatus.AT_RISK;
            items.push(item(
                householdId, asOf,
                AttentionItemType.GOAL_BEHIND, g.goalId,
                isAtRisk ? AttentionSeverity.WARNING : AttentionSeverity.INFO,
                `Goal "${g.name}" is ${g.status === GoalStatus.AT_RISK ? "at risk" : "behind schedule"}`,
                `"${g.name}" is ${g.percentComplete.toFixed(1)}% complete and is ${g.status === GoalStatus.AT_RISK ? "at risk of missing its target" : "behind its projected schedule"}.`,
                { label: "Percent Complete", value: g.percentComplete, unit: "percent" },
                "goals",
            ));
        }
    }

    factors.push({
        rule: "GOAL_BEHIND",
        triggered,
        severity: triggered ? AttentionSeverity.INFO : null,
        detail: triggered ? `${goalResults.filter(g => g.status === GoalStatus.BEHIND || g.status === GoalStatus.AT_RISK).length} goal(s) behind/at-risk` : "all goals on track",
    });

    return status;
}

function evalDataFreshness(input: HealthEngineInput, items: AttentionItem[], factors: HealthFactor[]): FinancialHealthStatus {
    const { lastTransactionDate, householdId, asOf } = input;

    const stale =
        lastTransactionDate === null ||
        (asOf.getTime() - lastTransactionDate.getTime()) > STALE_DAYS * 24 * 60 * 60 * 1000;

    if (stale) {
        const daysSince = lastTransactionDate
            ? Math.floor((asOf.getTime() - lastTransactionDate.getTime()) / (24 * 60 * 60 * 1000))
            : null;
        items.push(item(
            householdId, asOf,
            AttentionItemType.DATA_STALE, "transactions",
            AttentionSeverity.INFO,
            lastTransactionDate === null ? "No transaction data available" : `No transactions recorded in ${daysSince} days`,
            lastTransactionDate === null
                ? "No transactions have been imported yet."
                : `The most recent transaction was recorded ${daysSince} days ago.`,
            { label: "Days Since Last Transaction", value: daysSince ?? 0, unit: "days" },
            "data",
        ));
        factors.push({ rule: "DATA_STALE", triggered: true, severity: AttentionSeverity.INFO, detail: lastTransactionDate === null ? "no data" : `${daysSince} days` });
    } else {
        factors.push({ rule: "DATA_STALE", triggered: false, severity: null, detail: "data is current" });
    }

    // DATA_STALE does not affect financial health status
    return FinancialHealthStatus.HEALTHY;
}

function evalRecurringChanges(input: HealthEngineInput, items: AttentionItem[], factors: HealthFactor[]): FinancialHealthStatus {
    const { recurringExpenseChanges, householdId, asOf } = input;

    let triggered = false;
    for (const c of recurringExpenseChanges) {
        triggered = true;
        const direction = c.changePercent > 0 ? "increased" : "decreased";
        items.push(item(
            householdId, asOf,
            AttentionItemType.RECURRING_EXPENSE_CHANGE, c.merchant,
            AttentionSeverity.INFO,
            `Recurring expense for "${c.merchant}" ${direction}`,
            `The recurring charge from "${c.merchant}" ${direction} by ${pct(Math.abs(c.changePercent))} (from ${dollars(c.previousAmountCents)} to ${dollars(c.currentAmountCents)}).`,
            { label: "Change Amount", value: Math.round(Math.abs(c.currentAmountCents - c.previousAmountCents) / 100), unit: "dollars" },
            "recurring",
        ));
    }

    factors.push({
        rule: "RECURRING_EXPENSE_CHANGE",
        triggered,
        severity: triggered ? AttentionSeverity.INFO : null,
        detail: triggered ? `${recurringExpenseChanges.length} change(s)` : "no changes detected",
    });

    return FinancialHealthStatus.HEALTHY;
}

// ── Status description ────────────────────────────────────────────────────────

function buildStatusDescription(status: FinancialHealthStatus, items: AttentionItem[]): string {
    const count = items.filter(i => i.severity !== AttentionSeverity.INFO).length;
    switch (status) {
        case FinancialHealthStatus.CRITICAL:
            return "Your household's financial position requires immediate attention.";
        case FinancialHealthStatus.AT_RISK:
            return `Your household's finances show ${count === 1 ? "one concern" : `${count} concerns`} that warrant attention.`;
        case FinancialHealthStatus.WATCH:
            return `Your household's finances are stable with ${items.length === 1 ? "one item" : `${items.length} items`} to monitor.`;
        case FinancialHealthStatus.HEALTHY:
            return "Your household's financial position looks healthy.";
    }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class HealthEngine {
    analyze(input: HealthEngineInput): HealthAnalysis {
        const items: AttentionItem[] = [];
        const factors: HealthFactor[] = [];

        let status = FinancialHealthStatus.HEALTHY;
        status = escalate(status, evalCashFlow(input, items, factors));
        status = escalate(status, evalEmergencyFund(input, items, factors));
        status = escalate(status, evalDebt(input, items, factors));
        status = escalate(status, evalBudget(input, items, factors));
        status = escalate(status, evalGoals(input, items, factors));
        evalDataFreshness(input, items, factors);
        evalRecurringChanges(input, items, factors);

        return {
            householdId: input.householdId,
            asOf: input.asOf,
            calculationVersion: HEALTH_ENGINE_VERSION,
            status,
            statusDescription: buildStatusDescription(status, items),
            factors,
            attentionItems: items,
        };
    }
}

export function createHealthEngine(): HealthEngine {
    return new HealthEngine();
}
