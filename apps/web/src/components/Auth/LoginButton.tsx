/**
 * Login component for Keycloak authentication
 */

import { useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import './AuthUI.css';

export function LoginButton() {
    const { isLoading, login } = useAuth();
    const [isLoginLoading, setIsLoginLoading] = useState(false);

    const handleLogin = async () => {
        try {
            setIsLoginLoading(true);
            await login();
        } catch (error) {
            console.error('Login failed:', error);
            setIsLoginLoading(false);
        }
    };

    return (
        <button
            onClick={handleLogin}
            disabled={isLoading || isLoginLoading}
            className="auth-button login-button"
        >
            {isLoginLoading ? 'Logging in...' : 'Login'}
        </button>
    );
}
