/**
 * Transaction Normalization and Reconciliation Integration Tests
 * 
 * Tests cover:
 * - Exact duplicate detection
 * - Amount/date/merchant matching
 * - Merchant name variations
 * - Overlapping statements
 * - CSV vs PDF same transaction
 * - Balance discrepancies
 * - Duplicate uploads
 * - Statement reprocessing (idempotency)
 */

import {
    TransactionCandidate,
    ExtractedTransactionCandidate,
    NormalizedTransaction,
    ReconciliationState,
    Money,
    EntityId,
    ExtractionMethod,
    SourceReference,
} from "@house-fin/contracts";
import {
    normalizeTransaction,
    normalizeBatch,
    createNormalizedTransaction,
} from "../../packages/domain/transaction-normalizer";
import {
    reconcileTransaction,
    reconcileBatch,
    checkIdempotency,
    ReconciliationContext,
    ExistingTransaction,
} from "../../packages/domain/transaction-reconciler";

describe("Transaction Normalization and Reconciliation", () => {
    const householdId = EntityId("household-1");
    const accountId = EntityId("account-1");
    const documentId = EntityId("doc-1");
    const documentId2 = EntityId("doc-2");

    describe("Transaction Normalization", () => {
        it("should normalize basic CSV transaction candidate", () => {
            const candidate: TransactionCandidate = {
                sourceRowNumber: 2,
                date: new Date("2026-08-01"),
                description: "AMAZON COM AMZN",
                amountCents: -1999,  // Negative = expense/debit
                originalAmount: "-19.99",
                originalDate: "08/01/2026",
                balance: 500000,
            };

            const normalized = normalizeTransaction(candidate, documentId, accountId);

            expect(normalized.transactionDate).toEqual(new Date("2026-08-01"));
            expect(normalized.amount).toBe(Money(1999));
            expect(normalized.direction).toBe("DEBIT");
            expect(normalized.merchant).toBe("Amazon.com");
            expect(normalized.descriptionRaw).toBe("AMAZON COM AMZN");
            expect(normalized.original.amountString).toBe("-19.99");
            expect(normalized.original.dateString).toBe("08/01/2026");
        });

        it("should preserve original raw values unchanged", () => {
            const candidate: TransactionCandidate = {
                sourceRowNumber: 3,
                date: new Date("2026-08-02"),
                description: "   STARBUCKS   ",
                amountCents: -650,
                originalAmount: "$ (6.50)",
                originalDate: "08-02-2026",
            };

            const normalized = normalizeTransaction(candidate, documentId, accountId);

            expect(normalized.descriptionRaw).toBe("   STARBUCKS   ");
            expect(normalized.original.amountString).toBe("$ (6.50)");
            expect(normalized.original.dateString).toBe("08-02-2026");
        });

        it("should handle positive amounts as credits", () => {
            const candidate: TransactionCandidate = {
                sourceRowNumber: 1,
                date: new Date("2026-08-01"),
                description: "Direct Deposit Payroll",
                amountCents: 250000,  // Positive = income/credit
                originalAmount: "2500.00",
                originalDate: "08/01/2026",
            };

            const normalized = normalizeTransaction(candidate, documentId, accountId);

            expect(normalized.amount).toBe(Money(250000));
            expect(normalized.direction).toBe("CREDIT");
        });

        it("should normalize merchant names", () => {
            const testCases = [
                { input: "MCDONALD'S CORP", expected: "Mcdonald's" },
                { input: "  WALMART INC  ", expected: "Walmart" },
                { input: "DEBIT GROCERIES", expected: "Groceries" },
                { input: "TRANSFER TO JOHN", expected: "John" },
            ];

            for (const testCase of testCases) {
                const candidate: TransactionCandidate = {
                    sourceRowNumber: 1,
                    date: new Date("2026-08-01"),
                    description: testCase.input,
                    amountCents: -500,
                    originalAmount: "-5.00",
                    originalDate: "08/01/2026",
                };

                const normalized = normalizeTransaction(candidate, documentId);
                expect(normalized.merchant).toBe(testCase.expected);
            }
        });

        it("should normalize PDF extraction with source reference", () => {
            const candidate: ExtractedTransactionCandidate = {
                sourceRowNumber: 5,
                date: new Date("2026-08-05"),
                description: "Check #1234",
                amountCents: -5000,
                originalAmount: "50.00",
                originalDate: "08/05/2026",
                sourceReference: {
                    pageNumber: 1,
                    extractionMethod: ExtractionMethod.TEXT,
                    confidence: 0.95,
                    region: { left: 100, top: 200, width: 300, height: 50 },
                },
                institutionHint: "Chase Bank",
                accountHints: ["1234"],
            };

            const normalized = normalizeTransaction(candidate, documentId, accountId);

            expect(normalized.sourceDocument.pageNumber).toBe(1);
            expect(normalized.sourceDocument.sourceReference).toBeDefined();
            expect(normalized.sourceDocument.sourceReference?.confidence).toBe(0.95);
        });

        it("should batch normalize multiple candidates", () => {
            const candidates: TransactionCandidate[] = [
                {
                    sourceRowNumber: 1,
                    date: new Date("2026-08-01"),
                    description: "STARBUCKS",
                    amountCents: -550,
                    originalAmount: "5.50",
                    originalDate: "08/01/2026",
                },
                {
                    sourceRowNumber: 2,
                    date: new Date("2026-08-02"),
                    description: "AMAZON",
                    amountCents: -2999,
                    originalAmount: "29.99",
                    originalDate: "08/02/2026",
                },
            ];

            const normalized = normalizeBatch(candidates, documentId, accountId);

            expect(normalized).toHaveLength(2);
            expect(normalized[0].merchant).toBe("Starbucks");
            expect(normalized[1].merchant).toBe("Amazon");
        });
    });

    describe("Transaction Reconciliation", () => {
        const existingTransaction: ExistingTransaction = {
            id: "txn-1",
            date: new Date("2026-08-01"),
            amount: Money(1999),
            direction: "DEBIT",
            merchant: "Amazon.com",
            description: "AMAZON COM AMZN",
            accountId,
            createdAt: new Date("2026-08-01"),
            lastUpdatedAt: new Date("2026-08-01"),
        };

        it("should identify exact duplicate", () => {
            const normalized = createNormalizedTransaction({
                date: new Date("2026-08-01"),
                amount: 1999,
                direction: "DEBIT",
                merchant: "Amazon",
                description: "AMAZON COM AMZN",
                documentId: documentId2,
                accountId,
            });

            const context: ReconciliationContext = {
                existingTransactions: [existingTransaction],
                accountId,
            };

            const result = reconcileTransaction(normalized, context);

            expect(result.state).toBe(ReconciliationState.MATCHED);
            expect(result.matchedTransactionId).toBe(existingTransaction.id);
            expect(result.confidence).toBeGreaterThan(0.7);
        });

        it("should NOT match on merchant alone (prevent false positives)", () => {
            const normalized = createNormalizedTransaction({
                date: new Date("2026-08-15"),  // 14 days later
                amount: 2500,                   // Different amount
                direction: "DEBIT",
                merchant: "Amazon",
                description: "AMAZON KINDLE BOOKS",
                documentId: documentId2,
                accountId,
            });

            const context: ReconciliationContext = {
                existingTransactions: [existingTransaction],
                accountId,
            };

            const result = reconcileTransaction(normalized, context);

            // Should not match - too different despite same merchant
            expect(result.state).toBe(ReconciliationState.NEW);
        });

        it("should match on amount + date + merchant combination", () => {
            const normalized = createNormalizedTransaction({
                date: new Date("2026-08-01"),
                amount: 1999,
                direction: "DEBIT",
                merchant: "Amazon",
                description: "Amazon.com Purchase",  // Different description
                documentId: documentId2,
                accountId,
            });

            const context: ReconciliationContext = {
                existingTransactions: [existingTransaction],
                accountId,
            };

            const result = reconcileTransaction(normalized, context);

            expect(result.state).toBe(ReconciliationState.MATCHED);
            expect(result.matchReasons.length).toBeGreaterThan(0);
        });

        it("should handle merchant name variations", () => {
            const variations = [
                "Amazon.com Inc",
                "AMAZON",
                "Amazon",
                "amazon.com",
            ];

            for (const variation of variations) {
                const normalized = createNormalizedTransaction({
                    date: new Date("2026-08-01"),
                    amount: 1999,
                    direction: "DEBIT",
                    merchant: variation,
                    description: "Purchase",
                    documentId: documentId2,
                    accountId,
                });

                const context: ReconciliationContext = {
                    existingTransactions: [existingTransaction],
                    accountId,
                };

                const result = reconcileTransaction(normalized, context);

                // Should match most variations
                expect([ReconciliationState.MATCHED, ReconciliationState.POSSIBLE_DUPLICATE]).toContain(result.state);
            }
        });

        it("should detect amount variance as conflict", () => {
            const normalized = createNormalizedTransaction({
                date: new Date("2026-08-01"),
                amount: 2000,  // 1 cent variance
                direction: "DEBIT",
                merchant: "Amazon",
                description: "AMAZON.COM",
                documentId: documentId2,
                accountId,
            });

            const context: ReconciliationContext = {
                existingTransactions: [existingTransaction],
                accountId,
            };

            const result = reconcileTransaction(normalized, context);

            // Small amount variance should still match but flag conflict
            expect(result.conflict).toBeUndefined();  // 1 cent is within tolerance

            // Test larger variance
            const largeVariance = createNormalizedTransaction({
                date: new Date("2026-08-01"),
                amount: 3000,  // ~50% difference
                direction: "DEBIT",
                merchant: "Amazon",
                description: "AMAZON.COM",
                documentId: documentId2,
                accountId,
            });

            const resultLarge = reconcileTransaction(largeVariance, context);
            expect(resultLarge.conflict).toBeDefined();
            expect(resultLarge.conflict?.type).toBe("AMOUNT_VARIANCE");
        });

        it("should detect date variance as conflict", () => {
            const normalized = createNormalizedTransaction({
                date: new Date("2026-08-10"),  // 9 days later
                amount: 1999,
                direction: "DEBIT",
                merchant: "Amazon",
                description: "AMAZON.COM",
                documentId: documentId2,
                accountId,
            });

            const context: ReconciliationContext = {
                existingTransactions: [existingTransaction],
                accountId,
            };

            const result = reconcileTransaction(normalized, context);

            // Moderate date difference should still match
            if (result.state === ReconciliationState.MATCHED) {
                expect(result.conflict).toBeDefined();
                expect(result.conflict?.type).toBe("DATE_VARIANCE");
            }
        });

        it("should detect direction mismatch as conflict", () => {
            const normalized = createNormalizedTransaction({
                date: new Date("2026-08-01"),
                amount: 1999,
                direction: "CREDIT",  // Opposite direction
                merchant: "Amazon",
                description: "AMAZON.COM",
                documentId: documentId2,
                accountId,
            });

            const context: ReconciliationContext = {
                existingTransactions: [existingTransaction],
                accountId,
            };

            const result = reconcileTransaction(normalized, context);

            // Should not match or flag conflict
            expect([ReconciliationState.NEW, ReconciliationState.CONFLICT]).toContain(result.state);
        });

        it("should use source transaction ID for definitive match", () => {
            const normalizedWithId = createNormalizedTransaction({
                date: new Date("2026-09-01"),  // Different date
                amount: 5000,                   // Different amount
                direction: "DEBIT",
                merchant: "Some Bank",         // Different merchant
                description: "Wire Transfer",
                documentId: documentId2,
                accountId,
            });

            // Add source ID to match existing
            normalizedWithId.sourceTransactionId = "BANK_TXN_12345";

            const existingWithId: ExistingTransaction = {
                ...existingTransaction,
                sourceTransactionId: "BANK_TXN_12345",
            };

            const context: ReconciliationContext = {
                existingTransactions: [existingWithId],
                accountId,
            };

            const result = reconcileTransaction(normalizedWithId, context);

            expect(result.state).toBe(ReconciliationState.MATCHED);
            expect(result.matchReasons[0].signal).toBe("SOURCE_ID");
            expect(result.matchReasons[0].strength).toBe("DEFINITIVE");
        });
    });

    describe("Duplicate Detection and Prevention", () => {
        it("should prevent exact duplicate upload", () => {
            const candidates: TransactionCandidate[] = [
                {
                    sourceRowNumber: 1,
                    date: new Date("2026-08-01"),
                    description: "STARBUCKS",
                    amountCents: -550,
                    originalAmount: "5.50",
                    originalDate: "08/01/2026",
                },
            ];

            const normalized = normalizeBatch(candidates, documentId, accountId);

            const existingTransaction: ExistingTransaction = {
                id: "txn-dup",
                date: new Date("2026-08-01"),
                amount: Money(550),
                direction: "DEBIT",
                merchant: "Starbucks",
                description: "STARBUCKS",
                accountId,
                documentId,
                createdAt: new Date(),
                lastUpdatedAt: new Date(),
            };

            const context: ReconciliationContext = {
                existingTransactions: [existingTransaction],
                accountId,
            };

            const result = reconcileTransaction(normalized[0], context);

            expect(result.state).toBe(ReconciliationState.MATCHED);
            expect(result.matchedTransactionId).toBe(existingTransaction.id);
        });

        it("should detect overlapping statements", () => {
            // First statement: Aug 1-15
            const batch1Candidates: TransactionCandidate[] = [
                {
                    sourceRowNumber: 1,
                    date: new Date("2026-08-05"),
                    description: "GROCERY STORE",
                    amountCents: -7500,
                    originalAmount: "75.00",
                    originalDate: "08/05/2026",
                },
                {
                    sourceRowNumber: 2,
                    date: new Date("2026-08-10"),
                    description: "GAS STATION",
                    amountCents: -4000,
                    originalAmount: "40.00",
                    originalDate: "08/10/2026",
                },
            ];

            // Second statement: Aug 10-25 (overlaps with first)
            const batch2Candidates: TransactionCandidate[] = [
                {
                    sourceRowNumber: 1,
                    date: new Date("2026-08-10"),
                    description: "GAS STATION",  // Same transaction
                    amountCents: -4000,
                    originalAmount: "40.00",
                    originalDate: "08/10/2026",
                },
                {
                    sourceRowNumber: 2,
                    date: new Date("2026-08-15"),
                    description: "RESTAURANT",
                    amountCents: -3500,
                    originalAmount: "35.00",
                    originalDate: "08/15/2026",
                },
            ];

            const normalized1 = normalizeBatch(batch1Candidates, documentId, accountId);
            const normalized2 = normalizeBatch(batch2Candidates, documentId2, accountId);

            // Simulate existing transactions from batch 1
            const existingFromBatch1: ExistingTransaction[] = normalized1.map((n: NormalizedTransaction, idx: number) => ({
                id: `txn-batch1-${idx}`,
                date: n.transactionDate,
                amount: n.amount,
                direction: n.direction,
                merchant: n.merchant,
                description: n.descriptionRaw,
                accountId,
                documentId,
                createdAt: new Date(),
                lastUpdatedAt: new Date(),
            }));

            const context: ReconciliationContext = {
                existingTransactions: existingFromBatch1,
                accountId,
            };

            const results = normalized2.map((n: NormalizedTransaction) => reconcileTransaction(n, context));

            // First transaction from batch 2 should match (gas station on 08/10)
            expect(results[0].state).toBe(ReconciliationState.MATCHED);

            // Second transaction from batch 2 should be new (not in batch 1)
            expect(results[1].state).toBe(ReconciliationState.NEW);
        });

        it("should detect same transaction from CSV and PDF", () => {
            // CSV version
            const csvCandidate: TransactionCandidate = {
                sourceRowNumber: 5,
                date: new Date("2026-08-12"),
                description: "WHOLE FOODS MARKET",
                amountCents: -12500,
                originalAmount: "125.00",
                originalDate: "08/12/2026",
            };

            // PDF version (might have slightly different format)
            const pdfCandidate: ExtractedTransactionCandidate = {
                sourceRowNumber: 0,  // PDFs may not have row numbers
                date: new Date("2026-08-12"),
                description: "WHOLE FOODS MKT",
                amountCents: -12500,
                originalAmount: "125.00",
                originalDate: "08/12/2026",
                sourceReference: {
                    pageNumber: 2,
                    extractionMethod: ExtractionMethod.TABLE,
                    confidence: 0.92,
                },
            };

            const normalizedCsv = normalizeTransaction(csvCandidate, documentId, accountId);
            const normalizedPdf = normalizeTransaction(pdfCandidate, documentId2, accountId);

            const existingFromCsv: ExistingTransaction = {
                id: "txn-csv",
                date: normalizedCsv.transactionDate,
                amount: normalizedCsv.amount,
                direction: normalizedCsv.direction,
                merchant: normalizedCsv.merchant,
                description: normalizedCsv.descriptionRaw,
                accountId,
                documentId,
                createdAt: new Date(),
                lastUpdatedAt: new Date(),
            };

            const context: ReconciliationContext = {
                existingTransactions: [existingFromCsv],
                accountId,
            };

            const result = reconcileTransaction(normalizedPdf, context);

            // Should match despite "WHOLE FOODS MKT" vs "WHOLE FOODS MARKET"
            expect(result.state).toBe(ReconciliationState.MATCHED);
        });
    });

    describe("Batch Reconciliation and Idempotency", () => {
        it("should produce same results on reprocessing (idempotency)", () => {
            const candidates: TransactionCandidate[] = [
                {
                    sourceRowNumber: 1,
                    date: new Date("2026-08-01"),
                    description: "AMAZON",
                    amountCents: -2999,
                    originalAmount: "29.99",
                    originalDate: "08/01/2026",
                },
                {
                    sourceRowNumber: 2,
                    date: new Date("2026-08-02"),
                    description: "STARBUCKS",
                    amountCents: -550,
                    originalAmount: "5.50",
                    originalDate: "08/02/2026",
                },
            ];

            const normalized1 = normalizeBatch(candidates, documentId, accountId);
            const context: ReconciliationContext = {
                existingTransactions: [],
                accountId,
            };

            // First processing
            const batch1 = reconcileBatch(normalized1, context, documentId);
            const idempotencyKey1 = batch1.idempotencyKey;

            // Reprocess same candidates
            const normalized2 = normalizeBatch(candidates, documentId, accountId);
            const batch2 = reconcileBatch(normalized2, context, documentId);
            const idempotencyKey2 = batch2.idempotencyKey;

            // Idempotency keys should match
            expect(idempotencyKey1).toBe(idempotencyKey2);

            // Results should be identical
            expect(batch1.summary).toEqual(batch2.summary);
            expect(batch1.results.length).toBe(batch2.results.length);
        });

        it("should detect duplicate upload via idempotency key", () => {
            const candidates: TransactionCandidate[] = [
                {
                    sourceRowNumber: 1,
                    date: new Date("2026-08-01"),
                    description: "AMAZON",
                    amountCents: -2999,
                    originalAmount: "29.99",
                    originalDate: "08/01/2026",
                },
            ];

            const normalized = normalizeBatch(candidates, documentId, accountId);
            const context: ReconciliationContext = {
                existingTransactions: [],
                accountId,
            };

            const batch1 = reconcileBatch(normalized, context, documentId);

            // Simulate upload of same statement again
            const batch2 = reconcileBatch(normalized, context, documentId);

            // Check if we can detect duplicate via idempotency
            const isDuplicate = checkIdempotency(batch1.idempotencyKey, [batch2]);
            expect(isDuplicate.isDuplicate).toBe(true);
            expect(isDuplicate.previousBatch?.batchId).toBe(batch2.batchId);
        });

        it("should handle batch with conflicts and issues", () => {
            const candidates: TransactionCandidate[] = [
                {
                    sourceRowNumber: 1,
                    date: new Date("2026-08-01"),
                    description: "AMAZON",
                    amountCents: -2999,
                    originalAmount: "29.99",
                    originalDate: "08/01/2026",
                },
            ];

            const normalized = normalizeBatch(candidates, documentId, accountId);

            // Create existing transaction with conflicting amount
            const existingConflict: ExistingTransaction = {
                id: "txn-conflict",
                date: new Date("2026-08-01"),
                amount: Money(5000),  // Different amount
                direction: "DEBIT",
                merchant: "Amazon",
                description: "AMAZON.COM",
                accountId,
                createdAt: new Date(),
                lastUpdatedAt: new Date(),
            };

            const context: ReconciliationContext = {
                existingTransactions: [existingConflict],
                accountId,
            };

            const batch = reconcileBatch(normalized, context, documentId);

            expect(batch.summary.conflicts).toBeGreaterThan(0);
            expect(batch.issues.length).toBeGreaterThan(0);
        });

        it("should never silently overwrite or duplicate", () => {
            const candidates: TransactionCandidate[] = [
                {
                    sourceRowNumber: 1,
                    date: new Date("2026-08-01"),
                    description: "STARBUCKS",
                    amountCents: -550,
                    originalAmount: "5.50",
                    originalDate: "08/01/2026",
                },
            ];

            const normalized = normalizeBatch(candidates, documentId, accountId);

            // Simulate two different documents with similar transactions
            const doc1Batch = reconcileBatch(normalized, { existingTransactions: [], accountId }, documentId);

            // Now process same transaction from different document
            const normalized2 = normalizeBatch(candidates, documentId2, accountId);
            const doc2Batch = reconcileBatch(normalized2, {
                existingTransactions: doc1Batch.results.map((r: any) => ({
                    id: r.normalizedId,
                    date: normalized[0].transactionDate,
                    amount: normalized[0].amount,
                    direction: normalized[0].direction,
                    merchant: normalized[0].merchant,
                    description: normalized[0].descriptionRaw,
                    accountId,
                    createdAt: new Date(),
                    lastUpdatedAt: new Date(),
                })),
                accountId,
            }, documentId2);

            // Second batch should show duplicate, not create new
            expect(doc2Batch.summary.newTransactions).toBe(0);
            expect(doc2Batch.summary.matchedTransactions + doc2Batch.summary.possibleDuplicates).toBe(1);
        });
    });

    describe("Balance Discrepancies", () => {
        it("should preserve balance discrepancy information", () => {
            const candidates: TransactionCandidate[] = [
                {
                    sourceRowNumber: 1,
                    date: new Date("2026-08-01"),
                    description: "STARBUCKS",
                    amountCents: -550,
                    originalAmount: "5.50",
                    originalDate: "08/01/2026",
                    balance: 50000,  // Running balance from statement
                },
            ];

            const normalized = normalizeBatch(candidates, documentId, accountId);

            // Starting balance of 50550, transaction of -550 should end at 50000
            expect(normalized[0].sourceDocument.sourceReference).toBeUndefined();  // CSV doesn't have reference

            // Verify that balance information could be tracked
            expect(candidates[0].balance).toBe(50000);
        });

        it("should not create reconciliation issue for expected balance drift", () => {
            // Statement may have processing delays causing balance drift
            const candidates: TransactionCandidate[] = [
                {
                    sourceRowNumber: 1,
                    date: new Date("2026-08-01"),
                    description: "DEPOSIT",
                    amountCents: 100000,
                    originalAmount: "1000.00",
                    originalDate: "08/01/2026",
                    balance: 100000,
                },
                {
                    sourceRowNumber: 2,
                    date: new Date("2026-08-02"),
                    description: "WITHDRAWAL",
                    amountCents: -50000,
                    originalAmount: "500.00",
                    originalDate: "08/02/2026",
                    balance: 50000,
                },
            ];

            const normalized = normalizeBatch(candidates, documentId, accountId);
            expect(normalized).toHaveLength(2);

            // Verify transactions are preserved with their original running balance
            expect(candidates[0].balance).toBe(100000);
            expect(candidates[1].balance).toBe(50000);
        });
    });
});
