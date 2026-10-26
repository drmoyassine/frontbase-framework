import React from 'react';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';
import {SettingsPanel} from './SettingsPanel';
vi.mock('./settings/shared/LanguagesSettings',()=>({LanguagesSettings:()=> <p>Languages section</p>}));
vi.mock('./settings/shared/TranslationStorageForm',()=>({TranslationStorageForm:()=>null}));
vi.mock('./settings/shared/TranslationGenerationForm',()=>({TranslationGenerationForm:()=>null}));
vi.mock('./settings/shared/TranslationBatchForm',()=>({TranslationBatchForm:()=>null}));
vi.mock('./settings/shared/PrivacySettingsForm',()=>({PrivacySettingsForm:()=>null}));
vi.mock('./settings/shared/SiteSettingsForm',()=>({SiteSettingsForm:()=>null}));
vi.mock('./settings/shared/AdminInviteForm',()=>({AdminInviteForm:()=>null}));
vi.mock('./settings/shared/EdgeAPIKeysForm',()=>({EdgeAPIKeysForm:()=>null}));
vi.mock('./settings/shared/EdgeProvidersSection',()=>({EdgeProvidersSection:()=>null}));
vi.mock('./settings/shared/SecuritySettingsForm',()=>({SecuritySettingsForm:()=>null}));
vi.mock('./settings/shared/PlanUsageSection',()=>({PlanUsageSection:()=>null}));
vi.mock('./settings/shared/TenantTeamPanel',()=>({TenantTeamPanel:()=>null}));
afterEach(cleanup);
function Destination(){const location=useLocation();return <p>{location.pathname+location.search}</p>;}
describe('retired template settings route',()=>{
 it('redirects once within the admin router basename',async()=>{
  render(<MemoryRouter basename="/frontbase-admin" initialEntries={['/frontbase-admin/settings?tab=template']}><Routes><Route path="/settings" element={<SettingsPanel/>}/><Route path="/data-studio/datasources" element={<Destination/>}/></Routes></MemoryRouter>);
  expect(await screen.findByText('/data-studio/datasources?setup=collections')).toBeInTheDocument();
 });
 it('redirects the old translations link under General preserving other parameters',async()=>{
  render(<MemoryRouter basename="/frontbase-admin" initialEntries={['/frontbase-admin/settings?tab=translations&from=legacy']}><Routes><Route path="/settings" element={<><SettingsPanel/><Destination/></>}/></Routes></MemoryRouter>);
  expect(await screen.findByText('/settings?tab=general&from=legacy&section=translations')).toBeInTheDocument();expect(screen.queryByRole('tab',{name:'Translations'})).toBeNull();expect(screen.getByText('Languages section')).toBeInTheDocument();
 });
 it('does not offer a Template tab in normal settings',()=>{
  render(<MemoryRouter><SettingsPanel/></MemoryRouter>);
  expect(screen.queryByRole('tab',{name:'Template settings'})).toBeNull();
  expect(screen.getByRole('tab',{name:'General'})).toBeInTheDocument();
 });
});
