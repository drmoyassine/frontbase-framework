import {nativeDeployButtons} from '../deployment-buttons.mjs';

/** A deliberate operator-owned preview snapshot. The normal source defaults
 * remain usable without a required shared control plane. No account/keys are
 * embedded: the build derives its recipient and OAuth proves control of it. */
export function nativeSnapshotFiles({read,relay,ref,paths}) {
  if(!Array.isArray(paths)||paths.some(path=>typeof path!=='string'))throw Error('Native snapshot requires the complete source path inventory');
  const url=new URL(relay);
  if(url.protocol!=='https:'||url.origin!==relay||url.port||url.username||url.password)throw Error('Invalid relay origin');
  const buttons=nativeDeployButtons({ref,hosted:true});
  const pkg=JSON.parse(read('package.json'));
  pkg.frontbaseNativeSnapshot=true;
  pkg.scripts.deploy='node scripts/deploy-native-cloudflare.mjs --config wrangler.toml';
  const vercel=JSON.parse(read('examples/cf-full/vercel.json'));
  vercel.env={...vercel.env,FRONTBASE_NATIVE_SETUP:'1',FRONTBASE_NATIVE_RELAY_URL:relay};
  const original=read('wrangler.native.toml');
  if(!original.includes('FRONTBASE_NATIVE_RELAY_URL = ""'))throw Error('Native snapshot template changed');
  const readme=read('README.md').replace(/\[!\[Deploy with Vercel\][^\n]+/,`[![Deploy with Vercel](https://vercel.com/button)](${buttons.vercel})`).replace(/\[!\[Deploy to Cloudflare\][^\n]+/,`[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](${buttons.cloudflare})`);
  // Cloudflare's GitHub app cannot push workflow files. Null entries are explicit
  // deletions in the generated deployment snapshot, never in the source checkout.
  const excluded=Object.fromEntries(paths.filter(path=>path.startsWith('.github/workflows/')).map(path=>[path,null]));
  const settings={FRONTBASE_BOOTSTRAP:'native',FRONTBASE_NATIVE_RELAY_URL:relay};
  const formConfig=original.replace(/\[vars\]\s*\r?\nFRONTBASE_BOOTSTRAP = "native"\s*\r?\nFRONTBASE_NATIVE_RELAY_URL = ""\s*/,'');
  if(formConfig===original)throw Error('Native snapshot variables changed');
  return {...excluded,'package.json':JSON.stringify(pkg,null,2)+'\n','examples/cf-full/vercel.json':JSON.stringify(vercel,null,2)+'\n','wrangler.toml':formConfig,'frontbase-native-settings.json':JSON.stringify(settings,null,2)+'\n','.env.example':'# Administrator credentials are created in the deployed Frontbase wizard.\n','README.md':readme};
}
