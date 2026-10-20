import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ConsoleAuthVars } from '../../mw/auth.js';
import { readManagedRuntimeManifest, reviewDeploymentManifest } from '@frontbase/edge-core/deployment';
import { principalRole } from '../plans/gates.js';

/** Framework-owned operator review only; no provider credentials, writes or provisioning. */
export function registerDeploymentBindingsRoutes(app:Hono<{Variables:ConsoleAuthVars}>, options:{manifest?:unknown;cloudMode?:boolean}) {
    const current=readManagedRuntimeManifest(options.manifest);
    const operator=(c:{get(name:'principal'):unknown;get(name:'tenant'):string})=>{
        const role=principalRole(c),tenant=c.get('tenant');
        return !options.cloudMode && (role==='master_admin'&&tenant==='_root'||role==='owner'&&tenant==='_default');
    };
    app.get('/api/deployment/bindings',c=>{
        if(!operator(c))return c.json({error:'deployment_operator_required'},403);
        c.header('Cache-Control','no-store');
        return c.json(current?{available:true,manifest:current,applySupported:false}:{available:false,reason:'managed_deployment_metadata_unavailable',applySupported:false});
    });
    app.post('/api/deployment/bindings/review',bodyLimit({maxSize:32768,onError:c=>c.json({error:'invalid_deployment_review'},413)}),async c=>{
        if(!operator(c))return c.json({error:'deployment_operator_required'},403);
        c.header('Cache-Control','no-store');
        if(!current)return c.json({error:'managed_deployment_metadata_unavailable'},409);
        const body=await c.req.json().catch(()=>null);
        if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!Object.hasOwn(body,'manifest'))return c.json({error:'invalid_deployment_review'},400);
        const review=reviewDeploymentManifest(current,body.manifest);
        return c.json(review,review.ready?200:422);
    });
}
