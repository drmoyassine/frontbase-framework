import { afterEach, expect, it, vi } from 'vitest';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { loadDirectoryCanvas } from './loadDirectoryCanvas';
import { addDirectoryTemplate } from './addDirectoryTemplate';
afterEach(()=>vi.unstubAllGlobals());
const saved={schemaVersion:1 as const,revision:2,configuration:emptyDirectoryConfiguration()};
const binding={version:1 as const,queryId:'directory.institution.list' as const,params:{q:'College'}};
const page:any={layoutData:{root:{siteConfiguration:{version:1,role:'directory'},custom:'kept'},content:[{id:'custom',type:'Text',props:{text:'Owner content'}}]}};
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
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({expectedRevision:2,role:'institution',mode:'list',params:{q:'College'}});expect(fetch.mock.calls[0][1].credentials).toBe('include');
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
