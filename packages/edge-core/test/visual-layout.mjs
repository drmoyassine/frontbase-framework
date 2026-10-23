import assert from 'node:assert/strict';
import {renderLayoutComponent} from '../dist/ssr/layoutRenderer.js';
const child='<span>Icon</span><h2>Title</h2>';
const html=renderLayoutComponent('Row','row',{gap:'12px',align:'center',justify:'between',stackOnMobile:false,wrap:true},{},child);
for(const value of ['gap:12px','align-items:center','justify-content:space-between','flex-wrap:wrap','flex-row',child])assert.ok(html.includes(value),value);
assert.ok(!html.includes('md:flex-row'));
const defaults=renderLayoutComponent('Row','default',{}, {},child);assert.ok(defaults.includes('flex-col md:flex-row'));
const column=renderLayoutComponent('Column','col',{gap:'8px'}, {}, child);assert.ok(column.includes('gap:8px'));
const custom=renderLayoutComponent('Row','custom',{gap:'12px'}, {gap:'20px'},child);assert.ok(custom.indexOf('gap:20px')>custom.indexOf('gap:12px'));
const escaped=renderLayoutComponent('Row','safe',{gap:'" onmouseover="alert(1)'},{},child);assert.ok(!escaped.includes('gap:"'));assert.ok(escaped.includes('&quot;'));
console.log('Visual Row/Column props, defaults, style precedence and attribute escaping PASS');

const {renderStaticComponent}=await import('../dist/ssr/components/static.js');
for(const size of ['24px','1.5rem','120%','0'])assert.ok(renderStaticComponent('Text','text',{content:'Text',size},'').includes('font-size:'+size+';'));
assert.ok(renderStaticComponent('Text','text',{content:'Text',size:'base'},'').includes('font-size:var(--fb-text-base, 1rem)'));
assert.ok(!renderStaticComponent('Text','text',{content:'Text',size:'24px\" onmouseover=\"alert(1)'},'').includes('onmouseover'));
console.log('Text explicit CSS sizes and safe token fallback PASS');
