import { z } from 'zod';
import { directoryConfigurationSchema, directoryConfigurationReadiness, directoryLayoutQueries, directoryQueryBindingSchema, directoryRecordBindingSchema,
    siteBindingsSchema, sitePageReferenceSchema } from '@frontbase/edge-core/directory/configuration';

const text = z.string().max(10000).refine(v => !/[\x00-\x08\x0b\x0c\x0e-\x1f]|\{\{|\{%/.test(v));
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const cssValue = z.union([z.number().finite(), z.string().max(500).refine(v => !/["'<>;{}\\\x00-\x1f]|url\s*\(|expression\s*\(|@import/i.test(v))]);
const styles = z.record(cssValue).refine(v => Object.keys(v).length <= 100 && Object.keys(v).every(k => /^[a-zA-Z][a-zA-Z0-9]*$/.test(k)));
const url = text.refine(v => {
    if (!v) return true;
    // Portable imports use local links; destination contacts are filled through siteBindings.
    if(!v.startsWith('/')||v.startsWith('//'))return false;
    if (/["'<>\\\x00-\x20]/.test(v)) return false;
    try { const decoded=decodeURIComponent(v);if(/["'<>\\\x00-\x20]/.test(decoded)||decoded.startsWith('//')||decoded.split(/[/?#]/).some(s=>s==='.'||s==='..'))return false; } catch { return false; }
    try { const u = new URL(v, 'https://template.invalid'); return (!v.startsWith('//') && u.protocol === 'https:' && !u.username && !u.password)
        && !decodeURIComponent(u.pathname).split('/').some(s => s === '.' || s === '..'); } catch { return false; }
});
const common = { className: z.string().max(500).regex(/^[A-Za-z0-9_ :/-]*$/).optional(), templateNodeId: id.optional(), templateId: z.literal('education-directory').optional(),
    siteBindings: siteBindingsSchema.optional(), recordBindings: directoryRecordBindingSchema.optional() };
const props = {
    Text: z.object({...common,text:text.optional()}).strict(), Paragraph: z.object({...common,text:text.optional()}).strict(),
    Heading: z.object({...common,text:text.optional(),level:z.enum(['1','2','3','4','5','6','h1','h2','h3','h4','h5','h6']).optional()}).strict(),
    Link: z.object({...common,text:text.optional(),href:url.optional(),color:cssValue.optional(),underline:z.boolean().optional(),target:z.enum(['_self','_blank']).optional()}).strict(),
    Image: z.object({...common,src:z.literal('').optional(),alt:text.optional(),width:cssValue.optional(),height:cssValue.optional(),objectFit:z.enum(['contain','cover','fill','none','scale-down']).optional(),borderRadius:cssValue.optional()}).strict(),
    Container: z.object({...common,anchor:id.optional(),directoryQuery:directoryQueryBindingSchema.optional(),columns:z.number().int().min(1).max(12).optional(),layout:z.enum(['grid','list']).optional()}).strict(),
    Repeater: z.object({...common,directoryQuery:directoryQueryBindingSchema,columns:z.number().int().min(1).max(12).optional(),layout:z.enum(['grid','list']).optional()}).strict(),
};
const nodeSchema = z.object({id,type:z.enum(['Text','Paragraph','Heading','Link','Image','Container','Repeater']),props:z.record(z.unknown()).optional(),
    styles:styles.optional(),stylesData:z.object({viewportOverrides:z.object({mobile:styles.optional(),tablet:styles.optional(),desktop:styles.optional()}).strict().optional()}).strict().optional(),
    children:z.array(z.unknown()).max(1500).optional(),visibility:z.object({mobile:z.boolean(),tablet:z.boolean(),desktop:z.boolean()}).strict().optional()}).strict();
const layoutSchema = z.object({root:z.object({siteConfiguration:sitePageReferenceSchema,containerStyles:styles.optional()}).strict(),content:z.array(z.unknown()).max(1500)}).strict();
const pageSchema = z.object({role:z.enum(['directory','institution','program','article-index','article']),slug:z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name:z.string().trim().min(1).max(200),title:z.string().max(500).optional(),layout:layoutSchema}).strict();
const artifactSchema = z.object({artifact:z.object({kind:z.literal('frontbase-template-export'),exportSchema:z.literal(1),templateId:z.literal('education-directory'),
    templateVersion:z.number().int().positive().max(1000000),createdAt:z.string().datetime().nullable(),source:z.string().max(200)}).strict(),
    configuration:directoryConfigurationSchema,requiredCapabilities:z.array(z.object({id:z.enum(['sql.datasource','storage.object','publication.runtime']),required:z.boolean(),resolveVia:z.string().max(200),note:z.string().max(500).optional()}).strict()).min(1).max(3),
    destinationBindings:z.array(z.string().max(200)).max(100),pages:z.array(pageSchema).min(1).max(5),notes:z.string().max(4000)}).strict();
const prohibited = new Set(['proto','prototype','constructor','records','rows','credentials','secrets','users','admins','approvals','captures','snapshots','recovery','activepointer','activegeneration','datasourceconfig','password','token','authorization','secretkey','servicekey']);
const secret = /PRIVATE_[A-Z_]*(?:CANARY|SECRET)|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sb_secret_|sk_live_|sk_test_|AKIA[0-9A-Z]{16})|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@/i;

/** Internal education import profile; not a general component registry or public stable export contract. */
export function validateEducationArtifact(input: unknown) {
    // Bound arbitrary input depth before schema traversal. Parsed HTTP JSON contains no functions/prototypes.
    const pending: {value:unknown;depth:number}[]=[{value:input,depth:0}];let items=0;
    while(pending.length){const {value,depth}=pending.pop()!;if(depth>64||++items>60000)throw new Error('template_artifact_invalid');
        if(typeof value==='string'&&secret.test(value))throw new Error('template_artifact_invalid');
        if(value&&typeof value==='object'){for(const [key,child] of Object.entries(value)){if(prohibited.has(key.toLowerCase().replace(/[^a-z]/g,'')))throw new Error('template_artifact_invalid');pending.push({value:child,depth:depth+1});}}
    }
    if(new TextEncoder().encode(JSON.stringify(input)).byteLength>1024*1024)throw new Error('template_artifact_invalid');
    const artifact=artifactSchema.parse(input), c=artifact.configuration;
    if(c.datasourceId||c.site.origin||c.site.name||c.site.destination||c.contacts.email||c.contacts.whatsapp||Object.values(c.collections).some(m=>m.scope.value!==''))throw new Error('template_artifact_destination_bound');
    const declared=new Set(artifact.destinationBindings);
    if(directoryConfigurationReadiness(c).some(gap=>!declared.has(gap)&&!declared.has('configuration.'+gap)))throw new Error('template_artifact_bindings');
    const capabilities=artifact.requiredCapabilities;
    if(!capabilities.some(c=>c.id==='sql.datasource'&&c.required)||new Set(capabilities.map(c=>c.id)).size!==capabilities.length)throw new Error('template_artifact_capabilities');
    if(new Set(artifact.pages.map(p=>p.role)).size!==artifact.pages.length||new Set(artifact.pages.map(p=>p.slug)).size!==artifact.pages.length||!artifact.pages.some(p=>p.role==='directory'))throw new Error('template_artifact_identity');
    for(const page of artifact.pages){
        if(page.layout.root.siteConfiguration.role!==page.role)throw new Error('template_artifact_role');
        const nodes=page.layout.content.map(value=>({value,depth:0})),ids=new Set<string>();
        while(nodes.length){const {value,depth}=nodes.pop()!;if(depth>24||ids.size>=1500)throw new Error('template_artifact_nodes');
            const n=nodeSchema.parse(value);if(ids.has(n.id))throw new Error('template_artifact_nodes');ids.add(n.id);
            const p=props[n.type].parse(n.props??{});if(p.templateNodeId!==undefined&&p.templateNodeId!==n.id)throw new Error('template_artifact_nodes');
            if(p.siteBindings?.text&&!['Text','Paragraph','Heading','Link'].includes(n.type)||p.siteBindings?.href&&n.type!=='Link')throw new Error('template_artifact_binding_type');
            for(const child of n.children??[])nodes.push({value:child,depth:depth+1});
        }
        const queries=directoryLayoutQueries(page.layout as any).map(q=>q.binding.queryId);
        const required=page.role==='directory'?['directory.institution.list','directory.program.list']:page.role==='article-index'?['directory.article.list']:[`directory.${page.role}.detail`];
        if(required.some(q=>!queries.includes(q as any)))throw new Error('template_artifact_query');
    }
    return artifact;
}
