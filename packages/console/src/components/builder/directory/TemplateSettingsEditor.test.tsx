import React,{useState} from 'react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {defaultTemplateSettings} from '@frontbase/edge-core/directory/configuration';
import {TemplateSettingsEditor} from './TemplateSettingsEditor';
vi.mock('@/components/dashboard/FileBrowser/FilePickerDialog',()=>({FilePickerDialog:({onSelect,requirePublicUrl}:any)=><button onClick={()=>onSelect('https://media.test/new.png',{})}>Pick {requirePublicUrl?'public':'signed'} image</button>}));
afterEach(cleanup);
describe('template settings editor',()=>{
    it('changes presets without discarding hero copy or explicit color overrides',()=>{
        const initial=defaultTemplateSettings();initial.colors.primary='#112233';const changed=vi.fn();
        function Editor(){const[value,setValue]=useState(initial);return <TemplateSettingsEditor value={value} onChange={next=>{changed(next);setValue(next);}}/>;}
        render(<Editor/>);fireEvent.change(screen.getByLabelText('Template preset'),{target:{value:'charcoal'}});
        expect(changed.mock.lastCall?.[0].colors.primary).toBe('#112233');expect(changed.mock.lastCall?.[0].hero.heading).toBe(initial.hero.heading);
    });
    it('selects permanent storage media and supports saved slide ordering',()=>{
        const initial=defaultTemplateSettings();initial.hero.slides=[{src:'https://media.test/old.png',alt:'Original',focalX:50,focalY:50}];const changed=vi.fn();
        function Editor(){const[value,setValue]=useState(initial);return <TemplateSettingsEditor value={value} onChange={next=>{changed(next);setValue(next);}}/>;}
        render(<Editor/>);fireEvent.click(screen.getByText('Add image from storage'));fireEvent.click(screen.getByText('Pick public image'));expect(changed.mock.lastCall?.[0].hero.slides).toHaveLength(2);
        fireEvent.click(screen.getAllByText('Move up')[1]);expect(changed.mock.lastCall?.[0].hero.slides[0].src).toBe('https://media.test/new.png');expect(changed.mock.lastCall?.[0].hero.slides[1].alt).toBe('Original');
    });
    it('reports invalid colors and exposes no featured-institution picker',()=>{
        const initial=defaultTemplateSettings();initial.colors.primary='javascript:bad';render(<TemplateSettingsEditor value={initial} onChange={()=>{}}/>);
        expect(screen.getByRole('alert').textContent).toMatch(/Check colors/);expect(screen.queryByLabelText('Featured institutions')).toBeNull();
    });
});
