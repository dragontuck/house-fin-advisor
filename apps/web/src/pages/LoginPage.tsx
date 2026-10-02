// src/pages/LoginPage.tsx
import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import keycloakTokenService, { TokenResponse, storeTokens, decodeToken } from '../services/keycloakTokenService';
import './LoginPage.css';

export const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { setAuthData } = useAuth();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = useCallback(
        async (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            console.log('[LoginPage] Form submitted');
            setError(null);
            setIsLoading(true);

            try {
                console.log('[LoginPage] 🔐 Attempting direct grant authentication with Keycloak...');
                console.log('[LoginPage] Username:', username);
                console.log('[LoginPage] Keycloak URL:', import.meta.env.VITE_KEYCLOAK_URL);

                // Get tokens from Keycloak using direct grant flow
                const tokens: TokenResponse =
                    await keycloakTokenService.getTokenWithCredentials(username, password);

                console.log('[LoginPage] ✅ Successfully received tokens from Keycloak', {
                    hasAccessToken: !!tokens.access_token,
                    hasRefreshToken: !!tokens.refresh_token
                });

                // Store tokens
                console.log('[LoginPage] Storing tokens in localStorage...');
                storeTokens(tokens.access_token, tokens.refresh_token);
                console.log('[LoginPage] ✅ Tokens stored');

                // Decode and parse user info from token
                const decodedToken = decodeToken(tokens.access_token);
                console.log('[LoginPage] ✅ Token decoded, user:', {
                    username: decodedToken.preferred_username,
                    email: decodedToken.email
                });

                // Update auth context with authenticated state
                console.log('[LoginPage] Calling setAuthData(true)...');
                setAuthData(true);

                // Redirect to home page
                console.log('[LoginPage] ✅ Authentication successful, redirecting to home in 100ms...');
                setTimeout(() => {
                    console.log('[LoginPage] Navigating to home...');
                    navigate('/', { replace: true });
                }, 100);
            } catch (err) {
                const errorMessage =
                    err instanceof Error ? err.message : 'Failed to authenticate';

                console.error('[LoginPage] ❌ Authentication failed:', errorMessage, err);

                // Map common Keycloak errors to user-friendly messages
                let userMessage = errorMessage;
                if (errorMessage.includes('invalid_grant')) {
                    userMessage = 'Invalid username or password';
                    console.log('[LoginPage] Mapped error: invalid_grant');
                } else if (errorMessage.includes('unauthorized')) {
                    userMessage = 'Unauthorized';
                    console.log('[LoginPage] Mapped error: unauthorized');
                } else if (errorMessage.includes('Keycloak')) {
                    userMessage = 'Unable to connect to authentication service';
                    console.log('[LoginPage] Mapped error: Keycloak unreachable');
                }

                setError(userMessage);
                console.error('[LoginPage] Error shown to user:', userMessage);
            } finally {
                setIsLoading(false);
            }
        },
        [navigate, setAuthData, username, password]
    );

    const handleBrowserLogin = useCallback(() => {
        console.log('[LoginPage] Redirecting to Keycloak login page...');
        // This will trigger the OAuth redirect flow
        window.location.href = `${import.meta.env.VITE_KEYCLOAK_URL || 'https://keycloak.keystone.internal:7443'}/realms/${import.meta.env.VITE_KEYCLOAK_REALM || 'home-fin'}/protocol/openid-connect/auth?client_id=${import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'home-fin-web'}&response_type=code&scope=openid+profile+email&redirect_uri=${encodeURIComponent(window.location.origin + '/auth/callback')}`;
    }, []);

    return (
        <div className="login-page">
            <div className="login-container">
                <div className="login-header">
                    <h1>Financial Advisor</h1>
                    <p>Sign in to your account</p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    {error && <div className="error-message">{error}</div>}

                    <div className="form-group">
                        <label htmlFor="username">Username or Email</label>
                        <input
                            id="username"
                            type="text"
                            name="username"
                            value={username}
                            onChange={(e) => {
                                console.log('[LoginPage] Username input changed:', e.target.value);
                                setUsername(e.target.value);
                            }}
                            placeholder="Enter your username"
                            disabled={isLoading}
                            required
                            autoFocus
                            autoComplete="username"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <div className="password-input-wrapper">
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                name="password"
                                value={password}
                                onChange={(e) => {
                                    console.log('[LoginPage] Password input changed (length:', e.target.value.length, ')');
                                    setPassword(e.target.value);
                                }}
                                placeholder="Enter your password"
                                disabled={isLoading}
                                required
                                autoComplete="current-password"
                            />
                            <button
                                type="button"
                                className="toggle-password-btn"
                                onClick={() => setShowPassword(!showPassword)}
                                disabled={isLoading}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? (
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                        <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                ) : (
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || !username || !password}
                        className="login-button"
                    >
                        {isLoading ? (
                            <>
                                <span className="spinner"></span>
                                Signing in...
                            </>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>

                <div className="login-divider">
                    <span>or</span>
                </div>

                <button
                    onClick={handleBrowserLogin}
                    disabled={isLoading}
                    className="browser-login-button"
                >
                    Sign in with Keycloak
                </button>

                <div className="login-footer">
                    <p>
                        Don't have an account?{' '}
                        <a href="#" onClick={(e) => e.preventDefault()}>
                            Contact your administrator
                        </a>
                    </p>
                </div>
            </div>

            <div className="login-background">
                <div className="background-gradient"></div>
                <div className="background-pattern"></div>
            </div>
        </div>
    );
};

export default LoginPage;
