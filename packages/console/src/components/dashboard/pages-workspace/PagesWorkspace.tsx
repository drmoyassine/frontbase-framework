import {PublicationDialog} from '@/components/builder/directory/PublicationDialog';
import {SiteConfigurationForm} from '../settings/shared/SiteConfigurationForm';
import {ElementSettingsMigration} from '../settings/shared/ElementSettingsMigration';
import {TemplateUrls} from './TemplateUrls';
import {PublishedPageView,publicPath} from './PublishedPageView';
import React, {useEffect, useRef, useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter} from '@/components/ui/dialog';
import {Folder, FolderPlus, Plus, Search, LayoutGrid, List, GripVertical, Move, Pencil, RefreshCw, Eye, Database, Settings2, MoreHorizontal, Box, FileText, Trash2} from 'lucide-react';
import {PageRouteAudit} from '../PageRouteAudit';
import {toast} from 'sonner';
import {DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator} from '@/components/ui/dropdown-menu';
import DataPreviewModal from '@/modules/dbsync/components/DataPreviewModal';
import {EditorialDraftEditor} from '@/components/builder/directory/EditorialDraftEditor';
import {type WorkspaceEntry, type Organization, emptyOrganization, isOrganization, moveEntries, moveFolder, removeFolder, folderDescendants, folderTrail, kindLabel, statusLabel} from './model';

interface Props {
  scope: string; pages: any[]; search: string; filterStatus: string;
  edit: (id: string) => void; actions: (page: any) => React.ReactNode;
  onSearchChange?: (value:string)=>void; onCreatePage?:()=>void; onInstallTemplate?:()=>void; onShowTrash?:()=>void;
}
interface Inventory {schemaVersion: 1; entries: WorkspaceEntry[]}
export function PagesWorkspace({scope, pages, search, filterStatus, edit, actions, onSearchChange, onCreatePage, onInstallTemplate, onShowTrash}: Props) {
  const [publication,setPublication]=useState<string|null>(null);
  const [siteTools,setSiteTools]=useState<'site'|'data'|'maintenance'|null>(null);
  const location=useLocation();
  const sourceRequest=useRef<string>();
  const dragged=useRef(false);
  const [inventory, setInventory] = useState<Inventory | null>(null), [organization, setOrganization] = useState<Organization>(emptyOrganization);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [saving, setSaving] = useState(false), [ready, setReady] = useState(false);
  const [view, setView] = useState<'cards'|'list'>('cards'), [folderId, setFolderId] = useState<string>('all');
  const [selection, setSelection] = useState<string[]>([]), [development, setDevelopment] = useState(false);
  const [folderSelection, setFolderSelection] = useState<string[]>([]);
  const [dialog, setDialog] = useState<{kind: 'new'|'rename'|'move-entries'|'move-folder'|'remove'|'move-folders'|'remove-folders'; id?: string} | null>(null);
  const [name, setName] = useState(''), [destination, setDestination] = useState(''), [routes, setRoutes] = useState<WorkspaceEntry | null>(null);
  const [content, setContent] = useState<WorkspaceEntry | null>(null);
  const [viewing, setViewing] = useState<WorkspaceEntry | null>(null);
  const [recordEditor, setRecordEditor] = useState<WorkspaceEntry | null>(null);
  const [configurationRevision, setConfigurationRevision] = useState<number | null>(null);
  const preference = `frontbase:pages:view:${scope}`;
  const generation = useRef(0);
  useEffect(() => {try {setView(localStorage.getItem(preference) === 'list' ? 'list' : 'cards');} catch {setView('cards');}}, [preference]);
  const changeView = (value: 'cards'|'list') => {setView(value); try {localStorage.setItem(preference, value);} catch {/* Browser storage is optional. */}};
  async function load() {
    const ticket = ++generation.current;
    setLoading(true); setReady(false); setError('');setSelection([]);setFolderSelection([]);
    try {
      const results = await Promise.allSettled([fetch('/api/project/pages-workspace/', {credentials:'include'}), fetch('/api/project/pages-organization/', {credentials:'include'})]);
      if(ticket!==generation.current)return;
      const first = results[0], second = results[1];
      if (first.status !== 'fulfilled' || !first.value.ok) throw Error('Pages could not be loaded. Use Reload in Page tools to try again.');
      const next = await first.value.json(); if(ticket!==generation.current)return; if (next.schemaVersion !== 1 || !Array.isArray(next.entries)) throw Error('The site inventory is invalid');
      setInventory(next);
      if (second.status !== 'fulfilled' || !second.value.ok) throw Error('Folders are unavailable. Reload before reorganizing.');
      const org = await second.value.json(); if(ticket!==generation.current)return; if (!isOrganization(org)) throw Error('Folder configuration is invalid');
      setOrganization(org); setReady(true);
    } catch (e) {if(ticket===generation.current)setError(e instanceof Error ? e.message : 'Site inventory unavailable');} finally {if(ticket===generation.current)setLoading(false);}
  }
  useEffect(() => {sourceRequest.current=undefined;setInventory(null);setViewing(null);setRecordEditor(null);setOrganization(emptyOrganization());setSelection([]);setFolderSelection([]);setFolderId('all');setDialog(null);setContent(null);setRoutes(null);return()=>{generation.current++;};}, [scope]);
  useEffect(()=>{void load();},[scope,pages]);
  useEffect(()=>{
    const role=new URLSearchParams(location.search).get('recordSource');
    if(!inventory||!role||sourceRequest.current===location.key)return;
    const matches=inventory.entries.filter(entry=>entry.kind==='layout'&&entry.role===role&&entry.pageId);
    sourceRequest.current=location.key;
    if(matches.length===1)setRoutes(matches[0]);
    else setError(matches.length?'Multiple templates match. Open the intended template’s URLs panel.':'No matching template exists. Install or create the template first.');
  },[inventory,location.key,location.search]);
  async function save(next: Organization): Promise<boolean> {
    if (!ready || saving) return false;
    setSaving(true);
    const ticket=generation.current;
    try {
      const owned = new Set(inventory?.entries.map(e => e.id));
      const response = await fetch('/api/project/pages-organization/', {method:'PUT', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({schemaVersion:1, expectedRevision: organization.revision, folders:next.folders, placements:next.placements.filter(p => owned.has(p.entryId))})});
      if(ticket!==generation.current)return false;
      if (!response.ok) {setReady(false); throw Error(response.status === 409 ? 'Folders changed in another session. Reload before reorganizing.' : 'Could not save organization. Reload to confirm its current state.');}
      const result = await response.json(); if(ticket!==generation.current)return false;if(!isOrganization(result)||result.revision!==organization.revision+1)throw Error('Saved organization could not be confirmed. Reload before reorganizing.');setOrganization(result); return true;
    } catch(e) {if(ticket===generation.current){setReady(false);setError(e instanceof Error ? e.message : 'Could not save organization');}return false;} finally {if(ticket===generation.current)setSaving(false);}
  }
  const entries = inventory?.entries ?? [];
  const placement = new Map(organization.placements.map(p => [p.entryId,p]));
  const normalized = (): Organization => {
    const ordered=entries.slice().sort((a,b)=>(placement.get(a.id)?.order??100000)-(placement.get(b.id)?.order??100000)||a.name.localeCompare(b.name));
    const counts=new Map<string|null,number>();
    return {...organization,placements:ordered.map(e=>{const folderId=placement.get(e.id)?.folderId??null,order=counts.get(folderId)??0;counts.set(folderId,order+1);return{entryId:e.id,folderId,order};})};
  };
  const reorderFolder = (id:string,delta:-1|1) => {
    const current=organization.folders.find(f=>f.id===id);if(!current)return;
    const siblings=organization.folders.filter(f=>f.parentId===current.parentId).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name));
    const index=siblings.findIndex(f=>f.id===id),other=siblings[index+delta];if(!other)return;
    [siblings[index],siblings[index+delta]]=[siblings[index+delta],siblings[index]];
    const orders=new Map(siblings.map((f,order)=>[f.id,order]));
    void save({...organization,folders:organization.folders.map(f=>orders.has(f.id)?{...f,order:orders.get(f.id)!}:f)});
  };
  const matches = entries.filter(e => (development || !e.developmentOnly) && ((folderId === 'all' && search.trim()) || (placement.get(e.id)?.folderId ?? null) === (folderId === 'all' ? null : folderId)) && (e.name+' '+(e.path??'')).toLowerCase().includes(search.toLowerCase()) && (filterStatus==='all' || (filterStatus==='published' ? ['published','changes-pending'].includes(e.publicationStatus) : e.publicationStatus==='draft')))
    .sort((a,b) => (placement.get(a.id)?.order ?? 100000)-(placement.get(b.id)?.order ?? 100000) || a.name.localeCompare(b.name));
  const openDialog = (value: NonNullable<typeof dialog>) => {setDialog(value); setName(value.id ? organization.folders.find(f => f.id===value.id)?.name ?? '' : ''); setDestination(value.kind==='move-folder' ? organization.folders.find(f=>f.id===value.id)?.parentId??'' : folderId === 'all' ? '' : folderId ?? '');};
  async function confirmDialog() {
    if (!dialog) return;
    let next = organization;
    if (dialog.kind === 'new') next={...organization,folders:[...organization.folders,{id:crypto.randomUUID(),name:name.trim(),parentId:destination||null,order:organization.folders.length}]};
    if (dialog.kind === 'rename') next={...organization,folders:organization.folders.map(f => f.id===dialog.id?{...f,name:name.trim()}:f)};
    if (dialog.kind === 'move-entries') next=moveEntries(normalized(),selection,destination||null);
    if (dialog.kind === 'move-folder') next=moveFolder(organization,dialog.id!,destination||null);
    if (dialog.kind === 'remove') next=removeFolder(organization,dialog.id!);
    if (dialog.kind === 'move-folders') {next=moveEntries(normalized(),selection,destination||null);for (const id of folderSelection) next=moveFolder(next,id,destination||null);}
    if (dialog.kind === 'remove-folders') for (const id of folderSelection) next=removeFolder(next,id);
    if (await save(next)) {if(folderId!=='all'&&!next.folders.some(f=>f.id===folderId))setFolderId('all');setDialog(null);setSelection([]);setFolderSelection([]);toast.success('Organization saved');}
  }
  const drop = async (event: React.DragEvent, target: string|null, beforeId?:string) => {
    event.preventDefault(); if (!ready || saving) return;
    try {const payload = JSON.parse(event.dataTransfer.getData('application/x-frontbase-page')); const owned = new Set(entries.map(e=>e.id));
      if(payload.kind==='entries' && Array.isArray(payload.ids) && payload.ids.length && payload.ids.every((id:unknown)=>typeof id==='string'&&owned.has(id))) await save(moveEntries(normalized(),payload.ids,target,beforeId));
      else if(payload.kind==='folder' && organization.folders.some(f=>f.id===payload.id)) await save(moveFolder(organization,payload.id,target));
    } catch {toast.error('This item cannot be moved here');}
  };
  const folderActions = (id:string,label:string) => <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label={`Folder actions for ${label}`}><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
    {(['rename','move-folder','remove'] as const).map(kind=><DropdownMenuItem key={kind} disabled={!ready||saving} className={kind==='remove'?'text-destructive':''} onSelect={()=>{setSelection([]);setFolderSelection([]);openDialog({kind,id});}}>{kind==='rename'?'Rename folder':kind==='remove'?'Delete folder':'Move folder'}</DropdownMenuItem>)}
    <DropdownMenuSeparator/><DropdownMenuItem disabled={!ready||saving} onSelect={()=>reorderFolder(id,-1)}>Move up</DropdownMenuItem><DropdownMenuItem disabled={!ready||saving} onSelect={()=>reorderFolder(id,1)}>Move down</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>;
  const openContent=async(entry:WorkspaceEntry)=>{
      if(entry.contentAction?.recordId) {
        try {const response=await fetch('/api/project/site-configuration/',{credentials:'include'});if(!response.ok)throw Error();const configuration=await response.json();if(!configuration.draft||!Number.isInteger(configuration.revision))throw Error();setConfigurationRevision(configuration.revision);}
        catch {toast.error('Content settings are unavailable. Reload before editing.');return;}
      }
      setContent(entry);
    };
  const editPath=(id:string)=>'/builder/'+encodeURIComponent(id);
  const nameLink=(entry:WorkspaceEntry)=>entry.pageId
    ? <Link className="hover:underline" to={editPath(entry.pageId)}>{entry.name}</Link>
    : entry.name;
  const rowClick=(entry:WorkspaceEntry)=>(event:React.MouseEvent)=>{
    if(dragged.current||!entry.pageId||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const target=event.target as Element;
    if(!event.currentTarget.contains(target)||target.closest('a,button,input,select,textarea,label,[role="menuitem"]')||window.getSelection()?.toString())return;
    edit(entry.pageId);
  };
  const entryActions = (entry:WorkspaceEntry) => <div className="flex items-center justify-end gap-1">
    {entry.pageId && <Button asChild size="sm"><Link to={editPath(entry.pageId)}><Pencil className="h-3.5 w-3.5"/>Edit</Link></Button>}
    <Button variant="outline" size="sm" onClick={()=>{
      if(entry.publicationStatus!=='published'&&entry.publicationStatus!=='changes-pending'){toast.info('This page has no published version. Open Edit for a draft preview.');return;}
      const path=publicPath(entry.publishedPath??entry.path);
      if(entry.kind!=='layout'&&path&&(entry.locales?.length??0)<=1){window.open(path,'_blank','noopener,noreferrer');return;}
      setViewing(entry);
    }}><Eye className="h-3.5 w-3.5"/>View</Button>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label={`Actions for ${entry.name}`}><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
      <DropdownMenuItem disabled={!ready||saving} onSelect={()=>{setSelection([entry.id]);setFolderSelection([]);openDialog({kind:'move-entries'});}}><Move className="mr-2 h-4 w-4"/>Move</DropdownMenuItem>
      {entry.pageId&&(entry.kind==='layout'
        ? <DropdownMenuItem onSelect={()=>setRoutes(entry)}>Template settings</DropdownMenuItem>
        : <DropdownMenuItem asChild><Link to={editPath(entry.pageId)+'?panel=page-settings'}>Page settings</Link></DropdownMenuItem>)}
      {entry.pageId&&entry.role&&<DropdownMenuItem onSelect={()=>setPublication(entry.pageId!)}>Publish layout</DropdownMenuItem>}
      {entry.recordViews?.map(view=><DropdownMenuItem key={view.id} asChild><Link to={'/data-studio/saved-views?view='+encodeURIComponent(view.id)}>Browse records · {view.name}</Link></DropdownMenuItem>)}
      {entry.liveRecords&&entry.contentAction?.contentRole&&<DropdownMenuItem onSelect={()=>setRecordEditor(entry)}>Edit records</DropdownMenuItem>}
      {!entry.recordViews?.length&&entry.contentAction&&<DropdownMenuItem onSelect={()=>void openContent(entry)}>{entry.contentAction.recordId?'Edit content':'Browse records'}</DropdownMenuItem>}
      {entry.source==='saved' && (()=>{const page=pages.find(p=>p.id===entry.pageId);return page?<><DropdownMenuSeparator/>{actions(page)}</>:null;})()}
    </DropdownMenuContent></DropdownMenu>
  </div>;
  // Browse folders by default; explicit search still spans all documents.
  const visibleFolders = organization.folders.filter(f => ((folderId==='all'&&!!search.trim())||f.parentId === (folderId === 'all' ? null : folderId)) && folderId !== null && f.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name));
  const folderCount = (id:string) => {const descendants=folderDescendants(organization,id);return entries.filter(e=>descendants.has(placement.get(e.id)?.folderId??'') && (development||!e.developmentOnly)).length;};
  const ancestors: Organization['folders'] = [];
  if (folderId !== 'all') {
    const seen = new Set<string>(); let cursor: string|null = folderId;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor); const folder = organization.folders.find(f=>f.id===cursor); if (!folder) break;
      ancestors.unshift(folder); cursor=folder.parentId;
    }
  }
  const navigateFolder = (id:string) => {setFolderId(id);setSelection([]);setFolderSelection([]);};
  const crumbClass = 'rounded px-1 py-1 text-left transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const address = (entry:WorkspaceEntry) => entry.path ?? (entry.paths?.length ? `${entry.paths.length} URLs` : entry.kind==='layout'?'Multiple URLs':'No public address');
  const typeColor = (entry:WorkspaceEntry) => entry.kind==='layout'
    ? 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-400/40 dark:bg-violet-400/15 dark:text-violet-200'
    : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-400/40 dark:bg-blue-400/15 dark:text-blue-200';
  const typeBadge = (entry:WorkspaceEntry) => <Badge variant="outline" className={typeColor(entry)}>{kindLabel[entry.kind]}</Badge>;
  const typeIcon = (entry:WorkspaceEntry) => entry.kind==='layout'
    ? <Box aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-violet-700 dark:text-violet-300"/>
    : <FileText aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300"/>;
  const status = (entry:WorkspaceEntry) => <Badge variant={entry.publicationStatus==='published'?'default':'secondary'}>{statusLabel[entry.publicationStatus]}</Badge>;
  const folderBadge = () => <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/15 dark:text-amber-200">Folder</Badge>;
  const folderCheckbox = (id:string,label:string) => <input type="checkbox" className="h-4 w-4 shrink-0" aria-label={`Select folder ${label}`} checked={folderSelection.includes(id)} onChange={()=>setFolderSelection(ids=>ids.includes(id)?ids.filter(value=>value!==id):[...ids,id])}/>;
  const entryCheckbox = (entry:WorkspaceEntry) => <input type="checkbox" className="h-4 w-4 shrink-0" aria-label={`Select ${entry.name}`} checked={selection.includes(entry.id)} onChange={()=>{setSelection(ids=>ids.includes(entry.id)?ids.filter(id=>id!==entry.id):[...ids,entry.id]);}}/>;
  const dragProps = (entry:WorkspaceEntry) => ({draggable:ready&&!saving,onPointerDown:()=>{dragged.current=false;},onDragStart:(event:React.DragEvent)=>{dragged.current=true;event.dataTransfer.setData('application/x-frontbase-page',JSON.stringify({kind:'entries',ids:selection.includes(entry.id)?selection:[entry.id]}));},onDragOver:(event:React.DragEvent)=>event.preventDefault(),onDrop:(event:React.DragEvent)=>{event.stopPropagation();void drop(event,placement.get(entry.id)?.folderId??null,entry.id);}});
  const allSelected=selection.length+folderSelection.length>0&&selection.length===matches.length&&folderSelection.length===visibleFolders.length;
  const toggleAll=()=>{setSelection(allSelected?[]:matches.map(e=>e.id));setFolderSelection(allSelected?[]:visibleFolders.map(f=>f.id));};
  return <div className="space-y-4">
    <div className="flex items-center gap-2 overflow-x-auto pb-1" role="toolbar" aria-label="Pages toolbar">
      <div className="relative min-w-[10rem] max-w-sm flex-1"><Search aria-hidden="true" className="absolute left-2 top-2 h-4 w-4 text-muted-foreground"/><Input aria-label="Search pages" placeholder="Search pages…" value={search} onChange={e=>onSearchChange?.(e.target.value)} className="h-8 pl-8"/></div>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="shrink-0">Filters</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><label className="flex items-center gap-2 p-2 text-sm"><input type="checkbox" checked={development} onChange={e=>setDevelopment(e.target.checked)}/>Show migration/test documents</label></DropdownMenuContent></DropdownMenu>
      <div className="inline-flex shrink-0 rounded-md border" role="group" aria-label="Page view"><Button variant={view==='cards'?'secondary':'ghost'} size="sm" aria-pressed={view==='cards'} onClick={()=>changeView('cards')}><LayoutGrid className="mr-1 h-4 w-4"/>Cards</Button><Button variant={view==='list'?'secondary':'ghost'} size="sm" aria-pressed={view==='list'} onClick={()=>changeView('list')}><List className="mr-1 h-4 w-4"/>List</Button></div>
      <Button variant="outline" size="sm" className="shrink-0" disabled={!ready||saving} onClick={()=>openDialog({kind:'new'})}><FolderPlus className="mr-1 h-4 w-4"/>New folder</Button>
      {onCreatePage&&<Button variant="outline" size="sm" className="shrink-0" onClick={onCreatePage}><Plus className="mr-1 h-4 w-4"/>New page</Button>}
      <PageRouteAudit key={scope} trigger={check=><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="shrink-0" aria-label="Page tools"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={()=>setPublication('')}>Publish site layouts</DropdownMenuItem>
        <DropdownMenuItem onSelect={()=>setSiteTools('site')}>Shared routes</DropdownMenuItem>
        <DropdownMenuItem onSelect={()=>setSiteTools('data')}>Source field mappings</DropdownMenuItem>
        <DropdownMenuItem onSelect={()=>setSiteTools('maintenance')}>Template maintenance</DropdownMenuItem>
        {onInstallTemplate&&<DropdownMenuItem onSelect={onInstallTemplate}>Install template</DropdownMenuItem>}
        <DropdownMenuItem onSelect={check}>Check page URLs</DropdownMenuItem>
        <DropdownMenuItem disabled={loading||!matches.length&&!visibleFolders.length} onSelect={toggleAll}>{allSelected?'Deselect all':'Select all'}</DropdownMenuItem>
        <DropdownMenuItem disabled={loading||saving} onSelect={()=>void load()}><RefreshCw className="mr-2 h-4 w-4"/>Reload</DropdownMenuItem>
        {onShowTrash&&<><DropdownMenuSeparator/><DropdownMenuItem onSelect={onShowTrash}><Trash2 className="mr-2 h-4 w-4"/>Trash</DropdownMenuItem></>}
      </DropdownMenuContent></DropdownMenu>}/>
    </div>
    {error && <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">{error}</div>}
    <div className="min-w-0">
      <main className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><nav aria-label="Folder breadcrumb" className="min-w-0"><ol className="flex flex-wrap items-center gap-1 text-sm">
            <li>{folderId==='all'?<span aria-current="page" className="font-medium">All site documents</span>:<button className={crumbClass} onClick={()=>navigateFolder('all')}>All site documents</button>}</li>
            {ancestors.map((folder,index)=><React.Fragment key={folder.id}><li aria-hidden="true" className="text-muted-foreground">/</li><li className="min-w-0 break-words">{index===ancestors.length-1?<span aria-current="page" className="font-medium">{folder.name}</span>:<button className={crumbClass} onClick={()=>navigateFolder(folder.id)}>{folder.name}</button>}</li></React.Fragment>)}
          </ol></nav>
          <div className="flex flex-wrap justify-end gap-2">{selection.length+folderSelection.length>0&&<Button variant="outline" size="sm" disabled={!ready||saving} onClick={()=>openDialog({kind:folderSelection.length?'move-folders':'move-entries'})}>Move {selection.length+folderSelection.length} selected</Button>}{folderSelection.length>0&&<Button variant="outline" size="sm" disabled={!ready||saving} onClick={()=>openDialog({kind:'remove-folders'})}><Trash2 className="mr-1 h-4 w-4"/>Delete {folderSelection.length} folders</Button>}</div>
        </div>
        {loading && <p role="status" className="text-sm text-muted-foreground">Loading site structure…</p>}
        {view==='cards' ? <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3" aria-label="Site items">{visibleFolders.map(folder=><article key={`folder:${folder.id}`} className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.stopPropagation();void drop(e,folder.id);}}>
          <div className="flex items-start justify-between gap-2">{folderCheckbox(folder.id,folder.name)}{folderBadge()}</div>
          <button aria-label={`Open folder ${folder.name}`} className="flex min-w-0 items-start gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={()=>navigateFolder(folder.id)}><Folder aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"/><span className="min-w-0"><span className="block break-words font-semibold">{folder.name}</span><span className="text-xs text-muted-foreground">{folderCount(folder.id)} documents · Open folder</span></span></button><div className="mt-auto flex justify-end pt-1">{folderActions(folder.id,folder.name)}</div>
        </article>)}{matches.map(entry=><article key={entry.id} onClick={rowClick(entry)} {...dragProps(entry)} className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2">{entryCheckbox(entry)}<GripVertical aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground"/></div><div className="flex min-w-0 flex-wrap justify-end gap-2">{typeBadge(entry)}{status(entry)}{entry.developmentOnly&&<Badge variant="outline">Migration/test</Badge>}</div></div>
          <div className="flex items-start gap-2">{typeIcon(entry)}<div className="min-w-0 flex-1"><h3 className="line-clamp-2 break-words font-semibold" title={entry.name}>{nameLink(entry)}</h3><p className="line-clamp-2 break-all text-xs text-muted-foreground" title={address(entry)}>{address(entry)}</p></div></div>
          <div className="mt-auto pt-1">{entryActions(entry)}</div>
        </article>)}</div> : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[680px] table-fixed text-left text-sm"><thead className="bg-muted/40"><tr><th className="w-10 p-3"><span className="sr-only">Selection</span></th><th className="w-[23%] p-3">Name / type</th><th className="w-[24%] p-3">Public address</th><th className="w-[20%] p-3">Publication</th><th className="p-3">Actions</th></tr></thead><tbody>{visibleFolders.map(folder=><tr key={`folder:${folder.id}`} className="border-t" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.stopPropagation();void drop(e,folder.id);}}><td className="p-3">{folderCheckbox(folder.id,folder.name)}</td><td className="p-3 align-top"><button aria-label={`Open folder ${folder.name}`} className="flex min-w-0 items-start gap-2 text-left" onClick={()=>navigateFolder(folder.id)}><Folder aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"/><span className="line-clamp-2 break-words font-medium">{folder.name}</span></button><div className="mt-1">{folderBadge()}</div></td><td className="p-3 text-muted-foreground">{folderCount(folder.id)} documents</td><td className="p-3 text-muted-foreground">—</td><td className="p-3"><div className="flex justify-end">{folderActions(folder.id,folder.name)}</div></td></tr>)}{matches.map(entry=><tr key={entry.id} onClick={rowClick(entry)} {...dragProps(entry)} className="border-t"><td className="p-3">{entryCheckbox(entry)}</td><td className="p-3 align-top"><div className="flex items-start gap-2">{typeIcon(entry)}<span className="line-clamp-2 break-words font-medium" title={entry.name}>{nameLink(entry)}</span></div><div className="mt-1">{typeBadge(entry)}</div></td><td className="p-3 align-top"><span className="line-clamp-2 break-all" title={address(entry)}>{address(entry)}</span></td><td className="p-3 align-top">{status(entry)}</td><td className="p-3 align-top">{entryActions(entry)}</td></tr>)}</tbody></table></div>}
        {inventory&&!loading&&!matches.length&&!visibleFolders.length&&<p className="rounded-lg border p-8 text-center text-muted-foreground">No matching documents in this folder.</p>}
      </main>
    </div>
    <Dialog open={!!dialog} onOpenChange={open=>{if(!open&&!saving)setDialog(null);}}><DialogContent><DialogHeader><DialogTitle>{dialog?.kind==='new'?'Create folder':dialog?.kind==='rename'?'Rename folder':dialog?.kind==='remove'?'Delete folder':dialog?.kind==='remove-folders'?'Delete folders':dialog?.kind==='move-folder'?'Move folder':dialog?.kind==='move-folders'?'Move selected items':'Move documents'}</DialogTitle><DialogDescription>{(dialog?.kind==='remove'||dialog?.kind==='remove-folders')?'Only the selected folders are removed. Documents and child folders move to the nearest remaining parent. No pages or content are deleted.':'Organization changes do not change public URLs or publication.'}</DialogDescription></DialogHeader>
      {error&&<p role="alert" className="text-sm text-destructive">{error} Close this dialog to reload.</p>}
      {(dialog?.kind==='new'||dialog?.kind==='rename')&&<label className="space-y-2 text-sm">Folder name<Input autoFocus value={name} maxLength={100} onChange={e=>setName(e.target.value)}/></label>}
      {dialog&&['new','move-entries','move-folder','move-folders'].includes(dialog.kind)&&<label className="space-y-2 text-sm">Destination folder<select className="block w-full rounded-md border bg-background p-2" value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Top level</option>{organization.folders.filter(f=>(dialog.kind!=='move-folder'||!folderDescendants(organization,dialog.id!).has(f.id))&&(dialog.kind!=='move-folders'||!folderSelection.some(id=>folderDescendants(organization,id).has(f.id)))).map(f=><option value={f.id} key={f.id}>{folderTrail(organization,f.id)}</option>)}</select></label>}
      <DialogFooter><Button variant="outline" disabled={saving} onClick={()=>setDialog(null)}>Cancel</Button><Button disabled={!ready||saving||((dialog?.kind==='new'||dialog?.kind==='rename')&&!name.trim())} onClick={()=>void confirmDialog()}>{saving?'Saving…':dialog?.kind==='remove'?'Delete folder':dialog?.kind==='remove-folders'?'Delete folders':'Save'}</Button></DialogFooter>
    </DialogContent></Dialog>
    {publication!==null&&<PublicationDialog pageId={publication||undefined} close={()=>{setPublication(null);void load();}}/>}
    {siteTools&&<Dialog open onOpenChange={open=>{if(!open)setSiteTools(null);}}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{siteTools==='site'?'Shared routes':siteTools==='data'?'Source field mappings':'Template maintenance'}</DialogTitle></DialogHeader>{siteTools==='maintenance'?<ElementSettingsMigration/>:<SiteConfigurationForm section={siteTools} onSaved={()=>void load()}/>}</DialogContent></Dialog>}
    {routes?.kind==='layout'&&routes.pageId?<TemplateUrls initialSection={new URLSearchParams(location.search).get('recordSource')===routes.role?'source':'urls'} key={routes.pageId} pageId={routes.pageId} name={routes.name} onClose={()=>setRoutes(null)} onSaved={()=>void load()} onContent={routes.contentAction?record=>{const entry={...routes,name:record.title,contentAction:{...routes.contentAction!,...(routes.contentAction!.contentRole?{recordId:String(record.id)}:{recordKey:{column:routes.contentAction!.keyColumn??'id',value:String(record.id)}})}};setRoutes(null);void openContent(entry);}:undefined} design={()=>{const id=routes.pageId!;setRoutes(null);edit(id);}}/>:null}
    {viewing&&<PublishedPageView key={viewing.id} entry={viewing} close={()=>setViewing(null)}/>}
    {recordEditor?.contentAction&&<PublishedPageView key={recordEditor.id} entry={recordEditor} close={()=>setRecordEditor(null)} editRecord={(id,path)=>{
      const contentAction=recordEditor.contentAction;
      if(!contentAction)return;
      setRecordEditor(null);
      void openContent({...recordEditor,name:path,contentAction:{...contentAction,recordId:id}});
    }}/>}
    {content?.contentAction?.recordId && configurationRevision !== null ? <Dialog open onOpenChange={open=>{if(!open)setContent(null);}}><DialogContent className="max-h-[90vh] max-w-4xl overflow-auto"><DialogHeader><DialogTitle>Edit content · {content.name}</DialogTitle><DialogDescription>Editing this record creates a draft. Publication is a separate step.</DialogDescription></DialogHeader><EditorialDraftEditor id={content.contentAction.recordId} contentRole={content.contentAction.contentRole??'page'} configurationRevision={configurationRevision} onClose={()=>setContent(null)}/></DialogContent></Dialog>
      : content?.contentAction && <DataPreviewModal isOpen onClose={()=>setContent(null)} datasourceId={content.contentAction.datasourceId} datasourceName="Connected content" table={content.contentAction.table} initialFilters={content.contentAction.recordKey?[{field:content.contentAction.recordKey.column,operator:'eq',value:content.contentAction.recordKey.value}]:undefined}/>}
  </div>;
}
