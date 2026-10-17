import React from 'react';
import { describe,it,expect,vi,afterEach } from 'vitest';
import { render,screen,fireEvent,cleanup,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
const mocked=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),track:vi.fn()}));
vi.mock('../api',()=>({datasourcesApi:{create:mocked.create,update:mocked.update}}));
vi.mock('@/lib/analytics',()=>({track:mocked.track}));
vi.mock('@/components/dashboard/settings/shared/AccountResourcePicker',()=>({AccountResourcePicker:()=> <div>Account picker</div>}));
import { DatasourceModal } from './DatasourceModal';
afterEach(()=>{cleanup();vi.clearAllMocks();});
const mount=()=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{mutations:{retry:false}}})}><DatasourceModal onClose={()=>{}} /></QueryClientProvider>);
describe('Manual HTTP datasource',()=>{
    it('creates a native HTTP connection using the existing encrypted datasource API',async()=>{
        mocked.create.mockResolvedValue({data:{id:'native'}});mount();fireEvent.change(screen.getByRole('combobox'),{target:{value:'supabase'}});fireEvent.click(screen.getByLabelText('Connect using an HTTPS URL and server key'));
        expect(screen.queryByText('Account picker')).toBeNull();expect(screen.getByRole('button',{name:'Test Connection'})).toBeDisabled();
        fireEvent.change(screen.getByPlaceholderText('My Production DB'),{target:{value:'Selfhost'}});fireEvent.change(screen.getByLabelText('API base URL'),{target:{value:'https://native.example.test'}});fireEvent.change(screen.getByLabelText('Server API key'),{target:{value:'SYNTHETIC_TEST_KEY'}});fireEvent.click(screen.getByRole('button',{name:'Add Data Source'}));
        await waitFor(()=>expect(mocked.create).toHaveBeenCalledTimes(1));expect(mocked.create.mock.calls[0][0]).toMatchObject({type:'supabase',api_url:'https://native.example.test',service_role_key:'SYNTHETIC_TEST_KEY',provider_account_id:''});
    });
    it('does not carry the server key into another provider when changing database type',async()=>{
        mocked.create.mockResolvedValue({data:{id:'other'}});mount();fireEvent.change(screen.getByRole('combobox'),{target:{value:'supabase'}});fireEvent.click(screen.getByLabelText('Connect using an HTTPS URL and server key'));fireEvent.change(screen.getByLabelText('API base URL'),{target:{value:'https://native.example.test'}});fireEvent.change(screen.getByLabelText('Server API key'),{target:{value:'SYNTHETIC_TEST_KEY'}});fireEvent.change(screen.getByRole('combobox'),{target:{value:'turso'}});fireEvent.click(screen.getByRole('button',{name:'Add Data Source'}));await waitFor(()=>expect(mocked.create).toHaveBeenCalledTimes(1));expect(mocked.create.mock.calls[0][0]).toMatchObject({type:'turso',service_role_key:'',api_url:''});
    });
    it('requires an HTTPS URL and server key and clears manual credentials on returning to account mode',()=>{
        mount();fireEvent.change(screen.getByRole('combobox'),{target:{value:'supabase'}});fireEvent.click(screen.getByLabelText('Connect using an HTTPS URL and server key'));expect(screen.getByRole('button',{name:'Add Data Source'})).toBeDisabled();
        fireEvent.change(screen.getByLabelText('API base URL'),{target:{value:'http://native.example.test'}});fireEvent.change(screen.getByLabelText('Server API key'),{target:{value:'SYNTHETIC_TEST_KEY'}});expect(screen.getByRole('button',{name:'Add Data Source'})).toBeDisabled();fireEvent.click(screen.getByLabelText('Connect using an HTTPS URL and server key'));expect(screen.getByText('Account picker')).toBeTruthy();fireEvent.click(screen.getByLabelText('Connect using an HTTPS URL and server key'));expect(screen.getByLabelText('Server API key')).toHaveValue('');
    });
});
