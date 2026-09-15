/**
 * Phase 6: Review and Launch
 * Final review of setup and launch onboarding
 */

import React, { useState } from 'react';
import { LaunchPhaseData } from '../../../types/onboarding.types';
import '../styles/Phase6Review.css';

interface Phase6ReviewProps {
    householdId: string;
    onNext?: (data: LaunchPhaseData) => Promise<void>;
    onLaunch: () => Promise<void>;
    onComplete?: (snapshot: any) => void;
}

export const Phase6Review: React.FC<Phase6ReviewProps> = ({ onLaunch }) => {
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);

    const handleLaunch = async () => {
        setErrors([]);
        setLoading(true);
        try {
            await onLaunch();
        } catch (error) {
            setErrors(['Failed to launch. Please try again.']);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="phase-6-review">
            <div className="phase-header">
                <h2>Step 6 of 6: Ready to Launch</h2>
                <p>Your financial snapshot is ready!</p>
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

            {/* Financial Snapshot */}
            <div className="snapshot-box">
                <h3>📊 Your Financial Snapshot</h3>
                <div className="metrics">
                    <div className="metric">
                        <span className="label">Net Worth</span>
                        <span className="value">$250,000</span>
                    </div>
                    <div className="metric">
                        <span className="label">Monthly Surplus</span>
                        <span className="value">$2,500</span>
                    </div>
                    <div className="metric">
                        <span className="label">Emergency Fund</span>
                        <span className="value">2.5 months</span>
                    </div>
                    <div className="metric">
                        <span className="label">Financial Health</span>
                        <span className="value health-good">✓ HEALTHY</span>
                    </div>
                </div>
            </div>

            {/* Initial Insights */}
            <div className="insights-box">
                <h3>💡 Initial Insights</h3>
                <ul className="insights-list">
                    <li className="insight-positive">✓ You're in good financial health</li>
                    <li className="insight-warning">⚠ Emergency fund below target (6 months)</li>
                    <li className="insight-positive">💰 Strong savings rate - well done!</li>
                    <li className="insight-info">🎯 Consider student loan refinancing</li>
                </ul>
            </div>

            {/* Launch Button */}
            <div className="form-actions">
                <button onClick={handleLaunch} disabled={loading} className="btn-primary btn-large">
                    {loading ? 'Launching...' : 'Continue to Dashboard'}
                </button>
            </div>

            <p className="small-text">
                Your data is secure and private. You can manage all settings in your dashboard.
            </p>
        </div>
    );
};

export default Phase6Review;
