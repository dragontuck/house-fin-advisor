// src/auth/ProtectedRoute.tsx
import React from 'react';
import { useAuth } from './AuthContext';
import keycloak from './keycloakSingleton';
import { LoginPage } from '../pages/LoginPage';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { isAuthenticated, isLoading } = useAuth();

    console.log('[ProtectedRoute] Rendering with state:', { isAuthenticated, isLoading });
    // If Keycloak hasn't finished initializing yet, display a loader
    if (!keycloak) {
        console.log('[ProtectedRoute] ⚠️  Keycloak not available, showing loading...');
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <p>Loading session...</p>
            </div>
        );
    }

    // If still loading, show loading state
    if (isLoading) {
        console.log('[ProtectedRoute] ⏳ Still loading (isLoading=true), showing spinner...');
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: '50px',
                        height: '50px',
                        border: '4px solid #f3f3f3',
                        borderTop: '4px solid #667eea',
                        borderRadius: '50%',
                        margin: '0 auto 20px',
                        animation: 'spin 1s linear infinite'
                    }} />
                    <p>Loading application...</p>
                    <style>{`
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    `}</style>
                </div>
            </div>
        );
    }

    // If the user is not authenticated, show login page
    if (!isAuthenticated) {
        console.log('[ProtectedRoute] 🔐 Not authenticated, showing LoginPage...');
        return <LoginPage />;
    }

    // If authenticated, render the protected child components
    console.log('[ProtectedRoute] ✅ Authenticated, rendering children...');
    return <>{children}</>;
};