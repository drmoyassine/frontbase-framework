import type {Hono} from 'hono';
import type {DbRunner} from '@frontbase/edge-infra';
import type {ConsoleAuthVars} from '../../mw/auth.js';
import {TemplateInstallStore,TemplateInstallConflict,templateInstallInput} from '../template-install-store.js';
import {bookingTemplate} from '../booking-template.js';
import {z} from 'zod';
async function body(request:Request){
 if(request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')throw Error('json_required');
 const reader=request.body?.getReader(),decoder=new TextDecoder();let text='',size=0;
 if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536){await reader.cancel();throw Error('too_large');}text+=decoder.decode(part.value,{stream:true});}
 return JSON.parse(text+decoder.decode());
}
export function registerTemplateInstallRoutes(app:Hono<{Variables:ConsoleAuthVars}>,db:DbRunner,now:()=>string){
 app.use('/api/project/templates/*',async(c,next)=>{
  c.header('Cache-Control','no-store');c.header('X-Robots-Tag','noindex, nofollow');
  if(!['owner','admin','tenant_admin','master_admin','master_admin_root'].includes(c.get('principal').user?.role??''))return c.json({detail:'Administrator access is required to install a template.'},403);
  if(new URL(c.req.url).search)return c.json({detail:'Template operations do not accept URL parameters.'},422);
  return next();
 });
 app.get('/api/project/templates/catalog/',c=>c.json({templates:[bookingTemplate],atomicInstallAvailable:!!db.atomicWrite}));
 app.get('/api/project/templates/status/',async c=>{try{return c.json({installation:await new TemplateInstallStore(db,c.get('tenant')).status()});}catch{return c.json({detail:'Installation status is unavailable. No changes were repeated.'},503);}});
 for(const mode of ['review','install'] as const)app.post('/api/project/templates/'+mode+'/',async c=>{
  let parsed;try{const raw=await body(c.req.raw);parsed=mode==='review'?templateInstallInput.parse(raw):templateInstallInput.extend({reviewHash:z.string().regex(/^[a-f0-9]{64}$/),operationId:z.string().uuid()}).strict().parse(raw);}catch(error){const message=error instanceof Error?error.message:'';return c.json({detail:message==='too_large'?'Template request is too large.':message==='json_required'?'A JSON template request is required.':'Template settings are invalid. Check the form and review again.'},message==='too_large'?413:message==='json_required'?415:422);}
  try{const store=new TemplateInstallStore(db,c.get('tenant'));
   if(mode==='review')return c.json(await store.review(parsed));
   const {reviewHash,operationId,...input}=parsed as z.infer<typeof templateInstallInput>&{reviewHash:string;operationId:string};
   const result=await store.install(input,reviewHash,operationId,now());return c.json({installation:result},result?.status==='installed'?200:409);
  }catch(error){if(error instanceof TemplateInstallConflict)return c.json({detail:error.message,code:'template_install_conflict'},409);
   return c.json({detail:mode==='install'?'Installation could not be confirmed. Check installation status before taking another action; changes will not be repeated.':'Review is unavailable. Your settings are preserved; check the state connection and try again.',code:'template_install_unavailable'},503);}
 });
}
