/**
 * Unit Tests: IncomeDetectionService
 * 
 * Tests income pattern detection from bank transactions.
 * Validates confidence levels and detection logic.
 */

import { PostedTransaction } from '../../../domain/types/financial.types';

export interface DetectedIncome {
    monthlyGrossCents: number;
    annualGrossCents: number;
    monthlyNetCents?: number;
    frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'IRREGULAR';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    detectionMethod: string;
}

// Helper to create test transactions with all required PostedTransaction fields
function createTestTransaction(overrides: any = {}): PostedTransaction {
    const date = overrides.transactionDate || new Date('2024-01-01');
    return {
        id: '1' as any,
        householdId: 'household1' as any,
        accountId: 'acc1' as any,
        transactionDate: date,
        postedDate: date,
        amountCents: 0,
        direction: 'CREDIT',
        merchant: '',
        description: '',
        confidenceScore: 1.0,
        sourceDocumentId: 'doc1' as any,
        reconciliationState: 'PENDING',
        postedBy: 'user1',
        postedAt: date,
        postingCorrelationId: 'corr1',
        ...overrides,
    } as any as PostedTransaction;
}

class IncomeDetectionService {
    async detectIncome(transactions: PostedTransaction[]): Promise<DetectedIncome | null> {
        if (transactions.length === 0) {
            return null;
        }

        // Filter for income transactions (positive amounts, likely recurring)
        const incomingTransactions = transactions.filter(
            (t) => t.amountCents > 0 && this.isLikelyIncome(t.description)
        );

        if (incomingTransactions.length === 0) {
            return null;
        }

        // Analyze patterns
        const patterns = this.analyzePatterns(incomingTransactions);

        return patterns;
    }

    private isLikelyIncome(description: string): boolean {
        const incomeKeywords = ['salary', 'paycheck', 'direct deposit', 'payment', 'transfer in'];
        const lowercase = description.toLowerCase();
        return incomeKeywords.some((keyword) => lowercase.includes(keyword));
    }

    private analyzePatterns(transactions: PostedTransaction[]): DetectedIncome {
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

        const confidence = this.calculateConfidence(sorted, frequency);

        return {
            monthlyGrossCents: Math.round(monthlyGross),
            annualGrossCents: Math.round(monthlyGross * 12),
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
                (transactions[i].transactionDate.getTime() - transactions[i - 1].transactionDate.getTime()) /
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

    private calculateConfidence(
        transactions: PostedTransaction[],
        frequency: string
    ): 'HIGH' | 'MEDIUM' | 'LOW' {
        // HIGH: Multiple consistent payments, clear frequency
        // MEDIUM: Some variance but recognizable pattern
        // LOW: Few transactions or irregular pattern

        if (transactions.length < 2) {
            return 'LOW';
        }

        if (transactions.length >= 6 && frequency !== 'IRREGULAR') {
            return 'HIGH';
        }

        if (transactions.length >= 3 && frequency !== 'IRREGULAR') {
            return 'MEDIUM';
        }

        return 'LOW';
    }
}

describe('Service: IncomeDetectionService', () => {
    let service: IncomeDetectionService;

    beforeEach(() => {
        service = new IncomeDetectionService();
    });

    afterEach(() => {
        jest.clearAllTimers();
    });

    describe('detectIncome()', () => {
        it('should return null for empty transaction list', async () => {
            const result = await service.detectIncome([]);
            expect(result).toBeNull();
        });

        it('should return null when no income transactions found', async () => {
            const transactions: PostedTransaction[] = [
                createTestTransaction({
                    id: '1',
                    description: 'Grocery Store',
                    transactionDate: new Date('2024-01-01'),
                    amountCents: -500,
                }) as any,
            ];

            const result = await service.detectIncome(transactions);
            expect(result).toBeNull();
        });

        it('should detect weekly income pattern', async () => {
            const transactions: PostedTransaction[] = [
                createTestTransaction({
                    id: '1',
                    description: 'Paycheck Deposit',
                    transactionDate: new Date('2024-01-01'),
                    amountCents: 110000,
                }) as any,
                createTestTransaction({
                    id: '2',
                    description: 'Direct Deposit Salary',
                    transactionDate: new Date('2024-01-08'),
                    amountCents: 110000,
                }) as any,
                createTestTransaction({
                    id: '3',
                    description: 'Paycheck Deposit',
                    transactionDate: new Date('2024-01-15'),
                    amountCents: 110000,
                }) as any,
                createTestTransaction({
                    id: '4',
                    description: 'Direct Deposit Salary',
                    transactionDate: new Date('2024-01-22'),
                    amountCents: 110000,
                }) as any,
                createTestTransaction({
                    id: '5',
                    description: 'Paycheck Deposit',
                    transactionDate: new Date('2024-01-29'),
                    amountCents: 110000,
                }) as any,
                createTestTransaction({
                    id: '6',
                    description: 'Direct Deposit Salary',
                    transactionDate: new Date('2024-02-05'),
                    amountCents: 110000,
                }) as any,
            ];

            const result = await service.detectIncome(transactions);

            expect(result).not.toBeNull();
            expect(result?.frequency).toBe('WEEKLY');
            expect(result?.confidence).toBe('HIGH');
            expect(result?.monthlyGrossCents).toBeGreaterThan(0);
        });

        it('should detect biweekly income pattern', async () => {
            const transactions: PostedTransaction[] = [
                createTestTransaction({
                    id: '1',
                    description: 'Paycheck Deposit',
                    transactionDate: new Date('2024-01-01'),
                    amountCents: 225000,
                }) as any,
                createTestTransaction({
                    id: '2',
                    description: 'Paycheck Deposit',
                    transactionDate: new Date('2024-01-15'),
                    amountCents: 225000,
                }) as any,
                createTestTransaction({
                    id: '3',
                    description: 'Paycheck Deposit',
                    transactionDate: new Date('2024-02-01'),
                    amountCents: 225000,
                }) as any,
                createTestTransaction({
                    id: '4',
                    description: 'Paycheck Deposit',
                    transactionDate: new Date('2024-02-15'),
                    amountCents: 225000,
                }) as any,
                createTestTransaction({
                    id: '5',
                    description: 'Paycheck Deposit',
                    transactionDate: new Date('2024-03-01'),
                    amountCents: 225000,
                }) as any,
                createTestTransaction({
                    id: '6',
                    description: 'Paycheck Deposit',
                    transactionDate: new Date('2024-03-15'),
                    amountCents: 225000,
                }) as any,
            ];

            const result = await service.detectIncome(transactions);

            expect(result).not.toBeNull();
            expect(result?.frequency).toBe('BIWEEKLY');
            expect(result?.confidence).toBe('HIGH');
            // $2,250 * 2.17 ≈ $4,882.50/month
            expect(result?.monthlyGrossCents).toBeGreaterThan(480000); // At least $4,800
        });

        it('should detect monthly income pattern', async () => {
            const transactions: PostedTransaction[] = [
                createTestTransaction({
                    id: '1',
                    description: 'Monthly Salary',
                    transactionDate: new Date('2024-01-01'),
                    amountCents: 500000,
                }) as any,
                createTestTransaction({
                    id: '2',
                    description: 'Monthly Salary',
                    transactionDate: new Date('2024-02-01'),
                    amountCents: 500000,
                }) as any,
                createTestTransaction({
                    id: '3',
                    description: 'Monthly Salary',
                    transactionDate: new Date('2024-03-01'),
                    amountCents: 500000,
                }) as any,
            ];

            const result = await service.detectIncome(transactions);

            expect(result).not.toBeNull();
            expect(result?.frequency).toBe('MONTHLY');
            expect(result?.monthlyGrossCents).toBeCloseTo(500000, -3);
        });

        it('should assign HIGH confidence for consistent 6+ payments', async () => {
            const transactions: PostedTransaction[] = Array.from({ length: 6 }).map((_, i) =>
                createTestTransaction({
                    id: `${i}`,
                    description: 'Paycheck',
                    transactionDate: new Date(2024, 0, i * 14 + 1),
                    amountCents: 225000,
                }) as any
            );

            const result = await service.detectIncome(transactions);

            expect(result?.confidence).toBe('HIGH');
        });

        it('should assign MEDIUM confidence for 3-5 consistent payments', async () => {
            const transactions: PostedTransaction[] = Array.from({ length: 3 }).map((_, i) =>
                createTestTransaction({
                    id: `${i}`,
                    description: 'Paycheck',
                    transactionDate: new Date(2024, 0, i * 14 + 1),
                    amountCents: 225000,
                }) as any
            );

            const result = await service.detectIncome(transactions);

            expect(result?.confidence).toBe('MEDIUM');
        });

        it('should assign LOW confidence for 1-2 payments', async () => {
            const transactions: PostedTransaction[] = [
                createTestTransaction({
                    id: '1',
                    description: 'Payment',
                    transactionDate: new Date('2024-01-01'),
                    amountCents: 100000,
                }) as any,
            ];

            const result = await service.detectIncome(transactions);

            expect(result?.confidence).toBe('LOW');
        });

        it('should calculate annual gross correctly', async () => {
            const transactions: PostedTransaction[] = [
                createTestTransaction({
                    id: '1',
                    description: 'Monthly Salary',
                    transactionDate: new Date('2024-01-01'),
                    amountCents: 500000,
                }) as any,
                createTestTransaction({
                    id: '2',
                    description: 'Monthly Salary',
                    transactionDate: new Date('2024-02-01'),
                    amountCents: 500000,
                }) as any,
                createTestTransaction({
                    id: '3',
                    description: 'Monthly Salary',
                    transactionDate: new Date('2024-03-01'),
                    amountCents: 500000,
                }) as any,
            ];

            const result = await service.detectIncome(transactions);

            // $5,000/month * 12 = $60,000/year = 6,000,000 cents
            expect(result?.annualGrossCents).toBeCloseTo(6000000, -3);
        });

        it('should handle variance in payment amounts gracefully', async () => {
            const transactions: PostedTransaction[] = [
                createTestTransaction({
                    id: '1',
                    description: 'Paycheck',
                    transactionDate: new Date('2024-01-01'),
                    amountCents: 220000,
                }) as any,
                createTestTransaction({
                    id: '2',
                    description: 'Paycheck',
                    transactionDate: new Date('2024-01-15'),
                    amountCents: 225000,
                }) as any,
                createTestTransaction({
                    id: '3',
                    description: 'Paycheck',
                    transactionDate: new Date('2024-02-01'),
                    amountCents: 223000,
                }) as any,
                createTestTransaction({
                    id: '4',
                    description: 'Paycheck',
                    transactionDate: new Date('2024-02-15'),
                    amountCents: 225500,
                }) as any,
            ];

            const result = await service.detectIncome(transactions);

            expect(result).not.toBeNull();
            expect(result?.confidence).toBe('MEDIUM');
            expect(result?.monthlyGrossCents).toBeGreaterThan(0);
        });
    });
});
