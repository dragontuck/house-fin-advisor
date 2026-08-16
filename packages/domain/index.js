"use strict";
/**
 * Domain service for Household, HouseholdMember, and Account operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionPostingService = exports.ReviewQueueService = exports.checkIdempotency = exports.reconcileBatch = exports.reconcileTransaction = exports.createNormalizedTransaction = exports.normalizeBatch = exports.normalizeTransaction = exports.parseStatement = exports.createStatementParserRegistry = exports.StatementParserRegistry = exports.ImageStatementParser = exports.PdfStatementParser = exports.CsvStatementParser = exports.VALID_STATUS_TRANSITIONS = exports.createUserFacingError = exports.isValidStatusTransition = exports.validateFileContent = exports.validateDocumentUpload = exports.generateObjectStorageKey = exports.calculateFileChecksum = exports.createFinancialSnapshotCalculator = exports.FinancialSnapshotCalculator = exports.HouseholdService = void 0;
exports.createHouseholdService = createHouseholdService;
const contracts_1 = require("@house-fin/contracts");
/**
 * HouseholdService - domain service for household operations
 */
class HouseholdService {
    constructor(householdRepo, memberRepo, accountRepo, snapshotRepo, settingsRepo) {
        this.householdRepo = householdRepo;
        this.memberRepo = memberRepo;
        this.accountRepo = accountRepo;
        this.snapshotRepo = snapshotRepo;
        this.settingsRepo = settingsRepo;
    }
    async createHousehold(req) {
        return this.householdRepo.create(req);
    }
    async getHousehold(id) {
        const household = await this.householdRepo.findById(id);
        if (!household) {
            throw new Error(`Household not found: ${id}`);
        }
        return household;
    }
    async getHouseholdMembers(householdId) {
        return this.memberRepo.findByHouseholdId(householdId);
    }
    async addMember(householdId, identityId, displayName, role = contracts_1.HouseholdMemberRole.MEMBER) {
        // Check if member already exists
        const existing = await this.memberRepo.findByIdentityId(householdId, identityId);
        if (existing) {
            throw new Error(`Member ${identityId} already exists in household ${householdId}`);
        }
        return this.memberRepo.create({
            householdId,
            identityId,
            displayName,
            role,
            visibility: contracts_1.HouseholdMemberVisibility.VISIBLE,
        });
    }
    async getHouseholdAccounts(householdId) {
        return this.accountRepo.findByHouseholdId(householdId);
    }
    async addAccount(req) {
        // Validate household exists
        await this.getHousehold(req.householdId);
        return this.accountRepo.create(req);
    }
    async updateAccount(id, update) {
        return this.accountRepo.update(id, update);
    }
    async getLatestSnapshot(householdId) {
        return this.snapshotRepo.findLatestByHouseholdId(householdId);
    }
    async getHouseholdSettings(householdId) {
        return this.settingsRepo.findByHouseholdId(householdId);
    }
    async saveSnapshot(snapshot) {
        return this.snapshotRepo.create(snapshot);
    }
}
exports.HouseholdService = HouseholdService;
/**
 * Factory function to create HouseholdService with repositories
 */
function createHouseholdService(householdRepo, memberRepo, accountRepo, snapshotRepo, settingsRepo) {
    return new HouseholdService(householdRepo, memberRepo, accountRepo, snapshotRepo, settingsRepo);
}
// Export FinancialSnapshotCalculator for deterministic calculations
var snapshot_calculator_1 = require("./snapshot-calculator");
Object.defineProperty(exports, "FinancialSnapshotCalculator", { enumerable: true, get: function () { return snapshot_calculator_1.FinancialSnapshotCalculator; } });
Object.defineProperty(exports, "createFinancialSnapshotCalculator", { enumerable: true, get: function () { return snapshot_calculator_1.createFinancialSnapshotCalculator; } });
// Export Statement domain services
var statements_1 = require("./statements");
Object.defineProperty(exports, "calculateFileChecksum", { enumerable: true, get: function () { return statements_1.calculateFileChecksum; } });
Object.defineProperty(exports, "generateObjectStorageKey", { enumerable: true, get: function () { return statements_1.generateObjectStorageKey; } });
Object.defineProperty(exports, "validateDocumentUpload", { enumerable: true, get: function () { return statements_1.validateDocumentUpload; } });
Object.defineProperty(exports, "validateFileContent", { enumerable: true, get: function () { return statements_1.validateFileContent; } });
Object.defineProperty(exports, "isValidStatusTransition", { enumerable: true, get: function () { return statements_1.isValidStatusTransition; } });
Object.defineProperty(exports, "createUserFacingError", { enumerable: true, get: function () { return statements_1.createUserFacingError; } });
Object.defineProperty(exports, "VALID_STATUS_TRANSITIONS", { enumerable: true, get: function () { return statements_1.VALID_STATUS_TRANSITIONS; } });
// Export Statement Parsers
var csv_statement_parser_1 = require("./csv-statement-parser");
Object.defineProperty(exports, "CsvStatementParser", { enumerable: true, get: function () { return csv_statement_parser_1.CsvStatementParser; } });
var pdf_statement_parser_1 = require("./pdf-statement-parser");
Object.defineProperty(exports, "PdfStatementParser", { enumerable: true, get: function () { return pdf_statement_parser_1.PdfStatementParser; } });
var image_statement_parser_1 = require("./image-statement-parser");
Object.defineProperty(exports, "ImageStatementParser", { enumerable: true, get: function () { return image_statement_parser_1.ImageStatementParser; } });
var statement_parser_registry_1 = require("./statement-parser-registry");
Object.defineProperty(exports, "StatementParserRegistry", { enumerable: true, get: function () { return statement_parser_registry_1.StatementParserRegistry; } });
Object.defineProperty(exports, "createStatementParserRegistry", { enumerable: true, get: function () { return statement_parser_registry_1.createStatementParserRegistry; } });
Object.defineProperty(exports, "parseStatement", { enumerable: true, get: function () { return statement_parser_registry_1.parseStatement; } });
// Export Transaction Normalization
var transaction_normalizer_1 = require("./transaction-normalizer");
Object.defineProperty(exports, "normalizeTransaction", { enumerable: true, get: function () { return transaction_normalizer_1.normalizeTransaction; } });
Object.defineProperty(exports, "normalizeBatch", { enumerable: true, get: function () { return transaction_normalizer_1.normalizeBatch; } });
Object.defineProperty(exports, "createNormalizedTransaction", { enumerable: true, get: function () { return transaction_normalizer_1.createNormalizedTransaction; } });
// Export Transaction Reconciliation
var transaction_reconciler_1 = require("./transaction-reconciler");
Object.defineProperty(exports, "reconcileTransaction", { enumerable: true, get: function () { return transaction_reconciler_1.reconcileTransaction; } });
Object.defineProperty(exports, "reconcileBatch", { enumerable: true, get: function () { return transaction_reconciler_1.reconcileBatch; } });
Object.defineProperty(exports, "checkIdempotency", { enumerable: true, get: function () { return transaction_reconciler_1.checkIdempotency; } });
// Export Review Queue
var review_queue_1 = require("./review-queue");
Object.defineProperty(exports, "ReviewQueueService", { enumerable: true, get: function () { return review_queue_1.ReviewQueueService; } });
// Export Transaction Posting
var posting_service_1 = require("./posting-service");
Object.defineProperty(exports, "TransactionPostingService", { enumerable: true, get: function () { return posting_service_1.TransactionPostingService; } });
//# sourceMappingURL=index.js.map