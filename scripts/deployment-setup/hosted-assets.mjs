import {readFileSync} from 'node:fs';
import {buildBindingsAssets} from './bindings-assets.mjs';

export function hostedAssets(){
const formAssets=buildBindingsAssets();
const hostedWizardHtml=readFileSync(new URL('./hosted-index.html',import.meta.url),'utf8');
const hostedControls=hostedWizardHtml.split('<!-- hosted-controls -->')[1]?.split('<!-- /hosted-controls -->')[0];
if(!hostedControls?.includes('id="configuration"'))throw Error('Missing hosted wizard controls');
return {
 '/frontbase-bootstrap/setup-manifest.mjs':{body:readFileSync(new URL('./setup-manifest.mjs',import.meta.url),'utf8'),type:'text/javascript'},
 '/frontbase-bootstrap/native':{body:readFileSync(new URL('./native-index.html',import.meta.url),'utf8'),type:'text/html; charset=utf-8'},
 '/frontbase-bootstrap/native.js':{body:readFileSync(new URL('./native-app.js',import.meta.url),'utf8'),type:'text/javascript'},
 '/frontbase-bootstrap/activation':{body:readFileSync(new URL('./native-activation.html',import.meta.url),'utf8').replace('<!-- hosted-controls -->',hostedControls),type:'text/html; charset=utf-8'},
 '/frontbase-bootstrap/native-activation.js':{body:readFileSync(new URL('./native-activation.js',import.meta.url),'utf8'),type:'text/javascript'},
 '/frontbase-bootstrap/':{body:hostedWizardHtml,type:'text/html; charset=utf-8'},
 '/frontbase-bootstrap/app.js':{body:readFileSync(new URL('./hosted-app.js',import.meta.url),'utf8'),type:'text/javascript'},
 '/frontbase-bootstrap/bindings-form.js':{body:formAssets.js,type:'text/javascript'},
 '/frontbase-bootstrap/provider-connect.js':{body:formAssets.connectionJs,type:'text/javascript'},
 '/frontbase-bootstrap/style.css':{body:readFileSync(new URL('./style.css',import.meta.url),'utf8')+'\n'+formAssets.css,type:'text/css'}
};
}
