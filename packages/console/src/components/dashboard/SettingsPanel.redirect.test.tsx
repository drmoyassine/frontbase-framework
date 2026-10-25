import React from 'react';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';
import {SettingsPanel} from './SettingsPanel';
vi.mock('./settings/shared/TranslationStorageForm',()=>({TranslationStorageForm:()=>null}));
vi.mock('./settings/shared/TranslationGenerationForm',()=>({TranslationGenerationForm:()=>null}));
vi.mock('./settings/shared/TranslationBatchForm',()=>({TranslationBatchForm:()=>null}));
vi.mock('./settings/shared/PrivacySettingsForm',()=>({PrivacySettingsForm:()=>null}));
vi.mock('./settings/shared/ProjectDetailsForm',()=>({ProjectDetailsForm:()=>null}));
vi.mock('./settings/shared/PublicSiteIdentityForm',()=>({PublicSiteIdentityForm:()=>null}));
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
 it('does not offer a Template tab in normal settings',()=>{
  render(<MemoryRouter><SettingsPanel/></MemoryRouter>);
  expect(screen.queryByRole('tab',{name:'Template settings'})).toBeNull();
  expect(screen.getByRole('tab',{name:'General'})).toBeInTheDocument();
 });
});
