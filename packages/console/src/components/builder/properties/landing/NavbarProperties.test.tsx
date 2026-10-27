import React from 'react';
import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,within} from '@testing-library/react';
import {afterEach} from 'vitest';
// The switcher toggle must render in EVERY properties context — page layouts and shared app
// menus alike. Managed menu regions compose into the served layout as real Navbar nodes before
// the serve-side injection walk (resolveAppMenuLayout → addHomepageLanguageLinks), so a
// menus-context toggle surfaces a real picker; hiding it here made operator suppression
// impossible. This pin exists because the toggle was once hidden in the menus context.
vi.mock('@/components/builder/shared/SelectTargetButton',()=>({SelectTargetButton:()=>null}));
// jsdom ships neither ResizeObserver (Radix switch/slider measure their triggers) nor
// scrollIntoView; stub the surfaces this panel's primitives touch.
class ResizeObserverStub{observe(){}unobserve(){}disconnect(){}}
(globalThis as any).ResizeObserver=(globalThis as any).ResizeObserver??ResizeObserverStub;
(Element.prototype as any).scrollIntoView=(Element.prototype as any).scrollIntoView??(()=>{});
import {NavbarProperties} from './NavbarProperties';
afterEach(()=>cleanup());
describe('Navbar language switcher toggle',()=>{
    it('renders for plain props — the formerly menus-hidden case included',()=>{
        render(<NavbarProperties componentId="nav" props={{}} updateComponentProp={vi.fn()} project={null}/>);
        const section=screen.getByText('Language switcher').closest('div') as HTMLElement;
        const toggle=()=>within(section).getByRole('switch') as HTMLButtonElement;
        expect(toggle()).toBeTruthy();
        expect(toggle().dataset.state).toBe('checked');
    });
    it('persists explicit suppression and re-enable through the component prop',()=>{
        const update=vi.fn();
        const view=render(<NavbarProperties componentId="nav" props={{showLanguageSwitcher:false}} updateComponentProp={update} project={null}/>);
        const section=screen.getByText('Language switcher').closest('div') as HTMLElement;
        const toggle=()=>within(section).getByRole('switch') as HTMLButtonElement;
        expect(toggle().dataset.state).toBe('unchecked');
        fireEvent.click(toggle());
        expect(update).toHaveBeenCalledWith('showLanguageSwitcher',true);
        view.rerender(<NavbarProperties componentId="nav" props={{showLanguageSwitcher:true}} updateComponentProp={update} project={null}/>);
        expect(toggle().dataset.state).toBe('checked');
    });
});
