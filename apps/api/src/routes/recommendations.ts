import { NextFunction, Request, Response } from "express";
import { EntityId, RecommendationStatus, RecommendationType } from "@house-fin/contracts";
import { RouteRegistrar } from "./types";

const STATUS_TRANSITIONS: Record<RecommendationStatus, RecommendationStatus[]> = {
    [RecommendationStatus.PROPOSED]: [RecommendationStatus.REVIEWED, RecommendationStatus.APPROVED, RecommendationStatus.DECLINED, RecommendationStatus.EXPIRED, RecommendationStatus.INVALIDATED],
    [RecommendationStatus.REVIEWED]: [RecommendationStatus.APPROVED, RecommendationStatus.DECLINED, RecommendationStatus.EXPIRED, RecommendationStatus.INVALIDATED],
    [RecommendationStatus.APPROVED]: [RecommendationStatus.INVALIDATED],
    [RecommendationStatus.DECLINED]: [],
    [RecommendationStatus.EXPIRED]: [],
    [RecommendationStatus.INVALIDATED]: [],
};

export const registerRecommendationRoutes: RouteRegistrar = (context) => {
    const { app, recommendationRepo, recommendationVersionRepo } = context;
    if (!recommendationRepo || !recommendationVersionRepo) return;

    app.get("/household/recommendations", async (req: Request, res: Response, next: NextFunction) => {
        try {
            await recommendationRepo.expireOverdue(req.context.householdId);
            const status = typeof req.query.status === "string" ? req.query.status as RecommendationStatus : undefined;
            const type = typeof req.query.type === "string" ? req.query.type as RecommendationType : undefined;
            const recommendations = await recommendationRepo.findByHouseholdId(
                req.context.householdId,
                Math.min(Number(req.query.limit) || 50, 100),
                Number(req.query.offset) || 0,
                status,
                type
            );
            res.json({ recommendations });
        } catch (error) {
            next(error);
        }
    });

    app.get("/household/recommendations/:recommendationId", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const recommendation = await recommendationRepo.findById(
                req.params.recommendationId as EntityId,
                req.context.householdId
            );
            if (!recommendation) {
                res.status(404).json({ userMessage: "Recommendation not found.", errorCode: "RECOMMENDATION_NOT_FOUND" });
                return;
            }
            res.json({ recommendation });
        } catch (error) {
            next(error);
        }
    });

    app.get("/household/recommendations/:recommendationId/versions", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const recommendationId = req.params.recommendationId as EntityId;
            const recommendation = await recommendationRepo.findById(recommendationId, req.context.householdId);
            if (!recommendation) {
                res.status(404).json({ userMessage: "Recommendation not found.", errorCode: "RECOMMENDATION_NOT_FOUND" });
                return;
            }
            const versions = await recommendationVersionRepo.findByRecommendationId(recommendationId, req.context.householdId);
            res.json({ versions });
        } catch (error) {
            next(error);
        }
    });

    app.patch("/household/recommendations/:recommendationId/status", async (req: Request, res: Response, next: NextFunction) => {
        try {
            const memberId = req.headers["x-member-id"] as EntityId | undefined;
            const nextStatus = req.body?.status as RecommendationStatus;
            if (!memberId || !Object.values(RecommendationStatus).includes(nextStatus)) {
                res.status(400).json({ userMessage: "A member and valid status are required.", errorCode: "INVALID_STATUS_REQUEST" });
                return;
            }
            const current = await recommendationRepo.findById(req.params.recommendationId as EntityId, req.context.householdId);
            if (!current) {
                res.status(404).json({ userMessage: "Recommendation not found.", errorCode: "RECOMMENDATION_NOT_FOUND" });
                return;
            }
            if (!STATUS_TRANSITIONS[current.approval.status].includes(nextStatus)) {
                res.status(422).json({ userMessage: "That recommendation status can no longer be changed this way.", errorCode: "INVALID_STATUS_TRANSITION" });
                return;
            }
            const recommendation = await recommendationRepo.updateStatus(
                current.id,
                current.householdId,
                req.body,
                memberId
            );
            res.json({ recommendation });
        } catch (error) {
            next(error);
        }
    });
};
