import { z } from 'zod';
import { editorialCoverUrlSchema } from './editorial.js';
import type { PageLayoutData, PageComponent } from '../ssr/types.js';

const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
const copy = (n: number) => z.string().max(n).refine(v => !/[\x00-\x08]/.test(v));
export const templateSettingsSchema = z.object({
    version: z.literal(1), preset: z.enum(['navy', 'charcoal']),
    colors: z.object({ background: color.optional(), surface: color.optional(), text: color.optional(), muted: color.optional(), primary: color.optional(), border: color.optional() }).strict(),
    font: z.enum(['system', 'serif']), width: z.number().int().min(900).max(1440), spacing: z.number().int().min(24).max(88), radius: z.number().int().min(0).max(24),
    hero: z.object({ mode: z.enum(['none','image','slider']), heading: copy(240), introduction: copy(1000), height: z.number().int().min(240).max(560), mobileHeight: z.number().int().min(200).max(460),
        slides: z.array(z.object({ src: editorialCoverUrlSchema, alt: copy(500), focalX: z.number().min(0).max(100), focalY: z.number().min(0).max(100) }).strict()).max(8),
        autoplay: z.boolean(), interval: z.number().int().min(5).max(30), controls: z.boolean() }).strict(),
    sections: z.object({ guidance: z.boolean(), programs: z.boolean(), articles: z.boolean(), counselor: z.boolean() }).strict(),
    programCount: z.number().int().min(1).max(12), articleCount: z.number().int().min(1).max(12),
    programHeading: copy(200), articleHeading: copy(200), counselorHeading: copy(240), counselorCopy: copy(1000),
}).strict();
export type TemplateSettings = z.infer<typeof templateSettingsSchema>;
export const landingRootSchema = z.object({ version: z.literal(1), settings: templateSettingsSchema }).strict().superRefine((root,ctx)=>{
    for(const message of templateContrastIssues(root.settings))ctx.addIssue({code:z.ZodIssueCode.custom,message});
});
export function defaultTemplateSettings(): TemplateSettings {
    return { version:1,preset:'navy',colors:{},font:'system',width:1180,spacing:56,radius:16,
        hero:{mode:'image',heading:'Find your study options in {destination}',introduction:'Explore institutions and programs. Find a path that fits your goals, and get guidance for your next step.',height:340,mobileHeight:280,slides:[],autoplay:false,interval:7,controls:true},
        sections:{guidance:true,programs:true,articles:true,counselor:true},programCount:6,articleCount:3,
        programHeading:'Explore study programs',articleHeading:'Study guides',counselorHeading:'Your next step starts with a conversation.',counselorCopy:'Talk through your study goals and application options with a counselor.' };
}
export function templatePalette(input: TemplateSettings) {
    const s=templateSettingsSchema.parse(input);
    return { background:'#ffffff',surface:'#f4f6f8',text:'#172033',muted:'#536174',primary:s.preset==='navy'?'#122d50':'#252a32',border:'#dce2e9',...s.colors };
}
export function templateContrastIssues(input:TemplateSettings):string[]{
    if(!templateSettingsSchema.safeParse(input).success)return ['Check template settings'];
    const p=templatePalette(input),lum=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i]!,0);
    const ratio=(a:string,b:string)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    return [...(ratio(p.text,p.background)<4.5?['Text/background contrast is too low']:[]),...(ratio('#ffffff',p.primary)<4.5?['Primary color needs enough contrast with white button/header text']:[])];
}
export function readLandingSettings(layout: PageLayoutData): TemplateSettings | undefined {
    return layout.root?.directoryLanding === undefined ? undefined : landingRootSchema.parse(layout.root.directoryLanding).settings;
}
export function landingQueryParams(layout:PageLayoutData,id:string,params:Record<string,unknown>):Record<string,unknown>{
    const settings=readLandingSettings(layout);if(!settings)return params;
    const find=(nodes:PageComponent[]):PageComponent|undefined=>{for(const n of nodes){if(n.id===id)return n;const found=n.children&&find(n.children);if(found)return found;}return undefined;};
    const node=find(layout.content),role=node?.props?.templateList;
    return role==='program'||role==='article'?{...params,limit:role==='program'?settings.programCount:settings.articleCount}:params;
}
const literal=(s:string)=>s.replace(/\{(?=[{%])/g,'{\u200b');
const hsl=(hex:string)=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255) as [number,number,number];const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;h=(h*60+360)%360;}return `${h.toFixed(2)} ${(s*100).toFixed(2)}% ${(l*100).toFixed(2)}%`;};
/** Settings live in the saved homepage, separately from approved source content. */
export function projectTemplatePresentation<T extends PageLayoutData>(layout:T, configuration:{site:{name:string;destination:string};routes:{directory:string;blog:string};browsing:{defaultCollection:string}}, inherited?:TemplateSettings):T {
    const settings=readLandingSettings(layout)??inherited;
    if(!settings)return layout;
    const s=templateSettingsSchema.parse(settings),p=templatePalette(s);
    const slots:Record<string,Record<string,unknown>>={
        page:{backgroundColor:p.background,color:p.text,fontFamily:s.font==='serif'?'Georgia, serif':'system-ui, -apple-system, Segoe UI, sans-serif'},
        header:{backgroundColor:p.primary,color:'#ffffff'}, section:{padding:`${s.spacing}px 24px`,maxWidth:`${s.width}px`,margin:'0 auto',width:'100%'},
        card:{backgroundColor:p.background,color:p.text,border:`1px solid ${p.border}`,borderRadius:`${s.radius}px`},
        button:{backgroundColor:p.primary,color:'#ffffff',borderRadius:`${Math.min(s.radius,12)}px`},soft:{backgroundColor:p.surface,color:p.text},
        muted:{color:p.muted},
    };
    const values={programHeading:s.programHeading,articleHeading:s.articleHeading,counselorHeading:s.counselorHeading,counselorCopy:s.counselorCopy};
    const walk=(node:PageComponent):PageComponent|null=>{
        const props={...node.props};
        if(props.templateSection && !s.sections[props.templateSection as keyof typeof s.sections])return null;
        if(props.templateText && Object.hasOwn(values,String(props.templateText)))props.text=literal(values[props.templateText as keyof typeof values]);
        if(props.templateLink==='blog')props.href=configuration.routes.blog;
        if(props.templateLink==='institutions')props.href=configuration.routes.directory+'?type=institution';
        if(props.templateLink==='programs')props.href=configuration.routes.directory+'?type=program';
        // Like browsing state, a tuple keeps public copy out of recursive Liquid resolution.
        if(props.templateHero!==undefined)props.templateHeroState=[{settings:s.hero,palette:p,destination:configuration.site.destination}];
        if(props.templateSearch!==undefined)props.templateSearchState={path:configuration.routes.directory,collection:configuration.browsing.defaultCollection==='program'?'program':'institution'};
        const styles={...(typeof props.templateStyle==='string'?slots[props.templateStyle]??{}:{}),...node.styles};
        return {...node,props,styles,...(node.children?{children:node.children.map(walk).filter((n):n is PageComponent=>!!n)}:{})};
    };
    const previous=layout.root?.containerStyles as Record<string,unknown>|undefined;
    const styleValues=(previous?.values??previous??{}) as Record<string,unknown>;
    return {...layout,root:{...layout.root,containerStyles:{values:{...styleValues,'--fb-template-primary':p.primary,'--fb-template-width':`${s.width}px`,'--primary':hsl(p.primary),'--primary-foreground':'0 0% 100%','--background':hsl(p.background),'--foreground':hsl(p.text),'--border':hsl(p.border),'--muted-foreground':hsl(p.muted)}}},content:layout.content.map(walk).filter((n):n is PageComponent=>!!n)};
}
