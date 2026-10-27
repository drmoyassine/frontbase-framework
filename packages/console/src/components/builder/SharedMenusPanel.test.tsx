import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {SharedMenusPanel} from './SharedMenusPanel';
const state=vi.hoisted(()=>({project:'a',request:vi.fn()}));
vi.mock('@/components/dashboard/menus/api',()=>({menuRequest:state.request}));
vi.mock('@/stores/useActiveProject',()=>({useActiveProject:(selector:any)=>selector({activeProjectId:state.project})}));
vi.mock('@/stores/auth',()=>({useAuthStore:(selector:any)=>selector({tenant:{slug:'owner'},user:{id:'user'}})}));
const page:any={id:'12345678-1234-4234-8234-123456789abc',layoutData:{root:{},content:[{id:'body',type:'Text',props:{text:'Original'}}]}};
const reference={schemaVersion:1,hash:'a'.repeat(64),pageId:page.id};
const draft=()=>new Response(JSON.stringify({document:{revision:2}}));
afterEach(()=>{cleanup();state.request.mockReset();state.project='a';});
describe('Shared menu draft references',()=>{
 it('adds only a reference, preserving the authored body',async()=>{
  state.request.mockResolvedValueOnce(draft()).mockResolvedValueOnce(new Response(JSON.stringify(reference)));
  const change=vi.fn();render(<SharedMenusPanel page={page} onChange={change}/>);
  await waitFor(()=>expect((screen.getByText('Use saved app menus') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText('Use saved app menus'));
  await waitFor(()=>expect(change).toHaveBeenCalledOnce());expect(change.mock.calls[0][0]).toEqual({...page.layoutData,root:{appMenus:reference}});expect(page.layoutData.root).toEqual({});
 });
 it('refuses a stale response after the body changes',async()=>{
  let resolve!:(value:Response)=>void;state.request.mockResolvedValueOnce(draft()).mockImplementationOnce(()=>new Promise<Response>(done=>{resolve=done;}));
  const change=vi.fn(),view=render(<SharedMenusPanel page={page} onChange={change}/>);
  await waitFor(()=>expect((screen.getByText('Use saved app menus') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('Use saved app menus'));
  view.rerender(<SharedMenusPanel page={{...page,layoutData:{...page.layoutData,content:[]}}} onChange={change}/>);resolve(new Response(JSON.stringify(reference)));
  await screen.findByText('The page changed while linking. Try again using the current draft.');expect(change).not.toHaveBeenCalled();
 });
 it('discards a response when the active project changes',async()=>{
  let resolve!:(value:Response)=>void;state.request.mockResolvedValueOnce(draft()).mockImplementationOnce(()=>new Promise<Response>(done=>{resolve=done;})).mockResolvedValueOnce(draft());
  const change=vi.fn(),view=render(<SharedMenusPanel page={page} onChange={change}/>);
  await waitFor(()=>expect((screen.getByText('Use saved app menus') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('Use saved app menus'));state.project='b';view.rerender(<SharedMenusPanel page={page} onChange={change}/>);resolve(new Response(JSON.stringify(reference)));
  await waitFor(()=>expect(state.request).toHaveBeenCalledTimes(3));expect(change).not.toHaveBeenCalled();
 });
});
