/**
 * Phase 2: Account Declaration
 * Allows users to declare their financial accounts
 */

import React, { useState } from 'react';
import { AccountsPhaseData, DeclaredAccount, AccountType } from '../../../types/onboarding.types';
import { validatePhase2 } from '../validators';
import '../styles/Phase2Accounts.css';

interface Phase2AccountsProps {
    householdId: string;
    onNext: (data: AccountsPhaseData) => Promise<void>;
    onSkip?: (phase: number) => Promise<void>;
}

const ACCOUNT_TYPES: { value: AccountType; label: string; category: string }[] = [
    { value: 'CHECKING', label: 'Checking Account', category: 'Cash Accounts' },
    { value: 'SAVINGS', label: 'Savings Account', category: 'Cash Accounts' },
    { value: 'MONEY_MARKET', label: 'Money Market', category: 'Cash Accounts' },
    { value: 'CREDIT_CARD', label: 'Credit Card', category: 'Debt' },
    { value: 'AUTO_LOAN', label: 'Auto Loan', category: 'Debt' },
    { value: 'STUDENT_LOAN', label: 'Student Loan', category: 'Debt' },
    { value: 'MORTGAGE', label: 'Mortgage', category: 'Debt' },
];

export const Phase2Accounts: React.FC<Phase2AccountsProps> = ({ onNext }) => {
    const [accounts, setAccounts] = useState<DeclaredAccount[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState<Partial<DeclaredAccount>>({});
    const [errors, setErrors] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const handleAddAccount = () => {
        if (!formData.name || !formData.accountType) {
            setErrors(['Please fill in all fields']);
            return;
        }

        const newAccount: DeclaredAccount = {
            tempId: `temp-${Date.now()}`,
            name: formData.name,
            accountType: formData.accountType as AccountType,
            accountNumberSuffix: formData.accountNumberSuffix,
            estimatedBalance: formData.estimatedBalance,
        };

        setAccounts([...accounts, newAccount]);
        setFormData({});
        setShowForm(false);
        setErrors([]);
    };

    const handleRemoveAccount = (idx: number) => {
        setAccounts(accounts.filter((_, i) => i !== idx));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrors([]);
        setLoading(true);

        const data: AccountsPhaseData = { declaredAccounts: accounts };

        const validationErrors = validatePhase2(data);
        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            setLoading(false);
            return;
        }

        try {
            await onNext(data);
        } catch (error) {
            setErrors(['Failed to save accounts. Please try again.']);
        } finally {
            setLoading(false);
        }
    };

    const groupedTypes = ACCOUNT_TYPES.reduce(
        (acc, type) => {
            if (!acc[type.category]) {
                acc[type.category] = [];
            }
            acc[type.category].push(type);
            return acc;
        },
        {} as Record<string, typeof ACCOUNT_TYPES>
    );

    return (
        <form className="phase-2-form" onSubmit={handleSubmit}>
            <div className="phase-header">
                <h2>Step 2 of 6: Your Accounts</h2>
                <p>We need at least one account to get started.</p>
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

            {/* Account Types Selection */}
            {!showForm && (
                <div className="account-types">
                    {Object.entries(groupedTypes).map(([category, types]) => (
                        <div key={category} className="account-category">
                            <h4>{category}</h4>
                            <div className="account-options">
                                {types.map((type) => (
                                    <label key={type.value} className="account-checkbox">
                                        <input type="checkbox" disabled readOnly />
                                        <span>{type.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add Account Form */}
            {showForm && (
                <div className="account-form">
                    <div className="form-group">
                        <label htmlFor="accountName">Account Name</label>
                        <input
                            id="accountName"
                            type="text"
                            value={formData.name || ''}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g., Chase Checking"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="accountType">Account Type</label>
                        <select
                            id="accountType"
                            value={formData.accountType || ''}
                            onChange={(e) => setFormData({ ...formData, accountType: e.target.value as AccountType })}
                        >
                            <option value="">Select account type</option>
                            {ACCOUNT_TYPES.map((type) => (
                                <option key={type.value} value={type.value}>
                                    {type.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="accountSuffix">Last 4 Digits (optional)</label>
                        <input
                            id="accountSuffix"
                            type="text"
                            maxLength={4}
                            value={formData.accountNumberSuffix || ''}
                            onChange={(e) => setFormData({ ...formData, accountNumberSuffix: e.target.value })}
                            placeholder="1234"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="balance">Estimated Balance (optional)</label>
                        <input
                            id="balance"
                            type="number"
                            value={formData.estimatedBalance || ''}
                            onChange={(e) => setFormData({ ...formData, estimatedBalance: parseFloat(e.target.value) })}
                            placeholder="0.00"
                        />
                    </div>

                    <div className="form-actions">
                        <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                            Cancel
                        </button>
                        <button type="button" onClick={handleAddAccount} className="btn-primary">
                            Add Account
                        </button>
                    </div>
                </div>
            )}

            {/* Added Accounts */}
            {accounts.length > 0 && (
                <div className="accounts-list">
                    <h3>Your Accounts ({accounts.length})</h3>
                    {accounts.map((account, idx) => (
                        <div key={idx} className="account-item">
                            <div className="account-info">
                                <strong>{account.name}</strong>
                                <span className="account-type">{account.accountType}</span>
                            </div>
                            <button type="button" onClick={() => handleRemoveAccount(idx)} className="btn-remove">
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Add Button */}
            {!showForm && (
                <button type="button" onClick={() => setShowForm(true)} className="btn-add">
                    + Add Account
                </button>
            )}

            {/* Submit */}
            <div className="form-actions">
                <button type="submit" disabled={loading || accounts.length === 0} className="btn-primary">
                    {loading ? 'Saving...' : 'Next >'}
                </button>
            </div>
        </form>
    );
};

export default Phase2Accounts;
