import {it,expect} from 'vitest';
import {createMenuDefinition,menuDocumentSchema} from '@frontbase/edge-core/menus';
import {changeNativeProp,nativeMenuProps} from './nativeAdapter';
it('preserves an item audience through native navigation edits and maps CTA destinations',()=>{
    let menu=createMenuDefinition('header','header');menu.items=[{id:'student',label:'Students',href:'/students/',audience:{authentication:'authenticated',contactTypes:['Student'],permissionLevels:[]},children:[]}];
    menu=changeNativeProp(menu,'menuItems',[{id:'student',label:'Student portal',navType:'link',target:'/portal/'}]);expect(menu.items[0].audience.contactTypes).toEqual(['Student']);
    menu=changeNativeProp(menu,'primaryButton',{enabled:true,text:'Apply',navType:'link',target:'/apply/'});expect(nativeMenuProps(menu).primaryButton.target).toBe('/apply/');
    expect(menuDocumentSchema.safeParse({schemaVersion:1,revision:1,menus:[menu]}).success).toBe(true);
    menu=changeNativeProp(menu,'logo',{type:'text',text:'Site',link:'/',useProjectLogo:false,showIcon:false});expect(nativeMenuProps(menu).logo.useProjectLogo).toBe(false);expect(nativeMenuProps(menu).logo.showIcon).toBe(false);
});
it('adapts footer columns and logo without storing a second unmanaged item tree',()=>{
    let menu=createMenuDefinition('footer','footer');menu=changeNativeProp(menu,'columns',[{id:'col',title:'About',links:[{id:'terms',text:'Terms',href:'/terms/'}]}]);
    menu=changeNativeProp(menu,'logo','https://assets.test/logo.svg');expect(nativeMenuProps(menu).logo).toBe('https://assets.test/logo.svg');expect(menu.items[0].children[0].href).toBe('/terms/');
    expect(menuDocumentSchema.safeParse({schemaVersion:1,revision:1,menus:[menu]}).success).toBe(true);
});
