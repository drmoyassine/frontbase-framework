import {createMenuDefinition,publicMenuAudience,menuDocumentSchema} from '@frontbase/edge-core/menus';
import {publicationHash} from './publication-hash.js';
import type {PageLayoutData,PageComponent} from '@frontbase/edge-core';
import {createEducationLanding,defaultTemplateSettings,directoryLayoutQueries,directoryQueryBindingSchema} from '@frontbase/edge-core/directory/configuration';
import {addDirectoryTemplate} from '@frontbase/edge-core/directory/starter';

export const bookingTemplate = {id:'booking-for-x',version:1,name:'Booking for X',description:'An editable directory with listing, institution, program and article layouts. Configure it for your education site.',roles:['home','directory','article-index','institution','program','article']} as const;
export async function templateId(owner:string,role:string){const hash=await digest('booking-for-x:v1:'+owner+':'+role);return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;}
export async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');}
export function bookingMenus(){
 const header=createMenuDefinition('bfx-header','header'),footer=createMenuDefinition('bfx-footer','footer');
 const item=(id:string,label:string,href:string)=>({id,label,href,audience:publicMenuAudience(),children:[]});
 header.design={...header.design,background:'#123052',foreground:'#ffffff',componentProps:{showLanguageSwitcher:true}};
 header.items=[item('bfx-institutions','Institutions','/explore/?type=institution'),item('bfx-programs','Programs','/explore/?type=program'),item('bfx-blog','Blog','/blog/')];
 footer.items=[{...item('bfx-footer-links','Explore','/explore/'),children:[item('bfx-footer-institutions','Institutions','/explore/?type=institution'),item('bfx-footer-programs','Programs','/explore/?type=program'),item('bfx-footer-blog','Blog','/blog/')]}];
 return menuDocumentSchema.parse({schemaVersion:1,revision:1,menus:[header,footer]});
}
export async function bookingPages(owner:string){
 const menuHash=await publicationHash(bookingMenus());
 const definitions=[['home','Homepage','home'],['directory','Explore','explore'],['article-index','Blog','blog'],['institution','Institution detail','institution-detail'],['program','Program detail','program-detail'],['article','Blog article','article-detail']] as const;
 const pages=[];
 for(const [role,name,slug]of definitions){
  let layout:PageLayoutData;
  if(role==='home')layout=createEducationLanding(defaultTemplateSettings());
  else {layout={root:{siteConfiguration:{version:1,role}},content:[]};
   const collection=role==='directory'?'institution':role==='article-index'?'article':role;
   layout=addDirectoryTemplate({layoutData:layout},directoryQueryBindingSchema.parse({version:1,queryId:`directory.${collection}.${role==='directory'||role==='article-index'?'list':'detail'}` as any,params:role==='directory'||role==='article-index'?{limit:12}:{path:'/preview-record/'}}));
   if(role==='directory')layout.content[layout.content.length-1]!.props!.directoryControls={version:1,tabs:true,search:true,sorting:true,filters:true,recordCount:true,pagination:true,paginationPosition:'bottom'};
  }
  // Every document uses normal authored nodes; no remote HTML, copied records or special runtime renderer.
  const containsFooter=(n:PageComponent):boolean=>n.props?.href==='/privacy-policy/'||(n.children??[]).some(containsFooter);
  let sequence=0;const walk=(nodes:PageComponent[]):PageComponent[]=>nodes.filter(n=>n.props?.templateStyle!=='header'&&!(n.props?.templateStyle==='soft'&&containsFooter(n))).filter(n=>!['/privacy-policy/','/terms-of-service/','/cookie-policy/'].includes(String(n.props?.href))).map(n=>({...n,id:`bfx-${role}-${++sequence}`,...(n.children?{children:walk(n.children)}:{})}));
  layout={...layout,root:{...layout.root,bookingForX:{version:1,role},appMenus:{schemaVersion:1,hash:menuHash,pageId:await templateId(owner,role)},containerStyles:{backgroundColor:'#f8fafc',color:'#0f172a'}},content:walk(layout.content)};
  directoryLayoutQueries(layout);
  pages.push({id:await templateId(owner,role),role,name,slug,layout});
 }
 return pages;
}
