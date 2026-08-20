/**
 * Route Registration Coordinator
 * Centralizes all route module registration
 */

import { Express } from "express";
import { RouteContext, RouteRegistrar } from "./types";
import { registerCoreRoutes } from "./core";
import { registerDocumentRoutes } from "./documents";
import { registerPostingRoutes } from "./posting";
import { registerBudgetRoutes } from "./budgets";
import { registerBudgetApprovalRoutes } from "./budget-approval";
import { registerCashFlowRoutes } from "./cash-flow";
import { registerGoalsRoutes } from "./goals";
import { registerDebtRoutes } from "./debt";
import { registerHealthRoutes } from "./health";
import { registerSnapshotRoutes } from "./snapshots";
import { registerAdvisorConversationRoutes } from "./advisor-conversations";
import { registerToolExecutionRoutes } from "./tool-execution";
import { registerOrchestratorRoutes } from "./ai-orchestrator";

/**
 * All route registrars to be called in order
 * Order: Core → Documents → Posting → Financial Analysis → Budget Approval → Health Intelligence → Advisor Conversations → AI Orchestration → Tools
 */
const routeRegistrars: RouteRegistrar[] = [
    registerCoreRoutes,                    // Household, accounts, pulse
    registerDocumentRoutes,                // Document upload, status, listing
    registerPostingRoutes,                 // Statement posting, categorization
    registerBudgetRoutes,                  // Budget CRUD and variance
    registerBudgetApprovalRoutes,          // Budget approval workflow (proposals, approval, audit)
    registerCashFlowRoutes,                // Cash flow analysis
    registerGoalsRoutes,                   // Savings goals and emergency fund
    registerDebtRoutes,                    // Debt intelligence and accounts
    registerSnapshotRoutes,                // Snapshots and historical data
    registerHealthRoutes,                  // Health analysis and attention items
    registerAdvisorConversationRoutes,     // Conversational advisor with intent classification
    registerOrchestratorRoutes,            // AI orchestrator with tool planning and execution
    registerToolExecutionRoutes,           // AI tool execution endpoints
];

/**
 * Register all routes
 * Call all route modules to register their endpoints on the Express app
 * @param context - RouteContext with all dependencies (services, repos, etc.)
 */
export const registerAllRoutes = (context: RouteContext): void => {
    for (const registrar of routeRegistrars) {
        registrar(context);
    }
};

/**
 * Export individual route registrars for granular control or testing
 */
export {
    registerCoreRoutes,
    registerDocumentRoutes,
    registerPostingRoutes,
    registerBudgetRoutes,
    registerCashFlowRoutes,
    registerGoalsRoutes,
    registerDebtRoutes,
    registerHealthRoutes,
    registerSnapshotRoutes,
    registerAdvisorConversationRoutes,
    registerOrchestratorRoutes,
    registerToolExecutionRoutes,
};
