import type { Config } from '@libsql/client';
import type { ServiceFetch } from '../cache/types.js';

/** Per-client HTTP injection cannot govern WebSockets or native SQLite.
 * Native operator callers omit fetchImpl. Remote guarded callers must use TLS
 * HTTP, including libsql's default HTTPS normalization. Backend owns URL policy. */
export function libsqlHttpConfig(url: string, authToken?: string, fetchImpl?: ServiceFetch): Config {
    if (fetchImpl) {
        const parsed = new URL(url);
        if (!['https:', 'libsql:'].includes(parsed.protocol)
            || parsed.searchParams.get('tls') === '0') {
            throw new Error('unsupported_guarded_libsql_transport');
        }
    }
    return { url, authToken, fetch: fetchImpl };
}
