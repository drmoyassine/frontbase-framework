import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {FilePickerDialog} from './FilePickerDialog';
const fixtures=vi.hoisted(()=>({get:vi.fn(),buckets:vi.fn()}));
vi.mock('@/services/api-service',()=>({default:{get:fixtures.get}}));
vi.mock('./api',()=>({fetchBuckets:fixtures.buckets}));
vi.mock('./index',()=>({FileBrowser:({storageProviderId,unifiedBuckets,unifiedBucketsLoading,unifiedBucketsError,requirePublicUrl}:any)=><div>{requirePublicUrl&&<p>Permanent public URL required</p>}{unifiedBucketsLoading?'Buckets loading':unifiedBucketsError?'Buckets failed':unifiedBuckets.map((b:any)=><p key={b.id}>{storageProviderId}:{b.name}:{b.providerId}</p>)}</div>}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
function mount(props:any={}){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><FilePickerDialog open onOpenChange={()=>{}} onSelect={()=>{}} {...props}/></QueryClientProvider>);}
it('loads actual buckets and switches provider without retaining old buckets',async()=>{
 fixtures.get.mockResolvedValue({data:[{id:'first',name:'First storage'},{id:'second',name:'Second storage'}]});
 fixtures.buckets.mockImplementation(async(id:string)=>({buckets:[{id:'bucket',name:id+'-media',public:true}]}));mount();
 expect(await screen.findByText('first:first-media:first')).toBeTruthy();await userEvent.selectOptions(screen.getByLabelText('File picker storage connection'),'second');
 expect(await screen.findByText('second:second-media:second')).toBeTruthy();expect(screen.queryByText('first:first-media:first')).toBeNull();
});
it('uses an explicit provider without discovering another connection',async()=>{
 fixtures.buckets.mockResolvedValue({buckets:[{id:'bucket',name:'USA media',public:true}]});mount({storageProviderId:'garage',requirePublicUrl:true});expect(await screen.findByText('Permanent public URL required')).toBeTruthy();expect(await screen.findByText('garage:USA media:garage')).toBeTruthy();expect(fixtures.get).not.toHaveBeenCalled();
});
it('offers retry and hides provider errors instead of reporting a valid empty list',async()=>{
 fixtures.get.mockResolvedValue({data:[{id:'garage',name:'Garage'}]});fixtures.buckets.mockRejectedValueOnce(new Error('PRIVATE_TOKEN')).mockResolvedValueOnce({buckets:[{id:'bucket',name:'Recovered',public:true}]});mount();
 await screen.findByRole('button',{name:'Retry storage buckets'});expect(screen.queryByText('PRIVATE_TOKEN')).toBeNull();await userEvent.click(screen.getByRole('button',{name:'Retry storage buckets'}));expect(await screen.findByText('garage:Recovered:garage')).toBeTruthy();
});
