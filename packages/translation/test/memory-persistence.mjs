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
