import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),delete:vi.fn()}));
vi.mock('@/services/api-service',()=>({default:api}));
vi.mock('@/hooks/useEdgeInfrastructure',()=>({useEdgeProviders:()=>({data:[]})}));
vi.mock('@/components/dashboard/settings/shared/ConnectProviderDialog',()=>({ConnectProviderDialog:()=>null}));
vi.mock('./index',()=>({FileBrowser:({connectedProviders}:any)=><p>Creatable providers: {connectedProviders?.map((p:any)=>p.name).join(',')||'none'}</p>}));
vi.mock('@/components/ui/select',()=>({
 Select:({value,onValueChange,children}:any)=><select value={value} onChange={e=>onValueChange?.(e.target.value)}>{children}</select>,
 SelectTrigger:()=>null,SelectValue:()=>null,SelectContent:({children}:any)=><>{children}</>,SelectItem:({value,children}:any)=><option value={value}>{children}</option>
}));
import { BucketListView } from './BucketListView';
import { ShareLinkDialog } from './dialogs/ShareLinkDialog';
import { StoragePanel } from '../StoragePanel';
afterEach(()=>{cleanup();vi.clearAllMocks();});
function mount(element:React.ReactNode){
 const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
function bucketView(managed:boolean,canEmpty=true){
 const noop=vi.fn();
 return <BucketListView {...{
  buckets:[{id:'files',name:'files',public:false,created_at:'2026-10-20',deployment_managed:managed,can_empty:canEmpty}],
  bucketsLoading:false,bucketSearch:'',setBucketSearch:noop,selectedProviders:[],setSelectedProviders:noop,bucketSortConfig:{key:'name',direction:'asc'},setBucketSortConfig:noop,bucketPage:0,setBucketPage:noop,
  getFilteredAndSortedBuckets:(b:any)=>b??[],getPaginatedBuckets:(b:any)=>b,getTotalBucketPages:()=>1,isBucketDialogOpen:false,setIsBucketDialogOpen:noop,bucketDialogMode:'edit',bucketForm:{name:'files',public:false,fileSizeLimit:'',allowedMimeTypes:''},setBucketForm:noop,
  handleOpenCreateBucket:noop,handleOpenEditBucket:noop,confirmDialog:{isOpen:false,title:'',description:'',actionLabel:'',actionType:null,targetId:null},setConfirmDialog:noop,
  onBucketClick:noop,onBucketSubmit:noop,onConfirmAction:noop,onRefresh:async()=>{},isRefreshing:false,isMutationPending:false,
  connectedProviders:managed?[]:[{id:'external',name:'External',provider:'supabase'}]
 } as React.ComponentProps<typeof BucketListView>}/>;
}
test('native private bucket has file emptying but no physical settings or deletion',async()=>{
 mount(bucketView(true));
 expect(screen.getByRole('button',{name:'New Bucket'})).toBeDisabled();
 fireEvent.keyDown(screen.getByRole('button',{name:'Bucket actions for files'}),{key:'Enter'});
 expect(await screen.findByRole('menuitem',{name:'Empty Bucket'})).toBeTruthy();
 expect(screen.queryByRole('menuitem',{name:'Settings'})).toBeNull();
 expect(screen.queryByRole('menuitem',{name:'Delete Bucket'})).toBeNull();
});
test('external providers retain supported bucket creation/settings/deletion',async()=>{
 mount(bucketView(false));expect(screen.getByRole('button',{name:'New Bucket'})).not.toBeDisabled();
 fireEvent.keyDown(screen.getByRole('button',{name:'Bucket actions for files'}),{key:'Enter'});
 expect(await screen.findByRole('menuitem',{name:'Settings'})).toBeTruthy();
 expect(screen.getByRole('menuitem',{name:'Delete Bucket'})).toBeTruthy();
});
test('native signed links offer only supported durations and clamp prior selections',async()=>{
 const generate=vi.fn().mockResolvedValue('https://app.example/signed');
 const props={open:true,onOpenChange:vi.fn(),fileName:'private.txt',isPublicBucket:false,onGenerateUrl:generate,onGetPublicUrl:vi.fn()};
 const view=mount(<ShareLinkDialog {...props}/>);
 const select=screen.getByRole('combobox');fireEvent.change(select,{target:{value:'604800'}});
 view.rerender(<QueryClientProvider client={new QueryClient()}><ShareLinkDialog {...props} maxExpiry={3600}/></QueryClientProvider>);
 expect(screen.queryByRole('option',{name:'7 days'})).toBeNull();expect(screen.queryByRole('option',{name:'6 hours'})).toBeNull();
 expect(screen.getAllByRole('option').map(o=>o.textContent)).toEqual(['15 minutes','1 hour']);
 fireEvent.click(screen.getByRole('button',{name:/Generate/}));
 await screen.findByDisplayValue('https://app.example/signed');expect(generate).toHaveBeenCalledWith(3600);
});
test('native provider is labeled managed and cannot be removed or selected for bucket creation',async()=>{
 api.get.mockImplementation(async(path:string)=>({data:path==='/api/storage/providers/'?[{id:'bound-native',name:'Cloudflare R2 (bound)',provider:'r2',account_name:'Platform binding',deployment_managed:true,is_active:true}]:{success:true,buckets:[{id:'files',name:'files',public:false,deployment_managed:true}]}}));
 mount(<StoragePanel/>);await screen.findByText('Cloudflare R2 (bound)');
 expect(screen.getByText('Deployment managed · private')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Remove Cloudflare R2 (bound)'})).toBeNull();
 expect(screen.getByText('Creatable providers: none')).toBeTruthy();
});

test('a bound provider can explicitly refuse emptying without removing native R2 support',async()=>{
 mount(bucketView(true,false));
 fireEvent.keyDown(screen.getByRole('button',{name:'Bucket actions for files'}),{key:'Enter'});
 expect(await screen.findByRole('menuitem',{name:'Empty Bucket'})).toHaveAttribute('aria-disabled','true');
 expect(screen.queryByRole('menuitem',{name:'Delete Bucket'})).toBeNull();
});
