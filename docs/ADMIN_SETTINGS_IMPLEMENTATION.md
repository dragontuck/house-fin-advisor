# AI Provider Settings Implementation Guide

## Complete Solution for Dynamic LLM Provider & Model Selection

This document provides a complete implementation of household-level AI provider configuration with role-based access control via Keycloak.

## What Was Built

### 1. Database Layer ✅

**File:** `packages/db/migrations/022_add_ai_provider_settings.sql`

Creates `finhouse.ai_provider_settings` table:
- Stores provider/model configuration per household
- Audit trail (who configured, when last updated)
- Soft delete support
- One config per household (UNIQUE constraint on household_id)

```sql
CREATE TABLE finhouse.ai_provider_settings (
    id UUID PRIMARY KEY,
    household_id UUID UNIQUE REFERENCES households ON DELETE CASCADE,
    provider VARCHAR(64) CHECK (provider IN ('anthropic', 'openai', 'gemini', 'ollama')),
    model VARCHAR(255),
    provider_config JSONB,
    configured_by_member_id UUID NOT NULL,
    configured_at TIMESTAMP,
    updated_by_member_id UUID,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);
```

**Repository File:** `packages/db/repositories/admin-settings-repository.ts`

Implements `AIProviderSettingsRepository` interface:
```typescript
- getSettingsByHouseholdId(householdId: EntityId): Promise<AIProviderSettings | null>
- getSettingsById(id: EntityId): Promise<AIProviderSettings | null>
- upsertSettings(householdId, memberId, settings): Promise<AIProviderSettings>
- deleteSettings(id: EntityId): Promise<void>
```

### 2. Type Contracts ✅

**File:** `packages/contracts/admin-settings.ts`

Defines types and interfaces:
- `LLMProviderName` = "anthropic" | "openai" | "gemini" | "ollama"
- `LLM_MODELS_BY_PROVIDER` constant with supported models per provider
- `AIProviderSettings` interface (database representation)
- `UpdateAIProviderSettingsRequest` (HTTP request body)
- `AIProviderSettingsResponse` (HTTP response with options)
- `ProviderConfig` for temperature, maxTokens, etc.

### 3. Business Logic (Service Layer) ✅

**File:** `packages/domain/services/admin-settings-service.ts`

`AdminSettingsService` class with:
- **Role Validation**: `validateAdminAccess(token)` - Checks Keycloak JWT for "admin"/"ADMIN" roles
- **Provider Validation**: `validateProviderModel(provider, model)` - Ensures model is in supported list
- **Config Validation**: `validateProviderConfig(provider, config)` - Validates temperature (0-1), maxTokens, etc.
- **Public Methods**:
  - `getSettings(householdId)` - No role restriction (users can see their config)
  - `getSettingsWithOptions(householdId)` - Returns available providers and models
  - `updateSettings(householdId, memberId, token, settings)` - Restricted to admins

### 4. HTTP API Endpoints ✅

**File:** `apps/api/src/routes/admin-settings.ts`

Two endpoints, both require Keycloak token:

**GET /admin/settings/ai-provider**
- Returns current settings for household
- No role restriction (informational)
- Response: `{ settings, availableProviders, availableModels }`
- If no settings configured, returns defaults + available options

**PUT /admin/settings/ai-provider**
- Update provider/model settings
- **REQUIRES admin role** (enforced by service)
- Request body: `{ provider, model, providerConfig? }`
- Response: `{ success, settings }`
- Errors: 401 (not authenticated), 403 (not admin), 400 (invalid)

### 5. Dynamic Provider Loading ✅

**File:** `packages/ai/database-aware-llm-factory.ts`

Smart factory with cascading fallback:
- `initializeDatabaseAwareLLMFactory(pool)` - Call once at server startup
- `getProviderForHousehold(householdId)` - Get provider for a specific household
  1. Tries to load from database
  2. Falls back to environment defaults
  3. Logs warnings, never fails
- `isDatabaseAwareLLMInitialized()` - Check if initialized
- `getSettingsRepository()` - Access repository directly if needed

Usage in orchestrator:
```typescript
const householdSpecificProvider = await getProviderForHousehold(
    householdId,
    config,
    telemetryHandler
);
// Use this provider instead of global llmProvider
```

### 6. Server Integration ✅

**File:** `apps/api/src/server.ts`

Changes:
- Import `initializeDatabaseAwareLLMFactory` from @house-fin/ai
- Import pool from "./db/connection"
- Initialize database-aware factory after privacy gateway:
  ```typescript
  try {
      initializeDatabaseAwareLLMFactory(pool);
      console.log("[LLM] Database-aware LLM factory initialized");
  } catch (error) {
      console.warn("[LLM] Failed to initialize...", error);
  }
  ```
- Updated RouteContext to include `pool` and `middleware`
- Register admin settings routes

### 7. React UI Component ✅

**File:** `apps/web/src/components/AdminSettings/AdminSettingsPage.tsx`

Features:
- **Role Check**: Only admins (role="admin" from Keycloak) can see and modify
- **Provider Selection**: Dropdown with anthropic, openai, gemini, ollama
- **Model Selection**: Dynamically shows models for selected provider
- **Configuration**:
  - Temperature slider (0-1)
  - Max tokens input
- **Current Settings Display**: Shows current config and who changed it
- **Save Button**: Validates and persists to database
- **Error/Success Messages**: User-friendly feedback
- **Provider Info Cards**: Educational cards about each provider

**Styling**: `apps/web/src/components/AdminSettings/AdminSettings.css`
- Modern, accessible design
- Responsive (mobile, tablet, desktop)
- Proper form states and transitions
- Error and success styling

## How to Use

### Step 1: Run Database Migration

```bash
cd packages/db
npm run migrate
# Or if using migration runner:
psql -h localhost -U hf_admin -d house_financial < migrations/022_add_ai_provider_settings.sql
```

### Step 2: Ensure Keycloak Admin Role Exists

In Keycloak, add "admin" role to the home-fin realm:
1. Go to Keycloak admin console
2. Select "home-fin" realm
3. Go to Roles
4. Create new role: "admin"
5. Assign to household admin users

### Step 3: Deploy API

The API automatically initializes the database-aware factory on startup.

```bash
# Verify in logs:
# [LLM] Database-aware LLM factory initialized
```

### Step 4: Deploy Web UI

The admin settings page is automatically available at `/admin/settings` (you'll need to add routing for it).

Add to your React router:
```typescript
import AdminSettingsPage from "@/components/AdminSettings";

<Route path="/admin/settings" element={
    <AdminSettingsPage householdId={householdId} />
} />
```

### Step 5: Test

1. **As Admin User**:
   - Navigate to /admin/settings
   - Should see current provider/model
   - Can change provider and model
   - Click Save and verify changes persist
   - Check database to confirm record exists

2. **As Non-Admin User**:
   - Navigate to /admin/settings
   - Should see "Access Denied" message
   - Cannot modify any settings

3. **As Unauthenticated User**:
   - Navigate to /admin/settings
   - Should redirect to login (standard auth flow)

## Access Control

### Who Can Read Settings?
- Authenticated users within the household (via middleware)
- Information is non-sensitive (just provider name and model)

### Who Can Modify Settings?
- Users with "admin" or "ADMIN" role in Keycloak JWT
- Role checked at service layer (validated against `realm_access.roles`)
- Denying with clear error message

### Audit Trail
- `configured_by_member_id`: Who originally set this up
- `configured_at`: When originally set
- `updated_by_member_id`: Who last changed it
- `updated_at`: When last changed

## Fallback Strategy

If settings not configured or database error:
1. Falls back to `process.env.LLM_PROVIDER` (default: "anthropic")
2. Loads provider-specific API key from environment
3. Never fails - always returns a working provider
4. Logs warning message for debugging

Example fallback:
```
[LLM] Failed to load settings for household <id>, falling back to environment defaults: <error>
[LLM] Using environment default: anthropic provider
```

## Configuration Options

Per-provider configuration in `providerConfig` field:

### Common (All Providers)
- `temperature`: 0-1 (0 = deterministic, 1 = creative)
- `maxTokens`: 100-4000 (limits response length)

### Anthropic-Specific
(Currently just standard config, extensible for future)

### OpenAI-Specific
(Currently just standard config, extensible for future)

### Gemini-Specific
(Currently just standard config, extensible for future)

### Ollama-Specific
(Any model name is valid - user-defined local models)

## Supported Providers & Models

### Anthropic
- claude-3-5-sonnet-20241022
- claude-3-5-haiku-20241022
- claude-3-opus-20250219

### OpenAI
- gpt-4o
- gpt-4-turbo
- gpt-4
- gpt-3.5-turbo

### Google Gemini
- gemini-2.0-flash
- gemini-1.5-pro
- gemini-1.5-flash

### Ollama (Local)
- Any locally installed model (models must be installed separately)

## Error Codes & HTTP Status

### GET /admin/settings/ai-provider
- 200: Success, returns settings and available options
- 400: Missing household ID
- 401: Not authenticated (missing token)
- 500: Server error

### PUT /admin/settings/ai-provider
- 200: Success, settings updated
- 400: Invalid request body or invalid provider/model combination
- 401: Not authenticated (missing token)
- 403: User doesn't have admin role (error code: ADMIN_ACCESS_DENIED)
- 500: Server error

## Testing Checklist

- [ ] Migration creates table correctly
- [ ] API GET endpoint returns current settings
- [ ] API PUT endpoint rejects non-admin users (403)
- [ ] API PUT endpoint accepts admin users
- [ ] Invalid provider/model combinations rejected
- [ ] Database-aware factory loads settings for household
- [ ] Falls back to environment defaults when no settings
- [ ] UI admin role check works
- [ ] UI provider dropdown changes model options
- [ ] UI saves settings to database
- [ ] Settings persist after page reload
- [ ] Non-admin users can't access settings page

## Files Modified/Created

### Created Files
- `packages/db/migrations/022_add_ai_provider_settings.sql`
- `packages/db/repositories/admin-settings-repository.ts`
- `packages/contracts/admin-settings.ts`
- `packages/domain/services/admin-settings-service.ts`
- `packages/ai/database-aware-llm-factory.ts`
- `apps/api/src/routes/admin-settings.ts`
- `apps/web/src/components/AdminSettings/AdminSettingsPage.tsx`
- `apps/web/src/components/AdminSettings/AdminSettings.css`
- `apps/web/src/components/AdminSettings/index.ts`

### Modified Files
- `packages/contracts/index.ts` - Added export for admin-settings
- `packages/db/connection.ts` - Added `getPool()` export
- `packages/domain/index.ts` - Added export for AdminSettingsService
- `packages/ai/index.ts` - Added exports for database-aware factory
- `apps/api/src/routes/types.ts` - Added pool and middleware to RouteContext
- `apps/api/src/routes/index.ts` - Registered admin settings routes
- `apps/api/src/server.ts` - Initialized database-aware factory, updated context

## Next Steps

1. **Test in Development**:
   - Run migrations locally
   - Create admin user in Keycloak
   - Test API endpoints with curl/Postman
   - Test UI component

2. **Production Deployment**:
   - Run migrations on production database
   - Ensure Keycloak has admin role configured
   - Deploy API and web app
   - Monitor logs for initialization messages

3. **Future Enhancements**:
   - Per-household API key management
   - Cost monitoring per provider
   - Provider availability monitoring and fallback
   - A/B testing different models
   - Audit log UI for admins

## Support & Troubleshooting

### Database not initialized
```
[LLM] Failed to initialize database-aware factory...
```
- Check database connection
- Verify migration ran successfully
- Check DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD

### Admin role not working
- Verify user has "admin" role in Keycloak
- Check JWT token claims: `realm_access.roles`
- User roles are case-sensitive

### Settings not loading
- Check logs for database errors
- Verify household_id parameter is correct
- Falls back to environment defaults if error

### Model not available
- Check `LLM_MODELS_BY_PROVIDER` constant
- Verify provider name matches (case-sensitive)
- Ollama requires manual model installation
