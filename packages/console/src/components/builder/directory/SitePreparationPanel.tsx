import React, { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { SiteConfigurationDraft } from '@frontbase/edge-core/directory/configuration';
import { sitePublicationReviewChecksSchema } from '@frontbase/edge-core/directory/publication';
import { Button } from '@/components/ui/button';
import { SitePublicationPanel } from './SitePublicationPanel';

const rowSchema=z.object({id:z.union([z.string(),z.number()]),title:z.string(),originalPath:z.string().startsWith('/'),institutionId:z.union([z.string(),z.number()]).optional()});
type Row=z.infer<typeof rowSchema>;
const roles=['directory','institution','program','article-index','article'] as const;
type Role=typeof roles[number];
type Approval={id:string;revision:number;fingerprint:string};
/** Existing Page Settings owns preparation; saved layouts and draft editing stay separate. */
export function SitePreparationPanel({draft,disabled=false}:{draft:SiteConfigurationDraft;disabled?:boolean}) {
    const [open,setOpen]=useState(false), [busy,setBusy]=useState(false), [message,setMessage]=useState('');
    const [templates,setTemplates]=useState<{id:string;name:string;role:Role}[]>([]), [pages,setPages]=useState<Partial<Record<Role,string>>>({});
    const [collection,setCollection]=useState<'institution'|'article'>('institution'), [search,setSearch]=useState('');
    const [shown,setShown]=useState<{role:'institution'|'program'|'article';rows:Row[]}>({role:'institution',rows:[]});
    const [institutions,setInstitutions]=useState<Row[]>([]), [programs,setPrograms]=useState<Row[]>([]), [articles,setArticles]=useState<(Row&Approval)[]>([]);
    const [prepared,setPrepared]=useState<{hash:string;revision:number;paths:{title:string;originalPath:string}[];directory?:string;blog?:string;review?:string|null}>(), [preview,setPreview]=useState(''), [recoveryHash,setRecoveryHash]=useState('');
    const [reviewChecks,setReviewChecks]=useState<Record<string,boolean>>({}),[reviewNote,setReviewNote]=useState(''),[reviewAttempted,setReviewAttempted]=useState(false);
    const generation=useRef(0);
    useEffect(()=>{generation.current++;setOpen(false);setBusy(false);setTemplates([]);setPages({});setInstitutions([]);setPrograms([]);setArticles([]);setShown({role:'institution',rows:[]});setPrepared(undefined);setPreview('');setMessage('');return()=>{generation.current++;};},[draft.revision]);
    const changed=()=>{setPrepared(undefined);setPreview('');};
    useEffect(()=>{setReviewChecks({});setReviewNote('');setReviewAttempted(false);},[prepared?.hash,draft.revision]);
    async function operation(work:()=>Promise<void>) {
        const current=generation.current;setBusy(true);setMessage('');
        try {await work();}catch {if(current===generation.current)setMessage('Operation unavailable. Reload saved settings and check the connection.');}
        finally {if(current===generation.current)setBusy(false);}
    }
    async function post(path:string,input:unknown) {
        const current=generation.current,response=await fetch(`/api/project/site-configuration/${path}/`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
        if(current!==generation.current)throw new Error('stale');
        if(!response.ok)throw new Error('unavailable');const value=await response.json();if(current!==generation.current)throw new Error('stale');return value;
    }
    async function loadTemplates() {
        const current=generation.current,response=await fetch('/api/pages/',{credentials:'include'});if(!response.ok)throw new Error();
        const result=await response.json();if(current!==generation.current)return;
        const list=z.array(z.object({id:z.string().uuid(),name:z.string(),layoutData:z.object({root:z.record(z.unknown())})}).passthrough()).parse(result.data);
        const choices=list.flatMap(page=>{const ref=page.layoutData.root.siteConfiguration as {role?:string}|undefined;return ref?.role && roles.includes(ref.role as Role)?[{id:page.id,name:page.name,role:ref.role as Role}]:[];});
        setTemplates(choices);setPages(Object.fromEntries(roles.flatMap(role=>{const matches=choices.filter(page=>page.role===role);return matches.length===1?[[role,matches[0].id]]:[];})));setOpen(true);
    }
    async function load(role:'institution'|'program'|'article',institutionId?:string|number) {
        const result=await post('preview',{expectedRevision:draft.revision,role,mode:'list',params:institutionId===undefined?{q:search}:{institutionId}});
        if(result.revision!==draft.revision)throw new Error();setShown({role,rows:z.array(rowSchema).parse(result.rows)});
        setMessage(result.hasMore?'More results exist. Narrow the title search to find the records you need.':'Choose the records for this private preview.');
    }
    async function includeArticle(row:Row) {
        const result=await post('editorial/read',{id:row.id,expectedConfigurationRevision:draft.revision});
        const approval=z.object({documentRevision:z.number().int().positive(),configurationRevision:z.literal(draft.revision),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).safeParse(result.approval);
        if(!approval.success || result.document?.id!==row.id || result.document?.revision!==approval.data.documentRevision || result.document?.originalPath!==row.originalPath){setMessage('This article needs approval of its current saved revision. Use Edit article content above first.');return;}
        changed();setArticles(prior=>[...prior.filter(item=>item.id!==row.id),{...row,id:String(row.id),revision:approval.data.documentRevision,fingerprint:approval.data.fingerprint}]);
    }
    async function prepare() {
        changed();
        const needed:Role[]=[...(institutions.length || programs.length?['directory','institution'] as Role[]:[]),...(programs.length?['program'] as Role[]:[]),...(articles.length?['article-index','article'] as Role[]:[])];
        if(needed.some(role=>!pages[role])){setMessage('Choose a saved template for each included page type.');return;}
        const result=await post('publication/prepare',{expectedConfigurationRevision:draft.revision,pageIds:needed.map(role=>pages[role]),institutionPaths:institutions.map(row=>row.originalPath),programPaths:programs.map(row=>row.originalPath),articles:articles.map(({id,revision,fingerprint})=>({id,revision,fingerprint}))});
        const hash=z.string().regex(/^[a-f0-9]{64}$/).parse(result.hash);if(result.configurationRevision!==draft.revision || result.publicationAvailable!==false)throw new Error();
        const paths=z.array(rowSchema).parse([...result.records.institutions,...result.records.programs,...result.records.articles]);
        setPrepared({hash,revision:draft.revision,paths,directory:institutions.length?draft.configuration.routes.directory:undefined,blog:articles.length?draft.configuration.routes.blog:undefined});setMessage('Private version prepared. Review its captured pages below. Preparation does not publish.');
    }
    async function reopen() {
        const hash=z.string().regex(/^[a-f0-9]{64}$/).parse(recoveryHash.trim());
        const result=await post('publication/read',{hash});
        const candidate=z.object({hash:z.literal(hash),configurationRevision:z.number().int().positive(),publicationAvailable:z.literal(false),
            review:z.string().datetime().nullable().optional(),routes:z.object({directory:z.string().startsWith('/'),blog:z.string().startsWith('/')}),
            records:z.object({institutions:z.array(rowSchema),programs:z.array(rowSchema),articles:z.array(rowSchema)})}).parse(result);
        setPreview('');setPrepared({hash,revision:candidate.configurationRevision,paths:[...candidate.records.institutions,...candidate.records.programs,...candidate.records.articles],
            directory:candidate.records.institutions.length?candidate.routes.directory:undefined,blog:candidate.records.articles.length?candidate.routes.blog:undefined,review:candidate.review});
        setReviewChecks({});setReviewNote('');setReviewAttempted(false);
        setMessage('Saved private version reopened. Its captured settings and data are unchanged. Reopening does not publish.');
    }
    async function review() {
        if(!prepared || reviewAttempted || prepared.review)return;
        const checks=sitePublicationReviewChecksSchema.parse(reviewChecks),hash=prepared.hash;
        setReviewAttempted(true);
        setRecoveryHash(hash);
        const result=await post('publication/review',{hash,checks,note:reviewNote.trim()});
        const confirmed=z.object({hash:z.literal(hash),review:z.object({reviewedAt:z.string().datetime()}),publicationAvailable:z.literal(false)}).parse(result);
        setPrepared(prior=>prior?.hash===hash?{...prior,review:confirmed.review.reviewedAt}:prior);
        setMessage('This exact version is reviewed. Reviewing does not publish.');
    }
    const locked=disabled||busy;
    return <section aria-label="Site preparation" className="space-y-3 rounded-lg border p-3">
        <h4 className="font-medium">Prepare a site version</h4>
        <p className="text-sm text-muted-foreground">Capture saved templates and selected data together. Articles require approval first. This creates a private preview.</p>
        <div className="flex flex-wrap items-center gap-2"><input aria-label="Prepared version ID" value={recoveryHash} disabled={locked} maxLength={64} onChange={event=>setRecoveryHash(event.target.value)} className="min-w-0 flex-1 rounded border bg-background p-2 text-sm" placeholder="Paste a saved version ID"/><Button variant="outline" disabled={locked || !/^[a-f0-9]{64}$/.test(recoveryHash.trim())} onClick={()=>void operation(reopen)}>Reopen private version</Button></div>
        {!open?<Button disabled={locked} variant="outline" onClick={()=>void operation(loadTemplates)}>Choose templates and records</Button>:<>
            <div className="grid gap-2 sm:grid-cols-2">{roles.map(role=><label key={role} className="text-sm">{role}<select aria-label={`${role} template`} disabled={locked} value={pages[role]??''} className="block w-full rounded border bg-background p-2" onChange={event=>{changed();setPages(prior=>({...prior,[role]:event.target.value}));}}><option value="">Choose saved template</option>{templates.filter(page=>page.role===role).map(page=><option key={page.id} value={page.id}>{page.name}</option>)}</select></label>)}</div>
            <div className="flex flex-wrap gap-2"><select aria-label="Preparation collection" value={collection} disabled={locked} onChange={event=>setCollection(event.target.value as typeof collection)} className="rounded border bg-background p-2"><option value="institution">Institutions</option>{draft.configuration.collections.article.table && <option value="article">Articles</option>}</select><input aria-label="Preparation title search" value={search} disabled={locked} maxLength={100} onChange={event=>setSearch(event.target.value)} className="min-w-0 rounded border bg-background p-2" placeholder="Search titles"/><Button disabled={locked} onClick={()=>void operation(()=>load(collection))}>Find records</Button></div>
            <ul className="space-y-2">{shown.rows.map(row=><li key={String(row.id)} className="rounded border p-2"><p className="font-medium">{row.title}</p><p className="break-all text-sm">{row.originalPath}</p>{shown.role==='article'?<Button variant="outline" disabled={locked} onClick={()=>void operation(()=>includeArticle(row))}>Include approved revision</Button>:<label className="flex items-center gap-2"><input type="checkbox" disabled={locked} checked={(shown.role==='institution'?institutions:programs).some(item=>item.id===row.id)} onChange={event=>{changed();const update=(prior:Row[])=>event.target.checked?[...prior.filter(item=>item.id!==row.id),row]:prior.filter(item=>item.id!==row.id);if(shown.role==='institution')setInstitutions(update);else setPrograms(update);}}/>Include {shown.role}</label>}{shown.role==='institution' && <Button variant="outline" disabled={locked || !institutions.some(item=>item.id===row.id)} onClick={()=>void operation(()=>load('program',row.id))}>Choose linked programs</Button>}</li>)}</ul>
            <p className="text-sm">Selected: {institutions.length} institutions · {programs.length} programs · {articles.length} approved articles</p>
            {articles.map(row=><Button key={String(row.id)} disabled={locked} variant="ghost" onClick={()=>{changed();setArticles(prior=>prior.filter(item=>item.id!==row.id));}}>Remove {row.title}</Button>)}
            <Button disabled={locked || !(institutions.length+articles.length)} onClick={()=>void operation(prepare)}>Prepare private preview</Button>
        </>}
        {prepared && <div className="space-y-2"><p className="font-medium">Captured pages · settings revision {prepared.revision}</p><p className="text-xs text-muted-foreground">Save this version ID to reopen it:</p><code className="block select-all break-all text-xs">{prepared.hash}</code>{prepared.directory && <Button variant="outline" disabled={locked} onClick={()=>setPreview(prepared.directory!)}>Explore directory</Button>}{prepared.blog && <Button variant="outline" disabled={locked} onClick={()=>setPreview(prepared.blog!)}>Articles index</Button>}{prepared.paths.map(row=><Button key={row.originalPath} variant="outline" className="h-auto max-w-full whitespace-normal break-words text-left" title={row.title} disabled={locked} onClick={()=>setPreview(row.originalPath)}>{row.title}</Button>)}{preview && <iframe title="Prepared site preview" className="h-[480px] w-full rounded border bg-white" src={`/api/project/site-configuration/publication/render/?hash=${encodeURIComponent(prepared.hash)}&path=${encodeURIComponent(preview)}`}/>}</div>}
        {prepared && <fieldset disabled={locked||!!prepared.review||reviewAttempted} className="space-y-2 rounded border p-3"><legend className="px-1 font-medium">Review this captured version</legend><p className="text-sm text-muted-foreground">Confirm only after checking every included page. This records review; publishing is a separate step.</p>{(['content','media','layout','urls','ctas'] as const).map(check=><label key={check} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reviewChecks[check]??false} onChange={event=>setReviewChecks(prior=>({...prior,[check]:event.target.checked}))}/>{{content:'Content and relationships are accurate',media:'Images are suitable, or missing images are intentional',layout:'Layouts work on small and large screens',urls:'Original URLs and page links are correct',ctas:'Contact actions lead to the intended destination'}[check]}</label>)}<label className="block text-sm">Version review note<textarea aria-label="Version review note" className="mt-1 block w-full rounded border bg-background p-2" maxLength={4000} value={reviewNote} onChange={event=>setReviewNote(event.target.value)}/></label><Button disabled={locked||!!prepared.review||reviewAttempted||!reviewNote.trim()||!sitePublicationReviewChecksSchema.safeParse(reviewChecks).success} onClick={()=>void operation(review)}>Approve this private version</Button>{prepared.review?<p className="text-sm">Reviewed {prepared.review}. Reviewing does not publish.</p>:reviewAttempted && <p className="text-sm">Reopen this version to check the review result before trying again.</p>}</fieldset>}
        {prepared && <SitePublicationPanel candidate={prepared} revision={draft.revision} disabled={locked}/>}
        {message && <p role="status">{message}</p>}
    </section>;
}
