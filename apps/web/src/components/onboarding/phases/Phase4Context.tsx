/**
 * Phase 4: Financial Context
 * Income/expense detection and confirmation
 */

import React, { useState, useEffect } from 'react';
import { FinancialContextPhaseData, DetectedIncome, DetectedExpense } from '../../../types/onboarding.types';
import { validatePhase4 } from '../validators';
import '../styles/Phase4Context.css';

interface Phase4ContextProps {
    householdId: string;
    onNext: (data: FinancialContextPhaseData) => Promise<void>;
    onSkip?: (phase: number) => Promise<void>;
}

export const Phase4Context: React.FC<Phase4ContextProps> = ({ householdId, onNext }) => {
    const [detectedIncome, setDetectedIncome] = useState<DetectedIncome | null>(null);
    const [detectedExpenses, setDetectedExpenses] = useState<DetectedExpense[]>([]);
    const [incomeConfirmed, setIncomeConfirmed] = useState(false);
    const [manualIncome, setManualIncome] = useState('');
    const [loadingIncome, setLoadingIncome] = useState(true);
    const [loadingExpenses, setLoadingExpenses] = useState(true);
    const [errors, setErrors] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    // Load income and expense detections on mount
    useEffect(() => {
        const loadDetections = async () => {
            try {
                // Fetch income detection
                const incomeRes = await fetch(`/api/onboarding/detect-income?householdId=${householdId}`);
                const incomeData = await incomeRes.json();
                if (incomeData.detectedIncome) {
                    setDetectedIncome(incomeData.detectedIncome);
                }

                // Fetch expense detection
                const expenseRes = await fetch(`/api/onboarding/detect-expenses?householdId=${householdId}`);
                const expenseData = await expenseRes.json();
                if (expenseData.detectedExpenses) {
                    setDetectedExpenses(expenseData.detectedExpenses);
                }
            } catch (error) {
                setErrors(['Failed to load financial data']);
            } finally {
                setLoadingIncome(false);
                setLoadingExpenses(false);
            }
        };

        loadDetections();
    }, [householdId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrors([]);
        setLoading(true);

        const data: FinancialContextPhaseData = {
            detectedIncome,
            detectedExpenses,
            userConfirmedIncome: incomeConfirmed,
            userConfirmedIncome_Amount: manualIncome ? parseFloat(manualIncome) * 100 : undefined,
            userConfirmedExpenses: {},
        };

        const validationErrors = validatePhase4(data);
        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            setLoading(false);
            return;
        }

        try {
            await onNext(data);
        } catch (error) {
            setErrors(['Failed to save financial context. Please try again.']);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (cents: number) => {
        return `$${(cents / 100).toFixed(2)}`;
    };

    return (
        <form className="phase-4-form" onSubmit={handleSubmit}>
            <div className="phase-header">
                <h2>Step 4 of 6: Your Finances</h2>
                <p>We analyzed your statements and found:</p>
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

            {/* Income Detection */}
            <div className="section">
                <h3>Monthly Income</h3>
                {loadingIncome ? (
                    <div className="loading">Loading income data...</div>
                ) : detectedIncome ? (
                    <div className="detection-box">
                        <p>
                            We found: <strong>{detectedIncome.frequency}</strong> deposits of{' '}
                            <strong>{formatCurrency(detectedIncome.monthlyGrossCents)}</strong>
                        </p>
                        <p className="confidence">
                            Confidence: <span className={`badge-${detectedIncome.confidence}`}>{detectedIncome.confidence}</span>
                        </p>

                        <div className="form-group">
                            <label>
                                <input
                                    type="radio"
                                    checked={incomeConfirmed}
                                    onChange={() => {
                                        setIncomeConfirmed(true);
                                        setManualIncome('');
                                    }}
                                />
                                Yes, this is correct
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    checked={!incomeConfirmed}
                                    onChange={() => setIncomeConfirmed(false)}
                                />
                                Not quite, let me enter manually
                            </label>
                        </div>

                        {!incomeConfirmed && (
                            <div className="form-group">
                                <label htmlFor="manualIncome">What's your actual monthly income?</label>
                                <input
                                    id="manualIncome"
                                    type="number"
                                    step="0.01"
                                    value={manualIncome}
                                    onChange={(e) => setManualIncome(e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="no-data">No income data detected. Please enter manually.</p>
                )}
            </div>

            {/* Expense Detection */}
            <div className="section">
                <h3>Monthly Expenses</h3>
                {loadingExpenses ? (
                    <div className="loading">Loading expense data...</div>
                ) : detectedExpenses.length > 0 ? (
                    <div className="expenses-list">
                        {detectedExpenses.map((expense, idx) => (
                            <div key={idx} className="expense-item">
                                <div className="expense-info">
                                    <strong>{expense.category}</strong>
                                    <span className={`badge-${expense.confidence}`}>{expense.confidence}</span>
                                </div>
                                <div className="expense-amount">
                                    {formatCurrency(expense.monthlyAverageCents)}/mo
                                </div>
                            </div>
                        ))}

                        <div className="total">
                            <strong>Total:</strong>
                            <span>
                                {formatCurrency(
                                    detectedExpenses.reduce((sum, e) => sum + e.monthlyAverageCents, 0)
                                )}/mo
                            </span>
                        </div>

                        <button type="button" className="btn-secondary">
                            [+ Add missing category]
                        </button>
                    </div>
                ) : (
                    <p className="no-data">No expenses detected. Add them manually.</p>
                )}
            </div>

            {/* Submit */}
            <div className="form-actions">
                <button type="submit" disabled={loading} className="btn-primary">
                    {loading ? 'Saving...' : 'Next >'}
                </button>
            </div>
        </form>
    );
};

export default Phase4Context;
