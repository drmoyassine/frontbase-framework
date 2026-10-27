import {it,expect,vi,afterEach} from 'vitest';
import {loadMenuCanvas} from './loadMenuCanvas';
import {menuPublicationRequest} from '@/components/dashboard/menus/api';
vi.mock('@/components/dashboard/menus/api',()=>({menuPublicationRequest:vi.fn()}));
afterEach(()=>vi.clearAllMocks());
it.each(['root','props'])('hydrates unseeded %s bindings after the final authenticated menu/copy projection',async(shape)=>{
 const original:any={root:{},content:[{id:'main',type:'Repeater',props:{localeReadOnly:true},...(shape==='root'?{binding:{tableName:'rows'}}:{})},{id:'seeded',type:'Repeater',props:{localeReadOnly:true,binding:{tableName:'rows'},initialRows:[{id:7}]}}]};if(shape==='props')original.content[0].props.binding={tableName:'rows'};
 vi.mocked(menuPublicationRequest).mockResolvedValue(Response.json({layout:original}));
 const projected=await loadMenuCanvas(original,'page','/page/',new AbortController().signal);
 expect(projected.content[0].props.localeReadOnly).toBe(false);expect(projected.content[1].props.localeReadOnly).toBe(true);expect(original.content[0].props.localeReadOnly).toBe(true);
 expect(menuPublicationRequest).toHaveBeenCalledWith('/api/project/menus/canvas/',expect.objectContaining({method:'POST'}));
});
