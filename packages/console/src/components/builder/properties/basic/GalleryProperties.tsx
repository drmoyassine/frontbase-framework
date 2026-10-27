import React from 'react';
import {VariableInput} from '../../VariableInput';
import {AssetUploader} from '@/components/shared/AssetUploader';
import {SchemaDrivenProperties} from '../../SchemaDrivenProperties';
import {getPropertySchema} from '../../registry/propertySchemas';

export function GalleryProperties({props,updateProp}:{props:Record<string,any>;updateProp:(key:string,value:any)=>void}){
 let parsed:unknown=props.media;
 if(typeof parsed==='string'){try{parsed=JSON.parse(parsed);}catch{parsed=String(props.media).split(/\r?\n/).filter(Boolean);}}
 const items:Array<{src:string;type:string;alt:string;poster?:string}>=Array.isArray(parsed)?parsed.slice(0,24).map(item=>typeof item==='string'?{src:item,type:'auto',alt:''}:{src:item?.src??item?.url??'',type:item?.type??'auto',alt:item?.alt??'',poster:item?.poster??''}):[];
 const bound=typeof props.media==='string'&&props.media.includes('{{');
 const save=(next:typeof items)=>updateProp('media',JSON.stringify(next));
 return <div className="space-y-4">
  <label className="block text-sm">Media source (@ field or one URL per line)<VariableInput value={typeof props.media==='string'?props.media:JSON.stringify(props.media??[])} onChange={value=>updateProp('media',value)} multiline/></label>
  <p className="text-xs text-muted-foreground">One item becomes a cover. Multiple items become tiles. Images, MP4/WebM, YouTube and Vimeo are supported. Bind an array of URLs or objects with src, type, alt and optional poster.</p>
  {!bound&&<div className="space-y-3">{items.map((item,index)=><div className="rounded border p-2 space-y-2" key={index}>
   <label className="block text-xs">Media {index+1} URL<input aria-label={`Media ${index+1} URL`} className="w-full border rounded bg-background p-2" value={item.src} onChange={e=>save(items.map((old,i)=>i===index?{...old,src:e.target.value}:old))}/></label>
   <label className="block text-xs">Type<select aria-label={`Media ${index+1} type`} className="w-full border rounded bg-background p-2" value={item.type} onChange={e=>save(items.map((old,i)=>i===index?{...old,type:e.target.value}:old))}><option value="auto">Detect from URL</option><option value="image">Image</option><option value="video">Video file</option></select></label>
   <label className="block text-xs">Description<input aria-label={`Media ${index+1} description`} className="w-full border rounded bg-background p-2" value={item.alt} onChange={e=>save(items.map((old,i)=>i===index?{...old,alt:e.target.value}:old))}/></label>
   <label className="block text-xs">Video poster URL<input aria-label={`Media ${index+1} poster`} className="w-full border rounded bg-background p-2" value={item.poster??''} onChange={e=>save(items.map((old,i)=>i===index?{...old,poster:e.target.value}:old))}/></label>
   <div className="flex gap-2"><button type="button" disabled={!index} onClick={()=>{const next=[...items];[next[index-1],next[index]]=[next[index],next[index-1]];save(next);}}>Move up</button><button type="button" onClick={()=>save(items.filter((_,i)=>i!==index))}>Remove</button></div>
  </div>)}<button type="button" className="rounded border p-2" disabled={items.length>=24} onClick={()=>save([...items,{src:'',type:'auto',alt:''}])}>Add media</button>
  <AssetUploader value="" assetType="image" accept="image/*,video/mp4,video/webm" maxSize={50*1024*1024} label="Upload or choose media" onChange={src=>{if(src&&items.length<24)save([...items,{src,type:'auto',alt:''}]);}}/>
  </div>}
  <SchemaDrivenProperties fields={getPropertySchema('Gallery')!.general!.filter(field=>field.name!=='media')} props={props} updateProp={updateProp}/>
 </div>;
}
