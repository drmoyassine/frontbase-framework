import React,{useState} from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {VisibilityConditionEditor} from './VisibilityConditionEditor';
import {ConditionValueEditor} from './ConditionValueEditor';
import {evaluateCondition,contextReader} from '@frontbase/edge-core/conditions';
vi.mock('./VariableInput',()=>({VariableInput:({value,onChange,placeholder}:any)=><input placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/>}));
afterEach(cleanup);
it('creates a visibility group, edits typed operands and keeps incomplete variables editable',()=>{
 function Editor(){const [value,setValue]=useState('');return <><VisibilityConditionEditor value={value} onChange={setValue}/><output data-testid="value">{value}</output></>;}
 render(<Editor/>);fireEvent.click(screen.getByText('Add condition'));expect(screen.getByPlaceholderText('@ Select variable')).toBeTruthy();
 fireEvent.change(screen.getByPlaceholderText('@ Select variable'),{target:{value:'user.contact_type'}});fireEvent.change(screen.getByLabelText('Right value'),{target:{value:'student'}});
 expect(evaluateCondition(screen.getByTestId('value').textContent!,contextReader({user:{contact_type:'student'}}))).toBe(true);
 fireEvent.change(screen.getByLabelText('Condition group'),{target:{value:'any'}});expect(screen.getByTestId('value').textContent).toContain('"any"');
 fireEvent.click(screen.getByText('Clear'));expect(screen.getByTestId('value').textContent).toBe('');
});
it('retains false, zero, null and JSON lists as typed values',()=>{
 function Editor(){const [value,setValue]=useState<any>({kind:'literal',value:''});return <><ConditionValueEditor value={value} onChange={setValue}/><output data-testid="value">{JSON.stringify(value)}</output></>;}
 render(<Editor/>);
 for(const [type,expected]of [['boolean',false],['number',0],['null',null],['json',[]]]){fireEvent.change(screen.getByLabelText('Value type'),{target:{value:type}});expect(JSON.parse(screen.getByTestId('value').textContent!).value).toEqual(expected);}
 fireEvent.change(screen.getByLabelText('Value'),{target:{value:'[1,false,"student"]'}});expect(JSON.parse(screen.getByTestId('value').textContent!).value).toEqual([1,false,'student']);
 fireEvent.change(screen.getByLabelText('Value'),{target:{value:'['}});expect(screen.getByRole('alert')).toBeTruthy();expect(JSON.parse(screen.getByTestId('value').textContent!).value).toEqual([1,false,'student']);
});
it('preserves unsupported legacy expressions until explicitly replaced',()=>{
 const change=vi.fn();render(<VisibilityConditionEditor value="alert('x')" onChange={change}/>);expect(screen.getByRole('alert')).toBeTruthy();expect(change).not.toHaveBeenCalled();
});
