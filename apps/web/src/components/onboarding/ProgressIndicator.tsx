/**
 * Progress Indicator Component
 * Shows step counter and visual progress bar
 */

import React from 'react';
import { OnboardingPhase } from '../../types/onboarding.types';
import './ProgressIndicator.css';

interface ProgressIndicatorProps {
    phase: OnboardingPhase;
}

const PHASE_NAMES: Record<OnboardingPhase, string> = {
    1: 'Setup',
    2: 'Accounts',
    3: 'Statements',
    4: 'Context',
    5: 'Profile',
    6: 'Launch',
};

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ phase }) => {
    const progressPercent = ((phase - 1) / 5) * 100;

    return (
        <div className="progress-indicator">
            <div className="step-counter">
                Step {phase} of 6: {PHASE_NAMES[phase]}
            </div>

            <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progressPercent}%` }}></div>
            </div>

            <div className="phase-steps">
                {Array.from({ length: 6 }).map((_, idx) => {
                    const stepNum = (idx + 1) as OnboardingPhase;
                    const isActive = stepNum === phase;
                    const isComplete = stepNum < phase;

                    return (
                        <div
                            key={stepNum}
                            className={`phase-step ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}`}
                            title={PHASE_NAMES[stepNum]}
                        >
                            {isComplete ? '✓' : stepNum}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ProgressIndicator;
