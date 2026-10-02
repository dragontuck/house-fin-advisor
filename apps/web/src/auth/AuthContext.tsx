// src/auth/AuthContext.tsx
import { createContext, useState, useEffect, useCallback, ReactNode, useRef, useContext } from 'react';
import keycloak from './keycloakSingleton';
import { getAccessToken as getStoredAccessToken, clearTokens, decodeToken, isTokenExpired } from '../services/keycloakTokenService';
import Keycloak from 'keycloak-js';

export interface User {
    id: string;
    username: string;
    name?: string;
    email?: string;
    roles: string[];
}

export interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    getAccessToken: () => string | null;
    setAuthData: (authenticated: boolean) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
}

let keycloakInstance: Keycloak | null = null;
let initPromise: Promise<Keycloak> | null = null;

async function isKeycloakAvailable(keycloakUrl: string, realm: string): Promise<boolean> {
    const configUrl = `${keycloakUrl.replace(/\/$/, '')}/realms/${realm}/.well-known/openid-configuration`;
    console.log('[AuthContext] Pinging Keycloak at:', configUrl);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const startTime = Date.now();
        const response = await fetch(configUrl, {
            method: 'GET',
            signal: controller.signal,
        });
        const duration = Date.now() - startTime;
        clearTimeout(timeoutId);
        const available = response.ok;
        console.log('[AuthContext] Keycloak ping response:', { available, status: response.status, duration: `${duration}ms` });
        return available;
    } catch (error) {
        console.warn('[AuthContext] Keycloak ping check failed:', error);
        return false;
    }
}

async function initializeKeycloak(): Promise<Keycloak> {
    if (keycloakInstance && keycloakInstance.authenticated) {
        return keycloakInstance;
    }

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        console.log('[AuthContext] initializeKeycloak() called at:', new Date().toISOString());

        // If we're at the OAuth callback URL, skip full init - let the callback handler manage this
        if (window.location.pathname === '/auth/callback') {
            console.log('[AuthContext] ⚠️  At /auth/callback, returning unauthenticated keycloak instance');
            return keycloak;
        }
        const url = (import.meta.env.VITE_KEYCLOAK_URL || 'https://keycloak.keystone.internal:7443').replace(/\/$/, '');
        const realm = import.meta.env.VITE_KEYCLOAK_REALM || 'home-fin';
        const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'home-fin-web';
        const redirectUri = window.location.origin + '/auth/callback';

        console.log('[AuthContext] Keycloak config:', { url, realm, clientId, redirectUri });
        console.log('[AuthContext] Current URL:', {
            pathname: window.location.pathname,
            search: window.location.search,
            hash: window.location.hash
        });

        const available = await isKeycloakAvailable(url, realm);
        if (!available) {
            const errorMsg = 'Keycloak service is unreachable or CORS preflight failed.';
            console.error('[AuthContext] ❌ ' + errorMsg);
            throw new Error(errorMsg);
        }

        try {
            console.log('[AuthContext] Starting keycloak.init() with check-sso...');
            const initStartTime = Date.now();

            // Use 'check-sso' to silently check for existing session without forcing redirect loops
            // This is critical for handling the OAuth callback flow properly
            const authenticated = await keycloak.init({
                onLoad: 'check-sso',
                checkLoginIframe: false,
                pkceMethod: 'S256',
                flow: 'standard',
                redirectUri: window.location.origin + '/auth/callback',
                // Remove silentCheckSsoRedirectUri to prevent unnecessary redirects during check-sso
                // Only the main redirectUri is used for OAuth code exchange
            });

            const initDuration = Date.now() - initStartTime;
            console.log(`[AuthContext] ✅ keycloak.init() complete in ${initDuration}ms. Authenticated: ${authenticated}`);
            console.log('[AuthContext] Keycloak state:', {
                authenticated,
                token: keycloak.token ? '***present***' : 'null',
                refreshToken: keycloak.refreshToken ? '***present***' : 'null',
                tokenParsed: keycloak.tokenParsed ? {
                    sub: keycloak.tokenParsed.sub,
                    preferred_username: keycloak.tokenParsed.preferred_username
                } : 'null'
            });

            // If authenticated, ensure we refresh the token to get fresh credentials
            if (authenticated && keycloak.token) {
                console.log('[AuthContext] Token present, attempting to refresh...');
                try {
                    await keycloak.updateToken(30);
                    console.log('[AuthContext] ✅ Token refreshed successfully');
                } catch (err) {
                    console.warn('[AuthContext] Token refresh failed:', err);
                }
            } else if (!authenticated) {
                console.log('[AuthContext] Not authenticated, no token to refresh');
            }

            // Clean up callback parameters from URL after successful init
            if (window.location.search && (window.location.search.includes('code=') || window.location.search.includes('state=') || window.location.search.includes('error='))) {
                console.log('[AuthContext] Cleaning up search parameters from URL:', window.location.search);
                window.history.replaceState({}, document.title, window.location.pathname);
                console.log('[AuthContext] ✅ URL cleaned');
            }
            if (window.location.hash && window.location.hash.includes('error=')) {
                console.log('[AuthContext] Cleaning up hash error parameters from URL:', window.location.hash);
                window.history.replaceState({}, document.title, window.location.pathname);
                console.log('[AuthContext] ✅ URL cleaned');
            }

            keycloakInstance = keycloak;
            console.log('[AuthContext] ✅ Keycloak initialization successful');
            return keycloakInstance;
        } catch (error) {
            console.error('[AuthContext] ❌ Keycloak initialization FAILED:', error);
            initPromise = null;
            keycloakInstance = null;

            // Strip code/state from the browser URL to stop infinite reload loops
            if (window.location.hash || window.location.search) {
                console.log('[AuthContext] Cleaning up URL parameters after initialization error');
                console.log('[AuthContext] Before:', { search: window.location.search, hash: window.location.hash });
                window.history.replaceState({}, document.title, window.location.pathname);
                console.log('[AuthContext] After:', { search: window.location.search, hash: window.location.hash });
            }

            const readableError = error instanceof Error
                ? error
                : new Error('Keycloak initialization failed or was aborted during redirect. raw error: \n' + JSON.stringify(error));

            console.error('[AuthContext] ❌ Keycloak init error details:', {
                message: readableError.message,
                stack: readableError.stack
            });
            throw readableError;
        }
    })();

    return initPromise;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const hasAttemptedInit = useRef(false);

    useEffect(() => {
        console.log('[AuthProvider] useEffect triggered');
        if (hasAttemptedInit.current) {
            console.log('[AuthProvider] Init already attempted, skipping');
            return;
        }
        hasAttemptedInit.current = true;
        console.log('[AuthProvider] First time init, proceeding...');

        let isMounted = true;

        const initAuth = async () => {
            console.log('[AuthProvider] 🚀 initAuth() starting at:', new Date().toISOString());
            console.log('[AuthProvider] Component mounted:', isMounted);
            try {
                if (isMounted) {
                    console.log('[AuthProvider] Setting isLoading = true');
                    setIsLoading(true);
                }

                // First check for stored token (from direct grant login)
                console.log('[AuthProvider] Checking for stored access token in localStorage...');
                const storedAccessToken = getStoredAccessToken();

                if (storedAccessToken) {
                    console.log('[AuthProvider] Found stored token, checking expiration...');
                    const isExpired = isTokenExpired(storedAccessToken, 30);
                    console.log('[AuthProvider] Token expired:', isExpired);

                    if (!isExpired) {
                        console.log('[AuthProvider] ✅ Found valid stored token, using it for authentication');

                        try {
                            const decodedToken = decodeToken(storedAccessToken);

                            if (isMounted) {
                                const parsedUser: User = {
                                    id: decodedToken.sub ?? decodedToken.preferred_username,
                                    username: decodedToken.preferred_username || decodedToken.sub,
                                    name: decodedToken.name,
                                    email: decodedToken.email,
                                    roles: [
                                        ...(decodedToken.realm_access?.roles || []),
                                        ...(decodedToken.resource_access?.['home-fin-web']?.roles || []),
                                    ],
                                };

                                setUser(parsedUser);
                                setIsAuthenticated(true);
                                console.log('[AuthProvider] User authenticated via stored token:', parsedUser.username);
                            }
                        } catch (err) {
                            console.error('[AuthProvider] ❌ Failed to parse stored token:', err);
                            clearTokens();
                        }

                        if (isMounted) {
                            console.log('[AuthProvider] Setting isLoading = false (stored token path)');
                            setIsLoading(false);
                        }
                        return;
                    }
                } else {
                    console.log('[AuthProvider] No stored token found');
                }

                // No stored token - user must log in via direct grant form (LoginPage)
                // We do NOT call keycloak.init() here because it would trigger OAuth redirects
                // and create unwanted redirect loops. The LoginPage component handles auth via direct grant.
                console.log('[AuthProvider] ✅ No stored token found. User will be shown LoginPage for direct grant authentication.');
                if (isMounted) {
                    console.log('[AuthProvider] Setting isLoading = false (unauthenticated state)');
                    setIsLoading(false);
                }
            } catch (err) {
                if (isMounted) {
                    const errorMessage = err instanceof Error ? err.message : 'Authentication initialization failed';
                    console.error('[AuthProvider] ❌ Auth initialization error:', errorMessage, err);
                    setError(errorMessage);
                }
            } finally {
                if (isMounted) {
                    console.log('[AuthProvider] Setting isLoading = false (finally block)');
                    setIsLoading(false);
                } else {
                    console.log('[AuthProvider] Component unmounted, skipping state updates');
                }
            }
        };

        initAuth();

        return () => {
            isMounted = false;
        };
    }, []);

    const login = useCallback(async () => {
        try {
            setError(null);
            const keycloak = await initializeKeycloak();
            await keycloak.login();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Login failed';
            setError(errorMessage);
            throw err;
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            setError(null);
            setUser(null);
            setIsAuthenticated(false);

            // Clear stored tokens
            clearTokens();

            // Try to logout from Keycloak if it's initialized
            try {
                const keycloakInstance = await initializeKeycloak();
                await keycloakInstance.logout();
            } catch (err) {
                console.warn('[AuthProvider] Keycloak logout failed, but local tokens cleared:', err);
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Logout failed';
            setError(errorMessage);
            throw err;
        }
    }, []);

    const getAccessToken = useCallback((): string | null => {
        // First check for stored token
        const storedToken = getStoredAccessToken();
        if (storedToken && !isTokenExpired(storedToken, 5)) {
            return storedToken;
        }

        // Then check Keycloak instance
        if (!keycloakInstance) {
            return null;
        }

        if (keycloakInstance.isTokenExpired(5)) {
            keycloakInstance.updateToken(30).catch((err) => {
                console.error('[AuthProvider] Failed to refresh token:', err);
            });
        }

        return keycloakInstance.token || null;
    }, []);

    const setAuthData = (authenticated: boolean) => {
        if (!authenticated) {
            setUser(null);
            setIsAuthenticated(false);
            clearTokens();
            return;
        }

        // Try to get user info from stored token
        const storedAccessToken = getStoredAccessToken();

        if (storedAccessToken) {
            try {
                const decodedToken = decodeToken(storedAccessToken);

                const parsedUser: User = {
                    id: decodedToken.sub ?? decodedToken.preferred_username,
                    username: decodedToken.preferred_username || decodedToken.sub,
                    name: decodedToken.name,
                    email: decodedToken.email,
                    roles: [
                        ...(decodedToken.realm_access?.roles || []),
                        ...(decodedToken.resource_access?.['home-fin-web']?.roles || []),
                    ],
                };

                setUser(parsedUser);
                setIsAuthenticated(true);
                console.log('[AuthProvider] User authenticated via setAuthData:', parsedUser.username);
                return;
            } catch (err) {
                console.error('[AuthProvider] Failed to decode token in setAuthData:', err);
            }
        }

        // If no token, just set authenticated state
        setIsAuthenticated(authenticated);
    };

    const value: AuthContextType = {
        user,
        isAuthenticated,
        isLoading,
        error,
        login,
        logout,
        getAccessToken,
        setAuthData,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};