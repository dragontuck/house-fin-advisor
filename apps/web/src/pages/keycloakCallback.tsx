// src/pages/KeycloakCallback.tsx
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export const KeycloakCallback: React.FC = () => {
    const navigate = useNavigate();
    const { isAuthenticated, isLoading, error } = useAuth();
    const hasNavigated = useRef(false);

    useEffect(() => {
        const now = new Date().toISOString();
        console.log(`[KeycloakCallback] useEffect triggered at ${now}`);
        console.log('[KeycloakCallback] Current URL:', {
            pathname: window.location.pathname,
            search: window.location.search,
            hash: window.location.hash
        });
        console.log('[KeycloakCallback] Auth state:', { isLoading, isAuthenticated, error });

        // Handle error=login_required from Keycloak check-sso (in hash fragment)
        // This means there's no existing session, which is normal
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1)); // Remove # prefix

        const searchError = searchParams.get('error');
        const hashError = hashParams.get('error');
        console.log('[KeycloakCallback] URL parameters:', { searchError, hashError });

        if (searchError === 'login_required' || hashError === 'login_required') {
            console.log('[KeycloakCallback] ⚠️  Received error=login_required (no existing session), cleaning up...');
            // Clean up both search and hash parameters
            window.history.replaceState({}, document.title, window.location.pathname);
            console.log('[KeycloakCallback] ✅ URL cleaned to:', window.location.pathname);
            // Navigate to home so ProtectedRoute can show LoginPage
            if (!hasNavigated.current) {
                hasNavigated.current = true;
                console.log('[KeycloakCallback] Navigating to home...');
                const timer = setTimeout(() => {
                    navigate('/', { replace: true });
                }, 100);
                return () => clearTimeout(timer);
            }
            return;
        }

        // Wait until AuthProvider completes keycloak.init()
        if (!isLoading) {
            console.log('[KeycloakCallback] isLoading is false, checking auth state...');
            if (isAuthenticated && !hasNavigated.current) {
                console.log('[KeycloakCallback] ✅ Authentication successful, navigating home...');
                hasNavigated.current = true;
                // Use a small delay to ensure state is fully settled
                const timer = setTimeout(() => {
                    console.log('[KeycloakCallback] Executing navigation to home');
                    navigate('/', { replace: true });
                }, 100);
                return () => clearTimeout(timer);
            } else if (error && !hasNavigated.current) {
                console.log('[KeycloakCallback] ❌ Authentication error:', error);
                hasNavigated.current = true;
                // Wait a bit before redirecting so user sees the error
                const timer = setTimeout(() => {
                    navigate('/', { replace: true });
                }, 3000);
                return () => clearTimeout(timer);
            } else if (!isAuthenticated && !error && !hasNavigated.current) {
                // No error but also not authenticated - show login page
                console.log('[KeycloakCallback] Not authenticated, navigating to login via home...');
                hasNavigated.current = true;
                const timer = setTimeout(() => {
                    navigate('/', { replace: true });
                }, 100);
                return () => clearTimeout(timer);
            } else if (hasNavigated.current) {
                console.log('[KeycloakCallback] Already navigated, skipping');
            }
        } else {
            console.log('[KeycloakCallback] Still loading (isLoading=true), waiting...');
        }
    }, [isLoading, isAuthenticated, error, navigate]);

    if (error) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
                <h2>Authentication Error</h2>
                <p style={{ color: 'red' }}>Failed to authenticate: {error}</p>
                <p style={{ color: '#666', fontSize: '14px' }}>Redirecting to home page in 3 seconds...</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{
                    width: '50px',
                    height: '50px',
                    border: '4px solid #f3f3f3',
                    borderTop: '4px solid #3498db',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 20px'
                }} />
                <p>Completing login, please wait...</p>
            </div>
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};