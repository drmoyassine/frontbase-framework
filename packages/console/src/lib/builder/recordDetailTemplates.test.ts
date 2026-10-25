import {expect,it} from 'vitest';
import {renderPage} from '@frontbase/edge-core';
import {renderBlock} from '@frontbase/edge-core/browser/render-block';
import {templateRecordFields,directoryLayoutQueries} from '@frontbase/edge-core/directory/configuration';
import {createRecordDetailTemplate,recordLinksToActions} from './recordDetailTemplates';
const binding:any={componentId:'source',dataSourceId:'ds',tableName:'campuses',viewId:'view',pagination:{enabled:true,pageSize:12,page:0},sorting:{enabled:true,column:'title',direction:'asc'},filtering:{searchEnabled:false,filters:{}},columnOverrides:{},hiddenFilters:[{column:'country_id',operator:'eq',value:22}]};
const mapping={title:'title',image:'image',imageFallback:'institution.image',logo:'logo',description:'description',requirements:'requirements',tuition:'fee',currency:'currency',duration:'duration',durationUnit:'unit',intakes:'intakes',degree:'degree',city:'city',country:'country',subtitle:'institution.name',institutionHref:'institution.path',address:'institution.address'};
it.each(['institution','program'] as const)('%s authors ordinary editable nodes and Actions links with mandatory current-route filtering',role=>{
 const tree=createRecordDetailTemplate({role,binding,mapping,previewPath:'/campus/program/',programBinding:role==='institution'?binding:undefined});
 const ids=new Set<string>(),walk=(nodes:any[])=>{for(const node of nodes){expect(ids.has(node.id)).toBe(false);ids.add(node.id);expect(['Container','Repeater','Column','Row','Image','Text','Heading','Link','Badge','Card','Embed']).toContain(node.type);if(node.type==='Link'){expect(node.props.actionBindings[0].trigger).toBe('onClick');expect(node.props.href).toBeUndefined();}walk(node.children??[]);}};walk(tree);
 expect(tree[1].props.binding.hiddenFilters).toContainEqual({column:'country_id',operator:'eq',value:22});expect(tree[1].props.binding.hiddenFilters.at(-1)).toMatchObject({column:'id',operator:'eq',value:{kind:'variable',path:'page.recordId'}});
 expect(templateRecordFields(tree[1].children!)).toContain('institution.address');
 expect(directoryLayoutQueries({root:{},content:tree})).toHaveLength(1);
 expect(JSON.stringify(tree)).not.toMatch(/rating|sourceRows|initialRows/);
});
it.each([['English','History','Boston','Jan,Aug'],['Arabic','التاريخ','بوسطن','يناير,أغسطس']])('renders the %s current record, individual intake badges, actions and safe text',async(_,title,city,intakes)=>{
 const tree=createRecordDetailTemplate({role:'program',binding,mapping,previewPath:'/campus/history/',contactUrl:'mailto:advice@example.org'});
 tree[1].props.initialRows=[{id:7,title,city,intakes,image:'https://example.org/cover.jpg',description:'A study of history',fee:500,currency:'USD',degree:'BA',duration:3,unit:'Years','institution.name':'Campus','institution.path':'/campus/','institution.address':'Main Street'}];tree[1].props.initialTotal=1;
 const html=await renderBlock(tree[1],{} as any);
 for(const text of [title,city,'500','mailto:advice@example.org','Overview','At a glance','Tuition and funding'])expect(html).toContain(text);
 expect(html).toContain('href="#');expect(html).toContain('href="/campus/"');expect(html).toContain('text-align:start');
 const dom=document.createElement('div');dom.innerHTML=html;expect(dom.textContent).not.toContain('Entry requirements');expect(dom.textContent).not.toContain('Curriculum');expect(dom.textContent).not.toContain('undefined');
 for(const month of intakes.split(','))expect(html).toContain('>'+month+'<');
});
it('keeps script-like record content as plain escaped text',async()=>{
 const tree=createRecordDetailTemplate({role:'program',binding,mapping,previewPath:'/campus/'});tree[1].props.initialRows=[{id:7,title:'<script>bad()</script>',description:'<img src=x onerror=alert(1)>'}];tree[1].props.initialTotal=1;
 const html=await renderBlock(tree[1],{} as any);expect(html).not.toContain('<script>bad');expect(html).not.toContain('<img src=x');expect(html).toContain('&lt;script&gt;');
});

it('promotes legacy record links in default and alternative templates without replacing workflows or static URLs',()=>{
 const nodes:any=[{id:'list',type:'Repeater',props:{},children:[{id:'link',type:'Link',props:{text:'Campus',href:'{{ record.originalPath }}',target:'_blank'}}],versions:[{id:'alt',overrides:{children:[{id:'other',type:'Link',props:{href:'{{ record.path }}',actionBindings:[{trigger:'onClick',actionType:'runWorkflow',workflowId:'keep'}]}}]}}]},{id:'static',type:'Link',props:{href:'/about/'}}];
 const next=recordLinksToActions(nodes);expect(next[0].children![0].props.actionBindings[0]).toMatchObject({actionType:'openPage',config:{pageUrl:'{{ record.originalPath }}',openInNewTab:true}});expect(next[0].children![0].props.href).toBeUndefined();expect(next[0].versions).toEqual(nodes[0].versions);expect(next[1]).toEqual(nodes[1]);expect(nodes[0].children[0].props.href).toBe('{{ record.originalPath }}');
});

it('exposes route scalars through the shared renderer without mutating another request context',async()=>{
 const context:any={page:{title:'Owner title'},system:{env:'test'},user:null};
 const html=await renderPage({root:{publicationRecordContext:{recordId:7,parentId:4,secret:'NEVER_EXPOSE'}},content:[{id:'route-label',type:'Text',props:{content:'{{ page.recordId }} / {{ page.parentId }}'}}]},context);
 expect(html).toContain('>7 / 4<');expect(html).not.toContain('NEVER_EXPOSE');expect(context.page).toEqual({title:'Owner title'});
});

it('keeps interpolated related institution Actions on the current host and Arabic prefix',async()=>{
 const tree=createRecordDetailTemplate({role:'program',binding,mapping,previewPath:'/campus/history/'});tree[1].props.initialRows=[{id:7,title:'History','institution.name':'Campus','institution.path':'https://source.test/campus/'}];tree[1].props.initialTotal=1;
 const html=await renderPage({root:{siteNavigationOrigin:'https://source.test',localeNavigation:{locale:'ar',origins:['https://staging.test','https://source.test']}},content:[tree[1]]},{page:{},app:{},system:{env:'test'},user:null} as any);
 const dom=document.createElement('div');dom.innerHTML=html;expect([...dom.querySelectorAll('a')].find(a=>a.textContent==='Explore this institution')?.getAttribute('href')).toBe('/ar/campus/');
});
