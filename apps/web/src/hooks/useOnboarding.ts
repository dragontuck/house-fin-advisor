/**
 * Custom Hooks for Onboarding
 * 
 * React hooks providing onboarding state management, API interactions, and form handling.
 * 
 * **Implementation Note**: Hook implementations are stubs.
 * Implementation will be completed in Phase 2.
 */

import { useState, useEffect } from 'react';
import {
    OnboardingProgress,
    OnboardingPhase,
    ValidationError,
    IncomeDetection,
    ExpenseDetection,
} from '../../../packages/domain/types/onboarding.types';
import { EntityId } from '../../../packages/domain/types/common.types';

/**
 * Main onboarding hook - manages current progress, phase navigation, and state
 */
export function useOnboarding(householdId: EntityId) {
    const [progress, setProgress] = useState<OnboardingProgress | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch current progress
    useEffect(() => {
        // TODO: Implement in Phase 2
        // Fetch /api/onboarding/progress
    }, [householdId]);

    // Start onboarding
    const start = async (householdName: string) => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    // Move to next phase
    const moveToPhase = async (phaseNumber: OnboardingPhase) => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    // Complete current phase
    const completePhase = async (data: Record<string, unknown>) => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    // Skip phase
    const skipPhase = async (targetPhase: OnboardingPhase) => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    // Restart onboarding
    const restart = async () => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    return {
        progress,
        isLoading,
        error,
        start,
        moveToPhase,
        completePhase,
        skipPhase,
        restart,
    };
}

/**
 * Hook for form data persistence via checkpoints
 */
export function useFormProgress(phaseNumber: OnboardingPhase, initialData: Record<string, unknown> = {}) {
    const [data, setData] = useState(initialData);
    const [isSaving, setIsSaving] = useState(false);

    // Auto-save to checkpoint on changes (with debounce)
    useEffect(() => {
        // TODO: Implement in Phase 2 with debounce
    }, [data, phaseNumber]);

    return {
        data,
        setData,
        isSaving,
    };
}

/**
 * Hook for statement collection status and upload guidance
 */
export function useStatementGuidance(accountId: EntityId) {
    const [guidance, setGuidance] = useState<{
        minMonths: number;
        maxMonths: number;
        formats: string[];
        institutionUrl?: string;
        exampleUrl?: string;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        // TODO: Implement in Phase 2
        // Fetch /api/onboarding/accounts/:accountId/guidance
    }, [accountId]);

    return {
        guidance,
        isLoading,
    };
}

/**
 * Hook for income detection
 */
export function useIncomeDetection(householdId: EntityId) {
    const [detections, setDetections] = useState<IncomeDetection[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const detect = async () => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    const confirm = async (confirmedAmount?: number) => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    return {
        detections,
        isLoading,
        error,
        detect,
        confirm,
    };
}

/**
 * Hook for expense detection
 */
export function useExpenseDetection(householdId: EntityId) {
    const [detections, setDetections] = useState<ExpenseDetection[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const detect = async (accountIds?: EntityId[]) => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    const confirm = async (recordId: EntityId, confirmedAmount?: number) => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    return {
        detections,
        isLoading,
        error,
        detect,
        confirm,
    };
}

/**
 * Hook for form validation
 */
export function useFormValidation() {
    const [errors, setErrors] = useState<ValidationError[]>([]);
    const [isValidating, setIsValidating] = useState(false);

    const validate = async (phaseNumber: OnboardingPhase, data: Record<string, unknown>) => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    const clearErrors = () => {
        setErrors([]);
    };

    return {
        errors,
        isValidating,
        validate,
        clearErrors,
    };
}

/**
 * Hook for checkpoint/resume functionality
 */
export function useCheckpointResume(householdId: EntityId, sessionId: string) {
    const [checkpoint, setCheckpoint] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Load checkpoint on mount
    useEffect(() => {
        // TODO: Implement in Phase 2
        // Fetch /api/onboarding/progress/checkpoint
    }, [householdId, sessionId]);

    const save = async (phaseNumber: OnboardingPhase, data: Record<string, unknown>) => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    const restore = async () => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    return {
        checkpoint,
        isLoading,
        save,
        restore,
    };
}

/**
 * Hook for onboarding completion stats
 */
export function useOnboardingStats() {
    const [stats, setStats] = useState<{
        totalStarted: number;
        totalCompleted: number;
        completionRate: number;
        averageTimeMinutes: number;
        dropoffByPhase: Record<OnboardingPhase, number>;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        // TODO: Implement in Phase 2
        // Fetch /api/onboarding/stats
    }, []);

    return {
        stats,
        isLoading,
    };
}
