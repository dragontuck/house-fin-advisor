/**
 * Keycloak authentication context for React
 * Provides authentication state and methods throughout the app
 */

import { createContext, useState, useEffect, useCallback, ReactNode } from 'react';

/**
 * User information from Keycloak token
 */
export interface User {
    id: string;
    username: string;
    name?: string;
    email?: string;
    roles: string[];
}

/**
 * Authentication context type
 */
export interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    getAccessToken: () => string | null;
}

/**
 * Create the authentication context
 */
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Props for AuthProvider
 */
interface AuthProviderProps {
    children: ReactNode;
}

/**
 * Keycloak instance type
 */
interface KeycloakInstance {
    init: (options: any) => Promise<boolean>;
    login: (options?: any) => Promise<void>;
    logout: (options?: any) => Promise<void>;
    token: string | undefined;
    refreshToken: string | undefined;
    tokenParsed: any;
    userInfo: (success: (info: any) => void, error: (err: any) => void) => void;
    isTokenExpired: (minValidity?: number) => boolean;
    refreshTokenFn: () => Promise<boolean>;
    authenticated?: boolean;
}

// Type for the Keycloak singleton
let keycloakInstance: KeycloakInstance | null = null;

/**
 * Initialize Keycloak instance (singleton pattern)
 */
async function initializeKeycloak(): Promise<KeycloakInstance> {
    if (keycloakInstance) {
        return keycloakInstance;
    }

    // Dynamically import Keycloak library
    const { default: Keycloak } = await import('keycloak-js');

    const keycloak = new Keycloak({
        url: import.meta.env.VITE_KEYCLOAK_URL || 'https://keycloak.keystone.internal:7443/',
        realm: import.meta.env.VITE_KEYCLOAK_REALM || 'home-fin',
        clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'home-fin-web',
    });

    try {
        await keycloak.init({
            onLoad: 'login-required',
            checkLoginIframe: false, // Disable for HTTPS self-signed certificates
            flow: 'standard', // Authorization Code Flow
            redirectUri: window.location.href.split('?')[0],
        });

        keycloakInstance = keycloak as unknown as KeycloakInstance;
        return keycloak as unknown as KeycloakInstance;
    } catch (error) {
        console.error('Keycloak initialization failed:', error);
        throw new Error('Failed to initialize authentication');
    }
}

/**
 * Provider component for authentication context
 */
export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    /**
     * Initialize authentication on component mount
     */
    useEffect(() => {
        const initAuth = async () => {
            try {
                setIsLoading(true);
                const keycloak = await initializeKeycloak();

                if (keycloak.authenticated) {
                    // Extract user information from token
                    const tokenParsed = keycloak.tokenParsed;
                    if (tokenParsed) {
                        setUser({
                            id: tokenParsed.sub,
                            username: tokenParsed.preferred_username || tokenParsed.sub,
                            name: tokenParsed.name,
                            email: tokenParsed.email,
                            roles: [
                                ...(tokenParsed.realm_access?.roles || []),
                                ...(tokenParsed.resource_access?.['home-fin-web']?.roles || []),
                            ],
                        });
                        setIsAuthenticated(true);
                    }
                }
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Authentication initialization failed';
                setError(errorMessage);
                console.error('Auth initialization error:', err);
            } finally {
                setIsLoading(false);
            }
        };

        initAuth();
    }, []);

    /**
     * Login handler
     */
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

    /**
     * Logout handler
     */
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

    /**
     * Get current access token
     */
    const getAccessToken = useCallback((): string | null => {
        if (!keycloakInstance) {
            return null;
        }

        // Check if token is expired and refresh if needed
        if (keycloakInstance.isTokenExpired(5)) {
            keycloakInstance.refreshTokenFn?.();
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

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
