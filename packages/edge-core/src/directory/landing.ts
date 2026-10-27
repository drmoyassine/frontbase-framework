import type { PageLayoutData, PageComponent } from '../ssr/types.js';
import { defaultTemplateSettings, templateSettingsSchema, type TemplateSettings } from './template-settings.js';

/** Editable primitives and Repeaters. No consumer records, country IDs or endpoints. */
export function createEducationLanding(settings:TemplateSettings=defaultTemplateSettings()):PageLayoutData {
    const s=templateSettingsSchema.parse(settings);let sequence=0;
    const node=(type:string,props:Record<string,unknown>={},styles:Record<string,unknown>={},children?:PageComponent[]):PageComponent=>({id:`education-landing-${++sequence}`,type,props,styles,...(children?{children}:{})});
    const text=(value:string,styles:Record<string,unknown>={})=>node('Text',{text:value},styles);
    const link=(value:string,target:string,slot?:string)=>node('Link',{text:value,href:'',templateLink:target,...(slot?{templateStyle:slot}:{})},{color:'inherit',textDecoration:'none',padding:'10px 16px',display:'inline-flex',alignItems:'center',justifyContent:'center'});
    const contact=(label:string,kind:'contacts.email'|'contacts.whatsapp',primary=false)=>node('Link',{text:label,href:'',siteBindings:{href:kind,hideWhenEmpty:true},templateStyle:primary?'button':undefined},{color:'inherit',textDecoration:'none',padding:'12px 20px',border:'1px solid currentColor',borderRadius:'10px',display:'inline-flex',justifyContent:'center'});
    const list=(role:'program'|'article')=>node('Repeater',{directoryQuery:{version:1,queryId:`directory.${role}.list`,params:{limit:role==='program'?s.programCount:s.articleCount}},columns:3,layout:'grid',templateList:role},{},[
        node('Container',{templateStyle:'card'},{padding:'22px',display:'flex',flexDirection:'column',gap:'16px',height:'100%'},[
            node('Image',{recordBindings:{src:'cover',alt:'coverAlt',altFallback:'title',hideWhenEmpty:true},src:'',alt:'',height:'176px',width:'100%',objectFit:'cover',borderRadius:'10px'}),
            node('Heading',{level:'3',text:'Listing title',recordBindings:{text:'title'}},{fontSize:'1.15rem',lineHeight:'1.35',margin:'0'}),
            node('Text',{text:'',recordBindings:{text:'summary'},templateStyle:'muted'},{lineHeight:'1.6',display:'-webkit-box',WebkitLineClamp:'var(--fb-template-summary-lines, 3)',WebkitBoxOrient:'vertical',overflow:'hidden'}),
            node('Link',{text:role==='program'?'View program →':'Read guide →',href:'',recordBindings:{href:'originalPath',ariaLabel:'title'},templateStyle:'button'},{padding:'11px 16px',textDecoration:'none',marginTop:'auto',textAlign:'center'}),
        ]),
    ]);
    const section=(role:'program'|'article')=>node('Container',{templateStyle:'section',templateSection:role==='program'?'programs':'articles'},{display:'flex',flexDirection:'column',gap:'24px'},[
        node('Container',{}, {display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'12px'},[
            node('Heading',{text:role==='program'?s.programHeading:s.articleHeading,templateText:role==='program'?'programHeading':'articleHeading',level:'2'},{fontSize:'clamp(1.5rem, 3vw, 2rem)',margin:'0'}),link(role==='program'?'View all programs':'View all guides',role==='program'?'programs':'blog'),
        ]),list(role),
    ]);
    return {root:{directoryLanding:{version:1,settings:s}},content:[node('Container',{templateStyle:'page'},{minHeight:'100vh'},[
        node('Container',{templateStyle:'header'},{padding:'18px 24px',position:'relative',zIndex:5},[
            node('Container',{}, {maxWidth:'var(--fb-template-width,1180px)',margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'16px',flexWrap:'wrap'},[
                node('Link',{text:'Study directory',href:'/',siteBindings:{text:'site.name'}},{fontWeight:'700',fontSize:'1.35rem',textDecoration:'none',color:'#ffffff'}),
                node('Container',{templateMenu:{version:1}}, {width:'auto',margin:'0',flexShrink:0},[link('Institutions','institutions'),link('Programs','programs'),link('Study guides','blog'),contact('Contact a counselor','contacts.whatsapp')]),
            ]),
        ]),
        node('Container',{templateHero:{version:1}},{},[]),
        node('Container',{templateStyle:'section'},{paddingTop:'0',position:'relative',marginTop:'-28px',zIndex:1},[
            node('Container',{templateSearch:{version:1},templateStyle:'card'},{padding:'24px',boxShadow:'0 8px 30px rgba(20,35,55,.10)'},[]),
        ]),
        node('Container',{templateStyle:'section'},{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:'20px',paddingTop:'16px',paddingBottom:'24px'},[
            node('Container',{templateStyle:'card'},{padding:'24px',display:'flex',flexDirection:'column',alignItems:'flex-start',gap:'12px'},[node('Heading',{level:'2',text:'Explore institutions'},{fontSize:'1.2rem'}),text('Find a place to study and explore its programs.',{lineHeight:'1.6'}),link('Browse institutions →','institutions')]),
            node('Container',{templateStyle:'card'},{padding:'24px',display:'flex',flexDirection:'column',alignItems:'flex-start',gap:'12px'},[node('Heading',{level:'2',text:'Find your program'},{fontSize:'1.2rem'}),text('Explore study options that match your interests.',{lineHeight:'1.6'}),link('Browse programs →','programs')]),
            node('Container',{templateStyle:'card'},{padding:'24px',display:'flex',flexDirection:'column',alignItems:'flex-start',gap:'12px'},[node('Heading',{level:'2',text:'Get guidance'},{fontSize:'1.2rem'}),text('Talk through your goals and next steps with a counselor.',{lineHeight:'1.6'}),contact('Email a counselor','contacts.email')]),
        ]),section('program'),
        node('Container',{templateStyle:'soft',templateSection:'guidance'},{},[
            node('Container',{templateStyle:'section'},{},[node('Heading',{level:'2',text:'A clearer path to your next step'},{fontSize:'1.8rem'}),
                node('Container',{}, {display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:'32px'},[
                    ...[['01','Explore your options','Compare institutions and programs that fit your interests.'],['02','Check the requirements','Review the institution’s current entry requirements and deadlines.'],['03','Plan with a counselor','Talk through your questions and application options.']].map(([n,title,description])=>node('Container',{}, {display:'flex',flexDirection:'column',gap:'12px'},[text(n!,{fontSize:'1.3rem',fontWeight:'700'}),node('Heading',{level:'3',text:title},{fontSize:'1.1rem',margin:'0'}),text(description!,{lineHeight:'1.65'})])),
                ]),
            ]),
        ]),section('article'),
        node('Container',{templateStyle:'section',templateSection:'counselor'},{},[
            node('Container',{templateStyle:'header'},{padding:'36px',borderRadius:'18px',display:'flex',flexDirection:'column',gap:'18px'},[
                node('Heading',{level:'2',text:s.counselorHeading,templateText:'counselorHeading'},{fontSize:'clamp(1.5rem,3vw,2rem)',margin:'0'}),node('Text',{text:s.counselorCopy,templateText:'counselorCopy'},{lineHeight:'1.65'}),
                node('Container',{}, {display:'flex',flexWrap:'wrap',gap:'12px'},[contact('Chat on WhatsApp','contacts.whatsapp'),contact('Email a counselor','contacts.email')]),
            ]),
        ]),
        node('Container',{templateStyle:'soft'},{},[node('Container',{templateStyle:'section'},{display:'flex',gap:'20px',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between'},[
            node('Text',{text:'Study directory',siteBindings:{text:'site.name'}},{fontWeight:'700'}),link('Institutions','institutions'),link('Programs','programs'),link('Study guides','blog'),
            node('Link',{text:'Privacy policy',href:'/privacy-policy/'},{textDecoration:'none'}),node('Link',{text:'Terms',href:'/terms-of-service/'},{textDecoration:'none'}),node('Link',{text:'Cookies',href:'/cookie-policy/'},{textDecoration:'none'}),
        ])]),
    ])]};
}
