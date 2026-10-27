import {createHash} from 'node:crypto';

const refuse = () => { throw Error('Native deployment metadata unavailable or invalid'); };
export function nativeInstallationId(host, account, project) {
  const hex = createHash('sha256').update(JSON.stringify(['frontbase-native-v1',host,account,project])).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function nativeMetadata({host,account,project,origin,relay}) {
  if (!['cloudflare','vercel'].includes(host) || !(host === 'cloudflare' ? /^[a-f0-9]{32}$/.test(account) && /^[a-z0-9][a-z0-9-]{0,62}$/.test(project) : /^team_[A-Za-z0-9]+$/.test(account) && /^prj_[A-Za-z0-9]+$/.test(project))) refuse();
  for (const value of [origin,relay]) {
    let url; try {url = new URL(value);} catch {refuse();}
    if (url.protocol !== 'https:' || url.origin !== value || url.port || url.username || url.password) refuse();
  }
  const installation = nativeInstallationId(host,account,project);
  return {FRONTBASE_HOSTED_SETUP:'1',FRONTBASE_BOOTSTRAP:'native',FRONTBASE_INSTALLATION_ID:installation,FRONTBASE_NATIVE_INSTALLATION_ID:installation,FRONTBASE_NATIVE_ACCOUNT:account,FRONTBASE_NATIVE_PROJECT:project,FRONTBASE_NATIVE_PUBLIC_ORIGIN:origin,FRONTBASE_NATIVE_RELAY_URL:relay};
}
/** Build-system metadata only; never use request headers. These values identify
 * the target, not authorization: the relay independently verifies ownership
 * using the consenting user's management grant before reserving its claim. */
export function vercelNativeBuildMetadata(env) {
  if (env.FRONTBASE_NATIVE_SETUP !== '1') return {};
  if (env.FRONTBASE_BOOTSTRAP === '0' || env.FRONTBASE_BOOTSTRAP === '1') return {};
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production') refuse();
  let identity; try {identity = JSON.parse(Buffer.from(env.VERCEL_OIDC_TOKEN.split('.')[1], 'base64url').toString());} catch {refuse();}
  if (identity.project_id !== env.VERCEL_PROJECT_ID || identity.environment !== 'production') refuse();
  return nativeMetadata({host:'vercel',account:identity.owner_id,project:env.VERCEL_PROJECT_ID,origin:'https://'+env.VERCEL_PROJECT_PRODUCTION_URL,relay:env.FRONTBASE_NATIVE_RELAY_URL});
}
