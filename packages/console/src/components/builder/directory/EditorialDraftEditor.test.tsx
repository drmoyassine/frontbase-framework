import React from 'react';
import { afterEach,expect,it,vi } from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {EditorialDraftEditor} from './EditorialDraftEditor';
vi.mock('@/components/dashboard/FileBrowser/FilePickerDialog',()=>({FilePickerDialog:({open,onSelect}:any)=>open?<><button onClick={()=>onSelect('https://media.example.test/cover.jpg',{})}>Select test cover</button><button onClick={()=>onSelect('https://media.example.test/cover.jpg?token=secret',{})}>Select signed cover</button></>:null}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const id='00000000-0000-4000-8000-000000000001';
const document={id,revision:1,originalPath:'/blog/original/',title:'Original title',excerpt:'',body:[{kind:'paragraph',runs:[{text:'Original text'}]}],language:null,byline:'Public author',publishedAt:null,coverUrl:null,coverAlt:'',reviewState:'draft',reviewNote:''};
const ok=(value:unknown)=>({ok:true,json:async()=>value});
it('saves canonical content using both revisions without source/path/approval fields',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(ok({document})).mockResolvedValueOnce(ok({savedRevision:2}));vi.stubGlobal('fetch',fetch);
    render(<EditorialDraftEditor id={id} configurationRevision={3} onClose={()=>{}}/>);
    const title=await screen.findByLabelText('Article title');await userEvent.clear(title);await userEvent.type(title,'Edited title');await userEvent.click(screen.getByRole('button',{name:'Save article draft'}));
    expect(await screen.findByText('Saved draft revision 2. Nothing was published.')).toBeTruthy();
    const input=JSON.parse(fetch.mock.calls[1][1].body);expect(input.expectedDocumentRevision).toBe(1);expect(input.expectedConfigurationRevision).toBe(3);expect(input.content.title).toBe('Edited title');expect(input.content.body[0].runs[0].text).toBe('Original text');expect(input.content.originalPath).toBeUndefined();expect(input.content.status).toBeUndefined();
});
it('preserves unsaved text on conflict and prevents blind retry',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(ok({document})).mockResolvedValueOnce({ok:false,status:409});vi.stubGlobal('fetch',fetch);
    render(<EditorialDraftEditor id={id} configurationRevision={3} onClose={()=>{}}/>);
    const title=await screen.findByLabelText('Article title');await userEvent.type(title,' unsaved');await userEvent.click(screen.getByRole('button',{name:'Save article draft'}));
    expect(await screen.findByText(/Your edits are kept here/)).toBeTruthy();expect(title).toHaveValue('Original title unsaved');expect(screen.getByRole('button',{name:'Save article draft'})).toBeDisabled();expect(screen.getByRole('button',{name:'Close and discard unsaved article edits'})).toBeTruthy();
});
it('requires language and review note before requesting review',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(ok({document})).mockResolvedValueOnce(ok({savedRevision:2}));vi.stubGlobal('fetch',fetch);
    render(<EditorialDraftEditor id={id} configurationRevision={3} onClose={()=>{}}/>);await screen.findByLabelText('Article title');
    await userEvent.click(screen.getByRole('button',{name:'Request article review'}));expect(fetch).toHaveBeenCalledTimes(1);
    await userEvent.type(screen.getByLabelText('Content language'),'en');await userEvent.type(screen.getByLabelText('Review note'),'Date and media need review');await userEvent.click(screen.getByRole('button',{name:'Request article review'}));
    expect(await screen.findByText(/review requested/)).toBeTruthy();expect(JSON.parse(fetch.mock.calls[1][1].body).content.reviewState).toBe('requested');
});
it('ignores late responses after another record is selected',async()=>{
    let resolve!:(value:unknown)=>void;const fetch=vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValueOnce(ok({document:{...document,id:'00000000-0000-4000-8000-000000000002',title:'Next article'}}));vi.stubGlobal('fetch',fetch);
    const view=render(<EditorialDraftEditor id={id} configurationRevision={3} onClose={()=>{}}/>);
    view.rerender(<EditorialDraftEditor id="00000000-0000-4000-8000-000000000002" configurationRevision={3} onClose={()=>{}}/>);await screen.findByDisplayValue('Next article');await act(async()=>{resolve(ok({document}));});expect(screen.queryByDisplayValue('Original title')).toBeNull();
});

it('selects a durable storage cover, saves alt text and rejects signed URLs',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(ok({document})).mockResolvedValueOnce(ok({savedRevision:2}));vi.stubGlobal('fetch',fetch);
    render(<EditorialDraftEditor id={id} configurationRevision={3} onClose={()=>{}}/>);await screen.findByLabelText('Article title');
    await userEvent.click(screen.getByRole('button',{name:'Choose cover from storage'}));await userEvent.click(screen.getByText('Select signed cover'));
    expect(screen.getByText(/Signed URLs and SVGs are unsupported/)).toBeTruthy();expect(fetch).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button',{name:'Choose cover from storage'}));await userEvent.click(screen.getByText('Select test cover'));
    await userEvent.type(screen.getByLabelText('Cover image alt text'),'Campus gardens');await userEvent.click(screen.getByRole('button',{name:'Save article draft'}));
    await screen.findByText('Saved draft revision 2. Nothing was published.');const saved=JSON.parse(fetch.mock.calls[1][1].body).content;expect(saved.coverUrl).toBe('https://media.example.test/cover.jpg');expect(saved.coverAlt).toBe('Campus gardens');
});
