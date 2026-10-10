import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { PageRouteAudit } from './PageRouteAudit';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const clear = { schemaVersion:1,coverage:'stored-pages',publicRecordsChecked:false,status:'clear',issues:[],resourcesChecked:2,truncated:false,installAvailable:false };
const reply = (body:unknown, status=200) => new Response(JSON.stringify(body),{status});
describe('page URL audit', () => {
    it('shows capture version and refuses inconsistent coverage',async()=>{
        const capture={schemaVersion:1,generation:2,hash:'a'.repeat(64)};
        const fetcher=vi.fn().mockResolvedValueOnce(reply({...clear,coverage:'stored-pages-and-active-capture',publicRecordsChecked:true,capture})).mockResolvedValueOnce(reply({...clear,publicRecordsChecked:true}));
        vi.stubGlobal('fetch',fetcher);render(<PageRouteAudit/>);fireEvent.click(screen.getByRole('button',{name:'Check page URLs'}));
        await screen.findByText(/Includes published capture/);expect(screen.getByText(/generation 2/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button',{name:'Check again'}));await screen.findByRole('alert');expect(screen.queryByText(/No conflicts found/)).not.toBeInTheDocument();
    });
    it('runs only on demand with cookies and truthful coverage',async()=>{
        const fetcher=vi.fn().mockResolvedValue(reply(clear));vi.stubGlobal('fetch',fetcher);render(<PageRouteAudit/>);
        expect(fetcher).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Check page URLs'}));
        await screen.findByText(/No conflicts found/);expect(fetcher.mock.calls[0][0]).toBe('/api/project/page-route-audit/');
        expect(fetcher.mock.calls[0][1].credentials).toBe('include');expect(fetcher.mock.calls[0][1].cache).toBe('no-store');
        expect(screen.getByText(/No published capture: listing and blog record URLs were not checked/)).toBeInTheDocument();
    });
    it('renders conflicts, trash and shortened reports without actions that change data',async()=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply({...clear,status:'conflicts',truncated:true,issues:[{code:'route_conflict',resources:[{source:'compat',id:'id',path:'/College',deleted:true}]}]})));
        render(<PageRouteAudit/>);fireEvent.click(screen.getByRole('button',{name:'Check page URLs'}));await screen.findByText('Duplicate address');
        expect(screen.getByText(/in trash/)).toBeInTheDocument();expect(screen.getByText(/report is shortened/)).toBeInTheDocument();
        expect(screen.queryByRole('button',{name:/install|repair|delete/i})).not.toBeInTheDocument();
    });
    it('does not display raw provider errors or malformed reports',async()=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply({detail:'PRIVATE_CONNECTION'},503)));
        render(<PageRouteAudit/>);fireEvent.click(screen.getByRole('button',{name:'Check page URLs'}));await screen.findByRole('alert');
        expect(screen.queryByText(/PRIVATE_CONNECTION/)).not.toBeInTheDocument();
    });
    it('rejects a response granting installation',async()=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply({...clear,installAvailable:true})));
        render(<PageRouteAudit/>);fireEvent.click(screen.getByRole('button',{name:'Check page URLs'}));await screen.findByRole('alert');
        expect(screen.queryByText(/No conflicts found/)).not.toBeInTheDocument();
    });
    it('discards a late result after an owner-key change',async()=>{
        let resolve!: (r:Response)=>void;
        const fetcher=vi.fn().mockReturnValue(new Promise<Response>(done=>{resolve=done;}));vi.stubGlobal('fetch',fetcher);
        const {rerender}=render(<PageRouteAudit key="alpha"/>);fireEvent.click(screen.getByRole('button',{name:'Check page URLs'}));
        rerender(<PageRouteAudit key="beta"/>);expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
        await act(async()=>{resolve(reply(clear));});expect(screen.queryByText(/No conflicts found/)).not.toBeInTheDocument();
    });
});
