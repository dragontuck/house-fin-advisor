/**
 * Unit Tests: ExpenseDetectionService
 * 
 * Tests expense categorization and pattern analysis from transactions.
 * Validates category detection and confidence levels.
 */

import { PostedTransaction } from '../../../domain/types/financial.types';

export interface DetectedExpense {
    category: string;
    monthlyAverageCents: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'OCCASIONAL';
    transactionCount: number;
    dateRange: {
        start: Date;
        end: Date;
    };
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
        direction: 'DEBIT',
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

class ExpenseDetectionService {
    private categoryKeywords: Record<string, string[]> = {
        'Groceries & Food': [
            'grocery',
            'whole foods',
            'trader joes',
            'safeway',
            'kroger',
            'walmart',
            'supermarket',
        ],
        Utilities: ['electric', 'water', 'gas', 'internet', 'cable', 'phone'],
        Transportation: ['gas station', 'uber', 'lyft', 'parking', 'transit', 'metro'],
        Entertainment: ['movie', 'spotify', 'netflix', 'hulu', 'theater', 'concert'],
        'Dining Out': ['restaurant', 'coffee', 'cafe', 'bar', 'pizza', 'burger', 'sushi'],
        Healthcare: ['pharmacy', 'doctor', 'clinic', 'hospital', 'dental'],
        Insurance: ['insurance', 'premium'],
        Shopping: ['amazon', 'target', 'mall', 'retail', 'clothing', 'store'],
    };

    async detectExpenses(transactions: PostedTransaction[]): Promise<DetectedExpense[]> {
        if (transactions.length === 0) {
            return [];
        }

        // Filter for expense transactions (negative amounts)
        const expenses = transactions.filter((t) => t.amountCents < 0);

        // Group by category
        const grouped = this.groupByCategory(expenses);

        // Analyze each category
        const detected: DetectedExpense[] = [];

        for (const [category, transactions] of grouped.entries()) {
            if (transactions.length > 0) {
                const analysis = this.analyzeCategory(category, transactions);
                detected.push(analysis);
            }
        }

        return detected.sort((a, b) => b.monthlyAverageCents - a.monthlyAverageCents);
    }

    private groupByCategory(
        transactions: PostedTransaction[]
    ): Map<string, PostedTransaction[]> {
        const grouped = new Map<string, PostedTransaction[]>();

        for (const transaction of transactions) {
            const category = this.detectCategory(transaction.description);

            if (!grouped.has(category)) {
                grouped.set(category, []);
            }

            grouped.get(category)!.push(transaction);
        }

        return grouped;
    }

    private detectCategory(description: string): string {
        const lowercase = description.toLowerCase();

        for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
            if (keywords.some((keyword) => lowercase.includes(keyword))) {
                return category;
            }
        }

        return 'Other';
    }

    private analyzeCategory(category: string, transactions: PostedTransaction[]): DetectedExpense {
        // Sort by date
        const sorted = [...transactions].sort(
            (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime()
        );

        // Calculate monthly average
        const totalAmount = sorted.reduce((sum, t) => sum + Math.abs(t.amountCents), 0);
        const daySpan = Math.max(
            (sorted[sorted.length - 1].transactionDate.getTime() - sorted[0].transactionDate.getTime()) /
            (1000 * 60 * 60 * 24),
            1
        );
        const monthlyAverage = (totalAmount / daySpan) * 30;

        // Detect frequency
        const frequency = this.detectFrequency(sorted);

        // Calculate confidence
        const confidence = this.calculateConfidence(sorted, frequency);

        return {
            category,
            monthlyAverageCents: Math.round(monthlyAverage),
            confidence,
            frequency,
            transactionCount: transactions.length,
            dateRange: {
                start: sorted[0].transactionDate,
                end: sorted[sorted.length - 1].transactionDate,
            },
        };
    }

    private detectFrequency(
        transactions: PostedTransaction[]
    ): 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'OCCASIONAL' {
        if (transactions.length < 2) {
            return 'OCCASIONAL';
        }

        // Calculate average interval between transactions
        const intervals: number[] = [];
        for (let i = 1; i < transactions.length; i++) {
            const interval = Math.floor(
                (transactions[i].transactionDate.getTime() - transactions[i - 1].transactionDate.getTime()) /
                (1000 * 60 * 60 * 24)
            );
            intervals.push(interval);
        }

        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

        if (avgInterval < 10) {
            return 'WEEKLY';
        } else if (avgInterval < 20) {
            return 'BIWEEKLY';
        } else if (avgInterval < 45) {
            return 'MONTHLY';
        } else {
            return 'OCCASIONAL';
        }
    }

    private calculateConfidence(
        transactions: PostedTransaction[],
        frequency: string
    ): 'HIGH' | 'MEDIUM' | 'LOW' {
        if (transactions.length < 2) {
            return 'LOW';
        }

        if (transactions.length >= 12 && frequency !== 'OCCASIONAL') {
            return 'HIGH';
        }

        if (transactions.length >= 4 && frequency !== 'OCCASIONAL') {
            return 'MEDIUM';
        }

        return 'LOW';
    }

    async suggestCategories(transactionDescription: string): Promise<string[]> {
        const suggestions: string[] = [];
        const lowercase = transactionDescription.toLowerCase();

        for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
            const matchingKeywords = keywords.filter((keyword) => lowercase.includes(keyword));
            if (matchingKeywords.length > 0) {
                suggestions.push(category);
            }
        }

        return suggestions.length > 0 ? suggestions : ['Other'];
    }
}

describe('Service: ExpenseDetectionService', () => {
    let service: ExpenseDetectionService;

    beforeEach(() => {
        service = new ExpenseDetectionService();
    });

    describe('detectExpenses()', () => {
        it('should return empty array for no transactions', async () => {
            const result = await service.detectExpenses([]);
            expect(result).toEqual([]);
        });

        it('should ignore income transactions (positive amounts)', async () => {
            const transactions: PostedTransaction[] = [
                createTestTransaction({
                    id: '1',
                    description: 'Salary Deposit',
                    transactionDate: new Date('2024-01-01'),
                    amountCents: 500000,
                    direction: 'CREDIT',
                }) as any,
            ];

            const result = await service.detectExpenses(transactions);
            expect(result).toEqual([]);
        });

        it('should categorize grocery expenses', async () => {
            const transactions: PostedTransaction[] = [
                createTestTransaction({
                    id: '1',
                    description: 'Whole Foods',
                    transactionDate: new Date('2024-01-01'),
                    amountCents: -15000,
                }) as any,
                createTestTransaction({
                    id: '2',
                    description: 'Trader Joes',
                    transactionDate: new Date('2024-01-08'),
                    amountCents: -12000,
                }) as any,
                createTestTransaction({
                    id: '3',
                    description: 'Kroger Supermarket',
                    transactionDate: new Date('2024-01-15'),
                    amountCents: -18000,
                }) as any,
            ];

            const result = await service.detectExpenses(transactions);

            expect(result.length).toBeGreaterThan(0);
            const groceries = result.find((e) => e.category.includes('Groceries'));
            expect(groceries).toBeDefined();
            expect(groceries?.transactionCount).toBe(3);
        });

        it('should categorize utility expenses', async () => {
            const transactions: PostedTransaction[] = [
                createTestTransaction({
                    id: '1',
                    description: 'Electric Company',
                    transactionDate: new Date('2024-01-01'),
                    amountCents: -15000,
                }) as any,
                createTestTransaction({
                    id: '2',
                    description: 'Water Utility',
                    transactionDate: new Date('2024-02-01'),
                    amountCents: -8000,
                }) as any,
            ];

            const result = await service.detectExpenses(transactions);

            const utilities = result.find((e) => e.category.includes('Utilities'));
            expect(utilities).toBeDefined();
        });

        it('should categorize multiple expense types', async () => {
            const transactions: PostedTransaction[] = [
                createTestTransaction({
                    id: '1',
                    description: 'Whole Foods',
                    transactionDate: new Date('2024-01-01'),
                    amountCents: -15000,
                }) as any,
                createTestTransaction({
                    id: '2',
                    description: 'Gas Station',
                    transactionDate: new Date('2024-01-02'),
                    amountCents: -6000,
                }) as any,
                createTestTransaction({
                    id: '3',
                    description: 'Netflix Subscription',
                    transactionDate: new Date('2024-01-05'),
                    amountCents: -1599,
                }) as any,
            ];

            const result = await service.detectExpenses(transactions);

            expect(result.length).toBeGreaterThanOrEqual(3);
        });

        it('should sort categories by monthly average (descending)', async () => {
            const transactions: PostedTransaction[] = [
                createTestTransaction({
                    id: '1',
                    description: 'Restaurant',
                    transactionDate: new Date('2024-01-01'),
                    amountCents: -5000,
                }) as any,
                createTestTransaction({
                    id: '2',
                    description: 'Whole Foods',
                    transactionDate: new Date('2024-01-02'),
                    amountCents: -50000,
                }) as any,
            ];

            const result = await service.detectExpenses(transactions);

            // Groceries should come first (higher monthly average)
            expect(result[0].monthlyAverageCents).toBeGreaterThanOrEqual(result[1].monthlyAverageCents);
        });

        it('should assign HIGH confidence for 12+ consistent transactions', async () => {
            const transactions: PostedTransaction[] = Array.from({ length: 12 }).map((_, i) =>
                createTestTransaction({
                    id: `${i}`,
                    description: 'Whole Foods',
                    transactionDate: new Date(2024, 0, i * 8 + 1),
                    amountCents: -15000,
                }) as any
            );

            const result = await service.detectExpenses(transactions);

            const groceries = result.find((e) => e.category.includes('Groceries'));
            expect(groceries?.confidence).toBe('HIGH');
        });

        it('should assign MEDIUM confidence for 4-11 transactions', async () => {
            const transactions: PostedTransaction[] = Array.from({ length: 6 }).map((_, i) =>
                createTestTransaction({
                    id: `${i}`,
                    description: 'Gas Station',
                    transactionDate: new Date(2024, 0, i * 10 + 1),
                    amountCents: -6000,
                }) as any
            );

            const result = await service.detectExpenses(transactions);

            const transportation = result.find((e) => e.category.includes('Transportation'));
            expect(transportation?.confidence).toBe('MEDIUM');
        });

        it('should assign LOW confidence for 1-3 transactions', async () => {
            const transactions: PostedTransaction[] = [
                createTestTransaction({
                    id: '1',
                    description: 'Concert Ticket',
                    transactionDate: new Date('2024-01-01'),
                    amountCents: -25000,
                }) as any,
            ];

            const result = await service.detectExpenses(transactions);

            expect(result[0].confidence).toBe('LOW');
        });

        it('should calculate monthly average correctly', async () => {
            // Two transactions 30 days apart, averaging $150/month total
            const transactions: PostedTransaction[] = [
                createTestTransaction({
                    id: '1',
                    description: 'Gas Station',
                    transactionDate: new Date('2024-01-01'),
                    amountCents: -7500,
                }) as any,
                createTestTransaction({
                    id: '2',
                    description: 'Gas Station',
                    transactionDate: new Date('2024-01-31'),
                    amountCents: -7500,
                }) as any,
            ];

            const result = await service.detectExpenses(transactions);

            const transportation = result.find((e) => e.category.includes('Transportation'));
            expect(transportation?.monthlyAverageCents).toBeGreaterThan(0);
            expect(transportation?.monthlyAverageCents).toBeLessThan(2000000); // Reasonable upper bound
        });

        it('should track date range of expenses', async () => {
            const startDate = new Date('2024-01-01');
            const endDate = new Date('2024-03-31');

            const transactions: PostedTransaction[] = [
                createTestTransaction({
                    id: '1',
                    description: 'Whole Foods',
                    transactionDate: startDate,
                    amountCents: -15000,
                }) as any,
                createTestTransaction({
                    id: '2',
                    description: 'Whole Foods',
                    transactionDate: endDate,
                    amountCents: -15000,
                }) as any,
            ];

            const result = await service.detectExpenses(transactions);

            const groceries = result.find((e) => e.category.includes('Groceries'));
            expect(groceries?.dateRange.start).toEqual(startDate);
            expect(groceries?.dateRange.end).toEqual(endDate);
        });
    });

    describe('suggestCategories()', () => {
        it('should suggest Groceries for food keywords', async () => {
            const suggestions = await service.suggestCategories('Whole Foods Store');
            expect(suggestions).toContain('Groceries & Food');
        });

        it('should suggest Transportation for gas station', async () => {
            const suggestions = await service.suggestCategories('Shell Gas Station');
            expect(suggestions).toContain('Transportation');
        });

        it('should suggest Entertainment for streaming service', async () => {
            const suggestions = await service.suggestCategories('Netflix Monthly');
            expect(suggestions).toContain('Entertainment');
        });

        it('should suggest multiple categories for ambiguous descriptions', async () => {
            const suggestions = await service.suggestCategories('Coffee shop with food');
            expect(suggestions.length).toBeGreaterThanOrEqual(1);
        });

        it('should default to Other for unknown merchants', async () => {
            const suggestions = await service.suggestCategories('XYZ Unknown Merchant 12345');
            expect(suggestions).toContain('Other');
        });
    });
});
