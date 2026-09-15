/**
 * FormError Component
 * Displays validation errors with recovery guidance
 */

import React from 'react';
import { OnboardingValidationError } from '../../types/onboarding.types';
import './FormError.css';

interface FormErrorProps {
    error: OnboardingValidationError;
}

// Map error codes to helpful guidance
const ERROR_GUIDANCE: Record<string, string> = {
    PHASE_TRANSITION_FAILED: 'Try refreshing the page and try again.',
    PHASE_COMPLETION_FAILED: 'Make sure all required fields are filled out.',
    PHASE_SKIP_FAILED: 'This phase cannot be skipped. Please complete it first.',
    UPLOAD_FAILED: 'Check file format and size. Supported: CSV, PDF, PNG, JPEG.',
    LAUNCH_FAILED: 'Make sure you have completed all required phases.',
};

export const FormError: React.FC<FormErrorProps> = ({ error }) => {
    const guidance = ERROR_GUIDANCE[error.code] || 'Please check your input and try again.';

    return (
        <div className="form-error">
            <div className="error-icon">⚠️</div>
            <div className="error-content">
                <p className="error-message">{error.message}</p>
                <p className="error-guidance">{guidance}</p>
            </div>
        </div>
    );
};

export default FormError;
