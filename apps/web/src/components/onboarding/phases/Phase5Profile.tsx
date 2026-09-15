/**
 * Phase 5: Household Profile
 * Household members, privacy, and notification preferences
 */

import React, { useState } from 'react';
import { ProfilePhaseData, HouseholdMember } from '../../../types/onboarding.types';
import { validatePhase5 } from '../validators';
import '../styles/Phase5Profile.css';

interface Phase5ProfileProps {
    householdId: string;
    onNext: (data: ProfilePhaseData) => Promise<void>;
    onSkip?: (phase: number) => Promise<void>;
}

export const Phase5Profile: React.FC<Phase5ProfileProps> = ({ onNext }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [members, _setMembers] = useState<HouseholdMember[]>([]);
    const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
    const [budgetAlerts, setBudgetAlerts] = useState(true);
    const [milestones, setMilestones] = useState(true);
    const [weeklyDigest, setWeeklyDigest] = useState(false);
    const [frequency, setFrequency] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('WEEKLY');
    const [errors, setErrors] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrors([]);

        if (!privacyConfirmed) {
            setErrors(['You must confirm privacy policy']);
            return;
        }

        setLoading(true);

        const data: ProfilePhaseData = {
            householdMembers: members,
            privacyConfirmed,
            notificationPreferences: {
                budgetAlerts,
                financialMilestones: milestones,
                weeklyDigest,
                frequency,
            },
            twoFactorEnabled: false,
        };

        const validationErrors = validatePhase5(data);
        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            setLoading(false);
            return;
        }

        try {
            await onNext(data);
        } catch (error) {
            setErrors(['Failed to save profile. Please try again.']);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="phase-5-form" onSubmit={handleSubmit}>
            <div className="phase-header">
                <h2>Step 5 of 6: Your Profile</h2>
                <p>Complete your household setup.</p>
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

            {/* Household Members */}
            <div className="section">
                <h3>👥 Household Members</h3>
                <p className="section-description">You are the account owner. Optionally add other members.</p>
                {members.length === 0 && (
                    <p className="info-text">Only you for now (you can add more members later)</p>
                )}
                <button type="button" className="btn-secondary">
                    [+ Add Member]
                </button>
            </div>

            {/* Privacy */}
            <div className="section">
                <h3>🔒 Privacy</h3>
                <ul className="privacy-list">
                    <li>✓ Your data stays on your device</li>
                    <li>✓ Never sold or shared</li>
                    <li>✓ AI only uses approved sources</li>
                </ul>
                <label className="checkbox">
                    <input type="checkbox" checked={privacyConfirmed} onChange={(e) => setPrivacyConfirmed(e.target.checked)} />
                    I've read and agree to the privacy policy
                </label>
            </div>

            {/* Notifications */}
            <div className="section">
                <h3>🔔 Notifications</h3>
                <div className="notification-options">
                    <label className="checkbox">
                        <input type="checkbox" checked={budgetAlerts} onChange={(e) => setBudgetAlerts(e.target.checked)} />
                        Budget alerts
                    </label>
                    <label className="checkbox">
                        <input
                            type="checkbox"
                            checked={milestones}
                            onChange={(e) => setMilestones(e.target.checked)}
                        />
                        Financial milestones
                    </label>
                    <label className="checkbox">
                        <input
                            type="checkbox"
                            checked={weeklyDigest}
                            onChange={(e) => setWeeklyDigest(e.target.checked)}
                        />
                        Weekly digest
                    </label>
                </div>

                <div className="form-group">
                    <label htmlFor="frequency">Notification Frequency</label>
                    <select value={frequency} onChange={(e) => setFrequency(e.target.value as 'DAILY' | 'WEEKLY' | 'MONTHLY')}>
                        <option value="DAILY">Daily</option>
                        <option value="WEEKLY">Weekly</option>
                        <option value="MONTHLY">Monthly</option>
                    </select>
                </div>
            </div>

            {/* Submit */}
            <div className="form-actions">
                <button type="submit" disabled={loading || !privacyConfirmed} className="btn-primary">
                    {loading ? 'Saving...' : 'Next >'}
                </button>
            </div>
        </form>
    );
};

export default Phase5Profile;
