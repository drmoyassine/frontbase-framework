import React from 'react';
import {expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {DetailTemplateStarter} from './DetailTemplateStarter';
const mocks=vi.hoisted(()=>({getPages:vi.fn(),state:{pages:[] as any[]}}));
vi.mock('@/services/pages-api',()=>({getPages:mocks.getPages}));
vi.mock('@/stores/builder',()=>({useBuilderStore:(selector:any)=>selector(mocks.state)}));
it('loads saved bindings without overwriting an uncached current draft, stripping compiled requests before applying',async()=>{
 const page:any={id:'current',layoutData:{root:{siteConfiguration:{version:1,role:'institution'}},content:[{id:'draft',type:'Text',props:{content:'UNSAVED OWNER COPY'}}]}};mocks.state.pages=[page];
 const binding={componentId:'source',dataSourceId:'owned',tableName:'institutions',viewId:'view',viewName:'Campus view',pagination:{enabled:true,pageSize:12,page:0},sorting:{enabled:true,column:'title',direction:'asc'},filtering:{searchEnabled:false,filters:{}},columnOverrides:{},dataRequest:{headers:{authorization:'PRIVATE_NEVER_COPY'}},_resolvedHiddenFilters:[],datasourceId:'owned'};
 mocks.getPages.mockResolvedValue([{id:'explore',layoutData:{root:{},content:[{id:'source',type:'Repeater',props:{binding},children:[]}]}}]);
 const onChange=vi.fn(),before=JSON.stringify(mocks.state);const view=render(<DetailTemplateStarter page={page} onChange={onChange} contactUrl="mailto:help@example.org"/>);view.container.querySelector('details')!.open=true;
 fireEvent.click(screen.getByRole('button',{name:'Load sources from saved pages'}));await waitFor(()=>expect(screen.getAllByRole('option',{name:'Campus view'})).toHaveLength(2));expect(JSON.stringify(mocks.state)).toBe(before);expect(onChange).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Detail record source'),{target:{value:'view'}});fireEvent.change(screen.getByLabelText('Detail starting point preview path'),{target:{value:'/campus/'}});fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Apply detail starting point'}));
 await waitFor(()=>expect(onChange).toHaveBeenCalledTimes(1));const result=onChange.mock.calls[0][0];expect(result.content[1].props.binding).toMatchObject({dataSourceId:'owned',viewId:'view'});expect(JSON.stringify(result)).not.toContain('PRIVATE_NEVER_COPY');expect(JSON.stringify(result)).not.toContain('dataRequest');expect(JSON.stringify(mocks.state)).toBe(before);
});
