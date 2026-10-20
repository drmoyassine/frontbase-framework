import {lstatSync,readFileSync} from 'node:fs';
import {validateDeploymentManifest} from '../../packages/edge-core/dist/deployment.js';
/** Data-only, bounded proposal; no executable imports or credential values. */
export function readDeploymentProposal(path,{target,environment}) {
 try {
  const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)throw Error();
  const plan=validateDeploymentManifest(JSON.parse(readFileSync(path,'utf8')));
  if(!plan.ready||plan.manifest.target!==target||plan.manifest.environment!==environment)throw Error();
  return plan.manifest;
 } catch {throw new Error('invalid_deployment_proposal');}
}
