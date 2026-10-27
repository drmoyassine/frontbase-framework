import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { DirectoryQueryPreview } from './DirectoryQueryPreview';
vi.mock('@/components/dashboard/FileBrowser/FilePickerDialog',()=>({FilePickerDialog:()=>null}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function draft(revision = 1) {
    const configuration = emptyDirectoryConfiguration(); configuration.site.name='USA';configuration.site.destination='USA';configuration.site.origin='https://study-in-usa.com';configuration.datasourceId='saved-source';
    for (const role of ['institution','program','city'] as const) { const m=configuration.collections[role];m.table=role;m.fields.id='id';m.fields.title='title';m.scope={field:'country',value:22};if(role!=='city')m.fields.originalPath='wp_url'; }
    configuration.collections.institution.fields.cityId='city_id';configuration.collections.program.fields.institutionId='institution_id';
    return {schemaVersion:1 as const,revision,configuration};
}
it('uses saved revision and server queries for detail and linked-program previews', async () => {
    const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({revision:1,hasMore:false,rows:[{id:512,title:'Muhlenberg',originalPath:'/muhlenberg-college/'}]})});vi.stubGlobal('fetch',fetch);
    render(<DirectoryQueryPreview draft={draft()} />);
    await userEvent.click(screen.getByRole('button',{name:'Load data preview'}));
    expect(await screen.findByText('Muhlenberg')).toBeTruthy();
    await userEvent.click(screen.getByRole('button',{name:'Preview detail'}));
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({expectedRevision:1,role:'institution',mode:'detail',params:{path:'/muhlenberg-college/'}});
    await screen.findByText('Muhlenberg');await userEvent.click(screen.getByRole('button',{name:'Preview linked programs'}));
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({expectedRevision:1,role:'program',mode:'list',params:{institutionId:512}});
});
it('clears old rows and ignores an in-flight response after shared revision changes', async () => {
    let resolve!: (r:unknown)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise(r=>{resolve=r;})));
    const view=render(<DirectoryQueryPreview draft={draft()} />);await userEvent.click(screen.getByRole('button',{name:'Load data preview'}));
    view.rerender(<DirectoryQueryPreview draft={draft(2)} />);resolve({ok:true,json:async()=>({revision:1,rows:[{title:'Stale row'}]})});
    expect(screen.queryByText('Stale row')).toBeNull();expect(screen.getByRole('button',{name:'Load data preview'})).toBeEnabled();
});
it('shows a safe conflict message rather than provider details', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:409,json:async()=>({detail:'PRIVATE_CANARY'})}));render(<DirectoryQueryPreview draft={draft()} />);
    await userEvent.click(screen.getByRole('button',{name:'Load data preview'}));
    expect(await screen.findByRole('status')).toHaveTextContent('Shared settings changed');expect(screen.queryByText('PRIVATE_CANARY')).toBeNull();
});
it('adds the successful registered request as a template reference without copying rows',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({revision:1,queryId:'directory.institution.list',rows:[{id:512,title:'Live College'}]})}));
    const add=vi.fn();render(<DirectoryQueryPreview draft={draft()} onAddTemplate={add}/>);
    await userEvent.click(screen.getByRole('button',{name:'Load data preview'}));await userEvent.click(await screen.findByRole('button',{name:'Add editable cards to canvas'}));
    expect(add).toHaveBeenCalledWith({version:1,queryId:'directory.institution.list',params:{q:''}});expect(JSON.stringify(add.mock.calls)).not.toContain('Live College');
});
it('locks preview and parent settings while an article editor is open and clears stale rows on close',async()=>{
    const articleDraft=draft();const mapping=articleDraft.configuration.collections.article;
    mapping.table='editorial_documents';mapping.scope={field:'country_id',value:22};Object.assign(mapping.fields,{id:'id',title:'title',originalPath:'original_path',body:'body_blocks',contentRole:'collection_role',sourceOrigin:'source_origin'});
    const id='00000000-0000-4000-8000-000000000001';
    const document={id,revision:1,originalPath:'/blog/article/',title:'Canonical article',excerpt:'',body:[{kind:'paragraph',runs:[{text:'Body'}]}],language:null,byline:null,publishedAt:null,coverUrl:null,coverAlt:'',reviewState:'draft',reviewNote:''};
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({revision:1,queryId:'directory.article.list',rows:[{id,title:document.title,originalPath:document.originalPath}]})}).mockResolvedValueOnce({ok:true,json:async()=>({document})}));
    const parent=vi.fn();render(<DirectoryQueryPreview draft={articleDraft} onEditorialOpenChange={parent}/>);
    await userEvent.selectOptions(screen.getByLabelText('Preview collection'),'article');await userEvent.click(screen.getByRole('button',{name:'Load data preview'}));await userEvent.click(await screen.findByRole('button',{name:'Edit article content'}));await screen.findByLabelText('Article title');
    expect(parent).toHaveBeenLastCalledWith(true);expect(screen.getByRole('button',{name:'Load data preview'})).toBeDisabled();
    await userEvent.click(screen.getByRole('button',{name:'Close article editor'}));expect(parent).toHaveBeenLastCalledWith(false);expect(screen.queryByText('Canonical article')).toBeNull();expect(screen.getByRole('button',{name:'Load data preview'})).toBeEnabled();
});
