import {signatureSql,type RenderProof} from './prerender-delivery.js';
type Check=RenderProof['checks'][number];
type Reader=(sql:string,params:unknown[])=>Promise<Record<string,unknown>[]>;
/** Conservative sitemap fence: any setting change invalidates the output.
 * Only the exact known settings-only reads may be replaced by this superset.
 */
export async function compactSettingsProof(checks:Check[],owner:string,overrides:Record<string,string>,read:Reader):Promise<{check:Check;baseline:Check}>{
    for(const check of checks){
        const sql=check.sql.replace(/\s+/g,' ').trim();
        if(check.params[0]!==owner||!/^SELECT (?:value|key|key, ?value|COUNT\(\*\) AS n) FROM settings WHERE tenant_slug ?= ?\? AND (?:key ?= ?\?|key IN \(\?(?:,\?)*\)|key >= \? AND key < \?|key LIKE \?|\(key LIKE \? OR key LIKE \?\))(?: ORDER BY key)?(?: LIMIT (?:1|\?)(?: OFFSET \?)?)?$/.test(sql))throw Error('Unrecognized sitemap dependency');
    }
    if(Object.entries(overrides).some(([key,value])=>!/^translation_(?:homepage|surface):active:v1:/.test(key)||typeof value!=='string'))throw Error('Invalid prospective locale pointer');
    const sql='SELECT key,value FROM settings WHERE tenant_slug = ? AND key <> ? ORDER BY key COLLATE "C"',params=[owner,'site_publication:active:v1'];
    const baseline=String((await read(signatureSql(sql),params))[0]?.signature??'');
    const replacements=JSON.stringify(overrides);
    const projected='SELECT key,value FROM (SELECT key,value FROM settings WHERE tenant_slug = ? AND key <> ? AND key NOT IN (SELECT key FROM jsonb_each_text(?::jsonb)) UNION ALL SELECT key,value FROM jsonb_each_text(?::jsonb)) projected ORDER BY key COLLATE "C"';
    const signature=String((await read(signatureSql(projected),[...params,replacements,replacements]))[0]?.signature??'');
    if(!/^[a-f0-9]{64}$/.test(baseline)||!/^[a-f0-9]{64}$/.test(signature))throw Error('Sitemap signature unavailable');
    return {check:{sql,params,signature},baseline:{sql,params,signature:baseline}};
}
