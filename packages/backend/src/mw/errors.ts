/**
 * Opaque error envelope (RULE 4). Catch-all: log the detail server-side, return
 * `{ error: 'internal_error' }` (500). No route returns a raw exception, SQL,
 * connection string, or secret name. Typed known errors map to opaque codes.
 */
import type { ErrorHandler, MiddlewareHandler } from 'hono';

const ERROR_DETAIL: Record<string, string> = {
    authentication_required: 'Not authenticated',
    tenant_required: 'Not authenticated',
    invalid_credentials: 'Invalid email or password',
    not_found: 'Not found',
    validation_failed: 'Validation failed',
    internal_error: 'Internal server error',
};

/**
 * FastAPI's HTTPException contract is `{ detail: ... }`. A number of compatibility
 * handlers used `{ success: false, message }` or `{ error }` even when their status
 * matched the product. Normalise only failed JSON responses, and never manufacture
 * detail from an exception: opaqueErrors remains the sole exception boundary.
 */
export const fastApiErrorEnvelope: MiddlewareHandler = async (c, next) => {
    await next();
    const response = c.res;
    if (response.status < 400) return;
    if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return;

    let body: Record<string, unknown>;
    try {
        const parsed = await response.clone().json() as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
        body = parsed as Record<string, unknown>;
    } catch {
        return;
    }
    if (body.detail !== undefined) return;

    const detail = typeof body.message === 'string'
        ? body.message
        : typeof body.error === 'string'
            ? ERROR_DETAIL[body.error] ?? body.error
            : undefined;
    if (detail === undefined) return;

    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json; charset=UTF-8');
    headers.delete('content-length');
    c.res = new Response(JSON.stringify({ detail }), {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
};

export const opaqueErrors: ErrorHandler = (err, c) => {
    console.error('[console]', err);
    const code = (err as Error).message?.startsWith('not_found') ? 'not_found'
        : (err as Error).message?.startsWith('validation') ? 'validation_failed'
        : 'internal_error';
    const status = code === 'not_found' ? 404 : code === 'validation_failed' ? 400 : 500;
    return c.json({ error: code }, status);
};
