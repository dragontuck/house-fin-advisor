/**
 * Onboarding Layout Component
 * 
 * Main wrapper component for the 6-phase onboarding flow.
 * Manages progress indicator, phase content, and action buttons.
 */

import React, { useState } from 'react';
import { OnboardingProgress } from '@house-fin/domain/types/onboarding.types';

export interface OnboardingLayoutProps {
    /**
     * Current onboarding progress
     */
    progress: OnboardingProgress;

    /**
     * Current phase component to display
     */
    phaseComponent?: React.ReactNode;

    /**
     * Callback when user clicks Next
     */
    onNext?: () => void;

    /**
     * Callback when user clicks Back
     */
    onBack?: () => void;

    /**
     * Callback when user clicks Skip
     */
    onSkip?: () => void;

    /**
     * Reason why skip is disabled (shown in tooltip)
     */
    skipDisabledReason?: string | null;

    /**
     * Callback when user clicks Save Checkpoint
     */
    onSaveCheckpoint?: () => void;

    /**
     * Whether Next button is disabled
     */
    isNextDisabled?: boolean;

    /**
     * Whether Back button is disabled
     */
    isBackDisabled?: boolean;

    /**
     * Loading state
     */
    isLoading?: boolean;

    /**
     * Error message if present
     */
    error?: string | null;

    /**
     * Callback when user cancels onboarding
     */
    onCancel?: () => void;

    /**
     * Children to render as phase content
     */
    children?: React.ReactNode;
}

/**
 * OnboardingLayout Component
 */
export const OnboardingLayout: React.FC<OnboardingLayoutProps> = ({
    progress,
    phaseComponent,
    onNext,
    onBack,
    onSkip,
    skipDisabledReason,
    onSaveCheckpoint,
    isNextDisabled = false,
    isBackDisabled = false,
    isLoading = false,
    error,
    onCancel,
    children,
}) => {
    const [showSkipTooltip, setShowSkipTooltip] = useState(false);
    const canSkip = onSkip && !skipDisabledReason;

    return (
        <div className="onboarding-layout">
            {/* Progress Indicator */}
            <header className="onboarding-header">
                <h1>Household Financial Setup</h1>
                <div className="progress-container">
                    <div className="step-counter">
                        Step {progress.currentPhase} of 6
                    </div>
                    <div className="progress-bar">
                        {/* Visual progress bar */}
                    </div>
                </div>
            </header>

            {/* Error Display */}
            {error && (
                <div className="error-alert" role="alert">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {/* Phase Content */}
            <main className="phase-content">
                {isLoading ? (
                    <div className="loading-spinner">Loading...</div>
                ) : (
                    children || phaseComponent
                )}
            </main>

            {/* Action Bar */}
            <footer className="action-bar">
                {onCancel && (
                    <button
                        className="btn btn-secondary"
                        onClick={onCancel}
                        disabled={isLoading}
                        title="Cancel onboarding"
                    >
                        ✕ Cancel
                    </button>
                )}

                {onBack && (
                    <button
                        className="btn btn-secondary"
                        onClick={onBack}
                        disabled={isBackDisabled || isLoading}
                        title="Go to previous phase"
                    >
                        ← Back
                    </button>
                )}

                <div className="action-spacer" />

                {onSkip && (
                    <div
                        className="skip-button-wrapper"
                        onMouseEnter={() => skipDisabledReason && setShowSkipTooltip(true)}
                        onMouseLeave={() => setShowSkipTooltip(false)}
                        title={skipDisabledReason || 'Skip this phase'}
                    >
                        <button
                            className="btn btn-tertiary"
                            onClick={onSkip}
                            disabled={!canSkip || isLoading}
                        >
                            ⊘ Skip Phase
                        </button>
                        {showSkipTooltip && skipDisabledReason && (
                            <div className="tooltip">
                                {skipDisabledReason}
                            </div>
                        )}
                    </div>
                )}

                {onSaveCheckpoint && (
                    <button
                        className="btn btn-tertiary"
                        onClick={onSaveCheckpoint}
                        disabled={isLoading}
                        title="Save your progress locally"
                    >
                        💾 Save Progress
                    </button>
                )}

                {onNext && (
                    <button
                        className="btn btn-primary"
                        onClick={onNext}
                        disabled={isNextDisabled || isLoading}
                        title="Continue to next phase"
                    >
                        Next →
                    </button>
                )}
            </footer>
        </div>
    );
};

export default OnboardingLayout;
