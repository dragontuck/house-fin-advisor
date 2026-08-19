/**
 * Privacy Gateway
 *
 * Main boundary enforcement layer for external LLM calls.
 * Ensures all sensitive data is removed before sending to external providers.
 *
 * The external LLM provider MUST be unreachable except through this gateway.
 *
 * Generic implementation that works with any JSON data structure.
 */

import { EntityId } from "@house-fin/contracts";
import {
    classifyValue,
    DataClassification,
    isSafeForExternal,
} from "./data-classifier";
import {
    applySanitizationRules,
    SANITIZATION_RULES,
} from "./sanitization-rules";
import { PrivacyLogger, getPrivacyLogger } from "./privacy-logger";

/**
 * Outbound allowlist - defines what can be sent to external LLMs
 */
export interface OutboundAllowlist {
    // Financial data that can be shared
    amounts: boolean; // Actual dollar amounts
    percentages: boolean; // Percentages like 15%, 0.75
    categories: boolean; // Expense categories like "Groceries", "Utilities"
    summaries: boolean; // Summarized data
    ratios: boolean; // Financial ratios
    trends: boolean; // Trend descriptions

    // Personal data that can be shared
    householdName: boolean; // e.g., "Smith Household"
    numberOfMembers: boolean; // Count of household members
    goals: boolean; // Financial goals text
    preferences: boolean; // User preferences text

    // Metadata
    timestamp: boolean; // Request timestamp
    correlationId: boolean; // Trace ID

    // Data that NEVER can be shared
    rawStatements: boolean; // Should be false
    accountNumbers: boolean; // Should be false
    credentials: boolean; // Should be false
    pii: boolean; // Should be false
}

/**
 * Default allowlist (most restrictive)
 */
export const DEFAULT_ALLOWLIST: OutboundAllowlist = {
    amounts: true,
    percentages: true,
    categories: true,
    summaries: true,
    ratios: true,
    trends: true,
    householdName: false, // Don't send actual names
    numberOfMembers: true,
    goals: false, // Don't send personal goals
    preferences: false, // Don't send preferences
    timestamp: true,
    correlationId: true,
    rawStatements: false,
    accountNumbers: false,
    credentials: false,
    pii: false,
};

/**
 * Sanitized context - flexible structure holding only safe data
 * after passing through the privacy gateway
 */
export interface SanitizedFinancialContext {
    [key: string]: any;
    timestamp?: Date;
    correlationId?: EntityId;
    sanitizationApplied?: boolean;
}

/**
 * Privacy gateway for external LLM calls
 */
export class PrivacyGateway {
    private allowlist: OutboundAllowlist;
    private logger: PrivacyLogger;

    constructor(allowlist?: OutboundAllowlist, logger?: PrivacyLogger) {
        this.allowlist = allowlist || DEFAULT_ALLOWLIST;
        this.logger = logger || getPrivacyLogger();
    }

    /**
     * Sanitize any JSON object for external LLM
     * Recursively walks the object tree, classifying each value and field
     * Rejects if any restricted data is found
     */
    sanitizeContextForLLM(
        context: any,
        correlationId: EntityId
    ): SanitizedFinancialContext {
        // Deep copy to avoid modifying original
        const input = JSON.parse(JSON.stringify(context));

        // Validate - reject if any restricted data found
        this.validateContext(input, correlationId);

        // Extract safe values from context
        const sanitized = this.extractSafeValues(input, correlationId);

        // Add metadata
        return {
            ...sanitized,
            timestamp: new Date(),
            correlationId,
            sanitizationApplied: true,
        };
    }

    /**
     * Check if context is safe for external LLM (allowlist validation)
     */
    isContextSafe(context: any): boolean {
        return this.validateContextAllowlist(context);
    }

    /**
     * Recursively validate that no restricted data exists in object
     * Throws on first violation
     */
    private validateContext(obj: any, correlationId: EntityId, path = "root"): void {
        if (obj === null || obj === undefined) {
            return;
        }

        if (typeof obj !== "object") {
            // Classify the value
            const classification = classifyValue(String(obj), path);
            if (classification === DataClassification.RESTRICTED) {
                this.logger.logDecision(
                    correlationId,
                    path,
                    String(obj),
                    classification,
                    "rejected",
                    `Restricted value in field ${path}`
                );
                throw new Error(
                    `Privacy violation: Restricted data in field ${path}`
                );
            }
            return;
        }

        // Check field names for restricted patterns
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const fieldPath = `${path}.${key}`;
                const classification = classifyValue(obj[key], key);

                if (classification === DataClassification.RESTRICTED) {
                    this.logger.logDecision(
                        correlationId,
                        fieldPath,
                        String(obj[key]),
                        classification,
                        "rejected",
                        `Restricted data in field ${key}`
                    );
                    throw new Error(
                        `Privacy violation: Restricted field ${key}`
                    );
                }

                // Recurse into nested objects
                if (
                    typeof obj[key] === "object" &&
                    obj[key] !== null
                ) {
                    this.validateContext(obj[key], correlationId, fieldPath);
                }
            }
        }
    }

    /**
     * Extract safe values from context
     * Returns only fields that pass classification
     */
    private extractSafeValues(
        obj: any,
        correlationId: EntityId,
        path = "root"
    ): Record<string, any> {
        const safe: Record<string, any> = {};

        if (typeof obj !== "object" || obj === null) {
            return safe;
        }

        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const fieldPath = `${path}.${key}`;
                const value = obj[key];

                // Classify the value
                const classification = classifyValue(value, key);

                if (isSafeForExternal(classification)) {
                    // Log the allowed decision
                    this.logger.logDecision(
                        correlationId,
                        fieldPath,
                        String(value),
                        classification,
                        "allowed",
                        `Safe value in field ${key}`
                    );

                    // Include arrays and objects recursively
                    if (Array.isArray(value)) {
                        safe[key] = value.map((item) => {
                            if (typeof item === "object" && item !== null) {
                                return this.extractSafeValues(
                                    item,
                                    correlationId,
                                    fieldPath
                                );
                            }
                            return item;
                        });
                    } else if (
                        typeof value === "object" &&
                        value !== null
                    ) {
                        safe[key] = this.extractSafeValues(
                            value,
                            correlationId,
                            fieldPath
                        );
                    } else {
                        safe[key] = value;
                    }
                } else if (
                    classification === DataClassification.SENSITIVE
                ) {
                    // Log but don't include
                    this.logger.logDecision(
                        correlationId,
                        fieldPath,
                        String(value),
                        classification,
                        "redacted",
                        `Sensitive value excluded from context`
                    );
                }
            }
        }

        return safe;
    }

    /**
     * Validate that object conforms to allowlist
     */
    private validateContextAllowlist(obj: any): boolean {
        if (obj === null || obj === undefined) {
            return true;
        }

        if (typeof obj !== "object") {
            return true;
        }

        // Check for fields that should never be present (lowercased for matching)
        const forbiddenFields = [
            "accountnumber",
            "account_number",
            "ssn",
            "social_security",
            "creditcard",
            "credit_card",
            "cardnumber",
            "card_number",
            "routingnumber",
            "routing_number",
            "password",
            "apikey",
            "api_key",
            "token",
            "jwt",
            "bearertoken",
            "bearer_token",
            "credentials",
            "privatekey",
            "private_key",
            "secret",
        ];

        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                if (forbiddenFields.includes(key.toLowerCase())) {
                    return false;
                }

                const value = obj[key];
                if (typeof value === "object" && value !== null) {
                    if (!this.validateContextAllowlist(value)) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    /**
     * Get current allowlist configuration
     */
    getAllowlist(): OutboundAllowlist {
        return { ...this.allowlist };
    }

    /**
     * Update allowlist
     */
    setAllowlist(allowlist: OutboundAllowlist): void {
        this.allowlist = allowlist;
    }
}

// Global singleton
let privacyGateway: PrivacyGateway | null = null;

/**
 * Get or create global privacy gateway instance
 */
export function getPrivacyGateway(): PrivacyGateway {
    if (!privacyGateway) {
        privacyGateway = new PrivacyGateway();
    }
    return privacyGateway;
}

/**
 * Set global privacy gateway instance
 */
export function setPrivacyGateway(gateway: PrivacyGateway): void {
    privacyGateway = gateway;
}

/**
 * Wrap an LLM provider with privacy enforcement
 * Prevents direct access except through gateway
 */
export function enforcePrivacyGateway(provider: any): any {
    return new Proxy(provider, {
        get(target, prop) {
            if (prop === "generateResponse") {
                throw new Error(
                    "Direct LLM access blocked. Use PrivacyGateway.sanitizeContextForLLM() first."
                );
            }
            return target[prop];
        },
    });
}
