/**
 * Phase 3: Statement Collection
 * File upload and statement collection tracking
 */

import React, { useState } from 'react';
import { StatementsPhaseData } from '../../../types/onboarding.types';
import { validatePhase3 } from '../validators';
import '../styles/Phase3Statements.css';

interface Phase3StatementsProps {
    householdId: string;
    onNext: (data: StatementsPhaseData) => Promise<void>;
    onSkip?: (phase: number) => Promise<void>;
}

export const Phase3Statements: React.FC<Phase3StatementsProps> = ({ onNext }) => {
    const [dragActive, setDragActive] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [selectedDateRange, setSelectedDateRange] = useState({ from: '', to: '' });
    const [errors, setErrors] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(e.type !== 'dragleave');
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const files = Array.from(e.dataTransfer.files);
        handleFiles(files);
    };

    const handleFiles = (files: File[]) => {
        const validFiles = files.filter((file) => {
            const validTypes = ['text/csv', 'application/pdf', 'image/png', 'image/jpeg'];
            if (!validTypes.includes(file.type)) {
                setErrors((prev) => [...prev, `${file.name}: Invalid file type`]);
                return false;
            }
            if (file.size > 50 * 1024 * 1024) {
                // 50MB
                setErrors((prev) => [...prev, `${file.name}: File too large`]);
                return false;
            }
            return true;
        });

        setUploadedFiles((prev) => [...prev, ...validFiles]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrors([]);
        setLoading(true);

        if (uploadedFiles.length === 0) {
            setErrors(['Please upload at least one statement']);
            setLoading(false);
            return;
        }

        const data: StatementsPhaseData = {
            accountStatementCollectionStatus: {},
        };

        const validationErrors = validatePhase3(data);
        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            setLoading(false);
            return;
        }

        try {
            // Upload files
            const formData = new FormData();
            uploadedFiles.forEach((file) => formData.append('files', file));
            formData.append('dateRange', JSON.stringify(selectedDateRange));

            const uploadResponse = await fetch('/api/onboarding/statements/upload', {
                method: 'POST',
                body: formData,
            });

            if (!uploadResponse.ok) {
                throw new Error('Upload failed');
            }

            await onNext(data);
        } catch (error) {
            setErrors(['Failed to upload statements. Please try again.']);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="phase-3-form" onSubmit={handleSubmit}>
            <div className="phase-header">
                <h2>Step 3 of 6: Your Statements</h2>
                <p>Upload 3+ months of statements to analyze your finances.</p>
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

            {/* Guidance */}
            <div className="guidance-box">
                <h4>📋 Guidance</h4>
                <p>Most banks let you download statements as CSV files. Here's how to download from your bank:</p>
                <ul>
                    <li>Chase: Account Settings → Download Statements</li>
                    <li>Bank of America: Statements → Download</li>
                    <li>Wells Fargo: Statements & Documents → Download</li>
                </ul>
            </div>

            {/* Date Range */}
            <div className="form-group">
                <label>Select Date Range</label>
                <div className="date-inputs">
                    <input
                        type="month"
                        value={selectedDateRange.from}
                        onChange={(e) => setSelectedDateRange({ ...selectedDateRange, from: e.target.value })}
                        placeholder="From"
                    />
                    <span>to</span>
                    <input
                        type="month"
                        value={selectedDateRange.to}
                        onChange={(e) => setSelectedDateRange({ ...selectedDateRange, to: e.target.value })}
                        placeholder="To"
                    />
                </div>
            </div>

            {/* File Upload Area */}
            <div
                className={`file-upload-area ${dragActive ? 'active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <div className="upload-content">
                    <p>📤 Drag & drop files here</p>
                    <p>or</p>
                    <label className="file-input-label">
                        <input
                            type="file"
                            multiple
                            accept=".csv,.pdf,.png,.jpeg,.jpg"
                            onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))}
                            style={{ display: 'none' }}
                        />
                        <span className="btn-secondary">Choose File</span>
                    </label>
                    <p className="small">Formats: CSV, PDF, PNG, JPEG, TIFF (Max 50MB)</p>
                </div>
            </div>

            {/* Uploaded Files */}
            {uploadedFiles.length > 0 && (
                <div className="uploaded-files">
                    <h3>✓ Uploaded Files ({uploadedFiles.length})</h3>
                    {uploadedFiles.map((file, idx) => (
                        <div key={idx} className="file-item">
                            <span>{file.name}</span>
                            <button
                                type="button"
                                onClick={() => setUploadedFiles(uploadedFiles.filter((_, i) => i !== idx))}
                                className="btn-remove"
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Submit */}
            <div className="form-actions">
                <button type="submit" disabled={loading || uploadedFiles.length === 0} className="btn-primary">
                    {loading ? 'Uploading...' : 'Next >'}
                </button>
            </div>
        </form>
    );
};

export default Phase3Statements;
