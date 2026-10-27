import React, { useState } from 'react';
import { it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createPublicFormDraft } from '@frontbase/edge-core';
import { PublicFormDraftProperties } from './PublicFormDraftProperties';
afterEach(cleanup);
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
