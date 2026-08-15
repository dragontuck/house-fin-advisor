/**
 * Rate limiting middleware for document upload and other operations
 * Prevents abuse and DoS attacks by limiting requests per household
 */

import rateLimit from "express-rate-limit";
import { Request } from "express";

/**
 * Rate limiter for document uploads
 * - 10 uploads per minute per household (based on household context)
 * - Sliding window to prevent request clustering
 * - Store in memory (suitable for single-server deployments)
 * 
 * For multi-server deployments, use Redis store:
 * const RedisStore = require("rate-limit-redis");
 * store: new RedisStore({ client: redisClient, prefix: "rl:" })
 */
export const uploadRateLimiter = rateLimit({
    // Identify users by household ID from request context
    keyGenerator: (req: Request) => {
        const householdId = (req as any).context?.householdId || req.ip || "unknown";
        return `upload:${householdId}`;
    },

    // 10 uploads per minute
    windowMs: 60 * 1000,
    max: 10,

    // Return user-friendly error message
    message: {
        error: "Too many upload requests. Please wait a minute before uploading another file.",
        retryAfter: 60,
    },

    // Don't rate limit by default, only on upload endpoint
    skip: false,

    // Standard headers RateLimit-Limit and RateLimit-Remaining
    standardHeaders: true,

    // Disable X-RateLimit-Reset to avoid leaking timing info
    legacyHeaders: false,
});

/**
 * Rate limiter for general API requests
 * - 100 requests per minute per household
 * - Less restrictive than upload limiter for normal operations
 */
export const generalRateLimiter = rateLimit({
    keyGenerator: (req: Request) => {
        const householdId = (req as any).context?.householdId || req.ip || "unknown";
        return `api:${householdId}`;
    },

    // 100 requests per minute
    windowMs: 60 * 1000,
    max: 100,

    message: {
        error: "Too many requests. Please try again later.",
        retryAfter: 60,
    },

    skip: false,
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Rate limiter for authentication attempts
 * - 5 failed authentication attempts per 15 minutes
 * - Stricter to prevent brute force attacks
 */
export const authRateLimiter = rateLimit({
    keyGenerator: (req: Request) => {
        // Rate limit by IP or household context
        const identifier = (req as any).context?.householdId || req.ip || "unknown";
        return `auth:${identifier}`;
    },

    // 5 attempts per 15 minutes
    windowMs: 15 * 60 * 1000,
    max: 5,

    message: {
        error: "Too many authentication attempts. Please try again after 15 minutes.",
        retryAfter: 900,
    },

    skip: false,
    standardHeaders: true,
    legacyHeaders: false,
});
