import {afterEach,expect,it} from 'vitest';
import {stampComponentIds,findComponentId,queryComponentRects} from './iframeBridge';
import {stampEditableText} from './editableText';
import {cloneBlockTree} from '@frontbase/edge-core/block-versions';
import {templateRecordFields,bindingWithTemplateFields} from '@frontbase/edge-core/directory/configuration';
afterEach(()=>{document.body.innerHTML='';});
it('maps repeated child hits back to the editable template and registers one drop target per node',()=>{
    const nodes:any=[{id:'list',type:'Repeater',props:{},children:[{id:'card',type:'Card',props:{},children:[{id:'label',type:'Text',props:{text:'{{ record.type }}'}}]}]}];
    document.body.innerHTML='<div id="list"><div id="card"><span id="label">Public</span></div><div id="list--row-1-1"><span id="list--row-1-2">Private</span></div></div>';
    stampComponentIds(document,nodes);expect(findComponentId(document.getElementById('list--row-1-2'))).toBe('label');expect(queryComponentRects(document).filter(rect=>rect.id==='card')).toHaveLength(1);
    stampEditableText(document,nodes,false);expect(document.getElementById('label')).not.toHaveAttribute('data-fb-edit-id');
});
it('collects arbitrary child fields and relationships, keeping a nested repeater record scope separate',()=>{
    const children:any=[{id:'text',type:'Text',props:{text:'{{ record.institutions.type }} {{ record["cities.name"] }}'}},{id:'nested',type:'Repeater',props:{binding:{tableName:'other'}},children:[{id:'nested-text',type:'Text',props:{text:'{{ record.private.name }}'}}]}];
    expect(templateRecordFields(children)).toEqual(['institutions.type','cities.name']);expect(bindingWithTemplateFields({columnOrder:['title']},children).columnOrder).toEqual(['title','institutions.type','cities.name']);
});

it('uses exact source identities for nested repeated instances without selecting a zero-size wrapper',()=>{
    const nodes:any=[{id:'outer',type:'Repeater',props:{},children:[{id:'inner',type:'Repeater',props:{},children:[{id:'nested-label',type:'Text',props:{text:'{{ record.name }}'}}]}]}];
    document.body.innerHTML='<div id="outer"><div data-fb-template-source="nested-label" data-fb-template-instance="nested-instance" style="display:contents"><span id="nested-instance">Related value</span></div></div>';
    stampComponentIds(document,nodes);expect(findComponentId(document.getElementById('nested-instance'))).toBe('nested-label');expect(queryComponentRects(document).filter(rect=>rect.id==='nested-label')).toHaveLength(1);
});

it('retains original authoring identity through nested instance cloning without changing normal clones',()=>{
    const nodes:any=[{id:'original',type:'Text',props:{text:'Bound text'}}];let n=0;
    const first=cloneBlockTree(nodes,()=>`instance-${++n}`,true),second=cloneBlockTree(first,()=>`nested-${++n}`,true);
    expect(second[0].props._templateSourceId).toBe('original');expect(cloneBlockTree(nodes,()=>`plain-${++n}`)[0].props).not.toHaveProperty('_templateSourceId');expect(nodes[0].props).not.toHaveProperty('_templateSourceId');
});
