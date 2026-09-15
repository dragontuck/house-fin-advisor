/**
 * useOnboardingSession hook for accessing onboarding context
 * Provides easy access to onboarding session state and methods
 */

import { useContext } from 'react';
import { OnboardingContext, OnboardingContextType } from './OnboardingContext';

/**
 * Custom hook to use onboarding context
 * @returns Onboarding context
 * @throws Error if used outside OnboardingProvider
 */
export function useOnboardingSession(): OnboardingContextType {
    const context = useContext(OnboardingContext);

    if (!context) {
        throw new Error('useOnboardingSession must be used within an OnboardingProvider');
    }

    return context;
}
