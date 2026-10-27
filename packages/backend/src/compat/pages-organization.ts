import { z } from 'zod';
import type { DbRunner } from '@frontbase/edge-infra';

const id = z.string().min(1).max(200);
const folder = z.object({ id, name: z.string().trim().min(1).max(100), parentId: id.nullable(), order: z.number().int().min(0).max(100000) }).strict();
const placement = z.object({ entryId: id, folderId: id.nullable(), order: z.number().int().min(0).max(100000) }).strict();
export const pagesOrganizationSchema = z.object({ schemaVersion: z.literal(1), revision: z.number().int().min(0).max(2147483647), folders: z.array(folder).max(200), placements: z.array(placement).max(5000) }).strict();
export type PagesOrganization = z.infer<typeof pagesOrganizationSchema>;
export const pagesOrganizationSaveSchema = pagesOrganizationSchema.omit({ revision: true }).extend({ expectedRevision: z.number().int().min(0).max(2147483646) }).strict();
export const emptyPagesOrganization = (): PagesOrganization => ({ schemaVersion: 1, revision: 0, folders: [], placements: [] });

/** Organization is independent of page paths, layouts, configuration and publication. */
export function validatePagesOrganization(value: PagesOrganization, ownedEntries?: ReadonlySet<string>): boolean {
    const folders = new Map(value.folders.map(f => [f.id, f]));
    if (folders.size !== value.folders.length) return false;
    for (const f of value.folders) {
        const visited = new Set([f.id]);
        let parent = f.parentId;
        while (parent !== null) {
            if (visited.has(parent) || !folders.has(parent) || visited.size > 20) return false;
            visited.add(parent); parent = folders.get(parent)!.parentId;
        }
    }
    const entries = new Set<string>();
    for (const p of value.placements) {
        if (entries.has(p.entryId) || (p.folderId !== null && !folders.has(p.folderId)) || (ownedEntries && !ownedEntries.has(p.entryId))) return false;
        entries.add(p.entryId);
    }
    return true;
}

const KEY = 'pages_organization:v1';
export class PagesOrganizationStore {
    constructor(private runner: DbRunner, private tenant: string) {}
    private async read(): Promise<{raw: string; value: PagesOrganization} | null> {
        const rows = await this.runner.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?', [this.tenant, KEY]);
        if (!rows.length) return null;
        try {
            const raw = String(rows[0]!.value), value = pagesOrganizationSchema.parse(JSON.parse(raw));
            if (!validatePagesOrganization(value)) throw new Error();
            return {raw, value};
        } catch { throw new Error('Page organization is unavailable'); }
    }
    async get(): Promise<PagesOrganization> { return (await this.read())?.value ?? emptyPagesOrganization(); }
    async save(input: z.infer<typeof pagesOrganizationSaveSchema>, ownedEntries: ReadonlySet<string>, now: string): Promise<PagesOrganization | null> {
        const prior = await this.read();
        if ((prior?.value.revision ?? 0) !== input.expectedRevision) return null;
        const next = pagesOrganizationSchema.parse({schemaVersion: 1, revision: input.expectedRevision + 1, folders: input.folders, placements: input.placements});
        if (!validatePagesOrganization(next, ownedEntries)) throw new Error('Invalid page organization');
        const raw = JSON.stringify(next);
        const changed = prior
            ? await this.runner.exec('UPDATE settings SET value = ?, updated_at = ? WHERE tenant_slug = ? AND key = ? AND value = ?', [raw, now, this.tenant, KEY, prior.raw])
            : await this.runner.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING', [this.tenant, KEY, raw, now]);
        return changed === 1 ? next : null;
    }
}
