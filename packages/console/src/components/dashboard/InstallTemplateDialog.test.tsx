import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {InstallTemplateDialog} from './InstallTemplateDialog';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('@/client/client.gen',()=>({client:{instance:api}}));
const pages=['Homepage','Explore','Blog','Institution detail','Program detail','Blog article'].map((name,i)=>({id:'page-'+i,name,role:['home','directory','article-index','institution','program','article'][i]}));
const review={reviewHash:'a'.repeat(64),pages,replacesWelcome:true,missing:['datasourceId']};
beforeEach(()=>{api.get.mockReset();api.post.mockReset();api.get.mockImplementation(async path=>({data:path.includes('catalog')?{atomicInstallAvailable:true}:{installation:null}}));});afterEach(cleanup);
async function configure(){fireEvent.click(await screen.findByRole('button',{name:'Review installation'}));await screen.findByText('Six draft entries');}
it('requires explicit review and confirmation, creates one operation and refreshes Pages only after confirmed success',async()=>{const installed=vi.fn();api.post.mockImplementation(async path=>({data:path.includes('review')?review:{installation:{status:'installed',operationId:'op',pages}}}));render(<InstallTemplateDialog open onOpenChange={()=>{}} onInstalled={installed}/>);await configure();expect(api.post).toHaveBeenCalledTimes(1);expect(screen.getByRole('button',{name:'Install Booking for X'})).toBeDisabled();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Install Booking for X'}));await screen.findByText('Booking for X installed');expect(api.post).toHaveBeenCalledTimes(2);expect(api.post.mock.calls[1][1].operationId).toMatch(/^[a-f0-9-]{36}$/);expect(installed).toHaveBeenCalledOnce();});
it('installs drafts without a second data configuration form and rechecks when returning from review',async()=>{api.post.mockResolvedValue({data:review});render(<InstallTemplateDialog open onOpenChange={()=>{}} onInstalled={()=>{}}/>);await configure();expect(api.post.mock.calls[0][1].configuration.datasourceId).toBe('');expect(screen.queryByText('Data connections and field mappings')).toBeNull();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Back'}));await configure();expect(api.post).toHaveBeenCalledTimes(2);expect(screen.getByRole('button',{name:'Install Booking for X'})).toBeDisabled();});
it('never resubmits an uncertain installation and recovers only by reading its receipt',async()=>{const installed=vi.fn();api.post.mockImplementation(async path=>{if(path.includes('review'))return {data:review};throw Error('lost response');});render(<InstallTemplateDialog open onOpenChange={()=>{}} onInstalled={installed}/>);await configure();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Install Booking for X'}));await screen.findByRole('button',{name:'Check status'});expect(installed).not.toHaveBeenCalled();api.get.mockResolvedValue({data:{installation:{status:'installed',operationId:'same',pages}}});fireEvent.click(screen.getByRole('button',{name:'Check status'}));await screen.findByText('Booking for X installed');expect(api.post).toHaveBeenCalledTimes(2);expect(installed).toHaveBeenCalledOnce();});
it('shows a clear unsupported-adapter message and keeps installation disabled',async()=>{api.get.mockImplementation(async path=>({data:path.includes('catalog')?{atomicInstallAvailable:false}:{installation:null}}));render(<InstallTemplateDialog open onOpenChange={()=>{}} onInstalled={()=>{}}/>);await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Review installation'})).toBeDisabled();expect(api.post).not.toHaveBeenCalled();});

it('requires a new review after reopening and never reuses an old confirmation',async()=>{
 api.post.mockResolvedValue({data:review});
 const props={onOpenChange:()=>{},onInstalled:()=>{}};
 const view=render(<InstallTemplateDialog open {...props}/>);await configure();fireEvent.click(screen.getByRole('checkbox'));
 view.rerender(<InstallTemplateDialog open={false} {...props}/>);view.rerender(<InstallTemplateDialog open {...props}/>);
 await screen.findByRole('button',{name:'Review installation'});expect(screen.queryByRole('button',{name:'Install Booking for X'})).toBeNull();
 await configure();expect(screen.getByRole('button',{name:'Install Booking for X'})).toBeDisabled();
});
