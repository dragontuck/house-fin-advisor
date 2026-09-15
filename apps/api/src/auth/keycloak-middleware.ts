/**
 * Keycloak authentication middleware for Express
 */

import { Request, Response, NextFunction } from 'express';
import { EntityId } from '@house-fin/contracts';
import { extractTokenFromHeader, verifyKeycloakToken, KeycloakToken } from './jwt-verifier';

/**
 * Extend Express Request to include Keycloak token
 */
declare global {
    namespace Express {
        interface Request {
            keycloakToken?: KeycloakToken;
        }
    }
}

/**
 * Authentication error for Keycloak
 */
export class AuthenticationError extends Error {
    constructor(
        public statusCode: number = 401,
        public errorCode: string = 'AUTHENTICATION_FAILED',
        message?: string
    ) {
        super(message || 'Authentication failed');
        this.name = 'AuthenticationError';
    }
}

/**
 * Authorization error for role-based checks
 */
export class AuthorizationError extends Error {
    constructor(
        public statusCode: number = 403,
        public errorCode: string = 'AUTHORIZATION_FAILED',
        message?: string
    ) {
        super(message || 'Authorization failed');
        this.name = 'AuthorizationError';
    }
}

/**
 * Middleware: Verify Keycloak JWT token
 * Extracts token from Authorization header and verifies it
 * If valid, sets req.keycloakToken
 */
export const keycloakAuthMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        const token = extractTokenFromHeader(authHeader);

        if (!token) {
            throw new AuthenticationError(
                401,
                'NO_TOKEN',
                'Missing or invalid Authorization header'
            );
        }

        const verifiedToken = await verifyKeycloakToken(token);
        req.keycloakToken = verifiedToken;

        // Also update context with user info
        if (req.context) {
            req.context.userId = verifiedToken.sub as EntityId;
            req.context.isAuthorized = true;
        }

        next();
    } catch (error) {
        if (error instanceof AuthenticationError) {
            res.status(error.statusCode).json({
                error: error.errorCode,
                message: error.message,
            });
        } else {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[AUTH_VERIFICATION_FAILED]', {
                error: errorMessage,
                timestamp: new Date().toISOString(),
            });
            res.status(401).json({
                error: 'INVALID_TOKEN',
                message: 'Token verification failed',
            });
        }
    }
};

/**
 * Middleware: Optional authentication
 * Same as keycloakAuthMiddleware but doesn't fail if token is missing
 * Useful for public endpoints that can also work authenticated
 */
export const keycloakOptionalAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        const token = extractTokenFromHeader(authHeader);

        if (token) {
            const verifiedToken = await verifyKeycloakToken(token);
            req.keycloakToken = verifiedToken;

            if (req.context) {
                req.context.userId = verifiedToken.sub as EntityId;
                req.context.isAuthorized = true;
            }
        }

        next();
    } catch (error) {
        // Log but don't fail - token is optional
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn('[OPTIONAL_AUTH_FAILED]', {
            error: errorMessage,
            timestamp: new Date().toISOString(),
        });
        next();
    }
};

/**
 * Middleware: Check if user has specific role
 * Should be used after keycloakAuthMiddleware
 */
export const requireRole = (allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.keycloakToken) {
            res.status(401).json({
                error: 'UNAUTHENTICATED',
                message: 'User is not authenticated',
            });
            return;
        }

        const userRoles = req.keycloakToken.realm_access?.roles || [];
        const clientRoles = req.keycloakToken.resource_access?.['home-fin-api']?.roles || [];
        const allRoles = [...userRoles, ...clientRoles];

        const hasRole = allowedRoles.some(role => allRoles.includes(role));

        if (!hasRole) {
            res.status(403).json({
                error: 'INSUFFICIENT_PERMISSIONS',
                message: `User does not have required role. Required: ${allowedRoles.join(', ')}`,
            });
            return;
        }

        next();
    };
};
