import React from 'react';
import { describe,it,expect,vi,afterEach } from 'vitest';
import { render,screen,fireEvent,cleanup,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
const mocked=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),track:vi.fn(),testRaw:vi.fn(),testUpdate:vi.fn(),success:vi.fn(),error:vi.fn()}));
vi.mock('../api',()=>({datasourcesApi:{create:mocked.create,update:mocked.update,testRaw:mocked.testRaw,testUpdate:mocked.testUpdate}}));
vi.mock('sonner',()=>({toast:{success:mocked.success,error:mocked.error}}));
vi.mock('@/lib/analytics',()=>({track:mocked.track}));
vi.mock('@/components/dashboard/settings/shared/AccountResourcePicker',()=>({AccountResourcePicker:(props:any)=> <div>Account picker<button type="button" onClick={()=>props.onResourceSelected({id:'chosen',name:'Chosen',account_id:'cf-account'},'account')}>Choose resource</button><span data-testid="resource-filter">{props.resourceTypeFilter}</span><span data-testid="explicit-resource">{String(!!props.requireResourceSelection)}</span></div>}));
import { DatasourceModal } from './DatasourceModal';
afterEach(()=>{cleanup();vi.clearAllMocks();});
const mount=()=>{const result=render(<QueryClientProvider client={new QueryClient({defaultOptions:{mutations:{retry:false}}})}><DatasourceModal onClose={()=>{}} /></QueryClientProvider>);fireEvent.change(screen.getByPlaceholderText('My Production DB'),{target:{value:'Test source'}});return result;};
describe('Manual HTTP datasource',()=>{
    it('restores native endpoint/schema and saves without re-entering credentials',async()=>{
        mocked.update.mockResolvedValue({data:{id:'native'}});
        render(<QueryClientProvider client={new QueryClient()}><DatasourceModal datasource={{id:'native',name:'Native',type:'supabase',extra_config:{endpoint_format:'postgrest',schema:'translations'}} as any} onClose={()=>{}} /></QueryClientProvider>);
        expect(screen.getByLabelText('Endpoint format')).toHaveValue('postgrest');expect(screen.getByLabelText('Schema')).toHaveValue('translations');
        fireEvent.change(screen.getByLabelText('Schema'),{target:{value:'catalog'}});fireEvent.click(screen.getByRole('button',{name:'Save Changes'}));
        await waitFor(()=>expect(mocked.update).toHaveBeenCalled());expect(mocked.update.mock.calls[0][1]).toMatchObject({schema:'catalog',endpoint_format:'postgrest',service_role_key:''});
    });
    it('notifies when a form test passes',async()=>{
        mocked.testRaw.mockResolvedValue({data:{success:true,message:'Connection active'}});mount();fireEvent.click(screen.getByRole('button',{name:'Test Connection'}));
        await waitFor(()=>expect(mocked.success).toHaveBeenCalledWith('Connection test passed'));
    });
    it('notifies when a form test request fails',async()=>{
        mocked.testRaw.mockRejectedValue(new Error('PRIVATE_KEY'));mount();fireEvent.click(screen.getByRole('button',{name:'Test Connection'}));
        await waitFor(()=>expect(mocked.error).toHaveBeenCalled());expect(mocked.error.mock.calls[0][0]).toBe('Connection test could not complete');expect(JSON.stringify(mocked.error.mock.calls)).not.toContain('PRIVATE_KEY');
    });
    it('creates a native HTTP connection using the existing encrypted datasource API',async()=>{
        mocked.create.mockResolvedValue({data:{id:'native'}});mount();fireEvent.change(screen.getByRole('combobox',{name:'Database Type'}),{target:{value:'supabase'}});fireEvent.click(screen.getByLabelText('Connect using an HTTPS URL and server key'));
        expect(screen.queryByText('Account picker')).toBeNull();expect(screen.getByRole('button',{name:'Test Connection'})).toBeEnabled();
        fireEvent.change(screen.getByPlaceholderText('My Production DB'),{target:{value:'Selfhost'}});fireEvent.change(screen.getByLabelText('API base URL'),{target:{value:'https://native.example.test'}});fireEvent.change(screen.getByLabelText('Server API key'),{target:{value:'SYNTHETIC_TEST_KEY'}});fireEvent.click(screen.getByRole('button',{name:'Add Data Source'}));
        await waitFor(()=>expect(mocked.create).toHaveBeenCalledTimes(1));expect(mocked.create.mock.calls[0][0]).toMatchObject({type:'supabase',api_url:'https://native.example.test',service_role_key:'SYNTHETIC_TEST_KEY',provider_account_id:''});
    });
    it('does not carry the server key into another provider when changing database type',async()=>{
        mocked.create.mockResolvedValue({data:{id:'other'}});mount();fireEvent.change(screen.getByRole('combobox',{name:'Database Type'}),{target:{value:'supabase'}});fireEvent.click(screen.getByLabelText('Connect using an HTTPS URL and server key'));fireEvent.change(screen.getByLabelText('API base URL'),{target:{value:'https://native.example.test'}});fireEvent.change(screen.getByLabelText('Server API key'),{target:{value:'SYNTHETIC_TEST_KEY'}});fireEvent.change(screen.getByRole('combobox',{name:'Database Type'}),{target:{value:'turso'}});fireEvent.click(screen.getByRole('button',{name:'Choose resource'}));fireEvent.click(screen.getByRole('button',{name:'Add Data Source'}));await waitFor(()=>expect(mocked.create).toHaveBeenCalledTimes(1));expect(mocked.create.mock.calls[0][0]).toMatchObject({type:'turso',service_role_key:'',api_url:''});
    });
    it('requires an HTTPS URL and server key and clears manual credentials on returning to account mode',()=>{
        mount();fireEvent.change(screen.getByRole('combobox',{name:'Database Type'}),{target:{value:'supabase'}});fireEvent.click(screen.getByLabelText('Connect using an HTTPS URL and server key'));expect(screen.getByRole('button',{name:'Add Data Source'})).toBeDisabled();
        fireEvent.change(screen.getByLabelText('API base URL'),{target:{value:'http://native.example.test'}});fireEvent.change(screen.getByLabelText('Server API key'),{target:{value:'SYNTHETIC_TEST_KEY'}});expect(screen.getByRole('button',{name:'Add Data Source'})).toBeDisabled();fireEvent.click(screen.getByLabelText('Connect using an HTTPS URL and server key'));expect(screen.getByText('Account picker')).toBeTruthy();fireEvent.click(screen.getByLabelText('Connect using an HTTPS URL and server key'));expect(screen.getByLabelText('Server API key')).toHaveValue('');
    });
});

describe('Datasource resource routing', () => {
    it('requires a Supabase project and reuses a PostgREST account with its own schema', async () => {
        mocked.create.mockResolvedValue({data:{id:'new'}});
        mount();
        fireEvent.change(screen.getByRole('combobox',{name:'Database Type'}),{target:{value:'supabase'}});
        expect(screen.getByTestId('explicit-resource')).toHaveTextContent('true');
        expect(screen.getByRole('button',{name:'Add Data Source'})).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Endpoint format'),{target:{value:'postgrest'}});
        expect(screen.getByTestId('resource-filter')).toHaveTextContent('postgrest_endpoint');
        fireEvent.click(screen.getByRole('button',{name:'Choose resource'}));
        fireEvent.change(screen.getByLabelText('Schema'),{target:{value:'catalog'}});
        fireEvent.click(screen.getByRole('button',{name:'Add Data Source'}));
        await waitFor(()=>expect(mocked.create).toHaveBeenCalled());
        expect(mocked.create.mock.calls[0][0]).toMatchObject({
            endpoint_format:'postgrest',provider_account_id:'account',schema:'catalog',
            project_ref:'',service_role_key:'',api_url:'',
        });
    });
    it.each([['cloudflare', 'd1', {database_id:'chosen',account_id:'cf-account'}], ['supabase','supabase_project',{project_ref:'chosen'}], ['neon','neon_project',{project_id:'chosen'}], ['turso','turso_db',{db_id:'chosen',db_name:'Chosen'}]])('keeps the selected %s resource in the API payload', async (kind, filter, expected) => {
        mocked.create.mockResolvedValue({data:{id:'new'}});
        mount();
        fireEvent.change(screen.getByRole('combobox',{name:'Database Type'}),{target:{value:kind}});
        expect(screen.getByTestId('resource-filter')).toHaveTextContent(filter as string);
        fireEvent.click(screen.getByRole('button',{name:'Choose resource'}));
        fireEvent.click(screen.getByRole('button',{name:'Add Data Source'}));
        await waitFor(()=>expect(mocked.create).toHaveBeenCalledTimes(1));
        expect(mocked.create.mock.calls[0][0]).toMatchObject({type:kind,provider_account_id:'account',...(expected as object)});
    });
    it('disables unsupported wire-only providers and clears the previous selected account', () => {
        mount();
        expect(screen.getByRole('button',{name:'Add Data Source'})).toBeDisabled();
        expect(screen.getByRole('option',{name:/MySQL/})).toBeDisabled();
        expect(screen.getByRole('option',{name:/PostgreSQL/})).toBeDisabled();
        fireEvent.change(screen.getByRole('combobox',{name:'Database Type'}),{target:{value:'cloudflare'}});
        fireEvent.click(screen.getByRole('button',{name:'Choose resource'}));
        fireEvent.change(screen.getByRole('combobox',{name:'Database Type'}),{target:{value:'neon'}});
        expect(screen.queryByText(/Credentials will be resolved/)).toBeNull();
    });
});
