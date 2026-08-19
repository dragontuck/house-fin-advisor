/**
 * Privacy-Safe Logging
 *
 * Logs sanitization decisions without exposing sensitive values.
 * Uses hashing for sensitive data identification without storing the values.
 */

import crypto from "crypto";
import { EntityId } from "@house-fin/contracts";
import {
    DataClassification,
    getClassificationName,
} from "./data-classifier";

export interface SanitizationDecision {
    timestamp: Date;
    correlationId: EntityId;
    fieldPath: string;
    originalClassification: DataClassification;
    action: "allowed" | "redacted" | "rejected";
    valueHash: string; // SHA256 hash of original value (non-reversible)
    reason: string;
}

/**
 * Privacy logger for sanitization decisions
 */
export class PrivacyLogger {
    private decisions: SanitizationDecision[] = [];

    /**
     * Log a sanitization decision
     * Never logs the actual sensitive value, only a hash for tracking
     */
    logDecision(
        correlationId: EntityId,
        fieldPath: string,
        value: any,
        classification: DataClassification,
        action: "allowed" | "redacted" | "rejected",
        reason: string
    ): void {
        const decision: SanitizationDecision = {
            timestamp: new Date(),
            correlationId,
            fieldPath,
            originalClassification: classification,
            action,
            valueHash: this.hashValue(value),
            reason,
        };

        this.decisions.push(decision);

        // Log to console in development
        if (process.env.NODE_ENV !== "production") {
            const className = getClassificationName(classification);
            console.log(
                `[PRIVACY] ${action.toUpperCase()} (${className}): ${fieldPath} - ${reason}`
            );
        }
    }

    /**
     * Hash a value for tracking without storing it
     * Uses SHA256 for one-way hashing
     */
    private hashValue(value: any): string {
        if (value === null || value === undefined) {
            return "null";
        }

        const str = String(value);
        // Only hash first 50 chars to prevent accidental storage of large data
        const truncated = str.substring(0, 50);
        return crypto
            .createHash("sha256")
            .update(truncated)
            .digest("hex")
            .substring(0, 16); // Truncate hash for readability
    }

    /**
     * Get all decisions (for testing/audit)
     */
    getDecisions(): SanitizationDecision[] {
        return [...this.decisions];
    }

    /**
     * Get decisions for a specific correlation ID
     */
    getDecisionsForCorrelation(correlationId: EntityId): SanitizationDecision[] {
        return this.decisions.filter((d) => d.correlationId === correlationId);
    }

    /**
     * Get sanitization statistics
     */
    getStatistics(): {
        totalDecisions: number;
        allowedCount: number;
        redactedCount: number;
        rejectedCount: number;
        restrictedFound: number;
    } {
        return {
            totalDecisions: this.decisions.length,
            allowedCount: this.decisions.filter((d) => d.action === "allowed")
                .length,
            redactedCount: this.decisions.filter((d) => d.action === "redacted")
                .length,
            rejectedCount: this.decisions.filter((d) => d.action === "rejected")
                .length,
            restrictedFound: this.decisions.filter(
                (d) =>
                    d.originalClassification === DataClassification.RESTRICTED
            ).length,
        };
    }

    /**
     * Clear all decisions (useful for testing)
     */
    clear(): void {
        this.decisions = [];
    }
}

/**
 * Global privacy logger instance
 */
let globalLogger: PrivacyLogger | null = null;

export function getPrivacyLogger(): PrivacyLogger {
    if (!globalLogger) {
        globalLogger = new PrivacyLogger();
    }
    return globalLogger;
}

export function setPrivacyLogger(logger: PrivacyLogger): void {
    globalLogger = logger;
}
