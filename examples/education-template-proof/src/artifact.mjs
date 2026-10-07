/**
 * Proposed versioned template-export contract (exportSchema 1) — design
 * prototype for workstream B. NOT an accepted framework contract and NOT an
 * installable template: production import routes, schema versions and code
 * relocation remain primary decisions.
 *
 * Artifact shape:
 * {
 *   artifact: { kind: 'frontbase-template-export', exportSchema: 1, templateId, templateVersion, createdAt, source },
 *   requiredCapabilities: [{ id, required, resolveVia, note? }],
 *   destinationBindings: [ '<json-pointer-ish path>', ... ],  // what an administrator must bind
 *   configuration: { ...directory configuration defaults },   // parses against the real schema
 *   pages: [{ role, slug, name, title?, layout }],            // editable saved layouts
 *   notes: string
 * }
 *
 * Exclusions enforced on export and re-checked on validation: canonical rows,
 * credentials, approvals, active publication pointers, immutable captures,
 * local admin users and recovery data never enter the artifact.
 */
import { directoryConfigurationSchema, directoryConfigurationReadiness, directoryLayoutQueries, sitePageReferenceSchema, sitePageRoles } from '@frontbase/edge-core/directory/configuration';

export const EXPORT_KIND = 'frontbase-template-export';
export const EXPORT_SCHEMA_VERSION = 1;

/** Values that must never ship inside an artifact. */
const SECRET_PATTERNS = [
    /PRIVATE_[A-Z_]*CANARY/i,
    /sk-[A-Za-z0-9]{16,}/,
    /sk_live_|sk_test_/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}/, // JWT shape
    /AKIA[0-9A-Z]{16}/,
    /postgres(ql)?:\/\/[^\s"']+:[^\s"']+@/,
    /service_role/i,
    /authorization["']?\s*:\s*["']?bearer/i,
    /whatsapp:\+\d{6,}/i,
];

/** Keys that would mean excluded state shipped. */
const FORBIDDEN_KEYS = new Set([
    'records', 'rows', 'approvals', 'reviewers', 'activepointer', 'activegeneration',
    'captures', 'publications', 'publishedpages', 'users', 'admins', 'credentials',
    'secrets', 'recovery', 'snapshots', 'editorialdrafts', 'datasourceconfig',
]);

const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

function scan(node, keyName, hits, path) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((item, i) => scan(item, keyName, hits, `${path}[${i}]`)); return; }
    const normalized = keyName ? keyName.toLowerCase().replace(/[^a-z]/g, '') : '';
    if (FORBIDDEN_KEYS.has(normalized)) hits.push({ kind: 'forbidden-key', path: `${path}.${keyName}` });
    for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'string') {
            for (const pattern of SECRET_PATTERNS) {
                if (pattern.test(value)) hits.push({ kind: 'secret-shaped', path: `${path}.${key}`, pattern: String(pattern) });
            }
        }
        scan(value, key, hits, `${path}.${key}`);
    }
}

/**
 * Build the export artifact from a template source. Refuses destination-bound
 * values that must not ship: a resolved datasourceId, a filled site.origin
 * bound to one deployment, or any secret/exclusion-shaped content.
 */
export function exportTemplateArtifact(source) {
    const problems = [];
    // Strict allowlist: unknown source keys (a stray records/approvals dump, a
    // credentials bag, anything future) refuse instead of silently shipping.
    const allowedSourceKeys = new Set(['templateId', 'templateVersion', 'createdAt', 'source', 'requiredCapabilities', 'destinationBindings', 'configuration', 'pages', 'notes']);
    for (const key of Object.keys(source)) {
        if (!allowedSourceKeys.has(key)) problems.push(`unknown source key "${key}"; exports are allowlisted`);
    }
    const configuration = structuredClone(source.configuration);
    if (configuration.datasourceId) problems.push('configuration.datasourceId must be empty in an export; the destination binds its own datasource');
    for (const role of Object.keys(configuration.collections)) {
        if (role === 'pathway' && !configuration.collections[role].table) continue;
        if (role !== 'pathway' && configuration.collections[role].table && configuration.collections[role].scope.value !== '') {
            problems.push(`configuration.collections.${role}.scope.value must be empty in an export; the destination binds its own scope value`);
        }
    }
    const pages = structuredClone(source.pages);
    for (const page of pages) {
        if (!sitePageRoles.includes(page.role)) problems.push(`pages: unknown role ${page.role}`);
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)) problems.push(`pages: invalid slug ${page.slug}`);
    }
    if (problems.length) { const error = new Error(`export_refused: ${problems.join(' | ')}`); error.problems = problems; throw error; }

    const artifact = {
        artifact: {
            kind: EXPORT_KIND,
            exportSchema: EXPORT_SCHEMA_VERSION,
            templateId: source.templateId,
            templateVersion: source.templateVersion,
            createdAt: source.createdAt ?? null,
            source: source.source ?? 'synthetic-fixture',
        },
        requiredCapabilities: source.requiredCapabilities,
        destinationBindings: source.destinationBindings,
        configuration,
        pages,
        notes: source.notes ?? '',
    };
    const hits = [];
    scan(artifact, '', hits, '$');
    if (hits.length) {
        const problems = hits.map(h => `${h.kind} at ${h.path}`);
        const error = new Error(`export_refused_excluded_content: ${problems.join(' | ')}`);
        error.problems = problems;
        throw error;
    }
    return artifact;
}

/** Destination capability evaluation: missing required capabilities fail clearly. */
export function evaluateCapabilities(artifact, destination) {
    const missing = [];
    for (const capability of artifact.requiredCapabilities ?? []) {
        const satisfied = capability.id === 'sql.datasource'
            ? (destination.sqlDatasourceKinds?.length ?? 0) > 0
            : capability.id === 'storage.object'
                ? (destination.objectStorageKinds?.length ?? 0) > 0
                : capability.id === 'publication.runtime'
                    ? destination.publicationRuntime === true
                    : false;
        if (capability.required && !satisfied) {
            missing.push({ id: capability.id, resolveVia: capability.resolveVia, note: capability.note ?? '' });
        }
    }
    return { ok: missing.length === 0, missing };
}

/** Slug/route collision pre-check against an existing destination. */
export function findCollisions(artifact, destination) {
    const existingSlugs = new Set(destination.existingPageSlugs ?? []);
    const existingRoutes = new Set(destination.existingRoutes ?? []);
    const collisions = [];
    for (const page of artifact.pages) {
        if (existingSlugs.has(page.slug)) collisions.push({ kind: 'page-slug', detail: page.slug });
    }
    for (const route of [artifact.configuration.routes.directory, artifact.configuration.routes.blog]) {
        if (route && existingRoutes.has(route)) collisions.push({ kind: 'reserved-route', detail: route });
    }
    return collisions;
}

/**
 * Independent validation of an untrusted artifact. Returns
 * { ok, errors, warnings, readiness } — never mutates the input.
 */
export function validateTemplateArtifact(artifact) {
    const errors = [];
    const warnings = [];
    if (!artifact || typeof artifact !== 'object') return { ok: false, errors: ['artifact is not an object'], warnings, readiness: [] };
    const envelope = artifact.artifact ?? {};
    if (envelope.kind !== EXPORT_KIND) errors.push('artifact.kind must be frontbase-template-export');
    if (envelope.exportSchema !== EXPORT_SCHEMA_VERSION) errors.push(`artifact.exportSchema must be ${EXPORT_SCHEMA_VERSION}`);
    if (envelope.templateId !== 'education-directory') errors.push('artifact.templateId must be education-directory (the only template identity the current schema accepts)');

    const parsed = directoryConfigurationSchema.safeParse(artifact.configuration);
    if (!parsed.success) {
        errors.push(`configuration fails the framework schema: ${parsed.error.issues.map(i => i.path.join('.') || 'configuration').join(', ')}`);
    } else {
        const readiness = directoryConfigurationReadiness(parsed.data);
        const declared = new Set(artifact.destinationBindings ?? []);
        for (const gap of readiness) {
            if (!declared.has(gap) && !declared.has(`configuration.${gap}`)) {
                errors.push(`configuration gap "${gap}" is not declared in destinationBindings; a destination could not know to bind it`);
            }
        }
        if (parsed.data.datasourceId) errors.push('configuration.datasourceId must be empty; destinations resolve their own datasource through admin connection flows');
    }

    const slugs = new Set();
    const roles = new Set();
    for (const page of artifact.pages ?? []) {
        if (!sitePageRoles.includes(page.role)) errors.push(`pages: unknown role ${page.role}`);
        if (roles.has(page.role)) errors.push(`pages: duplicate role ${page.role}`);
        roles.add(page.role);
        if (slugs.has(page.slug)) errors.push(`pages: duplicate slug ${page.slug}`);
        slugs.add(page.slug);
        if (!sitePageReferenceSchema.safeParse(page.layout?.root?.siteConfiguration).success) {
            errors.push(`pages.${page.slug}: layout root must carry a siteConfiguration page reference`);
        }
        try {
            directoryLayoutQueries(page.layout);
        } catch (error) {
            errors.push(`pages.${page.slug}: layout rejected by directoryLayoutQueries (${error.message})`);
        }
    }
    if (!(artifact.pages ?? []).some(page => page.role === 'directory')) warnings.push('artifact carries no directory index layout');

    const hits = [];
    scan(artifact, '', hits, '$');
    for (const hit of hits) errors.push(`${hit.kind} at ${hit.path}: excluded content must not ship`);

    return { ok: errors.length === 0, errors, warnings, readiness: parsed.success ? directoryConfigurationReadiness(parsed.data) : [] };
}

/** Deterministic canonical JSON used for node comparison. */
export function nodeFingerprint(node) {
    return canonical(node);
}

function collectIds(node, into) {
    if (!node || typeof node !== 'object') return into;
    if (Array.isArray(node)) { node.forEach(item => collectIds(item, into)); return into; }
    if (typeof node.id === 'string') into.set(node.id, node);
    for (const child of node.children ?? []) collectIds(child, into);
    return into;
}

function subtreeIds(node, into = []) {
    if (!node || typeof node !== 'object') return into;
    if (Array.isArray(node)) { node.forEach(item => subtreeIds(item, into)); return into; }
    if (typeof node.id === 'string') into.push(node.id);
    for (const child of node.children ?? []) subtreeIds(child, into);
    return into;
}

/**
 * Upgrade merge prototype: re-apply a newer artifact layout over a live page.
 *
 * Ownership model (proposed contract, not an accepted framework mechanism):
 * - A node carrying props.templateNodeId is template-owned; its deterministic
 *   id identifies it across artifact versions.
 * - A template node whose live copy is byte-identical to the previously
 *   installed artifact copy is upgraded to the next version.
 * - A template node the owner edited (or whose subtree contains owner nodes)
 *   is preserved verbatim with its whole subtree; it is never auto-upgraded.
 * - Owner-added top-level nodes are preserved and kept after the merged
 *   template content.
 * - Because preservation happens at the FIRST customized ancestor and carries
 *   its whole subtree, owner content nested inside a customized subtree
 *   survives with it; an upgraded subtree is byte-identical to the previous
 *   artifact copy and therefore cannot contain owner content. The errors
 *   array exists for future structural merge rules.
 *
 * Returns { layout, report, errors } — the caller must check errors === []
 * before saving anything, and page history (page_versions) stays the recovery
 * mechanism.
 */
export function mergeArtifactUpgrade({ previousLayout, liveLayout, nextLayout }) {
    const previous = collectIds(previousLayout.content ?? [], new Map());
    const liveTop = liveLayout.content ?? [];
    const live = collectIds(liveTop, new Map());
    const previousTopIds = new Set(subtreeIdsList(previousLayout.content));
    const nextTopIds = new Set(subtreeIdsList(nextLayout.content));
    const report = { upgraded: [], preservedCustomized: [], preservedOwnerTopLevel: [], added: [] };
    const errors = [];
    const isTemplate = node => typeof node?.props?.templateNodeId === 'string';

    const walk = node => {
        if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
        if (!isTemplate(node)) { report.added.push(node.id ?? '(unnamed)'); return structuredClone(node); }
        const baseline = previous.get(node.id);
        const liveNode = live.get(node.id);
        if (baseline && liveNode && canonical(liveNode) !== canonical(baseline)) {
            report.preservedCustomized.push(node.id);
            return structuredClone(liveNode); // whole owner subtree preserved
        }
        if (!baseline) { report.added.push(node.id); return structuredClone(node); }
        report.upgraded.push(node.id);
        const out = structuredClone(node);
        if (Array.isArray(node.children)) out.children = node.children.map(walk);
        return out;
    };

    const content = nextLayout.content.map(walk);
    for (const top of liveTop) {
        if (isTemplate(top)) continue;
        if (!previousTopIds.has(top.id) && !nextTopIds.has(top.id)) {
            content.push(structuredClone(top));
            report.preservedOwnerTopLevel.push(top.id ?? '(unnamed)');
        }
    }
    return { layout: { root: structuredClone(liveLayout.root ?? nextLayout.root), content }, report, errors };
}

function subtreeIdsList(nodes) {
    const ids = [];
    for (const node of nodes ?? []) ids.push(...subtreeIds(node, []));
    return ids;
}
