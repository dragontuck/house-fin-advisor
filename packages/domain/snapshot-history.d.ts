/**
 * Snapshot History — builds version-stamped historical views from persisted financial snapshots.
 *
 * Rule: historical values are NEVER recomputed from current rules.
 * Each SnapshotHistoryPoint carries the calculationVersion and calculatedAt of the
 * original snapshot so results remain reproducible as rules evolve.
 */
import { EntityId, FinancialSnapshot, CalculationExplanation, SnapshotHistory } from "@house-fin/contracts";
export declare const SNAPSHOT_HISTORY_VERSION = 1;
/**
 * Build full explainability for all metrics in a single snapshot.
 * Pure function — no side effects.
 */
export declare function buildSnapshotExplanation(snapshot: FinancialSnapshot): {
    income: CalculationExplanation;
    expenses: CalculationExplanation;
    surplus: CalculationExplanation;
    debt: CalculationExplanation;
};
/**
 * Build a version-stamped history from an array of persisted snapshots.
 *
 * - One point per calendar month; when multiple snapshots share a month the
 *   most recently calculated one wins.
 * - Result is sorted ascending by period.
 * - calculationVersion and calculatedAt on each point come from the original
 *   snapshot and are NEVER replaced with current values.
 */
export declare function buildSnapshotHistory(householdId: EntityId, snapshots: FinancialSnapshot[]): SnapshotHistory;
/**
 * Build the surplus explanation string used in the financial-pulse response.
 * Exported separately so server.ts can build it without importing the full history.
 */
export declare function buildSurplusExplanationText(snapshot: FinancialSnapshot): string;
//# sourceMappingURL=snapshot-history.d.ts.map