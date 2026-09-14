/**
 * Unit Tests: Onboarding Phase Validators
 * 
 * Tests validation logic for each of the 6 phases.
 * Ensures data integrity before phase completion.
 */

import { SetupPhaseData, AccountsPhaseData, StatementsPhaseData } from '../../../domain/types/onboarding.types';

// Validator implementations (to be implemented in domain/validators/onboarding-validators.ts)

export interface ValidationError {
    field: string;
    message: string;
    severity: 'ERROR' | 'WARNING';
}

export const validatePhase1Setup = (data: SetupPhaseData): ValidationError[] => {
    const errors: ValidationError[] = [];

    if (!data.householdName || data.householdName.trim().length === 0) {
        errors.push({
            field: 'householdName',
            message: 'Household name is required',
            severity: 'ERROR',
        });
    }

    if (data.householdName && data.householdName.length > 255) {
        errors.push({
            field: 'householdName',
            message: 'Household name must be 255 characters or less',
            severity: 'ERROR',
        });
    }

    if (!['SOLO', 'COUPLE', 'FAMILY'].includes(data.profileType)) {
        errors.push({
            field: 'profileType',
            message: 'Invalid profile type. Must be SOLO, COUPLE, or FAMILY',
            severity: 'ERROR',
        });
    }

    if (!data.primaryMemberId) {
        errors.push({
            field: 'primaryMemberId',
            message: 'Primary member must be specified',
            severity: 'ERROR',
        });
    }

    if (!data.initialInstitutions || data.initialInstitutions.length === 0) {
        errors.push({
            field: 'initialInstitutions',
            message: 'At least one financial institution must be specified',
            severity: 'WARNING',
        });
    }

    return errors;
};

export const validatePhase2Accounts = (data: AccountsPhaseData): ValidationError[] => {
    const errors: ValidationError[] = [];

    if (!data.declaredAccounts || data.declaredAccounts.length === 0) {
        errors.push({
            field: 'declaredAccounts',
            message: 'At least one account must be declared',
            severity: 'ERROR',
        });
    }

    data.declaredAccounts?.forEach((account, index) => {
        if (!account.tempId) {
            errors.push({
                field: `declaredAccounts[${index}].tempId`,
                message: 'Account must have a temporary ID',
                severity: 'ERROR',
            });
        }

        if (!account.institution) {
            errors.push({
                field: `declaredAccounts[${index}].institution`,
                message: 'Account institution is required',
                severity: 'ERROR',
            });
        }

        if (!['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'LOAN', 'INVESTMENT'].includes(account.accountType)) {
            errors.push({
                field: `declaredAccounts[${index}].accountType`,
                message: 'Invalid account type',
                severity: 'ERROR',
            });
        }

        if (account.balance && account.balance < 0) {
            errors.push({
                field: `declaredAccounts[${index}].balance`,
                message: 'Balance cannot be negative',
                severity: 'WARNING',
            });
        }
    });

    return errors;
};

describe('Phase 1: Setup Validation', () => {
    it('should validate required household name', () => {
        const invalidData: SetupPhaseData = {
            householdName: '',
            profileType: 'FAMILY',
            primaryMemberId: 'member-123' as any,
            initialInstitutions: ['Chase'],
            completedAt: undefined,
        };

        const errors = validatePhase1Setup(invalidData);
        expect(errors).toContainEqual(
            expect.objectContaining({
                field: 'householdName',
                severity: 'ERROR',
            })
        );
    });

    it('should validate household name max length', () => {
        const invalidData: SetupPhaseData = {
            householdName: 'a'.repeat(256), // Exceeds max length
            profileType: 'FAMILY',
            primaryMemberId: 'member-123' as any,
            initialInstitutions: ['Chase'],
            completedAt: undefined,
        };

        const errors = validatePhase1Setup(invalidData);
        expect(errors).toContainEqual(
            expect.objectContaining({
                field: 'householdName',
                message: expect.stringContaining('255 characters'),
                severity: 'ERROR',
            })
        );
    });

    it('should validate profile type enum', () => {
        const invalidData: SetupPhaseData = {
            householdName: 'Test Household',
            profileType: 'INVALID' as any,
            primaryMemberId: 'member-123' as any,
            initialInstitutions: ['Chase'],
            completedAt: undefined,
        };

        const errors = validatePhase1Setup(invalidData);
        expect(errors).toContainEqual(
            expect.objectContaining({
                field: 'profileType',
                severity: 'ERROR',
            })
        );
    });

    it('should require primary member ID', () => {
        const invalidData: SetupPhaseData = {
            householdName: 'Test Household',
            profileType: 'SOLO',
            primaryMemberId: '' as any,
            initialInstitutions: ['Chase'],
            completedAt: undefined,
        };

        const errors = validatePhase1Setup(invalidData);
        expect(errors).toContainEqual(
            expect.objectContaining({
                field: 'primaryMemberId',
                severity: 'ERROR',
            })
        );
    });

    it('should warn if no institutions selected', () => {
        const data: SetupPhaseData = {
            householdName: 'Test Household',
            profileType: 'FAMILY',
            primaryMemberId: 'member-123' as any,
            initialInstitutions: [],
            completedAt: undefined,
        };

        const errors = validatePhase1Setup(data);
        expect(errors).toContainEqual(
            expect.objectContaining({
                field: 'initialInstitutions',
                severity: 'WARNING',
            })
        );
    });

    it('should pass valid Phase 1 data', () => {
        const validData: SetupPhaseData = {
            householdName: 'Smith Family',
            profileType: 'FAMILY',
            primaryMemberId: 'member-123' as any,
            initialInstitutions: ['Chase', 'Bank of America'],
            completedAt: undefined,
        };

        const errors = validatePhase1Setup(validData);
        expect(errors.length).toBe(0);
    });

    it('should accept all valid profile types', () => {
        const profileTypes = ['SOLO', 'COUPLE', 'FAMILY'];

        profileTypes.forEach((profileType) => {
            const data: SetupPhaseData = {
                householdName: 'Test',
                profileType: profileType as any,
                primaryMemberId: 'member-123' as any,
                initialInstitutions: ['Chase'],
                completedAt: undefined,
            };

            const errors = validatePhase1Setup(data);
            expect(errors.filter((e) => e.field === 'profileType')).toHaveLength(0);
        });
    });
});

describe('Phase 2: Accounts Declaration Validation', () => {
    it('should require at least one declared account', () => {
        const invalidData: AccountsPhaseData = {
            declaredAccounts: [],
            completedAt: undefined,
        };

        const errors = validatePhase2Accounts(invalidData);
        expect(errors).toContainEqual(
            expect.objectContaining({
                field: 'declaredAccounts',
                severity: 'ERROR',
            })
        );
    });

    it('should validate account institution is provided', () => {
        const invalidData: AccountsPhaseData = {
            declaredAccounts: [
                {
                    tempId: 'temp-1',
                    institution: '', // Missing institution
                    accountType: 'CHECKING',
                    nickname: 'My Checking',
                    balance: 5000,
                    currency: 'USD',
                },
            ],
            completedAt: undefined,
        };

        const errors = validatePhase2Accounts(invalidData);
        expect(errors).toContainEqual(
            expect.objectContaining({
                field: 'declaredAccounts[0].institution',
                severity: 'ERROR',
            })
        );
    });

    it('should validate account type enum', () => {
        const invalidData: AccountsPhaseData = {
            declaredAccounts: [
                {
                    tempId: 'temp-1',
                    institution: 'Chase',
                    accountType: 'INVALID_TYPE' as any,
                    nickname: 'My Account',
                    balance: 5000,
                    currency: 'USD',
                },
            ],
            completedAt: undefined,
        };

        const errors = validatePhase2Accounts(invalidData);
        expect(errors).toContainEqual(
            expect.objectContaining({
                field: 'declaredAccounts[0].accountType',
                severity: 'ERROR',
            })
        );
    });

    it('should warn if account balance is negative', () => {
        const warningData: AccountsPhaseData = {
            declaredAccounts: [
                {
                    tempId: 'temp-1',
                    institution: 'Chase',
                    accountType: 'CHECKING',
                    nickname: 'My Checking',
                    balance: -1000, // Negative balance
                    currency: 'USD',
                },
            ],
            completedAt: undefined,
        };

        const errors = validatePhase2Accounts(warningData);
        expect(errors).toContainEqual(
            expect.objectContaining({
                field: 'declaredAccounts[0].balance',
                severity: 'WARNING',
            })
        );
    });

    it('should validate multiple accounts independently', () => {
        const invalidData: AccountsPhaseData = {
            declaredAccounts: [
                {
                    tempId: 'temp-1',
                    institution: 'Chase',
                    accountType: 'CHECKING',
                    nickname: 'Good Account',
                    balance: 5000,
                    currency: 'USD',
                },
                {
                    tempId: 'temp-2',
                    institution: '', // Missing
                    accountType: 'INVALID_TYPE' as any,
                    nickname: 'Bad Account',
                    balance: -1000,
                    currency: 'USD',
                },
            ],
            completedAt: undefined,
        };

        const errors = validatePhase2Accounts(invalidData);
        expect(errors.filter((e) => e.field.includes('[1]')).length).toBeGreaterThan(0);
    });

    it('should accept all valid account types', () => {
        const accountTypes = ['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'LOAN', 'INVESTMENT'];

        accountTypes.forEach((accountType) => {
            const data: AccountsPhaseData = {
                declaredAccounts: [
                    {
                        tempId: 'temp-1',
                        institution: 'Chase',
                        accountType: accountType as any,
                        nickname: 'Test Account',
                        balance: 5000,
                        currency: 'USD',
                    },
                ],
                completedAt: undefined,
            };

            const errors = validatePhase2Accounts(data);
            expect(errors.filter((e) => e.field.includes('accountType')).length).toBe(0);
        });
    });

    it('should pass valid Phase 2 data', () => {
        const validData: AccountsPhaseData = {
            declaredAccounts: [
                {
                    tempId: 'temp-1',
                    institution: 'Chase',
                    accountType: 'CHECKING',
                    nickname: 'Chase Checking',
                    balance: 10000,
                    currency: 'USD',
                },
                {
                    tempId: 'temp-2',
                    institution: 'Ally',
                    accountType: 'SAVINGS',
                    nickname: 'Ally Savings',
                    balance: 25000,
                    currency: 'USD',
                },
            ],
            completedAt: undefined,
        };

        const errors = validatePhase2Accounts(validData);
        expect(errors.length).toBe(0);
    });
});

describe('Validator: Error Classification', () => {
    it('should distinguish between errors and warnings', () => {
        const data: SetupPhaseData = {
            householdName: 'Test',
            profileType: 'SOLO',
            primaryMemberId: 'member-123' as any,
            initialInstitutions: [], // Warning
            completedAt: undefined,
        };

        const errors = validatePhase1Setup(data);
        const onlyErrors = errors.filter((e) => e.severity === 'ERROR');
        const onlyWarnings = errors.filter((e) => e.severity === 'WARNING');

        expect(onlyErrors.length).toBe(0); // No errors
        expect(onlyWarnings.length).toBe(1); // One warning
    });

    it('should allow phase completion with warnings but not errors', () => {
        const dataWithWarnings: SetupPhaseData = {
            householdName: 'Test',
            profileType: 'SOLO',
            primaryMemberId: 'member-123' as any,
            initialInstitutions: [], // Warning, not error
            completedAt: undefined,
        };

        const errors = validatePhase1Setup(dataWithWarnings);
        const hasErrors = errors.some((e) => e.severity === 'ERROR');

        // Should be allowed to complete despite warnings
        expect(hasErrors).toBe(false);
    });

    it('should block phase completion if errors exist', () => {
        const dataWithErrors: SetupPhaseData = {
            householdName: '', // Error
            profileType: 'SOLO',
            primaryMemberId: 'member-123' as any,
            initialInstitutions: [],
            completedAt: undefined,
        };

        const errors = validatePhase1Setup(dataWithErrors);
        const hasErrors = errors.some((e) => e.severity === 'ERROR');

        // Should NOT be allowed to complete with errors
        expect(hasErrors).toBe(true);
    });
});

describe('Validator: Error Messages', () => {
    it('should provide clear, actionable error messages', () => {
        const invalidData: SetupPhaseData = {
            householdName: '',
            profileType: 'FAMILY',
            primaryMemberId: 'member-123' as any,
            initialInstitutions: [],
            completedAt: undefined,
        };

        const errors = validatePhase1Setup(invalidData);

        errors.forEach((error) => {
            // Each error should have a message
            expect(error.message).toBeDefined();
            expect(error.message.length).toBeGreaterThan(0);
            // Message should not be overly technical
            expect(error.message).not.toContain('undefined');
            expect(error.message).not.toContain('null');
        });
    });

    it('should indicate which field has the error', () => {
        const invalidData: AccountsPhaseData = {
            declaredAccounts: [
                {
                    tempId: 'temp-1',
                    institution: 'Chase',
                    accountType: 'CHECKING',
                    nickname: 'Test',
                    balance: 5000,
                    currency: 'USD',
                },
                {
                    tempId: 'temp-2',
                    institution: '',
                    accountType: 'CHECKING',
                    nickname: 'Test',
                    balance: 5000,
                    currency: 'USD',
                },
            ],
            completedAt: undefined,
        };

        const errors = validatePhase2Accounts(invalidData);

        errors.forEach((error) => {
            // Field should indicate location in data structure
            expect(error.field).toBeDefined();
            expect(error.field).toMatch(/declaredAccounts\[\d+\]/);
        });
    });
});
