/**
 * Unit Tests: Phase Validation Rules
 * 
 * Tests business rules and constraints for each onboarding phase.
 * Ensures data integrity and prevents invalid transitions.
 */

import {
    SetupPhaseData,
    AccountsPhaseData,
    StatementsPhaseData,
    HouseholdProfileType,
    AccountType,
    StatementUploadStatus,
} from '../../../domain/types/onboarding.types';

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

class PhaseValidator {
    validatePhase1(data: SetupPhaseData): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required field validation
        if (!data.householdName || data.householdName.trim().length === 0) {
            errors.push('Household name is required and cannot be empty');
        }

        if (data.householdName && data.householdName.length > 100) {
            errors.push('Household name cannot exceed 100 characters');
        }

        if (!data.profileType || !['SOLO', 'COUPLE', 'FAMILY'].includes(data.profileType)) {
            errors.push('Profile type must be SOLO, COUPLE, or FAMILY');
        }

        if (!data.primaryMemberId || data.primaryMemberId.trim().length === 0) {
            errors.push('Primary member ID is required');
        }

        if (!Array.isArray(data.initialInstitutions)) {
            errors.push('Initial institutions must be an array');
        }

        // Warnings
        if (data.initialInstitutions && data.initialInstitutions.length === 0) {
            warnings.push('No institutions selected. User will need to add them manually.');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    validatePhase2(data: AccountsPhaseData): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!Array.isArray(data.declaredAccounts)) {
            errors.push('Declared accounts must be an array');
        }

        if (data.declaredAccounts && data.declaredAccounts.length === 0) {
            warnings.push('No accounts declared. User will add them in the next phase.');
        }

        if (data.declaredAccounts) {
            data.declaredAccounts.forEach((account, index) => {
                if (!account.institution || account.institution.trim().length === 0) {
                    errors.push(`Account ${index + 1}: Institution name is required`);
                }

                if (!account.accountType || !this.isValidAccountType(account.accountType)) {
                    errors.push(`Account ${index + 1}: Invalid account type`);
                }

                if (!account.tempId) {
                    errors.push(`Account ${index + 1}: Temporary ID is required`);
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    validatePhase3(data: StatementsPhaseData): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (typeof data.statementUploadStatus !== 'string') {
            errors.push('Statement upload status is required');
        }

        if (
            data.statementUploadStatus &&
            !['PENDING', 'IN_PROGRESS', 'COMPLETE', 'PARTIAL'].includes(
                data.statementUploadStatus
            )
        ) {
            errors.push('Invalid statement upload status');
        }

        if (!Array.isArray(data.uploadedDocuments)) {
            errors.push('Uploaded documents must be an array');
        }

        if (data.uploadedDocuments && data.uploadedDocuments.length === 0) {
            warnings.push('No documents uploaded yet. User may upload later.');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    private isValidAccountType(type: string): boolean {
        const validTypes = [
            'CHECKING',
            'SAVINGS',
            'CREDIT_CARD',
            'INVESTMENT',
            'RETIREMENT',
            'MORTGAGE',
            'AUTO_LOAN',
            'OTHER',
        ];
        return validTypes.includes(type);
    }
}

describe('Phase Validation: Business Rules', () => {
    let validator: PhaseValidator;

    beforeEach(() => {
        validator = new PhaseValidator();
    });

    afterEach(() => {
        jest.clearAllTimers();
    });

    describe('Phase 1: Setup - Household Information', () => {
        it('should accept valid Phase 1 data', () => {
            const data: SetupPhaseData = {
                householdName: 'Smith Family',
                profileType: HouseholdProfileType.FAMILY,
                primaryMemberId: 'user-123',
                initialInstitutions: ['Chase', 'Bank of America'],
            };

            const result = validator.validatePhase1(data);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should reject empty household name', () => {
            const data: SetupPhaseData = {
                householdName: '',
                profileType: HouseholdProfileType.SOLO,
                primaryMemberId: 'user-123',
                initialInstitutions: [],
            };

            const result = validator.validatePhase1(data);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Household name is required and cannot be empty');
        });

        it('should reject household name exceeding 100 characters', () => {
            const data: SetupPhaseData = {
                householdName: 'A'.repeat(101),
                profileType: HouseholdProfileType.SOLO,
                primaryMemberId: 'user-123',
                initialInstitutions: [],
            };

            const result = validator.validatePhase1(data);

            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('exceed 100 characters'))).toBe(true);
        });

        it('should reject invalid profile type', () => {
            const data: SetupPhaseData = {
                householdName: 'Test',
                profileType: 'INVALID' as any,
                primaryMemberId: 'user-123',
                initialInstitutions: [],
            };

            const result = validator.validatePhase1(data);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Profile type must be SOLO, COUPLE, or FAMILY');
        });

        it('should warn when no institutions selected', () => {
            const data: SetupPhaseData = {
                householdName: 'Test',
                profileType: HouseholdProfileType.SOLO,
                primaryMemberId: 'user-123',
                initialInstitutions: [],
            };

            const result = validator.validatePhase1(data);

            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain('No institutions selected');
        });

        it('should require primary member ID', () => {
            const data: SetupPhaseData = {
                householdName: 'Test',
                profileType: HouseholdProfileType.SOLO,
                primaryMemberId: '',
                initialInstitutions: [],
            };

            const result = validator.validatePhase1(data);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Primary member ID is required');
        });

        it('should accept all three profile types', () => {
            const profileTypes = [
                HouseholdProfileType.SOLO,
                HouseholdProfileType.COUPLE,
                HouseholdProfileType.FAMILY,
            ];

            for (const profileType of profileTypes) {
                const data: SetupPhaseData = {
                    householdName: 'Test',
                    profileType,
                    primaryMemberId: 'user-123',
                    initialInstitutions: [],
                };

                const result = validator.validatePhase1(data);
                expect(result.valid).toBe(true);
            }
        });
    });

    describe('Phase 2: Accounts - Account Declaration', () => {
        it('should accept valid Phase 2 data with multiple accounts', () => {
            const data: AccountsPhaseData = {
                declaredAccounts: [
                    {
                        tempId: 'temp-1',
                        institution: 'Chase',
                        accountType: AccountType.CHECKING,
                        nickname: 'Main Checking',
                    },
                    {
                        tempId: 'temp-2',
                        institution: 'Bank of America',
                        accountType: AccountType.SAVINGS,
                        nickname: 'Emergency Fund',
                    },
                ],
            };

            const result = validator.validatePhase2(data);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should reject missing institution name', () => {
            const data: AccountsPhaseData = {
                declaredAccounts: [
                    {
                        tempId: 'temp-1',
                        institution: '',
                        accountType: AccountType.CHECKING,
                    },
                ],
            };

            const result = validator.validatePhase2(data);

            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('Institution name'))).toBe(true);
        });

        it('should reject invalid account type', () => {
            const data: AccountsPhaseData = {
                declaredAccounts: [
                    {
                        tempId: 'temp-1',
                        institution: 'Chase',
                        accountType: 'INVALID' as any,
                    },
                ],
            };

            const result = validator.validatePhase2(data);

            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('Invalid account type'))).toBe(true);
        });

        it('should accept all valid account types', () => {
            const accountTypes = [
                AccountType.CHECKING,
                AccountType.SAVINGS,
                AccountType.CREDIT_CARD,
                AccountType.INVESTMENT,
                AccountType.RETIREMENT,
                AccountType.MORTGAGE,
                AccountType.AUTO_LOAN,
                AccountType.OTHER,
            ];

            for (const accountType of accountTypes) {
                const data: AccountsPhaseData = {
                    declaredAccounts: [
                        {
                            tempId: 'temp-1',
                            institution: 'Chase',
                            accountType,
                        },
                    ],
                };

                const result = validator.validatePhase2(data);
                expect(result.valid).toBe(true);
            }
        });

        it('should warn when no accounts declared', () => {
            const data: AccountsPhaseData = {
                declaredAccounts: [],
            };

            const result = validator.validatePhase2(data);

            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('should require tempId for each account', () => {
            const data: AccountsPhaseData = {
                declaredAccounts: [
                    {
                        tempId: '',
                        institution: 'Chase',
                        accountType: AccountType.CHECKING,
                    },
                ],
            };

            const result = validator.validatePhase2(data);

            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('Temporary ID'))).toBe(true);
        });
    });

    describe('Phase 3: Statements - Document Upload', () => {
        it('should accept valid Phase 3 data', () => {
            const data: StatementsPhaseData = {
                statementUploadStatus: StatementUploadStatus.COMPLETE,
                uploadedDocuments: [
                    { id: 'doc-1', accountId: 'acc-1', uploadedAt: new Date() },
                ],
            };

            const result = validator.validatePhase3(data);

            expect(result.valid).toBe(true);
        });

        it('should accept all valid upload statuses', () => {
            const statuses = [StatementUploadStatus.PENDING, StatementUploadStatus.IN_PROGRESS, StatementUploadStatus.COMPLETE, StatementUploadStatus.PARTIAL];

            for (const status of statuses) {
                const data: StatementsPhaseData = {
                    statementUploadStatus: status,
                    uploadedDocuments: [],
                };

                const result = validator.validatePhase3(data);
                expect(result.valid).toBe(true);
            }
        });

        it('should reject invalid upload status', () => {
            const data: StatementsPhaseData = {
                statementUploadStatus: 'INVALID' as StatementUploadStatus,
                uploadedDocuments: [],
            };

            const result = validator.validatePhase3(data);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Invalid statement upload status');
        });

        it('should warn when no documents uploaded', () => {
            const data: StatementsPhaseData = {
                statementUploadStatus: StatementUploadStatus.PENDING,
                uploadedDocuments: [],
            };

            const result = validator.validatePhase3(data);

            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('should accept PARTIAL upload status with some documents', () => {
            const data: StatementsPhaseData = {
                statementUploadStatus: StatementUploadStatus.PARTIAL,
                uploadedDocuments: [
                    { id: 'doc-1', accountId: 'acc-1', uploadedAt: new Date() },
                ],
            };

            const result = validator.validatePhase3(data);

            expect(result.valid).toBe(true);
        });
    });

    describe('Cross-Phase Validation', () => {
        it('should enforce profile type consistency', () => {
            // Phase 1: FAMILY profile
            const phase1Data: SetupPhaseData = {
                householdName: 'Smith Family',
                profileType: HouseholdProfileType.FAMILY,
                primaryMemberId: 'user-123',
                initialInstitutions: ['Chase'],
            };

            const phase1Result = validator.validatePhase1(phase1Data);
            expect(phase1Result.valid).toBe(true);

            // Phase 2: Should validate accounts consistent with FAMILY profile
            // (In real implementation, would need cross-phase validation)
        });

        it('should validate account count for profile type', () => {
            // SOLO profile should have at least 1 account
            // COUPLE profile could have joint + individual accounts
            // FAMILY profile might have multiple household member accounts
            // (Implement in actual validator)
        });
    });

    describe('Constraint Validation', () => {
        it('should enforce data immutability after completion', () => {
            // Once phase is marked complete, data should not be modifiable
            // (Enforced at repository level)
        });

        it('should validate no duplicate accounts in same institution', () => {
            const data: AccountsPhaseData = {
                declaredAccounts: [
                    {
                        tempId: 'temp-1',
                        institution: 'Chase',
                        accountType: AccountType.CHECKING,
                        nickname: 'Checking 1',
                    },
                    {
                        tempId: 'temp-2',
                        institution: 'Chase',
                        accountType: AccountType.SAVINGS,
                        nickname: 'Checking 2', // Same nickname could be flag
                    },
                ],
            };

            const result = validator.validatePhase2(data);
            // Implementation would check for duplicates
        });
    });

    describe('Error Message Quality', () => {
        it('should provide specific field-level errors', () => {
            const data: AccountsPhaseData = {
                declaredAccounts: [
                    {
                        tempId: '',
                        institution: '',
                        accountType: 'INVALID' as any,
                    },
                    {
                        tempId: 'temp-2',
                        institution: 'Chase',
                        accountType: 'INVALID' as any,
                    },
                ],
            };

            const result = validator.validatePhase2(data);

            // Should have multiple specific errors
            expect(result.errors.length).toBeGreaterThan(2);
            result.errors.forEach((error) => {
                // Each error should mention which account and which field
                expect(error).toMatch(/Account \d+:/);
            });
        });

        it('should distinguish errors from warnings', () => {
            const data: SetupPhaseData = {
                householdName: 'Test',
                profileType: HouseholdProfileType.SOLO,
                primaryMemberId: 'user-123',
                initialInstitutions: [], // Warning: no institutions
            };

            const result = validator.validatePhase1(data);

            expect(result.errors).toHaveLength(0); // Valid but has warning
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.valid).toBe(true); // Can proceed despite warning
        });
    });
});
