/**
 * Security Package Exports
 */

export {
    DataClassification,
    RESTRICTED_PATTERNS,
    classifyValue,
    isRestricted,
    isSafeForExternal,
    getClassificationName,
} from "./data-classifier";

export {
    SanitizationDecision,
    PrivacyLogger,
    getPrivacyLogger,
    setPrivacyLogger,
} from "./privacy-logger";

export {
    SanitizationRule,
    SANITIZATION_RULES,
    applySanitizationRules,
    getRuleByName,
    getAllRuleNames,
} from "./sanitization-rules";

export {
    OutboundAllowlist,
    SanitizedFinancialContext,
    DEFAULT_ALLOWLIST,
    PrivacyGateway,
    getPrivacyGateway,
    setPrivacyGateway,
    enforcePrivacyGateway,
} from "./privacy-gateway";
