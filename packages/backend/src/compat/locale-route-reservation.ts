import {z} from 'zod';
import type {DbRunner} from '@frontbase/edge-infra';

const locale=z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
/** Active-locale keys reserve their route prefix for the translation router: homepage keys end in
 *  the locale, surface keys place it after the surface hash — the last colon segment either way.
 *  Key existence is the reservation signal on purpose (it never depends on release readability). */
export async function publishedLocaleRoutes(db:DbRunner,tenant:string):Promise<string[]>{
    const rows=await db.query('SELECT key FROM settings WHERE tenant_slug = ? AND (key LIKE ? OR key LIKE ?)',[tenant,'translation_homepage:active:v1:%','translation_surface:active:v1:%']);
    const locales=new Set<string>();
    for(const row of rows){const found=locale.safeParse(String(row.key).split(':').pop()??'');if(found.success)locales.add(found.data);}
    return [...locales];
}
/** A source publication path or redirect endpoint under a live locale prefix would silently change
 *  meaning once that locale activates (the router intercepts every /{locale}/… URL first), so source
 *  admission refuses them instead of creating an ambiguity that only surfaces after activation. */
export async function assertOutsidePublishedLocaleRoutes(db:DbRunner,tenant:string,paths:string[]):Promise<void>{
    const locales=await publishedLocaleRoutes(db,tenant);
    for(const path of paths){
        let route:string;try{route=decodeURIComponent(path).replace(/\/$/,'')||'/';}catch{continue;}
        if(locales.some(target=>route===`/${target}`||route.startsWith(`/${target}/`)))throw new Error('publication_locale_route_reserved');
    }
}
