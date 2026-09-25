/**
 * Admin Settings Contracts
 * Types for managing AI provider and model configuration per household.
 * Only users with ADMIN role can view/modify these settings.
 */

import { EntityId } from "./index";

/**
 * Supported LLM provider names
 */
export type LLMProviderName = "anthropic" | "openai" | "gemini" | "ollama";

/**
 * Standard LLM models by provider
 */
export const LLM_MODELS_BY_PROVIDER: Record<LLMProviderName, string[]> = {
    anthropic: [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20250219",
    ],
    openai: [
        "gpt-4o",
        "gpt-4-turbo",
        "gpt-4",
        "gpt-3.5-turbo",
    ],
    gemini: [
        "gemini-2.0-flash",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
    ],
    ollama: [], // User-defined models for local deployment
};

/**
 * Optional provider-specific configuration
 */
export interface ProviderConfig {
    /** LLM temperature: controls randomness (0-1, default 0.7) */
    temperature?: number;
    /** Maximum tokens to generate (depends on provider) */
    maxTokens?: number;
    /** Additional provider-specific settings as JSON */
    [key: string]: unknown;
}

/**
 * AI Provider Settings for a household
 * Defines which LLM provider and model to use
 */
export interface AIProviderSettings {
    /** Unique identifier for this settings record */
    id: EntityId;
    /** The household these settings apply to */
    householdId: EntityId;
    /** LLM provider name (anthropic, openai, gemini, ollama) */
    provider: LLMProviderName;
    /** Model identifier as understood by the provider */
    model: string;
    /** Optional provider-specific configuration */
    providerConfig: ProviderConfig;
    /** Member who created this configuration */
    configuredByMemberId: EntityId;
    /** When this was originally configured */
    configuredAt: Date;
    /** Member who last updated this configuration (null if never updated) */
    updatedByMemberId?: EntityId;
    /** When this was last updated */
    updatedAt: Date;
}

/**
 * Request to create or update AI provider settings
 * Only allowed for users with ADMIN role in the household
 */
export interface UpdateAIProviderSettingsRequest {
    /** LLM provider name */
    provider: LLMProviderName;
    /** Model identifier */
    model: string;
    /** Optional provider-specific config */
    providerConfig?: ProviderConfig;
}

/**
 * Response with current AI provider settings for a household
 */
export interface AIProviderSettingsResponse {
    settings: AIProviderSettings;
    /** List of available providers */
    availableProviders: LLMProviderName[];
    /** Available models for the current provider */
    availableModels: string[];
}

/**
 * Admin roles that can modify AI provider settings
 */
export const AI_SETTINGS_ADMIN_ROLES = ["admin", "ADMIN"] as const;
export type AdminRole = (typeof AI_SETTINGS_ADMIN_ROLES)[number];

/**
 * Error response for unauthorized access to admin settings
 */
export interface AdminAccessDeniedError {
    code: "ADMIN_ACCESS_DENIED";
    message: "User does not have permission to manage AI provider settings";
    requiredRoles: string[];
}
