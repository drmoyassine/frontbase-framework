/**
 * Schema Migration System — Sprint 3
 *
 * A small, versioned migration registry for workflow node input schemas.
 * When node schemas evolve, registered migrations bring older node input
 * arrays up to the current shape. Pure and fully unit-testable.
 *
 * Versioning convention: each node type has a target schema version
 * (SCHEMA_VERSION). Stored nodes carry the version they were created with.
 * `migrateNodeInputs` runs every applicable migration in order.
 */

import { getNodeSchema } from './nodeSchemas';
import { applyDefaults } from './defaultManager';
import type { NodeInput } from './defaultManager';

export const SCHEMA_VERSION = 2;

export interface Migration {
    fromVersion: number;
    toVersion: number;
    nodeType: string; // '*' applies to all node types
    description: string;
    migrate: (inputs: NodeInput[]) => NodeInput[];
}

/**
 * Registry of migrations. Add new migrations here as schemas evolve.
 */
export const migrations: Migration[] = [
    // v1 -> v2: ensure every node has a full set of schema fields with defaults.
    {
        fromVersion: 1,
        toVersion: 2,
        nodeType: '*',
        description: 'Backfill schema-driven defaults for missing fields',
        migrate: (inputs) => inputs, // defaults applied per-node-type in migrateNodeInputs
    },
];

function getApplicableMigrations(nodeType: string, fromVersion: number): Migration[] {
    return migrations
        .filter(m => (m.nodeType === '*' || m.nodeType === nodeType) && m.fromVersion >= fromVersion)
        .sort((a, b) => a.fromVersion - b.fromVersion);
}

/**
 * Migrate a node's inputs to the current schema version.
 */
export function migrateNodeInputs(
    nodeType: string,
    inputs: NodeInput[],
    fromVersion = 1
): { inputs: NodeInput[]; migrated: boolean; appliedCount: number } {
    let current = [...inputs];
    let appliedCount = 0;

    for (const migration of getApplicableMigrations(nodeType, fromVersion)) {
        current = migration.migrate(current);
        appliedCount++;
    }

    // Always reconcile against the current schema (fill defaults) post-migration
    if (getNodeSchema(nodeType)) {
        current = applyDefaults(nodeType, current);
    }

    const migrated = appliedCount > 0 || fromVersion < SCHEMA_VERSION;
    return { inputs: current, migrated, appliedCount };
}

/**
 * Migrate inputs for a list of nodes.
 */
export function migrateNodes(
    nodes: Array<{ type: string; inputs?: NodeInput[]; schemaVersion?: number }>
): Array<{ type: string; inputs: NodeInput[]; schemaVersion: number; migrated: boolean }> {
    return nodes.map(node => {
        const result = migrateNodeInputs(node.type, node.inputs || [], node.schemaVersion || 1);
        return {
            type: node.type,
            inputs: result.inputs,
            schemaVersion: SCHEMA_VERSION,
            migrated: result.migrated,
        };
    });
}

export function getMigrationHistory(): Migration[] {
    return [...migrations];
}
