import {deploymentAdapters,defaultDeploymentManifest,type DeploymentAdapter,type ConfigurableRole} from '@frontbase/edge-core/deployment';
import {bindingLabels,names} from '../../../packages/console/src/components/deployment/binding-labels.js';

type Host='cloudflare'|'vercel';
export function hostedAdapters(target:Host):DeploymentAdapter[]{
    return deploymentAdapters.filter(a=>a.targets.includes(target)&&['cloudflare-d1','cloudflare-kv','cloudflare-r2','cloudflare-queue','supabase-storage','cloudflare-r2-http','libsql-http','d1-http','supabase-postgres','postgrest-http','upstash-http','libsql-vector-http','cloudflare-vectorize-http','s3-http','qstash-http'].includes(a.id)).map(a=>a.id==='supabase-postgres'?{...a,modes:['create','reuse']}:a);
}

// Build the first screen from public adapter definitions. No provider call or private manifest is needed.
export function activationPage(html:string,target:Host){
    const adapters=hostedAdapters(target);
    const manifest=defaultDeploymentManifest(target,'production');
    const roles:ConfigurableRole[]=['state-db','storage','cache','queue','vector'];
    const fields=roles.map(role=>{
        const binding=manifest.bindings[role];
        const current=binding.mode==='disabled'?'disabled':binding.adapterId;
        const ids=adapters.filter(a=>a.selectable&&a.role===role).map(a=>a.id);
        if(role!=='state-db')ids.unshift('disabled');
        const options=ids.map(id=>'<option value="'+id+'"'+(id===current?' selected':'')+'>'+(id==='disabled'?'Disabled':names[id]??id)+'</option>').join('');
        return '<label class="fb-binding-field">'+bindingLabels[role]+'<select data-role="'+role+'">'+options+'</select></label>';
    });
    return html.replace('<!-- provider choices -->',fields[0]+'<details><summary>Optional services</summary>'+fields.slice(1).join('')+'</details>');
}
