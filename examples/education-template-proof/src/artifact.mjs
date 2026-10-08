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
    /sb_(secret|publishable)_[A-Za-z0-9_-]{8,}/,
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
    const normalized = keyName ? keyName.toLowerCase().replace(/[^a-z]/g, '') : '';
    if (FORBIDDEN_KEYS.has(normalized)) hits.push({ kind:'forbidden-key',path });
    if (typeof node === 'string') {
        for (const pattern of SECRET_PATTERNS) if (pattern.test(node)) hits.push({kind:'secret-shaped',path});
        return;
    }
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {node.forEach((item,i)=>scan(item,'',hits,`${path}[${i}]`));return;}
    for (const [key,value] of Object.entries(node)) scan(value,key,hits,`${path}.${key}`);
}

function shapeErrors(value) {
    const errors=[];
    try {
        const serialized=JSON.stringify(value);
        if (!serialized || Buffer.byteLength(serialized)>1024*1024) return ['artifact exceeds bounded JSON shape'];
        // Accept JSON values only, including no cycles, undefined or custom instances.
        if (canonical(JSON.parse(serialized))!==canonical(value)) return ['artifact must be JSON'];
    } catch { return ['artifact must be bounded JSON']; }
    const exact=(x,required,optional=[])=>x && typeof x==='object' && !Array.isArray(x) && required.every(k=>Object.hasOwn(x,k)) && Object.keys(x).every(k=>[...required,...optional].includes(k));
    const str=x=>typeof x==='string' && x.length<=256;
    if (!exact(value,['artifact','configuration','requiredCapabilities','destinationBindings','pages','notes']) || typeof value.notes!=='string') return ['artifact fields invalid; required: artifact, configuration, requiredCapabilities, destinationBindings, pages, notes'];
    const e=value.artifact;
    if (!exact(e,['kind','exportSchema','templateId','templateVersion','createdAt','source']) || !Number.isSafeInteger(e.templateVersion) || e.templateVersion<1 || !str(e.source) || (e.createdAt!==null && (!str(e.createdAt)||!Number.isFinite(Date.parse(e.createdAt))))) errors.push('artifact envelope invalid');
    if (!Array.isArray(value.destinationBindings)||value.destinationBindings.length>100||value.destinationBindings.some(x=>!str(x))) errors.push('destinationBindings invalid');
    if (!Array.isArray(value.requiredCapabilities)||value.requiredCapabilities.length>16||value.requiredCapabilities.some(x=>!exact(x,['id','required','resolveVia'],['note'])||!['sql.datasource','storage.object','publication.runtime'].includes(x.id)||typeof x.required!=='boolean'||!str(x.resolveVia)||(x.note!==undefined&&!str(x.note)))) errors.push('capabilities invalid');
    if (Array.isArray(value.requiredCapabilities) && (!value.requiredCapabilities.some(x=>x?.id==='sql.datasource' && x.required===true) || new Set(value.requiredCapabilities.map(x=>x?.id)).size!==value.requiredCapabilities.length)) errors.push('required SQL capability declaration invalid');
    if (!Array.isArray(value.pages)||!value.pages.length||value.pages.length>7) return [...errors,'pages invalid'];
    for(const page of value.pages) {
        if(!exact(page,['role','slug','name','layout'],['title'])||!str(page.slug)||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)||!str(page.name)||!page.name||!str(page.role)||(page.title!==undefined&&!str(page.title))||!page.layout||!Array.isArray(page.layout.content)) errors.push('page fields invalid');
        const visit=(nodes,depth,ids)=>{
            if(depth>32||!Array.isArray(nodes)||nodes.length>5000){errors.push('layout bounds invalid');return;}
            for(const node of nodes){if(!node||typeof node!=='object'||typeof node.id!=='string'||!node.id||ids.has(node.id)||ids.size>=5000){errors.push('layout identity invalid');continue;}ids.add(node.id);if(node.props?.templateNodeId!==undefined&&node.props.templateNodeId!==node.id)errors.push('template identity invalid');if(node.children!==undefined)visit(node.children,depth+1,ids);}
        };
        if(page?.layout?.content)visit(page.layout.content,0,new Set());
    }
    return errors;
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
    const validation = validateTemplateArtifact(artifact);
    if (!validation.ok) throw new Error(`export_refused_invalid_artifact: ${validation.errors.join(' | ')}`);
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
    const structural = shapeErrors(artifact);
    if (structural.length) return {ok:false,errors:structural,warnings,readiness:[]};
    if (!artifact || typeof artifact !== 'object') return { ok: false, errors: ['artifact is not an object'], warnings, readiness: [] };
    const envelope = artifact.artifact ?? {};
    if (envelope.kind !== EXPORT_KIND) errors.push('artifact.kind must be frontbase-template-export');
    if (envelope.exportSchema !== EXPORT_SCHEMA_VERSION) errors.push(`artifact.exportSchema must be ${EXPORT_SCHEMA_VERSION}`);
    if (envelope.templateId !== 'education-directory') errors.push('artifact.templateId must be education-directory (the only template identity the current schema accepts)');

    const parsed = directoryConfigurationSchema.safeParse(artifact.configuration);
    if (!parsed.success) {
        errors.push(`configuration fails the framework schema: ${parsed.error.issues.map(i => i.path.join('.') || 'configuration').join(', ')}`);
    } else {
        if (parsed.data.site.origin) errors.push('configuration.site.origin must be empty for export');
        for (const collection of Object.values(parsed.data.collections)) if (collection.scope.value !== '') errors.push('configuration scope.value must be destination-bound');
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
        if (!sitePageReferenceSchema.safeParse(page.layout?.root?.siteConfiguration).success || page.layout.root.siteConfiguration.role!==page.role) {
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
    const report = { upgraded: [], preservedCustomized: [], preservedOwnerTopLevel: [], added: [], preservedDeleted: [], preservedRemoved: [], removed: [] };
    const errors = [];
    const isTemplate = node => typeof node?.props?.templateNodeId === 'string';

    const walk = node => {
        if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
        const baseline = previous.get(node.id);
        const liveNode = live.get(node.id);
        if (baseline && !liveNode) { report.preservedDeleted.push(node.id); return null; }
        if (!baseline && liveNode) { errors.push(`new-node-id-collision:${node.id}`); return structuredClone(liveNode); }
        if (baseline && liveNode && canonical(liveNode) !== canonical(baseline)) {
            report.preservedCustomized.push(node.id);
            return structuredClone(liveNode); // whole owner subtree preserved
        }
        if (!baseline) { report.added.push(node.id); return structuredClone(node); }
        if (!isTemplate(node)) { report.upgraded.push(node.id); return structuredClone(node); }
        report.upgraded.push(node.id);
        const out = structuredClone(node);
        if (Array.isArray(node.children)) out.children = node.children.map(walk).filter(Boolean);
        return out;
    };

    const content = nextLayout.content.map(walk).filter(Boolean);
    for (const top of liveTop) {
        if (isTemplate(top) || previous.has(top.id)) {
            if (!nextTopIds.has(top.id)) {
                const baseline=previous.get(top.id);
                if (!baseline || canonical(top)!==canonical(baseline)) {
                    content.push(structuredClone(top));report.preservedRemoved.push(top.id);
                } else report.removed.push(top.id);
            }
            continue;
        }
        if (!previousTopIds.has(top.id) && !nextTopIds.has(top.id)) {
            content.push(structuredClone(top));
            report.preservedOwnerTopLevel.push(top.id ?? '(unnamed)');
        }
    }
    // An owner reordered template roots: do not silently undo it with next-version order.
    const baselineOrder=(previousLayout.content??[]).filter(n=>isTemplate(n)&&live.has(n.id)).map(n=>n.id);
    const liveOrder=liveTop.filter(n=>isTemplate(n)&&previousTopIds.has(n.id)).map(n=>n.id);
    if (canonical(baselineOrder)!==canonical(liveOrder)) errors.push('owner-order-needs-review');
    // Never return a partially merged proposal that callers might apply despite a conflict.
    const layout=errors.length?structuredClone(liveLayout):{root:structuredClone(liveLayout.root??nextLayout.root),content};
    return {layout,report,errors};
}

function subtreeIdsList(nodes) {
    const ids = [];
    for (const node of nodes ?? []) ids.push(...subtreeIds(node, []));
    return ids;
}
