import type {DbRunner} from '@frontbase/edge-infra';
import {stableStringify} from '@frontbase/compiler/manifest';
import {menuDocumentSchema,type MenuDocument} from '@frontbase/edge-core/menus';
import {publicationHash} from './publication-hash.js';
/** Private immutable menu definitions. Captured page layouts carry only their digest. */
export class MenusSnapshotStore {
    constructor(private db:DbRunner,private owner:string){if(!owner)throw Error('menus_owner_required');}
    async get(hash:string):Promise<MenuDocument|null>{
        if(!/^[a-f0-9]{64}$/.test(hash))throw Error('menus_reference_invalid');
        const rows=await this.db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?',[this.owner,`app_menus:publication:v1:${hash}`]);
        if(!rows.length)return null;
        try{const document=menuDocumentSchema.parse(JSON.parse(String(rows[0]!.value)));if(await publicationHash(document)!==hash)throw Error();return document;}catch{throw Error('menus_snapshot_unavailable');}
    }
    async prepare(input:MenuDocument,now:string):Promise<string>{
        const document=menuDocumentSchema.parse(input),hash=await publicationHash(document);
        await this.db.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING',[this.owner,`app_menus:publication:v1:${hash}`,stableStringify(document),now]);
        if(!await this.get(hash))throw Error('menus_snapshot_unavailable');
        return hash;
    }
}
