/**
 * Schema Migration System Tests — Sprint 3
 */

import { describe, it, expect } from 'vitest';
import {
    migrateNodeInputs,
    migrateNodes,
    getMigrationHistory,
    SCHEMA_VERSION,
} from '../schemaMigration';
import type { NodeInput } from '../defaultManager';

describe('migrateNodeInputs', () => {
    it('backfills schema defaults for a known node type', () => {
        const result = migrateNodeInputs('http_request', [], 1);
        expect(result.inputs.some(i => i.name === 'method')).toBe(true);
        expect(result.migrated).toBe(true);
    });

    it('marks nodes already at the current version as not migrated', () => {
        const result = migrateNodeInputs('http_request', [], SCHEMA_VERSION);
        expect(result.migrated).toBe(false);
    });

    it('preserves provided values while filling defaults', () => {
        const inputs: NodeInput[] = [{ name: 'url', type: 'string', value: 'https://x.com' }];
        const result = migrateNodeInputs('http_request', inputs, 1);
        expect(result.inputs.find(i => i.name === 'url')?.value).toBe('https://x.com');
        expect(result.inputs.some(i => i.name === 'method')).toBe(true);
    });

    it('handles unknown node types gracefully', () => {
        const result = migrateNodeInputs('unknown_type', [], 1);
        expect(result.inputs).toEqual([]);
    });
});

describe('migrateNodes', () => {
    it('migrates a list of nodes and stamps the schema version', () => {
        const result = migrateNodes([
            { type: 'http_request', inputs: [], schemaVersion: 1 },
            { type: 'log', inputs: [{ name: 'message', type: 'string', value: 'hi' }], schemaVersion: 1 },
        ]);
        expect(result).toHaveLength(2);
        expect(result.every(n => n.schemaVersion === SCHEMA_VERSION)).toBe(true);
    });
});

describe('getMigrationHistory', () => {
    it('returns the registered migrations', () => {
        const history = getMigrationHistory();
        expect(history.length).toBeGreaterThan(0);
        expect(history[0].fromVersion).toBe(1);
    });
});
