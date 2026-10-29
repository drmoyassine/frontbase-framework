/** Data-only deployment contracts shared by setup UI and deploy tooling. No credentials or SDKs. */
import { z } from 'zod';

export const deploymentTargets = ['cloudflare', 'vercel', 'docker'] as const;
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
const both: readonly DeploymentTarget[] = ['cloudflare', 'vercel', 'docker'];
/** Inventory-backed adapters. Native wiring not yet accepted remains a recommendation only. */
export const deploymentAdapters: readonly DeploymentAdapter[] = [
    {id:'sqlite-file',role:'state-db',targets:['docker'],selectable:true,modes:['connect'],configKeys:[],secretKeys:[]},
    {id:'cloudflare-d1',role:'state-db',targets:['cloudflare'],selectable:true,modes:['create','reuse'],configKeys:['resourceName'],secretKeys:[]},
    {id:'turso-marketplace',role:'state-db',targets:['vercel'],selectable:true,modes:['reuse'],configKeys:[],secretKeys:[]},
    {id:'libsql-http',role:'state-db',targets:both,selectable:true,modes:['connect'],configKeys:['url'],secretKeys:['token'],requiredConfig:['url'],requiredSecrets:['token']},
    {id:'d1-http',role:'state-db',targets:both,selectable:true,modes:['connect'],configKeys:['accountId','databaseId'],secretKeys:['token'],requiredConfig:['accountId','databaseId'],requiredSecrets:['token']},
    // Connect routes exist today: a PostgREST HTTPS endpoint (self-hosted Postgres without wire reachability,
    // via the CF-20 supabaseRunner transport) or wire connection parts whose credentials stay in secrets.
    // Provisioned create/reuse of frontbase_edge_* schemas register with the apply-time executor, not before.
    // Schema identifiers stay lowercase: postgresStateRunner refuses other quoting-sensitive names at boot.
    {id:'supabase-postgres',role:'state-db',targets:both,selectable:true,modes:['connect'],configKeys:['url','schema','host','port','database'],secretKeys:['token','username','password']},
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
        'state-db':target === 'docker' ? choice('sqlite-file','connect') : target === 'cloudflare' ? choice('cloudflare-d1','create',{resourceName:`frontbase-state-${environment}`}) : choice('libsql-http','connect'),
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
        if(adapter.id==='supabase-postgres'&&binding.mode==='connect'){
            const postgrest=!!binding.config.url,wire=!!binding.config.host;
            // Exactly one transport: a PostgREST HTTPS endpoint, or wire parts whose credentials stay in secrets.
            // A credential-bearing postgres:// DSN never enters the manifest (the generic url check refuses it too).
            if(postgrest===wire)issues.push({role,code:'state_transport_required'});
            if(postgrest&&(binding.config.database||binding.config.port||binding.secretRefs.username||binding.secretRefs.password))issues.push({role,code:'state_transport_conflict'});
            if(postgrest&&!binding.secretRefs.token)issues.push({role,field:'token',code:'missing_secret_reference'});
            if(wire){
                if(!binding.config.database?.trim())issues.push({role,field:'database',code:'missing_config'});
                if(!binding.secretRefs.username)issues.push({role,field:'username',code:'missing_secret_reference'});
                if(!binding.secretRefs.password)issues.push({role,field:'password',code:'missing_secret_reference'});
                if(binding.secretRefs.token)issues.push({role,code:'state_transport_conflict'});
                if(!/^[a-zA-Z0-9][a-zA-Z0-9.:-]{0,252}[a-zA-Z0-9]$/.test(binding.config.host))issues.push({role,field:'host',code:'invalid_host'});
                const port=Number(binding.config.port??'5432');
                if(!Number.isInteger(port)||port<1||port>65535)issues.push({role,field:'port',code:'invalid_port'});
            }
            if(binding.config.schema&&!/^[a-z_][a-z0-9_]{0,62}$/.test(binding.config.schema))issues.push({role,field:'schema',code:'invalid_schema'});
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

/** Project only verified managed native bindings into runtime metadata; never include credentials. */
export function managedRuntimeManifest(manifest: DeploymentManifest, resources: Record<string,{id?:string;name:string}>): DeploymentManifest {
    const result=structuredClone(manifest);
    for(const role of configurableRoles) {
        const binding=result.bindings[role];
        if(binding.mode==='disabled'){binding.config={};binding.secretRefs={};delete binding.resourceRef;continue;}
        if(binding.mode==='connect')continue;
        const key=role==='state-db'?'database':role;
        const resource=resources[key];
        if(!resource)throw new Error('missing_managed_resource_identity');
        binding.mode='reuse';binding.resourceRef=resource.id??resource.name;binding.secretRefs={};
    }
    const safe=readManagedRuntimeManifest(result);
    if(!safe)throw new Error('invalid_managed_runtime_manifest');
    return safe;
}
/** Reject unsupported/credential-shaped host metadata rather than returning arbitrary environment values. */
export function readManagedRuntimeManifest(input: unknown): DeploymentManifest | null {
    try {
        const value=typeof input==='string'?(input.length<=32768?JSON.parse(input):null):input;
        const parsed=validateDeploymentManifest(value);
        if(!parsed.ready)return null;
        if(parsed.manifest.target==='vercel' || parsed.manifest.target==='docker') {
            for(const binding of Object.values(parsed.manifest.bindings)) {
                if(binding.mode==='disabled') {if(Object.keys(binding.config).length||Object.keys(binding.secretRefs).length||binding.resourceRef)return null;continue;}
                if(binding.adapterId==='turso-marketplace') {if(binding.mode!=='reuse'||!/^store_[a-zA-Z0-9]+$/.test(binding.resourceRef??'')||Object.keys(binding.config).length||Object.keys(binding.secretRefs).length)return null;continue;}
                if(binding.mode!=='connect'||binding.resourceRef)return null;
            }
            return parsed.manifest;
        }
        for(const role of configurableRoles) {
            const binding=parsed.manifest.bindings[role];
            if(binding.mode==='connect'){if(binding.resourceRef)return null;continue;}
            if(Object.keys(binding.secretRefs).length || Object.keys(binding.config).some(k=>k!=='resourceName'))return null;
            if(binding.mode==='disabled'){if(Object.keys(binding.config).length || binding.resourceRef)return null;continue;}
            const nativeAdapters:Partial<Record<ConfigurableRole,string>>={'state-db':'cloudflare-d1',cache:'cloudflare-kv',storage:'cloudflare-r2'};
            const expected=nativeAdapters[role];
            if(!expected || binding.adapterId!==expected || binding.mode!=='reuse' || !(role==='storage'?/^[a-z0-9][a-z0-9-]{0,62}$/:/^[A-Za-z0-9_][A-Za-z0-9_. -]{0,127}$/).test(binding.config.resourceName??''))return null;
            if(role==='state-db'&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(binding.resourceRef??''))return null;
            if(role==='cache'&&!/^[a-f0-9]{32}$/.test(binding.resourceRef??''))return null;
            if(role==='storage'&&binding.resourceRef!==binding.config.resourceName)return null;
        }
        return parsed.manifest;
    } catch {return null;}
}
export function reviewDeploymentManifest(current: DeploymentManifest, proposed: unknown) {
    const next=validateDeploymentManifest(proposed);
    if(!next.ready)return {ready:false as const,issues:next.issues};
    if(next.manifest.target!==current.target || next.manifest.environment!==current.environment)return {ready:false as const,issues:[{code:'deployment_scope_changed'}]};
    const canonical=(binding:BindingSelection)=>JSON.stringify({...binding,config:Object.fromEntries(Object.entries(binding.config).sort()),secretRefs:Object.fromEntries(Object.entries(binding.secretRefs).sort())});
    const changedRoles=configurableRoles.filter(role=>canonical(current.bindings[role])!==canonical(next.manifest.bindings[role]));
    const migrationRequired=stateBindingChanged(current,next.manifest);
    return {ready:true as const,applied:false as const,executable:false as const,changedRoles,migrationRequired,status:!changedRoles.length?'unchanged':migrationRequired?'migration_required':'deployment_required',operations:next.operations};
}
