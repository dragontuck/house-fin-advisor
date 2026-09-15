/**
 * Loading spinner component for authentication initialization
 */

import './AuthUI.css';

export function AuthLoading() {
    return (
        <div className="auth-loading-container">
            <div className="auth-loading-spinner" />
            <p className="auth-loading-text">Initializing authentication...</p>
        </div>
    );
}
