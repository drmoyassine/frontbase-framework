import { renderHook, waitFor, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { useIframeCanvas } from './useIframeCanvas';
import { fetchReRender, fetchBuilderRender } from '@/lib/builder/builderApi';
vi.mock('@/lib/builder/builderApi', () => ({ fetchReRender: vi.fn().mockResolvedValue({ html: '<p>Preview</p>' }), fetchBuilderRender: vi.fn().mockResolvedValue({ html: '<p>Preview</p>' }) }));
const config = emptyDirectoryConfiguration(); config.site.name = 'USA';
const page: any = { id: 'p', name: 'Owner title', slug: 'owner', layoutData: { root: { siteConfiguration: { version: 1, role: 'program' } }, content: [{ id: 'name', type: 'Text', props: { text: 'Original', siteBindings: { text: 'site.name' } } }] } };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('shared canvas preview', () => {
    it('uses authenticated settings for the renderer without altering the authoring layout', async () => {
        const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ draft: { schemaVersion: 1, revision: 1, configuration: config } }) }); vi.stubGlobal('fetch', fetch);
        const before = JSON.stringify(page); const { result } = renderHook(() => useIframeCanvas(page));
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(fetch.mock.calls[0][1].credentials).toBe('include');
        expect(vi.mocked(fetchReRender).mock.calls[0][0].layout.content[0].props?.text).toBe('USA');
        expect(JSON.stringify(page)).toBe(before);
    });
    it('fails closed when the authenticated configuration is unavailable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false })); const { result } = renderHook(() => useIframeCanvas(page));
        await waitFor(() => expect(result.current.status).toBe('error')); expect(result.current.html).toBe('');
        expect(fetchReRender).not.toHaveBeenCalled(); expect(fetchBuilderRender).not.toHaveBeenCalled();
    });
    it('refreshes the shared revision on returning to the builder', async () => {
        let name = 'USA'; vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({ draft: { schemaVersion: 1, revision: 2, configuration: { ...config, site: { ...config.site, name } } } }) })));
        const { result } = renderHook(() => useIframeCanvas(page)); await waitFor(() => expect(result.current.status).toBe('ready'));
        name = 'Hungary'; act(() => window.dispatchEvent(new Event('focus')));
        await waitFor(() => expect(vi.mocked(fetchReRender).mock.calls.at(-1)?.[0].layout.content[0].props?.text).toBe('Hungary'));
    });
    it('renders registered rows without saving a data snapshot in the authoring page',async()=>{
        const bound:any=structuredClone(page);bound.layoutData.content.push({id:'cards',type:'Repeater',props:{directoryQuery:{version:1,queryId:'directory.institution.list',params:{}}},children:[{id:'title',type:'Heading',props:{text:'Template',recordBindings:{text:'title'}}}]});
        const before=JSON.stringify(bound);
        vi.stubGlobal('fetch',vi.fn().mockImplementation(async(url)=>({ok:true,json:async()=>url.endsWith('/preview/')?{revision:2,queryId:'directory.institution.list',rows:[{title:'Connected College'}]}:{draft:{schemaVersion:1,revision:2,configuration:config}}})));
        const {result}=renderHook(()=>useIframeCanvas(bound));await waitFor(()=>expect(result.current.status).toBe('ready'));
        expect(vi.mocked(fetchReRender).mock.calls.at(-1)?.[0].layout.content[1].children?.[0].props?.text).toBe('Connected College');expect(JSON.stringify(bound)).toBe(before);
    });
    it('clears a previously rendered canvas when the query becomes unavailable',async()=>{
        const bound:any=structuredClone(page);bound.layoutData.content.push({id:'cards',type:'Repeater',props:{directoryQuery:{version:1,queryId:'directory.institution.list',params:{}}},children:[]});let unavailable=false;
        vi.stubGlobal('fetch',vi.fn().mockImplementation(async(url)=>url.endsWith('/preview/')?{ok:!unavailable,json:async()=>({revision:2,queryId:'directory.institution.list',rows:[]})}:{ok:true,json:async()=>({draft:{schemaVersion:1,revision:2,configuration:config}})}));
        const {result}=renderHook(()=>useIframeCanvas(bound));await waitFor(()=>expect(result.current.status).toBe('ready'));unavailable=true;act(()=>window.dispatchEvent(new Event('focus')));
        await waitFor(()=>expect(result.current.status).toBe('error'));expect(result.current.html).toBe('');
    });
});
