import assert from 'node:assert/strict';
import {nativeDeployErrorMessage} from './deployment-setup/native-deploy-errors.mjs';
assert.match(nativeDeployErrorMessage(Error('Unsupported existing binding; use the managed deployment flow')),/unsupported by native upgrades/);
assert.match(nativeDeployErrorMessage(Error('Invalid retained R2 identity')),/R2 bucket binding/);
assert.match(nativeDeployErrorMessage(Error('Invalid retained Queue identity')),/Queue binding/);
assert.match(nativeDeployErrorMessage(Error('native_build_api_token_required')),/persistent Cloudflare API token/);
assert.match(nativeDeployErrorMessage(Error('native_build_permission_required: Workers Scripts: Edit and Read')),/Workers Scripts Edit and Read/);
for(const error of [Error('provider body: private-fixture-token'),Error('native_build_permission_required: private-fixture-token'),{message:{toString(){throw Error('untrusted conversion');}}},null]){const message=nativeDeployErrorMessage(error);assert.ok(!message.includes('private-fixture-token'));assert.match(message,/no automatic resource retry/);}
console.log('PASS native deploy diagnostics: actionable fixed binding/permission messages, no provider payload or arbitrary credential echo');
