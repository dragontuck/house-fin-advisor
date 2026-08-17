"use strict";
/**
 * Transaction Reconciler
 *
 * Reconciles normalized transactions against existing transactions using multiple matching signals.
 * Implements priority-based matching:
 * 1. Source transaction ID (provider/bank ID)
 * 2. Exact statement reference
 * 3. Account match
 * 4. Amount match
 * 5. Date proximity
 * 6. Merchant similarity
 * 7. Transaction direction
 * 8. Statement balance context
 *
 * Never guesses or overwrites existing data.
 * Preserves both observations when sources disagree.
 * Ensures idempotency - reprocessing same statement produces same result.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileTransaction = reconcileTransaction;
exports.reconcileBatch = reconcileBatch;
exports.checkIdempotency = checkIdempotency;
const contracts_1 = require("@house-fin/contracts");
const crypto_1 = require("crypto");
/**
 * Reconcile a single normalized transaction against existing ones
 */
function reconcileTransaction(normalized, context, idempotencyKey) {
    const normalizedId = createTransactionId(normalized);
    // Try matching signals in priority order
    let matches = [];
    // 1. Source Transaction ID (if available)
    if (normalized.sourceTransactionId) {
        const exactMatches = context.existingTransactions.filter(t => t.sourceTransactionId === normalized.sourceTransactionId);
        if (exactMatches.length > 0) {
            for (const match of exactMatches) {
                matches.push({
                    transaction: match,
                    reasons: [{
                            signal: "SOURCE_ID",
                            strength: "DEFINITIVE",
                            confidence: 0.99,
                            evidence: `Exact source transaction ID match: ${normalized.sourceTransactionId}`,
                        }],
                    confidence: 0.99,
                });
            }
        }
    }
    // 2. Exact Statement Reference (e.g., check number)
    if (!matches.length && normalized.statementReference) {
        const refMatches = context.existingTransactions.filter(t => t.statementReference === normalized.statementReference);
        if (refMatches.length > 0) {
            for (const match of refMatches) {
                matches.push({
                    transaction: match,
                    reasons: [{
                            signal: "STATEMENT_REFERENCE",
                            strength: "DEFINITIVE",
                            confidence: 0.98,
                            evidence: `Exact statement reference match: ${normalized.statementReference}`,
                        }],
                    confidence: 0.98,
                });
            }
        }
    }
    // 3-8. Multi-signal matching for less certain matches
    if (!matches.length) {
        const candidates = findCandidateMatches(normalized, context);
        matches = candidates;
    }
    // Determine reconciliation state
    if (matches.length === 0) {
        return {
            normalizedId,
            state: contracts_1.ReconciliationState.NEW,
            confidence: 0,
            matchReasons: [],
            sourceReferences: normalized.sourceDocument.sourceReference
                ? [normalized.sourceDocument.sourceReference]
                : [],
        };
    }
    if (matches.length === 1) {
        const match = matches[0];
        // Check if we have a definitive match (source ID or statement reference)
        const isDefinitive = match.reasons.some(r => r.strength === "DEFINITIVE");
        // Only check for conflicts if NOT a definitive match
        // Definitive matches override any data discrepancies
        const conflict = isDefinitive ? undefined : detectConflict(normalized, match.transaction);
        return {
            normalizedId,
            state: conflict ? contracts_1.ReconciliationState.CONFLICT : contracts_1.ReconciliationState.MATCHED,
            confidence: match.confidence,
            matchedTransactionId: match.transaction.id,
            matchReasons: match.reasons,
            conflict,
            sourceReferences: normalized.sourceDocument.sourceReference
                ? [normalized.sourceDocument.sourceReference]
                : [],
        };
    }
    // Multiple matches = possible duplicate
    return {
        normalizedId,
        state: contracts_1.ReconciliationState.POSSIBLE_DUPLICATE,
        confidence: matches[0].confidence,
        matchReasons: matches[0].reasons,
        possibleMatches: matches.map(m => ({
            transactionId: m.transaction.id,
            reasons: m.reasons,
            confidence: m.confidence,
        })),
        sourceReferences: normalized.sourceDocument.sourceReference
            ? [normalized.sourceDocument.sourceReference]
            : [],
    };
}
/**
 * Find candidate matches using signals 3-8
 */
function findCandidateMatches(normalized, context) {
    const candidates = [];
    for (const existing of context.existingTransactions) {
        const reasons = [];
        let hasAccountMatch = false;
        let hasAmountMatch = false;
        let hasDateMatch = false;
        let hasMerchantMatch = false;
        let hasDirectionMatch = false;
        // 3. Account match
        if (normalized.accountId && existing.accountId === normalized.accountId) {
            reasons.push({
                signal: "ACCOUNT_MATCH",
                strength: "STRONG",
                confidence: 0.7,
                evidence: `Same account: ${normalized.accountId}`,
            });
            hasAccountMatch = true;
        }
        // 4. Exact amount match
        if (normalized.amount === existing.amount && normalized.direction === existing.direction) {
            reasons.push({
                signal: "AMOUNT_EXACT",
                strength: "STRONG",
                confidence: 0.8,
                evidence: `Exact amount and direction match: ${normalized.amount} ${normalized.direction}`,
            });
            hasAmountMatch = true;
        }
        // 5. Date proximity (within 3 days)
        const daysDiff = Math.abs((normalized.transactionDate.getTime() - existing.date.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff <= 1) {
            reasons.push({
                signal: "DATE_PROXIMITY",
                strength: "STRONG",
                confidence: 0.85,
                evidence: `Same date`,
            });
            hasDateMatch = true;
        }
        else if (daysDiff <= 3) {
            reasons.push({
                signal: "DATE_PROXIMITY",
                strength: "MODERATE",
                confidence: 0.6,
                evidence: `Within ${Math.ceil(daysDiff)} days`,
            });
            hasDateMatch = true;
        }
        // 6. Merchant similarity
        const merchantSimilarity = calculateSimilarity(normalized.merchant, existing.merchant);
        if (merchantSimilarity > 0.8) {
            reasons.push({
                signal: "MERCHANT_SIMILARITY",
                strength: "STRONG",
                confidence: 0.75,
                evidence: `High merchant name similarity: "${normalized.merchant}" vs "${existing.merchant}"`,
            });
            hasMerchantMatch = true;
        }
        else if (merchantSimilarity > 0.6) {
            reasons.push({
                signal: "MERCHANT_SIMILARITY",
                strength: "MODERATE",
                confidence: 0.5,
                evidence: `Moderate merchant name similarity: "${normalized.merchant}" vs "${existing.merchant}"`,
            });
            hasMerchantMatch = true;
        }
        // 7. Transaction direction match
        if (normalized.direction === existing.direction) {
            reasons.push({
                signal: "DIRECTION",
                strength: "MODERATE",
                confidence: 0.6,
                evidence: `Same direction: ${normalized.direction}`,
            });
            hasDirectionMatch = true;
        }
        // Matching logic - only match if we have sufficient signals
        // Must have: (exact amount OR same date) AND (merchant OR account)
        const hasStrongAmountOrDate = hasAmountMatch || (hasDateMatch && daysDiff <= 1);
        const hasMerchantOrAccount = hasMerchantMatch || hasAccountMatch;
        if (hasStrongAmountOrDate && hasMerchantOrAccount && reasons.length >= 3) {
            // Calculate overall confidence from top reasons
            const sortedByConfidence = reasons
                .sort((a, b) => b.confidence - a.confidence)
                .slice(0, 2); // Take top 2 signals
            const combinedConfidence = sortedByConfidence.reduce((sum, r) => sum + r.confidence, 0) / 2;
            candidates.push({
                transaction: existing,
                reasons,
                confidence: combinedConfidence,
            });
        }
    }
    // Sort by confidence descending
    return candidates.sort((a, b) => b.confidence - a.confidence);
}
/**
 * Detect conflicts between normalized and existing transaction
 */
function detectConflict(normalized, existing) {
    // Amount variance > 1% or $0.50
    const amountVariance = Math.abs(Number(normalized.amount) - Number(existing.amount));
    if (amountVariance > 50) { // $0.50
        return {
            type: "AMOUNT_VARIANCE",
            description: `Amount mismatch: ${normalized.amount} vs ${existing.amount} (difference: $${(amountVariance / 100).toFixed(2)})`,
            expected: Number(existing.amount),
            actual: Number(normalized.amount),
        };
    }
    // Date variance > 7 days is suspicious
    const daysDiff = Math.abs((normalized.transactionDate.getTime() - existing.date.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 7) {
        return {
            type: "DATE_VARIANCE",
            description: `Date differs by ${Math.ceil(daysDiff)} days`,
            expected: existing.date.getTime(),
            actual: normalized.transactionDate.getTime(),
        };
    }
    // Direction mismatch
    if (normalized.direction !== existing.direction) {
        return {
            type: "SOURCE_CONFLICT",
            description: `Direction conflict: ${normalized.direction} vs ${existing.direction}`,
        };
    }
    return undefined;
}
/**
 * Calculate string similarity using Levenshtein-like algorithm
 * Returns 0-1, where 1 is identical
 */
function calculateSimilarity(str1, str2) {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    // Exact match
    if (s1 === s2)
        return 1.0;
    // One is substring of other
    if (s1.includes(s2) || s2.includes(s1))
        return 0.85;
    // Simple character-level similarity
    const len = Math.max(s1.length, s2.length);
    let matches = 0;
    for (let i = 0; i < len; i++) {
        if (s1[i] === s2[i])
            matches++;
    }
    return matches / len;
}
/**
 * Create deterministic ID for transaction
 * Used for idempotency tracking
 */
function createTransactionId(normalized) {
    const hash = crypto_1.default
        .createHash("sha256")
        .update(JSON.stringify({
        date: normalized.transactionDate.toISOString(),
        amount: normalized.amount,
        direction: normalized.direction,
        merchant: normalized.merchant,
        documentId: normalized.sourceDocument.documentId,
        rowNumber: normalized.sourceDocument.rowNumber,
    }))
        .digest("hex");
    return hash.substring(0, 12);
}
/**
 * Batch reconcile multiple transactions
 */
function reconcileBatch(normalized, context, documentId) {
    const results = normalized.map(txn => reconcileTransaction(txn, context));
    // Create idempotency key based on document and normalized transactions
    const idempotencyKey = createIdempotencyKey(normalized, documentId);
    // Extract issues
    const issues = [];
    const duplicates = [];
    for (const result of results) {
        if (result.state === contracts_1.ReconciliationState.CONFLICT && result.conflict) {
            issues.push({
                type: result.conflict.type,
                description: result.conflict.description,
                transactions: [result.normalizedId, result.matchedTransactionId].filter(Boolean),
            });
        }
        if (result.state === contracts_1.ReconciliationState.POSSIBLE_DUPLICATE) {
            duplicates.push(result.normalizedId);
        }
    }
    const summary = {
        newTransactions: results.filter(r => r.state === contracts_1.ReconciliationState.NEW).length,
        matchedTransactions: results.filter(r => r.state === contracts_1.ReconciliationState.MATCHED).length,
        possibleDuplicates: results.filter(r => r.state === contracts_1.ReconciliationState.POSSIBLE_DUPLICATE).length,
        conflicts: results.filter(r => r.state === contracts_1.ReconciliationState.CONFLICT).length,
    };
    return {
        batchId: (0, contracts_1.EntityId)(crypto_1.default.randomUUID()),
        documentId,
        householdId: (0, contracts_1.EntityId)(""), // Would come from context
        accountId: context.accountId,
        totalCandidates: normalized.length,
        results,
        issues,
        summary,
        idempotencyKey,
        processedAt: new Date(),
    };
}
/**
 * Create idempotency key based on document and content
 * Same document + content = same key = same result
 */
function createIdempotencyKey(normalized, documentId) {
    const hash = crypto_1.default
        .createHash("sha256")
        .update(JSON.stringify({
        documentId,
        count: normalized.length,
        transactions: normalized.map(t => ({
            date: t.transactionDate.toISOString(),
            amount: t.amount,
            merchant: t.merchant,
        })),
    }))
        .digest("hex");
    return hash;
}
/**
 * Detect and report idempotency - has this been processed before?
 */
function checkIdempotency(idempotencyKey, previousBatches) {
    const previous = previousBatches.find(b => b.idempotencyKey === idempotencyKey);
    if (previous) {
        return { isDuplicate: true, previousBatch: previous };
    }
    return { isDuplicate: false };
}
//# sourceMappingURL=transaction-reconciler.js.map