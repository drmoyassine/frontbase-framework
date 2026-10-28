import { configurableRoles, deploymentAdapters, type DeploymentAdapter, type DeploymentManifest, type BindingSelection } from '@frontbase/edge-core/deployment';

export const bindingLabels = { 'state-db':'State database', cache:'Application cache', storage:'Object storage', vector:'Vector index', queue:'Queue delivery', 'email-send':'Outbound email' };
const names: Record<string,string> = {'turso-marketplace':'Turso (connected Vercel integration)','cloudflare-d1':'Cloudflare D1','cloudflare-kv':'Cloudflare KV','cloudflare-r2':'Cloudflare R2 (private)','libsql-http':'Remote libSQL / Turso','d1-http':'Cloudflare D1 over HTTP','upstash-http':'Upstash Redis over HTTP','s3-http':'S3-compatible storage','cloudflare-vectorize-http':'Cloudflare Vectorize over HTTP','libsql-vector-http':'libSQL vector index over HTTP','qstash-http':'Upstash QStash'};
const fields: Record<string,string> = {url:'Service URL',endpoint:'Endpoint',region:'Region',bucket:'Bucket',accountId:'Account ID',databaseId:'Database ID',indexName:'Index name',destination:'Callback URL',resourceName:'Resource name',from:'Sender address',token:'Access token',accessKeyId:'Access key ID',secretAccessKey:'Secret access key',signingKey:'Signing key',nextSigningKey:'Next signing key'};
export interface BindingsFormOptions {
    manifest: DeploymentManifest;
    adapters?: readonly DeploymentAdapter[];
    executionCapabilities?: {adapters: Record<string, readonly BindingSelection['mode'][]>};
    credentials?: 'entry' | 'references';
    resourceOptions?: Record<string,Array<{id:string;name:string}>>;
    /** Only supplied by a host with an authenticated server-side connection flow. */
    providerConnections?: Partial<Record<'cloudflare'|'vercel',{available:boolean;connected:boolean;label?:string;accountId?:string}>>;
    onConnect?: (provider:'cloudflare'|'vercel')=>Promise<void>;
    onChange?: () => void;
}
/** One browser-only editor for bootstrap and console. Credential values never enter the manifest. */
export function mountBindingsForm(root: HTMLElement, options: BindingsFormOptions) {
    let manifest=structuredClone(options.manifest);
    const createNames=new Map(Object.entries(options.manifest.bindings).map(([role,binding])=>[role,binding.config.resourceName]));
    const secrets=new Map<string,string>(), document=root.ownerDocument;
    const adapters=options.adapters??deploymentAdapters;
    const entry=options.credentials!=='references';
    const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string)=>{
        const element=document.createElement(tag);
        if(text)element.textContent=text;
        if(className)element.className=className;
        return element;
    };
    const change=()=>options.onChange?.();
    const modes=(adapter:DeploymentAdapter)=>options.executionCapabilities?.adapters[adapter.id]??adapter.modes;
    const option=(label:string,value:string)=>{const result=node('option',label);result.value=value;return result;};
    const field=(parent:HTMLElement,label:string,value:string|undefined,update:(value:string)=>void,secret=false,required=false)=>{
        const wrapper=node('div',undefined,'fb-binding-field'),id='binding-'+crypto.randomUUID();
        const title=node('label',label);title.htmlFor=id;
        const input=node('input');input.id=id;input.type=secret?'password':'text';input.value=value??'';input.required=required;input.autocomplete='off';input.spellcheck=false;
        input.addEventListener('input',()=>{update(input.value);change();});
        wrapper.append(title,input);parent.append(wrapper);
    };
    function render() {
        root.classList.add('fb-bindings-form');root.replaceChildren();
        if(options.providerConnections){
            const needed=new Set<'cloudflare'|'vercel'>();
            for(const binding of Object.values(manifest.bindings))if(binding.mode!=='disabled'){
                if(binding.adapterId.startsWith('cloudflare-')||binding.adapterId==='d1-http')needed.add('cloudflare');
                if(binding.adapterId==='turso-marketplace')needed.add('vercel');
            }
            for(const provider of needed){
                const connection=options.providerConnections[provider],label=provider==='cloudflare'?'Cloudflare':'Vercel';
                const row=node('section',undefined,'fb-binding-connection');row.setAttribute('aria-label',label+' connection');
                if(connection?.connected)row.append(node('p',connection.label??label+' connected'));
                else if(connection?.available&&options.onConnect){
                    const button=node('button','Connect to '+label);button.type='button';
                    button.addEventListener('click',async()=>{button.disabled=true;try{await options.onConnect!(provider);}catch{row.append(node('p','Connection could not start. Please try again.','fb-binding-note'));}finally{button.disabled=false;}});row.append(button);
                }else row.append(node('p',label+' authorization is not configured for this installation.','fb-binding-note'));
                root.append(row);
            }
        }
        for(const role of configurableRoles) {
            const binding=manifest.bindings[role],card=node('section',undefined,'fb-binding-card');
            const heading=node('h3',bindingLabels[role]);heading.append(node('span',role==='state-db'?'Required':'Optional',role==='state-db'?'fb-binding-tag fb-tag-required':'fb-binding-tag fb-tag-optional'));card.append(heading);
            const compatible=adapters.filter(a=>a.role===role&&a.selectable&&a.targets.includes(manifest.target)&&(!options.executionCapabilities||options.executionCapabilities.adapters[a.id]?.length));
            const selected=adapters.find(a=>a.role===role&&a.id===binding.adapterId);
            const wrapper=node('div',undefined,'fb-binding-field'),title=node('label','Provider'),select=node('select');
            select.id='binding-provider-'+role;title.htmlFor=select.id;
            if(role!=='state-db')select.append(option('Disabled','disabled'));
            for(const adapter of compatible)select.append(option(names[adapter.id]??adapter.id,adapter.id));
            if(binding.mode!=='disabled'&&!compatible.some(a=>a.id===binding.adapterId)){const unsupported=option(binding.adapterId+' — setup unavailable',binding.adapterId);unsupported.disabled=true;select.append(unsupported);}
            select.value=binding.mode==='disabled'?'disabled':binding.adapterId;
            select.addEventListener('change',()=>{
                for(const reference of Object.values(binding.secretRefs))secrets.delete(reference);
                if(select.value==='disabled')manifest.bindings[role]={...binding,mode:'disabled',secretRefs:{}};
                else {
                    const adapter=compatible.find(a=>a.id===select.value)!;
                    const allowed=modes(adapter),mode=allowed.includes('connect')?'connect':allowed[0];
                    if(!mode)return;
                    const secretRefs=entry?{}:Object.fromEntries((adapter.requiredSecrets??[]).map(key=>[key,role+'/'+key]));
                    manifest.bindings[role]={adapterId:adapter.id,mode,config:{},secretRefs};
                }
                render();change();
            });
            wrapper.append(title,select);card.append(wrapper);
            if(binding.mode!=='disabled'&&selected) {
                const oauth=options.providerConnections?.cloudflare;
                const useOAuth=oauth?.connected&&selected.id==='d1-http';
                if(selected.id==='cloudflare-vectorize-http'){if(binding.secretRefs.token==='oauth/cloudflare/token')delete binding.secretRefs.token;card.append(node('p','Connect an existing Vectorize index with a token that has Vectorize access. The standard Cloudflare setup connection covers D1, Workers and KV.','fb-binding-note'));}
                if(useOAuth){if(!binding.config.accountId&&oauth.accountId)binding.config.accountId=oauth.accountId;binding.secretRefs.token='oauth/cloudflare/token';}
                if(!compatible.includes(selected))card.append(node('p','This adapter is unavailable in this deployment flow.','fb-binding-note'));
                else {
                    const modeWrapper=node('div',undefined,'fb-binding-field'),modeTitle=node('label','Resource action'),mode=node('select');
                    mode.id='binding-mode-'+role;modeTitle.htmlFor=mode.id;
                    for(const value of modes(selected))mode.append(option({create:'Create resource',reuse:'Reuse resource',connect:'Connect existing service',disabled:'Disabled'}[value],value));
                    mode.value=binding.mode;mode.addEventListener('change',()=>{binding.mode=mode.value as BindingSelection['mode'];delete binding.resourceRef;if(binding.mode==='create' && createNames.get(role))binding.config.resourceName=createNames.get(role)!;render();change();});
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
                    for(const key of selected.configKeys.filter(key=>key!=='resourceName'||binding.mode==='create'))field(card,fields[key]??key,binding.config[key],value=>binding.config[key]=value,false,selected.requiredConfig?.includes(key));
                    if(entry)for(const key of selected.secretKeys){
                        if(useOAuth&&key==='token'){card.append(node('p','Authorization uses your connected Cloudflare account.','fb-binding-note'));continue;}
                        const reference=binding.secretRefs[key]??role+'/'+key;
                        field(card,fields[key]??key,secrets.get(reference),value=>{if(value){binding.secretRefs[key]=reference;secrets.set(reference,value);}else{delete binding.secretRefs[key];secrets.delete(reference);}},true,selected.requiredSecrets?.includes(key));
                    }
                    if(selected.secretKeys.length)card.append(node('p',entry?'Credentials stay in this setup session. After reloading, re-enter them before validating edits.':'New credentials are entered privately in the local deployment review. This plan contains references only.','fb-binding-note'));
                }
            }
            root.append(card);
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
        destroy(){clearCredentials();root.replaceChildren();},
    };
}
