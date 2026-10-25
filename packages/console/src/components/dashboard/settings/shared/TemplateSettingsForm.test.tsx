import React from 'react';import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {createEducationLanding,defaultTemplateSettings} from '@frontbase/edge-core/directory/configuration';
import {TemplateSettingsForm} from './TemplateSettingsForm';
vi.mock('@/components/builder/directory/TemplateSettingsEditor',()=>({TemplateSettingsEditor:({value,onChange}:any)=><select aria-label="Preset" value={value.preset} onChange={e=>onChange({...value,preset:e.target.value})}><option value="navy">Navy</option><option value="charcoal">Charcoal</option></select>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const id='00000000-0000-4000-8000-000000000001',a='a'.repeat(64),b='b'.repeat(64);
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
function fixture(conflict=false,unstable=false){let page={id,isHomepage:true,layoutData:createEducationLanding(defaultTemplateSettings())},hash=a,reads=0;const writes:any[]=[];
    const fetcher=vi.fn(async(path:string,init:any)=>{
        if(path==='/api/pages/')return response({data:[page]});
        if(path===`/api/pages/${id}/`)return response({data:page});
        if(path.endsWith('/change-state/'))return response({hash:unstable&&++reads>1?b:hash,draft:true});
        if(path.endsWith('/changes/')){const payload=JSON.parse(init.body);writes.push(payload);if(conflict)return response({},409);page={...page,layoutData:payload.patch.layoutData};hash=b;return response({status:'applied'});}
        throw Error('unexpected endpoint');
    });vi.stubGlobal('fetch',fetcher);return {writes,fetcher};
}
describe('template settings guarded save',()=>{
    it('builder publication mode does not expose another homepage editor or save path',async()=>{
        const {writes}=fixture();render(<TemplateSettingsForm preparationOnly/>);
        await waitFor(()=>expect(screen.getByText('Prepare homepage version')).not.toBeDisabled());
        expect(screen.queryByLabelText('Preset')).toBeNull();
        expect(screen.queryByText('Save template settings')).toBeNull();
        expect(writes).toHaveLength(0);
    });
    it('uses the existing draft-change API and retains the component tree',async()=>{
        const {writes}=fixture();render(<TemplateSettingsForm/>);await screen.findByLabelText('Preset');await waitFor(()=>expect(screen.getByText('Save template settings')).not.toBeDisabled());
        fireEvent.change(screen.getByLabelText('Preset'),{target:{value:'charcoal'}});fireEvent.click(screen.getByText('Save template settings'));await screen.findByText(/Template settings saved in the homepage draft/);
        expect(writes).toHaveLength(1);expect(writes[0].expectedStateHash).toBe(a);expect(writes[0].patch.layoutData.root.directoryLanding.settings.preset).toBe('charcoal');expect(writes[0].patch.layoutData.content[0].children.length).toBeGreaterThan(5);
    });
    it('retains edits and refuses blind replay after a concurrent-change conflict',async()=>{
        const {writes}=fixture(true);render(<TemplateSettingsForm/>);await waitFor(()=>expect(screen.getByText('Save template settings')).not.toBeDisabled());fireEvent.change(screen.getByLabelText('Preset'),{target:{value:'charcoal'}});fireEvent.click(screen.getByText('Save template settings'));await screen.findByText(/The homepage changed/);
        expect(writes).toHaveLength(1);expect(screen.getByLabelText('Preset')).toHaveValue('charcoal');expect(screen.getByText('Save template settings')).toBeDisabled();
    });
    it('does not enable save when the page changed during loading',async()=>{
        const {writes}=fixture(false,true);render(<TemplateSettingsForm/>);await screen.findByText(/Could not load a stable homepage draft/);expect(writes).toHaveLength(0);expect(screen.getByText('Create homepage landing layout')).toBeDisabled();
    });
});
