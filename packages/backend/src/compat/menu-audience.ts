import {z} from 'zod';
import type {VerifiedMenuAudience} from '@frontbase/edge-core/menus';

const identifier=z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/).max(100);
const accountId=z.string().min(1).max(200);
const definition=z.record(z.string().max(200));
const configuration=z.object({
    enabled:z.literal(true),authDataSourceId:accountId,contactsDbId:accountId.optional(),contactsTable:identifier,
    columnMapping:z.object({authUserIdColumn:identifier,contactTypeColumn:identifier,permissionLevelColumn:identifier}).passthrough(),
    contactTypes:definition,permissionLevels:definition,
}).passthrough();
export interface MenuAudienceAccount {provider:string;config:Record<string,unknown>;}
/** All ports are host/server-owned and owner-bound; browser assertions are never an input. */
export interface MenuAudiencePorts {
    account(owner:string,id:string):Promise<MenuAudienceAccount|null>;
    verify(account:MenuAudienceAccount,token:string):Promise<{id:string}|null>;
    contacts(owner:string,account:MenuAudienceAccount,query:{table:string;authColumn:string;authId:string;columns:string[];limit:2}):Promise<Record<string,unknown>[]>;
}
const anonymous=():VerifiedMenuAudience=>({authenticated:false});
/** Resolve only the two mapped attributes for a provider-verified app user.
 * No admin principal, decoded JWT claims, email join or client-provided roles. */
export async function resolveMenuAudience(owner:string,usersConfig:unknown,token:string|null,ports:MenuAudiencePorts):Promise<VerifiedMenuAudience>{
    const parsed=configuration.safeParse(usersConfig);
    if(!owner||!parsed.success||!token||token.length>16384||/[\s\x00-\x1f]/.test(token))return anonymous();
    try{
        const cfg=parsed.data,auth=await ports.account(owner,cfg.authDataSourceId);
        if(!auth)return anonymous();
        const identity=await ports.verify(auth,token);
        if(!identity||!z.string().uuid().safeParse(identity.id).success)return anonymous();
        const result:VerifiedMenuAudience={authenticated:true};
        const contacts=cfg.contactsDbId&&cfg.contactsDbId!==cfg.authDataSourceId?await ports.account(owner,cfg.contactsDbId):auth;
        if(!contacts)return result;
        const mapping=cfg.columnMapping;
        const rows=await ports.contacts(owner,contacts,{table:cfg.contactsTable,authColumn:mapping.authUserIdColumn,authId:identity.id,columns:[...new Set([mapping.contactTypeColumn,mapping.permissionLevelColumn])],limit:2});
        // Ambiguous contact ownership must never select an arbitrary role.
        if(rows.length!==1)return result;
        const row=rows[0]!,key=(value:unknown)=>typeof value==='string'?value:typeof value==='number'&&Number.isSafeInteger(value)?String(value):undefined;
        const type=key(row[mapping.contactTypeColumn]),level=key(row[mapping.permissionLevelColumn]);
        if(type!==undefined&&Object.hasOwn(cfg.contactTypes,type))result.contactType=type;
        if(level!==undefined&&Object.hasOwn(cfg.permissionLevels,level))result.permissionLevel=level;
        return result;
    }catch{return anonymous();}
}
