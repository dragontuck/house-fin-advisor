# Keycloak Integration - Quick Start Checklist

## ✅ What Was Completed

### API Integration (Express.js)
- ✅ JWT verification middleware using `jose` library with JWKS caching
- ✅ Keycloak configuration management
- ✅ Optional authentication middleware (validates tokens if present)
- ✅ Household context extraction from token claims
- ✅ Role-based access control support
- ✅ Error handling with user-friendly messages
- ✅ Server integration with middleware chain

### Web UI Integration (React)
- ✅ Keycloak React context provider with singleton pattern
- ✅ Custom authentication hooks (`useAuth`, `useHasRole`, `useRequireAuth`)
- ✅ Authenticated API fetch wrapper with automatic token injection
- ✅ UI Components: LoginButton, LogoutButton, UserMenu, AuthLoading
- ✅ App authentication protection with login redirect
- ✅ Loading state handling during auth initialization
- ✅ User profile display in header menu
- ✅ Comprehensive styling for all auth components

### Configuration & Documentation
- ✅ Environment template files (`.env.example`)
- ✅ Package.json dependencies updated
- ✅ Comprehensive setup guide (`docs/KEYCLOAK_INTEGRATION.md`)

## 🚀 Next Steps

### 1. Install Dependencies
```bash
cd apps/api && npm install
cd ../web && npm install
```

### 2. Configure Environment Variables
```bash
# API
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your Keycloak settings

# Web
cp apps/web/.env.example apps/web/.env
# Edit apps/web/.env with your Keycloak settings
```

### 3. Run the Applications
```bash
# Terminal 1 - API Server
cd apps/api
npm run dev

# Terminal 2 - Web App
cd apps/web
npm run dev
```

## 📋 Keycloak Configuration Checklist

- [ ] Verify Keycloak server is running at `https://keycloak.keystone.internal:7443/`
- [ ] Verify `home-fin` realm exists
- [ ] Verify `home-fin-api` client is configured as Confidential
- [ ] Verify `home-fin-web` client is configured as Public
- [ ] Add redirect URIs for web client: `http://localhost:6173/*`
- [ ] Create test users in Keycloak realm
- [ ] (Optional) Configure custom `household_id` claim/mapper

## 🔐 API Usage Examples

### Require Authentication on All Endpoints
```typescript
app.use(keycloakAuthMiddleware); // Make auth required
```

### Require Specific Role
```typescript
app.delete('/admin/users/:id',
    keycloakAuthMiddleware,
    requireRole(['admin']),
    (req, res) => { /* ... */ }
);
```

### Access User Information
```typescript
const userId = req.keycloakToken?.sub;
const username = req.keycloakToken?.preferred_username;
const roles = req.keycloakToken?.realm_access?.roles || [];
```

## 🎨 Web UI Usage Examples

### Display User Info
```typescript
import { useAuth } from './auth/useAuth'

function Profile() {
    const { user, logout } = useAuth();
    
    return (
        <div>
            <h1>Welcome, {user?.name}</h1>
            <p>Email: {user?.email}</p>
            <button onClick={logout}>Logout</button>
        </div>
    );
}
```

### Check Roles
```typescript
import { useHasRole } from './auth/useAuth'

function AdminPanel() {
    const isAdmin = useHasRole('admin');
    
    if (!isAdmin) {
        return <div>Access Denied</div>;
    }
    
    return <div>Admin Controls</div>;
}
```

### Make Authenticated API Calls
```typescript
import { useAuth } from './auth/useAuth'
import { authenticatedFetch } from './auth/api-auth'

async function fetchData() {
    const { getAccessToken } = useAuth();
    const response = await authenticatedFetch(
        '/api/endpoint',
        {},
        getAccessToken
    );
    return response.json();
}
```

## 📚 Documentation

Full documentation available at: `docs/KEYCLOAK_INTEGRATION.md`

Topics covered:
- Architecture overview
- Step-by-step installation
- Keycloak client configuration
- API middleware usage
- Web context provider usage
- Token claims reference
- Troubleshooting guide
- Security considerations

## 🔗 File Structure

```
apps/api/src/
├── auth/
│   ├── keycloak-config.ts      # Configuration
│   ├── jwt-verifier.ts         # JWT validation
│   └── keycloak-middleware.ts  # Express middleware
├── middleware/
│   └── household-context.ts    # Updated for Keycloak
└── server.ts                   # Integration point

apps/web/src/
├── auth/
│   ├── AuthContext.tsx         # React context
│   ├── useAuth.ts              # Custom hooks
│   └── api-auth.ts             # Fetch wrapper
├── components/Auth/
│   ├── LoginButton.tsx
│   ├── LogoutButton.tsx
│   ├── UserMenu.tsx
│   ├── AuthLoading.tsx
│   └── AuthUI.css
├── main.tsx                    # AuthProvider wrapper
└── App.tsx                     # Auth checks & UserMenu
```

## 🐛 Troubleshooting

**Token not validating?**
- Check Keycloak URL is correct and accessible
- Verify `KEYCLOAK_CLIENT_SECRET` matches Keycloak configuration
- Check token expiration

**CORS errors?**
- Verify `CORS_ORIGIN` environment variable
- Add web app origin to Keycloak client settings

**Login redirect loop?**
- Check web client "Valid Redirect URIs" in Keycloak
- Verify redirect URI matches app URL
- Clear browser cache and cookies

**Missing household ID?**
- Add `household_id` custom claim to Keycloak token
- Or pass via `x-household-id` header for testing
- See setup guide for Keycloak mapper configuration

## ✨ Key Features

- ✅ OAuth2/OIDC authentication with Keycloak
- ✅ JWT token validation with JWKS
- ✅ Optional authentication (backward compatible)
- ✅ Role-based access control (RBAC)
- ✅ Household-scoped data access
- ✅ Automatic token refresh
- ✅ User profile display
- ✅ Logout functionality
- ✅ Loading states and error handling
- ✅ Self-signed certificate support

## 📞 Support

For detailed information, see:
- `docs/KEYCLOAK_INTEGRATION.md` - Complete setup guide
- `AGENTS.md` - Keycloak infrastructure settings
- Comments in source files for implementation details
