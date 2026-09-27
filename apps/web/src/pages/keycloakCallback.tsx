// src/pages/KeycloakCallback.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import keycloak from '../auth/keycloakSingleton';
import { useAuth } from '../auth/AuthContext';

export const KeycloakCallback: React.FC = () => {
    const navigate = useNavigate();
    const { setAuthData } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const initialized = useRef(false);

    useEffect(() => {
        // Guard against React Strict Mode running useEffect twice in dev mode
        if (initialized.current) return;
        initialized.current = true;

        const handleCallback = async () => {
            try {
                const authenticated = await keycloak.init({
                    onLoad: 'check-sso',
                    pkceMethod: 'S256',
                    responseMode: 'fragment',
                });

                // Set state in AuthContext
                setAuthData(authenticated);

                // Redirect back to home page after setting context
                navigate('/', { replace: true });
            } catch (err) {
                console.error('Failed to handle Keycloak redirect:', err);
                setError('Authentication failed. Returning to login...');

                // Clean up hash fragments on error to prevent redirect loops
                window.history.replaceState({}, document.title, window.location.pathname);

                setTimeout(() => {
                    navigate('/', { replace: true });
                }, 3000);
            }
        };

        handleCallback();
    }, [navigate, setAuthData]);

    if (error) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <p style={{ color: 'red' }}>{error}</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <p>Completing login, please wait...</p>
        </div>
    );
};