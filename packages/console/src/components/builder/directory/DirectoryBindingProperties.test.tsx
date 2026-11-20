import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DirectoryBindingProperties } from './DirectoryBindingProperties';
afterEach(cleanup);
it('lets the owner choose the linked institution, cover fallback and fee format',async()=>{
    const update=vi.fn();
    const layout={content:[{id:'related',type:'Container',props:{_layerName:'Related institution source',directoryQuery:{version:1,queryId:'directory.institution.detail',params:{path:'/sample/'}}}}]};
    const {rerender}=render(<DirectoryBindingProperties layout={layout} node={{id:'institution',type:'Link',props:{recordBindings:{text:'title',href:'originalPath'}}}} update={update}/>);
    await userEvent.selectOptions(screen.getByRole('combobox',{name:'Record source'}),'related');
    expect(update).toHaveBeenCalledWith('recordBindings',{text:'title',href:'originalPath',relatedQuery:'related'});
    await userEvent.click(screen.getByRole('checkbox',{name:'Open in a new tab'}));
    expect(update).toHaveBeenCalledWith('target','_blank');
    rerender(<DirectoryBindingProperties layout={layout} node={{id:'cover',type:'Gallery',props:{recordBindings:{src:'cover'}}}} update={update}/>);
    await userEvent.selectOptions(screen.getByRole('combobox',{name:'Fallback cover source'}),'related');
    expect(update).toHaveBeenCalledWith('recordBindings',{src:'cover',fallbackSrcQuery:'related'});
    rerender(<DirectoryBindingProperties layout={layout} node={{id:'fee',type:'Text',props:{recordBindings:{text:'tuition'}}}} update={update}/>);
    await userEvent.selectOptions(screen.getByRole('combobox',{name:'Number display'}),'number');
    expect(update).toHaveBeenCalledWith('recordBindings',{text:'tuition',format:'number'});
});
it('makes descriptive link names configurable without altering the visible CTA',async()=>{
    const update=vi.fn();const {rerender}=render(<DirectoryBindingProperties node={{id:'cta',type:'Link',props:{text:'View details',recordBindings:{href:'originalPath'}}}} update={update}/>);
    await userEvent.click(screen.getByRole('checkbox',{name:'Include record title in link accessible name'}));
    expect(update).toHaveBeenCalledWith('recordBindings',{href:'originalPath',ariaLabel:'title'});
    rerender(<DirectoryBindingProperties node={{id:'cta',type:'Link',props:{text:'View details',recordBindings:{href:'originalPath',ariaLabel:'title'}}}} update={update}/>);
    await userEvent.click(screen.getByRole('checkbox',{name:'Include record title in link accessible name'}));
    expect(update).toHaveBeenCalledWith('recordBindings',{href:'originalPath'});
});
it('lets the owner opt into title fallback and removes it when changing the alt field',async()=>{
    const update=vi.fn();const {rerender}=render(<DirectoryBindingProperties node={{id:'cover',type:'Image',props:{recordBindings:{src:'cover',alt:'coverAlt'}}}} update={update}/>);
    await userEvent.click(screen.getByRole('checkbox',{name:'Use record title when cover alt text is empty'}));
    expect(update).toHaveBeenCalledWith('recordBindings',{src:'cover',alt:'coverAlt',altFallback:'title'});
    rerender(<DirectoryBindingProperties node={{id:'cover',type:'Image',props:{recordBindings:{src:'cover',alt:'coverAlt',altFallback:'title'}}}} update={update}/>);
    await userEvent.click(screen.getByRole('checkbox',{name:'Use record title when cover alt text is empty'}));
    expect(update).toHaveBeenCalledWith('recordBindings',{src:'cover',alt:'coverAlt'});
    await userEvent.selectOptions(screen.getByRole('combobox',{name:'Directory image alt text field'}),'title');
    expect(update).toHaveBeenCalledWith('recordBindings',{src:'cover',alt:'title'});
});
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

it('selects explicit UTC date format and removes it when switching text fields',async()=>{
    const update=vi.fn();const {rerender}=render(<DirectoryBindingProperties node={{id:'date',type:'Paragraph',props:{recordBindings:{text:'publishedAt'}}}} update={update}/>);
    await userEvent.selectOptions(screen.getByRole('combobox',{name:'Directory date display'}),'date');
    expect(update).toHaveBeenCalledWith('recordBindings',{text:'publishedAt',format:'date'});
    rerender(<DirectoryBindingProperties node={{id:'date',type:'Paragraph',props:{recordBindings:{text:'publishedAt',format:'date'}}}} update={update}/>);
    await userEvent.selectOptions(screen.getByRole('combobox',{name:'Directory text field'}),'byline');
    expect(update).toHaveBeenCalledWith('recordBindings',{text:'byline'});
    await userEvent.selectOptions(screen.getByRole('combobox',{name:'Directory date display'}),'raw');
    expect(update).toHaveBeenCalledWith('recordBindings',{text:'publishedAt'});
});
