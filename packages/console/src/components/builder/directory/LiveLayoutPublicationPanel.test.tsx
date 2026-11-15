import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {emptyDirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {LiveLayoutPublicationPanel} from './LiveLayoutPublicationPanel';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const id='00000000-0000-4000-8000-000000000001',hash='a'.repeat(64),draft={schemaVersion:1 as const,revision:1,configuration:emptyDirectoryConfiguration()};
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
it('publishes layouts only and resolves an uncertain write by reading state without retrying',async()=>{
    let published=false,writes=0;
    vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
        if(url==='/api/pages/')return json({data:[{id,name:'Homepage',isPublic:true,layoutData:{root:{directoryLanding:{}}}}]});
        if(url.endsWith('/prepare/')){expect(JSON.parse(init!.body as string)).toEqual({pageIds:[id],locales:['en'],expectedConfigurationRevision:1});return json({hash});}
        if(url.endsWith('/publish/')){writes++;published=true;throw Error('connection interrupted after commit');}
        return json({pointer:published?{hash,generation:1}:null,pageIds:[],locales:['en'],availableLocales:['en','ar']});
    }));
    render(<LiveLayoutPublicationPanel draft={draft}/>);
    fireEvent.click(screen.getByText('Choose saved layouts'));await screen.findByText('Included layouts');
    fireEvent.click(screen.getByText('Review saved layouts'));await screen.findByText('Publish reviewed layouts');
    fireEvent.click(screen.getByText('Publish reviewed layouts'));
    await screen.findByText('Layouts published. Database edits appear without republishing.');expect(writes).toBe(1);
});
it('changing language invalidates the reviewed candidate',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>url==='/api/pages/'?json({data:[{id,name:'Homepage',isPublic:true,layoutData:{root:{directoryLanding:{}}}}]}):url.endsWith('/prepare/')?json({hash}):json({pointer:null,pageIds:[],locales:['en'],availableLocales:['en','ar']})));
    render(<LiveLayoutPublicationPanel draft={draft}/>);fireEvent.click(screen.getByText('Choose saved layouts'));await screen.findByText('Included layouts');
    fireEvent.click(screen.getByText('Review saved layouts'));await screen.findByText('Publish reviewed layouts');
    fireEvent.click(screen.getByLabelText('ar'));await waitFor(()=>expect(screen.queryByText('Publish reviewed layouts')).toBeNull());
});
