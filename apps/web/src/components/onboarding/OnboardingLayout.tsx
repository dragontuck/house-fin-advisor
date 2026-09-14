/**
 * Onboarding Layout Component
 * 
 * Main wrapper component for the 6-phase onboarding flow.
 * Manages progress indicator, phase content, and action buttons.
 */

import React, { useState } from 'react';
import { OnboardingPhase, OnboardingProgress } from '../../../packages/domain/types/onboarding.types';

export interface OnboardingLayoutProps {
    /**
     * Current onboarding progress
     */
    progress: OnboardingProgress;

    /**
     * Current phase component to display
     */
    phaseComponent: React.ReactNode;

    /**
     * Callback when user clicks Next
     */
    onNext: () => void;

    /**
     * Callback when user clicks Back
     */
    onBack: () => void;

    /**
     * Callback when user clicks Skip
     */
    onSkip?: () => void;

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
    onSaveCheckpoint,
    isNextDisabled = false,
    isBackDisabled = false,
    isLoading = false,
    error,
}) => {
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
                    phaseComponent
                )}
            </main>

            {/* Action Bar */}
            <footer className="action-bar">
                <button
                    className="btn btn-secondary"
                    onClick={onBack}
                    disabled={isBackDisabled || isLoading}
                >
                    ← Back
                </button>

                {onSkip && (
                    <button
                        className="btn btn-tertiary"
                        onClick={onSkip}
                        disabled={isLoading}
                    >
                        Skip Phase
                    </button>
                )}

                {onSaveCheckpoint && (
                    <button
                        className="btn btn-tertiary"
                        onClick={onSaveCheckpoint}
                        disabled={isLoading}
                    >
                        💾 Save Progress
                    </button>
                )}

                <button
                    className="btn btn-primary"
                    onClick={onNext}
                    disabled={isNextDisabled || isLoading}
                >
                    Next →
                </button>
            </footer>
        </div>
    );
};

export default OnboardingLayout;
