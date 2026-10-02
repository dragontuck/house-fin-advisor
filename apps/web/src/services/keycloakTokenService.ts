// src/services/keycloakTokenService.ts
/**
 * Service for handling Keycloak token operations
 * Supports direct grant flow (Resource Owner Password Credentials)
 */

export interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
}

export interface KeycloakError {
    error: string;
    error_description?: string;
}

class KeycloakTokenService {
    private keycloakUrl: string;
    private realm: string;
    private clientId: string;
    private clientSecret?: string;

    constructor() {
        this.keycloakUrl = (
            import.meta.env.VITE_KEYCLOAK_URL || 'https://keycloak.keystone.internal:7443'
        ).replace(/\/$/, '');
        this.realm = import.meta.env.VITE_KEYCLOAK_REALM || 'home-fin';
        this.clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'home-fin-web';
        this.clientSecret = import.meta.env.VITE_KEYCLOAK_CLIENT_SECRET;
    }

    /**
     * Get the token endpoint URL
     */
    private getTokenEndpoint(): string {
        return `${this.keycloakUrl}/realms/${this.realm}/protocol/openid-connect/token`;
    }

    /**
     * Exchange username and password for tokens using Direct Grant (ROPC) flow
     * This requires the client to have "Direct Access Grants Enabled" in Keycloak
     */
    async getTokenWithCredentials(
        username: string,
        password: string
    ): Promise<TokenResponse> {
        const tokenEndpoint = this.getTokenEndpoint();
        console.log('[KeycloakTokenService] 🔐 Starting direct grant flow...');
        console.log('[KeycloakTokenService] Token endpoint:', tokenEndpoint);
        console.log('[KeycloakTokenService] Client ID:', this.clientId);
        console.log('[KeycloakTokenService] Username:', username);

        const params = new URLSearchParams();
        params.append('grant_type', 'password');
        params.append('client_id', this.clientId);
        params.append('username', username);
        params.append('password', password);
        params.append('scope', 'openid profile email');

        // If client secret is available, add it (for confidential clients)
        if (this.clientSecret) {
            params.append('client_secret', this.clientSecret);
            console.log('[KeycloakTokenService] Using client secret for authentication');
        }

        console.log('[KeycloakTokenService] Request parameters:', {
            grant_type: 'password',
            client_id: this.clientId,
            username: username,
            password: '***masked***',
            scope: 'openid profile email',
            has_client_secret: !!this.clientSecret
        });

        try {
            console.log('[KeycloakTokenService] Sending POST request to token endpoint...');
            const startTime = Date.now();
            const response = await fetch(tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            });
            const duration = Date.now() - startTime;
            console.log('[KeycloakTokenService] Token request completed:', {
                status: response.status,
                duration: `${duration}ms`,
                contentType: response.headers.get('content-type')
            });

            const data = await response.json();
            console.log('[KeycloakTokenService] Response data parsed');

            if (!response.ok) {
                // Handle Keycloak error response
                const error = data as KeycloakError;
                console.error('[KeycloakTokenService] ❌ Token request failed:', {
                    error: error.error,
                    description: error.error_description
                });
                throw new Error(
                    error.error_description || error.error || 'Authentication failed'
                );
            }

            console.log('[KeycloakTokenService] ✅ Successfully received tokens');
            return data as TokenResponse;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Failed to authenticate with Keycloak';
            console.error('[KeycloakTokenService] ❌ Token exchange error:', message, error);
            throw error;
        }
    }

    /**
     * Refresh an access token using a refresh token
     */
    async refreshToken(refreshToken: string): Promise<TokenResponse> {
        const tokenEndpoint = this.getTokenEndpoint();

        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('client_id', this.clientId);
        params.append('refresh_token', refreshToken);

        if (this.clientSecret) {
            params.append('client_secret', this.clientSecret);
        }

        try {
            const response = await fetch(tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            });

            if (!response.ok) {
                throw new Error('Failed to refresh token');
            }

            return await response.json();
        } catch (error) {
            console.error('[KeycloakTokenService] Token refresh failed:', error);
            throw error;
        }
    }

    /**
     * Decode JWT token (base64 decode without verification)
     * NOTE: This is for reading claims only, not for security verification
     */
    static decodeToken(token: string): Record<string, any> {
        try {
            console.log('[KeycloakTokenService] Decoding JWT token...');
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid token format');
            }

            const decoded = atob(parts[1]);
            const parsed = JSON.parse(decoded);
            console.log('[KeycloakTokenService] ✅ Token decoded successfully');
            return parsed;
        } catch (error) {
            console.error('[KeycloakTokenService] ❌ Failed to decode token:', error);
            throw error;
        }
    }

    /**
     * Check if token is expired
     */
    static isTokenExpired(token: string, bufferSeconds: number = 30): boolean {
        try {
            const decoded = KeycloakTokenService.decodeToken(token);
            const expirationTime = (decoded.exp || 0) * 1000; // Convert to milliseconds
            const bufferMs = bufferSeconds * 1000;
            const isExpired = Date.now() > expirationTime - bufferMs;
            const expiresIn = Math.round((expirationTime - Date.now()) / 1000);
            console.log('[KeycloakTokenService] Token expiration check:', {
                isExpired,
                expiresInSeconds: expiresIn,
                bufferSeconds
            });
            return isExpired;
        } catch (error) {
            console.error('[KeycloakTokenService] ❌ Failed to check token expiration:', error);
            return true; // Assume expired if we can't decode
        }
    }

    /**
     * Store tokens in localStorage
     */
    static storeTokens(accessToken: string, refreshToken?: string): void {
        console.log('[KeycloakTokenService] 💾 Storing tokens in localStorage...');
        localStorage.setItem('access_token', accessToken);
        if (refreshToken) {
            localStorage.setItem('refresh_token', refreshToken);
            console.log('[KeycloakTokenService] ✅ Stored: access_token, refresh_token');
        } else {
            console.log('[KeycloakTokenService] ✅ Stored: access_token only');
        }
    }

    /**
     * Get access token from localStorage
     */
    static getAccessToken(): string | null {
        const token = localStorage.getItem('access_token');
        if (token) {
            console.log('[KeycloakTokenService] Retrieved access_token from localStorage');
        } else {
            console.log('[KeycloakTokenService] No access_token found in localStorage');
        }
        return token;
    }

    /**
     * Get refresh token from localStorage
     */
    static getRefreshToken(): string | null {
        const token = localStorage.getItem('refresh_token');
        if (token) {
            console.log('[KeycloakTokenService] Retrieved refresh_token from localStorage');
        } else {
            console.log('[KeycloakTokenService] No refresh_token found in localStorage');
        }
        return token;
    }

    /**
     * Clear tokens from localStorage
     */
    static clearTokens(): void {
        console.log('[KeycloakTokenService] 🗑️  Clearing tokens from localStorage...');
        const hadAccessToken = !!localStorage.getItem('access_token');
        const hadRefreshToken = !!localStorage.getItem('refresh_token');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        console.log('[KeycloakTokenService] ✅ Tokens cleared:', {
            hadAccessToken,
            hadRefreshToken
        });
    }
}

export default new KeycloakTokenService();

// Export static methods as named exports for easier use
export const storeTokens = KeycloakTokenService.storeTokens;
export const getAccessToken = KeycloakTokenService.getAccessToken;
export const getRefreshToken = KeycloakTokenService.getRefreshToken;
export const clearTokens = KeycloakTokenService.clearTokens;
export const decodeToken = KeycloakTokenService.decodeToken;
export const isTokenExpired = KeycloakTokenService.isTokenExpired;
