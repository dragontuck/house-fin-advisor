/**
 * useAuth hook for accessing authentication context
 * Provides easy access to authentication state and methods
 */

import { useContext } from 'react';
import { AuthContext, AuthContextType } from './AuthContext';

/**
 * Custom hook to use authentication context
 * @returns Authentication context
 * @throws Error if used outside AuthProvider
 */
export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }

    return context;
}

/**
 * Hook to check if user has a specific role
 * @param role - The role to check
 * @returns True if user has the role
 */
export function useHasRole(role: string): boolean {
    const { user } = useAuth();
    if (!user) {
        return false;
    }
    return user.roles.includes(role);
}

/**
 * Hook to require authentication and redirect if not authenticated
 * @returns Authentication context
 */
export function useRequireAuth(): AuthContextType {
    const auth = useAuth();

    if (!auth.isLoading && !auth.isAuthenticated) {
        // Trigger login if not authenticated
        auth.login().catch(error => {
            console.error('Auto-login failed:', error);
        });
    }

    return auth;
}
