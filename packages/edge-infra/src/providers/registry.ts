/**
 * buildDataProvider(env) — picks the driver from config. The credential-gated
 * providers (d1/turso/postgres) are selected by the presence of their env keys;
 * SQLite is the default/reference.
 */
import type { SiteManifest } from '@frontbase/edge-core';
import type { DataProviderWithClient } from './types.js';
import { sqliteDataProvider } from './sqlite.js';
import { d1DataProvider, tursoDataProvider, postgresDataProvider } from './cloud.js';

export interface ProviderEnv {
    /** `'sqlite' | 'd1' | 'turso' | 'postgres'`. Default `sqlite`. */
    driver?: string;
    sqliteUrl?: string;
    d1AccountId?: string; d1DatabaseId?: string; d1ApiToken?: string;
    tursoUrl?: string; tursoAuthToken?: string;
    postgresUrl?: string;
}

export function buildDataProvider(manifest: SiteManifest, env: ProviderEnv = {}): DataProviderWithClient {
    switch (env.driver) {
        case 'd1':
            return d1DataProvider({
                manifest,
                accountId: requireEnv(env.d1AccountId, 'd1AccountId'),
                databaseId: requireEnv(env.d1DatabaseId, 'd1DatabaseId'),
                apiToken: requireEnv(env.d1ApiToken, 'd1ApiToken'),
            });
        case 'turso':
            return tursoDataProvider({
                manifest,
                url: requireEnv(env.tursoUrl, 'tursoUrl'),
                authToken: requireEnv(env.tursoAuthToken, 'tursoAuthToken'),
            });
        case 'postgres':
            return postgresDataProvider({
                manifest,
                connectionString: requireEnv(env.postgresUrl, 'postgresUrl'),
            });
        case 'sqlite':
        default:
            return sqliteDataProvider({ manifest, url: env.sqliteUrl });
    }
}

function requireEnv<T>(v: T | undefined, name: string): T {
    if (v === undefined || v === '') throw new Error(`provider_config_missing:${name}`);
    return v;
}
