import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DirectoryBindingProperties } from './DirectoryBindingProperties';
afterEach(cleanup);
it('edits query sample and card layout without exposing datasource or SQL controls',async()=>{
    const update=vi.fn();render(<DirectoryBindingProperties node={{id:'query',type:'Repeater',props:{directoryQuery:{version:1,queryId:'directory.program.list',params:{institutionId:512,q:''}}}}} update={update}/>);
    await userEvent.type(screen.getByRole('textbox',{name:'Directory preview title search'}),'x');
    expect(update).toHaveBeenCalledWith('directoryQuery',{version:1,queryId:'directory.program.list',params:{institutionId:512,q:'x'}});
    await userEvent.selectOptions(screen.getByRole('combobox',{name:'Directory card display'}),'list');expect(update).toHaveBeenCalledWith('layout','list');
    await userEvent.selectOptions(screen.getByRole('combobox',{name:'Directory card columns'}),'2');expect(update).toHaveBeenCalledWith('columns',2);
    expect(screen.queryByText('SQL')).toBeNull();
});
it('selects only mapped public display fields',async()=>{
    const update=vi.fn();render(<DirectoryBindingProperties node={{id:'title',type:'Heading',props:{recordBindings:{text:'title'}}}} update={update}/>);
    await userEvent.selectOptions(screen.getByRole('combobox',{name:'Directory text field'}),'body');expect(update).toHaveBeenCalledWith('recordBindings',{text:'body'});
    expect(screen.queryByRole('option',{name:'provider_id'})).toBeNull();
});
it('makes empty-image presentation an explicit template option without changing record data',async()=>{
    const update=vi.fn();render(<DirectoryBindingProperties node={{id:'cover',type:'Image',props:{recordBindings:{src:'cover',alt:'coverAlt'}}}} update={update}/>);
    await userEvent.click(screen.getByRole('checkbox',{name:'Hide when this record has no image'}));
    expect(update).toHaveBeenCalledWith('recordBindings',{src:'cover',alt:'coverAlt',hideWhenEmpty:true});
});
