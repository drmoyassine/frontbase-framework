import {isDeepStrictEqual} from 'node:util';
/** Existing local review authorizes supported environment wiring, never state migration.
 * An uncertain attempt must finish the same desired plan before another plan is applied. */
export function assertVercelOptionalChanges(previous, manifest) {
 if(!previous)return;
 if(previous.phase!=='succeeded'&&!isDeepStrictEqual(previous.manifest,manifest))throw Error('vercel_pending_plan_requires_reconciliation');
 const supported=new Set(['cache','vector','queue','storage']);
 for(const [role,binding] of Object.entries(manifest.bindings)) {
  if(role!=='state-db'&&!supported.has(role)&&!isDeepStrictEqual(previous.manifest.bindings[role],binding))throw Error('binding_change_requires_review');
 }
}
