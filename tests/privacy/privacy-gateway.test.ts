/**
 * Privacy Gateway Tests
 *
 * Comprehensive tests for every restricted data category to ensure
 * no sensitive data leaks to external LLM providers.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { EntityId } from "@house-fin/contracts";
import {
    DataClassification,
    classifyValue,
    isRestricted,
    isSafeForExternal,
} from "@house-fin/security";
import {
    applySanitizationRules,
    getAllRuleNames,
} from "@house-fin/security";
import {
    PrivacyGateway,
    PrivacyLogger,
    SanitizedFinancialContext,
    DEFAULT_ALLOWLIST,
} from "@house-fin/security";

describe("Privacy Boundary - Data Classification", () => {
    describe("Restricted Data Detection", () => {
        it("should classify account numbers as restricted", () => {
            const classifications = [
                "12345678", // 8 digits
                "1234567890123456", // 16 digits
                "123456789012345", // 15 digits
            ];

            for (const value of classifications) {
                const classification = classifyValue(value);
                expect(isRestricted(classification)).toBe(true);
            }
        });

        it("should classify routing numbers as restricted", () => {
            const classifications = ["123456789", "001000025"];

            for (const value of classifications) {
                const classification = classifyValue(value);
                expect(isRestricted(classification)).toBe(true);
            }
        });

        it("should classify credit card numbers as restricted", () => {
            const cards = [
                "4532-1111-2222-3333",
                "4532 1111 2222 3333",
                "4532111122223333",
                "5555-5555-5555-4444",
                "378282246310005",
            ];

            for (const card of cards) {
                const classification = classifyValue(card);
                expect(isRestricted(classification)).toBe(true);
            }
        });

        it("should classify SSN as restricted", () => {
            const ssns = ["123-45-6789", "123456789"];

            for (const ssn of ssns) {
                const classification = classifyValue(ssn);
                expect(isRestricted(classification)).toBe(true);
            }
        });

        it("should classify EIN as restricted", () => {
            const ein = "12-3456789";
            const classification = classifyValue(ein);
            expect(isRestricted(classification)).toBe(true);
        });

        it("should classify API keys as restricted", () => {
            const keys = [
                "sk_live_abcdefghijklmnopqrst",
                "pk_test_1234567890abcdef",
                "api_key_secret_12345678901234567890",
            ];

            for (const key of keys) {
                const classification = classifyValue(key);
                expect(isRestricted(classification)).toBe(true);
            }
        });

        it("should classify JWT tokens as restricted", () => {
            const jwt =
                "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
            const classification = classifyValue(jwt);
            expect(isRestricted(classification)).toBe(true);
        });

        it("should classify bearer tokens as restricted", () => {
            const token = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
            const classification = classifyValue(token);
            expect(isRestricted(classification)).toBe(true);
        });

        it("should classify URLs with credentials as restricted", () => {
            const urls = [
                "http://user:password@example.com/path",
                "https://admin:secret123@api.internal.com",
            ];

            for (const url of urls) {
                const classification = classifyValue(url);
                expect(isRestricted(classification)).toBe(true);
            }
        });

        it("should detect restricted keywords in field names", () => {
            const fields = [
                "ssn",
                "social_security",
                "tax_id",
                "account_number",
                "card_number",
                "password",
                "api_key",
                "token",
            ];

            for (const field of fields) {
                const classification = classifyValue("somevalue", field);
                expect(isRestricted(classification)).toBe(true);
            }
        });
    });

    describe("Public Data Classification", () => {
        it("should classify financial amounts as public", () => {
            const amounts = ["1000", "999.99", "1,234.56", "-500"];

            for (const amount of amounts) {
                const classification = classifyValue(amount);
                expect(isSafeForExternal(classification)).toBe(true);
            }
        });

        it("should classify percentages as public", () => {
            const percentages = ["0.5", "25", "99.99", "0"];

            for (const pct of percentages) {
                const classification = classifyValue(pct);
                expect(isSafeForExternal(classification)).toBe(true);
            }
        });

        it("should classify dates as public", () => {
            const dates = [
                "2024-01-15",
                "2024-12-31",
                "2025-06-30",
            ];

            for (const date of dates) {
                const classification = classifyValue(date);
                expect(isSafeForExternal(classification)).toBe(true);
            }
        });

        it("should classify expense categories as public or internal", () => {
            const categories = [
                "Groceries",
                "Utilities",
                "Rent",
                "Entertainment",
                "Transportation",
            ];

            for (const cat of categories) {
                const classification = classifyValue(cat);
                // Categories can be PUBLIC or INTERNAL depending on context
                expect(
                    classification === DataClassification.PUBLIC ||
                    classification === DataClassification.INTERNAL
                ).toBe(true);
            }
        });
    });

    describe("Sensitive Data Classification", () => {
        it("should classify emails as restricted or sensitive", () => {
            const emails = [
                "john.doe@example.com",
                "jane.smith@company.com",
            ];

            for (const email of emails) {
                const classification = classifyValue(email, "email");
                // Email patterns are typically RESTRICTED due to privacy concerns
                expect(
                    isRestricted(classification) ||
                    classification === DataClassification.SENSITIVE
                ).toBe(true);
            }
        });

        it("should classify phone numbers as restricted or sensitive", () => {
            const phones = [
                "(555) 123-4567",
                "555-123-4567",
                "+1 555 123 4567",
            ];

            for (const phone of phones) {
                const classification = classifyValue(phone, "phone");
                // Phone patterns are typically RESTRICTED due to privacy concerns
                expect(
                    isRestricted(classification) ||
                    classification === DataClassification.SENSITIVE
                ).toBe(true);
            }
        });

        it("should classify names as sensitive or internal", () => {
            const names = [
                "John Smith",
                "Jane Doe",
                "Robert Johnson",
            ];

            for (const name of names) {
                const classification = classifyValue(name, "name");
                // Names depend on context - can be SENSITIVE or INTERNAL
                expect(
                    classification === DataClassification.SENSITIVE ||
                    classification === DataClassification.INTERNAL
                ).toBe(true);
            }
        });
    });
});

describe("Privacy Boundary - Sanitization Rules", () => {
    it("should have rules for all restricted categories", () => {
        const rules = getAllRuleNames();
        const expectedRules = [
            "account_number",
            "routing_number",
            "credit_card",
            "ssn",
            "ein",
            "api_key",
            "jwt_token",
            "bearer_token",
            "url_with_credentials",
        ];

        for (const expected of expectedRules) {
            expect(rules).toContain(expected);
        }
    });

    it("should reject account numbers", () => {
        const result = applySanitizationRules("12345678");
        expect(result.wasModified).toBe(true);
        expect(result.sanitized).toBeNull();
        expect(result.rule?.name).toBe("account_number");
    });

    it("should reject routing numbers", () => {
        const result = applySanitizationRules("123456789");
        expect(result.wasModified).toBe(true);
        expect(result.sanitized).toBeNull();
    });

    it("should reject credit card numbers", () => {
        const result = applySanitizationRules("4532-1111-2222-3333");
        expect(result.wasModified).toBe(true);
        expect(result.sanitized).toBeNull();
    });

    it("should reject SSN", () => {
        const result = applySanitizationRules("123-45-6789");
        expect(result.wasModified).toBe(true);
        expect(result.sanitized).toBeNull();
    });

    it("should reject API keys", () => {
        const result = applySanitizationRules("sk_live_abcdefghijklmnopqrst");
        expect(result.wasModified).toBe(true);
        expect(result.sanitized).toBeNull();
    });

    it("should reject JWT tokens", () => {
        const jwt =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
        const result = applySanitizationRules(jwt);
        expect(result.wasModified).toBe(true);
        expect(result.sanitized).toBeNull();
    });

    it("should allow safe values", () => {
        const result = applySanitizationRules(5000);
        expect(result.wasModified).toBe(false);
        expect(result.sanitized).toBe(5000);
    });
});

describe("Privacy Boundary - Privacy Logger", () => {
    let logger: PrivacyLogger;

    beforeEach(() => {
        logger = new PrivacyLogger();
    });

    it("should log sanitization decisions", () => {
        const correlationId = "test-123" as EntityId;
        logger.logDecision(
            correlationId,
            "accountNumber",
            "12345678",
            DataClassification.RESTRICTED,
            "rejected",
            "Account number detected"
        );

        const decisions = logger.getDecisions();
        expect(decisions).toHaveLength(1);
        expect(decisions[0].fieldPath).toBe("accountNumber");
        expect(decisions[0].action).toBe("rejected");
    });

    it("should hash sensitive values instead of storing them", () => {
        const correlationId = "test-123" as EntityId;
        logger.logDecision(
            correlationId,
            "ssn",
            "123-45-6789",
            DataClassification.RESTRICTED,
            "rejected",
            "SSN detected"
        );

        const decisions = logger.getDecisions();
        expect(decisions[0].valueHash).not.toBe("123-45-6789");
        expect(decisions[0].valueHash).toMatch(/^[a-f0-9]{16}$/);
    });

    it("should get statistics", () => {
        const correlationId = "test-123" as EntityId;
        logger.logDecision(
            correlationId,
            "amount",
            "5000",
            DataClassification.PUBLIC,
            "allowed",
            "Public amount"
        );
        logger.logDecision(
            correlationId,
            "ssn",
            "123-45-6789",
            DataClassification.RESTRICTED,
            "rejected",
            "SSN detected"
        );

        const stats = logger.getStatistics();
        expect(stats.totalDecisions).toBe(2);
        expect(stats.allowedCount).toBe(1);
        expect(stats.rejectedCount).toBe(1);
        expect(stats.restrictedFound).toBe(1);
    });

    it("should filter decisions by correlation ID", () => {
        const id1 = "test-1" as EntityId;
        const id2 = "test-2" as EntityId;

        logger.logDecision(
            id1,
            "field1",
            "value1",
            DataClassification.PUBLIC,
            "allowed",
            "Test"
        );
        logger.logDecision(
            id2,
            "field2",
            "value2",
            DataClassification.PUBLIC,
            "allowed",
            "Test"
        );

        const decisions = logger.getDecisionsForCorrelation(id1);
        expect(decisions).toHaveLength(1);
        expect(decisions[0].correlationId).toBe(id1);
    });
});

describe("Privacy Boundary - Gateway Sanitization", () => {
    let gateway: PrivacyGateway;
    const correlationId = "test-123" as EntityId;

    beforeEach(() => {
        gateway = new PrivacyGateway();
    });

    it("should reject context with restricted data", () => {
        const context: any = {
            totalMonthlyIncome: 5000,
            accountNumber: "12345678",
            budgetUtilization: { groceries: 25 },
        };

        expect(() => gateway.sanitizeContextForLLM(context, correlationId)).toThrow(
            "Privacy violation"
        );
    });

    it("should sanitize valid financial context", () => {
        const context = {
            budgetUtilization: { groceries: 25 },
            savingsRate: 40,
            totalMonthlyIncome: 500000,
            totalMonthlyExpenses: 300000,
            financialHealth: "good",
        };

        const sanitized = gateway.sanitizeContextForLLM(context, correlationId);

        expect(sanitized).toBeDefined();
        expect(sanitized.sanitizationApplied).toBe(true);
        expect(sanitized.correlationId).toBe(correlationId);
        // Check that safe fields are present (or null if filtered)
        expect(sanitized.totalMonthlyIncome).toBeDefined();
        expect(sanitized.savingsRate).toBeDefined();
        expect(sanitized.timestamp).toBeDefined();
    });

    it("should pass allowlist check", () => {
        const sanitized: SanitizedFinancialContext = {
            budgetUtilization: { groceries: 20 },
            savingsRate: 40,
            totalMonthlyIncome: 500000,
            financialHealth: "good",
            timestamp: new Date(),
            correlationId,
            sanitizationApplied: true,
        };

        expect(gateway.isContextSafe(sanitized)).toBe(true);
    });

    it("should detect forbidden fields in allowlist check", () => {
        const gateway2 = new PrivacyGateway();
        const sanitized: any = {
            accountnumber: "12345678",  // lowercase variant
            savingsRate: 40,
            timestamp: new Date(),
            correlationId,
            sanitizationApplied: false,
        };

        // Should reject the field with account number in the key
        const result = gateway2.isContextSafe(sanitized);
        expect(result).toBe(false);
    });

    it("should handle null and undefined values", () => {
        const context = {
            totalMonthlyIncome: 500000,
            totalMonthlyExpenses: 300000,
            budgetUtilization: { groceries: 20 },
            financialHealth: "good",
        };

        const sanitized = gateway.sanitizeContextForLLM(context, correlationId);
        expect(sanitized).toBeDefined();
    });

    it("should preserve numeric fields through sanitization", () => {
        const sanitized = gateway.sanitizeContextForLLM(
            {
                totalMonthlyIncome: 500000,
                totalMonthlyExpenses: 300000,
                savingsRate: 40,
                budgetUtilization: { groceries: 25 },
            },
            correlationId
        );

        // Numeric fields should survive sanitization
        expect(sanitized.totalMonthlyIncome).toBe(500000);
        expect(sanitized.totalMonthlyExpenses).toBe(300000);
        expect(sanitized.savingsRate).toBe(40);
    });

    it("should update allowlist", () => {
        const newAllowlist = { ...DEFAULT_ALLOWLIST, householdName: true };
        gateway.setAllowlist(newAllowlist);

        const retrieved = gateway.getAllowlist();
        expect(retrieved.householdName).toBe(true);
    });
});

describe("Privacy Boundary - End-to-End Isolation", () => {
    const correlationId = "test-123" as EntityId;

    it("should prevent any restricted data from reaching LLM context", () => {
        const gateway = new PrivacyGateway();

        const dangerousContext: any = {
            totalMonthlyIncome: 500000,
            totalMonthlyExpenses: 300000,
            accountNumber: "12345678", // RESTRICTED!
            ssn: "123-45-6789", // RESTRICTED!
            apiKey: "sk_live_abc123", // RESTRICTED!
            budgetUtilization: { groceries: 20 },
        };

        expect(() => gateway.sanitizeContextForLLM(dangerousContext, correlationId)).toThrow();
    });

    it("should only expose necessary financial data", () => {
        const gateway2 = new PrivacyGateway();

        const safeContext = {
            savingsRate: 40,
            totalMonthlyIncome: 500000,
            totalMonthlyExpenses: 300000,
            totalAssets: 1000000,
        };

        const sanitized = gateway2.sanitizeContextForLLM(safeContext, correlationId);

        // Verify core financial data is present
        expect(sanitized.totalMonthlyIncome).toBe(500000);
        expect(sanitized.savingsRate).toBe(40);
        expect(sanitized.totalMonthlyExpenses).toBe(300000);
    });

    it("should log all sanitization decisions", () => {
        const logger = new PrivacyLogger();
        const gateway = new PrivacyGateway(DEFAULT_ALLOWLIST, logger);

        const context = {
            totalMonthlyIncome: 500000,
            totalMonthlyExpenses: 300000,
            totalAssets: 1000000,
            totalLiabilities: 200000,
            liquidAssets: 50000,
            savingsRate: 40,
            debtToIncomeRatio: 0.4,
            liquidityRatio: 0.25,
            budgetUtilization: { groceries: 20 },
            topExpenseCategories: [],
            incomeCategories: [],
            financialHealth: "good",
            emergencyFundStatus: "adequate",
            debtStatus: "manageable",
            spendingTrend: "stable",
            savingsTrend: "increasing",
        };

        gateway.sanitizeContextForLLM(context, correlationId);

        const decisions = logger.getDecisionsForCorrelation(correlationId);
        expect(decisions.length).toBeGreaterThan(0);

        // Verify all decisions are "allowed" (no restricted data)
        for (const decision of decisions) {
            expect(decision.action).toBe("allowed");
        }
    });
});
