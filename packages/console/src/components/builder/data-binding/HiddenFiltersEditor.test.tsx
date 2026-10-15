import React,{useState} from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {HiddenFiltersEditor} from './HiddenFiltersEditor';
vi.mock('@/components/builder/VariableInput',()=>({VariableInput:({value,onChange,placeholder}:any)=><input placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('adds, edits and removes an optional condition without altering the column filter',()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>[]})));
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 function Editor(){const [filters,setFilters]=useState<any[]>([{id:'filter',column:'kind',operator:'eq',value:'program'}]);return <><HiddenFiltersEditor tableName="catalog" dataSourceId="fixture" columns={[{name:'kind',type:'text'}]} value={filters} onChange={setFilters}/><output data-testid="saved">{JSON.stringify(filters)}</output></>;}
 render(<QueryClientProvider client={client}><Editor/></QueryClientProvider>);
 fireEvent.click(screen.getByLabelText('Conditional filter 1'));
 fireEvent.change(screen.getByPlaceholderText('@ Select variable'),{target:{value:'url.type'}});
 fireEvent.change(screen.getByLabelText('Right value'),{target:{value:'program'}});
 const saved=JSON.parse(screen.getByTestId('saved').textContent!)[0];expect(saved.column).toBe('kind');expect(saved.value).toBe('program');expect(saved.when.all[0]).toEqual({left:{kind:'variable',path:'url.type'},operator:'eq',right:{kind:'literal',value:'program'}});
 fireEvent.change(screen.getByLabelText('Condition operator'),{target:{value:'is_not_set'}});expect(screen.queryByLabelText('Right value')).toBeNull();
 fireEvent.click(screen.getByLabelText('Conditional filter 1'));expect(JSON.parse(screen.getByTestId('saved').textContent!)[0]).toEqual({id:'filter',column:'kind',operator:'eq',value:'program'});client.clear();
});
