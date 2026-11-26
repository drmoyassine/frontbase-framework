import type {PageLayoutData} from '@frontbase/edge-core';
import {z} from 'zod';
import {homepageDisplayFields,homepageDisplayLayout,localizationScopeSchema,translationUnitId,
    type DisplayField,type DisplaySurfacePlan,type LocalizationScope,type MessageUnit} from '@frontbase/edge-core/localization';

export type LiveDisplayField=DisplayField&{menu?:{menuId:string;path:string[]}};

/** Same stable resource identities as the existing page/record/menu translation writer. */
function displayResource(field:LiveDisplayField,pageId:string):MessageUnit['resource']{
    return field.menu
        ?{kind:'component' as const,documentId:'app-menus',blockId:field.menu.menuId,versionId:'default',propertyPath:field.menu.path}
        :field.record
        ?{kind:'record' as const,connectionId:field.record.connectionId,collection:field.record.collection,key:field.record.key,propertyPath:[field.fieldKey??field.path.at(-1)??'']}
        :{kind:'component' as const,documentId:pageId,blockId:field.blockId,versionId:field.versionId??'default',propertyPath:field.identityPath??field.path};
}
export function displayTranslationUnit(field:LiveDisplayField,scope:LocalizationScope,pageId:string,sourceLocale:string):MessageUnit{
    return {version:1,scope,resource:displayResource(field,pageId),sourceLocale,format:'plain',text:field.text,segmenterVersion:1,placeholders:[]};
}

export const translationIdentityPlanSchema=z.object({
    version:z.literal(1),scope:localizationScopeSchema,pageId:z.string().min(1),
    entries:z.array(z.tuple([z.string(),z.string().regex(/^[a-f0-9]{64}$/)])).max(500),
}).strict();
export type TranslationIdentityPlan=z.infer<typeof translationIdentityPlanSchema>;

export const displayFieldKey=(field:DisplayField)=>JSON.stringify([field.blockId,field.versionId??'default',field.path]);
const preparedMaps=new WeakMap<TranslationIdentityPlan,ReadonlyMap<string,string>>();
export function preparedTranslationIds(plan:TranslationIdentityPlan|undefined,scope:LocalizationScope,pageId:string){
    if(!plan||plan.pageId!==pageId||plan.scope.tenantId!==scope.tenantId||plan.scope.projectId!==scope.projectId)return;
    let entries=preparedMaps.get(plan);
    if(!entries){entries=new Map(plan.entries);preparedMaps.set(plan,entries);}
    return entries;
}

/** Persist only the canonical identity hashes. The running request still inventories
 * visible fields, reads current heads and compares the current source text. */
export async function compileTranslationIds(layout:PageLayoutData,displayPlan:DisplaySurfacePlan,scope:LocalizationScope,pageId:string):Promise<TranslationIdentityPlan|undefined>{
    let fields:DisplayField[];
    try{fields=homepageDisplayFields(homepageDisplayLayout(layout),displayPlan);}
    catch(error){
        // The authored shape can contain a larger fallback than the realized layout.
        // This optional optimization must not introduce a new publication refusal.
        if(error instanceof Error&&['locale_surface_limit','locale_text_limit'].includes(error.message))return;
        throw error;
    }
    const entries=await Promise.all(fields.filter(field=>!field.record).map(async(field):Promise<[string,string]|null>=>{
        try{return [displayFieldKey(field),await translationUnitId(scope,displayResource(field,pageId))];}
        catch(error){if(error instanceof z.ZodError)return null;throw error;}
    }));
    const valid=entries.filter(entry=>entry!==null);
    return valid.length?translationIdentityPlanSchema.parse({version:1,scope,pageId,entries:valid}):undefined;
}
