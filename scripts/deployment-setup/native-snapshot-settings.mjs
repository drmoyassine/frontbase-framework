import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

/** Apply snapshot defaults after the provider form, never to ordinary configs
 * or explicitly configured/activated installations. No secrets are stored here. */
export async function nativeSnapshotSettings(config,source) {
  if(config.vars?.FRONTBASE_BOOTSTRAP!==undefined)return config;
  const directory=dirname(source);
  let pkg;
  try { pkg=JSON.parse(await readFile(resolve(directory,'package.json'),'utf8')); }
  catch(error) { if(error.code==='ENOENT')return config;throw error; }
  if(pkg.frontbaseNativeSnapshot!==true)return config;
  const settings=JSON.parse(await readFile(resolve(directory,'frontbase-native-settings.json'),'utf8'));
  if(!settings || typeof settings!=='object' || Array.isArray(settings) || Object.keys(settings).sort().join(',')!=='FRONTBASE_BOOTSTRAP,FRONTBASE_NATIVE_RELAY_URL' || settings.FRONTBASE_BOOTSTRAP!=='native' || typeof settings.FRONTBASE_NATIVE_RELAY_URL!=='string')throw Error('Invalid native snapshot settings');
  const relay=new URL(settings.FRONTBASE_NATIVE_RELAY_URL);
  if(relay.protocol!=='https:'||relay.origin!==settings.FRONTBASE_NATIVE_RELAY_URL||relay.port||relay.username||relay.password)throw Error('Invalid native snapshot relay');
  return {...config,vars:{...config.vars,...settings}};
}
