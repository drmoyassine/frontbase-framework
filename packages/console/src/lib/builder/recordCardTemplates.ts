import {v4 as uuid} from 'uuid';
import {serializeCondition,variablePath} from '@frontbase/edge-core/conditions';
import type {ComponentData} from '@/types/builder';

export const cardLayouts = {image:'Image card',compact:'Compact card',text:'Text card'} as const;
export type CardLayout = keyof typeof cardLayouts;
export type CardMapping = Partial<Record<'title'|'image'|'logo'|'subtitle'|'city'|'country'|'flag'|'flagText'|'href',string>>;
export type CardDetail = {field:string;label:string};
export const recordExpression=(field:string)=>`{{ record[${JSON.stringify(field)}] }}`;
const present=(field:string)=>variablePath(`record.${field}`)?serializeCondition({left:{kind:'variable',path:`record.${field}`},operator:'is_set'}):undefined;

/** A starter is an ordinary authored tree, never a special runtime Card mode. */
export function createRecordCard(layout:CardLayout,mapping:CardMapping,details:CardDetail[]=[],newId=uuid):ComponentData {
    const node=(type:string,props:Record<string,unknown>,children?:ComponentData[],styles?:Record<string,unknown>):ComponentData=>({id:newId(),type,props,...(children?{children}:{}),...(styles?{styles}:{})});
    const bound=(type:string,field:string,props:Record<string,unknown>,styles?:Record<string,unknown>)=>({...node(type,props,undefined,styles),visibilityCondition:present(field)});
    const image=(field:string,logo=false)=>bound('Image',field,{src:recordExpression(field),alt:logo?'':mapping.title?recordExpression(mapping.title):'',objectFit:logo?'contain':'cover'},logo?{width:'48px',height:'48px',flexShrink:0,borderRadius:'8px',backgroundColor:'#fff'}:{width:'100%',height:layout==='compact'?'128px':'200px',objectFit:'cover',display:'block'});
    const title=node(mapping.href?'Link':'Heading',{text:mapping.title?recordExpression(mapping.title):'Record title',...(mapping.href?{href:recordExpression(mapping.href)}:{level:'3'})},undefined,{margin:'0',fontSize:'20px',fontWeight:'600',lineHeight:'1.35',overflowWrap:'anywhere',minWidth:'0',color:'inherit',textDecoration:'none'});
    const identity=node('Row',{gap:'12px',align:'center',stackOnMobile:false,minHeight:'0'},[...(mapping.logo?[image(mapping.logo,true)]:[]),title]);
    const location:ComponentData[]=[];
    if(mapping.flag)location.push(bound('Image',mapping.flag,{src:recordExpression(mapping.flag),alt:'',objectFit:'contain'},{width:'22px',height:'16px',flexShrink:0}));
    else if(mapping.flagText)location.push(bound('Text',mapping.flagText,{content:recordExpression(mapping.flagText),size:'18px'}));
    for(const field of [mapping.city,mapping.country])if(field)location.push(bound('Text',field,{content:recordExpression(field),size:'14px'},{color:'#64748b',overflowWrap:'anywhere'}));
    const metadata=details.filter(detail=>detail.field).map(detail=>bound('Text',detail.field,{content:(detail.label?detail.label+': ':'')+recordExpression(detail.field),size:'13px'},{padding:'5px 9px',borderRadius:'6px',backgroundColor:'#f1f5f9',color:'#334155',overflowWrap:'anywhere'}));
    const body=node('Column',{gap:'12px',minHeight:'0',minWidth:'0'},[
        identity,
        ...(location.length?[node('Row',{gap:'8px',align:'center',wrap:true,stackOnMobile:false,minHeight:'0'},location)]:[]),
        ...(mapping.subtitle?[bound('Text',mapping.subtitle,{content:recordExpression(mapping.subtitle),size:'14px'},{color:'#64748b',overflowWrap:'anywhere'})]:[]),
        ...(metadata.length?[node('Row',{gap:'8px',wrap:true,stackOnMobile:false,minHeight:'0'},metadata)]:[])
    ],{padding:'20px',flex:'1',textAlign:'start'});
    const cover=mapping.image&&layout!=='text'?image(mapping.image):null;
    const children=layout==='compact'?[node('Row',{gap:'0',align:'stretch',minHeight:'0'},[...(cover?[{...cover,styles:{...cover.styles,maxWidth:'160px'}}]:[]),body])]:[...(cover?[cover]:[]),body];
    return node('Card',{contentPadding:'0',textAlignment:'start',cardRadius:'12px'},children,{backgroundColor:'#fff',color:'#0f172a',height:'100%',minWidth:'0',boxShadow:'0 2px 8px rgb(15 23 42 / 5%)'});
}

/** Replace only the selected item structure, retaining binding, controls and alternatives. */
export function withRecordCard(node:ComponentData,versionId:string|undefined,card:ComponentData):ComponentData|null {
    const version=node.versions?.find(v=>v.id===versionId);
    if(version){
        if(!version.overrides.children)return null;
        return {...node,versions:node.versions!.map(v=>v.id===versionId?{...v,overrides:{...v.overrides,children:[card]}}:v)};
    }
    return {...node,children:[card]};
}
