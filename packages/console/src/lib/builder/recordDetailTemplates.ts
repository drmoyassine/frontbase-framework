import {v4 as uuid} from 'uuid';
import {serializeCondition} from '@frontbase/edge-core/conditions';
import {liveViewBindingSchema} from '@frontbase/edge-core/directory/configuration';
import type {ComponentData,Page} from '@/types/builder';
import {recordExpression,createRecordCard,type CardMapping} from './recordCardTemplates';

export type DetailMapping=CardMapping&Partial<Record<'description'|'requirements'|'curriculum'|'careers'|'language'|'degree'|'mode'|'scholarship'|'deadline'|'type'|'founded'|'students'|'address'|'latitude'|'longitude'|'institutionHref',string>>;
export type DetailTemplateInput={role:'institution'|'program';binding:Record<string,unknown>;mapping:DetailMapping;previewPath:string;contactUrl?:string;programBinding?:Record<string,unknown>;programMapping?:CardMapping;programItem?:ComponentData};
const present=(field:string)=>serializeCondition({left:{kind:'variable',path:'record.'+field},operator:'is_set'});
/** Starters author only ordinary primitives and existing bound Repeaters. Every child remains
 * independently selectable, movable and bindable. No saved records or special detail renderer. */
export function createRecordDetailTemplate(input:DetailTemplateInput,newId=uuid):ComponentData[]{
 const {role,mapping:m}=input;
 const node=(type:string,props:Record<string,unknown>={},children?:ComponentData[],styles:Record<string,unknown>={}):ComponentData=>({id:newId(),type,props,styles,...(children?{children}:{})});
 const heading=(text:string,level='2')=>node('Heading',{text,level},undefined,{margin:'0',fontSize:level==='1'?'clamp(1.8rem,4vw,3rem)':'1.5rem',lineHeight:'1.2',overflowWrap:'anywhere'});
 const text=(content:string,styles:Record<string,unknown>={})=>node('Text',{content},undefined,{lineHeight:'1.75',overflowWrap:'anywhere',...styles});
 const bound=(field:string,styles:Record<string,unknown>={})=>({...text(recordExpression(field),styles),visibilityCondition:present(field)});
 const prose=(field:string)=>({...bound(field,{whiteSpace:'pre-wrap'}),props:{content:recordExpression(field).replace(' }}',' | strip_html }}')}});
 const action=(type:'openPage'|'scrollToSection',target:string)=>[{id:newId(),trigger:'onClick',actionType:type,config:type==='openPage'?{pageUrl:target,openInNewTab:false}:{sectionId:target},workflowId:null,parameterMappings:{}}];
 const link=(label:string,url:string)=>node('Link',{text:label,underline:false,color:'inherit',actionBindings:action('openPage',url)},undefined,{textDecoration:'none',fontWeight:'600'});
 const panel={padding:'28px',border:'1px solid #e2e8f0',borderRadius:'18px',backgroundColor:'#fff',minWidth:'0'};
 const nav:ComponentData[]=[];
 const section=(label:string,children:ComponentData[],field?:string)=>{
  const section=node('Column',{gap:'20px',minHeight:'0',_layerName:label},[heading(label),...children],{...panel,scrollMarginTop:'90px'});
  if(field)section.visibilityCondition=present(field);
  const item=node('Link',{text:label,underline:false,color:'#334155',actionBindings:action('scrollToSection','#'+section.id)},undefined,{whiteSpace:'nowrap',padding:'14px 12px',textDecoration:'none',fontWeight:'600'});
  if(field)item.visibilityCondition=present(field);
  nav.push(item);return section;
 };
 const facts:ComponentData[]=[];
 for(const [label,field] of [['Institution type',m.type],['Founded',m.founded],['Students',m.students],['Degree',m.degree],['Study mode',m.mode],['Language',m.language],['Application deadline',m.deadline]] as const)if(field)facts.push({...node('Column',{gap:'6px',minHeight:'0'},[text(label,{fontSize:'13px',color:'#64748b'}),bound(field,{fontWeight:'600'})],{padding:'16px',borderRadius:'12px',backgroundColor:'#f8fafc'}),visibilityCondition:field===m.founded?serializeCondition({left:{kind:'variable',path:'record.'+field},operator:'gt',right:{kind:'literal',value:0}}):present(field)});
 if(m.duration)facts.push({...node('Column',{gap:'6px',minHeight:'0'},[text('Duration',{fontSize:'13px',color:'#64748b'}),text(recordExpression(m.duration)+(m.durationUnit?' '+recordExpression(m.durationUnit):''),{fontWeight:'600'})],{padding:'16px',borderRadius:'12px',backgroundColor:'#f8fafc'}),visibilityCondition:present(m.duration)});
 const sections:ComponentData[]=[];
 if(m.description)sections.push(section('Overview',[prose(m.description)],m.description));
 if(facts.length)sections.push(section('At a glance',[node('Container',{},facts,{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,180px),1fr))',gap:'12px'})]));
 for(const [label,field]of [['Curriculum',m.curriculum],['Entry requirements',m.requirements],['Career opportunities',m.careers]] as const)if(field)sections.push(section(label,[prose(field)],field));
 if(m.tuition){const fees=[text((m.currency?recordExpression(m.currency)+' ':'')+recordExpression(m.tuition),{fontSize:'1.7rem',fontWeight:'700'}),text('Confirm the fee period and current costs with the institution.',{fontSize:'14px',color:'#64748b'})];if(m.scholarship)fees.push(bound(m.scholarship,{whiteSpace:'pre-wrap'}));sections.push(section('Tuition and funding',fees,m.tuition));}
 if(m.intakes)sections.push(section('Intakes',[node('Badge',{text:recordExpression(m.intakes),splitValues:true,valueSeparator:',',variant:'outline',backgroundColor:'#eff6ff',textColor:'#123052',size:'md'})],m.intakes));
 if(m.address){const location:ComponentData[]=[bound(m.address,{whiteSpace:'pre-wrap'})];
  const addressQuery='{{ record.'+m.address+' | url_encode }}';
  const addMap=(query:string,condition?:string)=>{
   const embed=node('Embed',{embedType:'iframe',src:'https://maps.google.com/maps?q='+query+'&z=14&output=embed',title:'Institution location',height:'320px',width:'100%',loading:'lazy',sandbox:'allow-scripts allow-same-origin allow-forms'});
   const directions=link('View map and directions','https://www.google.com/maps/search/?api=1&query='+query);
   if(condition){embed.visibilityCondition=condition;directions.visibilityCondition=condition;}location.push(embed,directions);
  };
  if(m.latitude&&m.longitude){const coordinateConditions=[m.latitude,m.longitude].map(field=>({left:{kind:'variable' as const,path:'record.'+field},operator:'is_set' as const}));
   addMap(recordExpression(m.latitude)+','+recordExpression(m.longitude),serializeCondition({all:coordinateConditions}));
   addMap(addressQuery,serializeCondition({any:[m.latitude,m.longitude].map(field=>({left:{kind:'variable',path:'record.'+field},operator:'is_not_set'}))}));
  }else addMap(addressQuery);
  sections.push(section('Location',location,m.address));}
 if(role==='program'&&m.subtitle){const institution:ComponentData[]=[bound(m.subtitle,{fontSize:'1.2rem',fontWeight:'600'})];if(m.institutionHref)institution.push(link('Explore this institution',recordExpression(m.institutionHref)));sections.push(section('Institution',institution,m.subtitle));}
 const identity:ComponentData[]=[];
 if(m.logo)identity.push({...node('Image',{src:recordExpression(m.logo),alt:'',objectFit:'contain'},undefined,{width:'76px',height:'76px',backgroundColor:'#fff',padding:'8px',borderRadius:'14px',flexShrink:0}),visibilityCondition:present(m.logo)});
 identity.push(node('Column',{gap:'12px',minHeight:'0'},[heading(m.title?recordExpression(m.title):'Record title','1'),...(m.subtitle?[bound(m.subtitle,{color:'#475569'})]:[]),node('Row',{gap:'10px',wrap:true,stackOnMobile:false,minHeight:'0'},[...(m.city?[bound(m.city)]:[]),...(m.country?[bound(m.country)]:[])])],{minWidth:'0'}));
 const hero:ComponentData[]=[];
 if(m.image)hero.push(node('Image',{src:recordExpression(m.image),...(m.imageFallback?{fallbackSrc:recordExpression(m.imageFallback),fallbackOnError:true}:{}),hideWhenUnavailable:true,alt:m.title?recordExpression(m.title):'',objectFit:'cover'},undefined,{width:'100%',height:'clamp(200px,32vw,400px)',objectFit:'cover',borderRadius:'20px',display:'block'}));
 hero.push(node('Row',{gap:'20px',align:'center',stackOnMobile:false,minHeight:'0'},identity,{padding:'28px 0'}));
 const sidebar=node('Column',{gap:'18px',minHeight:'0',_layerName:'Inquiry sidebar'},[heading('Plan your next step'),text('Get guidance on entry requirements, costs and your application.'),...(input.contactUrl?[link('Speak to a counselor',input.contactUrl)]:[])],{...panel,flex:'1 1 280px',alignSelf:'start',position:'sticky',top:'90px'});
 if(input.contactUrl){const cta=sidebar.children!.at(-1)!;cta.styles={...cta.styles,display:'block',width:'100%',padding:'14px 18px',borderRadius:'10px',textAlign:'center',backgroundColor:'#123052',color:'#fff'};sidebar.stylesData={viewportOverrides:{mobile:{position:'fixed',top:'auto',bottom:'16px',left:'16px',right:'16px',width:'auto',zIndex:'30',padding:'12px',boxShadow:'0 8px 30px rgb(15 23 42 / 15%)'}}};for(const child of sidebar.children?.slice(0,2)??[])child.visibility={mobile:false,tablet:true,desktop:true};}
 const content=node('Column',{gap:'0',minHeight:'0'},[...hero,node('Row',{gap:'4px',stackOnMobile:false,minHeight:'0'},nav,{position:'sticky',top:'0',zIndex:4,backgroundColor:'#fff',borderBottom:'1px solid #e2e8f0',overflowX:'auto',marginBottom:'28px'}),node('Row',{gap:'28px',wrap:true,stackOnMobile:false,align:'start',minHeight:'0'},[node('Column',{gap:'24px',minHeight:'0'},sections,{flex:'2 1 600px',minWidth:'0'}),sidebar])],{maxWidth:'1180px',margin:'0 auto',padding:'24px clamp(16px,4vw,32px) 96px',color:'#0f172a',textAlign:'start',minWidth:'0'});
 const routeBinding=(binding:Record<string,unknown>,componentId:string,column:string)=>{
  const parsed=liveViewBindingSchema.parse({...binding,componentId,pagination:{enabled:false,page:0,pageSize:column==='id'?1:12},hiddenFilters:[...(Array.isArray(binding.hiddenFilters)?binding.hiddenFilters:[]),{id:newId(),column,operator:'eq',value:{kind:'variable',path:'page.recordId'}}]});return parsed;
 };
 const detail=node('Repeater',{columns:1,mobileColumns:1,tabletColumns:1,layout:'list',gap:0,controls:{search:false,count:false,ordering:false},_layerName:role==='institution'?'Institution detail':'Program detail'},[content],{minWidth:'0'});
 detail.props.binding=routeBinding(input.binding,detail.id,'id');
 // Retain the existing detail route contract and its authoring sample for canvas context.
 const contract=node('Container',{directoryQuery:{version:1,queryId:'directory.'+role+'.detail',params:{path:input.previewPath}},_layerName:'Detail route preview'},[],{display:'none'});
 const result=[contract,detail];
 if(role==='institution'&&input.programBinding){
  const cloneItem=(item:ComponentData):ComponentData=>({...item,id:newId(),...(item.children?{children:item.children.map(cloneItem)}:{}),...(item.versions?{versions:item.versions.map(version=>({...version,overrides:{...version.overrides,...(version.overrides.children?{children:(version.overrides.children as ComponentData[]).map(cloneItem)}:{})}}))}:{})});
  const item=input.programItem?recordLinksToActions([cloneItem(input.programItem)],newId)[0]:createRecordCard('overlay',input.programMapping??{title:'title',image:'cover',logo:'logo',href:'originalPath'},[],newId);
  const programList=node('Repeater',{columns:3,mobileColumns:1,tabletColumns:2,gap:24,controls:{search:false,count:false,ordering:false,paginationStyle:'previous-next',paginationPosition:'bottom'},_layerName:'Programs at this institution'},[item]);
  const related=routeBinding(input.programBinding,programList.id,'institutionId');related.pagination={enabled:true,page:0,pageSize:12};programList.props.binding=related;
  result.push(node('Column',{gap:'24px',minHeight:'0'},[heading('Programs at this institution'),programList],{maxWidth:'1180px',margin:'0 auto',padding:'32px clamp(16px,4vw,32px)'}));
 }
 return result;
}

export function replaceDetailTemplate(page:Page,input:DetailTemplateInput):NonNullable<Page['layoutData']>{
 const old=page.layoutData??{root:{},content:[]};
 if(old.root.siteConfiguration?.role!==input.role)throw Error('Select the matching shared detail-page role first');
 return {...old,root:{...old.root,containerStyles:old.root.containerStyles?.values?{...old.root.containerStyles,values:{...old.root.containerStyles.values,backgroundColor:'#f8fafc',color:'#0f172a'}}:{...old.root.containerStyles,backgroundColor:'#f8fafc',color:'#0f172a'}},content:createRecordDetailTemplate(input)};
}

/** Explicit authoring migration: retain other actions and alternatives, promote only record URLs. */
export function recordLinksToActions(nodes:ComponentData[],newId=uuid):ComponentData[]{
 return nodes.map(node=>{let props=node.props;
  if(node.type==='Link'&&typeof props.href==='string'&&/\{\{\s*record[.[]/.test(props.href)&&!(props.actionBindings??[]).some((action:any)=>action.trigger==='onClick')){
   const {href,target,...rest}=props;
   props={...rest,actionBindings:[...(props.actionBindings??[]),{id:newId(),trigger:'onClick',actionType:'openPage',config:{pageUrl:href,openInNewTab:target==='_blank'},workflowId:null,parameterMappings:{}}]};
  }
  return {...node,props,...(node.children?{children:recordLinksToActions(node.children,newId)}:{}),...(node.versions?{versions:node.versions.map(version=>({...version,overrides:{...version.overrides,...(version.overrides.children?{children:recordLinksToActions(version.overrides.children as ComponentData[],newId)}:{})}}))}:{})};
 });
}
