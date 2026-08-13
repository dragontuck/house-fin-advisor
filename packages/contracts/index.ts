/**
 * Type contracts for the Financial Advisor domain
 * These types are shared across all layers (API, domain, UI)
 */

// UUIDs for domain entities
export type EntityId = string & { readonly __brand: "EntityId" };
export const EntityId = (id: string): EntityId => id as EntityId;

// Money representation - always in cents to avoid float precision issues
export type Money = number & { readonly __brand: "Money" };
export const Money = (cents: number): Money => {
    if (!Number.isInteger(cents)) {
        throw new Error("Money must be an integer number of cents");
    }
    return cents as Money;
};

export const MoneyFromDollars = (dollars: number): Money => {
    return Money(Math.round(dollars * 100));
};

export const MoneyToDollars = (money: Money): number => {
    return money / 100;
};

// Enums
export enum HouseholdMemberRole {
    OWNER = "OWNER",
    MEMBER = "MEMBER",
}

export enum HouseholdMemberVisibility {
    VISIBLE = "VISIBLE",
    HIDDEN = "HIDDEN",
}

export enum AccountType {
    CHECKING = "CHECKING",
    SAVINGS = "SAVINGS",
    CREDIT_CARD = "CREDIT_CARD",
    LOAN = "LOAN",
    RETIREMENT = "RETIREMENT",
    INVESTMENT = "INVESTMENT",
    MORTGAGE = "MORTGAGE",
}

export enum AccountOwnership {
    INDIVIDUAL = "INDIVIDUAL",
    JOINT = "JOINT",
}

export enum AccountStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE",
    CLOSED = "CLOSED",
}

export enum FinancialHealthStatus {
    HEALTHY = "HEALTHY",
    ATTENTION = "ATTENTION",
    AT_RISK = "AT_RISK",
}

// Domain objects
export interface Household {
    id: EntityId;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface HouseholdMember {
    id: EntityId;
    householdId: EntityId;
    identityId: string;
    displayName: string;
    role: HouseholdMemberRole;
    visibility: HouseholdMemberVisibility;
    createdAt: Date;
}

export interface Account {
    id: EntityId;
    householdId: EntityId;
    name: string;
    type: AccountType;
    ownership: AccountOwnership;
    currency: string;
    currentBalance: Money;
    institutionName?: string;
    lastUpdatedAt: Date;
    status: AccountStatus;
    createdAt: Date;
    updatedAt: Date;
}

export interface FinancialSnapshot {
    id: EntityId;
    householdId: EntityId;
    asOf: Date;
    version: number;
    cash: Money;
    debt: Money;
    netWorth: Money;
    monthlyIncome: Money;
    monthlyEssentialExpenses: Money;
    monthlyDiscretionaryExpenses: Money;
    monthlySurplus: Money;
    financialHealthStatus: FinancialHealthStatus;
    sourceAccountIds: EntityId[]; // Which accounts contributed to this snapshot (audit trail)
    calculatedAt: Date;
    createdAt: Date;
}

export interface HouseholdSettings {
    id: EntityId;
    householdId: EntityId;
    monthlyIncome: Money;
    monthlyEssentialExpenses: Money;
    monthlyDiscretionaryExpenses: Money;
    currency: string;
    incomeSource: "manual_entry" | "bank_feed" | "user_provided";
    updatedAt: Date;
    updatedBy: EntityId;
}

// API Request/Response types
export interface CreateHouseholdRequest {
    name: string;
}

export interface CreateHouseholdMemberRequest {
    identityId: string;
    displayName: string;
    role: HouseholdMemberRole;
}

export interface CreateAccountRequest {
    householdId: EntityId;
    name: string;
    type: AccountType;
    ownership: AccountOwnership;
    currentBalance: Money;
    institutionName?: string;
    currency?: string;
}

export interface UpdateAccountRequest {
    name?: string;
    currentBalance?: Money;
    status?: AccountStatus;
}

// Error Response
export interface ErrorResponse {
    userMessage: string;
    errorCode: string;
    correlationId: string;
    retryable: boolean;
    timestamp?: Date;
}

// Financial Pulse - presentation-ready summary
export interface FinancialPulse {
    householdId: EntityId;
    householdName: string;
    asOf: Date;
    healthStatus: FinancialHealthStatus;
    healthMessage: string;
    keyMetrics: {
        netWorth: Money;
        cashAvailable: Money;
        monthlyIncome: Money;
        monthlyExpenses: Money;
        monthlySurplus: Money;
        totalDebt: Money;
    };
    accountsSummary: {
        cash: AccountBalance[];
        retirement: AccountBalance[];
        investments: AccountBalance[];
        debt: AccountBalance[];
    };
    statusMessage: string;
}

export interface AccountBalance {
    name: string;
    balance: Money;
    type: AccountType;
}
