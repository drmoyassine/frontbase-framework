/** Conformance test double only. It is not durable storage or part of the package exports. */
const copy = value => structuredClone(value);
const key = (scope, unitId) => JSON.stringify([scope.tenantId, scope.projectId, unitId]);
export class MemoryPersistence {
    units = new Map();
    revisions = new Map();
    sources = new Map();
    async readSourceVersion(scope, unitId, version) { return copy(this.sources.get(JSON.stringify([key(scope, unitId), version])) ?? null); }
    async read(scope, unitId, locale) {
        const unit = this.units.get(key(scope, unitId));
        return unit ? copy({ version: unit.version, source: unit.source, head: unit.heads[locale] ?? null }) : { version: 0, source: null, head: null };
    }
    async readRevision(scope, unitId, locale, revisionId) { return copy(this.revisions.get(JSON.stringify([key(scope, unitId), locale, revisionId])) ?? null); }
    async listRevisions(scope, unitId, locale, limit) {
        if (!Number.isSafeInteger(limit) || limit < 1) throw Error('invalid_translation_history_limit');
        const found = [];
        for (const [id, value] of this.revisions) {
            const parts = JSON.parse(id);
            if (parts[0] === key(scope, unitId) && parts[1] === locale) found.push(copy(value));
        }
        return found.slice(-Math.min(limit, 100)).reverse();
    }
    async findApprovedHead(scope, locale, sourceFingerprint, excludeUnitId) {
        let found = null;
        for (const [id, value] of this.revisions) {
            const parts = JSON.parse(id), [tenantId, projectId, unitId] = JSON.parse(parts[0]);
            if (parts[1] !== locale || unitId === excludeUnitId || value.sourceFingerprint !== sourceFingerprint) continue;
            if (tenantId !== scope.tenantId || projectId !== scope.projectId) continue;
            found = { unitId, revision: copy(value) }; // insertion order: the last match is the newest write
        }
        return found;
    }
    async compareAndSwap(scope, unitId, expectedVersion, change) {
        const id = key(scope, unitId), current = this.units.get(id);
        if ((current?.version ?? 0) !== expectedVersion) return 'conflict';
        if (change.kind === 'source') {
            this.sources.set(JSON.stringify([id, change.source.sourceVersion]), copy(change.source));
            this.units.set(id, { version: expectedVersion + 1, source: copy(change.source), heads: current?.heads ?? {} });
        } else {
            if (change.jobFence) return 'job-fenced'; // The test double does not implement durable jobs.
            if (!current) return 'conflict';
            const revisionKey = JSON.stringify([id, change.revision.locale, change.revision.revisionId]);
            if (this.revisions.has(revisionKey)) return 'revision-id-conflict';
            this.revisions.set(revisionKey, copy(change.revision));
            current.version++; current.heads[change.revision.locale] = copy(change.revision);
        }
        return 'committed';
    }
}
