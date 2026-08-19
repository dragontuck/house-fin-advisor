/**
 * LLM Provider Factory
 *
 * Creates and manages LLM provider instances.
 * Supports multiple providers while keeping implementation details isolated.
 *
 * Extensible architecture for:
 * - OpenAI
 * - Anthropic
 * - Gemini
 * - Ollama/local models
 */

import {
    LLMProvider,
    LLMProviderFactory,
    LLMProviderConfig,
    LLMTelemetryHandler,
} from "./llm-provider";
import { AnthropicProvider } from "./anthropic-provider";

/**
 * Standard provider factory implementation
 */
export class DefaultLLMProviderFactory implements LLMProviderFactory {
    /**
     * Create a provider instance
     *
     * Supported providers:
     * - "anthropic": Anthropic Claude models
     * - "openai": OpenAI GPT models (planned)
     * - "gemini": Google Gemini models (planned)
     * - "ollama": Local models via Ollama (planned)
     *
     * @param providerName - The provider to use
     * @param config - Provider configuration
     * @param telemetryHandler - Optional telemetry handler
     * @throws Error if provider is not supported
     */
    createProvider(
        providerName: string,
        config?: LLMProviderConfig,
        telemetryHandler?: LLMTelemetryHandler
    ): LLMProvider {
        const normalizedName = providerName.toLowerCase();

        switch (normalizedName) {
            case "anthropic":
                return new AnthropicProvider(config, telemetryHandler);

            case "openai":
                throw new Error(
                    "OpenAI provider not yet implemented. Supported: anthropic"
                );

            case "gemini":
                throw new Error(
                    "Gemini provider not yet implemented. Supported: anthropic"
                );

            case "ollama":
                throw new Error(
                    "Ollama provider not yet implemented. Supported: anthropic"
                );

            default:
                throw new Error(
                    `Unknown LLM provider: ${providerName}. Supported: anthropic`
                );
        }
    }

    /**
     * Get list of supported providers
     */
    getSupportedProviders(): string[] {
        return [
            "anthropic", // Currently supported
            "openai", // Planned
            "gemini", // Planned
            "ollama", // Planned
        ];
    }
}

/**
 * Global provider factory instance
 */
let globalFactory: LLMProviderFactory | null = null;

/**
 * Set the global provider factory
 * Useful for testing or providing custom implementations
 */
export function setGlobalProviderFactory(
    factory: LLMProviderFactory
): void {
    globalFactory = factory;
}

/**
 * Get the global provider factory
 */
export function getProviderFactory(): LLMProviderFactory {
    if (!globalFactory) {
        globalFactory = new DefaultLLMProviderFactory();
    }
    return globalFactory;
}

/**
 * Create an LLM provider with default factory
 *
 * Convenience function that uses the global factory.
 * Equivalent to: getProviderFactory().createProvider(...)
 */
export function createLLMProvider(
    providerName: string,
    config?: LLMProviderConfig,
    telemetryHandler?: LLMTelemetryHandler
): LLMProvider {
    return getProviderFactory().createProvider(
        providerName,
        config,
        telemetryHandler
    );
}

/**
 * Create default provider (from environment variable)
 *
 * Environment variables:
 * - LLM_PROVIDER: Provider name (default: "anthropic")
 * - LLM_TIMEOUT_MS: Request timeout in milliseconds (default: 30000)
 * - LLM_MAX_RETRIES: Maximum retries (default: 3)
 */
export function createDefaultLLMProvider(
    config?: LLMProviderConfig,
    telemetryHandler?: LLMTelemetryHandler
): LLMProvider {
    const providerName = process.env.LLM_PROVIDER || "anthropic";

    const finalConfig: LLMProviderConfig = {
        ...config,
        timeoutMs:
            config?.timeoutMs ||
            (process.env.LLM_TIMEOUT_MS
                ? parseInt(process.env.LLM_TIMEOUT_MS, 10)
                : 30000),
        maxRetries:
            config?.maxRetries ||
            (process.env.LLM_MAX_RETRIES
                ? parseInt(process.env.LLM_MAX_RETRIES, 10)
                : 3),
    };

    return createLLMProvider(providerName, finalConfig, telemetryHandler);
}
