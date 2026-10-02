# Quick Test Guide - Keycloak Fix

## What Was Fixed

The infinite loop bug where the app got stuck after successful Keycloak login is now fixed.

## Changes Made

1. **AuthContext.tsx**: Changed from `onLoad: 'login-required'` to `onLoad: 'check-sso'`
   - This prevents redirect loops during callback processing
   
2. **Added token refresh** after successful authentication
   
3. **Clean up URL parameters** after callback to prevent re-processing
   
4. **KeycloakCallback.tsx**: Improved with better state management and logging

## Quick Test (2 minutes)

### Step 1: Clear Browser State
1. Open DevTools: Press `F12`
2. Go to **Application** tab
3. Click **Cookies** → delete all cookies for localhost
4. Click **Local Storage** → delete all
5. Close DevTools

### Step 2: Test Login Flow
1. Open http://localhost:5173/
2. You should be redirected to Keycloak login (or see login screen immediately)
3. Log in with your test credentials
4. You should see a loading spinner on `/auth/callback`
5. After 1-2 seconds, should redirect to home page
6. App should be fully loaded and authenticated ✅

### Step 3: Verify Authentication Worked
1. Check browser DevTools **Console** for these logs (in order):
   ```
   [AuthContext] Initializing Keycloak with config...
   [AuthContext] keycloak.init() complete. Authenticated: true
   [AuthContext] Token refreshed successfully
   [AuthContext] Cleaning up callback parameters from URL
   [KeycloakCallback] State: { isLoading: false, isAuthenticated: true, error: null }
   [KeycloakCallback] Authentication successful, navigating home...
   ```

2. Check URL bar:
   - Should NOT have `?code=` or `?state=` parameters ✅
   - Should be clean: `http://localhost:5173/`

3. User should be visible in app ✅

### Step 4: Test Page Refresh
1. On authenticated page, press `F5` to refresh
2. Page should load immediately without redirects
3. Should remain authenticated ✅

### Step 5: Test Logout
1. Click logout button
2. Should redirect to login screen
3. Try Step 2 again - login should work again ✅

## If Still Getting Infinite Loop

### Check Console for Errors
1. Open DevTools → Console
2. Look for red error messages
3. Share the error details (copy and paste)

### Check Network Tab
1. Open DevTools → Network
2. Refresh the page at callback
3. Look for any failed requests (red)
4. Check if Keycloak requests are failing

### Verify Keycloak Connection
Run in browser console:
```javascript
fetch('https://keycloak.keystone.internal:7443/realms/home-fin/.well-known/openid-configuration')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

Should see Keycloak configuration without errors.

### Check Environment Variables
The web app needs these env vars (check `.env` or build config):
```
VITE_KEYCLOAK_URL=https://keycloak.keystone.internal:7443
VITE_KEYCLOAK_REALM=home-fin
VITE_KEYCLOAK_CLIENT_ID=home-fin-web
```

### Clear Docker Cache (if running in Docker)
```bash
docker compose down
docker system prune -f
docker compose up -d --build
```

## Success Criteria

✅ No infinite loop after login
✅ Console shows logs in correct order
✅ URL has no callback parameters
✅ Page redirects to home after 1-2 seconds
✅ App is fully functional and authenticated
✅ Refresh doesn't lose authentication
✅ Logout/login cycle works correctly

## Files Changed

- ✅ `apps/web/src/auth/AuthContext.tsx` - Fixed Keycloak init
- ✅ `apps/web/src/pages/keycloakCallback.tsx` - Improved callback handling
- ✅ `apps/web/src/auth/protectedRoute.tsx` - Removed unused import

All changes are backward compatible and don't affect existing functionality.

## Support

If you're still experiencing issues:

1. Check the full documentation: `docs/KEYCLOAK_INFINITE_LOOP_FIX.md`
2. Review console logs for specific error messages
3. Verify Keycloak is accessible and properly configured
4. Try clearing browser cache completely
5. Check if running latest code (rebuild containers)
