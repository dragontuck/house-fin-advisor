/**
 * Logout component for Keycloak authentication
 */

import React, { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import './AuthUI.css';

export function LogoutButton() {
    const { isLoading, logout } = useAuth();
    const [isLogoutLoading, setIsLogoutLoading] = useState(false);

    const handleLogout = async () => {
        try {
            setIsLogoutLoading(true);
            await logout();
        } catch (error) {
            console.error('Logout failed:', error);
            setIsLogoutLoading(false);
        }
    };

    return (
        <button
            onClick={handleLogout}
            disabled={isLoading || isLogoutLoading}
            className="auth-button logout-button"
        >
            {isLogoutLoading ? 'Logging out...' : 'Logout'}
        </button>
    );
}
