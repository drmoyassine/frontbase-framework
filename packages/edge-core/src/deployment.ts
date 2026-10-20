/** Data-only deployment contracts shared by setup UI and deploy tooling. No credentials or SDKs. */
import { z } from 'zod';

export const deploymentTargets = ['cloudflare', 'vercel'] as const;
export type DeploymentTarget = typeof deploymentTargets[number];
export const bindingRoles = ['state-db', 'content-data', 'cache', 'http-cache', 'storage', 'vector', 'queue', 'workflow', 'scheduler', 'coordination', 'email-send', 'email-receive', 'ai-text', 'embeddings', 'ai-gateway', 'secrets', 'rate-limit', 'bot-verification', 'observability', 'assets', 'internal-service'] as const;
export type BindingRole = typeof bindingRoles[number];
export const configurableRoles = ['state-db', 'cache', 'storage', 'vector', 'queue', 'email-send'] as const;
export type ConfigurableRole = typeof configurableRoles[number];
const ref = z.string().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/);
export const bindingSelectionSchema = z.object({
    adapterId: ref,
    mode: z.enum(['create', 'reuse', 'connect', 'disabled']),
    resourceRef: ref.optional(),
    config: z.record(z.string().max(2048)).default({}),
    secretRefs: z.record(ref).default({}),
}).strict();
export type BindingSelection = z.infer<typeof bindingSelectionSchema>;
export const deploymentManifestSchema = z.object({
    version: z.literal(1),
    target: z.enum(deploymentTargets),
    environment: z.enum(['preview', 'production']),
    profileVersion: z.literal(1),
    bindings: z.object({
        'state-db': bindingSelectionSchema,
        cache: bindingSelectionSchema,
        storage: bindingSelectionSchema,
        vector: bindingSelectionSchema,
        queue: bindingSelectionSchema,
        'email-send': bindingSelectionSchema,
    }).strict(),
}).strict();
export type DeploymentManifest = z.infer<typeof deploymentManifestSchema>;
export interface DeploymentAdapter {
    id: string;
    role: ConfigurableRole;
    targets: readonly DeploymentTarget[];
    /** Existing runtime route, not product availability or a future implementation claim. */
    selectable: boolean;
    modes: readonly BindingSelection['mode'][];
    configKeys: readonly string[];
    secretKeys: readonly string[];
    requiredConfig?: readonly string[];
    requiredSecrets?: readonly string[];
}
const both: readonly DeploymentTarget[] = ['cloudflare', 'vercel'];
/** Inventory-backed adapters. Native wiring not yet accepted remains a recommendation only. */
export const deploymentAdapters: readonly DeploymentAdapter[] = [
    {id:'cloudflare-d1',role:'state-db',targets:['cloudflare'],selectable:true,modes:['create','reuse'],configKeys:['resourceName'],secretKeys:[]},
    {id:'libsql-http',role:'state-db',targets:both,selectable:true,modes:['connect'],configKeys:['url'],secretKeys:['token'],requiredConfig:['url'],requiredSecrets:['token']},
    {id:'d1-http',role:'state-db',targets:both,selectable:true,modes:['connect'],configKeys:['accountId','databaseId'],secretKeys:['token'],requiredConfig:['accountId','databaseId'],requiredSecrets:['token']},
    {id:'cloudflare-kv',role:'cache',targets:['cloudflare'],selectable:true,modes:['create','reuse'],configKeys:['resourceName'],secretKeys:[]},
    {id:'upstash-http',role:'cache',targets:both,selectable:true,modes:['connect'],configKeys:['url'],secretKeys:['token'],requiredConfig:['url'],requiredSecrets:['token']},
    {id:'cloudflare-r2',role:'storage',targets:['cloudflare'],selectable:true,modes:['create','reuse'],configKeys:['resourceName'],secretKeys:[]},
    {id:'s3-http',role:'storage',targets:both,selectable:true,modes:['connect'],configKeys:['endpoint','region','bucket'],secretKeys:['accessKeyId','secretAccessKey'],requiredConfig:['endpoint','bucket'],requiredSecrets:['accessKeyId','secretAccessKey']},
    {id:'cloudflare-vectorize-http',role:'vector',targets:both,selectable:true,modes:['connect'],configKeys:['accountId','indexName'],secretKeys:['token'],requiredConfig:['accountId','indexName'],requiredSecrets:['token']},
    {id:'libsql-vector-http',role:'vector',targets:both,selectable:true,modes:['connect'],configKeys:['url'],secretKeys:['token'],requiredConfig:['url'],requiredSecrets:['token']},
    {id:'qstash-http',role:'queue',targets:both,selectable:true,modes:['connect'],configKeys:['destination'],secretKeys:['token','signingKey','nextSigningKey'],requiredConfig:['destination'],requiredSecrets:['token','signingKey','nextSigningKey']},
    {id:'cloudflare-email',role:'email-send',targets:['cloudflare'],selectable:false,modes:['reuse'],configKeys:['from'],secretKeys:[]},
];
export function adaptersFor(target: DeploymentTarget, role: ConfigurableRole): readonly DeploymentAdapter[] {
    return deploymentAdapters.filter(a => a.selectable && a.role === role && a.targets.includes(target));
}
function choice(adapterId: string, mode: BindingSelection['mode'], config: Record<string,string> = {}): BindingSelection {
    return { adapterId, mode, config, secretRefs: {} };
}
/** Suggestions do not imply provisioning or validated readiness. */
export function defaultDeploymentManifest(target: DeploymentTarget, environment: DeploymentManifest['environment'] = 'preview'): DeploymentManifest {
    return {version:1,target,environment,profileVersion:1,bindings:{
        'state-db':target === 'cloudflare' ? choice('cloudflare-d1','create',{resourceName:`frontbase-state-${environment}`}) : choice('libsql-http','connect'),
        cache:choice(target === 'cloudflare' ? 'cloudflare-kv' : 'upstash-http',target === 'cloudflare' ? 'create' : 'disabled',target === 'cloudflare' ? {resourceName:`frontbase-cache-${environment}`} : {}),
        storage:choice(target === 'cloudflare' ? 'cloudflare-r2' : 's3-http','disabled'),
        vector:choice('cloudflare-vectorize-http','disabled'),
        queue:choice('qstash-http','disabled'),
        'email-send':choice('cloudflare-email','disabled'),
    }};
}
export interface DeploymentIssue { role?: ConfigurableRole; code: string; field?: string; }
export interface DeploymentPlan { manifest: DeploymentManifest; ready: true; issues: DeploymentIssue[]; operations: Array<{role:ConfigurableRole;adapterId:string;mode:BindingSelection['mode'];resourceRef?:string}>; }
/** Only opaque field identifiers leave validation; rejected input values never enter errors. */
export function validateDeploymentManifest(input: unknown): DeploymentPlan | {ready:false;issues:DeploymentIssue[];operations:[]} {
    const parsed=deploymentManifestSchema.safeParse(input);
    if(!parsed.success) return {ready:false,issues:[{code:'invalid_manifest'}],operations:[]};
    const manifest=parsed.data;
    const issues:DeploymentIssue[]=[];
    const operations:DeploymentPlan['operations']=[];
    for(const role of configurableRoles) {
        const binding=manifest.bindings[role];
        if(binding.mode === 'disabled') {
            if(role === 'state-db') issues.push({role,code:'required_binding_disabled'});
            // Disabled fields never produce provisioning or resolve any secret.
            continue;
        }
        const adapter=deploymentAdapters.find(a=>a.id===binding.adapterId && a.role===role);
        if(!adapter || !adapter.targets.includes(manifest.target)) {issues.push({role,code:'incompatible_adapter'});continue;}
        if(!adapter.selectable) {issues.push({role,code:'adapter_not_ready'});continue;}
        if(!adapter.modes.includes(binding.mode)) issues.push({role,code:'unsupported_mode'});
        for(const key of Object.keys(binding.config)) if(!adapter.configKeys.includes(key)) issues.push({role,code:'unknown_config_field'});
        for(const key of Object.keys(binding.secretRefs)) if(!adapter.secretKeys.includes(key)) issues.push({role,code:'unknown_secret_field'});
        for(const field of adapter.requiredConfig??[]) if(!binding.config[field]?.trim()) issues.push({role,field,code:'missing_config'});
        for(const field of adapter.requiredSecrets??[]) if(!binding.secretRefs[field]) issues.push({role,field,code:'missing_secret_reference'});
        if(binding.mode==='reuse' && !binding.resourceRef) issues.push({role,code:'missing_resource_reference'});
        if(binding.mode==='create' && !binding.config.resourceName?.trim()) issues.push({role,code:'missing_resource_name'});
        for(const field of ['url','endpoint','destination']) {
            const raw=binding.config[field]; if(!raw)continue;
            try { const url=new URL(raw);const libsql=field==='url' && ['libsql-http','libsql-vector-http'].includes(adapter.id);
                if((url.protocol!=='https:' && !(libsql && url.protocol==='libsql:')) || url.username || url.password || url.hash || url.search)
                    issues.push({role,field,code:'invalid_public_endpoint'});
            } catch {issues.push({role,field,code:'invalid_public_endpoint'});}
        }
        operations.push({role,adapterId:adapter.id,mode:binding.mode,...(binding.resourceRef?{resourceRef:binding.resourceRef}:{})});
    }
    if(issues.length) return {ready:false,issues,operations:[]};
    return {manifest,ready:true,issues,operations};
}
/** Whole binding replacement avoids accidentally retaining the previous provider's credentials. */
export function resolveDeploymentManifest(target: DeploymentTarget, saved?: DeploymentManifest, overrides: Partial<Record<ConfigurableRole,BindingSelection>> = {}): DeploymentManifest {
    if(saved && saved.target!==target) throw new Error('deployment_target_mismatch');
    const base=saved??defaultDeploymentManifest(target);
    const result=deploymentManifestSchema.safeParse({...base,bindings:{...base.bindings,...overrides}});
    if(!result.success) throw new Error('invalid_deployment_manifest');
    return result.data;
}
/** A different state target needs migration; profile upgrades never move data automatically. */
export function stateBindingChanged(before: DeploymentManifest, after: DeploymentManifest): boolean {
    const canonical=(b:BindingSelection)=>JSON.stringify({adapterId:b.adapterId,mode:b.mode,resourceRef:b.resourceRef??null,config:Object.fromEntries(Object.entries(b.config).sort(([a],[c])=>a.localeCompare(c)))});
    return before.target!==after.target || canonical(before.bindings['state-db'])!==canonical(after.bindings['state-db']);
}
