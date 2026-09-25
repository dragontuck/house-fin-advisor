# Admin Settings - Quick Start Guide

## Overview
Dynamic AI provider selection with role-based access control. Admins can choose which LLM provider and model to use per household.

## Quick Deploy (5 minutes)

### 1. Database Migration
```bash
cd packages/db
# Option A: Using npm
npm run migrate

# Option B: Direct psql
psql -h localhost -U hf_admin -d house_financial < migrations/022_add_ai_provider_settings.sql
```

### 2. Verify Migration
```bash
psql -h localhost -U hf_admin -d house_financial -c \
  "SELECT * FROM finhouse.ai_provider_settings LIMIT 1;"
```

Should show table with columns: id, household_id, provider, model, provider_config, etc.

### 3. Ensure Keycloak Admin Role

In Keycloak admin console:
1. Select realm: **home-fin**
2. Go to Roles
3. Create new role: **admin**
4. Assign to test user

Verify token contains role:
```bash
# After login, check the JWT
# Should have: "realm_access": {"roles": ["admin", ...]}
```

### 4. API Test (No UI needed)

```bash
# 1. Get your auth token
TOKEN="your_jwt_token_here"
HOUSEHOLD_ID="f47ac10b-58cc-4372-a567-0e02b2c3d479"

# 2. GET current settings
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:6723/admin/settings/ai-provider" | jq .

# Expected response:
# {
#   "settings": null,  (or current settings)
#   "availableProviders": ["anthropic", "openai", "gemini", "ollama"],
#   "availableModels": ["claude-3-5-sonnet-20241022", ...]
# }

# 3. UPDATE settings (admin only)
curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "model": "gpt-4o",
    "providerConfig": {
      "temperature": 0.7,
      "maxTokens": 2000
    }
  }' \
  "http://localhost:6723/admin/settings/ai-provider" | jq .

# Expected response:
# {
#   "success": true,
#   "settings": {
#     "id": "...",
#     "householdId": "...",
#     "provider": "openai",
#     "model": "gpt-4o",
#     ...
#   }
# }
```

### 5. Test Error Handling

```bash
# Try as non-admin (remove "admin" role from user)
curl -s -X PUT \
  -H "Authorization: Bearer $NON_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider": "openai", "model": "gpt-4o"}' \
  "http://localhost:6723/admin/settings/ai-provider" | jq .

# Expected 403 error:
# {
#   "userMessage": "User does not have admin role to manage...",
#   "errorCode": "ADMIN_ACCESS_DENIED",
#   ...
# }
```

## UI Test (With Component)

### 1. Add Route

In your React app routing (e.g., `apps/web/src/App.tsx`):

```typescript
import AdminSettingsPage from "@/components/AdminSettings";

// In your routes:
<Route path="/admin/settings" element={
  <AdminSettingsPage householdId={householdId} />
} />
```

### 2. Navigate to Page
```
http://localhost:6173/admin/settings
```

### 3. Test as Admin
- Should see settings form
- Can select provider
- Model dropdown updates based on provider
- Can adjust temperature and maxTokens
- Click Save
- Should see success message

### 4. Test as Non-Admin
- Should see "Access Denied" message
- Cannot interact with form

## Verification Checklist

- [ ] Migration table exists: `finhouse.ai_provider_settings`
- [ ] Keycloak has "admin" role in home-fin realm
- [ ] API GET endpoint returns available providers/models
- [ ] API PUT endpoint requires admin role
- [ ] Invalid provider/model rejected with 400 error
- [ ] Non-admin gets 403 error on PUT
- [ ] Settings saved to database
- [ ] Settings persist after page reload/API call
- [ ] UI shows provider info cards
- [ ] Temperature slider works (0-1)
- [ ] Max tokens input works
- [ ] Logs show: `[LLM] Database-aware LLM factory initialized`

## Troubleshooting

### Database connection error
```
Error: connect ECONNREFUSED 127.0.0.1:5434
```
✅ Check DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD env vars
✅ Verify PostgreSQL is running: `psql -h localhost -U hf_admin -l`

### Migration table not found
```
Error: relation "finhouse.ai_provider_settings" does not exist
```
✅ Run migration: `npm run migrate` (in packages/db)
✅ Verify: `psql -h localhost -U hf_admin -d house_financial -c "\dt finhouse.ai_provider_settings"`

### 403 Unauthorized
```json
{
  "errorCode": "ADMIN_ACCESS_DENIED",
  "message": "User does not have admin role..."
}
```
✅ Verify user has "admin" role in Keycloak
✅ Check JWT token claims: `realm_access.roles`
✅ Roles are case-sensitive ("admin" or "ADMIN")

### Provider not found in database
```
[LLM] Failed to load settings for household <id>, falling back...
```
✅ This is normal - using environment defaults
✅ Create settings via API: `PUT /admin/settings/ai-provider`
✅ Verify via: `GET /admin/settings/ai-provider`

### Invalid model for provider
```json
{
  "errorCode": "INVALID_MODEL",
  "message": "Model 'xyz' not supported for provider 'anthropic'"
}
```
✅ Check `LLM_MODELS_BY_PROVIDER` in contracts/admin-settings.ts
✅ Use a model from the supported list for that provider

## File Locations

| Component | Location |
|-----------|----------|
| Database Migration | `packages/db/migrations/022_add_ai_provider_settings.sql` |
| Repository | `packages/db/repositories/admin-settings-repository.ts` |
| Service | `packages/domain/services/admin-settings-service.ts` |
| API Routes | `apps/api/src/routes/admin-settings.ts` |
| React Component | `apps/web/src/components/AdminSettings/AdminSettingsPage.tsx` |
| Type Contracts | `packages/contracts/admin-settings.ts` |
| Factory | `packages/ai/database-aware-llm-factory.ts` |
| Tests | `(to be added)` |

## Environment Variables

These are already configured, but good to know:
```bash
# Database (migration target)
DB_HOST=localhost
DB_PORT=5434
DB_NAME=house_financial
DB_USER=hf_admin
DB_PASSWORD=hf_admin

# LLM (fallback if no database settings)
ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=anthropic
LLM_TIMEOUT_MS=30000
LLM_MAX_RETRIES=3

# Keycloak (for role validation)
KEYCLOAK_REALM_URL=https://keycloak.keystone.internal:7443/
KEYCLOAK_REALM=home-fin
KEYCLOAK_CLIENT_ID=home-fin-api
```

## Next Steps

1. **Test Settings Persistence**
   - Create setting, refresh page, verify it loads
   - Change provider, verify model list updates
   - Save different temperatures, verify persisted

2. **Integration Testing**
   - Update household's provider settings
   - Make AI request for that household
   - Verify it uses the selected provider

3. **Load Testing**
   - Many households with different settings
   - Many concurrent API calls
   - Monitor for performance issues

4. **Production Readiness**
   - Backup database before migration
   - Test rollback strategy
   - Monitor logs for errors
   - Train admins on how to use

## Support

- Full docs: `docs/ADMIN_SETTINGS_IMPLEMENTATION.md`
- Session notes: `/memories/repo/admin-provider-settings-complete.md`
- Code is well-commented for debugging
- All type definitions in `packages/contracts/admin-settings.ts`

## Success Criteria

✅ Migration runs without errors
✅ API endpoints respond correctly
✅ Admin role enforced on PUT endpoint
✅ Settings saved to database
✅ UI component renders and works
✅ Fallback to environment defaults works
✅ Logs show factory initialized
✅ No TypeScript errors on build
