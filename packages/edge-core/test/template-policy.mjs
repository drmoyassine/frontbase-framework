import {liveViewBindings} from '../dist/directory/configuration.js';
import {upgradeTemplateRoutes} from '../../../scripts/migration/template-route-upgrade.mjs';
import assert from 'node:assert/strict';
import {emptyTemplatePolicy,templatePolicySchema,resolveTemplatePolicy} from '../dist/template-policy.js';
const policy=emptyTemplatePolicy();policy.defaults.values={title:'{{ record.title }} · Site',image:'{{ record.program_image || record["institutions.image"] }}'};
policy.defaults.locales={ar:{title:'{{ record.title }} · الدراسة'}};
policy.rules=[{id:'one',name:'Unconfirmed',when:{left:{kind:'variable',path:'record.availability'},operator:'eq',right:{kind:'literal',value:'unconfirmed'}},settings:{values:{notice:'Please contact us',ctaLabel:'Contact',listed:false},locales:{ar:{notice:'يرجى التواصل معنا'}}}},
{id:'two',name:'Later rule',when:'record.id == 1',settings:{values:{notice:'WRONG'}}}];
policy.overrides['programs:1']={values:{description:'Specific description'},locales:{ar:{description:'وصف عربي'}}};
templatePolicySchema.parse(policy);
const record={id:1,title:'علم النفس',availability:'unconfirmed','institutions.image':'https://images.test/cover.jpg',program_image:''};
const result=resolveTemplatePolicy(policy,'programs:1','ar',record);
assert.equal(result.values.title,'علم النفس · الدراسة');assert.equal(result.values.notice,'يرجى التواصل معنا');assert.equal(result.values.description,'وصف عربي');assert.equal(result.values.image,'https://images.test/cover.jpg');assert.equal(result.values.listed,false);assert.equal(result.ruleId,'one');
assert.equal(resolveTemplatePolicy(policy,'programs:2','en',{id:2,title:'New'}).values.notice,undefined);
assert.equal(resolveTemplatePolicy({...policy,defaults:{values:{ctaHref:'javascript:alert(1)',image:'//outside.test/a'}}},'programs:2','en',{}).values.ctaHref,'');
assert.equal(templatePolicySchema.safeParse({...policy,rules:[...policy.rules,policy.rules[0]]}).success,false);
assert.equal(templatePolicySchema.safeParse({...policy,defaults:{values:{title:'{% include "secret" %}'}}}).success,false);
assert.equal(templatePolicySchema.safeParse({...policy,overrides:{'programs:bad:key':{values:{}}}}).success,false);
assert.deepEqual(resolveTemplatePolicy(emptyTemplatePolicy(),'programs:1','ar',record).values,{});
console.log('template-policy: inheritance, first-match, record/locale precedence, related fallback, unsafe links and malformed settings PASS');

const layout={root:{siteConfiguration:{version:1,role:'program'},custom:'preserved'},content:[{id:'apply',type:'Link',props:{text:'Apply',actionBindings:[{id:'action',trigger:'onClick',actionType:'openPage',config:{pageUrl:'mailto:old@example.test'}}]}}]};
const input={layout,associations:[{source:'pages:notice',recordId:3,parentId:2}],notice:{en:'Availability unconfirmed',ar:'لم يتم تأكيد التوفر'},ctaNodeId:'apply',ctaHref:'mailto:advice@example.test'};
const upgraded=upgradeTemplateRoutes(input);assert.equal(upgraded.root.custom,'preserved');assert.equal(upgraded.content[0].type,'Container');assert.equal(upgraded.content[1].props.text,'Apply');assert.equal(upgraded.content[1].props.actionBindings[0].config.pageUrl,'mailto:old@example.test');assert.equal(upgraded.content[1].versions.length,1);
assert.deepEqual(upgradeTemplateRoutes({...input,layout:upgraded}),upgraded);assert.equal(layout.content.length,1);assert.ok(!layout.root.templatePolicy);
console.log('template upgrade: ordinary editable notice, unchanged default Actions/settings, explicit retained identities and idempotence PASS');

const bound={componentId:'detail',dataSourceId:'owned',viewId:'view',tableName:'programs',pagination:{enabled:false,pageSize:1,page:0},sorting:{enabled:false},filtering:{searchEnabled:false,filters:{}},columnOverrides:{}};
const metadata={...emptyTemplatePolicy(),defaults:{values:{image:'{{ record["institutions.image"] }}'}}};
const bindings=liveViewBindings({root:{templatePolicy:metadata},content:[{id:'detail',type:'Card',props:{binding:bound},children:[]}]});
assert.ok(bindings[0].columnOrder.includes('institutions.image'),'metadata bracket bindings join the existing declared related-field capability');
