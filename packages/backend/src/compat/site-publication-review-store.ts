import type { DbRunner } from '@frontbase/edge-infra';
import { sitePublicationReviewRequestSchema,sitePublicationReviewSchema,type SitePublicationPointer } from '@frontbase/edge-core/directory/publication';
import { SitePublicationStore } from './site-publication-store.js';

/** Private review and guarded internal activation of exact immutable captures. No HTTP activation endpoint. */
export class SitePublicationReviewStore {
    constructor(private db:DbRunner,private tenant:string) { if(!tenant)throw new Error('publication_owner_required'); }
    private key(hash:string) { return `site_publication:review:v1:${hash}`; }
    async get(hash:string) {
        if(!await new SitePublicationStore(this.db,this.tenant).get(hash))return null;
        const rows=await this.db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?',[this.tenant,this.key(hash)]);
        if(!rows.length)return null;
        try {const review=sitePublicationReviewSchema.parse(JSON.parse(String(rows[0]!.value)));if(review.hash!==hash)throw new Error();return review;}
        catch {throw new Error('publication_review_unavailable');}
    }
    async approve(input:unknown,reviewer:string,now:string) {
        const request=sitePublicationReviewRequestSchema.parse(input);
        if(!await new SitePublicationStore(this.db,this.tenant).get(request.hash))throw new Error('publication_unavailable');
        const review=sitePublicationReviewSchema.parse({schemaVersion:1,...request,reviewer,reviewedAt:now});
        const changed=await this.db.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING',
            [this.tenant,this.key(request.hash),JSON.stringify(review),now]);
        if(changed!==0 && changed!==1)throw new Error('publication_write_result_invalid');
        return changed===1?review:null;
    }
    /** Activation and rollback require the target's own review; neither inherits the current site's approval. */
    async activate(hash:string,expected:SitePublicationPointer|null,now:string) {
        if(!await this.get(hash))throw new Error('publication_review_required');
        return new SitePublicationStore(this.db,this.tenant).activate(hash,expected,now);
    }
}
