import type {PageLayoutData} from '@frontbase/edge-core';
import {homepageDisplayLayout,homepageDisplayFields,applyHomepageDisplayFields,translationUnitId,messageSourceFingerprint,
    type DisplayField,type MessageUnit,type LocalizationScope,type TranslationBatchReader} from '@frontbase/edge-core/localization';
import {translationDisplayText} from './translation-inputs.js';
import type {DbRunner} from '@frontbase/edge-infra';
import {TranslationLifecycle} from '@frontbase/edge-core/localization';
import {configuredTranslationStorage,type TranslationStorageHost} from './translation-storage.js';

const identityIds=new Map<string,string>();

export type LiveDisplayField=DisplayField&{menu?:{menuId:string;path:string[]}};
/** Same stable resource identities as the existing page/record/menu translation writer. */
export function displayTranslationUnit(field:LiveDisplayField,scope:LocalizationScope,pageId:string,sourceLocale:string):MessageUnit{
    const resource=field.menu
        ?{kind:'component' as const,documentId:'app-menus',blockId:field.menu.menuId,versionId:'default',propertyPath:field.menu.path}
        :field.record
        ?{kind:'record' as const,connectionId:field.record.connectionId,collection:field.record.collection,key:field.record.key,propertyPath:[field.fieldKey??field.path.at(-1)??'']}
        :{kind:'component' as const,documentId:pageId,blockId:field.blockId,versionId:field.versionId??'default',propertyPath:field.path};
    return {version:1,scope,resource,sourceLocale,format:'plain',text:field.text,segmenterVersion:1,placeholders:[]};
}

/** Bounded current-head read. No page release, capture hash, pinned revision or saved text fallback.
 * Source edits immediately invalidate stale translations while retaining their history in storage. */
export async function localizeLiveLayout(input:PageLayoutData,options:{
    scope:LocalizationScope;pageId:string;sourceLocale:string;locale:string;
    reader:Pick<TranslationBatchReader,'readMany'>;menuFields?:LiveDisplayField[];
}):Promise<PageLayoutData>{
    const layout=homepageDisplayLayout(input);
    if(options.locale===options.sourceLocale)return layout;
    const menuFields=options.menuFields??[],claimed=new Set(menuFields.map(field=>JSON.stringify([field.blockId,field.path])));
    const fields=[...homepageDisplayFields(layout).filter(field=>!claimed.has(JSON.stringify([field.blockId,field.path]))),...menuFields];
    if(fields.length>500)throw Error('live_translation_surface_limit');
    const identified=await Promise.all(fields.map(async field=>{
        const unit=displayTranslationUnit(field,options.scope,options.pageId,options.sourceLocale);
        // Identities contain scope and resource keys only, never text or translation values.
        const key=JSON.stringify([options.scope,unit.resource]);
        let id=identityIds.get(key);
        if(!id){
            id=await translationUnitId(options.scope,unit.resource);
            if(identityIds.size>=2048)identityIds.delete(identityIds.keys().next().value!);
            identityIds.set(key,id);
        }
        return {field,id,unit};
    }));
    const ids=[...new Set(identified.map(field=>field.id))];
    const rows=ids.length?await options.reader.readMany(options.scope,ids,options.locale):[];
    if(rows.length!==ids.length)throw Error('live_translation_response_invalid');
    const byId=new Map(ids.map((id,index)=>[id,rows[index]!]));
    const values=new Map<string,string>();
    await Promise.all(identified.map(async({field,id,unit})=>{
        const current=byId.get(id),source=current?.source,head=current?.head;
        if(!head||!source)return;
        if(head.scope.tenantId!==options.scope.tenantId||head.scope.projectId!==options.scope.projectId
            ||source.unit.scope.tenantId!==options.scope.tenantId||source.unit.scope.projectId!==options.scope.projectId
            ||head.unitId!==id||head.locale!==options.locale)throw Error('live_translation_scope_mismatch');
        const fingerprint=await messageSourceFingerprint(unit);
        if(source.fingerprint!==fingerprint||head.sourceFingerprint!==fingerprint||head.sourceVersion!==source.sourceVersion
            ||head.contextFingerprint!==source.contextFingerprint)return;
        values.set(JSON.stringify([field.blockId,field.versionId??'default',field.path]),translationDisplayText(field.text,head.text));
    }));
    return values.size?applyHomepageDisplayFields(layout,values,{partial:true}):layout;
}

/** Existing revision/CAS adapter, without creating or publishing a page catalog. */
export async function writeLiveRecordTranslations(host:TranslationStorageHost,db:DbRunner,owner:string,pageId:string,sourceLocale:string,locale:string,
    edits:{field:DisplayField;current:string;text:string}[],verifySource:()=>Promise<void>){
    if(locale===sourceLocale||!edits.length||edits.length>100||edits.some(edit=>!edit.field.record))throw Error('record_translation_request_invalid');
    const storage=await configuredTranslationStorage(host,db,owner),engine=new TranslationLifecycle(storage.persistence);
    const pending=new Map<string,{unit:MessageUnit;current:string;text:string;fingerprint:string}>();
    for(const edit of edits){
        const unit=displayTranslationUnit(edit.field,storage.scope,pageId,sourceLocale),id=await translationUnitId(storage.scope,unit.resource),fingerprint=await messageSourceFingerprint(unit);
        const text=translationDisplayText(edit.field.text,edit.text),prior=pending.get(id);
        if(prior&&(prior.text!==text||prior.fingerprint!==fingerprint||prior.current!==edit.current))throw Error('conflicting_record_translations');
        pending.set(id,{unit,current:edit.current,text,fingerprint});
    }
    const entries=await Promise.all([...pending].map(async([id,item])=>{
        const prior=await storage.persistence.read(storage.scope,id,locale);
        const fresh=prior.source?.fingerprint===item.fingerprint&&prior.head?.sourceFingerprint===item.fingerprint&&prior.head.sourceVersion===prior.source.sourceVersion&&prior.head.contextFingerprint===prior.source.contextFingerprint;
        const visible=fresh?translationDisplayText(item.unit.text,prior.head!.text):item.unit.text;
        if(visible!==item.current)throw Error('record_translation_changed');
        return {id,item,prior};
    }));
    await verifySource();
    for(const {item,prior} of entries){
        const source=await engine.syncSource(storage.scope,item.unit,prior.source?.sourceVersion??null,prior.source?.context??{version:1,role:'record-field'});
        if(source.status==='conflict')throw Error('record_source_changed');
        const result=await engine.writeManual(storage.scope,{version:1,unitId:source.unitId,locale,sourceVersion:source.sourceVersion,sourceFingerprint:source.sourceFingerprint,contextFingerprint:source.contextFingerprint,expectedHead:prior.head?.revisionId??null,revisionId:crypto.randomUUID(),text:item.text});
        if(result.status==='rejected')throw Error('record_translation_changed');
    }
    await verifySource();
}
