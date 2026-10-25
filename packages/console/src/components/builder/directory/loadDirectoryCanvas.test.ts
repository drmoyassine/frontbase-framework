import { afterEach, expect, it, vi } from 'vitest';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { loadDirectoryCanvas, selectedDirectoryCollection } from './loadDirectoryCanvas';
import { addDirectoryTemplate } from './addDirectoryTemplate';
afterEach(()=>vi.unstubAllGlobals());
const saved={schemaVersion:1 as const,revision:2,configuration:emptyDirectoryConfiguration()};
const binding={version:1 as const,queryId:'directory.institution.list' as const,params:{q:'College'}};
const page:any={layoutData:{root:{siteConfiguration:{version:1,role:'directory'},custom:'kept'},content:[{id:'custom',type:'Text',props:{text:'Owner content'}}]}};
it.each(['directory.article.list','directory.article.detail'] as const)('collapses empty covers and restores populated covers in %s templates',async(queryId)=>{
    const layout=addDirectoryTemplate(page,{version:1,queryId,params:queryId.endsWith('.detail')?{path:'/blog/original/'}:{}});
    const queryIndex=layout.content.findIndex(node=>node.props.directoryQuery?.queryId===queryId);
    const image=layout.content[queryIndex].children![0].children![0];
    expect(image.props.recordBindings).toEqual({src:'cover',alt:'coverAlt',altFallback:'title',hideWhenEmpty:true});
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({revision:2,queryId,rows:[{title:'Article',cover:null,body:[{kind:'paragraph',runs:[{text:'Article text'}]}]}]})});vi.stubGlobal('fetch',fetcher);
    const empty=await loadDirectoryCanvas(layout,saved,new AbortController().signal);
    expect(empty.content[queryIndex].children![0].children![0].styles?.display).toBe('none');
    expect(empty.content[queryIndex].children![0].children![1].props.text).toBe('Article');
    fetcher.mockResolvedValue({ok:true,json:async()=>({revision:2,queryId,rows:[{title:'Article',cover:'https://media.example.test/cover.jpg',coverAlt:'Campus',body:[{kind:'paragraph',runs:[{text:'Article text'}]}]}]})});
    const populated=await loadDirectoryCanvas(layout,saved,new AbortController().signal);
    expect(populated.content[queryIndex].children![0].children![0].type).toBe('Image');expect(populated.content[queryIndex].children![0].children![0].props.src).toBe('https://media.example.test/cover.jpg');
    expect(populated.content[queryIndex].children![0].children![0].props.alt).toBe('Campus');
});
it('projects canonical semantic article bodies and metadata without saving fetched content',async()=>{
    const article={version:1 as const,queryId:'directory.article.detail' as const,params:{path:'/blog/original/'}};
    const layout=addDirectoryTemplate(page,article);const before=JSON.stringify(layout);
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({revision:2,queryId:article.queryId,rows:[{title:'Live article',byline:'Author',publishedAt:'2025-04-19',body:[{kind:'paragraph',runs:[{text:'CANONICAL_BODY'}]}]}]})}));
    const projected=await loadDirectoryCanvas(layout,saved,new AbortController().signal);
    expect(JSON.stringify(projected)).toContain('CANONICAL_BODY');expect(JSON.stringify(projected)).toContain('Author');expect(JSON.stringify(layout)).toBe(before);expect(before).not.toContain('CANONICAL_BODY');
});
it('saves references only and sends authenticated registered queries to the shared renderer projection',async()=>{
    const layout=addDirectoryTemplate(page,binding);const before=JSON.stringify(layout);
    const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({revision:2,queryId:binding.queryId,rows:[{title:'LIVE_RECORD_CANARY',originalPath:'/old-college/'}]})});vi.stubGlobal('fetch',fetch);
    const projected=await loadDirectoryCanvas(layout,saved,new AbortController().signal);
    expect(JSON.stringify(projected)).toContain('LIVE_RECORD_CANARY');expect(JSON.stringify(layout)).toBe(before);expect(before).not.toContain('LIVE_RECORD_CANARY');
    expect(projected.content[0]).toEqual(layout.content[0]);expect(projected.root.custom).toBe('kept');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({source:'published',expectedRevision:2,role:'institution',mode:'list',params:{q:'College'}});expect(fetch.mock.calls[0][1].credentials).toBe('include');
});
it('refuses stale query replies and request errors instead of returning old records',async()=>{
    const layout=addDirectoryTemplate(page,binding);
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({revision:1,queryId:binding.queryId,rows:[]})}));await expect(loadDirectoryCanvas(layout,saved,new AbortController().signal)).rejects.toThrow('revision mismatch');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));await expect(loadDirectoryCanvas(layout,saved,new AbortController().signal)).rejects.toThrow('unavailable');
});
it('retains exact original detail path and creates distinct editable component ids',()=>{
    const detail=addDirectoryTemplate(page,{version:1,queryId:'directory.program.detail',params:{path:'/old-parent/program/'}});
    expect(detail.content[1].type).toBe('Container');expect(detail.content[1].props.directoryQuery.params.path).toBe('/old-parent/program/');
    expect(addDirectoryTemplate(page,binding).content[1].id).not.toBe(addDirectoryTemplate(page,binding).content[1].id);
});

it('formats editorial dates with saved locale while keeping authoring source unchanged',async()=>{
    const article={version:1 as const,queryId:'directory.article.detail' as const,params:{path:'/blog/original/'}};
    const layout=addDirectoryTemplate(page,article),before=JSON.stringify(layout);
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({revision:2,queryId:article.queryId,rows:[{title:'Article',publishedAt:'2025-04-19T23:30:00-02:00',body:[{kind:'paragraph',runs:[{text:'Body'}]}]}]})}));
    const projected=await loadDirectoryCanvas(layout,{...saved,configuration:{...saved.configuration,site:{...saved.configuration.site,locale:'en-GB'}}},new AbortController().signal);
    expect(JSON.stringify(projected)).toContain('20 April 2025');expect(JSON.stringify(layout)).toBe(before);
});

it('uses the pinned published catalog, renders browsing state and prunes inactive collections',async()=>{
 const configuration=emptyDirectoryConfiguration();
 const layout:any={root:{siteConfiguration:{version:1,role:'directory'}},content:[{id:'browse',type:'Container',props:{directoryBrowsing:{version:1,tabs:true,search:true,pagination:true}}},{id:'institutions',type:'Repeater',props:{directoryQuery:{version:1,queryId:'directory.institution.list',params:{}}},children:[{id:'title',type:'Text',props:{recordBindings:{text:'title'}}}]},{id:'programs',type:'Repeater',props:{directoryQuery:{version:1,queryId:'directory.program.list',params:{}}},children:[]}]};
 const fetcher=vi.fn().mockImplementation(async(_url,request)=>{const input=JSON.parse(request.body);return {ok:true,json:async()=>({revision:2,queryId:`directory.${input.role}.list`,rows:[{title:'Captured campus'}],captureHash:'a'.repeat(64),configuration,total:16,hasMore:true})}});vi.stubGlobal('fetch',fetcher);
 const projected=await loadDirectoryCanvas(layout,saved,new AbortController().signal);
 expect(JSON.parse(fetcher.mock.calls[0][1].body).source).toBe('published');expect(JSON.parse(fetcher.mock.calls[1][1].body).expectedCapture).toBe('a'.repeat(64));
 expect(projected.content.map(row=>row.id)).toEqual(['browse','institutions']);expect(projected.content[0].props.directoryBrowsingState[0]).toMatchObject({total:16,hasNext:true,page:1,collection:'institution'});expect(projected.content[1].children[0].props.text).toBe('Captured campus');
});

it('selecting a program Repeater previews that collection without changing its saved default',()=>{
 const layout:any={root:{siteConfiguration:{version:1,role:'directory'}},content:[{id:'programs',type:'Repeater',props:{directoryQuery:{version:1,queryId:'directory.program.list',params:{}}},children:[{id:'program-title',type:'Text',props:{}}]}]};
 expect(selectedDirectoryCollection(layout,'program-title')).toBe('program');expect(selectedDirectoryCollection(layout,'unrelated')).toBeUndefined();expect(layout.root).toEqual({siteConfiguration:{version:1,role:'directory'}});
});

 it('resolves current-record preview filters from the captured detail, without persisting the sample ID',async()=>{
 const layout:any={root:{siteConfiguration:{version:1,role:'program'}},content:[{id:'contract',type:'Container',props:{directoryQuery:{version:1,queryId:'directory.program.detail',params:{path:'/campus/history/'}}},children:[]},{id:'detail',type:'Repeater',props:{binding:{hiddenFilters:[{column:'id',operator:'eq',value:{kind:'variable',path:'page.recordId'}}]}},children:[]}]};
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({revision:saved.revision,queryId:'directory.program.detail',rows:[{id:7,institutionId:4}],configuration:saved.configuration})})));
 const projected=await loadDirectoryCanvas(layout,saved,new AbortController().signal);expect(projected.content[1].props.binding.hiddenFilters[0].value).toBe(7);expect(layout.content[1].props.binding.hiddenFilters[0].value).toEqual({kind:'variable',path:'page.recordId'});
 });

it.each(['props','root'])('hydrates unseeded %s-binding authoring previews even when a copy overlay marked the public list SSR-only',async(shape)=>{
 const layout:any={root:{siteConfiguration:{version:1,role:'institution'}},content:[{id:'contract',type:'Container',props:{directoryQuery:{version:1,queryId:'directory.institution.detail',params:{path:'/campus/'}}},children:[]},{id:'detail',type:'Repeater',props:{localeReadOnly:true,binding:{tableName:'institutions',hiddenFilters:[]}},children:[]},{id:'seeded',type:'Repeater',props:{localeReadOnly:true,initialRows:[{id:7}],binding:{tableName:'institutions',hiddenFilters:[]}},children:[]}]};
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({revision:saved.revision,queryId:'directory.institution.detail',rows:[{id:7}],configuration:saved.configuration})})));
 if(shape==='root'){for(const node of layout.content.slice(1)){node.binding=node.props.binding;delete node.props.binding;}}
 const projected=await loadDirectoryCanvas(layout,saved,new AbortController().signal);
 expect(projected.content[1].props.localeReadOnly).toBe(false);expect(projected.content[2].props.localeReadOnly).toBe(true);expect(layout.content[1].props.localeReadOnly).toBe(true);
});
