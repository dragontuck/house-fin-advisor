/**
 * JWT verification utilities for Keycloak tokens
 * Uses jose library for JWT validation
 */

import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';
import { getKeycloakJwksUrl, getKeycloakConfig } from './keycloak-config';

export interface KeycloakToken extends JWTPayload {
    sub: string;
    preferred_username?: string;
    name?: string;
    email?: string;
    realm_access?: {
        roles: string[];
    };
    resource_access?: {
        [key: string]: {
            roles: string[];
        };
    };
}

/**
 * Cache for JWKS to avoid fetching on every verification
 */
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Get or create the JWKS remote set (cached)
 */
function getJwks() {
    if (!jwksCache) {
        jwksCache = createRemoteJWKSet(new URL(getKeycloakJwksUrl()));
    }
    return jwksCache;
}

/**
 * Verify a JWT token from Keycloak
 * @param token The JWT token string
 * @returns Decoded token payload if valid
 * @throws Error if token is invalid
 */
export async function verifyKeycloakToken(token: string): Promise<KeycloakToken> {
    try {
        const config = getKeycloakConfig();
        const jwks = getJwks();

        const verified = await jwtVerify(token, jwks, {
            issuer: `${config.realmUrl}realms/${config.realm}`,
            audience: config.clientId,
        });

        return verified.payload as KeycloakToken;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Token verification failed: ${errorMessage}`);
    }
}

/**
 * Extract token from Authorization header
 * @param authHeader The Authorization header value
 * @returns The token string, or null if header is invalid
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader) {
        return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return null;
    }

    return parts[1];
}

/**
 * Get user ID from token
 */
export function getUserIdFromToken(token: KeycloakToken): string {
    return token.sub;
}

/**
 * Get username from token
 */
export function getUsernameFromToken(token: KeycloakToken): string {
    return token.preferred_username || token.sub;
}

/**
 * Get user roles from token
 */
export function getUserRolesFromToken(token: KeycloakToken): string[] {
    const realmRoles = token.realm_access?.roles || [];
    // Get roles from the home-fin-api client
    const clientRoles = token.resource_access?.['home-fin-api']?.roles || [];
    return [...realmRoles, ...clientRoles];
}

/**
 * Check if user has a specific role
 */
export function hasRole(token: KeycloakToken, role: string): boolean {
    const roles = getUserRolesFromToken(token);
    return roles.includes(role);
}
