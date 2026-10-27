import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {unstable_readConfig} from 'wrangler';
import {nativeSnapshotSettings} from './deployment-setup/native-snapshot-settings.mjs';
import {nativeSnapshotFiles} from './deployment-setup/native-snapshot.mjs';
import {nativeCloudflarePlan} from './deployment-setup/native-cloudflare-plan.mjs';
import {readFileSync} from 'node:fs';
const dir=await mkdtemp(join(tmpdir(),'fb-native-settings-'));
try {
  const source=join(dir,'wrangler.toml'),ordinary={vars:{OTHER:'retained'}};
  assert.equal(await nativeSnapshotSettings(ordinary,source),ordinary);
  await writeFile(join(dir,'package.json'),JSON.stringify({frontbaseNativeSnapshot:true}));
  await assert.rejects(()=>nativeSnapshotSettings(ordinary,source),{code:'ENOENT'});
  const settings={FRONTBASE_BOOTSTRAP:'native',FRONTBASE_NATIVE_RELAY_URL:'https://oauth.frontbase.dev'};
  for(const bad of [null,[],{...settings,SECRET:'unexpected'},{...settings,FRONTBASE_BOOTSTRAP:'0'},{...settings,FRONTBASE_NATIVE_RELAY_URL:'http://relay.example'},{...settings,FRONTBASE_NATIVE_RELAY_URL:'https://relay.example/path'}]) {
    await writeFile(join(dir,'frontbase-native-settings.json'),JSON.stringify(bad));
    await assert.rejects(()=>nativeSnapshotSettings(ordinary,source));
  }
  await writeFile(join(dir,'frontbase-native-settings.json'),JSON.stringify(settings));
  assert.deepEqual((await nativeSnapshotSettings(ordinary,source)).vars,{OTHER:'retained',...settings});
  for(const mode of ['native','0','1']) {
    const explicit={vars:{FRONTBASE_BOOTSTRAP:mode,FRONTBASE_NATIVE_RELAY_URL:'https://operator.example'}};
    assert.equal(await nativeSnapshotSettings(explicit,source),explicit);
  }
  await writeFile(join(dir,'package.json'),'{}');
  assert.equal(await nativeSnapshotSettings(ordinary,source),ordinary);
  const files=nativeSnapshotFiles({read:p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),paths:[],relay:settings.FRONTBASE_NATIVE_RELAY_URL,ref:'fixture'});
  for(const name of ['wrangler.toml','package.json','frontbase-native-settings.json'])await writeFile(join(dir,name),files[name]);
  const parsed=unstable_readConfig({config:source});
  assert.equal(parsed.vars.FRONTBASE_BOOTSTRAP,undefined);
  assert.equal(parsed.vars.FRONTBASE_NATIVE_RELAY_URL,undefined);
  const resolved=await nativeSnapshotSettings(parsed,source);
  const args={account:'a'.repeat(32),project:'fixture',subdomain:'fixture',relay:settings.FRONTBASE_NATIVE_RELAY_URL};
  const plan=nativeCloudflarePlan(resolved,args);
  assert.equal(plan.vars.FRONTBASE_BOOTSTRAP,'native');assert.equal(plan.vars.FRONTBASE_NATIVE_RELAY_URL,settings.FRONTBASE_NATIVE_RELAY_URL);
  const active={bindings:[{name:'ASSETS',type:'assets'},{name:'FRONTBASE_BOOTSTRAP',type:'plain_text',text:'0'},{name:'FRONTBASE_INSTALLATION_ID',type:'plain_text',text:plan.vars.FRONTBASE_INSTALLATION_ID},{name:'DB',type:'d1',id:plan.vars.FRONTBASE_INSTALLATION_ID},{name:'SESSION_SECRET',type:'secret_text'}]};
  const upgrade=nativeCloudflarePlan(resolved,{...args,settings:active});
  assert.equal(upgrade.vars.FRONTBASE_BOOTSTRAP,'0');assert.equal(upgrade.d1_databases[0].database_id,plan.vars.FRONTBASE_INSTALLATION_ID);
  console.log('PASS hidden form settings: real Wrangler parser, runtime values, explicit configuration, fail-closed malformed/missing file, activated DB/session preservation');
}finally {await rm(dir,{recursive:true,force:true});}
