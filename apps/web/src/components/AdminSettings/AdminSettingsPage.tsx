/**
 * Admin Settings Page - AI Provider Configuration
 * Allows household admins to select which LLM provider and model to use
 * Only visible to users with 'admin' role from Keycloak
 */

import React, { useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import {
    AIProviderSettingsResponse,
    UpdateAIProviderSettingsRequest,
    LLMProviderName,
    LLM_MODELS_BY_PROVIDER,
} from "@house-fin/contracts";
import "./AdminSettings.css";

interface AdminSettingsPageProps {
    householdId: string;
}

export const AdminSettingsPage: React.FC<AdminSettingsPageProps> = ({ householdId }) => {
    const { authenticatedFetch, keycloakToken } = useAuth();
    const [settings, setSettings] = useState<AIProviderSettingsResponse | null>(null);
    const [selectedProvider, setSelectedProvider] = useState<LLMProviderName>("anthropic");
    const [selectedModel, setSelectedModel] = useState<string>("");
    const [temperature, setTemperature] = useState<number>(0.7);
    const [maxTokens, setMaxTokens] = useState<number>(2000);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Check if user has admin role
    const userRoles = keycloakToken?.realm_access?.roles || [];
    const isAdmin = userRoles.some((role) => role === "admin" || role === "ADMIN");

    useEffect(() => {
        loadSettings();
    }, [householdId]);

    const loadSettings = async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await authenticatedFetch(
                `/admin/settings/ai-provider`
            );

            if (!response.ok) {
                if (response.status === 401) {
                    setError("You do not have permission to view AI settings. Only admins can access this page.");
                } else {
                    throw new Error(`Failed to load settings: ${response.statusText}`);
                }
                return;
            }

            const data: AIProviderSettingsResponse = await response.json();
            setSettings(data);

            if (data.settings) {
                setSelectedProvider(data.settings.provider);
                setSelectedModel(data.settings.model);
                setTemperature(
                    (data.settings.providerConfig?.temperature as number) || 0.7
                );
                setMaxTokens(
                    (data.settings.providerConfig?.maxTokens as number) || 2000
                );
            } else {
                // Use defaults
                setSelectedProvider("anthropic");
                setSelectedModel(LLM_MODELS_BY_PROVIDER.anthropic[0]);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load settings";
            setError(message);
            console.error("Error loading AI provider settings:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleProviderChange = (newProvider: LLMProviderName) => {
        setSelectedProvider(newProvider);
        // Auto-select first available model for the new provider
        const models = LLM_MODELS_BY_PROVIDER[newProvider];
        if (models.length > 0) {
            setSelectedModel(models[0]);
        }
    };

    const handleSaveSettings = async () => {
        try {
            setSaving(true);
            setError(null);
            setSuccessMessage(null);

            const updateRequest: UpdateAIProviderSettingsRequest = {
                provider: selectedProvider,
                model: selectedModel,
                providerConfig: {
                    temperature,
                    maxTokens,
                },
            };

            const response = await authenticatedFetch(
                `/admin/settings/ai-provider`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(updateRequest),
                }
            );

            if (!response.ok) {
                if (response.status === 403) {
                    setError(
                        "You do not have permission to modify AI settings. Only household admins can make these changes."
                    );
                } else {
                    const errorData = await response.json().catch(() => null);
                    throw new Error(
                        errorData?.message || `Failed to save settings: ${response.statusText}`
                    );
                }
                return;
            }

            await loadSettings(); // Reload to confirm changes
            setSuccessMessage("AI provider settings saved successfully!");

            // Clear success message after 5 seconds
            setTimeout(() => setSuccessMessage(null), 5000);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to save settings";
            setError(message);
            console.error("Error saving AI provider settings:", err);
        } finally {
            setSaving(false);
        }
    };

    if (!isAdmin) {
        return (
            <div className="admin-settings-page">
                <div className="access-denied-message">
                    <h2>Access Denied</h2>
                    <p>
                        Only household administrators can access AI provider settings.
                        Please contact a household admin to change these settings.
                    </p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="admin-settings-page">
                <div className="loading">Loading AI provider settings...</div>
            </div>
        );
    }

    const availableModels = LLM_MODELS_BY_PROVIDER[selectedProvider] || [];

    return (
        <div className="admin-settings-page">
            <div className="settings-container">
                <h1>AI Provider Configuration</h1>
                <p className="subtitle">
                    Configure which LLM provider and model your household uses for financial advice
                </p>

                {error && <div className="error-message">{error}</div>}
                {successMessage && (
                    <div className="success-message">{successMessage}</div>
                )}

                <div className="settings-form">
                    {/* Provider Selection */}
                    <div className="form-group">
                        <label htmlFor="provider">LLM Provider</label>
                        <select
                            id="provider"
                            value={selectedProvider}
                            onChange={(e) =>
                                handleProviderChange(e.target.value as LLMProviderName)
                            }
                            disabled={saving}
                            className="form-select"
                        >
                            <option value="anthropic">Anthropic Claude</option>
                            <option value="openai">OpenAI GPT</option>
                            <option value="gemini">Google Gemini</option>
                            <option value="ollama">Ollama (Local)</option>
                        </select>
                        <p className="help-text">
                            Select which AI provider powers your financial advisor
                        </p>
                    </div>

                    {/* Model Selection */}
                    <div className="form-group">
                        <label htmlFor="model">Model</label>
                        <select
                            id="model"
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            disabled={saving || availableModels.length === 0}
                            className="form-select"
                        >
                            {availableModels.map((model) => (
                                <option key={model} value={model}>
                                    {model}
                                </option>
                            ))}
                        </select>
                        <p className="help-text">
                            Choose the specific model version to use
                        </p>
                    </div>

                    {/* Temperature Control */}
                    <div className="form-group">
                        <label htmlFor="temperature">
                            Temperature: {temperature.toFixed(2)}
                        </label>
                        <input
                            id="temperature"
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={temperature}
                            onChange={(e) => setTemperature(parseFloat(e.target.value))}
                            disabled={saving}
                            className="form-slider"
                        />
                        <p className="help-text">
                            0 = Deterministic (always same answer), 1 = Creative (varied responses)
                        </p>
                    </div>

                    {/* Max Tokens Control */}
                    <div className="form-group">
                        <label htmlFor="maxTokens">Max Response Length</label>
                        <input
                            id="maxTokens"
                            type="number"
                            min="100"
                            max="4000"
                            step="100"
                            value={maxTokens}
                            onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
                            disabled={saving}
                            className="form-input"
                        />
                        <p className="help-text">
                            Maximum number of tokens (words) in the AI's response
                        </p>
                    </div>

                    {/* Current Settings Info */}
                    {settings?.settings && (
                        <div className="current-settings">
                            <h3>Current Configuration</h3>
                            <p>
                                <strong>Provider:</strong> {settings.settings.provider}
                            </p>
                            <p>
                                <strong>Model:</strong> {settings.settings.model}
                            </p>
                            <p>
                                <strong>Configured by:</strong> {settings.settings.configuredByMemberId}
                            </p>
                            <p>
                                <strong>Last updated:</strong>{" "}
                                {new Date(settings.settings.updatedAt).toLocaleString()}
                            </p>
                        </div>
                    )}

                    {/* Save Button */}
                    <button
                        onClick={handleSaveSettings}
                        disabled={saving || !isAdmin}
                        className="save-button"
                    >
                        {saving ? "Saving..." : "Save Settings"}
                    </button>
                </div>

                {/* Provider Information */}
                <div className="provider-info">
                    <h2>About LLM Providers</h2>
                    <div className="info-cards">
                        <div className="info-card">
                            <h3>Anthropic Claude</h3>
                            <p>
                                State-of-the-art reasoning and analysis. Excellent for complex financial
                                planning. Default option for most households.
                            </p>
                        </div>
                        <div className="info-card">
                            <h3>OpenAI GPT</h3>
                            <p>
                                Fast and versatile. Good all-around choice for financial guidance and
                                scenario analysis.
                            </p>
                        </div>
                        <div className="info-card">
                            <h3>Google Gemini</h3>
                            <p>
                                Highly capable with strong multimodal capabilities. Excellent for analyzing
                                financial documents.
                            </p>
                        </div>
                        <div className="info-card">
                            <h3>Ollama (Local)</h3>
                            <p>
                                Run models locally on your server. Complete privacy with no external API
                                calls. Requires manual model installation.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminSettingsPage;
