/**
 * Onboarding session context for React
 * Provides persistent onboarding state across sessions
 */

import { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { OnboardingProgress, OnboardingPhase } from '../types/onboarding.types';

/**
 * Onboarding session data
 */
export interface OnboardingSession {
    householdId: string;
    progress: OnboardingProgress | null;
    isLoading: boolean;
    error: string | null;
    currentPhase: OnboardingPhase;
    hasCheckpoint: boolean;
    lastSavedAt: Date | null;
}

/**
 * Onboarding context type
 */
export interface OnboardingContextType {
    session: OnboardingSession;
    updateProgress: (progress: OnboardingProgress) => void;
    updatePhase: (phase: OnboardingPhase) => void;
    clearSession: () => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    markCheckpointSaved: () => void;
}

/**
 * Create the onboarding context
 */
export const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

/**
 * Props for OnboardingProvider
 */
interface OnboardingProviderProps {
    children: ReactNode;
    householdId?: string;
}

/**
 * Default session state
 */
const DEFAULT_SESSION: OnboardingSession = {
    householdId: '',
    progress: null,
    isLoading: false,
    error: null,
    currentPhase: 1,
    hasCheckpoint: false,
    lastSavedAt: null,
};

/**
 * Storage key for persisting session
 */
const STORAGE_KEY = 'onboarding_session';

/**
 * OnboardingProvider component
 * Manages onboarding session state and persistence
 */
export const OnboardingProvider: React.FC<OnboardingProviderProps> = ({ children, householdId = '' }) => {
    const [session, setSession] = useState<OnboardingSession>(() => {
        // Try to restore from localStorage
        if (typeof window !== 'undefined') {
            try {
                const stored = localStorage.getItem(`${STORAGE_KEY}_${householdId}`);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    // Restore with current householdId
                    return {
                        ...DEFAULT_SESSION,
                        householdId,
                        ...parsed,
                        isLoading: false, // Reset loading state
                    };
                }
            } catch (err) {
                console.error('Failed to restore onboarding session from storage:', err);
            }
        }
        return { ...DEFAULT_SESSION, householdId };
    });

    // Persist session to localStorage whenever it changes
    useEffect(() => {
        if (typeof window !== 'undefined' && householdId) {
            try {
                localStorage.setItem(
                    `${STORAGE_KEY}_${householdId}`,
                    JSON.stringify({
                        progress: session.progress,
                        currentPhase: session.currentPhase,
                        hasCheckpoint: session.hasCheckpoint,
                        lastSavedAt: session.lastSavedAt,
                    })
                );
            } catch (err) {
                console.error('Failed to persist onboarding session to storage:', err);
            }
        }
    }, [session, householdId]);

    const updateProgress = useCallback((progress: OnboardingProgress) => {
        setSession((prev) => ({
            ...prev,
            progress,
            currentPhase: progress.currentPhase,
            error: null,
        }));
    }, []);

    const updatePhase = useCallback((phase: OnboardingPhase) => {
        setSession((prev) => ({
            ...prev,
            currentPhase: phase,
            error: null,
        }));
    }, []);

    const clearSession = useCallback(() => {
        setSession({ ...DEFAULT_SESSION, householdId });
        if (typeof window !== 'undefined' && householdId) {
            localStorage.removeItem(`${STORAGE_KEY}_${householdId}`);
        }
    }, [householdId]);

    const setLoading = useCallback((loading: boolean) => {
        setSession((prev) => ({
            ...prev,
            isLoading: loading,
        }));
    }, []);

    const setError = useCallback((error: string | null) => {
        setSession((prev) => ({
            ...prev,
            error,
        }));
    }, []);

    const markCheckpointSaved = useCallback(() => {
        setSession((prev) => ({
            ...prev,
            hasCheckpoint: true,
            lastSavedAt: new Date(),
        }));
    }, []);

    const value: OnboardingContextType = {
        session,
        updateProgress,
        updatePhase,
        clearSession,
        setLoading,
        setError,
        markCheckpointSaved,
    };

    return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
};

export default OnboardingProvider;
