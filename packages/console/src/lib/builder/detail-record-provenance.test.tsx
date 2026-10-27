import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,waitFor} from '@testing-library/react';
import {serializeCondition} from '@frontbase/edge-core/conditions';
const record=vi.hoisted(()=>({id:1,intakes:'Jan,Aug'}));
vi.mock('../../../../hydrate/src/wrappers/repeater/RecordContext',()=>({useRecord:()=>record}));
import {NativeRecordNode} from '../../../../hydrate/src/wrappers/repeater/NativeRecordNode';
it('marks displayed record fields without converting a condition-only navigation label into a record edit',async()=>{
 const condition=serializeCondition({left:{kind:'variable',path:'record.intakes'},operator:'is_set'});
 const node:any={id:'content',type:'Column',props:{},children:[{id:'nav-label',type:'Link',props:{text:'Intakes',href:'#intakes'},visibilityCondition:condition},{id:'badges',type:'Badge',props:{text:'{{ record.intakes }}',splitValues:true},visibilityCondition:condition}]};
 const {container,unmount}=render(<NativeRecordNode node={node} recordScope='["source","programs"]'/>);
 await waitFor(()=>expect(container.querySelector('#badges')?.getAttribute('data-fb-record-fields')).toBe('["intakes"]'));
 expect(container.querySelector('#nav-label')?.getAttribute('data-fb-record-fields')).toBeNull();unmount();
});
