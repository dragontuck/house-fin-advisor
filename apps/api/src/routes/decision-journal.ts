import { NextFunction, Request, Response } from "express";
import { EntityId, RecordDecisionJournalDecisionRequest } from "@house-fin/contracts";
import { RouteContext, RouteRegistrar } from "./types";

class DecisionJournalError extends Error {
    constructor(
        public statusCode: number,
        public userMessage: string,
        public errorCode: string
    ) {
        super(userMessage);
        this.name = "DecisionJournalError";
    }
}

export const registerDecisionJournalRoutes: RouteRegistrar = (context: RouteContext) => {
    const { app, decisionJournalRepo, conversationRepo } = context;

    app.get("/recommendations/:recommendationId/journal", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const record = await decisionJournalRepo.findByRecommendationId(
                req.params.recommendationId as EntityId,
                req.context!.householdId
            );
            if (!record) {
                throw new DecisionJournalError(404, "Recommendation history not found.", "DECISION_JOURNAL_NOT_FOUND");
            }
            res.json(record);
        } catch (error) {
            next(error);
        }
    });

    app.get("/conversations/:conversationId/decision-journal", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;
            const conversationId = req.params.conversationId as EntityId;
            const conversation = await conversationRepo.findById(conversationId);
            if (!conversation || conversation.householdId !== householdId) {
                throw new DecisionJournalError(404, "Conversation history not found.", "DECISION_JOURNAL_NOT_FOUND");
            }
            res.json(await decisionJournalRepo.findByConversationId(conversationId, householdId));
        } catch (error) {
            next(error);
        }
    });

    app.post("/recommendations/:recommendationId/decision", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const householdId = req.context!.householdId;
            const memberId = req.headers["x-member-id"] as EntityId | undefined;
            const body = req.body as RecordDecisionJournalDecisionRequest;
            if (!memberId) {
                throw new DecisionJournalError(400, "Member ID is required.", "MISSING_MEMBER_ID");
            }
            if (body.decision !== "APPROVED" && body.decision !== "DECLINED") {
                throw new DecisionJournalError(400, "Decision must be APPROVED or DECLINED.", "INVALID_DECISION");
            }

            const decision = await decisionJournalRepo.recordDecision(
                req.params.recommendationId as EntityId,
                householdId,
                memberId,
                body
            );
            res.status(201).json(decision);
        } catch (error) {
            next(error);
        }
    });
};