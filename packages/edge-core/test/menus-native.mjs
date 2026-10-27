import assert from 'node:assert/strict';
import {renderNavbar} from '../dist/ssr/components/landing/Navbar.js';
import {menuComponent} from '../dist/menu-components.js';
import {createMenuDefinition,menuDefinitionSchema} from '../dist/menus.js';
import {FALLBACK_CSS} from '../dist/ssr/baseStyles.js';
const props={logo:{type:'text',text:'Site'},menuItems:[{id:'one',label:'One',navType:'link',target:'/one/'}],primaryButton:{enabled:true,text:'Contact',target:'/contact/',navType:'link',variant:'outline'}};
const pixel=renderNavbar('native', {...props,scale:1.5,navPaddingBase:'18px',menuFontSizeBase:'14px'});
assert.ok(pixel.includes('padding: 27px 0'));assert.ok(pixel.includes('font-size: 21px'));assert.ok(!pixel.includes('27rem'));assert.ok(pixel.includes('border border-current hover:bg-accent'));assert.ok(pixel.includes('aria-label="Toggle navigation"'));assert.ok(pixel.includes('aria-controls="native-mobile-menu"'));assert.ok(pixel.includes('id="native-mobile-menu"'));
const base=renderNavbar('native',props);assert.ok(base.includes('padding: 1rem 0'));assert.ok(base.includes('font-size: 0.875rem'));
assert.match(FALLBACK_CSS,/\.fb-page \{[^}]*overflow-x: clip/);assert.ok(renderNavbar('sticky',{...props,sticky:true}).includes('sticky top-0 z-50'));
const managed=menuComponent(createMenuDefinition('header','header'),null);assert.equal(managed.styles.values.maxWidth,undefined);assert.equal(managed.props.contentMaxWidth,1180);assert.ok(renderNavbar(managed.id,managed.props).includes('style="max-width: 1180px;"'));
assert.ok(renderNavbar('native',{...props,navPaddingBase:'1.5em',scale:2}).includes('padding: 3em 0'));
const theme=renderNavbar('appearance',{...props,showDarkModeToggle:true});for(const mode of ['light','dark','system'])assert.ok(theme.includes(`data-fb-theme-choice="${mode}"`));assert.ok(!theme.includes("localStorage.getItem('fb-theme')"));
// The legacy navbar format renders the serve-injected switcher too (same picker, CTA-adjacent),
// and the menus schema persists the toggle instead of failing every save that touches it.
const legacy=renderNavbar('legacy',{logoText:'Site',links:[{href:'/one/',text:'One'}],ctaText:'Contact',ctaLink:'/contact/',languageSwitcher:[{code:'en',label:'English',href:'/',current:true}]});
assert.ok(legacy.includes('data-fb-language-picker'),'the legacy navbar renders the injected switcher');assert.ok(legacy.indexOf('data-fb-language-picker')<legacy.indexOf('-cta"'),'the switcher sits beside the CTA');
assert.ok(!renderNavbar('legacy',{logoText:'Site',showLanguageSwitcher:false,languageSwitcher:[{code:'en',label:'English',href:'/',current:true}]}).includes('data-fb-language-picker'));
const toggled=createMenuDefinition('header','header');toggled.design.componentProps={showLanguageSwitcher:false};
assert.equal(menuDefinitionSchema.parse(toggled).design.componentProps.showLanguageSwitcher,false,'the language-switcher toggle persists through the menu schema');
console.log('Native menu rendering: scale preserves px/rem/em, default dimensions and selected CTA styling PASS');
