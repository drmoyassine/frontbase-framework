import { z } from 'zod';

const key = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const audienceKey=z.string().min(1).max(100).refine(value=>!/[\x00-\x1f]/.test(value));
const path = z.string().min(1).max(400).refine(value => {
    try { const decoded=decodeURIComponent(value); return value.startsWith('/')&&!decoded.startsWith('//')&&!/[\\\x00-\x20?#]/.test(decoded)&&!decoded.split('/').some(p=>p==='.'||p==='..'); } catch { return false; }
});
export const menuAudienceSchema=z.object({
    authentication:z.enum(['everyone','anonymous','authenticated']),
    contactTypes:z.array(audienceKey).max(100),permissionLevels:z.array(audienceKey).max(100),
}).strict();
export type MenuAudience=z.infer<typeof menuAudienceSchema>;
export const publicMenuAudience=():MenuAudience=>({authentication:'everyone',contactTypes:[],permissionLevels:[]});
export interface VerifiedMenuAudience { authenticated:boolean; contactType?:string; permissionLevel?:string; }
/** Only a host's verified app-user/contact resolver supplies this input. Never client state. */
export function menuAudienceMatches(rule:MenuAudience,user:VerifiedMenuAudience|null):boolean {
    const parsed=menuAudienceSchema.safeParse(rule);if(!parsed.success)return false;
    const r=parsed.data,authenticated=user?.authenticated===true;
    if(r.authentication==='authenticated'&&!authenticated||r.authentication==='anonymous'&&authenticated)return false;
    if(r.contactTypes.length&&(!authenticated||!user?.contactType||!r.contactTypes.includes(user.contactType)))return false;
    if(r.permissionLevels.length&&(!authenticated||!user?.permissionLevel||!r.permissionLevels.includes(user.permissionLevel)))return false;
    return true;
}
const destination=z.string().min(1).max(2000).refine(value=>{
    if(value.startsWith('/'))return !value.startsWith('//')&&!/[\\\x00-\x20]/.test(value);
    if(value==='#'||/^#[a-zA-Z0-9_][\w-]*$/.test(value))return true;
    try {const url=new URL(value);return ['https:','http:','mailto:','tel:'].includes(url.protocol)&&!url.username&&!url.password&&!/[\x00-\x20]/.test(value);}catch{return false;}
});
const logoUrlSchema=z.string().max(2048).refine(value=>{
    try {const decoded=decodeURIComponent(value),url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&!/[{}"'<>\\\x00-\x20]/.test(decoded);}catch{return false;}
});
export interface MenuItem {id:string;label:string;href:string;audience:MenuAudience;children:MenuItem[];tone?:'navigation'|'primary'|'secondary'|'social';icon?:string;variant?:'default'|'outline'|'ghost';}
const item: z.ZodType<MenuItem>=z.lazy(()=>z.object({id:key,label:z.string().min(1).max(200),href:destination,audience:menuAudienceSchema,children:z.array(item).max(50),tone:z.enum(['navigation','primary','secondary','social']).optional(),icon:key.optional(),variant:z.enum(['default','outline','ghost']).optional()}).strict());
const cssLength=z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/);
const nativeProps=z.object({
    logo:z.object({type:z.enum(['text','image']).optional(),text:z.string().max(200).optional(),imageUrl:z.union([z.literal(''),logoUrlSchema]).optional(),link:destination.optional(),useProjectLogo:z.boolean().optional(),showIcon:z.boolean().optional()}).strict().optional(),
    scale:z.number().min(0.5).max(2).optional(),showDarkModeToggle:z.boolean().optional(),description:z.string().max(2000).optional(),mobileColumns:z.union([z.literal(1),z.literal(2),z.literal(3)]).optional(),hideOnMobile:z.boolean().optional(),hideOnDesktop:z.boolean().optional(),
    logoHeightBase:cssLength.optional(),iconSizeBase:cssLength.optional(),logoFontSizeBase:cssLength.optional(),menuFontSizeBase:cssLength.optional(),navPaddingBase:cssLength.optional(),navGapBase:cssLength.optional(),menuGapBase:cssLength.optional(),buttonGapBase:cssLength.optional(),logoFontWeight:z.string().regex(/^[1-9]00$/).optional(),
}).strict();
export const menuDefinitionSchema=z.object({
    id:key,name:z.string().trim().min(1).max(100),slot:z.enum(['header','footer','left-sidebar','right-sidebar']),enabled:z.boolean(),priority:z.number().int().min(0).max(10000),
    audience:menuAudienceSchema,
    placement:z.object({all:z.boolean(),pageIds:z.array(key).max(5000),excludePageIds:z.array(key).max(5000),paths:z.array(path).max(5000),excludePaths:z.array(path).max(5000)}).strict(),
    items:z.array(item).max(100),
    design:z.object({brand:z.string().max(200),brandHref:destination,logoUrl:z.union([z.literal(''),logoUrlSchema]),background:z.string().regex(/^#[0-9a-fA-F]{6}$/),foreground:z.string().regex(/^#[0-9a-fA-F]{6}$/),maxWidth:z.number().int().min(320).max(2000),sticky:z.boolean(),copyright:z.string().max(500),componentProps:nativeProps.optional()}).strict(),
}).strict();
export type MenuDefinition=z.infer<typeof menuDefinitionSchema>;
export const menuDocumentSchema=z.object({schemaVersion:z.literal(1),revision:z.number().int().min(0).max(2147483647),menus:z.array(menuDefinitionSchema).max(100)}).strict().superRefine((value,ctx)=>{
    const ids=new Set<string>();for(const menu of value.menus){
        if(ids.has(menu.id))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Duplicate menu'});ids.add(menu.id);
        const itemIds=new Set<string>();let count=0;
        const walk=(nodes:MenuItem[],depth:number)=>{if(depth>5){ctx.addIssue({code:z.ZodIssueCode.custom,message:'Menu nesting exceeds limit'});return;}for(const node of nodes){if(itemIds.has(node.id)||++count>500)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Invalid menu item graph'});itemIds.add(node.id);walk(node.children,depth+1);}};walk(menu.items,0);
    }
});
export type MenuDocument=z.infer<typeof menuDocumentSchema>;
/** Public layouts carry a private immutable snapshot digest, never its audience/item tree. */
export const menuReferenceSchema=z.object({schemaVersion:z.literal(1),hash:z.string().regex(/^[a-f0-9]{64}$/),pageId:key}).strict();
export type MenuReference=z.infer<typeof menuReferenceSchema>;
export const emptyMenuDocument=():MenuDocument=>({schemaVersion:1,revision:0,menus:[]});
export function createMenuDefinition(id:string,slot:MenuDefinition['slot']):MenuDefinition {
    return {id,name:slot==='header'?'Header':slot==='footer'?'Footer':'Sidebar',slot,enabled:true,priority:0,audience:publicMenuAudience(),placement:{all:true,pageIds:[],excludePageIds:[],paths:[],excludePaths:[]},items:[],design:{brand:'',brandHref:'/',logoUrl:'',background:'#ffffff',foreground:'#172033',maxWidth:1180,sticky:false,copyright:''}};
}
export function menuPlacementMatches(menu:MenuDefinition,pageId:string,pagePath:string):boolean {
    const p=menu.placement;if(p.excludePageIds.includes(pageId)||p.excludePaths.includes(pagePath))return false;
    return p.all||p.pageIds.includes(pageId)||p.paths.includes(pagePath);
}
/** Project only permitted items. No rejected label, target or nested payload reaches the renderer. */
export function visibleMenuItems(items:MenuItem[],audience:VerifiedMenuAudience|null):MenuItem[] {
    return items.filter(i=>menuAudienceMatches(i.audience,audience)).map(i=>({...i,children:visibleMenuItems(i.children,audience)}));
}
export function resolveMenuRegions(document:MenuDocument,pageId:string,pagePath:string,audience:VerifiedMenuAudience|null):Partial<Record<MenuDefinition['slot'],MenuDefinition>> {
    const parsed=menuDocumentSchema.parse(document);const regions:Partial<Record<MenuDefinition['slot'],MenuDefinition>>={};
    for(const menu of parsed.menus.filter(m=>m.enabled&&menuPlacementMatches(m,pageId,pagePath)&&menuAudienceMatches(m.audience,audience)).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))){
        if(regions[menu.slot]){if(regions[menu.slot]!.priority===menu.priority)throw Error('menu_placement_conflict');continue;}
        regions[menu.slot]={...menu,items:visibleMenuItems(menu.items,audience)};
    }return regions;
}
