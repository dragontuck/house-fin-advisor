/**
 * Admin Settings Service
 * Handles AI provider settings management with role-based access control
 */

import {
    AIProviderSettings,
    UpdateAIProviderSettingsRequest,
    LLM_MODELS_BY_PROVIDER,
    LLMProviderName,
    AI_SETTINGS_ADMIN_ROLES,
} from "@house-fin/contracts";
import { EntityId } from "@house-fin/contracts";
import { AIProviderSettingsRepository } from "../repositories/admin-settings-repository";

/**
 * Keycloak JWT token claims for role extraction
 */
export interface KeycloakToken {
    sub: string; // User ID
    realm_access?: {
        roles?: string[];
    };
    household_id?: string;
    [key: string]: unknown;
}

/**
 * Service for managing AI provider settings
 * Enforces role-based access control for admin operations
 */
export class AdminSettingsService {
    constructor(private repository: AIProviderSettingsRepository) { }

    /**
     * Validate that a user has admin access for a household
     * Only users with "admin" or "ADMIN" role in Keycloak can modify settings
     *
     * @throws Error if user doesn't have admin role
     */
    private validateAdminAccess(token: KeycloakToken): void {
        const userRoles = token.realm_access?.roles || [];
        const hasAdminRole = userRoles.some((role) =>
            AI_SETTINGS_ADMIN_ROLES.includes(role as any)
        );

        if (!hasAdminRole) {
            throw new Error(
                `ADMIN_ACCESS_DENIED: User does not have admin role to manage AI provider settings. ` +
                `Required roles: ${AI_SETTINGS_ADMIN_ROLES.join(", ")}. User roles: ${userRoles.join(", ")}`
            );
        }
    }

    /**
     * Validate provider and model combination
     * Ensures the model is supported by the selected provider
     */
    private validateProviderModel(provider: LLMProviderName, model: string): void {
        const supportedModels = LLM_MODELS_BY_PROVIDER[provider];

        // For ollama, any model name is valid (user-defined models)
        if (provider === "ollama") {
            return;
        }

        // For standard providers, model must be in the supported list
        if (!supportedModels.includes(model)) {
            throw new Error(
                `INVALID_MODEL: Model "${model}" is not supported for provider "${provider}". ` +
                `Supported models: ${supportedModels.join(", ")}`
            );
        }
    }

    /**
     * Get current AI provider settings for a household
     * No role restriction for reading (users can see what model they're using)
     */
    async getSettings(householdId: EntityId): Promise<AIProviderSettings | null> {
        return this.repository.getSettingsByHouseholdId(householdId);
    }

    /**
     * Get settings with available provider/model options
     */
    async getSettingsWithOptions(householdId: EntityId): Promise<{
        settings: AIProviderSettings | null;
        availableProviders: LLMProviderName[];
        availableModels: string[];
    }> {
        const settings = await this.repository.getSettingsByHouseholdId(householdId);
        const availableProviders = Object.keys(LLM_MODELS_BY_PROVIDER) as LLMProviderName[];
        const currentProvider = settings?.provider || "anthropic";
        const availableModels = LLM_MODELS_BY_PROVIDER[currentProvider] || [];

        return {
            settings,
            availableProviders,
            availableModels,
        };
    }

    /**
     * Update AI provider settings
     * Restricted to users with admin role
     *
     * @param householdId - Household to update settings for
     * @param memberId - Member ID (from Keycloak token) making the change
     * @param token - Keycloak JWT token for role validation
     * @param settings - New provider/model settings
     * @throws Error if user doesn't have admin role or invalid settings
     */
    async updateSettings(
        householdId: EntityId,
        memberId: EntityId,
        token: KeycloakToken,
        settings: UpdateAIProviderSettingsRequest
    ): Promise<AIProviderSettings> {
        // Validate admin access
        this.validateAdminAccess(token);

        // Validate provider/model combination
        this.validateProviderModel(settings.provider, settings.model);

        // Validate provider config if provided
        if (settings.providerConfig) {
            this.validateProviderConfig(settings.provider, settings.providerConfig);
        }

        // Save to database
        return this.repository.upsertSettings(householdId, memberId, settings);
    }

    /**
     * Validate provider-specific configuration
     */
    private validateProviderConfig(
        provider: LLMProviderName,
        config: Record<string, unknown>
    ): void {
        // Validate common settings
        if (config.temperature !== undefined) {
            const temp = config.temperature as number;
            if (typeof temp !== "number" || temp < 0 || temp > 1) {
                throw new Error("INVALID_CONFIG: temperature must be a number between 0 and 1");
            }
        }

        if (config.maxTokens !== undefined) {
            const maxTokens = config.maxTokens as number;
            if (typeof maxTokens !== "number" || maxTokens <= 0) {
                throw new Error("INVALID_CONFIG: maxTokens must be a positive number");
            }
        }

        // Provider-specific validation
        switch (provider) {
            case "anthropic":
                this.validateAnthropicConfig(config);
                break;
            case "openai":
                this.validateOpenAIConfig(config);
                break;
            case "gemini":
                this.validateGeminiConfig(config);
                break;
            case "ollama":
                // Ollama is flexible with config
                break;
        }
    }

    private validateAnthropicConfig(config: Record<string, unknown>): void {
        // Anthropic-specific validation
        // Currently just standard config validation
    }

    private validateOpenAIConfig(config: Record<string, unknown>): void {
        // OpenAI-specific validation
        // Currently just standard config validation
    }

    private validateGeminiConfig(config: Record<string, unknown>): void {
        // Gemini-specific validation
        // Currently just standard config validation
    }
}
