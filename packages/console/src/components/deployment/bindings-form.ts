import { configurableRoles, deploymentAdapters, validateDeploymentManifest, supabaseStateSchemaName, type ConfigurableRole, type DeploymentAdapter, type DeploymentManifest, type BindingSelection } from '@frontbase/edge-core/deployment';

import {names} from './binding-labels';
export {bindingLabels} from './binding-labels';
const fields: Record<string,string> = {url:'Service URL',endpoint:'Endpoint',region:'Region',bucket:'Bucket',accountId:'Account ID',databaseId:'Database ID',indexName:'Index name',destination:'Callback URL',resourceName:'Resource name',from:'Sender address',token:'Access token',accessKeyId:'Access key ID',secretAccessKey:'Secret access key',signingKey:'Signing key',nextSigningKey:'Next signing key',schema:'Schema',host:'Host',port:'Port',database:'Database',projectRef:'Project reference',username:'Role name',password:'Role password'};
const stepCopy: Record<string,[string,string]> = {'state-db':['State Database','Required. Where Frontbase stores its own state and configuration.'],storage:['File Storage','Optional. Object storage for uploads and media.'],cache:['Application Cache','Optional. Fast ephemeral storage for sessions and caching.'],queue:['Queue Delivery','Optional. Background jobs and message delivery.'],vector:['Vector Database','Optional. Embeddings storage for semantic search.'],'email-send':['Email Delivery','Optional. Outbound transactional email.']};
const stepOrder: readonly ConfigurableRole[] = ['state-db','storage','cache','queue','vector','email-send'];
const brandMarks: Record<string,string> = {
    cloudflare:'<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="#F38020" d="M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383z"/></svg>',
    upstash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#00E9A3" d="M4 3h6v10a3 3 0 0 0 6 0V3h4v10a8 8 0 0 1-16 0z"/></svg>',
    supabase:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#3ECF8E" d="M13 2 4.5 13.5h6L9 22l8.5-11.5h-6L13 2z"/></svg>',
    vercel:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5" fill="#000"/><path fill="#fff" d="M12 5.5 19.5 18h-15L12 5.5z"/></svg>'
};
type ProviderName='cloudflare'|'vercel'|'supabase'|'upstash';
type ProjectOption={ref:string;name:string};
type SchemaOption={name:string;hasRole:boolean};
type Discovery<T>={status:'loading'}|{status:'ready';items:T[]}|{status:'fallback'};
export interface BindingsFormOptions {
    manifest: DeploymentManifest;
    adapters?: readonly DeploymentAdapter[];
    executionCapabilities?: {adapters: Record<string, readonly BindingSelection['mode'][]>};
    credentials?: 'entry' | 'references';
    externalProviders?: boolean;
    initialRole?: ConfigurableRole;
    initialProviders?: Partial<Record<ConfigurableRole,string>>;
    resourceOptions?: Record<string,Array<{id:string;name:string}>>;
    /** Only supplied by a host with an authenticated server-side connection flow. */
    providerConnections?: Partial<Record<ProviderName,{available:boolean;connected:boolean;label?:string;accountId?:string;capabilities?:string[]}>>;
    onDemand?: boolean;
    loadConnections?: ()=>Promise<BindingsFormOptions['providerConnections']>;
    loadResources?: ()=>Promise<NonNullable<BindingsFormOptions['resourceOptions']>>;
    connectionsPending?: boolean;
    onConnect?: (provider:ProviderName)=>Promise<void>;
    /** Origin-relative base of the read-only discovery endpoints; '' talks to the same origin. */
    discoveryBase?: string;
    /** Wired by wizard pages to their existing continue/review trigger. */
    onDeployNow?: () => void;
    onChange?: () => void;
}
/** One browser-only editor for bootstrap and console. Credential values never enter the manifest. */
export function mountBindingsForm(root: HTMLElement, options: BindingsFormOptions) {
    let manifest=structuredClone(options.manifest);
    const createNames=new Map(Object.entries(options.manifest.bindings).map(([role,binding])=>[role,binding.config.resourceName]));
    const secrets=new Map<string,string>(), document=root.ownerDocument;
    const adapters=options.adapters??deploymentAdapters;
    const entry=options.credentials!=='references';
    let currentStep=0, steps: readonly ConfigurableRole[]=[], destroyed=false;
    let projects: Discovery<ProjectOption>|undefined;
    const inventories=new Map<string,Discovery<{id:string;name:string;url?:string;endpoint?:string}>>();
    const schemasByProject=new Map<string,Discovery<SchemaOption>>();
    let postgresDiscovery:{generation:number;status:'loading'|'ready'|'failed';schemas:string[];message:string}|undefined,postgresGeneration=0;
    let reviewing=false,accountPickerOpened=false;
    const pending=new Set<Promise<void>>();
    const track=(work:Promise<void>)=>{pending.add(work);void work.finally(()=>pending.delete(work));};
    const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string)=>{
        const element=document.createElement(tag);
        if(text)element.textContent=text;
        if(className)element.className=className;
        return element;
    };
    const compatible=(role:ConfigurableRole)=>adapters.filter(a=>a.role===role&&a.selectable&&a.targets.includes(manifest.target)&&(!options.executionCapabilities||options.executionCapabilities.adapters[a.id]?.length));
    const modes=(adapter:DeploymentAdapter)=>options.executionCapabilities?.adapters[adapter.id]??adapter.modes;
    function chooseProvider(role:ConfigurableRole,value:string){
        const binding=manifest.bindings[role];
        if(value==='disabled' ? role==='state-db' : !compatible(role).some(a=>a.id===value))return;
        for(const reference of Object.values(binding.secretRefs))secrets.delete(reference);
        if(role==='state-db'){postgresGeneration++;postgresDiscovery=undefined;}
        if(value==='disabled')manifest.bindings[role]={...binding,mode:'disabled',secretRefs:{}};
        else {
            const adapter=compatible(role).find(a=>a.id===value);
            if(!adapter)return;
            const allowed=modes(adapter),mode=adapter.id==='supabase-postgres'?'reuse':allowed.includes('connect')?'connect':allowed[0];
            if(!mode)return;
            const secretRefs=entry?{}:Object.fromEntries((adapter.requiredSecrets??[]).map(key=>[key,role+'/'+key]));
            manifest.bindings[role]={adapterId:adapter.id,mode,config:{...(mode==='create'&&createNames.get(role)?{resourceName:createNames.get(role)!}:{})},secretRefs};
        }
    }
    for(const role of configurableRoles){
        const choice=options.initialProviders?.[role];
        const current=manifest.bindings[role];
        if(typeof choice==='string'&&choice!==(current.mode==='disabled'?'disabled':current.adapterId))chooseProvider(role,choice);
    }
    const option=(label:string,value:string)=>{const result=node('option',label);result.value=value;return result;};
    const field=(parent:HTMLElement,label:string,value:string|undefined,update:(value:string)=>void,secret=false,required=false)=>{
        const wrapper=node('div',undefined,'fb-binding-field'),id='binding-'+crypto.randomUUID();
        const title=node('label',label);title.htmlFor=id;
        const input=node('input');input.id=id;input.type=secret?'password':'text';input.value=value??'';input.required=required;input.autocomplete='off';input.spellcheck=false;
        input.addEventListener('input',()=>{update(input.value);change();});
        wrapper.append(title,input);parent.append(wrapper);
    };
    const cloudflarePicker=(b:BindingSelection)=>!!options.discoveryBase&&!!options.providerConnections?.cloudflare?.connected&&(b.adapterId==='d1-http'||b.adapterId.startsWith('cloudflare-'));
    /** A step counts as done once its binding is either intentionally off or holds everything validation requires. */
    const stepReady=(role:ConfigurableRole)=>{
        const binding=manifest.bindings[role];
        if(options.connectionsPending)return false;
        if(binding.mode==='disabled')return role!=='state-db';
        const selected=adapters.find(a=>a.role===role&&a.id===binding.adapterId);
        if(!selected||!compatible(role).some(a=>a.id===binding.adapterId))return false;
        if(cloudflarePicker(binding)){
            const inherited=options.onDemand&&binding.config.accountId===options.providerConnections?.cloudflare?.accountId&&!!binding.config.accountId;
            const accounts=inventories.get('cf-accounts');if(!inherited&&(accounts?.status!=='ready'||!accounts.items.some(i=>i.id===binding.config.accountId)))return false;
            if(binding.mode!=='create'){const inventory=inventories.get('cf-'+binding.config.accountId+'-'+binding.adapterId),id=binding.adapterId==='d1-http'?binding.config.databaseId:binding.adapterId==='cloudflare-vectorize-http'?binding.config.indexName:binding.adapterId==='cloudflare-r2-http'?binding.config.bucket:binding.resourceRef;if(inventory?.status!=='ready'||!inventory.items.some(i=>i.id===id))return false;}
        }
        if(selected.id==='supabase-storage'&&options.providerConnections?.supabase?.connected){const list=inventories.get('sb-buckets-'+binding.config.projectRef);if(list?.status!=='ready'||!list.items.some(i=>i.id===binding.config.bucket))return false;}
        if(['upstash-http','qstash-http'].includes(selected.id)&&options.providerConnections?.upstash?.connected&&options.discoveryBase){const list=inventories.get('upstash-'+selected.id);if(list?.status!=='ready'||!list.items.some(i=>i.id===binding.config.resourceId))return false;}
        if(selected.id==='supabase-postgres'){
            if((binding.mode!=='create'&&binding.mode!=='reuse')||!binding.config.projectRef?.trim()||!binding.secretRefs.token)return false;
            if(binding.mode==='create')return supabaseStateSchemaName.test(binding.config.schema??'');
            return supabaseStateSchemaName.test(binding.resourceRef??'')&&binding.config.schema===binding.resourceRef;
        }
        if(selected.id==='postgrest-http'&&options.discoveryBase&&entry){if(postgresDiscovery?.status!=='ready'||!['create','reuse'].includes(binding.mode)||!/^[a-z_][a-z0-9_]{0,62}$/.test(binding.config.schema??''))return false;}
        for(const key of selected.requiredConfig??[])if(!binding.config[key]?.trim())return false;
        for(const key of selected.requiredSecrets??[])if(!binding.secretRefs[key])return false;
        if(binding.mode==='reuse'&&!binding.resourceRef)return false;
        if(binding.mode==='create'&&selected.configKeys.includes('resourceName')&&!binding.config.resourceName?.trim())return false;
        return true;
    };
    const syncNavigation=()=>{
        const next=root.querySelector<HTMLButtonElement>('.fb-step-next');
        if(next)next.disabled=!steps.length||!stepReady(steps[currentStep]);
        const deploy=root.querySelector<HTMLButtonElement>('.fb-step-deploy');
        if(deploy)deploy.disabled=!stepReady('state-db');
        for(const item of root.querySelectorAll<HTMLElement>('.fb-binding-step')){
            const role=item.dataset.role as ConfigurableRole,index=steps.indexOf(role);
            if(index<0)continue;
            item.classList.toggle('fb-binding-step-current',index===currentStep);
            item.classList.toggle('fb-binding-step-complete',index!==currentStep&&stepReady(role));
            if(index===currentStep)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
        }
    };
    let reviewIssues:Partial<Record<ConfigurableRole,string>>={};
    const change=()=>{reviewIssues={};syncNavigation();options.onChange?.();};
    const discoveryFetch=async(path:string,body:unknown)=>{
        try{
            const response=await fetch((options.discoveryBase??'')+'/provider-resources/supabase/'+path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
            if(!response.ok)return null;
            return await response.json();
        }catch{return null;}
    };
    const inventory=(key:string,path:string,body:unknown,listKey:string)=>{
        if(inventories.has(key))return inventories.get(key)!;
        inventories.set(key,{status:'loading'});
        track((async()=>{let state:Discovery<{id:string;name:string;url?:string;endpoint?:string}>;try{
            const response=await fetch((options.discoveryBase??'')+'/provider-resources/'+path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
            const data=response.ok?await response.json():null;
            if(!Array.isArray(data?.[listKey]))throw Error();
            const items=data[listKey];if(items.length>1000||items.some((i:any)=>!i||typeof i.id!=='string'||typeof i.name!=='string'))throw Error();
            state={status:'ready',items};
        }catch{state={status:'fallback'};}inventories.set(key,state);if(!destroyed)render();})());return inventories.get(key)!;
    };
    const resourceSelect=(card:HTMLElement,label:string,state:Discovery<{id:string;name:string;url?:string;endpoint?:string}>,value:string,update:(value:string)=>void,retryKey:string)=>{
        if(state.status==='loading'){card.append(node('p','Loading '+label.toLowerCase()+'…','fb-binding-note'));return;}
        if(state.status==='fallback'){const message=node('p','Could not load '+label.toLowerCase()+'. Check the connected account permissions and retry.','fb-binding-note');message.setAttribute('role','alert');const retry=node('button','Retry resource discovery');retry.type='button';retry.addEventListener('click',()=>{inventories.delete(retryKey);render();});card.append(message,retry);return;}
        const wrapper=node('div',undefined,'fb-binding-field'),title=node('label',label),select=node('select');select.id='binding-discovery-'+retryKey.replace(/[^a-z0-9]/gi,'-');title.htmlFor=select.id;select.append(option('Select '+label.toLowerCase()+'…',''));for(const item of state.items)select.append(option(item.name,item.id));
        if(value&&!state.items.some(i=>i.id===value)){const stale=option('Previously selected — unavailable',value);stale.disabled=true;select.append(stale);}
        select.value=value;select.addEventListener('change',()=>{update(select.value);render();change();});wrapper.append(title,select);card.append(wrapper);
        if(!state.items.length)card.append(node('p','No available '+label.toLowerCase()+'. Create one in your provider account or choose another provider.','fb-binding-note'));
    };
    const renderUpstashPicker=(card:HTMLElement,role:ConfigurableRole)=>{
        const b=manifest.bindings[role],account=options.providerConnections?.upstash?.accountId;
        if(!account)return;
        b.config.accountId=account;
        const key='upstash-'+b.adapterId,state=inventory(key,'upstash/resources',{adapterId:b.adapterId},'resources');
        resourceSelect(card,b.adapterId==='upstash-http'?'Redis database':'QStash account',state,b.config.resourceId??'',value=>{
            delete b.config.resourceId;delete b.config.url;delete b.config.endpoint;b.secretRefs={};
            if(value){b.config.resourceId=value;if(state.status==='ready'){const item=state.items.find(i=>i.id===value);if(item?.url)b.config.url=item.url;if(item?.endpoint)b.config.endpoint=item.endpoint;}for(const key of b.adapterId==='upstash-http'?['token']:['token','signingKey','nextSigningKey'])b.secretRefs[key]='oauth/upstash/'+role+'/'+key;}
        },key);
        // Runtime URLs and credentials are resolved server-side from the selected resource.
        card.append(node('p','Upstash authorization is stored encrypted. Runtime credentials are resolved privately from the selected resource during Apply.','fb-binding-note'));
    };
    const renderCloudflarePicker=(card:HTMLElement,role:ConfigurableRole)=>{
        const b=manifest.bindings[role];

        if(!b.config.accountId&&options.providerConnections?.cloudflare?.accountId)b.config.accountId=options.providerConnections.cloudflare.accountId;
        if(options.onDemand&&!accountPickerOpened&&b.config.accountId&&b.config.accountId===options.providerConnections?.cloudflare?.accountId){
            const changeAccount=node('button','Change account');changeAccount.type='button';
            changeAccount.onclick=()=>{accountPickerOpened=true;render();};
            card.append(node('p',options.providerConnections.cloudflare.label??b.config.accountId),changeAccount);
        }else resourceSelect(card,'Account',inventory('cf-accounts','cloudflare/accounts',{},'accounts'),b.config.accountId??'',value=>{b.config.accountId=value;delete b.resourceRef;delete b.config.indexName;delete b.config.databaseId;},'cf-accounts');
        if(!b.config.accountId||b.mode==='create')return;
        const key='cf-'+b.config.accountId+'-'+b.adapterId,state=inventory(key,'cloudflare/resources',{accountId:b.config.accountId,adapterId:b.adapterId},'resources');
        const configKey=b.adapterId==='cloudflare-r2-http'?'bucket':b.adapterId==='d1-http'?'databaseId':b.adapterId==='cloudflare-vectorize-http'?'indexName':undefined;
        resourceSelect(card,b.adapterId.includes('vectorize')?'Index':b.adapterId.includes('queue')?'Queue':b.adapterId.includes('r2')?'Bucket':'Resource',state,configKey?b.config[configKey]??'':b.resourceRef??'',value=>{
            if(configKey){if(value)b.config[configKey]=value;else delete b.config[configKey];}
            else if(value){b.resourceRef=value;b.config.resourceName=state.status==='ready'?state.items.find(i=>i.id===value)!.name:value;}else{delete b.resourceRef;delete b.config.resourceName;}
        },key);
    };
    const loadSchemas=(projectRef:string)=>{
        if(schemasByProject.has(projectRef))return;
        schemasByProject.set(projectRef,{status:'loading'});
        track((async()=>{
            const data=await discoveryFetch('schemas',{projectRef}) as {schemas?:unknown}|null;
            const list=Array.isArray(data?.schemas)?(data!.schemas as SchemaOption[]).filter(item=>item&&typeof item.name==='string').slice(0,50):[];
            schemasByProject.set(projectRef,data?{status:'ready',items:list}:{status:'fallback'});
            if(!destroyed)render();
        })());
    };
    /** The picker implies the mode: an existing schema is reuse, the suffix input is create. Discovery
        failures fall back to the single connected project plus a fenced create input — a supported mode. */
    const renderSupabasePicker=(card:HTMLElement,role:ConfigurableRole)=>{
        const binding=manifest.bindings[role],connection=options.providerConnections?.supabase;
        if(binding.adapterId==='supabase-storage'&&!options.providerConnections){
            field(card,'Project reference',binding.config.projectRef,value=>binding.config.projectRef=value,false,true);
            field(card,'Private bucket',binding.config.bucket,value=>binding.config.bucket=value,false,true);
            if(entry){const reference=binding.secretRefs.token??role+'/token';field(card,'Server Storage key',secrets.get(reference),value=>{if(value){binding.secretRefs.token=reference;secrets.set(reference,value);}else{delete binding.secretRefs.token;secrets.delete(reference);}},true,true);}
            card.append(node('p',entry?'Enter the server Storage key privately. It remains in this browser session until Apply and is then stored securely on the deployment. Hosted setup can discover projects and private buckets from a connected Supabase account.':'This plan contains credential references only. Enter the server Storage key privately during local review.','fb-binding-note'));return;
        }

        if(!connection?.connected){card.append(node('p','Connect Supabase to choose a project and schema.','fb-binding-note'));return;}
        if(!projects){
            projects={status:'loading'};
            track((async()=>{
                const data=await discoveryFetch('projects',{}) as {projects?:unknown}|null;
                const list=Array.isArray(data?.projects)?(data!.projects as ProjectOption[]).filter(item=>item&&typeof item.ref==='string'&&typeof item.name==='string').slice(0,50):[];
                projects=list.length?{status:'ready',items:list}:{status:'fallback'};
                if(!destroyed)render();
            })());
        }
        if(projects.status==='loading'){card.append(node('p','Loading projects…','fb-binding-note'));return;}
        const wrapper=node('div',undefined,'fb-binding-field'),title=node('label','Project'),select=node('select');
        select.id='binding-project-'+role;title.htmlFor=select.id;
        if(projects.status==='fallback'&&binding.adapterId==='supabase-storage'){card.append(node('p','Could not load projects. Reconnect Supabase and retry.','fb-binding-note'));return;}
        if(projects.status==='fallback'){
            if(!connection.accountId){card.append(node('p','Could not load projects. Reconnect Supabase and try again.','fb-binding-note'));return;}
            select.append(option(connection.label??'Connected Supabase project',connection.accountId));
            if(binding.config.projectRef!==connection.accountId){binding.config.projectRef=connection.accountId;delete binding.config.schema;delete binding.resourceRef;}
            select.value=connection.accountId;
            select.addEventListener('change',()=>{
                const target=manifest.bindings[role];
                if(select.value){target.config.projectRef=select.value;delete target.config.schema;delete target.resourceRef;target.secretRefs={};render();change();}
            });
            wrapper.append(title,select);card.append(wrapper);
            suffixField(card,role);
            return;
        }else{
            select.append(option('Select a project…',''));
            for(const item of projects.items)select.append(option(item.name,item.ref));
            if(binding.config.projectRef&&!projects.items.some(item=>item.ref===binding.config.projectRef)){const stale=option(binding.config.projectRef+' — unavailable',binding.config.projectRef);stale.disabled=true;select.append(stale);}
            select.value=binding.config.projectRef??'';
        }
        select.addEventListener('change',()=>{
            const target=manifest.bindings[role];
            if(!select.value)manifest.bindings[role]={adapterId:binding.adapterId,mode:binding.adapterId==='supabase-storage'?'connect':'reuse',config:{},secretRefs:{}};
            else{target.config.projectRef=select.value;delete target.config.schema;delete target.config.bucket;delete target.resourceRef;target.secretRefs={};if(target.adapterId==='supabase-postgres')loadSchemas(select.value);}
            render();change();
        });
        wrapper.append(title,select);card.append(wrapper);
        if(!binding.config.projectRef)return;
        if(binding.adapterId==='supabase-storage'){
            binding.mode='connect';binding.secretRefs={token:'oauth/supabase/storage/token'};
            const key='sb-buckets-'+binding.config.projectRef;
            resourceSelect(card,'Private bucket',inventory(key,'supabase/buckets',{projectRef:binding.config.projectRef},'resources'),binding.config.bucket??'',value=>{if(value)binding.config.bucket=value;else delete binding.config.bucket;},key);
            card.append(node('p','Files are isolated by installation and tenant inside the selected private bucket. Existing objects are preserved.','fb-binding-note'));return;
        }
        if(projects.status==='ready'&&!schemasByProject.has(binding.config.projectRef))loadSchemas(binding.config.projectRef);
        const state=schemasByProject.get(binding.config.projectRef);
        if(!state||state.status==='loading'){card.append(node('p','Loading schemas…','fb-binding-note'));return;}
        if(state.status==='fallback'){suffixField(card,role);return;}
        const schemaWrapper=node('div',undefined,'fb-binding-field'),schemaTitle=node('label','Schema'),schemaSelect=node('select');
        schemaSelect.id='binding-schema-'+role;schemaTitle.htmlFor=schemaSelect.id;
        schemaSelect.append(option('Create new schema…','__create__'));
        for(const item of state.items)schemaSelect.append(option(item.name,item.name));
        if(binding.config.schema&&!state.items.some(item=>item.name===binding.config.schema))schemaSelect.append(option(binding.config.schema,binding.config.schema));
        schemaSelect.value=binding.mode==='reuse'&&binding.config.schema?binding.config.schema:'__create__';
        schemaSelect.addEventListener('change',()=>{
            const target=manifest.bindings[role],projectRef=target.config.projectRef;
            if(!schemaSelect.value||schemaSelect.value==='__create__'){target.mode='create';target.config={projectRef};delete target.resourceRef;target.secretRefs={token:'oauth/supabase/token'};}
            else{target.mode='reuse';target.config={projectRef,schema:schemaSelect.value};target.resourceRef=schemaSelect.value;target.secretRefs={token:'oauth/supabase/token'};}
            render();change();
        });
        schemaWrapper.append(schemaTitle,schemaSelect);card.append(schemaWrapper);
        if(schemaSelect.value==='__create__')suffixField(card,role);
    };
    const suffixField=(card:HTMLElement,role:ConfigurableRole)=>{
        const binding=manifest.bindings[role];
        const wrapper=node('div',undefined,'fb-binding-field'),id='binding-schema-suffix-'+role;
        const title=node('label','New schema name');title.htmlFor=id;
        const row=node('div',undefined,'fb-schema-create'),prefix=node('span','frontbase_edge_','fb-schema-prefix');
        const input=node('input');input.id=id;input.type='text';input.autocomplete='off';input.spellcheck=false;
        input.value=binding.config.schema?.startsWith('frontbase_edge_')?binding.config.schema.slice('frontbase_edge_'.length):'';
        input.addEventListener('input',()=>{
            const clean=input.value.toLowerCase().replace(/[\s-]+/g,'_').replace(/[^a-z0-9_]/g,'');
            if(clean!==input.value)input.value=clean;
            const target=manifest.bindings[role];
            target.mode='create';delete target.resourceRef;target.secretRefs={token:'oauth/supabase/token'};
            if(clean)target.config.schema='frontbase_edge_'+clean;else delete target.config.schema;
            change();
        });
        row.append(prefix,input);wrapper.append(title,row);card.append(wrapper);
    };
    const renderPostgrestPicker=(card:HTMLElement,role:ConfigurableRole)=>{
        const binding=manifest.bindings[role],reference=binding.secretRefs.token??role+'/token';
        const invalidate=()=>{postgresGeneration++;postgresDiscovery=undefined;binding.mode='connect';delete binding.resourceRef;delete binding.config.rpcPrefix;delete binding.config.rpcSchema;};
        field(card,'Service URL',binding.config.url,value=>{binding.config.url=value;invalidate();},false,true);
        field(card,'Access token',secrets.get(reference),value=>{if(value){binding.secretRefs.token=reference;secrets.set(reference,value);}else{delete binding.secretRefs.token;secrets.delete(reference);}invalidate();},true,true);
        const test=node('button','Test connection and fetch schemas');test.type='button';test.disabled=postgresDiscovery?.status==='loading';
        test.addEventListener('click',async()=>{
            const url=binding.config.url,token=secrets.get(reference);if(!url||!token){postgresDiscovery={generation:postgresGeneration,status:'failed',schemas:[],message:'Enter the endpoint and access token first.'};render();return;}
            const generation=++postgresGeneration;postgresDiscovery={generation,status:'loading',schemas:[],message:'Testing connection…'};render();
            let data:any;try{const r=await fetch((options.discoveryBase??'')+'/provider-resources/postgrest/schemas',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({url,token})});data=await r.json();if(!r.ok)data={success:false,message:typeof data.message==='string'?data.message:undefined};}catch{data={success:false};}
            if(destroyed||generation!==postgresGeneration)return;
            postgresDiscovery={generation,status:data.success===true?'ready':'failed',schemas:Array.isArray(data.schemas)?data.schemas.map((s:any)=>String(s.name)).filter((s:string)=>/^[a-z_][a-z0-9_]{0,62}$/.test(s)):[],message:data.success===true?'Connection verified. Select an empty schema or create a new one during Apply.':data?.message??'Could not contact the setup service. Check your setup session and try again.'};render();change();
        });card.append(test);
        if(postgresDiscovery){const message=node('p',postgresDiscovery.message,'fb-binding-note');message.setAttribute('role','status');card.append(message);}
        if(postgresDiscovery?.status!=='ready')return;
        const wrapper=node('div',undefined,'fb-binding-field'),label=node('label','Schema'),select=node('select');select.id='binding-postgrest-schema-'+role;label.htmlFor=select.id;
        select.append(option('Select an existing schema…',''),option('Create new schema…','__create__'));
        for(const name of postgresDiscovery.schemas)select.append(option(name,name));
        select.value=binding.mode==='create'?'__create__':binding.mode==='reuse'?binding.resourceRef??'':'';
        select.addEventListener('change',()=>{delete binding.resourceRef;delete binding.config.schema;if(select.value==='__create__'){binding.mode='create';binding.config.schema='frontbase_edge_state';}else if(select.value){binding.mode='reuse';binding.resourceRef=select.value;binding.config.schema=select.value;}else binding.mode='connect';render();change();});
        wrapper.append(label,select);card.append(wrapper);
        if(binding.mode==='create')field(card,'New schema name',binding.config.schema,value=>binding.config.schema=value,false,true);
        card.append(node('p','Existing schemas must be empty. Schema creation and protected SQL helper installation happen only when you Apply. The credential must have the necessary DDL privileges.','fb-binding-note'));
    };
    function render() {
        steps=stepOrder.filter(role=>compatible(role).length);
        root.classList.add('fb-bindings-form');root.replaceChildren();
        if(Object.keys(reviewIssues).length){
            const list=node('ul');list.setAttribute('aria-label','Bindings to fix');
            for(const role of steps.filter(role=>reviewIssues[role])){
                const item=node('li'),link=node('button',stepCopy[role][0]+': '+reviewIssues[role]);
                link.type='button';link.onclick=()=>{currentStep=steps.indexOf(role);render();root.querySelector<HTMLElement>('.fb-binding-card:not([hidden]) input, .fb-binding-card:not([hidden]) select')?.focus();};
                item.append(link);list.append(item);
            }
            root.append(list);
        }
        if(options.providerConnections){
            const needed=new Set<ProviderName>();
            for(const [key,binding] of Object.entries(manifest.bindings))if((!options.onDemand||key===steps[currentStep])&&binding.mode!=='disabled'){
                if(binding.adapterId.startsWith('cloudflare-')||binding.adapterId==='d1-http')needed.add('cloudflare');
                if(binding.adapterId==='turso-marketplace')needed.add('vercel');
                if(binding.adapterId.startsWith('supabase'))needed.add('supabase');
                if(['upstash-http','qstash-http'].includes(binding.adapterId))needed.add('upstash');
            }
            for(const provider of needed){
                const connection=options.providerConnections[provider],label=provider==='cloudflare'?'Cloudflare':provider==='supabase'?'Supabase':provider==='upstash'?'Upstash':'Vercel';
                const row=node('section',undefined,'fb-binding-connection');row.setAttribute('aria-label',label+' connection');
                if(connection?.connected)row.append(node('p',connection.label??label+' connected'));
                else if(connection?.available&&options.onConnect){
                    const button=node('button',undefined,'fb-connect-btn fb-connect-'+provider);button.type='button';button.setAttribute('aria-label','Connect '+label);
                    const mark=document.createElement('span');mark.className='fb-connect-mark';mark.innerHTML=brandMarks[provider];
                    button.append(mark,node('span','Connect '+label));
                    button.addEventListener('click',async()=>{button.disabled=true;try{await options.onConnect!(provider);}catch{row.append(node('p','Connection could not start. Please try again.','fb-binding-note'));}finally{button.disabled=false;}});row.append(button);
                }else if(options.loadConnections){
                    const discover=node('button','Check '+label+' connection');discover.type='button';
                    discover.onclick=async()=>{discover.disabled=true;try{const connections=await options.loadConnections!();if(!destroyed){options.providerConnections=connections;options.loadConnections=undefined;render();}}catch{discover.disabled=false;row.append(node('p','Connection discovery failed. Try again.'));}};
                    row.append(discover);
                }else row.append(node('p',label+' authorization is not configured for this installation.','fb-binding-note'));
                root.append(row);
            }
        }
        steps=stepOrder.filter(role=>compatible(role).length);
        if(currentStep>=steps.length)currentStep=Math.max(0,steps.length-1);
        if(steps.length){
            const indicator=node('ol',undefined,'fb-binding-steps');
            steps.forEach((role,index)=>{
                const item=node('li',undefined,'fb-binding-step'+(index===currentStep?' fb-binding-step-current':stepReady(role)?' fb-binding-step-complete':''));
                item.dataset.role=role;
                if(index===currentStep)item.setAttribute('aria-current','step');
                item.append(node('span',String(index+1),'fb-binding-step-num'),node('span',stepCopy[role][0]));
                indicator.append(item);
            });
            root.append(indicator);
        }
        for(const [index,role] of steps.entries()) {
            if(options.onDemand&&index!==currentStep&&(!reviewing||manifest.bindings[role].mode==='disabled'))continue;
            const binding=manifest.bindings[role],card=node('section',undefined,'fb-binding-card');
            const heading=node('h3',stepCopy[role][0]);heading.append(node('span',role==='state-db'?'Required':'Optional',role==='state-db'?'fb-binding-tag fb-tag-required':'fb-binding-tag fb-tag-optional'));
            card.append(heading,node('p',stepCopy[role][1],'fb-binding-lede'));
            const compatibleAdapters=compatible(role);
            const selected=adapters.find(a=>a.role===role&&a.id===binding.adapterId);
            const wrapper=node('div',undefined,'fb-binding-field'),title=node('label','Provider'),select=node('select');
            select.id='binding-provider-'+role;title.htmlFor=select.id;
            if(role!=='state-db')select.append(option('Disabled','disabled'));
            for(const adapter of compatibleAdapters)select.append(option(names[adapter.id]??adapter.id,adapter.id));
            if(binding.mode!=='disabled'&&!compatibleAdapters.some(a=>a.id===binding.adapterId)){const unsupported=option(binding.adapterId+' — setup unavailable',binding.adapterId);unsupported.disabled=true;select.append(unsupported);}
            select.value=binding.mode==='disabled'?'disabled':binding.adapterId;
            select.addEventListener('change',()=>{
                chooseProvider(role,select.value);
                render();change();
            });
            wrapper.append(title,select);if(!options.externalProviders)card.append(wrapper);
            if(reviewIssues[role])card.append(node('p',reviewIssues[role],'fb-binding-note'));
            if(options.connectionsPending){
                card.append(node('p','Loading connected accounts…','fb-binding-note'));
            }else if(binding.mode!=='disabled'&&selected) {
                if(selected.id==='supabase-postgres'||selected.id==='supabase-storage'){
                    if(!compatibleAdapters.includes(selected))card.append(node('p','This adapter is unavailable in this deployment flow.','fb-binding-note'));
                    else {renderSupabasePicker(card,role);card.append(node('p','Connected Supabase authorization is stored encrypted and reused after reload. Server credentials stay out of the browser and plan.','fb-binding-note'));}
                }else if(['upstash-http','qstash-http'].includes(selected.id)&&options.providerConnections?.upstash?.connected&&options.discoveryBase){
                    renderUpstashPicker(card,role);if(selected.id==='qstash-http')field(card,'Callback URL',binding.config.destination,value=>binding.config.destination=value,false,true);
                }else if(selected.id==='postgrest-http'&&options.discoveryBase&&entry){renderPostgrestPicker(card,role);
                }else{
                    const oauth=options.providerConnections?.cloudflare;
                    const usePicker=cloudflarePicker(binding);
                    const useOAuth=!!oauth?.connected&&(selected.id==='d1-http'||selected.id==='cloudflare-vectorize-http'&&(!!options.discoveryBase||!!oauth.capabilities?.includes('vectorize')));
                    const tokenOAuth=useOAuth&&selected.secretKeys.includes('token');
                    if(selected.id==='cloudflare-vectorize-http'&&!useOAuth){if(binding.secretRefs.token==='oauth/cloudflare/token')delete binding.secretRefs.token;card.append(node('p','Connect an existing Vectorize index with a token that has Vectorize access. Include Vectorize Read/Edit in the initial build token to reuse your connected Cloudflare account.','fb-binding-note'));}
                    if(tokenOAuth){binding.secretRefs.token='oauth/cloudflare/token';if(!binding.config.accountId&&oauth?.accountId)binding.config.accountId=oauth.accountId;}
                    if(!compatibleAdapters.includes(selected))card.append(node('p','This adapter is unavailable in this deployment flow.','fb-binding-note'));
                    else {
                        const modeWrapper=node('div',undefined,'fb-binding-field'),modeTitle=node('label','Resource action'),mode=node('select');
                        mode.id='binding-mode-'+role;modeTitle.htmlFor=mode.id;
                        for(const value of modes(selected))mode.append(option({create:'Create resource',reuse:'Reuse resource',connect:'Connect existing service',disabled:'Disabled'}[value],value));
                        mode.value=binding.mode;mode.addEventListener('change',()=>{binding.mode=mode.value as BindingSelection['mode'];delete binding.resourceRef;const modeKeys=selected.configKeysByMode?.[binding.mode];if(modeKeys)binding.config=Object.fromEntries(Object.entries(binding.config).filter(([key])=>modeKeys.includes(key)));if(binding.mode==='create' && createNames.get(role))binding.config.resourceName=createNames.get(role)!;render();change();});
                        modeWrapper.append(modeTitle,mode);card.append(modeWrapper);
                        if(usePicker)renderCloudflarePicker(card,role);
                        if(binding.mode==='reuse'&&!usePicker) {
                            if(selected.id==='cloudflare-d1'&&options.loadResources&&!options.resourceOptions?.[selected.id]){
                                const load=options.loadResources;options.loadResources=undefined;
                                track(load().then(value=>{options.resourceOptions=value;}).catch(()=>{}).finally(()=>{if(!destroyed)render();}));
                            }
                            const resources=options.resourceOptions?.[selected.id];
                            if(resources) {
                                const row=node('div',undefined,'fb-binding-field'),label=node('label','Resource'),resource=node('select');resource.id='binding-resource-'+role;label.htmlFor=resource.id;resource.append(option('Select a connected resource',''));
                                for(const item of resources)resource.append(option(item.name,item.id));
                                if(binding.resourceRef&&!resources.some(r=>r.id===binding.resourceRef)){const unavailable=option('Recorded resource — unavailable in this environment',binding.resourceRef);unavailable.disabled=true;resource.append(unavailable);}
                                resource.value=binding.resourceRef??'';resource.addEventListener('change',()=>{if(resource.value){binding.resourceRef=resource.value;if(selected.configKeys.includes('resourceName'))binding.config.resourceName=resources.find(item=>item.id===resource.value)!.name;}else {delete binding.resourceRef;if(selected.configKeys.includes('resourceName'))delete binding.config.resourceName;}change();});row.append(label,resource);card.append(row);
                                if(!resources.length)card.append(node('p','Connect a compatible resource to this project and environment, then restart local setup.','fb-binding-note'));
                            } else field(card,'Resource reference',binding.resourceRef,value=>binding.resourceRef=value,false,true);
                        }
                        const configFields=selected.configKeysByMode?.[binding.mode]??selected.configKeys.filter(key=>key!=='resourceName'||binding.mode==='create');
                        for(const key of configFields.filter(key=>(!['cloudflare-d1','cloudflare-kv','cloudflare-r2','cloudflare-queue'].includes(selected.id)||key!=='accountId')&&(!usePicker||!['accountId','indexName','databaseId','bucket'].includes(key))&&(!['upstash-http','qstash-http'].includes(selected.id)||!['accountId','resourceId'].includes(key))))field(card,fields[key]??key,binding.config[key],value=>binding.config[key]=value,false,selected.requiredConfig?.includes(key));
                        if(entry)for(const key of selected.secretKeys){
                            if(useOAuth&&key==='token'){card.append(node('p','Authorization uses your connected Cloudflare account.','fb-binding-note'));continue;}
                            const reference=binding.secretRefs[key]??role+'/'+key;
                            field(card,fields[key]??key,secrets.get(reference),value=>{if(value){binding.secretRefs[key]=reference;secrets.set(reference,value);}else{delete binding.secretRefs[key];secrets.delete(reference);}},true,selected.requiredSecrets?.includes(key));
                        }
                        if(selected.secretKeys.length&&!tokenOAuth)card.append(node('p',entry?'Manually entered credentials remain only in this browser session until Apply. Apply stores the selected runtime credentials securely on your deployment. Reloading before Apply requires re-entry.':'New credentials are entered privately in the local deployment review. This plan contains references only.','fb-binding-note'));
                        if(useOAuth)card.append(node('p','Your connected account authorization is stored encrypted and reused after reload. Discovery is read-only; resources are created only after Review and Apply.','fb-binding-note'));
                    }
                }
            }
            card.hidden=index!==currentStep;
            if(card.hidden)for(const input of card.querySelectorAll('input[required]'))input.removeAttribute('required');
            root.append(card);
        }
        if(steps.length){
            const role=steps[currentStep],nav=node('div',undefined,'fb-binding-nav');
            const back=node('button','Back','fb-step-back');back.type='button';back.disabled=currentStep===0;
            back.addEventListener('click',()=>{if(currentStep>0){currentStep--;render();}});
            nav.append(back);
            if(role!=='state-db'){
                const skip=node('button','Skip','fb-step-skip');skip.type='button';
                skip.addEventListener('click',()=>{manifest.bindings[role]={...manifest.bindings[role],mode:'disabled',secretRefs:{}};if(currentStep<steps.length-1)currentStep++;render();change();});
                nav.append(skip);
            }
            if(currentStep<steps.length-1){
                const next=node('button','Next','fb-step-next');next.type='button';next.disabled=!stepReady(role);
                next.addEventListener('click',()=>{if(currentStep<steps.length-1&&stepReady(steps[currentStep])){currentStep++;render();}});
                nav.append(next);
            }
            if(options.onDeployNow&&currentStep>0){
                const deploy=node('button','Deploy now','fb-step-deploy');deploy.type='button';deploy.disabled=!stepReady('state-db');
                deploy.addEventListener('click',()=>options.onDeployNow?.());
                nav.append(deploy);
            }
            root.append(nav);
        }
    }
    function clearCredentials(){secrets.clear();postgresGeneration++;postgresDiscovery=undefined;for(const input of root.querySelectorAll<HTMLInputElement>('input[type=password]'))input.value='';}
    if(options.initialRole)currentStep=Math.max(0,stepOrder.filter(role=>compatible(role).length).indexOf(options.initialRole));
    render();
    return {
        showRole(role:ConfigurableRole){
            const index=steps.indexOf(role);
            if(index>=0&&index!==currentStep){currentStep=index;render();}
        },
        selectProvider(role:ConfigurableRole,value:string){
            if(!steps.includes(role))return;
            chooseProvider(role,value);currentStep=steps.indexOf(role);change();render();
        },
        showIssues(issues:Array<{role:ConfigurableRole;message:string}>){
            reviewIssues={};
            for(const issue of issues)if(steps.includes(issue.role))reviewIssues[issue.role]=issue.message;
            const index=steps.findIndex(role=>reviewIssues[role]);
            if(index>=0){currentStep=index;render();}
        },
        finishDiscovery(connections:BindingsFormOptions['providerConnections'], resources?:BindingsFormOptions['resourceOptions']){
            if(destroyed)return;
            options.providerConnections=connections;
            options.resourceOptions=resources??options.resourceOptions;
            options.connectionsPending=false;
            render();
        },
        async prepareReview(){
            reviewing=true;
            try{
                render();
                while(pending.size)await Promise.all([...pending]);
                const plan=validateDeploymentManifest(manifest);
                const invalidRoles=new Set(plan.issues.map(issue=>issue.role));
                const incomplete=steps.filter(role=>invalidRoles.has(role)||(manifest.bindings[role].mode!=='disabled'&&!stepReady(role)));
                if(incomplete.length){
                    for(const role of incomplete)reviewIssues[role]='Complete the required fields before review.';
                    currentStep=steps.indexOf(incomplete[0]);
                    throw Error('Complete '+incomplete.map(role=>stepCopy[role][0]).join(', ')+' before review.');
                }
            }finally{reviewing=false;if(!destroyed)render();}
        },
        ready(){return stepReady('state-db');},
        snapshot(){
            const references=new Set(Object.values(manifest.bindings).filter(b=>b.mode!=='disabled').flatMap(b=>Object.values(b.secretRefs)));
            return {manifest:structuredClone(manifest),credentials:Object.fromEntries([...references].filter(r=>secrets.has(r)).map(r=>[r,secrets.get(r)!]))};
        },
        clearCredentials,
        destroy(){destroyed=true;clearCredentials();root.replaceChildren();},
    };
}
