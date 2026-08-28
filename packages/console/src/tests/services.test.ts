/**
 * API Service URL Tests
 *
 * Verifies that the API service creates correct URLs and handles
 * trailing slashes consistently.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('API Service URLs', () => {
    it('getBackendConfig returns empty baseUrl in dev mode', async () => {
        // Dynamic import to get module with mocked env
        const mod = await import('@/services/api-service');
        const api = mod.default;
        // baseURL should be empty string (uses Vite proxy)
        expect(api.defaults.baseURL).toBe('');
    });

    it('axios instance has correct defaults', async () => {
        const mod = await import('@/services/api-service');
        const api = mod.default;
        expect(api.defaults.headers['Content-Type']).toBe('application/json');
        expect(api.defaults.timeout).toBe(10_000);
    });
});

describe('Trailing Slash Guard — Frontend API Calls', () => {
    /**
     * Prefixes whose backend routers are in TrailingSlashMiddleware.EXCLUDE_PREFIXES
     * (main.py). Those routers define their routes WITH trailing slashes, so the
     * frontend MUST call them WITH a trailing slash to match exactly and avoid a
     * 307 redirect. Trailing slashes on these URLs are correct, not violations.
     */
    const EXCLUDED_PREFIXES = [
        '/api/auth', '/api/actions', '/api/storage', '/api/edge-engines',
        '/api/edge-providers', '/api/edge-caches', '/api/edge-databases',
        '/api/edge-queues', '/api/edge-gpu', '/api/edge-api-keys',
        '/api/cloudflare', '/api/deno', '/api/settings', '/api/agent',
        '/api/tenants', '/api/admin/tenants',
    ];
    const isTrailingSlashViolation = (url: string): boolean =>
        url !== '/' &&
        url.endsWith('/') &&
        !url.includes('${') &&
        !EXCLUDED_PREFIXES.some((p) => url.startsWith(p));

    /**
     * Scan all service files for API URL patterns and verify
     * no inconsistent trailing slashes exist.
     */
    it('no service file has API URLs with trailing slashes', () => {
        const servicesDir = path.resolve(__dirname, '../services');
        const files = fs.readdirSync(servicesDir).filter((f: string) => f.endsWith('.ts'));

        const trailingSlashViolations: string[] = [];

        for (const file of files) {
            const content = fs.readFileSync(path.join(servicesDir, file), 'utf8');

            // Find all API call patterns: api.get('/api/.../')  or  fetch('/api/.../')
            const urlMatches = content.match(/['"](\/api\/[^'"]+)['"]/g) || [];
            for (const match of urlMatches) {
                const url = match.slice(1, -1); // remove quotes
                if (isTrailingSlashViolation(url)) {
                    trailingSlashViolations.push(`${file}: ${url}`);
                }
            }
        }

        if (trailingSlashViolations.length > 0) {
            throw new Error(
                `Trailing slash detected in API URLs:\n${trailingSlashViolations.join('\n')}`
            );
        }
    });

    it('no hook file has API URLs with trailing slashes', () => {
        const hooksDir = path.resolve(__dirname, '../hooks');
        try {
            const files = fs.readdirSync(hooksDir).filter((f: string) => f.endsWith('.ts') || f.endsWith('.tsx'));

            const violations: string[] = [];
            for (const file of files) {
                const content = fs.readFileSync(path.join(hooksDir, file), 'utf8');
                const urlMatches = content.match(/['"](\/api\/[^'"]+)['"]/g) || [];
                for (const match of urlMatches) {
                    const url = match.slice(1, -1);
                    if (isTrailingSlashViolation(url)) {
                        violations.push(`${file}: ${url}`);
                    }
                }
            }

            if (violations.length > 0) {
                throw new Error(
                    `Trailing slash in hooks API URLs:\n${violations.join('\n')}`
                );
            }
        } catch (err: any) {
            if (err.message.includes('Trailing slash')) throw err;
            // Directory may not exist — skip
        }
    });

    it('no page module has API URLs with trailing slashes', () => {
        const modulesDir = path.resolve(__dirname, '../modules');
        try {
            // Recursively find all .ts/.tsx files
            const walk = (dir: string): string[] => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                let files: string[] = [];
                for (const entry of entries) {
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) files = files.concat(walk(full));
                    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push(full);
                }
                return files;
            };

            const files = walk(modulesDir);
            const violations: string[] = [];

            for (const file of files) {
                const content = fs.readFileSync(file, 'utf8');
                const urlMatches = content.match(/['"](\/api\/[^'"]+)['"]/g) || [];
                for (const match of urlMatches) {
                    const url = match.slice(1, -1);
                    if (isTrailingSlashViolation(url)) {
                        violations.push(`${path.relative(modulesDir, file)}: ${url}`);
                    }
                }
            }

            if (violations.length > 0) {
                throw new Error(
                    `Trailing slash in module API URLs:\n${violations.join('\n')}`
                );
            }
        } catch (err: any) {
            if (err.message.includes('Trailing slash')) throw err;
        }
    });
});
