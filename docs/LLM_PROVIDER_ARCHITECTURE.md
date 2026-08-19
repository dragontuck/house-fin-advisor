# LLM Provider Abstraction Architecture

## Overview

The provider-neutral LLM abstraction enables the application to support multiple large language model providers (Anthropic, OpenAI, Gemini, Ollama) while maintaining:
- **Security**: No provider has unrestricted database access
- **Reliability**: Automatic retries with exponential backoff, timeout handling
- **Observability**: Complete usage metrics and cost tracking
- **Extensibility**: Add new providers without changing existing code

## Core Components

### 1. Type Definitions (`packages/ai/llm-provider.ts`)

#### LLMRequest
```typescript
interface LLMRequest {
    correlationId: EntityId;           // Trace across system
    messages: LLMMessage[];             // Conversation history
    temperature?: number;               // 0-1 (default: 0.7)
    maxOutputTokens?: number;          // Response length limit
    tools?: LLMToolDefinition[];       // Available tools
    timeoutMs?: number;                 // Request timeout
}
```

#### LLMResponse
```typescript
interface LLMResponse {
    content: string;                    // Main response text
    toolCalls?: LLMToolCall[];         // Structured tool invocations
    usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
    };
    stopReason?: string;                // Why generation stopped
    generatedAt: Date;
}
```

#### LLMToolDefinition
```typescript
interface LLMToolDefinition {
    name: string;                       // Tool identifier
    description: string;                // What it does
    inputSchema: Record<string, any>;   // JSON schema for args
}
```

### 2. Base Provider (`packages/ai/base-provider.ts`)

All provider implementations extend `BaseProvider`:

```typescript
abstract class BaseProvider implements LLMProvider {
    // Automatic retry with exponential backoff
    async generateResponse(request: LLMRequest): Promise<LLMResponse>

    // Subclasses implement this
    protected abstract generateResponseInternal(
        request: LLMRequest
    ): Promise<LLMResponse>

    // Subclasses provide metadata
    abstract getName(): string
    abstract getMaxContextTokens(): number
}
```

#### Features Provided
- **Retry Logic**: Up to 3 retries (configurable) with exponential backoff
  - Initial delay: 100ms
  - Max delay: 5000ms
  - Multiplier: 2x
- **Timeout**: Configurable per-request, default 30 seconds
- **Request Validation**: Checks tokens, message format, correlation ID
- **Telemetry**: Automatic usage recording

### 3. Anthropic Provider (`packages/ai/anthropic-provider.ts`)

```typescript
class AnthropicProvider extends BaseProvider {
    constructor(config?: LLMProviderConfig, telemetryHandler?: LLMTelemetryHandler)
}
```

#### Configuration
```typescript
// Environment variables
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-sonnet-20240229
```

#### Mapping
- LLMMessage.role: "user" | "assistant"
- LLMToolCall: Mapped from Claude's `tool_use` blocks
- Context window: 200,000 tokens

### 4. Factory (`packages/ai/llm-provider-factory.ts`)

```typescript
// Create specific provider
const provider = createLLMProvider("anthropic", config, telemetryHandler)

// Create from environment
const provider = createDefaultLLMProvider()

// Supported: "anthropic", "openai", "gemini", "ollama"
```

### 5. Telemetry (`packages/ai/telemetry-handler.ts`)

#### Recording
```typescript
interface LLMTelemetryHandler {
    recordUsage(metrics: LLMUsageMetrics): Promise<void>
    getUsageStats(
        correlationId: EntityId,
        startTime: Date,
        endTime: Date
    ): Promise<{
        totalRequests: number
        totalTokens: number
        totalCost: number
        averageLatencyMs: number
    }>
}
```

#### Built-in Handlers
- `InMemoryTelemetryHandler`: Development/testing
- `NoOpTelemetryHandler`: Disabled telemetry

#### Cost Calculation
- Anthropic: $3/1M input tokens, $15/1M output tokens
- OpenAI: $0.03/1K input tokens, $0.06/1K output tokens
- Gemini: $0.5/1M input tokens, $1.50/1M output tokens
- Ollama: Free (self-hosted)

## Usage Examples

### Basic Usage
```typescript
import { createDefaultLLMProvider } from "@house-fin/ai"

const provider = createDefaultLLMProvider()

const response = await provider.generateResponse({
    correlationId: "conv-123" as EntityId,
    messages: [
        { role: "user", content: "What's my budget status?" }
    ],
    temperature: 0.7,
    maxOutputTokens: 500,
    timeoutMs: 30000
})

console.log(response.content)
console.log(response.usage.totalTokens)
```

### With Tools
```typescript
const response = await provider.generateResponse({
    correlationId: "conv-123" as EntityId,
    messages: [
        { role: "user", content: "Analyze my spending" }
    ],
    tools: [
        {
            name: "get_budget",
            description: "Get current budget data",
            inputSchema: {
                type: "object",
                properties: {
                    month: { type: "string" }
                }
            }
        }
    ]
})

if (response.toolCalls) {
    for (const call of response.toolCalls) {
        console.log(`Call tool: ${call.name}`)
        console.log(`Args:`, call.arguments)
    }
}
```

### With Telemetry
```typescript
import { InMemoryTelemetryHandler, createLLMProvider } from "@house-fin/ai"

const telemetry = new InMemoryTelemetryHandler()
const provider = createLLMProvider("anthropic", undefined, telemetry)

// Use provider...

const stats = await telemetry.getUsageStats(
    correlationId,
    new Date(Date.now() - 3600000),  // Last hour
    new Date()
)

console.log(`Total cost: $${stats.totalCost}`)
console.log(`Total tokens: ${stats.totalTokens}`)
console.log(`Avg latency: ${stats.averageLatencyMs}ms`)
```

### Custom Configuration
```typescript
const provider = createLLMProvider("anthropic", {
    maxRetries: 5,
    initialRetryDelayMs: 200,
    maxRetryDelayMs: 10000,
    retryBackoffMultiplier: 1.5,
    timeoutMs: 60000,
    maxContextTokens: 200000,
    maxOutputTokens: 8192
})
```

## Security Model

### What LLM Providers CAN Access
✅ Sanitized financial context (percentages, amounts, budgets)
✅ Defined tool definitions
✅ Request/response messages
✅ Timestamp and correlation ID

### What LLM Providers CANNOT Access
❌ Database (PostgreSQL)
❌ File storage (MinIO)
❌ Credentials/API keys
❌ Raw bank statements
❌ Account numbers
❌ Routing numbers
❌ SSN or PII

## Error Handling

### LLMProviderError
```typescript
class LLMProviderError extends Error {
    code: string                    // "TIMEOUT", "RATE_LIMIT", etc.
    retryable: boolean             // Should this be retried?
    statusCode?: number            // HTTP status if applicable
}
```

### Example: Handling Errors
```typescript
try {
    const response = await provider.generateResponse(request)
} catch (error) {
    if (error instanceof LLMProviderError) {
        if (error.code === "AUTH_FAILED") {
            // Fix credentials
        } else if (error.code === "RATE_LIMIT") {
            // Already retried, wait longer
        } else if (error.code === "TIMEOUT") {
            // Request was too slow
        }
    }
}
```

## Configuration

### Environment Variables
```bash
# Provider selection
LLM_PROVIDER=anthropic

# API credentials
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-sonnet-20240229

# Timeout and retry
LLM_TIMEOUT_MS=30000
LLM_MAX_RETRIES=3

# Telemetry
LLM_TELEMETRY_ENABLED=true
LLM_TELEMETRY_HANDLER=memory
```

## Testing

### Mock Provider
```typescript
class TestProvider extends BaseProvider {
    protected async generateResponseInternal(
        request: LLMRequest
    ): Promise<LLMResponse> {
        return {
            content: "Test response",
            usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
            generatedAt: new Date()
        }
    }

    getName(): string { return "test" }
    getMaxContextTokens(): number { return 100000 }
}
```

### Running Tests
```bash
npm test -- tests/integration/llm-provider.test.ts
```

## Extension Points

### Adding a New Provider

1. Create file: `packages/ai/new-provider.ts`
2. Extend BaseProvider:
```typescript
export class NewProvider extends BaseProvider {
    protected async generateResponseInternal(
        request: LLMRequest
    ): Promise<LLMResponse> {
        // Call NewProvider API here
        // Map response to LLMResponse format
    }

    getName(): string { return "newprovider" }
    getMaxContextTokens(): number { return 100000 }
}
```

3. Register in factory: `packages/ai/llm-provider-factory.ts`
```typescript
case "newprovider":
    return new NewProvider(config, telemetryHandler)
```

4. Add tests in `tests/integration/llm-provider.test.ts`

## Performance Characteristics

| Operation | Latency | Behavior |
|-----------|---------|----------|
| Successful request | ~100-500ms | Direct response |
| Retry (1st) | ~200ms | Delay + retry |
| Retry (2nd) | ~400ms | Delay + retry |
| Timeout | ~30s (configurable) | Immediate error |
| Telemetry record | <1ms | Async, doesn't block |

## Integration with AdvisorService

### Next Phase (Planned)
```typescript
class AdvisorService {
    async generateResponse(
        conversationId: EntityId,
        userMessage: string,
        context: FinancialContext
    ): Promise<string> {
        const provider = createDefaultLLMProvider()

        const response = await provider.generateResponse({
            correlationId: conversationId,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            tools: availableTools,
            temperature: 0.7,
            maxOutputTokens: 1000
        })

        return response.content
    }
}
```

## Troubleshooting

### "ANTHROPIC_API_KEY not set"
- Solution: Set environment variable `ANTHROPIC_API_KEY=sk-ant-...`

### "Request timeout after 30000ms"
- Increase timeout: Pass `timeoutMs: 60000` in config
- Check network connection
- Check provider status

### High cost per request
- Reduce `maxOutputTokens`
- Use cheaper model (sonnet instead of opus)
- Batch requests

### Telemetry data missing
- Enable: `LLM_TELEMETRY_ENABLED=true`
- Check handler: `LLM_TELEMETRY_HANDLER=memory`
- Call `getUsageStats()` to retrieve

## References
- [packages/ai/llm-provider.ts](../../packages/ai/llm-provider.ts) - Core types
- [packages/ai/base-provider.ts](../../packages/ai/base-provider.ts) - Base implementation
- [packages/ai/anthropic-provider.ts](../../packages/ai/anthropic-provider.ts) - First provider
- [tests/integration/llm-provider.test.ts](../../tests/integration/llm-provider.test.ts) - Tests
