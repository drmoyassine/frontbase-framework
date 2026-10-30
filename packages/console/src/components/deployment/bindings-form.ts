import { configurableRoles, deploymentAdapters, supabaseStateSchemaName, type ConfigurableRole, type DeploymentAdapter, type DeploymentManifest, type BindingSelection } from '@frontbase/edge-core/deployment';

export const bindingLabels = { 'state-db':'State database', cache:'Application cache', storage:'Object storage', vector:'Vector index', queue:'Queue delivery', 'email-send':'Outbound email' };
const names: Record<string,string> = {'turso-marketplace':'Turso (connected Vercel integration)','cloudflare-d1':'Cloudflare D1','cloudflare-kv':'Cloudflare KV','cloudflare-r2':'Cloudflare R2 (private)','libsql-http':'Remote libSQL / Turso','d1-http':'Cloudflare D1 over HTTP','supabase-postgres':'Supabase','postgrest-http':'Self-hosted Postgres (PostgREST)','upstash-http':'Upstash Redis over HTTP','s3-http':'S3-compatible storage','cloudflare-vectorize-http':'Cloudflare Vectorize over HTTP','libsql-vector-http':'libSQL vector index over HTTP','qstash-http':'Upstash QStash'};
const fields: Record<string,string> = {url:'Service URL',endpoint:'Endpoint',region:'Region',bucket:'Bucket',accountId:'Account ID',databaseId:'Database ID',indexName:'Index name',destination:'Callback URL',resourceName:'Resource name',from:'Sender address',token:'Access token',accessKeyId:'Access key ID',secretAccessKey:'Secret access key',signingKey:'Signing key',nextSigningKey:'Next signing key',schema:'Schema',host:'Host',port:'Port',database:'Database',projectRef:'Project reference',username:'Role name',password:'Role password'};
const stepCopy: Record<string,[string,string]> = {'state-db':['State Database','Required. Where Frontbase stores its own state and configuration.'],storage:['File Storage','Optional. Object storage for uploads and media.'],cache:['Application Cache','Optional. Fast ephemeral storage for sessions and caching.'],queue:['Queue Delivery','Optional. Background jobs and message delivery.'],vector:['Vector Database','Optional. Embeddings storage for semantic search.'],'email-send':['Email Delivery','Optional. Outbound transactional email.']};
const stepOrder: readonly ConfigurableRole[] = ['state-db','storage','cache','queue','vector','email-send'];
const brandMarks: Record<string,string> = {
    cloudflare:'<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="#F38020" d="M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383z"/></svg>',
    supabase:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#3ECF8E" d="M13 2 4.5 13.5h6L9 22l8.5-11.5h-6L13 2z"/></svg>',
    vercel:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5" fill="#000"/><path fill="#fff" d="M12 5.5 19.5 18h-15L12 5.5z"/></svg>'
};
type ProviderName='cloudflare'|'vercel'|'supabase';
type ProjectOption={ref:string;name:string};
type SchemaOption={name:string;hasRole:boolean};
type Discovery<T>={status:'loading'}|{status:'ready';items:T[]}|{status:'fallback'};
export interface BindingsFormOptions {
    manifest: DeploymentManifest;
    adapters?: readonly DeploymentAdapter[];
    executionCapabilities?: {adapters: Record<string, readonly BindingSelection['mode'][]>};
    credentials?: 'entry' | 'references';
    resourceOptions?: Record<string,Array<{id:string;name:string}>>;
    /** Only supplied by a host with an authenticated server-side connection flow. */
    providerConnections?: Partial<Record<ProviderName,{available:boolean;connected:boolean;label?:string;accountId?:string}>>;
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
    const schemasByProject=new Map<string,Discovery<SchemaOption>>();
    const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string)=>{
        const element=document.createElement(tag);
        if(text)element.textContent=text;
        if(className)element.className=className;
        return element;
    };
    const compatible=(role:ConfigurableRole)=>adapters.filter(a=>a.role===role&&a.selectable&&a.targets.includes(manifest.target)&&(!options.executionCapabilities||options.executionCapabilities.adapters[a.id]?.length));
    const modes=(adapter:DeploymentAdapter)=>options.executionCapabilities?.adapters[adapter.id]??adapter.modes;
    const option=(label:string,value:string)=>{const result=node('option',label);result.value=value;return result;};
    const field=(parent:HTMLElement,label:string,value:string|undefined,update:(value:string)=>void,secret=false,required=false)=>{
        const wrapper=node('div',undefined,'fb-binding-field'),id='binding-'+crypto.randomUUID();
        const title=node('label',label);title.htmlFor=id;
        const input=node('input');input.id=id;input.type=secret?'password':'text';input.value=value??'';input.required=required;input.autocomplete='off';input.spellcheck=false;
        input.addEventListener('input',()=>{update(input.value);change();});
        wrapper.append(title,input);parent.append(wrapper);
    };
    /** A step counts as done once its binding is either intentionally off or holds everything validation requires. */
    const stepReady=(role:ConfigurableRole)=>{
        const binding=manifest.bindings[role];
        if(binding.mode==='disabled')return role!=='state-db';
        const selected=adapters.find(a=>a.role===role&&a.id===binding.adapterId);
        if(!selected||!compatible(role).some(a=>a.id===binding.adapterId))return false;
        if(selected.id==='supabase-postgres'){
            if((binding.mode!=='create'&&binding.mode!=='reuse')||!binding.config.projectRef?.trim()||!binding.secretRefs.token)return false;
            if(binding.mode==='create')return supabaseStateSchemaName.test(binding.config.schema??'');
            return supabaseStateSchemaName.test(binding.resourceRef??'')&&binding.config.schema===binding.resourceRef;
        }
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
    const change=()=>{syncNavigation();options.onChange?.();};
    const discoveryFetch=async(path:string,body:unknown)=>{
        try{
            const response=await fetch((options.discoveryBase??'')+'/provider-resources/supabase/'+path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
            if(!response.ok)return null;
            return await response.json();
        }catch{return null;}
    };
    const loadSchemas=(projectRef:string)=>{
        if(schemasByProject.has(projectRef))return;
        schemasByProject.set(projectRef,{status:'loading'});
        void (async()=>{
            const data=await discoveryFetch('schemas',{projectRef}) as {schemas?:unknown}|null;
            const list=Array.isArray(data?.schemas)?(data!.schemas as SchemaOption[]).filter(item=>item&&typeof item.name==='string').slice(0,50):[];
            schemasByProject.set(projectRef,data?{status:'ready',items:list}:{status:'fallback'});
            if(!destroyed)render();
        })();
    };
    /** The picker implies the mode: an existing schema is reuse, the suffix input is create. Discovery
        failures fall back to the single connected project plus a fenced create input — a supported mode. */
    const renderSupabasePicker=(card:HTMLElement,role:ConfigurableRole)=>{
        const binding=manifest.bindings[role],connection=options.providerConnections?.supabase;
        if(!connection?.connected){card.append(node('p','Connect Supabase to choose a project and schema.','fb-binding-note'));return;}
        if(!projects){
            projects={status:'loading'};
            void (async()=>{
                const data=await discoveryFetch('projects',{}) as {projects?:unknown}|null;
                const list=Array.isArray(data?.projects)?(data!.projects as ProjectOption[]).filter(item=>item&&typeof item.ref==='string'&&typeof item.name==='string').slice(0,50):[];
                projects=list.length?{status:'ready',items:list}:{status:'fallback'};
                if(!destroyed)render();
            })();
        }
        if(projects.status==='loading'){card.append(node('p','Loading projects…','fb-binding-note'));return;}
        const wrapper=node('div',undefined,'fb-binding-field'),title=node('label','Project'),select=node('select');
        select.id='binding-project-'+role;title.htmlFor=select.id;
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
            if(!select.value)manifest.bindings[role]={adapterId:'supabase-postgres',mode:'reuse',config:{},secretRefs:{}};
            else{target.config.projectRef=select.value;delete target.config.schema;delete target.resourceRef;target.secretRefs={};loadSchemas(select.value);}
            render();change();
        });
        wrapper.append(title,select);card.append(wrapper);
        if(!binding.config.projectRef)return;
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
    function render() {
        root.classList.add('fb-bindings-form');root.replaceChildren();
        if(options.providerConnections){
            const needed=new Set<ProviderName>();
            for(const binding of Object.values(manifest.bindings))if(binding.mode!=='disabled'){
                if(binding.adapterId.startsWith('cloudflare-')||binding.adapterId==='d1-http')needed.add('cloudflare');
                if(binding.adapterId==='turso-marketplace')needed.add('vercel');
                if(binding.adapterId.startsWith('supabase'))needed.add('supabase');
            }
            for(const provider of needed){
                const connection=options.providerConnections[provider],label=provider==='cloudflare'?'Cloudflare':provider==='supabase'?'Supabase':'Vercel';
                const row=node('section',undefined,'fb-binding-connection');row.setAttribute('aria-label',label+' connection');
                if(connection?.connected)row.append(node('p',connection.label??label+' connected'));
                else if(connection?.available&&options.onConnect){
                    const button=node('button',undefined,'fb-connect-btn fb-connect-'+provider);button.type='button';button.setAttribute('aria-label','Connect '+label);
                    const mark=document.createElement('span');mark.className='fb-connect-mark';mark.innerHTML=brandMarks[provider];
                    button.append(mark,node('span','Connect '+label));
                    button.addEventListener('click',async()=>{button.disabled=true;try{await options.onConnect!(provider);}catch{row.append(node('p','Connection could not start. Please try again.','fb-binding-note'));}finally{button.disabled=false;}});row.append(button);
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
                for(const reference of Object.values(binding.secretRefs))secrets.delete(reference);
                projects=undefined;schemasByProject.clear();
                if(select.value==='disabled')manifest.bindings[role]={...binding,mode:'disabled',secretRefs:{}};
                else {
                    const adapter=compatibleAdapters.find(a=>a.id===select.value)!;
                    const allowed=modes(adapter),mode=adapter.id==='supabase-postgres'?'reuse':allowed.includes('connect')?'connect':allowed[0];
                    if(!mode)return;
                    const secretRefs=entry?{}:Object.fromEntries((adapter.requiredSecrets??[]).map(key=>[key,role+'/'+key]));
                    manifest.bindings[role]={adapterId:adapter.id,mode,config:{...(mode==='create'&&createNames.get(role)?{resourceName:createNames.get(role)!}:{})},secretRefs};
                }
                render();change();
            });
            wrapper.append(title,select);card.append(wrapper);
            if(binding.mode!=='disabled'&&selected) {
                if(selected.id==='supabase-postgres'){
                    if(!compatibleAdapters.includes(selected))card.append(node('p','This adapter is unavailable in this deployment flow.','fb-binding-note'));
                    else renderSupabasePicker(card,role);
                }else{
                    const oauth=options.providerConnections?.cloudflare;
                    const useOAuth=oauth?.connected&&selected.id==='d1-http';
                    if(selected.id==='cloudflare-vectorize-http'){if(binding.secretRefs.token==='oauth/cloudflare/token')delete binding.secretRefs.token;card.append(node('p','Connect an existing Vectorize index with a token that has Vectorize access. The standard Cloudflare setup connection covers D1, Workers and KV.','fb-binding-note'));}
                    if(useOAuth){if(!binding.config.accountId&&oauth.accountId)binding.config.accountId=oauth.accountId;binding.secretRefs.token='oauth/cloudflare/token';}
                    if(!compatibleAdapters.includes(selected))card.append(node('p','This adapter is unavailable in this deployment flow.','fb-binding-note'));
                    else {
                        const modeWrapper=node('div',undefined,'fb-binding-field'),modeTitle=node('label','Resource action'),mode=node('select');
                        mode.id='binding-mode-'+role;modeTitle.htmlFor=mode.id;
                        for(const value of modes(selected))mode.append(option({create:'Create resource',reuse:'Reuse resource',connect:'Connect existing service',disabled:'Disabled'}[value],value));
                        mode.value=binding.mode;mode.addEventListener('change',()=>{binding.mode=mode.value as BindingSelection['mode'];delete binding.resourceRef;const modeKeys=selected.configKeysByMode?.[binding.mode];if(modeKeys)binding.config=Object.fromEntries(Object.entries(binding.config).filter(([key])=>modeKeys.includes(key)));if(binding.mode==='create' && createNames.get(role))binding.config.resourceName=createNames.get(role)!;render();change();});
                        modeWrapper.append(modeTitle,mode);card.append(modeWrapper);
                        if(binding.mode==='reuse') {
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
                        for(const key of configFields)field(card,fields[key]??key,binding.config[key],value=>binding.config[key]=value,false,selected.requiredConfig?.includes(key));
                        if(entry)for(const key of selected.secretKeys){
                            if(useOAuth&&key==='token'){card.append(node('p','Authorization uses your connected Cloudflare account.','fb-binding-note'));continue;}
                            const reference=binding.secretRefs[key]??role+'/'+key;
                            field(card,fields[key]??key,secrets.get(reference),value=>{if(value){binding.secretRefs[key]=reference;secrets.set(reference,value);}else{delete binding.secretRefs[key];secrets.delete(reference);}},true,selected.requiredSecrets?.includes(key));
                        }
                        if(selected.secretKeys.length)card.append(node('p',entry?'Credentials stay in this setup session. After reloading, re-enter them before validating edits.':'New credentials are entered privately in the local deployment review. This plan contains references only.','fb-binding-note'));
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
    function clearCredentials(){secrets.clear();for(const input of root.querySelectorAll<HTMLInputElement>('input[type=password]'))input.value='';}
    render();
    return {
        snapshot(){
            const references=new Set(Object.values(manifest.bindings).filter(b=>b.mode!=='disabled').flatMap(b=>Object.values(b.secretRefs)));
            return {manifest:structuredClone(manifest),credentials:Object.fromEntries([...references].filter(r=>secrets.has(r)).map(r=>[r,secrets.get(r)!]))};
        },
        clearCredentials,
        destroy(){destroyed=true;clearCredentials();root.replaceChildren();},
    };
}
