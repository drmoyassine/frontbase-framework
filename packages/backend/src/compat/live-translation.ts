import type {PageLayoutData} from '@frontbase/edge-core';
import {homepageDisplayLayout,homepageDisplayFields,applyHomepageDisplayFields,translationUnitId,translationUnitIdForScope,messageSourceFingerprint,messageSourceFingerprintFromFields,
    type CurrentTranslationValue,type DisplaySurfacePlan,type DisplayField,type MessageUnit,type LocalizationScope,type TranslationBatchReader} from '@frontbase/edge-core/localization';
import {translationDisplayText} from './translation-inputs.js';
import type {DbRunner} from '@frontbase/edge-infra';
import {translationContextFingerprint,validatePlainRevision,type PersistenceChange} from '@frontbase/edge-core/localization';
import {configuredTranslationStorage,type TranslationStorageHost} from './translation-storage.js';
import {displayFieldKey,displayTranslationUnit,preparedTranslationIds,type LiveDisplayField,type TranslationIdentityPlan} from './live-translation-identities.js';

export {displayTranslationUnit,type LiveDisplayField} from './live-translation-identities.js';

const identityIds=new Map<string,string>();

/** Bounded current-head read. No page release, capture hash, pinned revision or saved text fallback.
 * Source edits immediately invalidate stale translations while retaining their history in storage. */
export async function localizeLiveLayout(input:PageLayoutData,options:{
    scope:LocalizationScope;pageId:string;sourceLocale:string;locale:string;
    reader:Pick<TranslationBatchReader,'readMany'|'readCurrentMany'|'readCurrentHeads'>;menuFields?:LiveDisplayField[];plan?:DisplaySurfacePlan;identityPlan?:TranslationIdentityPlan;
    resolvedFields?:(fields:LiveDisplayField[])=>void;
}):Promise<PageLayoutData>{
    const layout=homepageDisplayLayout(input);
    if(options.locale===options.sourceLocale)return layout;
    const menuFields=options.menuFields??[];
    let fields:LiveDisplayField[]=homepageDisplayFields(layout,options.plan,{includeInlineRecordTitles:true});
    if(menuFields.length){
        const claimed=new Set(menuFields.map(field=>JSON.stringify([field.blockId,field.path])));
        fields=fields.filter(field=>!claimed.has(JSON.stringify([field.blockId,field.path]))).concat(menuFields);
    }
    if(fields.length>500)throw Error('live_translation_surface_limit');
    if(!fields.length){options.resolvedFields?.(fields);return layout;}
    const prepared=preparedTranslationIds(options.identityPlan,options.scope,options.pageId);
    const pendingIds = new Map<string, Promise<string>>();
    let unitIdFor:ReturnType<typeof translationUnitIdForScope>|undefined;
    const groups=new Map<string,number|number[]>();
    const group=(id:string,index:number)=>{
        const existing=groups.get(id);
        if(existing===undefined)groups.set(id,index);
        else if(typeof existing==='number')groups.set(id,[existing,index]);
        else existing.push(index);
    };
    const pendingFields:Promise<void>[]=[];
    for(const [index,field] of fields.entries()){
        const compiled=!field.menu&&!field.record&&prepared?.get(displayFieldKey(field));
        if(compiled){group(compiled,index);continue;}
        const unit = displayTranslationUnit(field, options.scope, options.pageId, options.sourceLocale);
        // Cache identities only. Current source and translated text stay request-local.
        const key = JSON.stringify([options.scope, unit.resource]);
        const cached = identityIds.get(key);
        if (cached){group(cached,index);continue;}
        let pending = pendingIds.get(key);
        if (!pending) {
            pending = (unitIdFor??=translationUnitIdForScope(options.scope))(unit.resource).then(id => {
                if (identityIds.size >= 2048) identityIds.delete(identityIds.keys().next().value!);
                identityIds.set(key, id);
                return id;
            });
            pendingIds.set(key, pending);
        }
        pendingFields.push(pending.then(id=>group(id,index)));
    }
    if(pendingFields.length)await Promise.all(pendingFields);
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

/** A transaction writes source history and translation heads for the entire editor selection. */
export async function writeLiveRecordTranslations(host:TranslationStorageHost,db:DbRunner,owner:string,pageId:string,sourceLocale:string,locale:string,
    edits:{field:DisplayField;current:string;text:string}[],verifySource:()=>Promise<void>){
    if(locale===sourceLocale||!edits.length||edits.length>100||edits.some(edit=>!edit.field.record))throw Error('record_translation_request_invalid');
    const storage=await configuredTranslationStorage(host,db,owner);
    const pending=new Map<string,{unit:MessageUnit;current:string;text:string;fingerprint:string}>();
    for(const edit of edits){
        const unit=displayTranslationUnit(edit.field,storage.scope,pageId,sourceLocale),id=await translationUnitId(storage.scope,unit.resource),fingerprint=await messageSourceFingerprint(unit);
        const text=translationDisplayText(edit.field.text,edit.text),prior=pending.get(id);
        if (validatePlainRevision(unit,text)) throw Error('record_translation_request_invalid');
        if(prior&&(prior.text!==text||prior.fingerprint!==fingerprint||prior.current!==edit.current))throw Error('conflicting_record_translations');
        pending.set(id,{unit,current:edit.current,text,fingerprint});
    }
    const snapshots = await storage.persistence.readMany(storage.scope, [...pending.keys()], locale);
    const entries = [...pending].map(([id,item],index)=>{
        const prior=snapshots[index]!;
        const fresh=prior.source?.fingerprint===item.fingerprint&&prior.head?.sourceFingerprint===item.fingerprint&&prior.head.sourceVersion===prior.source.sourceVersion&&prior.head.contextFingerprint===prior.source.contextFingerprint;
        const visible=fresh?translationDisplayText(item.unit.text,prior.head!.text):item.unit.text;
        if(visible!==item.current)throw Error('record_translation_changed');
        return {id,item,prior};
    });
    const changes:{unitId:string;expectedVersion:number;change:PersistenceChange}[]=[];
    for (const {id,item,prior} of entries) {
        let source=prior.source;
        let expectedVersion=prior.version;
        if (source?.fingerprint !== item.fingerprint) {
            const context = prior.source?.context ?? {version:1 as const,role:'record-field'};
            source = {
                unit:item.unit,sourceVersion:(prior.source?.sourceVersion??0)+1,fingerprint:item.fingerprint,
                context,contextFingerprint:await translationContextFingerprint(context),
            };
            changes.push({unitId:id,expectedVersion,change:{kind:'source',source}});
            expectedVersion++;
        }
        changes.push({unitId:id,expectedVersion,change:{kind:'revision',revision:{
            version:1,unitId:id,locale,sourceVersion:source.sourceVersion,sourceFingerprint:source.fingerprint,
            contextFingerprint:source.contextFingerprint,expectedHead:prior.head?.revisionId??null,
            revisionId:crypto.randomUUID(),text:item.text,scope:storage.scope,provenance:'manual',
        }}});
    }
    await verifySource();
    await storage.persistence.compareAndSwapMany(storage.scope,changes);
}
