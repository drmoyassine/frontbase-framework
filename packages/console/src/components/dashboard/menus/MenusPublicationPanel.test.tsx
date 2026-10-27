import React from 'react';
import {describe,it,expect,vi,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MenusPublicationPanel} from './MenusPublicationPanel';
import {menuPublicationRequest} from './api';
vi.mock('./api',()=>({menuPublicationRequest:vi.fn()}));
vi.mock('./MenusMigrationPanel',()=>({MenusMigrationPanel:()=>null}));
const hash='a'.repeat(64);
beforeEach(()=>{vi.resetAllMocks();vi.mocked(menuPublicationRequest).mockImplementation(async url=>new Response(JSON.stringify(url.includes('preview-saved')?{hash,revision:2,previews:[{label:'Homepage',path:'/'}]}:{pointer:{hash}}),{status:200}));});
describe('saved menus publication',()=>{
    it('previews privately then publishes exactly that saved revision without a checklist',async()=>{
        render(<MenusPublicationPanel revision={2} disabled={false}/>);
        expect(screen.queryByRole('button',{name:'Publish',exact:true})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Preview',exact:true}));
        const frame=await screen.findByTitle('Saved menu site preview');expect(frame).toHaveAttribute('src',expect.stringContaining(hash));expect(screen.getByRole('button',{name:'Publish',exact:true})).toBeDisabled();fireEvent.load(frame);
        fireEvent.click(screen.getByRole('button',{name:'Publish',exact:true}));await screen.findByText('Menus published.');
        expect(menuPublicationRequest).toHaveBeenLastCalledWith('/api/project/menus/publish/',expect.objectContaining({body:JSON.stringify({expectedRevision:2,hash})}));expect(screen.queryByRole('textbox')).toBeNull();
    });
    it('invalidates previews after edits and blocks double submissions',async()=>{
        const view=render(<MenusPublicationPanel revision={2} disabled={false}/>);const button=screen.getByRole('button',{name:'Preview',exact:true});fireEvent.click(button);fireEvent.click(button);await screen.findByTitle('Saved menu site preview');expect(menuPublicationRequest).toHaveBeenCalledTimes(1);
        view.rerender(<MenusPublicationPanel revision={2} disabled/>);expect(screen.queryByTitle('Saved menu site preview')).toBeNull();
    });
    it('discards dirty changes through the guarded saved draft endpoint',async()=>{
        const refresh=vi.fn();render(<MenusPublicationPanel revision={2} disabled discardDisabled={false} onDiscard={refresh}/>);fireEvent.click(screen.getByRole('button',{name:'Discard',exact:true}));await waitFor(()=>expect(refresh).toHaveBeenCalledOnce());expect(menuPublicationRequest).toHaveBeenCalledWith('/api/project/menus/discard/',expect.objectContaining({body:JSON.stringify({expectedRevision:2})}));
    });
    it('refuses stale publish and requires a fresh preview',async()=>{
        render(<MenusPublicationPanel revision={2} disabled={false}/>);fireEvent.click(screen.getByRole('button',{name:'Preview',exact:true}));fireEvent.load(await screen.findByTitle('Saved menu site preview'));vi.mocked(menuPublicationRequest).mockResolvedValueOnce(new Response(JSON.stringify({detail:'Menus changed. Preview again.'}),{status:409}));fireEvent.click(screen.getByRole('button',{name:'Publish',exact:true}));await screen.findByText('Menus changed. Preview again.');expect(screen.queryByRole('button',{name:'Publish',exact:true})).toBeNull();
    });
});
