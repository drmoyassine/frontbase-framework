import type { DbRunner } from '@frontbase/edge-infra';
import {menuDocumentSchema,emptyMenuDocument,type MenuDocument} from '@frontbase/edge-core/menus';
const KEY='app_menus:v1';
export class MenusStore {
    constructor(private db:DbRunner,private owner:string){}
    private async read():Promise<{raw:string;document:MenuDocument}|null>{
        const rows=await this.db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?',[this.owner,KEY]);
        if(!rows.length)return null;try{const raw=String(rows[0]!.value);return{raw,document:menuDocumentSchema.parse(JSON.parse(raw))};}catch{throw Error('menus_unavailable');}
    }
    async get():Promise<MenuDocument>{return(await this.read())?.document??emptyMenuDocument();}
    async save(menus:MenuDocument['menus'],expectedRevision:number,now:string):Promise<MenuDocument|null>{
        const prior=await this.read();if((prior?.document.revision??0)!==expectedRevision)return null;
        const document=menuDocumentSchema.parse({schemaVersion:1,revision:expectedRevision+1,menus});const raw=JSON.stringify(document);
        const changed=prior?await this.db.exec('UPDATE settings SET value = ?, updated_at = ? WHERE tenant_slug = ? AND key = ? AND value = ?',[raw,now,this.owner,KEY,prior.raw]):await this.db.exec('INSERT INTO settings (tenant_slug, key, value, updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug, key) DO NOTHING',[this.owner,KEY,raw,now]);
        return changed===1?document:null;
    }
}
