"use strict";
/**
 * RecurringDetector — deterministic recurring-transaction pattern detector.
 *
 * Signals used:
 *  - Merchant similarity (normalized name stripping noise tokens)
 *  - Amount consistency (median + variance)
 *  - Transaction frequency (gap analysis)
 *  - Date spacing (gap regularity score)
 *  - Account (grouped per account — a payee switching accounts splits the pattern)
 *  - Transaction direction (income vs expense are always separate patterns)
 *
 * Classification:
 *  WEEKLY (5–9 d) | BIWEEKLY (12–16 d) | MONTHLY (25–35 d) |
 *  QUARTERLY (85–97 d) | ANNUAL (350–380 d) | IRREGULAR | UNKNOWN
 *
 * UNKNOWN is used when only 2 occurrences exist and the single gap does not
 * match any known frequency window — not enough evidence to name the period.
 * IRREGULAR is used when 3+ occurrences exist but the timing is clearly
 * inconsistent or falls outside all known frequency windows.
 *
 * A pattern is an observation, not a financial obligation.
 * MIN_OCCURRENCES = 2; patterns below MIN_CONFIDENCE_THRESHOLD are suppressed.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecurringDetector = exports.RECURRING_CALCULATION_VERSION = void 0;
exports.createRecurringDetector = createRecurringDetector;
const contracts_1 = require("@house-fin/contracts");
exports.RECURRING_CALCULATION_VERSION = 1;
const MIN_OCCURRENCES = 2;
const MIN_CONFIDENCE_THRESHOLD = 0.35;
// ── Merchant normalisation ────────────────────────────────────────────────────
// Strips internet domain suffixes (must run before other transforms)
const RE_DOMAIN_EXT = /\.(com|net|org|io|co|gov)\b/gi;
// Strips reference/transaction IDs: trailing "# 12345", "* 9876", or bare 4+ digit run
const RE_REF_ID = /\s*[#*]\s*\d+|\s+\d{4,}(?:\s|$)/g;
// Strips common legal entity suffixes (whole word only)
const RE_LEGAL = /\b(inc|llc|corp|co|ltd|plc)\b\.?/gi;
// Strips non-alpha after all above transforms
const RE_NON_ALPHA = /[^a-z\s]/g;
function normalizeMerchant(raw) {
    return raw
        .toLowerCase()
        .replace(RE_DOMAIN_EXT, " ")
        .replace(RE_REF_ID, " ")
        .replace(RE_LEGAL, " ")
        .replace(RE_NON_ALPHA, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
}
// ── Statistical helpers ───────────────────────────────────────────────────────
function median(values) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}
function mean(values) {
    if (values.length === 0)
        return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
}
function gapDays(earlier, later) {
    return Math.round((later.getTime() - earlier.getTime()) / 86400000);
}
function amountVariancePct(amounts) {
    if (amounts.length < 2)
        return 0;
    const med = median(amounts);
    if (med === 0)
        return 0;
    return Math.max(...amounts.map(a => Math.abs(a - med))) / med;
}
// ── Frequency classification ──────────────────────────────────────────────────
function classifyFrequency(medianGap, occurrenceCount) {
    if (medianGap >= 5 && medianGap <= 9)
        return contracts_1.RecurringFrequency.WEEKLY;
    if (medianGap >= 12 && medianGap <= 16)
        return contracts_1.RecurringFrequency.BIWEEKLY;
    if (medianGap >= 25 && medianGap <= 35)
        return contracts_1.RecurringFrequency.MONTHLY;
    if (medianGap >= 85 && medianGap <= 97)
        return contracts_1.RecurringFrequency.QUARTERLY;
    if (medianGap >= 350 && medianGap <= 380)
        return contracts_1.RecurringFrequency.ANNUAL;
    // Only 2 occurrences → 1 gap; not enough evidence to call it irregular
    if (occurrenceCount === 2)
        return contracts_1.RecurringFrequency.UNKNOWN;
    return contracts_1.RecurringFrequency.IRREGULAR;
}
function nominalGapDays(freq) {
    switch (freq) {
        case contracts_1.RecurringFrequency.WEEKLY: return 7;
        case contracts_1.RecurringFrequency.BIWEEKLY: return 14;
        case contracts_1.RecurringFrequency.MONTHLY: return 30;
        case contracts_1.RecurringFrequency.QUARTERLY: return 91;
        case contracts_1.RecurringFrequency.ANNUAL: return 365;
        default: return null;
    }
}
// ── Confidence scoring ────────────────────────────────────────────────────────
function calcConfidence(occurrences, gaps, amounts, frequency) {
    // Base: 2 occurrences → 0.30; each additional occurrence adds 0.10, capped at 0.55
    let score = Math.min(0.30 + (occurrences - 2) * 0.10, 0.55);
    // Amount consistency bonus
    const amtVar = amountVariancePct(amounts);
    if (amtVar < 0.05)
        score += 0.25;
    else if (amtVar < 0.20)
        score += 0.10;
    // Gap regularity bonus (requires at least 2 gaps to evaluate)
    if (gaps.length >= 2) {
        const medGap = median(gaps);
        if (medGap > 0) {
            const maxGapDev = Math.max(...gaps.map(g => Math.abs(g - medGap))) / medGap;
            if (maxGapDev < 0.15)
                score += 0.20;
            else if (maxGapDev < 0.30)
                score += 0.10;
        }
    }
    // Unpredictable patterns — confidence cap prevents overstatement
    if (frequency === contracts_1.RecurringFrequency.IRREGULAR)
        score = Math.min(score, 0.40);
    if (frequency === contracts_1.RecurringFrequency.UNKNOWN)
        score = Math.min(score, 0.50);
    return Math.min(score, 1.0);
}
// ── Next-date estimation ──────────────────────────────────────────────────────
function estimateNextDate(lastSeen, frequency, asOf) {
    const gap = nominalGapDays(frequency);
    if (!gap)
        return null;
    let next = new Date(lastSeen.getTime() + gap * 86400000);
    // Advance past asOf so the result is always in the future
    while (next <= asOf) {
        next = new Date(next.getTime() + gap * 86400000);
    }
    return next;
}
// ── Category helper ───────────────────────────────────────────────────────────
function mostCommonCategory(txs) {
    const counts = new Map();
    for (const tx of txs) {
        if (tx.category)
            counts.set(tx.category, (counts.get(tx.category) ?? 0) + 1);
    }
    if (counts.size === 0)
        return null;
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
// ── Public API ────────────────────────────────────────────────────────────────
class RecurringDetector {
    /**
     * Analyse a transaction history and return detected recurring patterns.
     *
     * Patterns are grouped by normalised merchant name + transaction direction +
     * account. Each group is analysed independently. Groups with fewer than
     * MIN_OCCURRENCES occurrences or confidence below MIN_CONFIDENCE_THRESHOLD
     * are excluded from the result set.
     *
     * @param transactions - Transaction history (typically 6–12 months)
     * @param asOf - Reference date for next-occurrence estimation
     */
    detectPatterns(transactions, asOf = new Date()) {
        // Group by (normalised merchant, direction, accountId)
        const groups = new Map();
        for (const tx of transactions) {
            const key = `${normalizeMerchant(tx.merchant)}||${tx.direction}||${tx.accountId}`;
            const bucket = groups.get(key);
            if (bucket)
                bucket.push(tx);
            else
                groups.set(key, [tx]);
        }
        const patterns = [];
        for (const txs of groups.values()) {
            if (txs.length < MIN_OCCURRENCES)
                continue;
            const sorted = [...txs].sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime());
            const gaps = [];
            for (let i = 1; i < sorted.length; i++) {
                gaps.push(gapDays(sorted[i - 1].transactionDate, sorted[i].transactionDate));
            }
            // Absolute values — CREDIT transactions have negative amountCents by convention
            const amounts = sorted.map(tx => Math.abs(tx.amountCents));
            const medGap = median(gaps);
            const frequency = classifyFrequency(medGap, sorted.length);
            const confidence = calcConfidence(sorted.length, gaps, amounts, frequency);
            if (confidence < MIN_CONFIDENCE_THRESHOLD)
                continue;
            const last = sorted[sorted.length - 1];
            patterns.push({
                merchant: sorted[0].merchant,
                direction: sorted[0].direction,
                frequency,
                typicalAmountCents: Math.round(median(amounts)),
                averageAmountCents: Math.round(mean(amounts)),
                amountVariancePct: amountVariancePct(amounts),
                confidence,
                occurrenceCount: sorted.length,
                mostCommonCategory: mostCommonCategory(sorted),
                firstSeenDate: sorted[0].transactionDate,
                lastSeenDate: last.transactionDate,
                estimatedNextDate: estimateNextDate(last.transactionDate, frequency, asOf),
                sourceTransactionIds: sorted.map(tx => tx.id),
            });
        }
        // Deterministic order: highest confidence first; tie-break by merchant name
        return patterns.sort((a, b) => b.confidence - a.confidence || a.merchant.localeCompare(b.merchant));
    }
}
exports.RecurringDetector = RecurringDetector;
function createRecurringDetector() {
    return new RecurringDetector();
}
//# sourceMappingURL=recurring-detector.js.map