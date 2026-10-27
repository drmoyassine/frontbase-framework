/** Host-independent bootstrap transaction. This module is called only after owner authorization.
 * No DB, filesystem, provider SDK, HTTP endpoint or credential persistence is implied. */
import { validateDeploymentManifest, type DeploymentManifest, type DeploymentTarget } from './deployment.js';
export type BootstrapPhase = 'reviewed' | 'applying' | 'uncertain' | 'active';
export interface BootstrapContext { installationId: string; target: DeploymentTarget; destination: string; }
export interface BootstrapRecord extends BootstrapContext {
    version: 1; revision: number; operationId: string; phase: BootstrapPhase;
    fingerprint: string; manifest: DeploymentManifest;
}
/** Must be durable across host instances and implement atomic compare-and-swap.
 * An in-memory Map is suitable only for tests, never a hosted installation. */
export interface BootstrapJournal {
    read(context: BootstrapContext): Promise<BootstrapRecord | null>;
    compareAndSwap(context: BootstrapContext, expectedRevision: number | null, next: BootstrapRecord): Promise<boolean>;
}
export interface BootstrapProof { operationId: string; fingerprint: string; healthy: boolean; bootstrapDisabled: boolean; }
export interface BootstrapExecutor {
    /** Read-only capability/context/empty-target checks. Must reject installed destinations. */
    preflight(context: BootstrapContext, manifest: DeploymentManifest): Promise<void>;
    /** Persist settings and activate the host; secrets are scoped to this invocation only. */
    apply(record: BootstrapRecord, credentials: Readonly<Record<string,string>>): Promise<void>;
    /** Read actual deployment state. Never retries writes or initializes state. */
    inspect(record: BootstrapRecord): Promise<BootstrapProof | null>;
}
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function fail(): never {throw Error('bootstrap_operation_refused');}
function contextValid(c: BootstrapContext): void {
    if(!uuid.test(c.installationId)||!['cloudflare','vercel','docker'].includes(c.target)||!c.destination||c.destination.length>256||!/^[A-Za-z0-9_./:-]+$/.test(c.destination))fail();
}
function canonical(value: unknown): string {
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    if(value && typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
    return JSON.stringify(value);
}
async function fingerprint(context: BootstrapContext, manifest: DeploymentManifest): Promise<string> {
    const bytes=new TextEncoder().encode(canonical({context,manifest}));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
function cleanManifest(input: unknown, target: DeploymentTarget): DeploymentManifest {
    const result=validateDeploymentManifest(input);if(!result.ready||result.manifest.target!==target)fail();
    const manifest=structuredClone(result.manifest);
    for(const binding of Object.values(manifest.bindings))if(binding.mode==='disabled'){binding.config={};binding.secretRefs={};delete binding.resourceRef;}
    return manifest;
}
async function checkedRead(journal: BootstrapJournal, context: BootstrapContext): Promise<BootstrapRecord|null> {
    const record=await journal.read(context);if(!record)return null;
    if(record.version!==1||record.installationId!==context.installationId||record.target!==context.target||record.destination!==context.destination||!uuid.test(record.operationId)||!Number.isSafeInteger(record.revision)||record.revision<0||!['reviewed','applying','uncertain','active'].includes(record.phase))fail();
    const manifest=cleanManifest(record.manifest,context.target);
    if(await fingerprint(context,manifest)!==record.fingerprint)fail();
    return structuredClone(record);
}
/** Creates or replaces an unexecuted review. Cannot revive an active/uncertain installation. */
export async function reviewBootstrap(context: BootstrapContext,input: unknown,journal: BootstrapJournal,executor: BootstrapExecutor): Promise<BootstrapRecord> {
    contextValid(context);const manifest=cleanManifest(input,context.target);
    const prior=await checkedRead(journal,context);if(prior&&prior.phase!=='reviewed')fail();
    await executor.preflight(context,structuredClone(manifest));
    const next: BootstrapRecord={...context,version:1,revision:(prior?.revision??-1)+1,operationId:crypto.randomUUID(),phase:'reviewed',manifest,fingerprint:await fingerprint(context,manifest)};
    if(!await journal.compareAndSwap(context,prior?.revision??null,structuredClone(next)))fail();
    return structuredClone(next);
}
function validateCredentials(manifest: DeploymentManifest, credentials: Record<string,string>): void {
    if(!credentials||typeof credentials!=='object'||Array.isArray(credentials))fail();
    const refs=new Set(Object.values(manifest.bindings).filter(b=>b.mode!=='disabled').flatMap(b=>Object.values(b.secretRefs)));
    if(Object.keys(credentials).length!==refs.size||Object.keys(credentials).some(k=>!refs.has(k))||[...refs].some(k=>typeof credentials[k]!=='string'||!credentials[k]||credentials[k].length>16384))fail();
}
async function verified(record: BootstrapRecord, executor: BootstrapExecutor): Promise<boolean> {
    const proof=await executor.inspect(structuredClone(record));
    return !!proof&&proof.operationId===record.operationId&&proof.fingerprint===record.fingerprint&&proof.healthy===true&&proof.bootstrapDisabled===true;
}
/** Exactly one journal claimant may dispatch. Any unproven outcome is retained, not retried. */
export async function applyBootstrap(context: BootstrapContext,reviewId: string,credentials: Record<string,string>,journal: BootstrapJournal,executor: BootstrapExecutor): Promise<BootstrapRecord> {
    contextValid(context);const record=await checkedRead(journal,context);
    if(!record||record.phase!=='reviewed'||record.operationId!==reviewId)fail();
    validateCredentials(record.manifest,credentials);
    await executor.preflight(context,structuredClone(record.manifest));
    const applying: BootstrapRecord={...record,revision:record.revision+1,phase:'applying'};
    if(!await journal.compareAndSwap(context,record.revision,structuredClone(applying)))fail();
    let healthy=false;
    try {await executor.apply(structuredClone(applying),Object.freeze({...credentials}));healthy=await verified(applying,executor);}catch{/* Provider payloads must not escape as errors or receipt data. */}
    const next: BootstrapRecord={...applying,revision:applying.revision+1,phase:healthy?'active':'uncertain'};
    if(!await journal.compareAndSwap(context,applying.revision,structuredClone(next)))fail();
    return next;
}
/** Reconciliation is read-only at the provider; a successful response alone is insufficient. */
export async function reconcileBootstrap(context: BootstrapContext,journal: BootstrapJournal,executor: BootstrapExecutor): Promise<BootstrapRecord> {
    contextValid(context);const record=await checkedRead(journal,context);
    if(!record||!['applying','uncertain'].includes(record.phase))fail();
    let healthy=false;try{healthy=await verified(record,executor);}catch{/* preserve uncertainty */}
    if(!healthy)return record;
    const next: BootstrapRecord={...record,revision:record.revision+1,phase:'active'};
    if(!await journal.compareAndSwap(context,record.revision,structuredClone(next)))fail();
    return next;
}
