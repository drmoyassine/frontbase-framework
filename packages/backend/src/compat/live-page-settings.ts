import type {DbRunner} from '@frontbase/edge-infra';
import {BOOKING_PALETTE_KEY} from './booking-site-palette.js';

/** One current read for independent page settings. The result lives for this
 * request only; existing stores still validate hashes, schemas and ownership. */
export async function livePageSettings(db:DbRunner,owner:string,keys:string[]):Promise<DbRunner>{
    if(!owner||keys.length>5)throw Error('page_settings_scope_invalid');
    const selected=[...new Set(keys)];
    if(selected.some(key=>!['project','frontend_copy:active:v1','translation_storage:v1',BOOKING_PALETTE_KEY].includes(key)&&!/^app_menus:publication:v1:[a-f0-9]{64}$/.test(key)))throw Error('page_settings_key_invalid');
    const rows=selected.length?await db.query(`SELECT key,value FROM settings WHERE tenant_slug = ? AND key IN (${selected.map(()=>'?').join(',')})`,[owner,...selected]):[];
    const values=new Map<string,unknown>();
    for(const row of rows){const key=String(row.key);if(!selected.includes(key)||values.has(key))throw Error('page_settings_response_invalid');values.set(key,row.value);}
    return {dialect:db.dialect,
        query:async(sql,params)=>{
            if(/^SELECT value FROM settings WHERE tenant_slug\s*=\s*\? AND key\s*=\s*\?$/.test(sql)&&params?.length===2&&params[0]===owner&&selected.includes(String(params[1]))){
                const key=String(params[1]);return values.has(key)?[{value:values.get(key)}]:[];
            }
            return db.query(sql,params);
        },
        exec:()=>Promise.reject(Error('page_settings_read_only')),
    };
}
