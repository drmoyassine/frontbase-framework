import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
vi.mock('./TranslationGenerationForm',()=>({TranslationGenerationForm:()=> <input aria-label="Model draft"/>}));
vi.mock('./TranslationStorageForm',()=>({TranslationStorageForm:()=> <p>Storage editor</p>}));
vi.mock('./TranslationBatchForm',()=>({TranslationBatchForm:()=> <p>Batch editor</p>}));
import {LanguagesSettings} from './LanguagesSettings';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('loads nothing operational until opened and retains drafts when collapsed',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:false});vi.stubGlobal('fetch',fetcher);
 render(<MemoryRouter><LanguagesSettings/></MemoryRouter>);expect(fetcher).not.toHaveBeenCalled();expect(screen.queryByLabelText('Model draft')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:/Languages & translations/}));await screen.findByText(/Summary unavailable/);expect(fetcher).toHaveBeenCalledTimes(2);expect(screen.queryByText('Batch editor')).toBeNull();
 const detail=screen.getByText('Languages & AI').closest('details')!;detail.open=true;fireEvent(detail,new Event('toggle'));await screen.findByLabelText('Model draft');fireEvent.change(screen.getByLabelText('Model draft'),{target:{value:'unsaved-model'}});
 detail.open=false;fireEvent(detail,new Event('toggle'));detail.open=true;fireEvent(detail,new Event('toggle'));expect(screen.getByLabelText('Model draft')).toHaveValue('unsaved-model');expect(fetcher.mock.calls.every(([,options])=>!options.method)).toBe(true);
});
