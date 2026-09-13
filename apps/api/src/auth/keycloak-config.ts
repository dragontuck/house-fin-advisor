/**
 * Keycloak configuration
 * Uses settings from AGENTS.md
 */

export interface KeycloakConfig {
    realmUrl: string;
    realm: string;
    clientId: string;
    clientSecret: string;
}

export function getKeycloakConfig(): KeycloakConfig {
    const realmUrl = process.env.KEYCLOAK_REALM_URL || 'https://keycloak.keystone.internal:7443/';
    const realm = process.env.KEYCLOAK_REALM || 'home-fin';
    const clientId = process.env.KEYCLOAK_CLIENT_ID || 'home-fin-api';
    const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || 'cKlVAAJK7irs6H54QFbWPXgcKN60nJbZsIiHYZr9xh3AOZ6q2VHF7oL0pyaacz9aUCDf2raKkSL8Yjqa0dynwD';

    if (!clientSecret) {
        throw new Error('KEYCLOAK_CLIENT_SECRET is required');
    }

    return {
        realmUrl: realmUrl.endsWith('/') ? realmUrl : `${realmUrl}/`,
        realm,
        clientId,
        clientSecret,
    };
}

/**
 * Construct Keycloak OIDC discovery URL
 */
export function getKeycloakDiscoveryUrl(): string {
    const config = getKeycloakConfig();
    return `${config.realmUrl}realms/${config.realm}/.well-known/openid-configuration`;
}

/**
 * Construct Keycloak JWKS (JSON Web Key Set) URL
 */
export function getKeycloakJwksUrl(): string {
    const config = getKeycloakConfig();
    return `${config.realmUrl}realms/${config.realm}/protocol/openid-connect/certs`;
}

/**
 * Construct Keycloak token endpoint
 */
export function getKeycloakTokenEndpoint(): string {
    const config = getKeycloakConfig();
    return `${config.realmUrl}realms/${config.realm}/protocol/openid-connect/token`;
}
