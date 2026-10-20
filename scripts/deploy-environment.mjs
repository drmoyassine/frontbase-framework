/** Shared allowlist for external-host deployment. Values never enter argv. */
export const DEPLOY_SECRET_NAMES = Object.freeze([
    'SESSION_SECRET', 'APP_DB_URL', 'APP_DB_AUTH_TOKEN',
    'APP_DB_D1_ACCOUNT_ID', 'APP_DB_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN',
    'FRONTBASE_DEPLOYMENT_MANIFEST','FRONTBASE_CACHE','FRONTBASE_VECTOR','FRONTBASE_QUEUE','PUBLIC_URL',
    'STORAGE_ENDPOINT','STORAGE_REGION','STORAGE_ACCESS_KEY_ID','STORAGE_SECRET_ACCESS_KEY',
    'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_ROLE', 'SETUP_TOKEN', 'SETUP_EXPIRES_AT',
]);

/** Pick only intended nonempty string values, including generated setup expiry. */
export function deploymentEnvironment(input) {
    return Object.fromEntries(DEPLOY_SECRET_NAMES.flatMap((name) =>
        typeof input[name] === 'string' && input[name] !== '' ? [[name, input[name]]] : []));
}
