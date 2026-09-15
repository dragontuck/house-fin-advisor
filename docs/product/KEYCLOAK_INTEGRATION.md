# Keycloak Integration Setup Guide

## Overview

This document provides comprehensive instructions for setting up Keycloak authentication integration in the House Financial Advisor application. The integration secures both the API and Web UI with OAuth2/OIDC authentication using an existing Keycloak instance.

## Infrastructure Reference

All Keycloak settings are defined in `AGENTS.md`:

- **Keycloak URL:** `https://keycloak.keystone.internal:7443/`
- **Realm:** `home-fin`
- **API Client ID:** `home-fin-api`
- **API Client Secret:** `cKlVAAJK7irs6H54QFbWPXgcKN60nJbZsIiHYZr9xh3AOZ6q2VHF7oL0pyaacz9aUCDf2raKkSL8Yjqa0dynwD`
- **Web Client ID:** `home-fin-web`
- **Web Client Secret:** `rIB2c3gKmOr9bubmGE53EatZCZOfH7wjDJ81fjD2jz04pGcWJIU06s9LuOPGqxEA5ai8RKnZW14KmQr0HQdJcm`

## API Integration

### Architecture

The API authentication flow:

1. Client sends JWT token in `Authorization: Bearer <token>` header
2. `keycloakOptionalAuth` middleware validates token using Keycloak's JWKS
3. Token payload is attached to request as `req.keycloakToken`
4. `householdContextMiddleware` extracts household ID and user ID from token
5. **`keycloakSyncMiddleware` automatically syncs Keycloak user to household member** ✨ NEW
6. Routes use `verifyHouseholdContext` middleware to require authenticated context

### Implementation

#### 1. Authentication Middleware

Located in `apps/api/src/auth/`:

- **`keycloak-config.ts`** - Keycloak configuration and URLs
- **`jwt-verifier.ts`** - JWT validation utilities using `jose` library
- **`keycloak-middleware.ts`** - Express middleware for authentication

#### 2. Environment Configuration

Create `.env` file in `apps/api/`:

```bash
# Copy from .env.example
cp apps/api/.env.example apps/api/.env
```

Required variables:
- `KEYCLOAK_REALM_URL` - Keycloak server URL
- `KEYCLOAK_REALM` - Realm name
- `KEYCLOAK_CLIENT_ID` - API client ID
- `KEYCLOAK_CLIENT_SECRET` - API client secret
- `CORS_ORIGIN` - Web app URL (for CORS)

#### 3. Middleware Usage

In `apps/api/src/server.ts`:

```typescript
// Optional authentication (token is validated if present)
app.use(keycloakOptionalAuth);

// Extract household from token claims
app.use(householdContextMiddleware);

// For protected routes that require authentication:
app.get('/protected-route', keycloakAuthMiddleware, (req, res) => {
    const userId = req.keycloakToken?.sub;
    // ...
});

// For routes requiring specific roles:
app.delete('/admin-route', 
    keycloakAuthMiddleware,
    requireRole(['admin', 'advisor']),
    (req, res) => {
        // ...
    }
);
```

#### 4. Household Context

The household context is extracted from Keycloak token claims in this priority:

1. `household_id` or `householdId` custom claim in token
2. `x-household-id` header
3. Default household ID (for development)

To set household ID in Keycloak:
- Add a mapper in Keycloak client configuration
- Map a realm attribute or role to `household_id` claim

#### 5. Keycloak User Sync (Automatic Household Member Sync) ✨ NEW

The `keycloakSyncMiddleware` automatically synchronizes authenticated Keycloak users with household member records:

```typescript
// Middleware chain:
app.use(keycloakOptionalAuth);           // Validate token
app.use(householdContextMiddleware);     // Extract household ID
app.use(keycloakSyncMiddleware);         // Sync user to member ✨
```

**What happens on authentication:**

1. User token is validated
2. Household ID is extracted from token or header
3. User's Keycloak identity is synced to a household member:
   - If member doesn't exist: creates new member with Keycloak user info
   - If member exists: returns existing member
4. Sync result stored in `req.keycloakUserSync`

**Display name resolution (priority order):**
1. `token.name` - Full name
2. `token.preferred_username` - Username
3. `token.email` - Email prefix
4. `token.sub` - User ID (fallback)

**Example in route handler:**

```typescript
app.get('/profile', verifyHouseholdContext, (req: Request, res: Response) => {
    if (req.keycloakUserSync?.isNew) {
        console.log('New household member:', req.keycloakUserSync.memberId);
    }
    
    // User is automatically a member of the household
    res.json({
        keycloakUserId: req.keycloakToken?.sub,
        householdMemberId: req.keycloakUserSync?.memberId,
        displayName: req.keycloakToken?.name,
    });
});
```

**For detailed user sync documentation, see:** [KEYCLOAK_USER_SYNC.md](./KEYCLOAK_USER_SYNC.md)

### API Endpoints Security

Currently protected endpoints use `verifyHouseholdContext`:

```typescript
app.get(
    "/financial-pulse",
    verifyHouseholdContext,
    async (req: Request, res: Response) => {
        // Only accessible with valid household context
    }
);
```

To enforce Keycloak authentication on all endpoints:

```typescript
// Add after keycloakOptionalAuth
app.use(keycloakAuthMiddleware);
```

## Web UI Integration

### Architecture

The Web UI authentication flow:

1. `AuthProvider` wraps the entire app
2. On mount, initializes Keycloak with OpenID Connect
3. Redirects to Keycloak login if not authenticated
4. After successful login, stores token in browser
5. `useAuth` hook provides token and user info to components
6. `authenticatedFetch` wrapper adds token to API requests

### Implementation

#### 1. Authentication Context

Located in `apps/web/src/auth/`:

- **`AuthContext.tsx`** - React context with Keycloak integration
- **`useAuth.ts`** - Custom hooks for authentication
- **`api-auth.ts`** - Authenticated fetch wrapper

#### 2. Environment Configuration

Create `.env` file in `apps/web/`:

```bash
# Copy from .env.example
cp apps/web/.env.example apps/web/.env
```

Required variables:
- `VITE_KEYCLOAK_URL` - Keycloak server URL
- `VITE_KEYCLOAK_REALM` - Realm name
- `VITE_KEYCLOAK_CLIENT_ID` - Web client ID
- `VITE_API_URL` - API server URL

#### 3. App Setup

Update `apps/web/src/main.tsx`:

```typescript
import { AuthProvider } from './auth/AuthContext'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <AuthProvider>
            <App />
        </AuthProvider>
    </React.StrictMode>,
)
```

#### 4. Using Authentication in Components

```typescript
import { useAuth, useHasRole } from './auth/useAuth'

function MyComponent() {
    const { user, isAuthenticated, logout } = useAuth();
    const isAdmin = useHasRole('admin');

    if (!isAuthenticated) {
        return <div>Please log in</div>;
    }

    return (
        <div>
            <p>Welcome, {user?.name}</p>
            {isAdmin && <AdminPanel />}
            <button onClick={logout}>Logout</button>
        </div>
    );
}
```

#### 5. Making Authenticated API Calls

Update `apps/web/src/api.ts`:

```typescript
import { authenticatedFetch, handleApiError } from './auth/api-auth'
import { useAuth } from './auth/useAuth'

export async function fetchFinancialPulse(): Promise<FinancialPulseData> {
    const { getAccessToken } = useAuth();
    
    const response = await authenticatedFetch(
        `${import.meta.env.VITE_API_URL}/financial-pulse`,
        {},
        getAccessToken
    );

    if (!response.ok) {
        throw await handleApiError(response);
    }

    return response.json();
}
```

#### 6. UI Components

Located in `apps/web/src/components/Auth/`:

- **`LoginButton.tsx`** - Login button component
- **`LogoutButton.tsx`** - Logout button component
- **`UserMenu.tsx`** - User menu with logout option
- **`AuthLoading.tsx`** - Loading spinner during auth init
- **`AuthUI.css`** - Styling

Usage in App.tsx:

```typescript
import { UserMenu } from './components/Auth/UserMenu'
import { AuthLoading } from './components/Auth/AuthLoading'
import { useAuth } from './auth/useAuth'

function App() {
    const { isLoading, isAuthenticated } = useAuth();

    if (isLoading) {
        return <AuthLoading />;
    }

    if (!isAuthenticated) {
        return <div>Please log in</div>;
    }

    return (
        <div>
            <header>
                <UserMenu />
            </header>
            {/* App content */}
        </div>
    );
}
```

## Installation & Setup

### Prerequisites

1. Keycloak server running at `https://keycloak.keystone.internal:7443/`
2. Realm `home-fin` created with clients configured
3. Node.js 18+ installed

### Step 1: Install Dependencies

```bash
# API dependencies
cd apps/api
npm install

# Web dependencies
cd ../web
npm install
```

### Step 2: Configure Environment

**API:**
```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your values
```

**Web:**
```bash
cp apps/web/.env.example apps/web/.env
# Edit apps/web/.env with your values
```

### Step 3: Build & Run

**API:**
```bash
cd apps/api
npm run build
npm start
# or for development:
npm run dev
```

**Web:**
```bash
cd apps/web
npm run dev
# or for production build:
npm run build
npm run preview
```

## Keycloak Client Configuration

### API Client (`home-fin-api`)

**Type:** Confidential

**Configuration:**
- Access Type: Confidential
- Standard Flow: Disabled
- Implicit Flow: Disabled
- Direct Access Grants: Enabled
- Service Account Enabled: Enabled

**Scope:**
- Client Scope: home-fin-api (optional)

### Web Client (`home-fin-web`)

**Type:** Public

**Configuration:**
- Access Type: Public
- Standard Flow: Enabled
- Implicit Flow: Enabled
- Direct Access Grants: Disabled

**Root URL:**
```
http://localhost:6173
```

**Valid Redirect URIs:**
```
http://localhost:6173/*
```

**Web Origins:**
```
http://localhost:6173
```

## Token Claims

### Keycloak Token Structure

Standard claims included in all tokens:

```json
{
  "sub": "user-id",
  "preferred_username": "username",
  "name": "User Name",
  "email": "user@example.com",
  "realm_access": {
    "roles": ["user", "admin"]
  },
  "resource_access": {
    "home-fin-api": {
      "roles": ["advisor", "viewer"]
    },
    "home-fin-web": {
      "roles": ["advisor", "viewer"]
    }
  }
}
```

### Custom Claims

To add custom claims (e.g., `household_id`):

1. In Keycloak Admin Console, go to **Realm Roles**
2. Create roles like `household-{household-id}`
3. Create a mapper to add `household_id` claim
4. Assign roles to users

Or use a user attribute:

1. Go to Users > User Details > Attributes
2. Add attribute `household_id` with value
3. Create a mapper to include this in token

## Troubleshooting

### Token Not Validating

1. Check Keycloak server is accessible at configured URL
2. Verify `KEYCLOAK_CLIENT_SECRET` is correct
3. Check token expiration - tokens expire after a period
4. Verify issuer in token matches realm URL

### CORS Errors

1. Ensure `CORS_ORIGIN` matches web app URL
2. Check CORS middleware configuration in server.ts
3. Clear browser cache and cookies

### Login Redirect Loop

1. Verify web client configuration in Keycloak
2. Check `Valid Redirect URIs` includes your app URL
3. Ensure cookies are enabled in browser
4. Check browser console for CORS errors

### Missing Household ID

1. Add `household_id` claim to Keycloak token
2. Or pass via `x-household-id` header for testing
3. Verify claim is included in token using jwt.io

## Security Considerations

1. **Self-Signed Certificate:** If Keycloak uses self-signed HTTPS, add `NODE_TLS_REJECT_UNAUTHORIZED=0` in development only
2. **Token Storage:** Keycloak.js stores tokens in browser storage - use HTTPS in production
3. **CORS:** Only allow trusted origins in `CORS_ORIGIN`
4. **Rate Limiting:** Enable `express-rate-limit` on auth endpoints
5. **Token Expiration:** Configure reasonable token lifetimes in Keycloak

## Next Steps

1. Configure Keycloak client mappers for custom claims
2. Create test users in Keycloak
3. Test authentication flow end-to-end
4. Set up role-based access control (RBAC)
5. Implement household access control based on token claims
6. Add household-specific filtering to API responses
7. Set up authentication in CI/CD pipelines
8. Configure HTTPS for production deployment

## Files Modified/Created

### API (`apps/api/src/`)
- ✅ `auth/keycloak-config.ts` - Configuration
- ✅ `auth/jwt-verifier.ts` - JWT validation
- ✅ `auth/keycloak-middleware.ts` - Express middleware
- ✅ `middleware/household-context.ts` - Updated for Keycloak
- ✅ `server.ts` - Integrated auth middleware
- ✅ `package.json` - Added `jose` dependency
- ✅ `.env.example` - Environment template

### Web (`apps/web/src/`)
- ✅ `auth/AuthContext.tsx` - React context
- ✅ `auth/useAuth.ts` - Custom hooks
- ✅ `auth/api-auth.ts` - Authenticated fetch
- ✅ `components/Auth/LoginButton.tsx` - Login component
- ✅ `components/Auth/LogoutButton.tsx` - Logout component
- ✅ `components/Auth/UserMenu.tsx` - User menu component
- ✅ `components/Auth/AuthLoading.tsx` - Loading component
- ✅ `components/Auth/AuthUI.css` - Styling
- ✅ `main.tsx` - Wrapped with AuthProvider
- ✅ `App.tsx` - Added auth checks and UserMenu
- ✅ `package.json` - Added `keycloak-js` dependency
- ✅ `.env.example` - Environment template

## References

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [OIDC/OAuth2 Flow](https://www.keycloak.org/docs/latest/server_admin/#openid-connect)
- [Keycloak.js Library](https://www.keycloak.org/docs/latest/securing_apps/#_javascript_adapter)
- [jose Library](https://github.com/panva/jose) - JWT validation
