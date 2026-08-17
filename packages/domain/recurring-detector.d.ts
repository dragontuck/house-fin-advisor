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
import { RecurringPattern } from "@house-fin/contracts";
export declare const RECURRING_CALCULATION_VERSION = 1;
/** Minimal transaction shape required by the recurring detector. */
export interface CashFlowTransaction {
    id: string;
    transactionDate: Date;
    /** DB convention: positive for DEBIT, negative for CREDIT */
    amountCents: number;
    direction: "DEBIT" | "CREDIT";
    merchant: string;
    category: string | null;
    accountId: string;
}
export declare class RecurringDetector {
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
    detectPatterns(transactions: CashFlowTransaction[], asOf?: Date): RecurringPattern[];
}
export declare function createRecurringDetector(): RecurringDetector;
//# sourceMappingURL=recurring-detector.d.ts.map