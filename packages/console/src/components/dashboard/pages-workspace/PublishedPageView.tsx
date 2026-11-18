import {useEffect, useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import type {WorkspaceEntry} from './model';

export function publicPath(path:string|undefined) {
  return path && /^\/(?!\/)/.test(path) && !/[\\\u0000-\u0020]/.test(path) ? path : undefined;
}

export function PublishedPageView({entry, close, editRecord}: {entry:WorkspaceEntry;close:()=>void;editRecord?:(id:string,path:string)=>void}) {
  const [offsets,setOffsets]=useState([0]);
  const offset=offsets[offsets.length-1];
  const [locale,setLocale]=useState(entry.sourceLocale??'');
  const [records,setRecords]=useState<{records:{id:string;path:string}[];nextOffset:number|null}|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    if(!entry.liveRecords)return;
    const controller=new AbortController();
    setRecords(null);
    setError(false);
    fetch(`/api/project/live-layout/records/${encodeURIComponent(entry.id)}/?offset=${offset}`,{signal:controller.signal})
      .then(response=>{if(!response.ok)throw Error();return response.json();})
      .then(result=>{if(!Array.isArray(result.records))throw Error();if(!controller.signal.aborted)setRecords(result);})
      .catch(()=>{if(!controller.signal.aborted)setError(true);});
    return ()=>controller.abort();
  },[entry.id,entry.liveRecords,offset]);
  const paths=entry.liveRecords?records?.records.map(record=>record.path):entry.kind==='layout'?entry.paths:[entry.publishedPath??entry.path];
  const links=(paths??[]).map(publicPath).filter((path):path is string=>!!path);
  return <Dialog open onOpenChange={open=>{if(!open)close();}}>
    <DialogContent>
      <DialogHeader><DialogTitle>{editRecord?'Edit records':'View'} · {entry.name}</DialogTitle><DialogDescription>{editRecord?'Choose a record to open its draft editor.':'Open a published address.'}</DialogDescription></DialogHeader>
      {!editRecord&&(entry.locales?.length??0)>1&&<label>Language <select value={locale} onChange={event=>setLocale(event.target.value)}>{entry.locales?.map(value=><option key={value}>{value}</option>)}</select></label>}
      {error?<p role="alert">Published record URLs are unavailable. Reopen View to try again.</p>:entry.liveRecords&&!records?<p role="status">Loading published records…</p>:!links.length?<p>No published addresses are available.</p>:null}
      <ul className="max-h-72 space-y-2 overflow-auto">{editRecord?records?.records.map(record=><li key={record.id}><Button variant="link" onClick={()=>editRecord(record.id,record.path)}>{record.path}</Button></li>):[...new Set(links)].map(path=>{
        const href=locale&&locale!==entry.sourceLocale?'/'+encodeURIComponent(locale)+path:path;
        return <li key={path}><a className="break-all underline" href={href} target="_blank" rel="noopener noreferrer">{href}</a></li>;
      })}</ul>
      {entry.liveRecords&&(offset>0||records?.nextOffset!=null)&&<div className="flex gap-2">
        <Button variant="outline" disabled={!offset||!records} onClick={()=>setOffsets(values=>values.slice(0,-1))}>Previous</Button>
        <Button variant="outline" disabled={records?.nextOffset==null} onClick={()=>{
          if(records?.nextOffset!=null)setOffsets(values=>[...values,records.nextOffset!]);
        }}>Next</Button>
      </div>}
    </DialogContent>
  </Dialog>;
}
