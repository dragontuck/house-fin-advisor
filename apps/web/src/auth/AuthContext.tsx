import { createContext, useState, useEffect, useCallback, ReactNode, useRef, useContext } from 'react';
import keycloak from './keycloakSingleton';

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

// Global Singleton State across re-renders
let keycloakInstance: Keycloak | null = null;
let initPromise: Promise<Keycloak> | null = null;

async function isKeycloakAvailable(keycloakUrl: string, realm: string): Promise<boolean> {
    const configUrl = `${keycloakUrl.replace(/\/$/, '')}/realms/${realm}/.well-known/openid-configuration`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(configUrl, {
            method: 'GET',
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response.ok;
    } catch (error) {
        console.warn('[AuthContext] Keycloak ping check failed:', error);
        return false;
    }
}

async function initializeKeycloak(): Promise<Keycloak> {
    if (keycloakInstance) {
        return keycloakInstance;
    }

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        const url = (import.meta.env.VITE_KEYCLOAK_URL || 'https://keycloak.keystone.internal:7443').replace(/\/$/, '');
        const realm = import.meta.env.VITE_KEYCLOAK_REALM || 'home-fin';
        const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'home-fin-web';

        console.log('[AuthContext] Initializing Keycloak with config:', { url, realm, clientId });

        const available = await isKeycloakAvailable(url, realm);
        if (!available) {
            throw new Error('Keycloak service is unreachable or CORS preflight failed.');
        }

        try {
            const authenticated = await keycloak.init({
                onLoad: 'login-required',
                checkLoginIframe: false,
                pkceMethod: 'S256',
                flow: 'standard',
                redirectUri: window.location.origin + '/',
            });

            console.log(`[AuthContext] keycloak.init() complete. Authenticated: ${authenticated}`);

            if (authenticated && (!keycloak.token || !keycloak.tokenParsed)) {
                throw new Error('Keycloak claims authenticated=true but missing token payload.');
            }

            keycloakInstance = keycloak;
            return keycloakInstance;
        } catch (error) {
            // Clean up singletons on failure so subsequent attempts can retry
            initPromise = null;
            keycloakInstance = null;

            const readableError = error instanceof Error
                ? error
                : new Error('Keycloak initialization failed or was aborted during redirect.');

            console.error('[AuthContext] Keycloak initialization error:', readableError);
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

    // Guard against React 18 StrictMode double mounting
    const hasAttemptedInit = useRef(false);

    useEffect(() => {
        if (hasAttemptedInit.current) return;
        hasAttemptedInit.current = true;

        let isMounted = true;

        const initAuth = async () => {
            console.log('[AuthProvider] Triggering initAuth...');
            try {
                if (isMounted) setIsLoading(true);

                const keycloak = await initializeKeycloak();

                if (keycloak.authenticated && isMounted) {
                    const tokenParsed = keycloak.tokenParsed;

                    if (tokenParsed) {
                        const parsedUser: User = {
                            id: tokenParsed.sub,
                            username: tokenParsed.preferred_username || tokenParsed.sub,
                            name: tokenParsed.name,
                            email: tokenParsed.email,
                            roles: [
                                ...(tokenParsed.realm_access?.roles || []),
                                ...(tokenParsed.resource_access?.['home-fin-web']?.roles || []),
                            ],
                        };

                        setUser(parsedUser);
                        setIsAuthenticated(true);
                    }
                }
            } catch (err) {
                if (isMounted) {
                    const errorMessage = err instanceof Error ? err.message : 'Authentication initialization failed';
                    setError(errorMessage);
                    console.error('[AuthProvider] Auth initialization caught error:', err);
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
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
            const keycloak = await initializeKeycloak();
            setUser(null);
            setIsAuthenticated(false);
            await keycloak.logout();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Logout failed';
            setError(errorMessage);
            throw err;
        }
    }, []);

    const getAccessToken = useCallback((): string | null => {
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

    const value: AuthContextType = {
        user,
        isAuthenticated,
        isLoading,
        error,
        login,
        logout,
        getAccessToken,
    };

    const setAuthData = (authenticated: boolean) => {
        setIsAuthenticated(authenticated);
        if (authenticated) {
            const tokenParsed = keycloak.tokenParsed;

            if (tokenParsed) {
                const parsedUser: User = {
                    id: tokenParsed.sub,
                    username: tokenParsed.preferred_username || tokenParsed.sub,
                    name: tokenParsed.name,
                    email: tokenParsed.email,
                    roles: [
                        ...(tokenParsed.realm_access?.roles || []),
                        ...(tokenParsed.resource_access?.['home-fin-web']?.roles || []),
                    ],
                };

                setUser(parsedUser);
                setIsAuthenticated(true);
            } else {
                setUser(null);
            }
        }
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