import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readTemplatePolicy,templatePolicySchema,withTemplateNotice} from '../../packages/edge-core/dist/template-policy.js';

/** Offline, explicit authoring conversion. No credentials, source writes or publication.
 * Input associations must be reconciled with the real datasource before use. */
export function upgradeTemplateRoutes(input){
    const layout=structuredClone(input.layout),role=layout.root?.siteConfiguration?.role;
    if(!['program','institution','article'].includes(role))throw Error('Reusable record template required');
    const old=readTemplatePolicy(layout.root),associations=input.associations??[];
    const routes=new Map((old.attachedRoutes??[]).map(route=>[route.source,route]));
    for(const route of associations){if(routes.has(route.source)&&JSON.stringify(routes.get(route.source))!==JSON.stringify(route))throw Error('Existing association differs');routes.set(route.source,route);}
    const policy={...old,defaults:{...old.defaults,values:{title:'{{ record.title }} · {{ page.siteName }}',description:'{{ record.summary }}',image:'{{ record.cover || record.logo }}',...old.defaults.values},...(input.seoLocales?{locales:{...input.seoLocales,...old.defaults.locales}}:{})},...(routes.size?{attachedRoutes:[...routes.values()]}:{})};
    if(associations.length){
        const sourceLocale=input.sourceLocale??'en';
        if(!input.notice?.[sourceLocale])throw Error('Explicit reviewed notice copy required');
        const locales=Object.fromEntries(Object.entries(input.notice).filter(([locale])=>locale!==sourceLocale).map(([locale,notice])=>[locale,{notice,...(input.ctaLabels?.[locale]?{ctaLabel:input.ctaLabels[locale]}:{})}]));
        const rule={id:'retained-route-notice-v1',name:'Retained listing · availability unconfirmed',when:{left:{kind:'variable',path:'page.attached'},operator:'eq',right:{kind:'literal',value:true}},settings:{values:{notice:input.notice[sourceLocale],noticeTone:'warning',listed:false,ctaLabel:input.ctaLabels?.[sourceLocale]??'Contact an adviser',ctaHref:input.ctaHref},locales}};
        if(!policy.rules.some(row=>row.id===rule.id))policy.rules=[rule,...policy.rules];
    }
    layout.root={...layout.root,templatePolicy:templatePolicySchema.parse(policy)};
    if(input.ctaNodeId){let found=false;
        const walk=nodes=>{for(const node of nodes){if(node.id===input.ctaNodeId){found=true;const actions=node.props?.actionBindings;if(!Array.isArray(actions)||!actions.some(action=>action.actionType==='openPage'))throw Error('Existing Open Page action required');
            if(!(node.versions??[]).some(version=>version.name==='Template action exception'))node.versions=[{id:crypto.randomUUID(),name:'Template action exception',when:{left:{kind:'variable',path:'page.settings.ctaHref'},operator:'is_set'},overrides:{props:{text:'{{ page.settings.ctaLabel || '+JSON.stringify(node.props.text??'Continue')+' }}',actionBindings:actions.map(action=>action.actionType==='openPage'?{...action,config:{...action.config,pageUrl:'{{ page.settings.ctaHref }}'}}:action)}}},...node.versions??[]];}
            if(node.children)walk(node.children);}};walk(layout.content);if(!found)throw Error('CTA element unavailable');
    }
    return associations.length?withTemplateNotice(layout):layout;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node template-route-upgrade.mjs input.json output.json');
    writeFileSync(output,JSON.stringify(upgradeTemplateRoutes(JSON.parse(readFileSync(input,'utf8')))));
}
