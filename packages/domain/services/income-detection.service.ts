/**
 * Income Detection Service
 *
 * Business logic for detecting household income from bank transactions.
 * Used during Phase 4 (Financial Context).
 * Analyzes frequency, amounts, and confidence levels.
 */

import { IncomeDetection, ConfidenceLevel, IncomeSourceType } from '../types/onboarding.types';
import { EntityId } from '../types/common.types';
import { PostedTransaction } from '@house-fin/contracts';

export interface IIncomeDetectionService {
    /**
     * Analyze bank transactions to detect income
     */
    detectIncome(householdId: EntityId, minMonthsOfData?: number): Promise<IncomeDetection | null>;

    /**
     * Detect income from specific accounts
     */
    detectIncomeFromAccounts(householdId: EntityId, accountIds: EntityId[]): Promise<IncomeDetection | null>;

    /**
     * Calculate confidence level based on detection metrics
     */
    calculateConfidence(frequency: string, transactionCount: number): ConfidenceLevel;

    /**
     * Validate detected income
     */
    validateDetection(detection: IncomeDetection): boolean;

    /**
     * Get income detection explanation for user
     */
    getDetectionExplanation(detection: IncomeDetection): string;
}

export class IncomeDetectionService implements IIncomeDetectionService {
    constructor() { }

    async detectIncome(householdId: EntityId, minMonthsOfData?: number): Promise<IncomeDetection | null> {
        // TODO: Implement in Phase 2
        // This would:
        // 1. Fetch transactions from repository
        // 2. Filter for income-like transactions
        // 3. Analyze patterns
        throw new Error('Not implemented');
    }

    async detectIncomeFromAccounts(householdId: EntityId, accountIds: EntityId[]): Promise<IncomeDetection | null> {
        // TODO: Implement in Phase 2
        // This would fetch transactions from specific accounts and analyze
        throw new Error('Not implemented');
    }

    calculateConfidence(frequency: string, transactionCount: number): ConfidenceLevel {
        // HIGH: Multiple consistent payments (6+), clear frequency
        // MEDIUM: Some variance but recognizable pattern (3-5 payments)
        // LOW: Few transactions or irregular pattern (1-2)

        if (transactionCount < 2) {
            return ConfidenceLevel.LOW;
        }

        if (transactionCount >= 6 && frequency !== 'IRREGULAR') {
            return ConfidenceLevel.HIGH;
        }

        if (transactionCount >= 3 && frequency !== 'IRREGULAR') {
            return ConfidenceLevel.MEDIUM;
        }

        return ConfidenceLevel.LOW;
    }

    validateDetection(detection: IncomeDetection): boolean {
        // Validate that the detection has reasonable values
        return (
            detection.monthlyGrossCents > 0 &&
            (detection.annualGrossCents ? detection.annualGrossCents > 0 : true) &&
            (detection.frequency ? ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'IRREGULAR'].includes(detection.frequency) : true)
        );
    }

    getDetectionExplanation(detection: IncomeDetection): string {
        const monthly = Math.floor(detection.monthlyGrossCents / 100);
        const freq = detection.frequency || 'IRREGULAR';
        const conf = detection.confidence;
        return `Detected ${freq.toLowerCase()} income of $${monthly} per month with ${conf.toLowerCase()} confidence based on transaction analysis`;
    }

    private isLikelyIncome(description: string): boolean {
        const incomeKeywords = [
            'salary',
            'paycheck',
            'direct deposit',
            'payment',
            'transfer in',
            'deposit',
        ];
        const lowercase = description.toLowerCase();
        return incomeKeywords.some((keyword) => lowercase.includes(keyword));
    }

    private analyzePatterns(transactions: PostedTransaction[]): IncomeDetection {
        // Sort by date
        const sorted = [...transactions].sort(
            (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime()
        );

        // Calculate average amount
        const totalAmount = sorted.reduce((sum, t) => sum + t.amountCents, 0);
        const avgAmount = Math.floor(totalAmount / sorted.length);

        // Detect frequency from spacing
        const frequency = this.detectFrequency(sorted);

        // Estimate monthly based on frequency
        let monthlyGross: number;
        switch (frequency) {
            case 'WEEKLY':
                monthlyGross = avgAmount * 4.33; // Average weeks per month
                break;
            case 'BIWEEKLY':
                monthlyGross = avgAmount * 2.17;
                break;
            case 'MONTHLY':
                monthlyGross = avgAmount;
                break;
            default:
                monthlyGross = avgAmount;
        }

        const confidence = this.calculateConfidence(frequency, sorted.length);

        return {
            source: IncomeSourceType.AUTO_DETECTED,
            monthlyGrossCents: Math.round(monthlyGross * 100),
            annualGrossCents: Math.round(monthlyGross * 12 * 100),
            frequency,
            confidence,
            detectionMethod: 'BANK_DEPOSITS_ANALYSIS',
        };
    }

    private detectFrequency(
        transactions: PostedTransaction[]
    ): 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'IRREGULAR' {
        if (transactions.length < 2) {
            return 'IRREGULAR';
        }

        // Calculate spacing between transactions
        const intervals: number[] = [];
        for (let i = 1; i < transactions.length; i++) {
            const interval = Math.floor(
                (transactions[i].postedDate.getTime() -
                    transactions[i - 1].postedDate.getTime()) /
                (1000 * 60 * 60 * 24)
            ); // Days
            intervals.push(interval);
        }

        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

        // Determine frequency based on average interval
        if (avgInterval < 10) {
            return 'WEEKLY';
        } else if (avgInterval < 20) {
            return 'BIWEEKLY';
        } else if (avgInterval < 40) {
            return 'MONTHLY';
        } else {
            return 'IRREGULAR';
        }
    }
}
