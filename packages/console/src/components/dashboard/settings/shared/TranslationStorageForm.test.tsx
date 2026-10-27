import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TranslationStorageForm } from './TranslationStorageForm';
const configuration = { version:1, datasourceId:'content', endpoint:'supabase', namespace:'translations' };
const options = (configurationValue: unknown = null) => ({ revision:0,projectId:configurationValue?'project-one':null,configuration:configurationValue,contentDatasourceId:'content',datasources:[
    {id:'content',name:'Content DB',kind:'supabase',supported:true},
    {id:'separate',name:'Studygram selfhost',kind:'supabase',supported:true},
    {id:'other',name:'Other DB',kind:'sqlite',supported:false},
] });
const response = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const mount = () => render(<MemoryRouter><TranslationStorageForm /></MemoryRouter>);
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('Translation storage settings',()=>{
    it('offers the content datasource without silently saving it; connects to Data',async()=>{
        const fetcher=vi.fn().mockResolvedValue(response(options()));vi.stubGlobal('fetch',fetcher);mount();
        await screen.findByText('Content DB');expect(screen.getByLabelText('Storage location')).toHaveValue('same');expect(fetcher).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('link',{name:'Manage datasources'})).toHaveAttribute('href','/data-studio/datasources');
        expect(screen.getByRole('button',{name:'Clear selection'})).toBeDisabled();
    });
    it('checks a separate native PostgREST binding with IDs only and labels check limits',async()=>{
        const fetcher=vi.fn().mockResolvedValueOnce(response(options())).mockResolvedValueOnce(response({status:'protocol-verified',readOnly:true,writePermissionsVerified:false}));vi.stubGlobal('fetch',fetcher);mount();await screen.findByText('Content DB');
        fireEvent.change(screen.getByLabelText('Storage location'),{target:{value:'choose'}});fireEvent.change(screen.getByLabelText('Translation datasource'),{target:{value:'separate'}});fireEvent.change(screen.getByLabelText('Connection format'),{target:{value:'postgrest'}});fireEvent.click(screen.getByRole('button',{name:'Check connection'}));
        await screen.findByText(/Connection and translation protocol verified/);expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({...configuration,datasourceId:'separate',endpoint:'postgrest'});expect(screen.getByText(/does not verify write permissions/)).toBeTruthy();
    });
    it('saves with a revision and retains a stale selection until reload',async()=>{
        const fetcher=vi.fn().mockResolvedValueOnce(response(options())).mockResolvedValueOnce(response({},409));vi.stubGlobal('fetch',fetcher);mount();await screen.findByText('Content DB');fireEvent.click(screen.getByRole('button',{name:'Save storage selection'}));
        await screen.findByText(/Another editor changed/);expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({expectedRevision:0,configuration});expect(screen.getByRole('button',{name:'Save storage selection'})).toBeDisabled();expect(screen.getByLabelText('Storage location')).toHaveValue('same');expect(screen.getByRole('button',{name:'Reload storage'})).toBeEnabled();
    });
    it('clears only the selection and explains preservation',async()=>{
        const fetcher=vi.fn().mockResolvedValueOnce(response(options(configuration))).mockResolvedValueOnce(response({revision:1,projectId:'project-one',configuration:null}));vi.stubGlobal('fetch',fetcher);mount();await screen.findByText('Content DB');fireEvent.click(screen.getByRole('button',{name:'Clear selection'}));
        await screen.findByText('Storage selection cleared. Existing translations are preserved.');expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({expectedRevision:0,configuration:null});
    });
    it('does not silently replace a missing saved datasource',async()=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(options({...configuration,datasourceId:'deleted'}))));mount();await screen.findByText('Saved datasource unavailable');expect(screen.getByLabelText('Translation datasource')).toHaveValue('deleted');expect(screen.getByRole('button',{name:'Save storage selection'})).toBeDisabled();
        expect(screen.getByRole('option',{name:/Other DB/})).toBeDisabled();
    });
    it('renders a safe failed check without echoing provider details',async()=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response(options())).mockResolvedValueOnce(response({detail:'PRIVATE_PROVIDER_SECRET'},422)));mount();await screen.findByText('Content DB');fireEvent.click(screen.getByRole('button',{name:'Check connection'}));await screen.findByText(/Connection check failed/);expect(screen.queryByText(/PRIVATE_PROVIDER_SECRET/)).toBeNull();expect(screen.getByRole('button',{name:'Save storage selection'})).toBeEnabled();
    });
    it('blocks an ambiguous save without discarding the selected datasource',async()=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response(options())).mockRejectedValueOnce(Error('PRIVATE_ERROR')));mount();await screen.findByText('Content DB');fireEvent.click(screen.getByRole('button',{name:'Save storage selection'}));await screen.findByText(/Save outcome needs review/);expect(screen.getByRole('button',{name:'Save storage selection'})).toBeDisabled();expect(screen.queryByText(/PRIVATE_ERROR/)).toBeNull();
    });
});
