import userEvent from '@testing-library/user-event';
import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {vi,describe,it,expect,beforeEach} from 'vitest';
import {TemplateUrls} from './TemplateUrls';
import {emptyTemplatePolicy} from '@frontbase/edge-core/template-policy';
vi.mock('@/hooks/data/useRecordFields',()=>({useRecordFields:()=>({fields:[{name:'tuition'},{name:'institutions.title'}]})}));
vi.mock('@/components/builder/VariableInput',()=>({VariableInput:({value,onChange,ariaLabel}:any)=><input aria-label={ariaLabel} value={value} onChange={e=>onChange(e.target.value)}/>}));
const data={pageId:'program',name:'Program detail',role:'program',revision:'a'.repeat(64),policy:emptyTemplatePolicy(),locale:'en',records:[{identity:'programs:1',id:1,title:'Psychology',path:'/psychology/'}],columns:['id','title']};
beforeEach(()=>{vi.stubGlobal('fetch',vi.fn(async(url:string,options?:any)=>new Response(JSON.stringify(options?.method==='POST'?{title:'Resolved title',description:'Resolved description',canonical:'https://public.test/psychology/'}:url.includes('translation-generation')?{configuration:{targetLocales:['ar']}}:options?.method==='PUT'?{...data,revision:'b'.repeat(64),policy:JSON.parse(options.body).policy}:data))));});
describe('clean template URLs editor',()=>{
    it('opens focused record sections, saves Arabic overrides separately and preserves defaults',async()=>{
        render(<TemplateUrls pageId="program" name="Program detail" onClose={()=>{}} onSaved={()=>{}} design={()=>{}}/>);
        fireEvent.click(await screen.findByRole('button',{name:/Psychology/}));
        expect(screen.queryByLabelText('SEO title')).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Editing language'),{target:{value:'ar'}});await userEvent.click(screen.getByRole('tab',{name:'SEO'}));
        fireEvent.change(await screen.findByLabelText('SEO title'),{target:{value:'{{ record.title }} · الدراسة'}});
        fireEvent.click(screen.getByRole('button',{name:'Save settings'}));
        await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([,options])=>options?.method==='PUT')).toBe(true));
        const payload=JSON.parse(String(vi.mocked(fetch).mock.calls.find(([,options])=>options?.method==='PUT')![1]!.body));
        expect(payload.policy.defaults).toEqual({values:{}});expect(payload.policy.overrides['programs:1'].locales.ar.title).toContain('الدراسة');expect(payload.revision).toBe(data.revision);
    });
    it('shows revision conflicts without discarding the local draft',async()=>{
        vi.stubGlobal('fetch',vi.fn(async(url:string,options?:any)=>new Response(JSON.stringify(options?.method==='PUT'?{detail:'Template changed. Reload before saving.'}:url.includes('translation-generation')?{}:data),{status:options?.method==='PUT'?409:200})));
        render(<TemplateUrls pageId="program" name="Program detail" onClose={()=>{}} onSaved={()=>{}} design={()=>{}}/>);
        fireEvent.click(await screen.findByRole('button',{name:'Template defaults'}));fireEvent.change(await screen.findByLabelText('SEO title'),{target:{value:'My draft'}});fireEvent.click(screen.getByRole('button',{name:'Save settings'}));
        expect(await screen.findByRole('alert')).toHaveTextContent('Template changed');expect(screen.getByLabelText('SEO title')).toHaveValue('My draft');
    });
    it('resolves an explicit preview without saving the draft',async()=>{
        render(<TemplateUrls pageId="program" name="Program detail" onClose={()=>{}} onSaved={()=>{}} design={()=>{}}/>);
        fireEvent.click(await screen.findByRole('button',{name:/Psychology/}));await userEvent.click(screen.getByRole('tab',{name:'SEO'}));
        fireEvent.click(screen.getByText('Search preview'));fireEvent.click(screen.getByRole('button',{name:'Update preview'}));
        expect(await screen.findByText('Resolved title')).toBeInTheDocument();expect(vi.mocked(fetch).mock.calls.some(([,options])=>options?.method==='PUT')).toBe(false);
    });

});
