import React from 'react';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,act,waitFor} from '@testing-library/react';
import {SitePublicationPanel} from './SitePublicationPanel';
const hash='a'.repeat(64),other='b'.repeat(64),candidate={hash,review:'2026-10-08T09:00:00Z',paths:[{originalPath:'/campus/'}],directory:'/explore/'};
const pointer=(value:string,generation:number)=>({schemaVersion:1,generation,hash:value});
const live=(value:string|null,generation=1)=>({pointer:value?pointer(value,generation):null,capture:value?{configurationRevision:1,reviewedAt:candidate.review,paths:['/explore/','/campus/'],counts:{institutions:1,programs:0,articles:0}}:null});
const ok=(value:unknown)=>({ok:true,json:async()=>value});
const button=()=>screen.getByText('Publish selected reviewed version') as HTMLButtonElement;
const confirm=()=>screen.getByLabelText('Confirm selected version replaces live site') as HTMLInputElement;
async function check(){fireEvent.click(screen.getByText('Check live version'));await screen.findByText('Live state checked. Review and confirm the selected version before publishing.');}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('guarded publication panel',()=>{
 it('requires server read and explicit confirmation, sending exact target/expected only once',async()=>{
  let resolve:(value:unknown)=>void=()=>{};const fetcher=vi.fn().mockResolvedValueOnce(ok(live(other,4))).mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValueOnce(ok(live(hash,5)));
  vi.stubGlobal('fetch',fetcher);render(<SitePublicationPanel candidate={candidate} revision={1}/>);expect(button().disabled).toBe(true);await check();expect(button().disabled).toBe(true);
  fireEvent.click(confirm());fireEvent.click(button());fireEvent.click(button());expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({hash,expected:pointer(other,4)});
  await act(async()=>resolve(ok({pointer:pointer(hash,5),changed:true})));await screen.findByText(/selected version is currently live/);expect(button().disabled).toBe(true);expect(fetcher).toHaveBeenCalledTimes(3);
 });
 it('allows first publication only after verified inactive state',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(ok(live(null))).mockResolvedValueOnce(ok({pointer:pointer(hash,1),changed:true})).mockResolvedValueOnce(ok(live(hash,1)));
  vi.stubGlobal('fetch',fetcher);render(<SitePublicationPanel candidate={candidate} revision={1}/>);await check();fireEvent.click(confirm());fireEvent.click(button());await screen.findByText(/selected version is currently live/);
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({hash,expected:null});
 });
 it('recovers a lost response by observation, without replay or claiming the actor',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(ok(live(other,2))).mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce(ok(live(hash,3)));
  vi.stubGlobal('fetch',fetcher);render(<SitePublicationPanel candidate={candidate} revision={1}/>);await check();fireEvent.click(confirm());fireEvent.click(button());
  await screen.findByText('The selected version is currently live. This check does not identify which attempt published it.');expect(button().disabled).toBe(true);expect(fetcher.mock.calls.filter(([path])=>String(path).endsWith('/activate/'))).toHaveLength(1);
 });
 it('requires fresh confirmation after conflict without automatically replaying with a new expectation',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(ok(live(other,2))).mockResolvedValueOnce({ok:false,status:409}).mockResolvedValueOnce(ok(live(other,3)));
  vi.stubGlobal('fetch',fetcher);render(<SitePublicationPanel candidate={candidate} revision={1}/>);await check();fireEvent.click(confirm());fireEvent.click(button());await screen.findByText(/confirm again before another attempt/);
  expect(confirm().checked).toBe(false);expect(button().disabled).toBe(true);expect(fetcher).toHaveBeenCalledTimes(3);
 });
 it('keeps unknown outcome locked when read-back fails',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(ok(live(other,2))).mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce({ok:false,status:503});
  vi.stubGlobal('fetch',fetcher);render(<SitePublicationPanel candidate={candidate} revision={1}/>);await check();fireEvent.click(confirm());fireEvent.click(button());await screen.findByText(/Publication outcome is uncertain/);
  expect(button().disabled).toBe(true);expect(confirm().disabled).toBe(true);expect(screen.queryByText('No captured site version is currently live.')).toBeNull();
 });
 it('ignores an old publication response after candidate/configuration changes',async()=>{
  let resolve:(value:unknown)=>void=()=>{};const fetcher=vi.fn().mockResolvedValueOnce(ok(live(null))).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  vi.stubGlobal('fetch',fetcher);const view=render(<SitePublicationPanel candidate={candidate} revision={1}/>);await check();fireEvent.click(confirm());fireEvent.click(button());
  view.rerender(<SitePublicationPanel candidate={{...candidate,hash:other}} revision={2}/>);await act(async()=>resolve(ok({pointer:pointer(hash,1),changed:true})));
  expect(screen.getByText('Check the live version before publishing.')).toBeTruthy();expect(button().disabled).toBe(true);expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('rejects inconsistent state and never enables an unreviewed target',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(ok({pointer:pointer(other,1),capture:null})).mockResolvedValueOnce(ok(live(null))));
  render(<SitePublicationPanel candidate={{...candidate,review:null}} revision={1}/>);fireEvent.click(screen.getByText('Check live version'));await screen.findByText(/Live state is unavailable/);expect(button().disabled).toBe(true);
  await check();expect(confirm().disabled).toBe(true);expect(button().disabled).toBe(true);
 });
 it('does not overlap live-state checks or reuse state after remount',async()=>{
  let resolve:(value:unknown)=>void=()=>{};const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));vi.stubGlobal('fetch',fetcher);
  const view=render(<SitePublicationPanel candidate={candidate} revision={1}/>);fireEvent.click(screen.getByText('Check live version'));fireEvent.click(screen.getByText('Check live version'));expect(fetcher).toHaveBeenCalledTimes(1);
  view.unmount();await act(async()=>resolve(ok(live(null))));render(<SitePublicationPanel candidate={candidate} revision={1}/>);expect(button().disabled).toBe(true);expect(confirm().disabled).toBe(true);
 });
});
