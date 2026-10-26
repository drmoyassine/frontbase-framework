import {z} from 'zod';
import {contextReader,evaluateCondition,parseCondition,type ConditionInput,type Condition} from './conditions.js';
import {renderSync,bindingContext,isSimpleInterpolation} from './liquid-core/sync.js';
import type {PageLayoutData} from './ssr/types.js';
import {conditionPrefix} from './conditions.js';

const text=z.string().max(4000).refine(value=>!value.includes('{%')&&isSimpleInterpolation(value),'Use text and field bindings');
export const templatePatchSchema=z.object({
    title:text.optional(),description:text.optional(),socialTitle:text.optional(),socialDescription:text.optional(),image:text.optional(),
    indexing:z.enum(['index','noindex']).optional(),listed:z.boolean().optional(),
    notice:text.optional(),noticeTone:z.enum(['info','warning']).optional(),ctaLabel:text.optional(),ctaHref:text.optional(),
}).strict();
export type TemplatePatch=z.infer<typeof templatePatchSchema>;
const localized=z.object({values:templatePatchSchema,locales:z.record(templatePatchSchema).optional()}).strict();
const routeCondition=(node:Condition):boolean=>{
    if('all'in node)return node.all.every(routeCondition);
    if('any'in node)return node.any.every(routeCondition);
    return [node.left,node.right].every(value=>!value||value.kind!=='variable'||/^(record\.|page\.(?!settings(?:\.|$)))/.test(value.path));
};
const condition=z.custom<ConditionInput>(value=>{const parsed=parseCondition(value as ConditionInput);return !!parsed&&routeCondition(parsed);});
export const templatePolicySchema=z.object({schemaVersion:z.literal(1),defaults:localized,
    rules:z.array(z.object({id:z.string().min(1).max(100),name:z.string().min(1).max(100),when:condition,settings:localized}).strict()).max(100),
    overrides:z.record(localized),
    attachedRoutes:z.array(z.object({source:z.string().regex(/^pages:[^\s:]{1,128}$/),recordId:z.union([z.string().min(1).max(128),z.number().int().positive()]),parentId:z.union([z.string().min(1).max(128),z.number().int().positive()]).optional()}).strict()).max(2000).optional(),
}).strict().superRefine((value,ctx)=>{
    if(Object.keys(value.overrides).length>20000||JSON.stringify(value).length>140000)ctx.addIssue({code:'custom',message:'Template settings are too large'});
    if(new Set(value.rules.map(rule=>rule.id)).size!==value.rules.length)ctx.addIssue({code:'custom',message:'Duplicate rule'});
    for(const key of Object.keys(value.overrides))if(!/^(institutions|programs|articles|pages):[^\s:]{1,128}$/.test(key))ctx.addIssue({code:'custom',message:'Invalid record identity'});
    for(const settings of [value.defaults,...value.rules.map(rule=>rule.settings),...Object.values(value.overrides)])
        for(const locale of Object.keys(settings.locales??{}))if(!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale))ctx.addIssue({code:'custom',message:'Invalid language'});
});
export type TemplatePolicy=z.infer<typeof templatePolicySchema>;
export const emptyTemplatePolicy=():TemplatePolicy=>({schemaVersion:1,defaults:{values:{}},rules:[],overrides:{}});
/** A starter is ordinary editable elements, not a runtime notice component. */
export function withTemplateNotice(layout:PageLayoutData):PageLayoutData {
    if(JSON.stringify(layout.content).includes('page.settings.notice'))return layout;
    const notice={id:crypto.randomUUID(),type:'Container',props:{},styles:{width:'100%',maxWidth:'1200px',padding:'16px 24px',margin:'16px auto',backgroundColor:'#eff6ff',color:'#1e3a8a',border:'1px solid #bfdbfe',borderRadius:'12px'},
        visibilityCondition:conditionPrefix+JSON.stringify({left:{kind:'variable',path:'page.settings.notice'},operator:'is_set'}),
        versions:[{id:crypto.randomUUID(),name:'Warning',when:{left:{kind:'variable' as const,path:'page.settings.noticeTone'},operator:'eq' as const,right:{kind:'literal' as const,value:'warning'}},overrides:{styles:{backgroundColor:'#fffbeb',color:'#78350f',border:'1px solid #fde68a'}}}],
        children:[{id:crypto.randomUUID(),type:'Text',props:{content:'{{ page.settings.notice }}'},styles:{margin:'0',lineHeight:'1.6'}}]};
    const index=layout.content.findIndex(node=>node.type==='Navbar')+1;
    return {...layout,content:[...layout.content.slice(0,index),notice,...layout.content.slice(index)]};
}
export function readTemplatePolicy(root:Record<string,unknown>|undefined):TemplatePolicy {
    return root?.templatePolicy===undefined?emptyTemplatePolicy():templatePolicySchema.parse(root.templatePolicy);
}
export function resolveTemplatePolicy(policy:TemplatePolicy,identity:string,locale:string,record:Record<string,unknown>,page:Record<string,unknown>={}) {
    const apply=(settings:TemplatePolicy['defaults']|undefined)=>({...settings?.values,...settings?.locales?.[locale]});
    const rule=policy.rules.find(rule=>evaluateCondition(rule.when,contextReader({record,page})));
    const override=policy.overrides[identity];
    const values:TemplatePatch={...apply(policy.defaults),...apply(rule?.settings),...apply(override)};
    const resolved:TemplatePatch={...values};
    for(const key of ['title','description','socialTitle','socialDescription','image','notice','ctaLabel','ctaHref'] as const){
        const value=values[key];if(value!==undefined)resolved[key]=renderSync(value,bindingContext({record,page}));
    }
    // Links remain configurable Actions inputs, never executable protocols.
    for(const key of ['image','ctaHref'] as const)if(resolved[key]&&!/^(https?:\/\/|\/(?!\/)|mailto:|tel:|#)/i.test(resolved[key]!))resolved[key]='';
    return {values:resolved,origin:override?'Record override':rule?rule.name:'Template defaults',ruleId:rule?.id??null};
}
