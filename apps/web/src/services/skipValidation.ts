/**
 * Skip Phase Validation Service
 * Determines which phases can be skipped based on policy
 */

import { OnboardingPhase, OnboardingProgress } from '../types/onboarding.types';

/**
 * Skip policy configuration
 */
interface SkipPolicy {
    phase: OnboardingPhase;
    canSkip: boolean;
    reason?: string;
    minimumRequiredPhases: OnboardingPhase[];
}

/**
 * Phase skip policies
 * Defines which phases can be skipped and under what conditions
 */
const SKIP_POLICIES: SkipPolicy[] = [
    {
        phase: 1,
        canSkip: false,
        reason: 'Phase 1 (Setup) is required - must establish household profile',
        minimumRequiredPhases: [],
    },
    {
        phase: 2,
        canSkip: false,
        reason: 'Phase 2 (Accounts) is required - must declare at least one account',
        minimumRequiredPhases: [1],
    },
    {
        phase: 3,
        canSkip: false,
        reason: 'Phase 3 (Statements) is required - must provide financial statements',
        minimumRequiredPhases: [1, 2],
    },
    {
        phase: 4,
        canSkip: true,
        reason: 'Phase 4 (Context) can be skipped - financial context can be updated later',
        minimumRequiredPhases: [1, 2, 3],
    },
    {
        phase: 5,
        canSkip: true,
        reason: 'Phase 5 (Profile) can be skipped - preferences can be configured later',
        minimumRequiredPhases: [1, 2, 3],
    },
    {
        phase: 6,
        canSkip: false,
        reason: 'Phase 6 (Review) cannot be skipped - must review and confirm data',
        minimumRequiredPhases: [1, 2, 3],
    },
];

/**
 * Get the skip policy for a phase
 * @param phase - The phase number
 * @returns Skip policy for the phase
 */
export function getSkipPolicy(phase: OnboardingPhase): SkipPolicy {
    const policy = SKIP_POLICIES.find((p) => p.phase === phase);
    if (!policy) {
        throw new Error(`No skip policy found for phase ${phase}`);
    }
    return policy;
}

/**
 * Check if a phase can be skipped
 * @param phase - The phase number
 * @param progress - Current onboarding progress
 * @returns True if the phase can be skipped
 */
export function canSkipPhase(phase: OnboardingPhase, progress: OnboardingProgress): boolean {
    const policy = getSkipPolicy(phase);

    // Check if phase is marked as skippable
    if (!policy.canSkip) {
        return false;
    }

    // Check if all minimum required phases are completed
    return policy.minimumRequiredPhases.every((requiredPhase) => {
        return progress.phases[requiredPhase]?.completed || false;
    });
}

/**
 * Get skip validation error message if phase cannot be skipped
 * @param phase - The phase number
 * @param progress - Current onboarding progress
 * @returns Error message if cannot skip, null if can skip
 */
export function getSkipValidationError(phase: OnboardingPhase, progress: OnboardingProgress): string | null {
    const policy = getSkipPolicy(phase);

    // Check if phase is marked as skippable
    if (!policy.canSkip) {
        return policy.reason || `Phase ${phase} cannot be skipped`;
    }

    // Check if all minimum required phases are completed
    const incompletePhases = policy.minimumRequiredPhases.filter(
        (requiredPhase) => !progress.phases[requiredPhase]?.completed
    );

    if (incompletePhases.length > 0) {
        return `Cannot skip phase ${phase}. Must complete phase(s) ${incompletePhases.join(', ')} first.`;
    }

    return null;
}

/**
 * Get all phases that can be skipped in the current progress state
 * @param progress - Current onboarding progress
 * @returns Array of skippable phase numbers
 */
export function getSkippablePhases(progress: OnboardingProgress): OnboardingPhase[] {
    return (SKIP_POLICIES.filter((policy) => canSkipPhase(policy.phase, progress)).map(
        (policy) => policy.phase
    ) as OnboardingPhase[]);
}

/**
 * Get phase skip metadata
 * @param phase - The phase number
 * @returns Metadata about skipping this phase
 */
export function getPhaseSkipMetadata(phase: OnboardingPhase) {
    const policy = getSkipPolicy(phase);
    return {
        phase,
        canSkip: policy.canSkip,
        reason: policy.reason,
        minimumRequiredPhases: policy.minimumRequiredPhases,
    };
}
