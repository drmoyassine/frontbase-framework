import {escapeHtml} from './lib/utils.js';
import {resolvePropsStyles} from './lib/attrs.js';
import {clientVisibilityAttributes} from '../visibility.js';

type Media={src:string;type:'image'|'video'|'embed';alt:string;poster:string};
const safeUrl=(value:unknown)=>typeof value==='string'&&/^(https?:\/\/|\/(?!\/))/i.test(value.trim())&&!/[\u0000-\u001f]/.test(value)?value.trim():'';
/** Bounded ordinary media data; never accepts script/HTML embed content. */
export function galleryMedia(value:unknown):Media[]{
 let source=value;
 if(typeof source==='string'){
  if(source.length>100000)return [];
  const raw=source;
  try{source=JSON.parse(raw);}catch{source=raw.split(/\r?\n/).map(src=>src.trim()).filter(Boolean);}
 }
 if(!Array.isArray(source))source=source?[source]:[];
 const result:Media[]=[];
 for(const entry of (source as unknown[]).slice(0,24)){
  const item=typeof entry==='string'?{src:entry}:entry&&typeof entry==='object'?entry as Record<string,unknown>:{};
  let src=safeUrl(item.src??item.url);if(!src)continue;
  let type:Media['type']=item.type==='video'||/\.(mp4|webm|ogv)(?:[?#]|$)/i.test(src)?'video':'image';
  try{const url=new URL(src);let videoId='';
   if(['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(url.hostname))videoId=url.searchParams.get('v')||url.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)$/)?.[1]||'';
   if(url.hostname==='youtu.be')videoId=url.pathname.slice(1);
   if(/^[\w-]{11}$/.test(videoId)){src='https://www.youtube-nocookie.com/embed/'+videoId;type='embed';}
   if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(url.hostname)){const id=url.pathname.match(/\/(?:video\/)?(\d+)$/)?.[1];if(id){src='https://player.vimeo.com/video/'+id;type='embed';}}
  }catch{/* Local media paths remain valid. */}
  if(result.some(media=>media.src===src))continue;
  result.push({src,type,alt:String(item.alt??item.title??'').slice(0,500),poster:safeUrl(item.poster)});
 }
 return result;
}

export function renderGallery(id:string,props:Record<string,unknown>):string{
 let items=galleryMedia(props.media);
 if(!items.length)items=galleryMedia(props.coverSrc);
 if(!items.length)items=galleryMedia(props.fallbackSrc);
 for(const video of galleryMedia(props.videoSrc))if(video.type!=='image'&&!items.some(item=>item.src===video.src)&&items.length<24)items.push(video);
 if(!items.length&&props.hideWhenUnavailable!==false)return '';
 const numberOr=(value:unknown,fallback:number)=>value!=null&&Number.isFinite(Number(value))?Number(value):fallback;
 const height=Math.min(800,Math.max(160,Number(props.coverHeight)||360));
 const gap=Math.min(40,Math.max(0,numberOr(props.gap,8)));
 const radius=Math.min(80,Math.max(0,numberOr(props.radius,16)));
 const {className,styleString}=resolvePropsStyles('fb-gallery',props);
 const fallback=safeUrl(props.fallbackSrc),label=String(props.label||'Media gallery');
 const behavior=clientVisibilityAttributes(props)+(Array.isArray(props.actionBindings)&&props.actionBindings.length?` data-fb-props="${escapeHtml(JSON.stringify({actionBindings:props.actionBindings}))}"`:'');
 const media=items.map(item=>{
  const alt=escapeHtml(item.alt||String(props.alt||''));
  const attrs=`src="${escapeHtml(item.src)}" style="width:100%;height:100%;object-fit:${props.objectFit==='contain'?'contain':'cover'};display:block"`;
  const body=item.type==='image'?`<img ${attrs} alt="${alt}" loading="lazy" data-fb-image-fallback="${escapeHtml(fallback)}" data-fb-image-hide="true"/>`:item.type==='video'?`<video ${attrs} controls playsinline preload="metadata"${item.poster?` poster="${escapeHtml(item.poster)}"`:''} aria-label="${alt||escapeHtml(label)}"></video>`:`<iframe ${attrs} title="${alt||escapeHtml(label)}" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" frameborder="0"></iframe>`;
  return `<div class="fb-gallery-tile" data-media-type="${item.type}" style="min-width:0;overflow:hidden;border-radius:${radius}px;background:#e2e8f0">${body}</div>`;
 }).join('');
 return `<style>.fb-gallery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:var(--gallery-row);gap:var(--gallery-gap)}.fb-gallery-grid[data-count="1"]{grid-template-columns:minmax(0,1fr);grid-auto-rows:var(--gallery-height)}.fb-gallery-grid[data-featured="true"]>.fb-gallery-tile:first-child{grid-row:span 2}.fb-gallery-grid[data-count="2"]{grid-auto-rows:var(--gallery-height)}@media(max-width:640px){.fb-gallery-grid{grid-auto-rows:140px}.fb-gallery-grid[data-featured="true"]>.fb-gallery-tile:first-child{grid-column:1/-1;grid-row:auto;height:220px}.fb-gallery-grid[data-featured="true"]{grid-template-rows:220px}.fb-gallery-grid[data-count="1"],.fb-gallery-grid[data-count="2"]{grid-auto-rows:220px}}</style><div id="${escapeHtml(id)}" class="${escapeHtml(className)}"${behavior} role="group" aria-label="${escapeHtml(label)}" style="--gallery-height:${height}px;--gallery-row:${Math.round((height-gap)/2)}px;--gallery-gap:${gap}px;${escapeHtml(styleString)}"><div class="fb-gallery-grid" data-count="${items.length}" data-featured="${items.length>=3&&props.layout!=='grid'}">${media}</div></div>`;
}
