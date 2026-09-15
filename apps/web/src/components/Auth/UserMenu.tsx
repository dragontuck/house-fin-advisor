/**
 * User menu component showing user info and logout option
 */

import { useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import { LogoutButton } from './LogoutButton';
import './AuthUI.css';

export function UserMenu() {
    const { user, isAuthenticated } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    if (!isAuthenticated || !user) {
        return null;
    }

    return (
        <div className="user-menu-container">
            <button
                className="user-menu-button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                title={user.email || user.name || user.username}
            >
                <span className="user-avatar">
                    {(user.name || user.username)[0].toUpperCase()}
                </span>
                <span className="user-name">
                    {user.name || user.username}
                </span>
            </button>

            {isMenuOpen && (
                <div className="user-menu-dropdown">
                    <div className="user-menu-header">
                        <div className="user-menu-name">
                            {user.name || user.username}
                        </div>
                        {user.email && (
                            <div className="user-menu-email">
                                {user.email}
                            </div>
                        )}
                    </div>

                    {user.roles && user.roles.length > 0 && (
                        <div className="user-menu-roles">
                            <span className="roles-label">Roles:</span>
                            <span className="roles-list">
                                {user.roles.join(', ')}
                            </span>
                        </div>
                    )}

                    <div className="user-menu-divider" />

                    <div className="user-menu-footer">
                        <LogoutButton />
                    </div>
                </div>
            )}
        </div>
    );
}
