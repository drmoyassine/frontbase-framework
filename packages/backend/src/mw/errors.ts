/**
 * Opaque error envelope (RULE 4). Catch-all: log the detail server-side, return
 * `{ error: 'internal_error' }` (500). No route returns a raw exception, SQL,
 * connection string, or secret name. Typed known errors map to opaque codes.
 */
import type { ErrorHandler } from 'hono';

export const opaqueErrors: ErrorHandler = (err, c) => {
    console.error('[console]', err);
    const code = (err as Error).message?.startsWith('not_found') ? 'not_found'
        : (err as Error).message?.startsWith('validation') ? 'validation_failed'
        : 'internal_error';
    const status = code === 'not_found' ? 404 : code === 'validation_failed' ? 400 : 500;
    return c.json({ error: code }, status);
};
