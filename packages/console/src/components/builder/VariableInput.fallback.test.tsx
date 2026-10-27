import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
vi.mock('./hooks/useRepeaterRecordColumns',()=>({useRepeaterRecordColumns:()=>undefined}));
vi.mock('./VariablePicker',()=>({VariablePicker:()=>null}));
import {VariableInput} from './VariableInput';
afterEach(cleanup);
it('renders outside record scope and while metadata is unavailable',()=>{
 render(<VariableInput value="{{ record.title }}" onChange={()=>{}} syntaxContext="output"/>);
 expect(screen.getByRole('textbox')).toHaveValue('{{ record.title }}');expect(screen.queryByLabelText('Add fallback field')).toBeNull();
});
it('appends a related fallback without invoking the filter picker',()=>{
 const change=vi.fn();render(<VariableInput value="{{ record.image }}" onChange={change} syntaxContext="output" recordColumns={['institutions.image']}/>);
 fireEvent.change(screen.getByLabelText('Add fallback field'),{target:{value:'institutions.image'}});
 expect(change).toHaveBeenCalledWith('{{ record.image || record.institutions.image }}');
});
it('does not offer output fallback syntax in condition inputs',()=>{
 render(<VariableInput value="{{ record.title }}" onChange={()=>{}} syntaxContext="expression" recordColumns={['title']}/>);
 expect(screen.queryByLabelText('Add fallback field')).toBeNull();
});
