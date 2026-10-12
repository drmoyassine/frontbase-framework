import type { DbRunner } from '@frontbase/edge-infra';
import { stableStringify } from '@frontbase/compiler/manifest';
import type { SitePublicationManifest } from './site-publication-manifest.js';
import type { PublicationChunk } from './site-publication-chunks.js';
import { SitePublicationManifestStore } from './site-publication-manifest.js';
import { EditorialApprovalStore } from './editorial-approval-store.js';

/** The exact immutable approval is required; a revision number alone is not approval. */
export async function verifyManifestEditorial(db:DbRunner,owner:string,manifest:SitePublicationManifest,rows?:Record<string,unknown>[]):Promise<void>{
    const approvals=new EditorialApprovalStore(db,owner),store=new SitePublicationManifestStore(db,owner);
    const draft={schemaVersion:1 as const,revision:manifest.configurationRevision,configuration:manifest.configuration};
    const cache=new Map<string,Promise<PublicationChunk>>();
    const entries=new Map(manifest.index.filter(row=>['articles','pages'].includes(row.collection)).map(row=>[JSON.stringify([row.id,row.originalPath]),row]));
    const refs=new Map((manifest.approvals??[]).map(ref=>[JSON.stringify([ref.id,ref.contentRole,ref.revision]),ref]));
    const targets:Record<string,unknown>[]=rows ?? manifest.index.filter(row=>['articles','pages'].includes(row.collection));
    for(const target of targets){
        const entry=entries.get(JSON.stringify([target.id,target.originalPath]));
        if(!entry)continue;
        const role=entry.collection==='pages'?'page':'article';
        const ref=refs.get(JSON.stringify([entry.id,role,entry.revision]));
        if(!ref)throw new Error('publication_approval_unavailable');
        const snapshot=await approvals.snapshot(ref.id,ref.revision,draft,ref.fingerprint);
        if(!snapshot || (snapshot.contentRole??'article')!==role)throw new Error('publication_approval_unavailable');
        const chunkRef=manifest.chunks.find(value=>value.hash===entry.chunkHash)!;
        if(target.body===undefined && !cache.has(chunkRef.hash))cache.set(chunkRef.hash,store.loadChunk(manifest,chunkRef));
        const record=target.body!==undefined?target:(await cache.get(chunkRef.hash)!).records[entry.position]!;
        const expected={id:snapshot.id,revision:snapshot.revision,title:snapshot.title,originalPath:snapshot.originalPath,summary:snapshot.excerpt,body:snapshot.body,
            cover:snapshot.coverUrl,coverAlt:snapshot.coverAlt,logo:null,language:snapshot.language,byline:snapshot.byline,publishedAt:snapshot.publishedAt};
        if(stableStringify(record)!==stableStringify(expected))throw new Error('publication_approval_unavailable');
    }
}
