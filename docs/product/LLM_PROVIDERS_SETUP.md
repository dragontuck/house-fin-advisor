# LLM Provider Configuration Guide

This document describes how to configure and use different LLM providers (Anthropic, OpenAI, Google Gemini) with the AI Financial Advisor.

---

## Overview

The system supports multiple LLM providers through a factory pattern. Providers are instantiated based on environment configuration, allowing easy switching between services.

### Supported Providers

| Provider | Model | Context Window | Default | Status |
|----------|-------|-----------------|---------|--------|
| **Anthropic** | claude-3-sonnet-20240229 | 200K tokens | Yes | ✅ Implemented |
| **OpenAI** | gpt-4-turbo | 128K tokens | No | ✅ Implemented |
| **Google Gemini** | gemini-1.5-pro | 1M tokens | No | ✅ Implemented |
| Ollama | local/custom | Varies | No | 🔄 Planned |

---

## Configuration by Provider

### 1. Anthropic (Claude)

**Environment Variables:**
```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Optional (defaults to claude-3-sonnet-20240229)
ANTHROPIC_MODEL=claude-3-opus-20240229
```

**Setup:**
1. Create account at https://console.anthropic.com
2. Generate API key in account settings
3. Set `ANTHROPIC_API_KEY` environment variable
4. (Optional) Specify model via `ANTHROPIC_MODEL`

**Available Models:**
- `claude-3-opus-20240229` (most capable, slower)
- `claude-3-sonnet-20240229` (balanced, recommended)
- `claude-3-haiku-20240307` (fastest, less capable)

**Best For:**
- Highest quality reasoning
- Complex financial planning scenarios
- Long context handling

---

### 2. OpenAI (GPT-4)

**Environment Variables:**
```bash
# Required
OPENAI_API_KEY=sk-...

# Optional (defaults to gpt-4-turbo)
OPENAI_MODEL=gpt-4-turbo
OPENAI_ORG_ID=org-...  # Optional: if using org API key
```

**Setup:**
1. Create account at https://platform.openai.com
2. Generate API key in account settings
3. Set `OPENAI_API_KEY` environment variable
4. (Optional) Add organization ID if using org account
5. (Optional) Specify model via `OPENAI_MODEL`

**Available Models:**
- `gpt-4-turbo` (most capable, higher cost)
- `gpt-4` (stable, lower cost than turbo)
- `gpt-3.5-turbo` (fast, lowest cost)

**Best For:**
- Production deployments with established pricing
- Integration with existing OpenAI infrastructure
- Flexible model selection

**Cost Considerations:**
- GPT-4 Turbo: ~$0.03/$0.06 per 1K tokens (input/output)
- GPT-4: ~$0.03/$0.06 per 1K tokens
- GPT-3.5-turbo: ~$0.0015/$0.002 per 1K tokens

---

### 3. Google Gemini

**Environment Variables:**
```bash
# Required
GEMINI_API_KEY=AIza...

# Optional (defaults to gemini-1.5-pro)
GEMINI_MODEL=gemini-1.5-pro
```

**Setup:**
1. Create account at https://makersuite.google.com
2. Generate API key in API keys section
3. Set `GEMINI_API_KEY` environment variable
4. (Optional) Specify model via `GEMINI_MODEL`
5. Enable Gemini API in Google Cloud Console

**Available Models:**
- `gemini-1.5-pro` (latest, 1M context window)
- `gemini-1.5-flash` (faster, lower cost)
- `gemini-pro` (previous version)

**Best For:**
- Very large contexts (1M tokens)
- Real-time information access
- Flexible pricing models

**Cost Considerations:**
- Gemini 1.5 Pro: ~$0.0075/$0.03 per 1K tokens
- Gemini 1.5 Flash: ~$0.00075/$0.003 per 1K tokens

---

## Using Multiple Providers

### Automatic Provider Selection

The system can automatically select an available provider based on configured API keys:

```typescript
import { LLMProviderFactory } from "@house-fin/ai";

// Creates provider from environment (checks in priority order):
// 1. OPENAI_API_KEY → OpenAI
// 2. GEMINI_API_KEY → Gemini
// 3. ANTHROPIC_API_KEY → Anthropic
const provider = LLMProviderFactory.createFromEnvironment();
```

**Priority Order:**
1. OpenAI (if `OPENAI_API_KEY` is set)
2. Gemini (if `GEMINI_API_KEY` is set)
3. Anthropic (if `ANTHROPIC_API_KEY` is set, default)

### Explicit Provider Selection

```typescript
import { LLMProviderFactory } from "@house-fin/ai";

// Create specific provider
const anthropic = LLMProviderFactory.createProvider("anthropic");
const openai = LLMProviderFactory.createProvider("openai");
const gemini = LLMProviderFactory.createProvider("gemini");

// Get list of available providers
const available = LLMProviderFactory.getAvailableProviders();
// Returns: ["openai", "gemini", "anthropic"]
```

### Environment Variable Control

Set `LLM_PROVIDER` to force a specific provider (overrides priority detection):

```bash
# Force OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Force Gemini
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIza...

# Force Anthropic
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Development Configuration

### Local Development (.env)

```bash
# Choose one provider (or configure all and let system select)

# Option 1: Anthropic
ANTHROPIC_API_KEY=your_key_here

# Option 2: OpenAI
# OPENAI_API_KEY=your_key_here
# OPENAI_MODEL=gpt-4-turbo

# Option 3: Gemini
# GEMINI_API_KEY=your_key_here
# GEMINI_MODEL=gemini-1.5-pro

# Optional: Force specific provider
# LLM_PROVIDER=anthropic
```

### Docker Compose

```yaml
services:
  api:
    environment:
      # Anthropic
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      
      # OpenAI
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      OPENAI_ORG_ID: ${OPENAI_ORG_ID:-}
      
      # Gemini
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      
      # Provider selection
      LLM_PROVIDER: ${LLM_PROVIDER:-anthropic}
```

### GitHub Actions / CI/CD

```yaml
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
  LLM_PROVIDER: ${{ secrets.LLM_PROVIDER || 'anthropic' }}
```

---

## Error Handling and Retries

All providers implement standardized error handling:

```typescript
interface LLMProviderError {
  message: string;
  code: "AUTH_FAILED" | "RATE_LIMIT" | "TIMEOUT" | "SERVER_ERROR" | "INVALID_REQUEST" | "API_ERROR";
  retryable: boolean;
  statusCode?: number;
}
```

**Retryable Errors:**
- `RATE_LIMIT` (429) — Wait and retry
- `TIMEOUT` (408) — Retry after backoff
- `SERVER_ERROR` (5xx) — Retry with exponential backoff

**Non-Retryable Errors:**
- `AUTH_FAILED` (401) — Fix credentials and restart
- `INVALID_REQUEST` (400) — Fix request format

---

## Performance Comparison

### Latency
| Provider | P50 | P95 | P99 |
|----------|-----|-----|-----|
| OpenAI (GPT-4) | ~1.5s | ~3s | ~5s |
| Anthropic (Claude 3) | ~1.2s | ~2.5s | ~4s |
| Gemini (1.5 Pro) | ~1.8s | ~3.5s | ~6s |

### Cost per 1K Tokens
| Provider | Input | Output |
|----------|-------|--------|
| Gemini Flash | $0.00075 | $0.003 |
| OpenAI GPT-3.5 | $0.0015 | $0.002 |
| OpenAI GPT-4 | $0.03 | $0.06 |
| Gemini 1.5 Pro | $0.0075 | $0.03 |
| Anthropic Claude 3 Sonnet | $0.003 | $0.015 |

---

## Migration Between Providers

To switch providers without code changes:

1. **Set new provider's API key:**
   ```bash
   export OPENAI_API_KEY=sk-...
   ```

2. **Optionally force provider:**
   ```bash
   export LLM_PROVIDER=openai
   ```

3. **Restart application:**
   ```bash
   npm run dev
   ```

System will automatically use the new provider on next request.

---

## Testing with Different Providers

```typescript
import { LLMProviderFactory } from "@house-fin/ai";

describe("Financial Advisor with Different LLM Providers", () => {
  const providers = LLMProviderFactory.getAvailableProviders();
  
  for (const providerType of providers) {
    describe(`${providerType} Provider`, () => {
      let provider;
      
      beforeAll(() => {
        provider = LLMProviderFactory.createProvider(providerType as any);
      });
      
      test("should generate recommendation", async () => {
        const response = await provider.generateResponse({
          messages: [{ role: "user", content: "Help me budget" }],
        });
        expect(response.content).toBeTruthy();
      });
    });
  }
});
```

---

## Troubleshooting

### "ANTHROPIC_API_KEY environment variable not set"
- Ensure environment variable is set before starting application
- Check: `echo $ANTHROPIC_API_KEY`
- Set in `.env` file or export in shell

### "OpenAI API authentication failed"
- Verify API key is correct (starts with `sk-`)
- Check API key hasn't been revoked in console
- Ensure organization ID is correct if using org API

### "Gemini rate limit exceeded"
- Implement exponential backoff retry
- Contact Google Cloud for higher rate limit quota
- Distribute requests across time window

### "Request timeout after 30000ms"
- Increase timeout in provider config
- Check network connectivity
- Consider using faster provider
- Break large requests into smaller pieces

### "Message exceeds context window"
- Use smaller context window or summarize input
- Switch to provider with larger context (e.g., Gemini 1.5)
- Implement context compression

---

## Production Deployment

### Recommended Setup
- **Primary:** OpenAI GPT-4 Turbo (stable, predictable)
- **Fallback 1:** Anthropic Claude 3 Sonnet (high quality)
- **Fallback 2:** Gemini 1.5 Pro (largest context)

### Monitoring
Track per-provider:
- Request latency (p50, p95, p99)
- Error rates by error type
- Cost per recommendation
- Token usage trends

### Cost Optimization
1. Use GPT-3.5-turbo for simple queries
2. Route complex financial planning to GPT-4 or Claude 3
3. Batch similar requests to Gemini for efficiency
4. Implement caching for common questions

---

## References

- [Anthropic API Docs](https://docs.anthropic.com)
- [OpenAI API Docs](https://platform.openai.com/docs)
- [Google Gemini API Docs](https://ai.google.dev)
- [LLM Provider Architecture](./LLM_PROVIDER_ARCHITECTURE.md)
