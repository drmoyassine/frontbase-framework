import React, { useState } from 'react';
import { it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createInquiryForm, createPublicFormDraft } from '@frontbase/edge-core';
const ids = vi.hoisted(()=>({workflow:'004703a5-43b7-47fe-8390-2fc85c33ed02', version:'cec63a00-c0f6-40c5-a512-112234567890'}));
vi.mock('@/stores/actions',()=>({
    useWorkflowDrafts:()=>({data:{drafts:[{id:ids.workflow,name:'CRM follow-up',is_active:true,is_published:true},{id:'draft',name:'Draft workflow',is_active:true,is_published:false}]}}),
    useWorkflowVersions:()=>({data:{data:[{id:ids.version,versionNumber:2,label:'Follow-up'}]}}),
}));
import { PublicFormDraftProperties } from './PublicFormDraftProperties';
afterEach(cleanup);
it('maps stable inquiry keys and pins only an explicitly selected workflow version',()=>{
    const changed=vi.fn();
    function Editor(){const [value,set]=useState(createInquiryForm());return <PublicFormDraftProperties value={value} onChange={next=>{changed(next);set(next);}}/>;}
    render(<Editor/>);
    expect(screen.getByDisplayValue('Submit inquiry')).toBeInTheDocument();
    expect(screen.queryByText('Draft workflow')).toBeNull();
    fireEvent.change(screen.getByLabelText('After recording an inquiry'),{target:{value:ids.workflow}});
    fireEvent.change(screen.getByLabelText('Workflow version'),{target:{value:ids.version}});
    fireEvent.change(screen.getByLabelText('Field 3 label'),{target:{value:'Your email address'}});
    expect(changed.mock.lastCall[0].fields[2]).toMatchObject({name:'email',label:'Your email address'});
    expect(changed.mock.lastCall[0].submission.workflow).toEqual({id:ids.workflow,versionId:ids.version});
    fireEvent.change(screen.getByLabelText('After recording an inquiry'),{target:{value:''}});
    expect(changed.mock.lastCall[0].submission.workflow).toBeUndefined();
});
it('allows editing empty intermediate labels, adding consent and removing fields without code', () => {
    const changed = vi.fn();
    function Editor() { const [value,setValue]=useState(createPublicFormDraft()); return <PublicFormDraftProperties value={value} onChange={next=>{setValue(next);changed(next);}}/>; }
    render(<Editor/>);
    fireEvent.change(screen.getByLabelText('Form title'), { target:{value:''} });
    expect(screen.getByLabelText('Form title')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('Complete all labels');
    fireEvent.change(screen.getByLabelText('Form title'), { target:{value:'Start your application'} });
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Add field'}));
    fireEvent.change(screen.getByLabelText('Field 6 label'), {target:{value:'Please contact me about my application'}});
    fireEvent.change(screen.getByLabelText('Field type',{selector:'#public-field-type-5'}), {target:{value:'consent'}});
    fireEvent.click(screen.getByLabelText('Required',{selector:'#public-field-required-5'}));
    expect(changed.mock.lastCall[0].fields[5]).toMatchObject({name:'field_1',type:'consent',required:true});
    fireEvent.click(screen.getByRole('button',{name:'Remove field 6'}));
    expect(changed.mock.lastCall[0].fields).toHaveLength(5);
});
it('preserves malformed configuration until an explicit replacement', () => {
    const update=vi.fn(); render(<PublicFormDraftProperties value={{bad:'retain'}} onChange={update}/>);
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Replace with draft defaults'}));
    expect(update).toHaveBeenCalledWith(createPublicFormDraft());
});
