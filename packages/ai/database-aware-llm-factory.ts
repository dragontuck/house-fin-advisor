/**
 * Database-Aware LLM Provider Factory
 * Extends the standard LLM provider factory to support loading AI provider settings from the database
 * Falls back to environment variables if no database settings are configured
 *
 * This allows each household to use a different LLM provider/model
 * while maintaining backward compatibility with environment-based configuration
 */

import { Pool } from "pg";
import {
    LLMProvider,
    LLMProviderFactory,
    LLMProviderConfig,
    LLMTelemetryHandler,
} from "./llm-provider";
import { DefaultLLMProviderFactory, createDefaultLLMProvider } from "./llm-provider-factory";
import {
    AIProviderSettings,
    EntityId,
} from "@house-fin/contracts";
import { PostgresAIProviderSettingsRepository } from "@house-fin/db";

/**
 * Holder for database pool reference
 * Set once during server initialization
 */
let databasePool: Pool | null = null;
let settingsRepository: PostgresAIProviderSettingsRepository | null = null;

/**
 * Initialize the database-aware factory with a connection pool
 * Must be called once during server startup before using getProviderForHousehold()
 */
export function initializeDatabaseAwareLLMFactory(pool: Pool): void {
    databasePool = pool;
    settingsRepository = new PostgresAIProviderSettingsRepository(pool);
}

/**
 * Get an LLM provider for a specific household
 * First checks database for household-specific settings, then falls back to environment defaults
 *
 * @param householdId - The household ID to get provider for
 * @param config - Optional provider config to merge with database settings
 * @param telemetryHandler - Optional telemetry handler
 * @returns LLM provider instance configured for the household
 * @throws Error if database is not initialized or household settings cannot be loaded
 */
export async function getProviderForHousehold(
    householdId: EntityId,
    config?: LLMProviderConfig,
    telemetryHandler?: LLMTelemetryHandler
): Promise<LLMProvider> {
    // If database is not initialized, fall back to default (environment-based)
    if (!settingsRepository) {
        console.warn(
            `[LLM] Database not initialized for household ${householdId}, using environment defaults`
        );
        return createDefaultLLMProvider(config, telemetryHandler);
    }

    try {
        // Try to load household-specific settings from database
        const settings = await settingsRepository.getSettingsByHouseholdId(householdId);

        if (settings) {
            // Create provider using database settings
            return createProviderFromDatabaseSettings(settings, config, telemetryHandler);
        } else {
            // No database settings, fall back to environment defaults
            return createDefaultLLMProvider(config, telemetryHandler);
        }
    } catch (error) {
        // Log error but don't fail - fall back to defaults
        console.warn(
            `[LLM] Failed to load settings for household ${householdId}, falling back to environment defaults:`,
            error
        );
        return createDefaultLLMProvider(config, telemetryHandler);
    }
}

/**
 * Create an LLM provider from database settings
 * Merges database settings with optional runtime config
 */
function createProviderFromDatabaseSettings(
    settings: AIProviderSettings,
    runtimeConfig?: LLMProviderConfig,
    telemetryHandler?: LLMTelemetryHandler
): LLMProvider {
    const factory = new DefaultLLMProviderFactory();

    // Merge database provider config with runtime config
    const mergedConfig: LLMProviderConfig = {
        ...settings.providerConfig,
        ...runtimeConfig,
        timeoutMs:
            runtimeConfig?.timeoutMs ||
            (process.env.LLM_TIMEOUT_MS ? parseInt(process.env.LLM_TIMEOUT_MS, 10) : 30000),
        maxRetries:
            runtimeConfig?.maxRetries ||
            (process.env.LLM_MAX_RETRIES ? parseInt(process.env.LLM_MAX_RETRIES, 10) : 3),
    };

    return factory.createProvider(settings.provider, mergedConfig, telemetryHandler);
}

/**
 * Get the settings repository (for advanced use cases)
 * Returns null if database not initialized
 */
export function getSettingsRepository(): PostgresAIProviderSettingsRepository | null {
    return settingsRepository;
}

/**
 * Check if database is initialized for AI settings
 */
export function isDatabaseAwareLLMInitialized(): boolean {
    return databasePool !== null && settingsRepository !== null;
}
