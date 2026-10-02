# Custom Keycloak Login Page

## Overview

A custom login page has been created that allows users to submit their Keycloak credentials directly within the app, rather than being redirected to the Keycloak login page.

## Features

✅ **Custom Login Form** - Username/password input with validation
✅ **Direct Grant Flow** - Submits credentials to Keycloak's token endpoint
✅ **Secure Token Storage** - Tokens stored in localStorage for persistence
✅ **Auto Token Refresh** - Automatic token refresh before expiration
✅ **Fallback Option** - "Sign in with Keycloak" button for OAuth redirect flow
✅ **Error Handling** - User-friendly error messages
✅ **Responsive Design** - Works on mobile, tablet, desktop
✅ **Dark Mode Support** - Includes dark theme styling

## How It Works

### Login Flow

```
1. User navigates to app
2. ProtectedRoute checks if authenticated
3. If not authenticated → LoginPage is shown
4. User enters username and password
5. LoginPage calls keycloakTokenService.getTokenWithCredentials()
6. Keycloak token endpoint returns access_token and refresh_token
7. Tokens are stored in localStorage
8. Auth context is updated with user info from token
9. App navigates to home page
10. User is fully authenticated
```

### Components Involved

**src/services/keycloakTokenService.ts**
- Handles token operations
- Supports direct grant (ROPC) flow
- Manages token storage in localStorage
- Provides token validation and refresh

**src/pages/LoginPage.tsx**
- React component for login form
- Submits credentials to Keycloak
- Handles errors and loading states
- Provides fallback OAuth login option

**src/auth/AuthContext.tsx** (Updated)
- Now checks for stored tokens on app load
- Supports both redirect-based and direct grant authentication
- Manages session state across app

**src/auth/protectedRoute.tsx** (Updated)
- Shows LoginPage if not authenticated
- No longer auto-redirects to Keycloak

## Keycloak Configuration

### Step 1: Enable Direct Grant Flow

For the direct grant (ROPC) flow to work, your Keycloak client must have it enabled:

1. Go to Keycloak Admin Console
2. Navigate to Realm: **home-fin** → Clients → **home-fin-web**
3. Go to **Advanced** tab
4. Find "Direct Access Grants Enabled" (or "Resource Owner Password Credentials Grant")
5. **Toggle it ON**
6. Save

### Step 2: Configure Token Endpoint

The service automatically uses the standard Keycloak token endpoint:
```
https://keycloak.keystone.internal:7443/realms/home-fin/protocol/openid-connect/token
```

No additional configuration needed if you're using standard Keycloak setup.

### Step 3: Verify OAuth Redirect URI (Optional)

If users use the "Sign in with Keycloak" fallback button:

1. Go to Keycloak Admin Console
2. Navigate to Realm: **home-fin** → Clients → **home-fin-web**
3. Add to "Valid Redirect URIs":
   ```
   http://localhost:5173/auth/callback
   http://your-domain/auth/callback
   ```
4. Save

## Testing the Login

### Test 1: Direct Login (New)

1. Navigate to http://localhost:5173/
2. Should see login form
3. Enter your Keycloak username
4. Enter your password
5. Click "Sign In"
6. If credentials are correct, you're redirected to home page ✅
7. If credentials are wrong, see "Invalid username or password" ✅

### Test 2: Keycloak Redirect (Fallback)

1. Navigate to http://localhost:5173/
2. See login form
3. Click "Sign in with Keycloak"
4. Redirected to Keycloak login page
5. Log in
6. Redirected back to /auth/callback
7. Automatically forwarded to home page ✅

### Test 3: Session Persistence

1. Log in successfully
2. Refresh the page (F5)
3. Should NOT see login page again
4. Should remain logged in ✅

### Test 4: Logout and Re-login

1. Click logout button
2. Should see login page again
3. Try logging in again
4. Should work correctly ✅

## File Structure

```
apps/web/src/
├── services/
│   └── keycloakTokenService.ts       # Token operations
├── pages/
│   ├── LoginPage.tsx                 # Login form component
│   └── LoginPage.css                 # Login page styling
├── auth/
│   ├── AuthContext.tsx               # Updated to support stored tokens
│   ├── protectedRoute.tsx            # Updated to show LoginPage
│   ├── keycloakSingleton.ts          # Keycloak instance
│   └── AuthContext.tsx               # Auth context provider
└── main.tsx
```

## API Integration

### Keycloak Token Endpoint

**Request:**
```bash
POST /realms/home-fin/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=password
client_id=home-fin-web
username=john.doe
password=secret123
scope=openid profile email
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsIn...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIsIn...",
  "expires_in": 300,
  "refresh_expires_in": 1800,
  "token_type": "Bearer",
  "scope": "openid profile email"
}
```

## Token Management

### Stored Tokens

Tokens are stored in browser localStorage:

```javascript
// Access token
localStorage.getItem('access_token')

// Refresh token  
localStorage.getItem('refresh_token')
```

### Token Expiration

- Access token: Expires after 300 seconds (5 minutes, configurable in Keycloak)
- Refresh token: Expires after 1800 seconds (30 minutes, configurable)
- App checks token validity before using it
- Automatically refreshes if needed

### Token Cleanup

When user logs out:
```javascript
localStorage.removeItem('access_token')
localStorage.removeItem('refresh_token')
```

## Error Handling

### Invalid Credentials
```
Error: invalid_grant
Display: "Invalid username or password"
```

### Keycloak Unavailable
```
Error: Failed to fetch
Display: "Unable to connect to authentication service"
```

### Token Expired
```
Automatically attempts refresh
Falls back to login page if refresh fails
```

## Security Considerations

### ✅ Secure by Default

1. **HTTPS Only** - Always use HTTPS in production
2. **Secure Tokens** - Use strong Keycloak token signing keys
3. **Token Storage** - localStorage is accessible to JavaScript (use with caution for sensitive apps)
4. **No Password Storage** - Passwords never stored locally, only tokens
5. **Token Expiration** - Short-lived access tokens (5 min)
6. **Refresh Token Rotation** - Keycloak can rotate refresh tokens

### ⚠️ Recommendations

1. **Use PKCE** - Already enabled in keycloak.init()
2. **Enforce HTTPS** - Never use HTTP in production
3. **XSS Protection** - Sanitize all user input (React does this by default)
4. **CORS Configuration** - Keycloak should have proper CORS headers
5. **Token Encryption** - Consider encrypting tokens in storage for extra security
6. **Logout on Close** - Consider clearing tokens when user closes browser tab

## Environment Variables

The login page uses these environment variables:

```bash
VITE_KEYCLOAK_URL=https://keycloak.keystone.internal:7443
VITE_KEYCLOAK_REALM=home-fin
VITE_KEYCLOAK_CLIENT_ID=home-fin-web
VITE_KEYCLOAK_CLIENT_SECRET=optional-client-secret  # Only if using confidential client
```

## Troubleshooting

### Login fails with "invalid_grant"

**Cause**: Credentials are wrong
**Solution**: Verify username/password are correct in Keycloak

### Login fails with "Keycloak unavailable"

**Cause**: Can't connect to Keycloak
**Solution**: 
- Verify Keycloak URL in env vars
- Check Keycloak is running and accessible
- Check CORS headers if external Keycloak

### Direct grant not working

**Cause**: Direct Access Grants not enabled
**Solution**:
1. Go to Keycloak Admin Console
2. Client → Advanced
3. Enable "Direct Access Grants Enabled"
4. Save and try again

### Token not being stored

**Cause**: localStorage disabled or browser in private mode
**Solution**:
- Not an issue in normal mode
- Private mode will need to handle differently (use sessionStorage)

### User stays on login page after submitting

**Cause**: Token not being decoded properly
**Solution**:
1. Check browser console for errors
2. Verify token endpoint URL
3. Check Keycloak is returning valid JWT

## Browser Compatibility

✅ Modern browsers (Chrome, Firefox, Safari, Edge)
✅ Mobile browsers
❌ IE 11 (No support for modern JavaScript features)

## Performance

- **First Load**: Checks localStorage for stored token (~1ms)
- **Token Validation**: Decodes JWT without network call (~0.5ms)
- **Token Refresh**: Network call only if needed (~50-200ms)
- **Login**: Network call to Keycloak (~200-500ms)

## Future Enhancements

1. **Face ID / Biometric Login** - Mobile browsers support
2. **Magic Links** - Email-based passwordless login
3. **MFA Support** - Multi-factor authentication
4. **Social Login** - Sign in with Google, GitHub, etc.
5. **Session Management** - Multiple device sessions
6. **Token Encryption** - Encrypt tokens in storage

## References

- [Keycloak Direct Grant Flow](https://www.keycloak.org/docs/latest/server_admin/#_resource_owner_password_credentials_flow)
- [OpenID Connect ROPC](https://tools.ietf.org/html/rfc6749#section-4.3)
- [JWT Token Spec](https://tools.ietf.org/html/rfc7519)

## Support

For issues or questions:
1. Check browser console for error messages
2. Verify Keycloak configuration
3. Enable debug logging: `localStorage.setItem('debug', 'keycloak:*')`
4. Check Keycloak logs for authentication failures
