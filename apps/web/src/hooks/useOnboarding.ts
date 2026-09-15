/**
 * Custom Hooks for Onboarding
 * 
 * React hooks providing onboarding state management, API interactions, and form handling.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    OnboardingProgress,
    OnboardingPhase,
    ValidationError,
    IncomeDetection,
    ExpenseDetection,
} from '@house-fin/domain/types/onboarding.types';
import { EntityId } from '@house-fin/domain/types/common.types';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

/**
 * Main onboarding hook - manages current progress, phase navigation, and state
 */
export function useOnboarding(householdId: EntityId) {
    const [progress, setProgress] = useState<OnboardingProgress | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch current progress on mount
    useEffect(() => {
        const fetchProgress = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const response = await fetch(`${API_BASE}/onboarding/progress?householdId=${householdId}`);

                if (!response.ok) {
                    if (response.status === 404) {
                        // No progress yet, initialize
                        const initResponse = await fetch(`${API_BASE}/onboarding/initialize`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ householdId }),
                        });
                        if (initResponse.ok) {
                            const data = await initResponse.json();
                            setProgress(data.progress);
                        } else {
                            throw new Error('Failed to initialize onboarding');
                        }
                    } else {
                        throw new Error('Failed to fetch progress');
                    }
                } else {
                    const data = await response.json();
                    setProgress(data.progress);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        };

        if (householdId) {
            fetchProgress();
        }
    }, [householdId]);

    // Start onboarding
    const start = useCallback(async (householdName: string) => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await fetch(`${API_BASE}/onboarding/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ householdId, householdName }),
            });

            if (!response.ok) throw new Error('Failed to start onboarding');

            const data = await response.json();
            setProgress(data.progress);
            return data.progress;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [householdId]);

    // Move to specific phase
    const moveToPhase = useCallback(async (phaseNumber: OnboardingPhase) => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await fetch(`${API_BASE}/onboarding/move-to-phase`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ householdId, phase: phaseNumber }),
            });

            if (!response.ok) throw new Error('Failed to move to phase');

            const data = await response.json();
            setProgress(data.progress);
            return data.progress;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [householdId]);

    // Complete current phase
    const completePhase = useCallback(async (data: Record<string, unknown>) => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await fetch(`${API_BASE}/onboarding/complete-phase`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ householdId, phaseData: data }),
            });

            if (!response.ok) throw new Error('Failed to complete phase');

            const responseData = await response.json();
            setProgress(responseData.progress);
            return responseData.progress;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [householdId]);

    // Skip phase
    const skipPhase = useCallback(async (targetPhase: OnboardingPhase) => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await fetch(`${API_BASE}/onboarding/skip-phase`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ householdId, targetPhase }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Cannot skip this phase');
            }

            const data = await response.json();
            setProgress(data.progress);
            return data.progress;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [householdId]);

    // Save checkpoint
    const saveCheckpoint = useCallback(async () => {
        if (!progress) return;

        try {
            const response = await fetch(`${API_BASE}/onboarding/checkpoint/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ householdId, progress }),
            });

            if (!response.ok) throw new Error('Failed to save checkpoint');
            return await response.json();
        } catch (err) {
            console.error('Checkpoint save error:', err);
            // Don't throw - checkpoint save failures shouldn't block user
        }
    }, [householdId, progress]);

    // Restart onboarding
    const restart = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await fetch(`${API_BASE}/onboarding/restart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ householdId }),
            });

            if (!response.ok) throw new Error('Failed to restart onboarding');

            const data = await response.json();
            setProgress(data.progress);
            return data.progress;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [householdId]);

    return {
        progress,
        isLoading,
        error,
        start,
        moveToPhase,
        completePhase,
        skipPhase,
        saveCheckpoint,
        restart,
    };
}

/**
 * Hook for form data persistence via checkpoints
 * Auto-saves form data with debounce (5 seconds)
 */
export function useFormProgress(
    householdId: EntityId,
    phaseNumber: OnboardingPhase,
    initialData: Record<string, unknown> = {}
) {
    const [data, setData] = useState(initialData);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Debounce timer reference
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    // Auto-save with debounce on data changes
    useEffect(() => {
        // Clear existing timer
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        // Set new timer for auto-save
        debounceTimer.current = setTimeout(async () => {
            try {
                setIsSaving(true);
                setSaveError(null);

                const response = await fetch(`${API_BASE}/onboarding/checkpoint/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        householdId,
                        phase: phaseNumber,
                        data,
                        timestamp: new Date().toISOString(),
                    }),
                });

                if (!response.ok) {
                    throw new Error('Failed to save progress');
                }
            } catch (err) {
                setSaveError(err instanceof Error ? err.message : 'Failed to save');
                console.error('Form progress save error:', err);
            } finally {
                setIsSaving(false);
            }
        }, 5000); // 5-second debounce

        // Cleanup timer on unmount
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, [data, phaseNumber, householdId]);

    return {
        data,
        setData,
        isSaving,
        saveError,
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
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchGuidance = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const response = await fetch(`${API_BASE}/onboarding/accounts/${accountId}/guidance`);

                if (!response.ok) throw new Error('Failed to fetch guidance');

                const data = await response.json();
                setGuidance(data.guidance);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        };

        if (accountId) {
            fetchGuidance();
        }
    }, [accountId]);

    return {
        guidance,
        isLoading,
        error,
    };
}

/**
 * Hook for income detection
 */
export function useIncomeDetection(householdId: EntityId) {
    const [detections, setDetections] = useState<IncomeDetection[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const detect = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await fetch(`${API_BASE}/onboarding/detect-income?householdId=${householdId}`);

            if (!response.ok) throw new Error('Failed to detect income');

            const data = await response.json();
            setDetections(data.detections || []);
            return data.detections;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [householdId]);

    const confirm = useCallback(async (confirmedAmount?: number) => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await fetch(`${API_BASE}/onboarding/income/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ householdId, confirmedAmount }),
            });

            if (!response.ok) throw new Error('Failed to confirm income');

            const data = await response.json();
            return data;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [householdId]);

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

    const detect = useCallback(async (accountIds?: EntityId[]) => {
        try {
            setIsLoading(true);
            setError(null);

            const params = new URLSearchParams({ householdId });
            if (accountIds?.length) {
                params.append('accountIds', accountIds.join(','));
            }

            const response = await fetch(`${API_BASE}/onboarding/detect-expenses?${params}`);

            if (!response.ok) throw new Error('Failed to detect expenses');

            const data = await response.json();
            setDetections(data.detections || []);
            return data.detections;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [householdId]);

    const confirm = useCallback(async (recordId: EntityId, confirmedAmount?: number) => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await fetch(`${API_BASE}/onboarding/expense/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ householdId, recordId, confirmedAmount }),
            });

            if (!response.ok) throw new Error('Failed to confirm expense');

            const data = await response.json();
            return data;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An error occurred';
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [householdId]);

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

    const validate = useCallback(async (phaseNumber: OnboardingPhase, data: Record<string, unknown>) => {
        try {
            setIsValidating(true);
            setErrors([]);

            const response = await fetch(`${API_BASE}/onboarding/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phase: phaseNumber, data }),
            });

            if (!response.ok) throw new Error('Validation failed');

            const result = await response.json();
            if (result.errors && result.errors.length > 0) {
                setErrors(result.errors);
                return false;
            }
            return true;
        } catch (err) {
            console.error('Validation error:', err);
            return false;
        } finally {
            setIsValidating(false);
        }
    }, []);

    const clearErrors = useCallback(() => {
        setErrors([]);
    }, []);

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
export function useCheckpointResume(householdId: EntityId, sessionId?: string) {
    const [checkpoint, setCheckpoint] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadCheckpoint = async () => {
            try {
                setIsLoading(true);
                setError(null);

                const params = new URLSearchParams({ householdId });
                if (sessionId) {
                    params.append('sessionId', sessionId);
                }

                const response = await fetch(`${API_BASE}/onboarding/checkpoint/resume?${params}`);

                if (response.status === 404) {
                    // No checkpoint found
                    setCheckpoint(null);
                } else if (!response.ok) {
                    throw new Error('Failed to load checkpoint');
                } else {
                    const data = await response.json();
                    setCheckpoint(data.checkpoint);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        };

        if (householdId) {
            loadCheckpoint();
        }
    }, [householdId, sessionId]);

    return {
        checkpoint,
        isLoading,
        error,
    };
}
