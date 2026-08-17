/**
 * Shared types and interfaces for route modules
 */

import { Express } from "express";
import {
    HouseholdService,
    ReviewQueueService,
    TransactionPostingService,
} from "@house-fin/domain";
import {
    PgHouseholdRepository,
    PgHouseholdMemberRepository,
    PgAccountRepository,
    PgFinancialSnapshotRepository,
    PgHouseholdSettingsRepository,
    PgFinancialDocumentRepository,
    PgReviewItemRepository,
    PgPostingRepository,
    PgBudgetRepository,
    PgCashFlowRepository,
    PgSavingsGoalRepository,
    PgDebtRepository,
} from "../db/repositories";
import { ObjectStorageAdapter } from "../storage/object-storage";

/**
 * Context passed to each route registration function
 * Contains all dependencies needed by route handlers
 */
export interface RouteContext {
    app: Express;
    // Services
    householdService: HouseholdService;
    reviewQueueService: ReviewQueueService;
    postingService: TransactionPostingService;
    // Repositories
    householdRepo: PgHouseholdRepository;
    memberRepo: PgHouseholdMemberRepository;
    accountRepo: PgAccountRepository;
    snapshotRepo: PgFinancialSnapshotRepository;
    settingsRepo: PgHouseholdSettingsRepository;
    documentRepo: PgFinancialDocumentRepository;
    reviewItemRepo: PgReviewItemRepository;
    postingRepo: PgPostingRepository;
    budgetRepo: PgBudgetRepository;
    cashFlowRepo: PgCashFlowRepository;
    savingsGoalRepo: PgSavingsGoalRepository;
    debtRepo: PgDebtRepository;
    // Storage
    storageAdapter: ObjectStorageAdapter;
}

/**
 * Route registration function type
 */
export type RouteRegistrar = (context: RouteContext) => void;
