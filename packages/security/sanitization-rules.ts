/**
 * Sanitization Rules
 *
 * Defines how to sanitize different types of restricted data.
 * Rules include redaction patterns, placeholder strategies, and rejection conditions.
 */

import {
    classifyValue,
    DataClassification,
    RESTRICTED_PATTERNS,
} from "./data-classifier";

export interface SanitizationRule {
    name: string;
    description: string;
    pattern: RegExp;
    action: "redact" | "reject" | "replace";
    replacement?: string | ((value: string) => string);
}

/**
 * Sanitization rules for different restricted data types
 */
export const SANITIZATION_RULES: SanitizationRule[] = [
    {
        name: "account_number",
        description: "Bank account numbers",
        pattern: RESTRICTED_PATTERNS.accountNumber,
        action: "reject",
        replacement: "***ACCOUNT_NUMBER***",
    },
    {
        name: "routing_number",
        description: "Bank routing numbers",
        pattern: RESTRICTED_PATTERNS.routingNumber,
        action: "reject",
        replacement: "***ROUTING_NUMBER***",
    },
    {
        name: "credit_card",
        description: "Credit card numbers",
        pattern: RESTRICTED_PATTERNS.creditCard,
        action: "reject",
        replacement: "***CARD***",
    },
    {
        name: "ssn",
        description: "Social Security Numbers",
        pattern: RESTRICTED_PATTERNS.ssn,
        action: "reject",
        replacement: "***SSN***",
    },
    {
        name: "ein",
        description: "Employer Identification Numbers",
        pattern: RESTRICTED_PATTERNS.ein,
        action: "reject",
        replacement: "***EIN***",
    },
    {
        name: "api_key",
        description: "API keys and secrets",
        pattern: RESTRICTED_PATTERNS.apiKey,
        action: "reject",
        replacement: "***API_KEY***",
    },
    {
        name: "jwt_token",
        description: "JWT authentication tokens",
        pattern: RESTRICTED_PATTERNS.jwtToken,
        action: "reject",
        replacement: "***TOKEN***",
    },
    {
        name: "bearer_token",
        description: "Bearer tokens",
        pattern: RESTRICTED_PATTERNS.bearerToken,
        action: "reject",
        replacement: "***TOKEN***",
    },
    {
        name: "url_with_credentials",
        description: "URLs containing credentials",
        pattern: RESTRICTED_PATTERNS.urlWithCredentials,
        action: "reject",
        replacement: "***URL_WITH_CREDENTIALS***",
    },
];

/**
 * Apply sanitization rules to a value
 */
export function applySanitizationRules(
    value: any,
    fieldKey?: string
): { sanitized: any; rule?: SanitizationRule; wasModified: boolean } {
    if (value === null || value === undefined) {
        return { sanitized: value, wasModified: false };
    }

    const strValue = String(value);
    const classification = classifyValue(value, fieldKey);

    // Check if restricted
    if (classification === DataClassification.RESTRICTED) {
        // Find matching rule
        for (const rule of SANITIZATION_RULES) {
            if (rule.pattern.test(strValue)) {
                if (rule.action === "reject") {
                    return {
                        sanitized: null,
                        rule,
                        wasModified: true,
                    };
                } else if (rule.action === "redact") {
                    const replacement =
                        typeof rule.replacement === "function"
                            ? rule.replacement(strValue)
                            : rule.replacement || "***REDACTED***";
                    return {
                        sanitized: replacement,
                        rule,
                        wasModified: true,
                    };
                } else if (rule.action === "replace") {
                    return {
                        sanitized:
                            rule.replacement || "***REDACTED***",
                        rule,
                        wasModified: true,
                    };
                }
            }
        }

        // Fallback: reject anything classified as restricted
        return {
            sanitized: null,
            wasModified: true,
        };
    }

    return { sanitized: value, wasModified: false };
}

/**
 * Get a rule by name
 */
export function getRuleByName(name: string): SanitizationRule | undefined {
    return SANITIZATION_RULES.find((rule) => rule.name === name);
}

/**
 * Get all rule names
 */
export function getAllRuleNames(): string[] {
    return SANITIZATION_RULES.map((rule) => rule.name);
}
