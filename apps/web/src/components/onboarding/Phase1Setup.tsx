/**
 * Phase 1: Setup Component
 * 
 * Collects household name, profile type, and initial institutions.
 */

import React, { useState } from 'react';
import { HouseholdProfileType, SetupPhaseData, ValidationError } from '../../../packages/domain/types/onboarding.types';

export interface Phase1SetupProps {
    /**
     * Initial data (for editing)
     */
    initialData?: Partial<SetupPhaseData>;

    /**
     * Callback when form is submitted
     */
    onSubmit: (data: SetupPhaseData) => Promise<void>;

    /**
     * Validation errors to display
     */
    errors?: ValidationError[];

    /**
     * Loading state
     */
    isLoading?: boolean;
}

/**
 * Phase 1 Setup Component
 */
export const Phase1Setup: React.FC<Phase1SetupProps> = ({
    initialData,
    onSubmit,
    errors = [],
    isLoading = false,
}) => {
    const [householdName, setHouseholdName] = useState<string>(initialData?.householdName || '');
    const [profileType, setProfileType] = useState<HouseholdProfileType | ''>(
        (initialData?.profileType as HouseholdProfileType) || ''
    );
    const [institutions, setInstitutions] = useState<string[]>(initialData?.initialInstitutions || []);
    const [newInstitution, setNewInstitution] = useState<string>('');

    const handleAddInstitution = () => {
        if (newInstitution.trim()) {
            setInstitutions([...institutions, newInstitution]);
            setNewInstitution('');
        }
    };

    const handleRemoveInstitution = (index: number) => {
        setInstitutions(institutions.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // TODO: Implement form submission in Phase 2
        console.log('Form submitted:', { householdName, profileType, institutions });
    };

    return (
        <div className="phase-1-setup">
            <h2>Let's Get Started</h2>
            <p>We'll help you set up your household finances in about 20 minutes.</p>

            <form onSubmit={handleSubmit}>
                {/* Household Name */}
                <div className="form-group">
                    <label htmlFor="householdName">
                        Household Name *
                        <input
                            id="householdName"
                            type="text"
                            placeholder="e.g., Smith Family"
                            value={householdName}
                            onChange={(e) => setHouseholdName(e.target.value)}
                            maxLength={255}
                            disabled={isLoading}
                            required
                        />
                    </label>
                    <span className="char-count">{householdName.length} / 255</span>
                    {errors.find((e) => e.field === 'householdName') && (
                        <div className="error-message">
                            {errors.find((e) => e.field === 'householdName')?.message}
                        </div>
                    )}
                </div>

                {/* Profile Type */}
                <div className="form-group">
                    <label>How would you describe your finances? *</label>
                    <div className="radio-group">
                        <label>
                            <input
                                type="radio"
                                name="profileType"
                                value="SOLO"
                                checked={profileType === 'SOLO'}
                                onChange={(e) => setProfileType(e.target.value as HouseholdProfileType)}
                                disabled={isLoading}
                            />
                            Solo (I manage finances alone)
                        </label>
                        <label>
                            <input
                                type="radio"
                                name="profileType"
                                value="COUPLE"
                                checked={profileType === 'COUPLE'}
                                onChange={(e) => setProfileType(e.target.value as HouseholdProfileType)}
                                disabled={isLoading}
                            />
                            Couple (Joint accounts)
                        </label>
                        <label>
                            <input
                                type="radio"
                                name="profileType"
                                value="FAMILY"
                                checked={profileType === 'FAMILY'}
                                onChange={(e) => setProfileType(e.target.value as HouseholdProfileType)}
                                disabled={isLoading}
                            />
                            Family (Multiple members)
                        </label>
                    </div>
                    {errors.find((e) => e.field === 'profileType') && (
                        <div className="error-message">
                            {errors.find((e) => e.field === 'profileType')?.message}
                        </div>
                    )}
                </div>

                {/* Initial Institutions */}
                <div className="form-group">
                    <label>Where do you bank? (select all that apply)</label>
                    <div className="institution-checkboxes">
                        {['Chase', 'Bank of America', 'Wells Fargo', 'Citibank', 'Local Credit Union'].map((bank) => (
                            <label key={bank}>
                                <input
                                    type="checkbox"
                                    checked={institutions.includes(bank)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setInstitutions([...institutions, bank]);
                                        } else {
                                            setInstitutions(institutions.filter((b) => b !== bank));
                                        }
                                    }}
                                    disabled={isLoading}
                                />
                                {bank}
                            </label>
                        ))}
                    </div>

                    {/* Add Custom Institution */}
                    <div className="add-institution">
                        <input
                            type="text"
                            placeholder="Other bank name"
                            value={newInstitution}
                            onChange={(e) => setNewInstitution(e.target.value)}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddInstitution();
                                }
                            }}
                            disabled={isLoading}
                        />
                        <button
                            type="button"
                            onClick={handleAddInstitution}
                            disabled={!newInstitution.trim() || isLoading}
                        >
                            + Add
                        </button>
                    </div>

                    {/* Institution List */}
                    {institutions.length > 0 && (
                        <div className="institution-list">
                            <p>Selected institutions:</p>
                            <ul>
                                {institutions.map((bank, index) => (
                                    <li key={index}>
                                        {bank}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveInstitution(index)}
                                            disabled={isLoading}
                                            aria-label={`Remove ${bank}`}
                                        >
                                            ✕
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Submit Button */}
                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isLoading || !householdName || !profileType}
                >
                    {isLoading ? 'Saving...' : 'Continue'}
                </button>
            </form>

            {/* Display any other validation errors */}
            {errors.length > 0 && (
                <div className="all-errors">
                    {errors.map((error, index) => (
                        <div key={index} className={`error error-${error.severity.toLowerCase()}`}>
                            <strong>{error.field}:</strong> {error.message}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Phase1Setup;
