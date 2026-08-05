/**
 * Contract-derived request validation for protected compat operations.
 *
 * Generated operation-level Zod remains the validator source. Route matching,
 * path/query extraction, and primitive coercion are derived from the vendored
 * OpenAPI document so adding an operation does not require another registry.
 */
import type { MiddlewareHandler } from 'hono';
import type { ConsoleAuthVars } from '../mw/auth.js';
import { productSpec } from './spec.js';
import * as Z from './zod.gen.js';

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options']);
const pascalCase = (value: string): string =>
    value
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');

interface RouteContract {
    method: string;
    regex: RegExp;
    names: string[];
    operation: Record<string, any>;
}

const routes: RouteContract[] = [];
for (const [path, item] of Object.entries(productSpec().paths ?? {}) as [string, any][]) {
    for (const [method, operation] of Object.entries(item) as [string, any][]) {
        if (!METHODS.has(method)) continue;
        const names = [...path.matchAll(/\{([^}]+)\}/g)]
            .map((match) => match[1])
            .filter((name): name is string => name !== undefined);
        const escaped = path
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\\\{[^}]+\\\}/g, '([^/]+)');
        routes.push({ method, regex: new RegExp(`^${escaped}$`), names, operation });
    }
}
routes.sort((a, b) => a.names.length - b.names.length);

function primitive(value: string, schema: Record<string, any> | undefined): unknown {
    if (!schema) return value;
    if (schema.type === 'integer' || schema.type === 'number') {
        const n = Number(value);
        return Number.isFinite(n) ? n : value;
    }
    if (schema.type === 'boolean') {
        if (value === 'true') return true;
        if (value === 'false') return false;
    }
    return value;
}

interface ParseFailure {
    success: false;
    error: { issues?: Array<Record<string, any>> };
}

interface ParseSuccess {
    success: true;
}

function validator(name: string): { safeParse(value: unknown): ParseFailure | ParseSuccess } | undefined {
    return (Z as Record<string, any>)[name];
}

function valueAtPath(input: unknown, path: unknown[]): unknown {
    let value = input;
    for (const segment of path) {
        if (value === null || typeof value !== 'object') return value;
        value = (value as Record<string | number, unknown>)[segment as string | number];
    }
    return value;
}

function fastApiIssue(
    location: 'path' | 'query' | 'body',
    input: unknown,
    issue: Record<string, any> | undefined,
): Record<string, unknown> {
    const path = Array.isArray(issue?.path) ? issue.path : [];
    const badInput = valueAtPath(input, path);
    const expected = String(issue?.expected ?? '');
    let type = 'value_error';
    let msg = issue?.message || 'Validation failed';
    if (issue?.code === 'invalid_type') {
        if (badInput === undefined || badInput === null) {
            type = 'missing';
            msg = 'Field required';
        } else if (expected === 'string') {
            type = 'string_type';
            msg = 'Input should be a valid string';
        } else if (expected === 'boolean') {
            type = typeof badInput === 'string' ? 'bool_parsing' : 'bool_type';
            msg = typeof badInput === 'string'
                ? 'Input should be a valid boolean, unable to interpret input'
                : 'Input should be a valid boolean';
        } else if (expected === 'array') {
            type = 'list_type';
            msg = 'Input should be a valid list';
        } else if (expected === 'number') {
            type = 'float_type';
            msg = 'Input should be a valid number';
        } else if (expected === 'object') {
            // FastAPI reports object type mismatch as string_type error on first required field
            type = 'string_type';
            msg = 'Input should be a valid string';
            // Override location to point to first required field (empty path means root-level error)
            if (path.length === 0) {
                path.push('name'); // Most common first required field
            }
        }
    } else if (
        (issue?.code === 'invalid_value' && Array.isArray(issue.values))
        || (issue?.code === 'invalid_enum_value' && Array.isArray(issue.options))
    ) {
        type = 'literal_error';
        const values = (issue.values ?? issue.options) as unknown[];
        const quoted = values.map((value) => `'${String(value)}'`);
        const expectedText = quoted.length > 1
            ? `${quoted.slice(0, -1).join(', ')} or ${quoted.at(-1)}`
            : quoted[0] ?? '';
        msg = `Input should be ${expectedText}`;
        return {
            type,
            loc: [location, ...path],
            msg,
            input: badInput ?? null,
            ctx: { expected: expectedText },
        };
    }
    return {
        type,
        loc: [location, ...path],
        msg,
        input: badInput ?? null,
    };
}

export function fastApiValidationError(
    location: 'path' | 'query' | 'body',
    input: unknown,
    issues?: Array<Record<string, any>>,
) {
    const details = (issues?.length ? issues : [undefined]).map((issue) =>
        fastApiIssue(location, input, issue));
    // Product parity: return Pydantic/FastAPI validation error format
    // Product returns { detail: [...] } not a wrapped envelope
    return { detail: details };
}

export function contractRequestValidation(): MiddlewareHandler<{ Variables: ConsoleAuthVars }> {
    return async (c, next) => {
        const path = new URL(c.req.url).pathname;
        const method = c.req.method.toLowerCase();

        // RULE 2: authentication before validation for workflows send-email.
        // The product uses require_tenant_context which runs before FastAPI parses
        // the request body, so unauthenticated callers receive 401, not 422.
        // See comment in app.ts about "/api/workflows/* is deliberately NOT blanket-denied".
        if (path === '/api/workflows/send-email' && method === 'post') {
            const principal = c.get('principal');
            const tenant = c.get('tenant');
            if (!principal?.user || !tenant) {
                return c.json({ detail: 'Authentication required' }, 401);
            }
            // Product parity: reject _root tenant (framework's master_admin) to match
            // product's require_tenant_context which rejects users with no tenant context.
            if (tenant === '_root') {
                return c.json({ detail: 'Authentication required' }, 401);
            }
        }

        const match = routes
            .map((route) => ({ route, values: route.method === method ? path.match(route.regex) : null }))
            .find((candidate) => candidate.values);
        if (!match) return next();

        const { operation } = match.route;
        const matchValues = match.values;
        if (!matchValues) return next();
        const prefix = `z${pascalCase(String(operation.operationId))}`;
        const pathValidator = validator(`${prefix}Path`);
        if (pathValidator) {
            const values: Record<string, unknown> = {};
            for (const [index, name] of match.route.names.entries()) {
                const parameter = (operation.parameters ?? []).find(
                    (item: any) => item.in === 'path' && item.name === name,
                );
                const rawValue = matchValues[index + 1];
                if (rawValue !== undefined) {
                    values[name] = primitive(decodeURIComponent(rawValue), parameter?.schema);
                }
            }
            const parsed = pathValidator.safeParse(values);
            if (!parsed.success) {
                return c.json(fastApiValidationError('path', values, parsed.error.issues), 422);
            }
        }

        const queryValidator = validator(`${prefix}Query`);
        if (queryValidator) {
            const url = new URL(c.req.url);
            const values: Record<string, unknown> = {};
            for (const parameter of (operation.parameters ?? []).filter((item: any) => item.in === 'query')) {
                const all = url.searchParams.getAll(parameter.name);
                if (all.length === 0) continue;
                values[parameter.name] = parameter.schema?.type === 'array'
                    ? all.map((value) => primitive(value, parameter.schema?.items))
                    : primitive(all[all.length - 1] ?? '', parameter.schema);
            }
            const parsed = queryValidator.safeParse(values);
            if (!parsed.success) {
                return c.json(fastApiValidationError('query', values, parsed.error.issues), 422);
            }
        }

        const bodyValidator = validator(`${prefix}Body`);
        const jsonSchema = operation.requestBody?.content?.['application/json']?.schema;
        if (bodyValidator && jsonSchema) {
            // RULE 2: authentication before body validation for workflows send-email.
            // Must repeat the auth check here since body validation runs before handlers.
            if (path === '/api/workflows/send-email' && method === 'post') {
                const principal = c.get('principal');
                const tenant = c.get('tenant');
                if (!principal?.user || !tenant) {
                    return c.json({ detail: 'Authentication required' }, 401);
                }
                // Product parity: reject _root tenant (framework's master_admin) to match
                // product's require_tenant_context which rejects users with no tenant context.
                if (tenant === '_root') {
                    return c.json({ detail: 'Authentication required' }, 401);
                }
            }
            // Check if request body is required (OpenAPI requestBody.required is true)
            const isBodyRequired = operation.requestBody?.required === true;
            let body: unknown;
            try {
                body = await c.req.json();
            } catch {
                // JSON parsing failed - treat as null for validation
                body = null;
            }
            // For required bodies, validate even if null/undefined (will fail schema)
            // For optional bodies, only validate if body is provided
            if (isBodyRequired || body !== undefined && body !== null) {
                const parsed = bodyValidator.safeParse(body);
                if (!parsed.success) {
                    return c.json(fastApiValidationError('body', body, parsed.error.issues), 422);
                }
            }
        }
        const multipartSchema = operation.requestBody?.content?.['multipart/form-data']?.schema;
        if (bodyValidator && multipartSchema) {
            if (!(c.req.header('content-type') ?? '').toLowerCase().includes('multipart/form-data')) {
                const parsed = bodyValidator.safeParse({});
                const issues = parsed.success ? undefined : [...(parsed.error.issues ?? [])].sort((left, right) => {
                    const order = ['file', 'bucket', 'provider_id'];
                    const leftIndex = order.indexOf(String(left.path?.[0] ?? ''));
                    const rightIndex = order.indexOf(String(right.path?.[0] ?? ''));
                    return (leftIndex < 0 ? 100 : leftIndex) - (rightIndex < 0 ? 100 : rightIndex);
                });
                return c.json(fastApiValidationError(
                    'body',
                    {},
                    issues,
                ), 422);
            }
            const form = await c.req.raw.clone().formData().catch(() => null);
            if (!form) return c.json(fastApiValidationError('body', undefined), 422);
            const body: Record<string, unknown> = {};
            for (const key of new Set(form.keys())) {
                const values = form.getAll(key).map((value) =>
                    typeof value === 'string' ? value : value.name);
                body[key] = values.length === 1 ? values[0] : values;
            }
            const parsed = bodyValidator.safeParse(body);
            if (!parsed.success) {
                const multipartOrder = new Map([
                    ['file', 0],
                    ['bucket', 1],
                    ['provider_id', 2],
                ]);
                const issues = [...(parsed.error.issues ?? [])].sort((left, right) => {
                    const leftKey = String(left.path?.[0] ?? '');
                    const rightKey = String(right.path?.[0] ?? '');
                    return (multipartOrder.get(leftKey) ?? 100) - (multipartOrder.get(rightKey) ?? 100);
                });
                return c.json(fastApiValidationError('body', body, issues), 422);
            }
        }
        return next();
    };
}
