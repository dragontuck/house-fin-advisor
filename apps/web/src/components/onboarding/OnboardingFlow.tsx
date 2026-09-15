/**
 * Main Onboarding Flow Container
 * Orchestrates the 6-phase onboarding workflow
 */

import React, { useEffect, useCallback } from 'react';
import { OnboardingPhase } from '../../types/onboarding.types';
import { useOnboarding } from '../../hooks/useOnboarding';
import { useOnboardingSession } from '../../context/useOnboardingSession';
import { OnboardingLayout } from './OnboardingLayout';
import { Phase1Setup } from './phases/Phase1Setup';
import { Phase2Accounts } from './phases/Phase2Accounts';
import { Phase3Statements } from './phases/Phase3Statements';
import { Phase4Context } from './phases/Phase4Context';
import { Phase5Profile } from './phases/Phase5Profile';
import { Phase6Review } from './phases/Phase6Review';
import { canSkipPhase, getSkipValidationError } from '../../services/skipValidation';
import './OnboardingFlow.css';

interface OnboardingFlowProps {
    householdId: string;
    onComplete?: (snapshot: any) => void;
    onCancel?: () => void;
}

const PHASE_COMPONENTS: Record<OnboardingPhase, React.ComponentType<any>> = {
    1: Phase1Setup,
    2: Phase2Accounts,
    3: Phase3Statements,
    4: Phase4Context,
    5: Phase5Profile,
    6: Phase6Review,
};

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ householdId, onComplete, onCancel }) => {
    const { progress, isLoading, error, completePhase, skipPhase, saveCheckpoint } =
        useOnboarding(householdId);
    const { session, updateProgress, updatePhase, markCheckpointSaved, setError: setSessionError } = useOnboardingSession();

    // Sync progress with session context
    useEffect(() => {
        if (progress) {
            updateProgress(progress as any);
        }
    }, [progress, updateProgress]);

    // Update phase in context when it changes
    useEffect(() => {
        if (progress && progress.currentPhase !== session.currentPhase) {
            updatePhase(progress.currentPhase);
        }
    }, [progress, session.currentPhase, updatePhase]);

    // Handle skip with validation
    const handleSkipPhase = useCallback(async () => {
        if (!progress) return;

        const validationError = getSkipValidationError(progress.currentPhase, progress as any);
        if (validationError) {
            setSessionError(validationError);
            return;
        }

        try {
            await skipPhase(progress.currentPhase);
            markCheckpointSaved();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to skip phase';
            setSessionError(message);
        }
    }, [progress, skipPhase, setSessionError, markCheckpointSaved]);

    // Auto-save checkpoint every 5 minutes
    useEffect(() => {
        const checkpointInterval = setInterval(() => {
            if (progress) {
                saveCheckpoint();
                markCheckpointSaved();
            }
        }, 5 * 60 * 1000);

        return () => clearInterval(checkpointInterval);
    }, [progress, saveCheckpoint, markCheckpointSaved]);

    if (isLoading && !progress) {
        return (
            <div className="onboarding-loading">
                <div className="spinner"></div>
                <p>Loading your onboarding progress...</p>
            </div>
        );
    }

    if (!progress) {
        return <div className="onboarding-error">Failed to load onboarding progress</div>;
    }

    const currentPhase = progress.currentPhase;
    const PhaseComponent = PHASE_COMPONENTS[currentPhase];
    const canSkip = canSkipPhase(currentPhase, progress as any);

    return (
        <OnboardingLayout
            progress={progress as any}
            onCancel={onCancel}
            error={error}
            onSaveCheckpoint={saveCheckpoint}
            onSkip={canSkip ? handleSkipPhase : undefined}
            skipDisabledReason={!canSkip ? getSkipValidationError(currentPhase, progress as any) : undefined}
        >
            <PhaseComponent
                householdId={householdId}
                progress={progress}
                onNext={async (data: Record<string, unknown>) => {
                    await completePhase(data);
                }}
                onSkip={handleSkipPhase}
                onComplete={onComplete}
            />
        </OnboardingLayout>
    );
};

export default OnboardingFlow;
