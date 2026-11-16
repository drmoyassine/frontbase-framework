import type {PageLayoutData} from '@frontbase/edge-core';
import {homepageDisplayLayout,homepageDisplayFields,applyHomepageDisplayFields,translationUnitId,translationUnitIdForScope,messageSourceFingerprint,messageSourceFingerprintFromFields,
    type CurrentTranslationValue,type DisplaySurfacePlan,type DisplayField,type MessageUnit,type LocalizationScope,type TranslationBatchReader} from '@frontbase/edge-core/localization';
import {translationDisplayText} from './translation-inputs.js';
import type {DbRunner} from '@frontbase/edge-infra';
import {TranslationLifecycle} from '@frontbase/edge-core/localization';
import {configuredTranslationStorage,type TranslationStorageHost} from './translation-storage.js';
import {displayFieldKey,displayTranslationUnit,preparedTranslationIds,type LiveDisplayField,type TranslationIdentityPlan} from './live-translation-identities.js';

export {displayTranslationUnit,type LiveDisplayField} from './live-translation-identities.js';

const identityIds=new Map<string,string>();

/** Bounded current-head read. No page release, capture hash, pinned revision or saved text fallback.
 * Source edits immediately invalidate stale translations while retaining their history in storage. */
export async function localizeLiveLayout(input:PageLayoutData,options:{
    scope:LocalizationScope;pageId:string;sourceLocale:string;locale:string;
    reader:Pick<TranslationBatchReader,'readMany'|'readCurrentMany'|'readCurrentHeads'|'resolveUnitIdsByResources'>;menuFields?:LiveDisplayField[];plan?:DisplaySurfacePlan;identityPlan?:TranslationIdentityPlan;
    resolvedFields?:(fields:LiveDisplayField[])=>void;
}):Promise<PageLayoutData>{
    const layout=homepageDisplayLayout(input);
    if(options.locale===options.sourceLocale)return layout;
    const menuFields=options.menuFields??[];
    let fields:LiveDisplayField[]=homepageDisplayFields(layout,options.plan);
    if(menuFields.length){
        const claimed=new Set(menuFields.map(field=>JSON.stringify([field.blockId,field.path])));
        fields=fields.filter(field=>!claimed.has(JSON.stringify([field.blockId,field.path]))).concat(menuFields);
    }
    if(fields.length>500)throw Error('live_translation_surface_limit');
    if(!fields.length){options.resolvedFields?.(fields);return layout;}
    const prepared=preparedTranslationIds(options.identityPlan,options.scope,options.pageId);
    let unitIdFor:ReturnType<typeof translationUnitIdForScope>|undefined;
    const groups=new Map<string,number|number[]>();
    const group=(id:string,index:number)=>{
        const existing=groups.get(id);
        if(existing===undefined)groups.set(id,index);
        else if(typeof existing==='number')groups.set(id,[existing,index]);
        else existing.push(index);
    };
    // Identities needing resolution, deduplicated per raw resource. Cache identities
    // only; current source and translated text stay request-local.
    const unresolved=new Map<string,{key:string;resource:ReturnType<typeof displayTranslationUnit>['resource'];indexes:number[]}>();
    for(const [index,field] of fields.entries()){
        const compiled=!field.menu&&!field.record&&prepared?.get(displayFieldKey(field));
        if(compiled){group(compiled,index);continue;}
        const unit = displayTranslationUnit(field, options.scope, options.pageId, options.sourceLocale);
        const key = JSON.stringify([options.scope, unit.resource]);
        const cached = identityIds.get(key);
        if (cached){group(cached,index);continue;}
        const entry=unresolved.get(key);
        if(entry)entry.indexes.push(index);
        else unresolved.set(key,{key,resource:unit.resource,indexes:[index]});
    }
    if(unresolved.size){
        const entries=[...unresolved.values()];
        // Server-side resolution avoids per-field WebCrypto hashing on every fresh
        // isolate; readers without the port keep the ordinary client-side identity.
        const ids=options.reader.resolveUnitIdsByResources
            ?await options.reader.resolveUnitIdsByResources(options.scope,entries.map(entry=>entry.resource))
            :await Promise.all(entries.map(entry=>(unitIdFor??=translationUnitIdForScope(options.scope))(entry.resource)));
        if(ids.length!==entries.length)throw Error('live_translation_response_invalid');
        for(const [i,entry] of entries.entries()){
            const id=ids[i]!;
            if (identityIds.size >= 2048) identityIds.delete(identityIds.keys().next().value!);
            identityIds.set(entry.key,id);
            for(const index of entry.indexes)group(id,index);
        }
    }
    const ids=[...groups.keys()];
    let heads:Map<string,CurrentTranslationValue>;
    if(options.reader.readCurrentHeads)heads=await options.reader.readCurrentHeads(options.scope,ids,options.locale);
    else{
        // The compatibility adapter still uses ordered slots. Condense them once.
        const rows=await (options.reader.readCurrentMany?.(options.scope,ids,options.locale)??options.reader.readMany(options.scope,ids,options.locale));
        if(rows.length!==ids.length)throw Error('live_translation_response_invalid');
        heads=new Map();
        for(const [index,row] of rows.entries())if(row.head&&row.source)heads.set(ids[index]!,row);
    }
    if(!heads.size){options.resolvedFields?.(fields);return layout;}
    const values = new Map<string, string>();
    const translated:DisplayField[]=[];
    const resolved=options.resolvedFields&&fields.slice();
    const patchWork:Promise<void>[]=[];
    for (const [id,{head,source}] of heads) {
        const indexes=groups.get(id);
        if(indexes===undefined||!head||!source)throw Error('live_translation_response_invalid');
        if (head.scope.tenantId !== options.scope.tenantId || head.scope.projectId !== options.scope.projectId
            || source.unit.scope.tenantId !== options.scope.tenantId || source.unit.scope.projectId !== options.scope.projectId
            || head.unitId !== id || head.locale !== options.locale) throw Error('live_translation_scope_mismatch');
        if (head.sourceFingerprint !== source.fingerprint || head.sourceVersion !== source.sourceVersion
            || head.contextFingerprint !== source.contextFingerprint) continue;
        // Matching occurrences of the same unit can share the current source proof.
        const fingerprints=new Map<string,Promise<string>>();
        for(const index of typeof indexes==='number'?[indexes]:indexes){
            const field=fields[index]!;
            let fingerprint=fingerprints.get(field.text);
            if(!fingerprint){
                // Identity was validated above (or compiled in the verified
                // publication); freshness depends only on these current fields.
                fingerprint=messageSourceFingerprintFromFields({sourceLocale:options.sourceLocale,format:'plain',text:field.text,segmenterVersion:1,placeholders:[]});
                fingerprints.set(field.text,fingerprint);
            }
            patchWork.push(fingerprint.then(current=>{
                if(current!==source.fingerprint)return;
                const text=translationDisplayText(field.text,head.text);
                translated.push(field);
                values.set(displayFieldKey(field),text);
                if(resolved)resolved[index]={...field,text};
            }));
        }
    }
    if (patchWork.length) await Promise.all(patchWork);
    if(resolved)options.resolvedFields?.(resolved);
    return values.size?applyHomepageDisplayFields(layout,values,{partial:true,fields:translated}):layout;
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
