/**
 * Phase 1: Household Setup
 * Collects household name, profile type, and initial institutions
 */

import React, { useState } from 'react';
import { SetupPhaseData, HouseholdProfileType } from '../../../types/onboarding.types';
import { validatePhase1 } from '../validators';
import '../styles/Phase1Setup.css';

interface Phase1SetupProps {
    householdId: string;
    onNext: (data: SetupPhaseData) => Promise<void>;
    onSkip?: (phase: number) => Promise<void>;
}

export const Phase1Setup: React.FC<Phase1SetupProps> = ({ onNext }) => {
    const [householdName, setHouseholdName] = useState('');
    const [profileType, setProfileType] = useState<HouseholdProfileType>('SOLO');
    const [institutions, setInstitutions] = useState<string[]>([]);
    const [newInstitution, setNewInstitution] = useState('');
    const [errors, setErrors] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const handleAddInstitution = () => {
        if (newInstitution.trim()) {
            setInstitutions([...institutions, newInstitution.trim()]);
            setNewInstitution('');
        }
    };

    const handleRemoveInstitution = (idx: number) => {
        setInstitutions(institutions.filter((_, i) => i !== idx));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrors([]);
        setLoading(true);

        const data: SetupPhaseData = {
            householdName,
            profileType,
            initialInstitutions: institutions,
        };

        const validationErrors = validatePhase1(data);
        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            setLoading(false);
            return;
        }

        try {
            await onNext(data);
        } catch (error) {
            setErrors(['Failed to save setup information. Please try again.']);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="phase-1-form" onSubmit={handleSubmit}>
            <div className="phase-header">
                <h2>Step 1 of 6: Let's Get Started</h2>
                <p>We'll help you build a budget in about 20 minutes.</p>
            </div>

            {errors.length > 0 && (
                <div className="form-errors">
                    {errors.map((err, idx) => (
                        <div key={idx} className="error-message">
                            {err}
                        </div>
                    ))}
                </div>
            )}

            {/* Household Name */}
            <div className="form-group">
                <label htmlFor="householdName">Household Name</label>
                <input
                    id="householdName"
                    type="text"
                    value={householdName}
                    onChange={(e) => setHouseholdName(e.target.value)}
                    placeholder="e.g., The Smith Family"
                    required
                />
                {householdName && <span className="char-count">{householdName.length}/50</span>}
            </div>

            {/* Profile Type */}
            <div className="form-group">
                <label>How would you describe your finances?</label>
                <div className="radio-group">
                    <label>
                        <input
                            type="radio"
                            value="SOLO"
                            checked={profileType === 'SOLO'}
                            onChange={(e) => setProfileType(e.target.value as HouseholdProfileType)}
                        />
                        Solo (I manage finances alone)
                    </label>
                    <label>
                        <input
                            type="radio"
                            value="COUPLE"
                            checked={profileType === 'COUPLE'}
                            onChange={(e) => setProfileType(e.target.value as HouseholdProfileType)}
                        />
                        Couple (Joint accounts)
                    </label>
                    <label>
                        <input
                            type="radio"
                            value="FAMILY"
                            checked={profileType === 'FAMILY'}
                            onChange={(e) => setProfileType(e.target.value as HouseholdProfileType)}
                        />
                        Family (Multiple members)
                    </label>
                </div>
            </div>

            {/* Banks/Institutions */}
            <div className="form-group">
                <label htmlFor="institutions">Where do you bank? (select all)</label>
                <div className="institution-list">
                    {institutions.map((inst, idx) => (
                        <div key={idx} className="institution-tag">
                            {inst}
                            <button type="button" onClick={() => handleRemoveInstitution(idx)} className="remove-btn">
                                ×
                            </button>
                        </div>
                    ))}
                </div>

                <div className="institution-input">
                    <input
                        id="institutions"
                        type="text"
                        value={newInstitution}
                        onChange={(e) => setNewInstitution(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddInstitution())}
                        placeholder="Add a bank or credit union"
                    />
                    <button type="button" onClick={handleAddInstitution} className="btn-secondary">
                        + Add Bank
                    </button>
                </div>
            </div>

            {/* Submit Button */}
            <div className="form-actions">
                <button type="submit" disabled={loading || !householdName} className="btn-primary">
                    {loading ? 'Saving...' : 'Next >'}
                </button>
            </div>
        </form>
    );
};

export default Phase1Setup;
