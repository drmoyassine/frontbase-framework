import assert from 'node:assert/strict';
import {renderNavbar} from '../dist/ssr/components/landing/Navbar.js';
const props={logo:{type:'text',text:'Site'},menuItems:[{id:'one',label:'One',navType:'link',target:'/one/'}],primaryButton:{enabled:true,text:'Contact',target:'/contact/',navType:'link',variant:'outline'}};
const pixel=renderNavbar('native', {...props,scale:1.5,navPaddingBase:'18px',menuFontSizeBase:'14px'});
assert.ok(pixel.includes('padding: 27px 0'));assert.ok(pixel.includes('font-size: 21px'));assert.ok(!pixel.includes('27rem'));assert.ok(pixel.includes('border border-current hover:bg-accent'));assert.ok(pixel.includes('aria-label="Toggle navigation"'));assert.ok(pixel.includes('aria-controls="native-mobile-menu"'));assert.ok(pixel.includes('id="native-mobile-menu"'));
const base=renderNavbar('native',props);assert.ok(base.includes('padding: 1rem 0'));assert.ok(base.includes('font-size: 0.875rem'));
assert.ok(renderNavbar('native',{...props,navPaddingBase:'1.5em',scale:2}).includes('padding: 3em 0'));
console.log('Native menu rendering: scale preserves px/rem/em, default dimensions and selected CTA styling PASS');
