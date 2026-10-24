import {expect,it} from 'vitest';
import {createRecordCard,withRecordCard} from './recordCardTemplates';
import {renderBlock} from '@frontbase/edge-core/browser/render-block';
import {templateRecordFields} from '@frontbase/edge-core/directory/configuration';
const mapping={title:'title',image:'cover',logo:'logo',city:'institutions.city_name',country:'institutions.country_name',flag:'institutions.country_flag',href:'originalPath'};
const details=[{field:'institutions.type',label:''},{field:'institutions.year_founded',label:''}];
it.each(['image','profile','compact','text'] as const)('%s generates only normal editable elements with unique identities and selected fields',layout=>{
 const card=createRecordCard(layout,mapping,details);const ids=new Set<string>();const walk=(n:any)=>{expect(['Card','Column','Row','Image','Text','Heading','Link']).toContain(n.type);expect(ids.has(n.id)).toBe(false);ids.add(n.id);n.children?.forEach(walk);};walk(card);
 expect(templateRecordFields([card])).toContain('institutions.type');expect(JSON.stringify(card)).not.toContain('rating');
 expect(JSON.stringify(card)).not.toContain('text-align:left');
});
it.each([['English','University of Malaga','Málaga','Spain','Private'],['Arabic','جامعة مالقة','مالقة','إسبانيا','خاصة']])('renders one %s title, selected metadata and logo through the shared engine',async(_language,title,city,country,type)=>{
 const html=await renderBlock(createRecordCard('image',mapping,details),{record:{title,cover:'https://example.org/campus.jpg',logo:'https://example.org/logo.svg',originalPath:'/university/','institutions.city_name':city,'institutions.country_name':country,'institutions.type':type,'institutions.year_founded':1991}} as any);
 for(const value of [title,city,country,type,'1991','logo.svg'])expect(html).toContain(value);
 expect(html).not.toContain('No image');expect(html).not.toContain('institutions.country_flag');expect(html).toContain('text-align:start');expect(html).toContain('flex-row');
});
it('omits empty optional data without broken placeholders or metadata labels; escapes record content',async()=>{
 const html=await renderBlock(createRecordCard('image',mapping,[{field:'institutions.type',label:'Type'}]),{record:{title:'<script>bad</script>',logo:'',cover:null,'institutions.type':null}} as any);
 expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('Type:');expect(html).not.toContain('No image');expect(html).not.toContain('<img');
});
it('retains bindings and other versions and refuses inherited version structure',()=>{
 const node:any={id:'list',type:'Repeater',props:{binding:{tableName:'institutions'},controls:{count:true}},children:[],versions:[{id:'program',overrides:{children:[{id:'old',type:'Text',props:{}}]}},{id:'inherited',overrides:{}}]};
 const card=createRecordCard('text',{title:'name'});const next=withRecordCard(node,'default',card)!;
 expect(next.props).toBe(node.props);expect(next.versions).toBe(node.versions);expect(next.children).toEqual([card]);expect(node.children).toEqual([]);
 const alternative=withRecordCard(node,'program',card)!;expect(alternative.children).toBe(node.children);expect(alternative.versions![0].overrides.children).toEqual([card]);expect(withRecordCard(node,'inherited',card)).toBeNull();
});
