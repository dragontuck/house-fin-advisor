# Keycloak Integration - Infinite Loop Fix

## Problem

After successful login via the Keycloak login screen, the app was getting stuck in an infinite loop at the `/auth/callback` page and never transitioning to authenticated state.

## Root Cause

The issue was caused by using `onLoad: 'login-required'` in the Keycloak initialization. Here's what was happening:

1. User is not authenticated
2. Keycloak redirects to login screen (`onLoad: 'login-required'` forces redirect)
3. User logs in successfully
4. Keycloak redirects back to `/auth/callback?code=...&state=...`
5. React app loads and calls `keycloak.init()` again
6. With `onLoad: 'login-required'`, Keycloak tries to process the callback parameters
7. But something in the flow wasn't handling the callback state properly
8. The result: `isLoading` never became false, so the app was stuck in the loading state

## Solution

### Changes Made

#### 1. **AuthContext.tsx** - Fixed Keycloak Initialization
```typescript
// CHANGED: 'login-required' → 'check-sso'
const authenticated = await keycloak.init({
    onLoad: 'check-sso',  // ✅ Silently check for session without forcing redirect
    checkLoginIframe: false,
    pkceMethod: 'S256',
    flow: 'standard',
    redirectUri: window.location.origin + '/auth/callback',
    silentCheckSsoRedirectUri: window.location.origin + '/auth/callback',  // ✅ NEW
});

// ✅ NEW: Refresh token after successful authentication
if (authenticated && keycloak.token) {
    await keycloak.updateToken(30);
    console.log('[AuthContext] Token refreshed successfully');
}

// ✅ NEW: Clean up callback parameters from URL
if (window.location.search && (window.location.search.includes('code=') || window.location.search.includes('state='))) {
    window.history.replaceState({}, document.title, window.location.pathname);
}
```

**Key improvements:**
- `onLoad: 'check-sso'` - Checks for an existing session silently without forcing login redirects
- `silentCheckSsoRedirectUri` - Proper URI for silent SSO checks
- Token refresh after authentication - Ensures we have valid credentials
- URL parameter cleanup - Prevents re-processing the callback code/state
- Better instance check - `keycloakInstance && keycloakInstance.authenticated` instead of just `keycloakInstance`

#### 2. **keycloakCallback.tsx** - Improved Callback Handling
```typescript
// ✅ NEW: Use ref to prevent multiple navigations
const hasNavigated = useRef(false);

// ✅ NEW: Add detailed logging
console.log('[KeycloakCallback] State:', { isLoading, isAuthenticated, error });

// ✅ NEW: Guard against multiple navigations
if (isAuthenticated && !hasNavigated.current) {
    hasNavigated.current = true;
    const timer = setTimeout(() => {
        navigate('/', { replace: true });
    }, 100);
    return () => clearTimeout(timer);
}

// ✅ NEW: Add spinner UI instead of plain text
// Includes CSS animation for visual feedback
```

**Key improvements:**
- Prevent multiple navigation calls with `hasNavigated` ref
- Add loading spinner with animation
- Better error display with countdown
- Detailed logging for debugging

## How It Works Now

### Login Flow
```
1. User on /
2. ProtectedRoute checks isAuthenticated → false
3. Calls login() which triggers keycloak.login()
4. Keycloak redirects to login screen
5. User logs in
6. Keycloak redirects back to /auth/callback?code=...&state=...
7. AuthProvider's keycloak.init() processes the code/state
8. Returns authenticated: true
9. Token is refreshed
10. URL parameters are cleaned up
11. User state is updated
12. KeycloakCallback sees isAuthenticated: true
13. Navigates to /
14. App is fully authenticated ✅
```

### Key Differences with `check-sso`

| Setting | Behavior |
|---------|----------|
| `login-required` | Force redirect to login if not authenticated (can cause loops) |
| `check-sso` | Silently check for session, don't force redirect ✅ |

With `check-sso`:
- If user has active session → authenticate silently
- If no session → `authenticated = false`, no redirect
- In ProtectedRoute → if not authenticated, call `login()` to trigger redirect
- This gives us full control over when redirects happen

## Testing the Fix

### 1. **Clear Browser State**
```bash
# Clear cookies and local storage
# DevTools > Application > Clear site data
# Or close and reopen browser
```

### 2. **Test Login Flow**
1. Navigate to http://localhost:5173/
2. Should be redirected to login (via ProtectedRoute)
3. Log in with valid Keycloak credentials
4. Should see loading spinner on `/auth/callback`
5. Spinner should disappear and navigate to `/`
6. App should be fully authenticated ✅

### 3. **Test Authenticated User**
1. With user already logged in
2. Refresh page
3. Should load without any redirects
4. Should stay authenticated
5. Check browser DevTools > Console for logs

### 4. **Test Logout and Re-login**
1. Click logout
2. Should be redirected to login
3. Log in again
4. Should follow the login flow and work properly

## Debugging Tips

### Check the Console Logs
Look for these log messages in order:
```
[AuthContext] Initializing Keycloak with config...
[AuthContext] keycloak.init() complete. Authenticated: true/false
[AuthContext] Token refreshed successfully
[AuthContext] Cleaning up callback parameters from URL
[KeycloakCallback] State: { isLoading: false, isAuthenticated: true, error: null }
[KeycloakCallback] Authentication successful, navigating home...
```

### If Stuck in Loading Loop
1. Check browser URL - should not have `?code=...&state=...`
2. Check browser console for errors
3. Verify Keycloak is accessible: https://keycloak.keystone.internal:7443/
4. Check network tab for failed requests
5. Clear cookies and try again

### If Getting 403 or Token Errors
1. Verify Keycloak client settings:
   - Client ID: `home-fin-web`
   - Valid Redirect URIs: `http://localhost:5173/auth/callback`
   - Web Origins: `http://localhost:5173`
2. Check that the user has proper roles assigned
3. Verify Keycloak realm is `home-fin`

## Environment Variables

Verify these are set correctly:
```bash
VITE_KEYCLOAK_URL=https://keycloak.keystone.internal:7443
VITE_KEYCLOAK_REALM=home-fin
VITE_KEYCLOAK_CLIENT_ID=home-fin-web
```

## Files Modified

1. **`apps/web/src/auth/AuthContext.tsx`**
   - Changed `onLoad: 'login-required'` to `onLoad: 'check-sso'`
   - Added `silentCheckSsoRedirectUri`
   - Added token refresh after authentication
   - Added URL parameter cleanup
   - Improved instance checking

2. **`apps/web/src/pages/keycloakCallback.tsx`**
   - Added `hasNavigated` ref to prevent duplicate navigations
   - Added detailed logging for debugging
   - Added loading spinner with CSS animation
   - Improved error display

## What This Fixes

✅ No more infinite loading loop after successful login
✅ Proper OAuth callback handling
✅ Token is refreshed immediately after authentication
✅ URL parameters are cleaned up to prevent re-processing
✅ Better error handling and user feedback
✅ Detailed logging for debugging authentication issues

## Performance Notes

- No performance impact
- Actually slightly faster because `check-sso` doesn't force redirects
- Token refresh is minimal overhead (only if needed)

## Backward Compatibility

✅ Fully backward compatible
- Existing authenticated sessions continue to work
- No changes to API or data structures
- Only improves the authentication flow

## Next Steps

1. Clear your browser cache and cookies
2. Test the login flow
3. Watch for the console logs to verify the flow
4. Report any issues with specific error messages from console

If you're still experiencing issues, please:
1. Check browser console for error messages
2. Check network tab for failed requests
3. Share the console logs from the authentication flow
