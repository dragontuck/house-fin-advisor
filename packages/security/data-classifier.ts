/**
 * Data Classification System
 *
 * Classifies data values into categories:
 * - PUBLIC: Safe to share externally
 * - INTERNAL: For internal use only
 * - SENSITIVE: Personally identifiable, requires protection
 * - RESTRICTED: Never share externally (account numbers, credentials, PII)
 */

export enum DataClassification {
    PUBLIC = "public",
    INTERNAL = "internal",
    SENSITIVE = "sensitive",
    RESTRICTED = "restricted",
}

/**
 * Patterns for detecting restricted data
 */
export const RESTRICTED_PATTERNS = {
    // Account numbers: typically 8-17 digits
    accountNumber: /^\d{8,17}$/,

    // Routing numbers: exactly 9 digits
    routingNumber: /^\d{9}$/,

    // Credit card: 13-19 digits, potentially with spaces or dashes
    creditCard: /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{3,4}$/,

    // Social Security: XXX-XX-XXXX or XXXXXXXXX format
    ssn: /^(\d{3}-\d{2}-\d{4}|\d{9})$/,

    // EIN (Employer ID): XX-XXXXXXX format
    ein: /^\d{2}-\d{7}$/,

    // API Keys: typically start with sk-, pk-, or similar prefixes
    apiKey: /^(sk_|pk_|api_|secret_)[a-zA-Z0-9_\-]{20,}$/i,

    // JWT Tokens: three parts separated by dots
    jwtToken: /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[-A-Za-z0-9_]+$/,

    // Authentication tokens
    bearerToken: /^Bearer\s+[a-zA-Z0-9._\-]+$/i,

    // Email addresses (can be PII)
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

    // Phone numbers: various formats
    phoneNumber: /^(\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?[2-9]\d{2}[-.\s]?\d{4}$/,

    // URLs with credentials: http://user:pass@host
    urlWithCredentials: /^https?:\/\/[^:]+:[^@]+@/i,

    // PII patterns (for JSON keys)
    keywordPII: /(ssn|social_security|tax_id|ein|account_number|card_number|routing_number|password|secret|credential|token|api_key|phone|cell|mobile|dob|date_of_birth|mother.*maiden|passport)/i,
};

/**
 * Classify a value based on content and context
 */
export function classifyValue(
    value: any,
    key?: string,
    context?: "financial" | "personal" | "authentication" | "general"
): DataClassification {
    // Skip null/undefined
    if (value === null || value === undefined) {
        return DataClassification.PUBLIC;
    }

    // Convert to string for pattern matching
    const strValue = String(value);

    // Check for restricted patterns
    for (const [patternName, pattern] of Object.entries(RESTRICTED_PATTERNS)) {
        if (pattern.test(strValue)) {
            return DataClassification.RESTRICTED;
        }
    }

    // Check key names for PII keywords
    if (key && RESTRICTED_PATTERNS.keywordPII.test(key)) {
        return DataClassification.RESTRICTED;
    }

    // Context-based classification
    if (context === "authentication") {
        return DataClassification.RESTRICTED;
    }

    if (context === "personal") {
        // Names, email, phone considered sensitive
        if (
            strValue.length > 2 &&
            strValue.length < 100 &&
            /^[a-zA-Z\s'-]+$/.test(strValue) &&
            strValue.split(" ").length >= 2
        ) {
            return DataClassification.SENSITIVE;
        }

        if (RESTRICTED_PATTERNS.email.test(strValue)) {
            return DataClassification.SENSITIVE;
        }

        if (RESTRICTED_PATTERNS.phoneNumber.test(strValue)) {
            return DataClassification.SENSITIVE;
        }
    }

    if (context === "financial") {
        // Financial amounts under $0.01 or over $1B are suspicious
        const amount = parseFloat(strValue);
        if (!isNaN(amount)) {
            if (amount < 0 || amount > 1000000000) {
                return DataClassification.INTERNAL;
            }
        }
    }

    // Date values typically public
    if (/^\d{4}-\d{2}-\d{2}/.test(strValue)) {
        return DataClassification.PUBLIC;
    }

    // Numbers (amounts, counts) typically public
    if (/^[\d.,\-]+$/.test(strValue)) {
        return DataClassification.PUBLIC;
    }

    // Default: internal (play it safe)
    return DataClassification.INTERNAL;
}

/**
 * Check if a classification is restricted
 */
export function isRestricted(classification: DataClassification): boolean {
    return classification === DataClassification.RESTRICTED;
}

/**
 * Check if a classification is safe to send externally
 */
export function isSafeForExternal(
    classification: DataClassification
): boolean {
    return classification === DataClassification.PUBLIC;
}

/**
 * Get data classification level name
 */
export function getClassificationName(
    classification: DataClassification
): string {
    switch (classification) {
        case DataClassification.PUBLIC:
            return "PUBLIC";
        case DataClassification.INTERNAL:
            return "INTERNAL";
        case DataClassification.SENSITIVE:
            return "SENSITIVE";
        case DataClassification.RESTRICTED:
            return "RESTRICTED";
    }
}
