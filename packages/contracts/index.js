"use strict";
/**
 * Type contracts for the Financial Advisor domain
 * These types are shared across all layers (API, domain, UI)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttentionItemStatus = exports.AttentionSeverity = exports.AttentionItemType = exports.DebtCategory = exports.DebtHealthStatus = exports.EmergencyFundTrend = exports.EmergencyFundStatus = exports.GoalStatus = exports.GoalType = exports.ForecastConfidence = exports.RecurringFrequency = exports.BudgetStatus = exports.BudgetCategory = exports.ReviewStatus = exports.ReviewSeverity = exports.ReviewType = exports.ReconciliationState = exports.ExtractionMethod = exports.DocumentSourceType = exports.DocumentProcessingStatus = exports.FinancialHealthStatus = exports.AccountStatus = exports.AccountOwnership = exports.AccountType = exports.HouseholdMemberVisibility = exports.HouseholdMemberRole = exports.MoneyToDollars = exports.MoneyFromDollars = exports.Money = exports.EntityId = void 0;
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
    FinancialHealthStatus["WATCH"] = "WATCH";
    FinancialHealthStatus["AT_RISK"] = "AT_RISK";
    FinancialHealthStatus["CRITICAL"] = "CRITICAL";
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
// ── Slice 3: Budget types ──────────────────────────────────────────────────
/** Standard spending categories. Stored as VARCHAR; custom strings are allowed. */
var BudgetCategory;
(function (BudgetCategory) {
    BudgetCategory["HOUSING"] = "HOUSING";
    BudgetCategory["UTILITIES"] = "UTILITIES";
    BudgetCategory["GROCERIES"] = "GROCERIES";
    BudgetCategory["DINING_OUT"] = "DINING_OUT";
    BudgetCategory["TRANSPORTATION"] = "TRANSPORTATION";
    BudgetCategory["FUEL"] = "FUEL";
    BudgetCategory["INSURANCE"] = "INSURANCE";
    BudgetCategory["HEALTHCARE"] = "HEALTHCARE";
    BudgetCategory["SUBSCRIPTIONS"] = "SUBSCRIPTIONS";
    BudgetCategory["ENTERTAINMENT"] = "ENTERTAINMENT";
    BudgetCategory["CLOTHING"] = "CLOTHING";
    BudgetCategory["PERSONAL_CARE"] = "PERSONAL_CARE";
    BudgetCategory["EDUCATION"] = "EDUCATION";
    BudgetCategory["CHILDCARE"] = "CHILDCARE";
    BudgetCategory["SAVINGS_CONTRIBUTION"] = "SAVINGS_CONTRIBUTION";
    BudgetCategory["DEBT_PAYMENT"] = "DEBT_PAYMENT";
    BudgetCategory["OTHER"] = "OTHER";
})(BudgetCategory || (exports.BudgetCategory = BudgetCategory = {}));
var BudgetStatus;
(function (BudgetStatus) {
    BudgetStatus["ON_TRACK"] = "ON_TRACK";
    BudgetStatus["OVER_BUDGET"] = "OVER_BUDGET";
    BudgetStatus["UNBUDGETED"] = "UNBUDGETED";
    BudgetStatus["NO_SPENDING"] = "NO_SPENDING";
})(BudgetStatus || (exports.BudgetStatus = BudgetStatus = {}));
// ── Slice 3: Cash Flow & Recurring Detection types ─────────────────────────
var RecurringFrequency;
(function (RecurringFrequency) {
    RecurringFrequency["WEEKLY"] = "WEEKLY";
    RecurringFrequency["BIWEEKLY"] = "BIWEEKLY";
    RecurringFrequency["MONTHLY"] = "MONTHLY";
    RecurringFrequency["QUARTERLY"] = "QUARTERLY";
    RecurringFrequency["ANNUAL"] = "ANNUAL";
    RecurringFrequency["IRREGULAR"] = "IRREGULAR";
    RecurringFrequency["UNKNOWN"] = "UNKNOWN";
})(RecurringFrequency || (exports.RecurringFrequency = RecurringFrequency = {}));
var ForecastConfidence;
(function (ForecastConfidence) {
    ForecastConfidence["HIGH"] = "HIGH";
    ForecastConfidence["MEDIUM"] = "MEDIUM";
    ForecastConfidence["LOW"] = "LOW";
})(ForecastConfidence || (exports.ForecastConfidence = ForecastConfidence = {}));
// ── Slice 3: Savings Goals & Emergency Fund ───────────────────────────────────
var GoalType;
(function (GoalType) {
    GoalType["EMERGENCY_FUND"] = "EMERGENCY_FUND";
    GoalType["VACATION"] = "VACATION";
    GoalType["ENTERTAINMENT"] = "ENTERTAINMENT";
    GoalType["PROJECT"] = "PROJECT";
    GoalType["RETIREMENT"] = "RETIREMENT";
    GoalType["CUSTOM"] = "CUSTOM";
})(GoalType || (exports.GoalType = GoalType = {}));
var GoalStatus;
(function (GoalStatus) {
    GoalStatus["ON_TRACK"] = "ON_TRACK";
    GoalStatus["AHEAD"] = "AHEAD";
    GoalStatus["BEHIND"] = "BEHIND";
    GoalStatus["AT_RISK"] = "AT_RISK";
    GoalStatus["COMPLETED"] = "COMPLETED";
})(GoalStatus || (exports.GoalStatus = GoalStatus = {}));
var EmergencyFundStatus;
(function (EmergencyFundStatus) {
    EmergencyFundStatus["CRITICAL"] = "CRITICAL";
    EmergencyFundStatus["WATCH"] = "WATCH";
    EmergencyFundStatus["ADEQUATE"] = "ADEQUATE";
    EmergencyFundStatus["ON_TARGET"] = "ON_TARGET";
    EmergencyFundStatus["FULLY_FUNDED"] = "FULLY_FUNDED";
})(EmergencyFundStatus || (exports.EmergencyFundStatus = EmergencyFundStatus = {}));
var EmergencyFundTrend;
(function (EmergencyFundTrend) {
    EmergencyFundTrend["IMPROVING"] = "IMPROVING";
    EmergencyFundTrend["STABLE"] = "STABLE";
    EmergencyFundTrend["DECLINING"] = "DECLINING";
    EmergencyFundTrend["UNKNOWN"] = "UNKNOWN";
})(EmergencyFundTrend || (exports.EmergencyFundTrend = EmergencyFundTrend = {}));
// ── Debt Intelligence ─────────────────────────────────────────────────────────
var DebtHealthStatus;
(function (DebtHealthStatus) {
    DebtHealthStatus["HEALTHY"] = "HEALTHY";
    DebtHealthStatus["WATCH"] = "WATCH";
    DebtHealthStatus["AT_RISK"] = "AT_RISK";
    DebtHealthStatus["CRITICAL"] = "CRITICAL";
})(DebtHealthStatus || (exports.DebtHealthStatus = DebtHealthStatus = {}));
/** Broad category used in debt rollup calculations. */
var DebtCategory;
(function (DebtCategory) {
    DebtCategory["REVOLVING"] = "REVOLVING";
    DebtCategory["INSTALLMENT"] = "INSTALLMENT";
    DebtCategory["MORTGAGE"] = "MORTGAGE";
    DebtCategory["UNKNOWN"] = "UNKNOWN";
})(DebtCategory || (exports.DebtCategory = DebtCategory = {}));
// ── Financial Health & Attention Engine ──────────────────────────────────────
var AttentionItemType;
(function (AttentionItemType) {
    AttentionItemType["BUDGET_OVER"] = "BUDGET_OVER";
    AttentionItemType["CASH_FLOW_WARNING"] = "CASH_FLOW_WARNING";
    AttentionItemType["EMERGENCY_FUND_LOW"] = "EMERGENCY_FUND_LOW";
    AttentionItemType["GOAL_BEHIND"] = "GOAL_BEHIND";
    AttentionItemType["DEBT_INCREASE"] = "DEBT_INCREASE";
    AttentionItemType["DATA_STALE"] = "DATA_STALE";
    AttentionItemType["RECURRING_EXPENSE_CHANGE"] = "RECURRING_EXPENSE_CHANGE";
})(AttentionItemType || (exports.AttentionItemType = AttentionItemType = {}));
var AttentionSeverity;
(function (AttentionSeverity) {
    AttentionSeverity["INFO"] = "INFO";
    AttentionSeverity["WARNING"] = "WARNING";
    AttentionSeverity["CRITICAL"] = "CRITICAL";
})(AttentionSeverity || (exports.AttentionSeverity = AttentionSeverity = {}));
var AttentionItemStatus;
(function (AttentionItemStatus) {
    AttentionItemStatus["ACTIVE"] = "ACTIVE";
    AttentionItemStatus["DISMISSED"] = "DISMISSED";
    AttentionItemStatus["RESOLVED"] = "RESOLVED";
})(AttentionItemStatus || (exports.AttentionItemStatus = AttentionItemStatus = {}));
//# sourceMappingURL=index.js.map