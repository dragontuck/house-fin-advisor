/**
 * Onboarding Form Validators
 * Validates data for each of the 6 phases
 */

import {
    SetupPhaseData,
    AccountsPhaseData,
    StatementsPhaseData,
    FinancialContextPhaseData,
    ProfilePhaseData,
    LaunchPhaseData,
} from '../../types/onboarding.types';

export interface ValidationError {
    field: string;
    message: string;
}

/**
 * Phase 1: Setup validation
 */
export const validatePhase1 = (data: SetupPhaseData): string[] => {
    const errors: string[] = [];

    if (!data.householdName || data.householdName.trim().length === 0) {
        errors.push('Household name is required');
    } else if (data.householdName.length > 50) {
        errors.push('Household name must be 50 characters or less');
    }

    if (!data.profileType) {
        errors.push('Profile type is required');
    }

    if (!data.initialInstitutions || data.initialInstitutions.length === 0) {
        errors.push('At least one institution is required');
    }

    return errors;
};

/**
 * Phase 2: Accounts validation
 */
export const validatePhase2 = (data: AccountsPhaseData): string[] => {
    const errors: string[] = [];

    if (!data.declaredAccounts || data.declaredAccounts.length === 0) {
        errors.push('At least one account is required');
    } else {
        data.declaredAccounts.forEach((account, idx) => {
            if (!account.name || account.name.trim().length === 0) {
                errors.push(`Account ${idx + 1}: Name is required`);
            }
            if (!account.accountType) {
                errors.push(`Account ${idx + 1}: Type is required`);
            }
        });
    }

    return errors;
};

/**
 * Phase 3: Statements validation
 */
export const validatePhase3 = (data: StatementsPhaseData): string[] => {
    const errors: string[] = [];

    if (!data.accountStatementCollectionStatus || Object.keys(data.accountStatementCollectionStatus).length === 0) {
        errors.push('At least one statement must be uploaded');
    }

    return errors;
};

/**
 * Phase 4: Financial Context validation
 */
export const validatePhase4 = (data: FinancialContextPhaseData): string[] => {
    const errors: string[] = [];

    if (!data.detectedIncome && !data.userConfirmedIncome_Amount) {
        errors.push('Income information is required');
    }

    if (data.userConfirmedIncome_Amount && data.userConfirmedIncome_Amount <= 0) {
        errors.push('Income amount must be greater than 0');
    }

    return errors;
};

/**
 * Phase 5: Profile validation
 */
export const validatePhase5 = (data: ProfilePhaseData): string[] => {
    const errors: string[] = [];

    if (!data.privacyConfirmed) {
        errors.push('You must confirm privacy policy');
    }

    return errors;
};

/**
 * Phase 6: Launch validation
 */
export const validatePhase6 = (data: LaunchPhaseData): string[] => {
    const errors: string[] = [];

    if (!data.confirmationPhrase || data.confirmationPhrase !== 'ready') {
        errors.push('Confirmation phrase is required');
    }

    return errors;
};
