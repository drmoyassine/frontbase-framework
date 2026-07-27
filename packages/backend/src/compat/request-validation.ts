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

function validator(name: string): { safeParse(value: unknown): { success: boolean } } | undefined {
    return (Z as Record<string, any>)[name];
}

export function contractRequestValidation(): MiddlewareHandler<{ Variables: ConsoleAuthVars }> {
    return async (c, next) => {
        const path = new URL(c.req.url).pathname;
        const method = c.req.method.toLowerCase();
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
            if (!pathValidator.safeParse(values).success) {
                return c.json({ detail: 'validation_failed' }, 422);
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
            if (!queryValidator.safeParse(values).success) {
                return c.json({ detail: 'validation_failed' }, 422);
            }
        }

        const bodyValidator = validator(`${prefix}Body`);
        const jsonSchema = operation.requestBody?.content?.['application/json']?.schema;
        if (bodyValidator && jsonSchema) {
            const body = await c.req.json().catch(() => undefined);
            if (!bodyValidator.safeParse(body).success) {
                return c.json({ detail: 'validation_failed' }, 422);
            }
        }
        const multipartSchema = operation.requestBody?.content?.['multipart/form-data']?.schema;
        if (bodyValidator && multipartSchema) {
            if (!(c.req.header('content-type') ?? '').toLowerCase().includes('multipart/form-data')) {
                return c.json({ detail: 'validation_failed' }, 422);
            }
            const form = await c.req.raw.clone().formData().catch(() => null);
            if (!form) return c.json({ detail: 'validation_failed' }, 422);
            const body: Record<string, unknown> = {};
            for (const key of new Set(form.keys())) {
                const values = form.getAll(key).map((value) =>
                    typeof value === 'string' ? value : value.name);
                body[key] = values.length === 1 ? values[0] : values;
            }
            if (!bodyValidator.safeParse(body).success) {
                return c.json({ detail: 'validation_failed' }, 422);
            }
        }
        return next();
    };
}
