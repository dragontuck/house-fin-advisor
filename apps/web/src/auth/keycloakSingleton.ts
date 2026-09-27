import Keycloak from 'keycloak-js';
const url = (import.meta.env.VITE_KEYCLOAK_URL || 'https://keycloak.keystone.internal:7443').replace(/\/$/, '');
const realm = import.meta.env.VITE_KEYCLOAK_REALM || 'home-fin';
const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'home-fin-web';

const keycloak = new Keycloak({
    url,
    realm,
    clientId,
});

export default keycloak;