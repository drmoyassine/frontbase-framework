/** Private example contract proof. Reads trusted destination facts; performs NO writes. */
import { createHash } from 'node:crypto';
import { stripLayoutEnrichment } from '@frontbase/backend';
import { validateTemplateArtifact, nodeFingerprint, evaluateCapabilities } from './artifact.mjs';
import { bindConfiguration, bindDetailPaths } from './install.mjs';

const hash = value => createHash('sha256').update(nodeFingerprint(value)).digest('hex');
const reject = code => { const error = new Error(code); error.code=code; throw error; };
export const layoutHash = layout => hash(stripLayoutEnrichment(layout));

/**
 * receipt MUST be read from server-owned durable state, never an import payload.
 * owner/datasources/revision/pages are authenticated destination facts.
 * This example does not supply an HTTP adapter or safe cross-driver transaction.
 */
export function planInstall({artifact,bindings,detailSamplePaths,destination,receipt=null}) {
    const validated=validateTemplateArtifact(artifact);
    if(!validated.ok) reject('artifact-invalid');
    if(!destination || typeof destination.owner!=='string' || !destination.owner || !Array.isArray(destination.pages) ||
        !Array.isArray(destination.datasources) || !Number.isSafeInteger(destination.revision) || destination.revision<0) reject('destination-unavailable');
    const datasource=destination.datasources.find(x=>x.id===bindings?.datasourceId && x.owner===destination.owner);
    const capability=evaluateCapabilities(artifact,{
        sqlDatasourceKinds: datasource && ['sqlite','supabase','postgres','neon','turso','d1'].includes(datasource.kind)?[datasource.kind]:[],
        objectStorageKinds:destination.objectStorageKinds??[],publicationRuntime:destination.publicationRuntime===true,
    });
    if(!capability.ok) reject('destination-capability-missing');
    const configuration=bindConfiguration(artifact,bindings);
    const pages=bindDetailPaths(artifact,detailSamplePaths);
    const planHash=hash({artifact,configuration,pages});
    const conflicts=[];
    if(receipt) {
        if(receipt.schemaVersion!==1 || receipt.owner!==destination.owner || receipt.planHash!==planHash || !Array.isArray(receipt.pages) || receipt.pages.length>7 ||
            (receipt.configurationRevision!==null && (!Number.isSafeInteger(receipt.configurationRevision)||receipt.configurationRevision<1)) ||
            !['partial','complete','uncertain'].includes(receipt.phase)) reject('receipt-mismatch');
        if(receipt.phase==='uncertain' || receipt.intent) return {planHash,blocked:true,reason:'outcome-needs-reconciliation',actions:[]};
    }
    const knownPages=new Map();
    for(const known of receipt?.pages??[]) {
        if(!pages.some(p=>p.slug===known.slug) || typeof known.id!=='string' || !known.id || knownPages.has(known.slug) || !/^[a-f0-9]{64}$/.test(known.layoutHash)) reject('receipt-mismatch');
        knownPages.set(known.slug,known);
    }
    let configurationAction='create';
    if(receipt?.configurationRevision!==null && receipt?.configurationRevision!==undefined) {
        if(destination.revision!==receipt.configurationRevision || hash(destination.configuration)!==hash(configuration)) conflicts.push('configuration-changed');
        configurationAction='keep';
    } else if(destination.revision!==0 || destination.configuration!==null) conflicts.push('configuration-already-exists');
    const actions=[];
    const existingIds=new Set(),existingSlugs=new Set();
    for(const row of destination.pages) {
        if(!row.id || !row.slug || typeof row.isPublished!=='boolean' || typeof row.deleted!=='boolean' || existingIds.has(row.id) || existingSlugs.has(row.slug)) reject('destination-unavailable');
        existingIds.add(row.id);existingSlugs.add(row.slug);
    }
    for(const page of pages) {
        const current=destination.pages.find(p=>p.slug===page.slug);
        const known=knownPages.get(page.slug);
        if(known) {
            if(!current || current.id!==known.id || known.layoutHash!==layoutHash(page.layout) ||
                layoutHash(current.layoutData)!==known.layoutHash || current.name!==page.name || current.title!==(page.title??page.name) ||
                current.isPublished || current.deleted) conflicts.push(`owned-page-changed:${page.slug}`);
            actions.push({kind:'keep',slug:page.slug,id:known.id});
        } else if(current) {
            // Matching bytes do not prove this operation created a page.
            conflicts.push(`unowned-page-collision:${page.slug}`);
        } else actions.push({kind:'create',slug:page.slug,page});
    }
    for(const route of [configuration.routes.directory,configuration.routes.blog]) {
        if((destination.reservedRoutes??[]).includes(route)) conflicts.push('reserved-route-collision');
    }
    if(receipt?.phase==='complete' && (configurationAction!=='keep' || actions.some(x=>x.kind!=='keep'))) reject('receipt-incomplete');
    return {planHash,blocked:conflicts.length>0,conflicts,configurationAction,configuration,actions};
}

/** Fresh private receipt creation is a proposal, not proof of any completed write. */
export function initialReceipt(plan,owner) {
    if(plan.blocked) reject('install-blocked');
    return {schemaVersion:1,owner,planHash:plan.planHash,phase:'partial',configurationRevision:null,pages:[]};
}
