/**
 * Action Bar Component
 * Navigation buttons: Back, Skip, Save, Next
 */

import React from 'react';
import { OnboardingPhase } from '../../types/onboarding.types';
import './ActionBar.css';

interface ActionBarProps {
    phase: OnboardingPhase;
    onCancel?: () => void;
    onSaveCheckpoint?: () => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({ phase, onCancel, onSaveCheckpoint }) => {
    const canSkip = phase < 6;
    const canGoBack = phase > 1;

    return (
        <div className="action-bar">
            <div className="action-bar-left">
                {canGoBack && (
                    <button type="button" className="btn-ghost" aria-label="Go back to previous phase">
                        ← Back
                    </button>
                )}
            </div>

            <div className="action-bar-center">
                {onSaveCheckpoint && (
                    <button type="button" onClick={onSaveCheckpoint} className="btn-ghost" title="Save progress">
                        💾 Save Progress
                    </button>
                )}
            </div>

            <div className="action-bar-right">
                {canSkip && (
                    <button type="button" className="btn-ghost" title="Skip this phase">
                        Skip →
                    </button>
                )}

                {onCancel && (
                    <button type="button" onClick={onCancel} className="btn-ghost" title="Cancel onboarding">
                        Cancel
                    </button>
                )}
            </div>
        </div>
    );
};

export default ActionBar;
