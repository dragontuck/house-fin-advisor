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
} from '@house-fin/domain/types/onboarding.types';
import { EntityId } from '@house-fin/domain/types/common.types';

/**
 * Main onboarding hook - manages current progress, phase navigation, and state
 */
export function useOnboarding(householdId: EntityId) {
    const [progress, _setProgress] = useState<OnboardingProgress | null>(null);
    const [isLoading, _setIsLoading] = useState(false);
    const [_error, _setError] = useState<string | null>(null);

    // Fetch current progress
    useEffect(() => {
        // TODO: Implement in Phase 2
        // Fetch /api/onboarding/progress
    }, [householdId]);

    // Start onboarding
    const start = async (_householdName: string) => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    // Move to next phase
    const moveToPhase = async (_phaseNumber: OnboardingPhase) => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    // Complete current phase
    const completePhase = async (_data: Record<string, unknown>) => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    // Skip phase
    const skipPhase = async (_targetPhase: OnboardingPhase) => {
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
export function useFormProgress(_phaseNumber: OnboardingPhase, initialData: Record<string, unknown> = {}) {
    const [data, setData] = useState(initialData);
    const [_isSaving, _setIsSaving] = useState(false);

    // Auto-save to checkpoint on changes (with debounce)
    useEffect(() => {
        // TODO: Implement in Phase 2 with debounce
    }, [data, _phaseNumber]);

    return {
        data,
        setData,
    };
}

/**
 * Hook for statement collection status and upload guidance
 */
export function useStatementGuidance(_accountId: EntityId) {
    const [_guidance, _setGuidance] = useState<{
        minMonths: number;
        maxMonths: number;
        formats: string[];
        institutionUrl?: string;
        exampleUrl?: string;
    } | null>(null);
    const [isLoading, _setIsLoading] = useState(false);

    useEffect(() => {
        // TODO: Implement in Phase 2
        // Fetch /api/onboarding/accounts/:accountId/guidance
    }, [_accountId]);

    return {
        isLoading,
    };
}

/**
 * Hook for income detection
 */
export function useIncomeDetection(_householdId: EntityId) {
    const [detections, _setDetections] = useState<IncomeDetection[]>([]);
    const [isLoading, _setIsLoading] = useState(false);
    const [error, _setError] = useState<string | null>(null);

    const detect = async () => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    const confirm = async (_confirmedAmount?: number) => {
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
export function useExpenseDetection(_householdId: EntityId) {
    const [detections, _setDetections] = useState<ExpenseDetection[]>([]);
    const [isLoading, _setIsLoading] = useState(false);
    const [error, _setError] = useState<string | null>(null);

    const detect = async (_accountIds?: EntityId[]) => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    const confirm = async (_recordId: EntityId, _confirmedAmount?: number) => {
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
    const [errors, _setErrors] = useState<ValidationError[]>([]);
    const [_isValidating, _setIsValidating] = useState(false);

    const validate = async (_phaseNumber: OnboardingPhase, _data: Record<string, unknown>) => {
        // TODO: Implement in Phase 2
        throw new Error('Not implemented');
    };

    const clearErrors = () => {
        _setErrors([]);
    };

    return {
        errors,
        validate,
        clearErrors,
    };
}

/**
 * Hook for checkpoint/resume functionality
 */
export function useCheckpointResume(_householdId: EntityId, _sessionId: string) {
    const [checkpoint, _setCheckpoint] = useState<any | null>(null);
    const [isLoading, _setIsLoading] = useState(false);

    // Load checkpoint on mount
    useEffect(() => {
        // TODO: Implement in Phase 2
        // Fetch /api/onboarding/progress/checkpoint
    }, [_householdId, _sessionId]);

    const save = async (_phaseNumber: OnboardingPhase, _data: Record<string, unknown>) => {
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
    const [_stats, _setStats] = useState<{
        totalStarted: number;
        totalCompleted: number;
        completionRate: number;
        averageTimeMinutes: number;
        dropoffByPhase: Record<OnboardingPhase, number>;
    } | null>(null);
    const [isLoading, _setIsLoading] = useState(false);

    useEffect(() => {
        // TODO: Implement in Phase 2
        // Fetch /api/onboarding/stats
    }, []);

    return {
        stats: _stats,
        isLoading,
    };
}
