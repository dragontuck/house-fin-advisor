/**
 * AI Audit & Metrics Routes (admin-facing)
 *
 * Lets an administrator answer "what did the AI do" for a given conversation/proposal without
 * exposing financial payloads, and exposes the operational metrics defined for AI auditability.
 */

import { Request, Response, NextFunction } from "express";
import { RouteContext, RouteRegistrar } from "./types";
import { EntityId } from "@house-fin/contracts";

class AdminAuditError extends Error {
    constructor(
        public statusCode: number,
        public userMessage: string,
        public errorCode: string
    ) {
        super(userMessage);
        this.name = "AdminAuditError";
    }
}

export const registerAIAuditRoutes: RouteRegistrar = (context: RouteContext) => {
    const { app, aiAuditLogRepo, conversationRepo, budgetApprovalRepo } = context;

    /**
     * GET /admin/ai-audit/conversations/:conversationId
     *
     * Full metadata trail for a conversation: every AI request (workflow, tools requested/
     * executed, versions, provider/model, validation outcome) plus the live status of any
     * linked budget proposal - answers "what did the AI do when it created this budget proposal?"
     */
    app.get(
        "/admin/ai-audit/conversations/:conversationId",
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { conversationId } = req.params;

                const conversation = await conversationRepo.findById(conversationId as EntityId);
                if (!conversation) {
                    throw new AdminAuditError(404, "Conversation not found", "CONVERSATION_NOT_FOUND");
                }

                const [entries, linkedProposals] = await Promise.all([
                    aiAuditLogRepo.findByConversationId(conversationId as EntityId),
                    budgetApprovalRepo.findProposalsByConversationId(conversationId as EntityId),
                ]);

                res.json({
                    conversationId,
                    householdId: conversation.householdId,
                    currentWorkflow: conversation.currentWorkflow,
                    entries,
                    entryCount: entries.length,
                    // Live proposal status - never duplicated into ai_audit_log itself.
                    linkedProposals: linkedProposals.map((p) => ({
                        id: p.id,
                        periodYear: p.periodYear,
                        periodMonth: p.periodMonth,
                        status: p.status,
                        financialSnapshotId: p.financialSnapshotId,
                        snapshotVersion: p.snapshotVersion,
                        createdAt: p.createdAt,
                        updatedAt: p.updatedAt,
                    })),
                });
            } catch (error) {
                next(error);
            }
        }
    );

    /**
     * GET /admin/ai-metrics?startDate=...&endDate=...
     *
     * Operational metrics for AI advisor usage over a time range. Defaults to the last 24 hours.
     */
    app.get(
        "/admin/ai-metrics",
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
                const startDate = req.query.startDate
                    ? new Date(req.query.startDate as string)
                    : new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

                if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
                    throw new AdminAuditError(400, "Invalid startDate/endDate", "INVALID_DATE_RANGE");
                }

                const metrics = await aiAuditLogRepo.getMetrics(startDate, endDate);
                res.json(metrics);
            } catch (error) {
                next(error);
            }
        }
    );
};

export const aiAuditErrorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (err instanceof AdminAuditError) {
        return res.status(err.statusCode).json({
            userMessage: err.userMessage,
            errorCode: err.errorCode,
        });
    }
    next(err);
};
