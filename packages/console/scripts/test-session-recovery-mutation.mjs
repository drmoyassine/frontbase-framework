import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(new URL('../package.json',import.meta.url)),cli=path.join(path.dirname(require.resolve('vitest/package.json')),'vitest.mjs');
const targets=['src/lib/sessionRecovery.ts','src/lib/auth/CookieAuthClient.ts','src/components/auth/ProtectedRoute.tsx'];
const digest=file=>createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex');const before=targets.map(digest);
const faults=[
 ['concurrent dedup',targets[0],'if(this.pending)return this.pending;','if(false)return this.pending;'],
 ['401-only admission',targets[0],'status!==401','false'],
 ['identity fence',targets[0],'JSON.stringify(result.identity)!==JSON.stringify(this.expected)','false'],
 ['network uncertainty',targets[0],"if(result.status==='unknown')","if(false)"],
 ['server cookie denial',targets[1],'if(response.status===401)return','if(false)return'],
 ['App draft-store retention',targets[0],"if(status!=='idle')",'if(false)'],
 ['mounted draft retention',targets[2],'if (!isAuthenticated && !recovering)','if (!isAuthenticated)'],
];
for(const [name,file,from,to]of faults){assert.ok(readFileSync(path.join(root,file),'utf8').includes(from),'fault anchor '+name);const config=path.join(os.tmpdir(),'frontbase-session-fault-'+randomUUID()+'.mjs');
 const source=`import base from ${JSON.stringify(path.join(root,'vitest.config.ts').replaceAll('\\','/'))};export default {...base,root:${JSON.stringify(root)},plugins:[{name:'session-fault',enforce:'pre',transform(code,id){if(id.split('?')[0].replaceAll('\\\\','/')===${JSON.stringify(path.join(root,file).replaceAll('\\','/'))}){if(!code.includes(${JSON.stringify(from)}))throw Error('fault anchor absent');console.log('session fault applied');return code.replaceAll(${JSON.stringify(from)},${JSON.stringify(to)});}}}]};`;
 try{writeFileSync(config,source);const run=spawnSync(process.execPath,[cli,'run','--config',config,'src/lib/sessionRecovery.test.ts','src/lib/auth/__tests__/CookieAuthClient.test.ts','src/components/auth/SessionRecoveryDialog.test.tsx'],{cwd:root,encoding:'utf8',timeout:120000,env:{...process.env,FORCE_COLOR:'0'}});assert.ok(run.status!==0&&/session fault applied/.test(run.stdout)&&/AssertionError|expected/.test(run.stdout+run.stderr),'fault escaped or harness failed: '+name+'\n'+run.stdout+'\n'+run.stderr);console.log('caught:',name);}finally{unlinkSync(config);}
}
assert.deepEqual(targets.map(digest),before);console.log('session-recovery: seven in-memory faults caught; shared source unchanged');
