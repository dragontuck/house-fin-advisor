/**
 * Expense Detection Service
 *
 * Business logic for detecting recurring household expenses from bank transactions.
 * Used during Phase 4 (Financial Context).
 * Categorizes transactions by merchant and expense type.
 */

import { ExpenseDetection, ConfidenceLevel, ExpenseSourceType } from '../types/onboarding.types';
import { EntityId } from '../types/common.types';
import { PostedTransaction } from '@house-fin/contracts';

export type ExpenseCategory =
    | 'Groceries'
    | 'Utilities'
    | 'Transportation'
    | 'Entertainment'
    | 'Dining Out'
    | 'Healthcare'
    | 'Insurance'
    | 'Shopping'
    | 'Other';

export interface IExpenseDetectionService {
    /**
     * Analyze bank transactions to detect recurring expenses
     */
    detectExpenses(
        householdId: EntityId,
        accountIds?: EntityId[],
        minMonthsOfData?: number
    ): Promise<ExpenseDetection[]>;

    /**
     * Detect expenses in specific expense categories
     */
    detectExpensesByCategory(householdId: EntityId, categories: string[]): Promise<ExpenseDetection[]>;

    /**
     * Categorize transactions and aggregate by category
     */
    aggregateByCategory(householdId: EntityId, accountIds: EntityId[]): Promise<Map<string, ExpenseDetection[]>>;

    /**
     * Calculate confidence level for expense detection
     */
    calculateConfidence(transactionCount: number, variance: number): ConfidenceLevel;

    /**
     * Validate detected expense
     */
    validateDetection(detection: ExpenseDetection): boolean;

    /**
     * Get expense detection explanation for user
     */
    getDetectionExplanation(detection: ExpenseDetection): string;

    /**
     * Get suggested expense categories based on transaction patterns
     */
    suggestCategories(householdId: EntityId): Promise<string[]>;
}

export class ExpenseDetectionService implements IExpenseDetectionService {
    private categoryKeywords: Record<ExpenseCategory, string[]> = {
        Groceries: ['grocery', 'whole foods', 'safeway', 'kroger', 'publix', 'trader joes', 'costco'],
        Utilities: ['electric', 'gas', 'water', 'internet', 'comcast', 'verizon', 'att'],
        Transportation: ['gas station', 'uber', 'lyft', 'parking', 'transit', 'shell', 'chevron'],
        Entertainment: ['movie', 'theater', 'cinema', 'netflix', 'spotify', 'disney'],
        'Dining Out': [
            'restaurant',
            'cafe',
            'coffee',
            'pizza',
            'burger',
            'subway',
            'mcdonald',
            'chipotle',
        ],
        Healthcare: ['pharmacy', 'doctor', 'hospital', 'clinic', 'medical', 'cvs', 'walgreens'],
        Insurance: ['insurance', 'allstate', 'geico', 'statefarm', 'aarp'],
        Shopping: ['amazon', 'target', 'walmart', 'bestbuy', 'mall', 'store'],
        Other: [],
    };

    constructor() { }

    async detectExpenses(
        householdId: EntityId,
        accountIds?: EntityId[],
        minMonthsOfData?: number
    ): Promise<ExpenseDetection[]> {
        // TODO: Implement in Phase 2
        // This would:
        // 1. Fetch transactions from repository
        // 2. Filter for expense transactions (negative amounts)
        // 3. Categorize by merchant
        // 4. Calculate monthly averages
        throw new Error('Not implemented');
    }

    async detectExpensesByCategory(
        householdId: EntityId,
        categories: string[]
    ): Promise<ExpenseDetection[]> {
        // TODO: Implement in Phase 2
        // This would filter detected expenses by category
        throw new Error('Not implemented');
    }

    async aggregateByCategory(
        householdId: EntityId,
        accountIds: EntityId[]
    ): Promise<Map<string, ExpenseDetection[]>> {
        // TODO: Implement in Phase 2
        // This would aggregate expenses by category
        throw new Error('Not implemented');
    }

    calculateConfidence(transactionCount: number, variance: number): ConfidenceLevel {
        // HIGH: Multiple transactions, low variance (consistent pattern)
        // MEDIUM: Some transactions with moderate variance
        // LOW: Few transactions or high variance

        if (transactionCount < 2) {
            return ConfidenceLevel.LOW;
        }

        if (transactionCount >= 6 && variance < 0.3) {
            return ConfidenceLevel.HIGH;
        }

        if (transactionCount >= 3) {
            return ConfidenceLevel.MEDIUM;
        }

        return ConfidenceLevel.LOW;
    }

    validateDetection(detection: ExpenseDetection): boolean {
        // Validate that the detection has reasonable values
        const monthly = detection.monthlyAmountCents || detection.monthlyAverageCents;
        return (monthly ? monthly > 0 : false);
    }

    getDetectionExplanation(detection: ExpenseDetection): string {
        const monthly = Math.floor((detection.monthlyAmountCents || detection.monthlyAverageCents || 0) / 100);
        const txCount = detection.transactionCount || detection.detectedFromTransactionCount || 0;
        return `Detected ${detection.category} expenses averaging $${monthly} per month with ${detection.confidence.toLowerCase()} confidence based on ${txCount} transactions`;
    }

    async suggestCategories(householdId: EntityId): Promise<string[]> {
        // TODO: Implement in Phase 2
        // This would analyze transaction patterns and suggest most likely categories
        return Object.keys(this.categoryKeywords) as ExpenseCategory[];
    }

    private categorizeTransaction(transaction: PostedTransaction): ExpenseCategory {
        const description = transaction.description.toLowerCase();

        for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
            if (keywords.some((keyword) => description.includes(keyword))) {
                return category as ExpenseCategory;
            }
        }

        return 'Other';
    }

    private calculateMonthlyAverage(amounts: number[]): number {
        if (amounts.length === 0) return 0;
        const total = amounts.reduce((a, b) => a + b, 0);
        return Math.floor(total / amounts.length);
    }

    private calculateVariance(amounts: number[], mean: number): number {
        if (amounts.length === 0) return 0;
        const squaredDiffs = amounts.map((amount) => Math.pow(amount - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / amounts.length;
        return variance > 0 ? Math.sqrt(variance) / mean : 0;
    }
}
