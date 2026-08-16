"use strict";
/**
 * Type contracts for the Financial Advisor domain
 * These types are shared across all layers (API, domain, UI)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewStatus = exports.ReviewSeverity = exports.ReviewType = exports.ReconciliationState = exports.ExtractionMethod = exports.DocumentSourceType = exports.DocumentProcessingStatus = exports.FinancialHealthStatus = exports.AccountStatus = exports.AccountOwnership = exports.AccountType = exports.HouseholdMemberVisibility = exports.HouseholdMemberRole = exports.MoneyToDollars = exports.MoneyFromDollars = exports.Money = exports.EntityId = void 0;
const EntityId = (id) => id;
exports.EntityId = EntityId;
const Money = (cents) => {
    if (!Number.isInteger(cents)) {
        throw new Error("Money must be an integer number of cents");
    }
    return cents;
};
exports.Money = Money;
const MoneyFromDollars = (dollars) => {
    return (0, exports.Money)(Math.round(dollars * 100));
};
exports.MoneyFromDollars = MoneyFromDollars;
const MoneyToDollars = (money) => {
    return money / 100;
};
exports.MoneyToDollars = MoneyToDollars;
// Enums
var HouseholdMemberRole;
(function (HouseholdMemberRole) {
    HouseholdMemberRole["OWNER"] = "OWNER";
    HouseholdMemberRole["MEMBER"] = "MEMBER";
})(HouseholdMemberRole || (exports.HouseholdMemberRole = HouseholdMemberRole = {}));
var HouseholdMemberVisibility;
(function (HouseholdMemberVisibility) {
    HouseholdMemberVisibility["VISIBLE"] = "VISIBLE";
    HouseholdMemberVisibility["HIDDEN"] = "HIDDEN";
})(HouseholdMemberVisibility || (exports.HouseholdMemberVisibility = HouseholdMemberVisibility = {}));
var AccountType;
(function (AccountType) {
    AccountType["CHECKING"] = "CHECKING";
    AccountType["SAVINGS"] = "SAVINGS";
    AccountType["CREDIT_CARD"] = "CREDIT_CARD";
    AccountType["LOAN"] = "LOAN";
    AccountType["RETIREMENT"] = "RETIREMENT";
    AccountType["INVESTMENT"] = "INVESTMENT";
    AccountType["MORTGAGE"] = "MORTGAGE";
})(AccountType || (exports.AccountType = AccountType = {}));
var AccountOwnership;
(function (AccountOwnership) {
    AccountOwnership["INDIVIDUAL"] = "INDIVIDUAL";
    AccountOwnership["JOINT"] = "JOINT";
})(AccountOwnership || (exports.AccountOwnership = AccountOwnership = {}));
var AccountStatus;
(function (AccountStatus) {
    AccountStatus["ACTIVE"] = "ACTIVE";
    AccountStatus["INACTIVE"] = "INACTIVE";
    AccountStatus["CLOSED"] = "CLOSED";
})(AccountStatus || (exports.AccountStatus = AccountStatus = {}));
var FinancialHealthStatus;
(function (FinancialHealthStatus) {
    FinancialHealthStatus["HEALTHY"] = "HEALTHY";
    FinancialHealthStatus["ATTENTION"] = "ATTENTION";
    FinancialHealthStatus["AT_RISK"] = "AT_RISK";
})(FinancialHealthStatus || (exports.FinancialHealthStatus = FinancialHealthStatus = {}));
// Document/Statement types for Slice 2
var DocumentProcessingStatus;
(function (DocumentProcessingStatus) {
    DocumentProcessingStatus["UPLOADED"] = "UPLOADED";
    DocumentProcessingStatus["VALIDATING"] = "VALIDATING";
    DocumentProcessingStatus["VALIDATION_FAILED"] = "VALIDATION_FAILED";
    DocumentProcessingStatus["IDENTIFYING"] = "IDENTIFYING";
    DocumentProcessingStatus["PARSING"] = "PARSING";
    DocumentProcessingStatus["PARSE_FAILED"] = "PARSE_FAILED";
    DocumentProcessingStatus["NORMALIZING"] = "NORMALIZING";
    DocumentProcessingStatus["RECONCILING"] = "RECONCILING";
    DocumentProcessingStatus["REVIEW_REQUIRED"] = "REVIEW_REQUIRED";
    DocumentProcessingStatus["READY_TO_POST"] = "READY_TO_POST";
    DocumentProcessingStatus["POSTING"] = "POSTING";
    DocumentProcessingStatus["COMPLETED"] = "COMPLETED";
    DocumentProcessingStatus["PARTIALLY_COMPLETED"] = "PARTIALLY_COMPLETED";
    DocumentProcessingStatus["FAILED"] = "FAILED";
})(DocumentProcessingStatus || (exports.DocumentProcessingStatus = DocumentProcessingStatus = {}));
var DocumentSourceType;
(function (DocumentSourceType) {
    DocumentSourceType["CSV"] = "CSV";
    DocumentSourceType["PDF"] = "PDF";
    DocumentSourceType["IMAGE"] = "IMAGE";
    DocumentSourceType["MANUAL"] = "MANUAL";
})(DocumentSourceType || (exports.DocumentSourceType = DocumentSourceType = {}));
// PDF and Image parsing extensions
/**
 * Extraction method used to obtain transaction data from document
 */
var ExtractionMethod;
(function (ExtractionMethod) {
    ExtractionMethod["TEXT"] = "TEXT";
    ExtractionMethod["TABLE"] = "TABLE";
    ExtractionMethod["OCR"] = "OCR";
    ExtractionMethod["HYBRID"] = "HYBRID";
})(ExtractionMethod || (exports.ExtractionMethod = ExtractionMethod = {}));
/**
 * Transaction reconciliation state
 */
var ReconciliationState;
(function (ReconciliationState) {
    ReconciliationState["NEW"] = "NEW";
    ReconciliationState["MATCHED"] = "MATCHED";
    ReconciliationState["POSSIBLE_DUPLICATE"] = "POSSIBLE_DUPLICATE";
    ReconciliationState["CONFLICT"] = "CONFLICT";
})(ReconciliationState || (exports.ReconciliationState = ReconciliationState = {}));
// Review Queue Types
/**
 * Types of reviews that require human attention
 */
var ReviewType;
(function (ReviewType) {
    ReviewType["AMBIGUOUS_TRANSACTION"] = "AMBIGUOUS_TRANSACTION";
    ReviewType["POSSIBLE_DUPLICATE"] = "POSSIBLE_DUPLICATE";
    ReviewType["RECONCILIATION_CONFLICT"] = "RECONCILIATION_CONFLICT";
    ReviewType["UNKNOWN_ACCOUNT"] = "UNKNOWN_ACCOUNT";
    ReviewType["UNKNOWN_STATEMENT_PERIOD"] = "UNKNOWN_STATEMENT_PERIOD";
    ReviewType["PARSE_WARNING"] = "PARSE_WARNING";
    ReviewType["BALANCE_MISMATCH"] = "BALANCE_MISMATCH";
})(ReviewType || (exports.ReviewType = ReviewType = {}));
/**
 * Severity level of a review item
 */
var ReviewSeverity;
(function (ReviewSeverity) {
    ReviewSeverity["INFO"] = "INFO";
    ReviewSeverity["WARNING"] = "WARNING";
    ReviewSeverity["ERROR"] = "ERROR";
})(ReviewSeverity || (exports.ReviewSeverity = ReviewSeverity = {}));
/**
 * Status of a review item
 */
var ReviewStatus;
(function (ReviewStatus) {
    ReviewStatus["PENDING"] = "PENDING";
    ReviewStatus["IN_PROGRESS"] = "IN_PROGRESS";
    ReviewStatus["RESOLVED"] = "RESOLVED";
    ReviewStatus["ARCHIVED"] = "ARCHIVED";
})(ReviewStatus || (exports.ReviewStatus = ReviewStatus = {}));
//# sourceMappingURL=index.js.map