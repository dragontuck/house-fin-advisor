/**
 * Main Onboarding Flow Container
 * Orchestrates the 6-phase onboarding workflow
 */

import React, { useEffect } from 'react';
import { OnboardingPhase, OnboardingProgress } from '../../types/onboarding.types';
import { useOnboarding } from '../../hooks/useOnboarding';
import { OnboardingLayout } from './OnboardingLayout';
import { Phase1Setup } from './phases/Phase1Setup';
import { Phase2Accounts } from './phases/Phase2Accounts';
import { Phase3Statements } from './phases/Phase3Statements';
import { Phase4Context } from './phases/Phase4Context';
import { Phase5Profile } from './phases/Phase5Profile';
import { Phase6Review } from './phases/Phase6Review';
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
    const { progress, currentPhase, loading, errors, moveToPhase, completePhase, skipPhase, launch, saveCheckpoint } =
        useOnboarding(householdId);

    // Auto-save checkpoint every 5 minutes
    useEffect(() => {
        const checkpointInterval = setInterval(() => {
            if (progress) {
                saveCheckpoint();
            }
        }, 5 * 60 * 1000);

        return () => clearInterval(checkpointInterval);
    }, [progress, saveCheckpoint]);

    if (loading && !progress) {
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

    const PhaseComponent = PHASE_COMPONENTS[currentPhase];

    return (
        <OnboardingLayout
            progress={progress}
            onCancel={onCancel}
            errors={errors}
            onSaveCheckpoint={saveCheckpoint}
        >
            <PhaseComponent
                householdId={householdId}
                progress={progress}
                onNext={async (data) => {
                    await completePhase(currentPhase, data);
                }}
                onSkip={skipPhase}
                onLaunch={launch}
                onComplete={onComplete}
            />
        </OnboardingLayout>
    );
};

export default OnboardingFlow;
