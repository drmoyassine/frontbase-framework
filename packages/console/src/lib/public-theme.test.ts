import {describe,it,expect} from 'vitest';
import {JSDOM} from 'jsdom';
import {publicThemeScript} from '../../../edge-core/src/public-theme';
import {renderThemeSwitcher} from '../../../edge-core/src/ssr/components/landing/themeSwitcher';
function fixture(saved?:string,path='/'){
    const dom=new JSDOM(`<html><body>${renderThemeSwitcher()}</body></html>`,{url:`https://site.test${path}`,runScripts:'outside-only'}),win=dom.window;
    let dark=false;const listeners:Function[]=[];win.matchMedia=(()=>({get matches(){return dark;},addEventListener:(_:string,fn:Function)=>listeners.push(fn)})) as any;
    if(saved)win.localStorage.setItem('frontbase:public-theme',saved);
    return{dom,win,start:()=>win.eval(publicThemeScript()),choose:(mode:string)=>(win.document.querySelector(`[data-fb-theme-choice="${mode}"]`) as HTMLButtonElement).click(),change:(value:boolean)=>{dark=value;listeners.forEach(fn=>fn());},listeners};
}
describe('public appearance preference',()=>{
    it('defaults to System and follows OS changes until an explicit choice',()=>{
        const f=fixture();f.start();expect(f.win.document.documentElement.dataset.fbThemePreference).toBe('system');f.change(true);expect(f.win.document.documentElement.classList.contains('dark')).toBe(true);f.choose('light');f.change(true);expect(f.win.document.documentElement.classList.contains('dark')).toBe(false);f.choose('system');expect(f.win.document.documentElement.classList.contains('dark')).toBe(true);expect(f.win.localStorage.getItem('frontbase:public-theme')).toBe('system');f.dom.window.close();
    });
    it('persists explicit choices and restores them on a subsequent visit',()=>{
        const f=fixture();f.start();f.choose('dark');const saved=f.win.localStorage.getItem('frontbase:public-theme')!;expect(f.win.document.querySelector('[data-fb-theme-choice="dark"]')?.getAttribute('aria-pressed')).toBe('true');const next=fixture(saved);next.start();expect(next.win.document.documentElement.dataset.fbTheme).toBe('dark');f.dom.window.close();next.dom.window.close();
    });
    it('works with blocked storage and does not initialize twice',()=>{
        const f=fixture();Object.defineProperty(f.win,'localStorage',{get:()=>{throw Error('blocked');}});f.start();f.start();expect(f.listeners).toHaveLength(1);f.choose('dark');expect(f.win.document.documentElement.dataset.fbTheme).toBe('dark');f.dom.window.close();
    });
    it('synchronizes tabs and handles controls inserted after initialization',()=>{
        const f=fixture();f.start();f.win.document.body.innerHTML=renderThemeSwitcher();f.choose('dark');expect(f.win.document.documentElement.dataset.fbTheme).toBe('dark');f.win.dispatchEvent(new f.win.StorageEvent('storage',{key:'frontbase:public-theme',newValue:'system'}));expect(f.win.document.documentElement.dataset.fbThemePreference).toBe('system');expect(f.win.document.documentElement.dataset.fbTheme).toBe('light');f.dom.window.close();
    });
    it('honors legacy explicit preferences, ignores invalid values and leaves admin untouched',()=>{
        const f=fixture('invalid');f.win.localStorage.setItem('fb-theme','dark');f.start();expect(f.win.document.documentElement.dataset.fbTheme).toBe('dark');f.choose('system');expect(f.win.document.documentElement.dataset.fbTheme).toBe('light');f.dom.window.close();const admin=fixture('dark','/frontbase-admin/menus');admin.start();expect(admin.win.document.documentElement.dataset.fbThemeReady).toBeUndefined();admin.dom.window.close();
    });
});
