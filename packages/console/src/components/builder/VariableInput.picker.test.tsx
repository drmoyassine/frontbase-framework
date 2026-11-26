import React, { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('./hooks/useRepeaterRecordColumns', () => ({ useRepeaterRecordColumns: () => [] }));
const fixture=vi.hoisted(()=>({detailColumns:undefined as {institution:string[];program:string[]}|undefined, builder:{currentPageId:'page-1'} as Record<string,unknown>}));
vi.mock('@/stores/builder', () => ({ useBuilderStore: (select: (state: typeof fixture.builder) => unknown) => select(fixture.builder) }));
vi.mock('../../hooks/useVariables', () => ({ useVariables: () => ({ variables: [], filters: [{ name: 'upcase', category: 'Text' }], isLoading: false,detailColumns:fixture.detailColumns }) }));

import { VariableInput } from './VariableInput';

afterEach(()=>{cleanup();fixture.detailColumns=undefined;fixture.builder={currentPageId:'page-1'};});

function Field() {
    const [value, setValue] = useState('');
    return <VariableInput ariaLabel="Template text" syntaxContext="output" recordColumns={['requirements']} value={value} onChange={setValue} />;
}

it('inserts a real record field, closes on Escape, and finds a filter after whitespace', () => {
    Element.prototype.scrollIntoView ??= vi.fn();
    render(<Field />);
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Template text' });
    const type = (value: string) => {
        fireEvent.change(input, { target: { value } });
        input.setSelectionRange(value.length, value.length);
        fireEvent.keyUp(input, { key: value.at(-1) });
    };
    const key = (value: string) => {
        fireEvent.keyDown(input, { key: value });
        fireEvent.keyUp(input, { key: value });
    };
    type('@requ');
    expect(within(screen.getByText('Record').parentElement!).getByText('1')).toBeTruthy();
    key('Escape');
    expect(screen.queryByText('Record')).toBeNull();
    type('@require');
    fireEvent.click(screen.getByText('Record'));
    key('Enter');
    expect(input.value).toBe('{{ record.requirements }}');
    type('{{ record.requirements | up');
    fireEvent.click(screen.getByText('upcase'));
    expect(input.value).toBe('{{ record.requirements | upcase');
    type('person@example');
    expect(screen.queryByText('Record')).toBeNull();
});

it.each([['institution','campus_motto','program_note'],['program','program_note','campus_motto']])('uses the owned %s view column selection in Builder',(role,field,other)=>{
    fixture.detailColumns={institution:['campus_motto'],program:['program_note']};
    fixture.builder={currentPageId:'page-1',selectedComponentId:'label',editingVersions:{},pages:[{
        id:'page-1',layoutData:{content:[{id:'detail',type:'Container',props:{directoryQuery:{queryId:`directory.${role}.detail`}},
            children:[{id:'label',type:'Text',props:{text:'Campus'}}]}]},
    }]};
    Element.prototype.scrollIntoView ??= vi.fn();
    render(<Field />);
    const input=screen.getByRole<HTMLInputElement>('textbox',{name:'Template text'});
    fireEvent.change(input,{target:{value:'@'}});
    input.setSelectionRange(1,1);
    fireEvent.keyUp(input,{key:'@'});
    fireEvent.click(screen.getByText('Record'));
    expect(screen.queryByText('requirements')).toBeNull();
    expect(screen.queryByText(other)).toBeNull();
    fireEvent.click(screen.getByText(field));
    expect(input.value).toBe(`{{ record.columns.${field} }}`);
});
