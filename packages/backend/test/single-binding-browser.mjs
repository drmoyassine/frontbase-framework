import {serializeCondition} from '../../edge-core/dist/conditions.js';
// Isolated loopback browser proof. All records/identities are synthetic.
import {createServer} from 'node:http';
import {readFileSync,readdirSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {sqliteRunner} from '@frontbase/edge-infra';
import {createCompatApp} from '../dist/compat/app.js';
import {migrateUp} from '../dist/db/migrations.js';
import {renderPage} from '../../edge-core/dist/ssr/PageRenderer.js';
const root=new URL('../../../',import.meta.url);
const control=sqliteRunner(':memory:');await migrateUp(control);
const dataUrl='file:'+join(mkdtempSync(join(tmpdir(),'frontbase-filter-browser-')),'data.db').replaceAll('\\','/');
const data=sqliteRunner(dataUrl);await data.exec('CREATE TABLE catalog(id INTEGER,title TEXT,kind TEXT,country INTEGER)');
for(const row of [[1,'Program One','program',22],[2,'Institution One','institution',22],[3,'Outside view','program',99]])await data.exec('INSERT INTO catalog VALUES(?,?,?,?)',row);
const app=await createCompatApp({makeRunner:async()=>control,resolvePrincipal:async()=>({tenant:'fixture',user:{id:'fixture',role:'owner'}}),sessionSecret:'synthetic-loopback-proof'});
const created=await app.request('/api/sync/datasources/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Synthetic catalog',type:'sqlite',config:{url:dataUrl}})});if(created.status!==201)throw Error('fixture setup failed');const datasourceId=(await created.json()).id;
const buttons=(scope)=>['program','institution'].map(value=>({id:`${scope}-${value}`,type:'Button',props:{text:`${scope==='url'?'URL':'Local'} ${value}`,actionBindings:[{trigger:'onClick',actionType:'setVariable',config:{variableScope:scope,variableName:'type',variableValue:value}}]}}));
const binding=scope=>({dataSourceId:datasourceId,tableName:'catalog',pagination:{enabled:true,page:0,pageSize:12},sorting:{enabled:false},filtering:{searchEnabled:false,filters:{}},columnOverrides:{},columnOrder:['title','kind'],hiddenFilters:[{id:'scope',column:'country',operator:'eq',value:'22'},...['program','institution'].map(value=>({id:value,column:'kind',operator:'eq',value,when:{variable:`{{ ${scope}.type }}`,operator:'eq',value}}))],dataRequest:{fetchStrategy:'proxy',datasourceId,queryConfig:{tableName:'catalog',columns:'*',joins:[]},resultPath:'rows'}});
const repeater=(scope,live)=>({id:`${scope}-list`,type:'Repeater',props:{columns:2},binding:{...binding(scope),...(live?{}:{dataRequest:undefined})},children:[{id:`${scope}-card`,type:'Card',props:{},children:[{id:`${scope}-title`,type:'Heading',props:{text:'{{ record.title }}',level:'3'}}]}]});
async function document(canvas=false){
 const layout={root:{localVariables:{type:{type:'string',defaultValue:'institution'}}},content:[{id:'heading',type:'Heading',props:{text:canvas?'Builder-mode single-binding proof':'Public-mode single-binding proof',level:'1'}},...buttons('url'),{id:'conditional-card',type:'Card',visibilityCondition:serializeCondition({all:[{left:{kind:'variable',path:'url.type'},operator:'eq',right:{kind:'literal',value:'program'}},{left:{kind:'variable',path:'user.contact_type'},operator:'eq',right:{kind:'literal',value:'student'}}]}),props:{},children:[{id:'visible-image',type:'Image',props:{src:'/proof.svg',alt:'Conditional program image'}},{id:'visible-text',type:'Text',props:{text:'Program image/card: student only'}}]},repeater('url',!canvas),...buttons('local'),repeater('local',!canvas)]};
 const context={page:{title:'Synthetic filter proof'},user:{id:'synthetic-user',contact_type:'student',permission_level:'reader'},visitor:{},url:{},system:{},cookies:{},local:{},session:{},app:{}};
 const body=await renderPage(layout,context);
 const assets=new URL('examples/cf-full/console-dist/frontbase-admin/assets/',root);const css=readdirSync(assets).find(name=>name.endsWith('.css'));
 return `<!DOCTYPE html><html><head>${canvas?'<meta name="chimera-rendered-by" content="builder">':''}<title>Single-binding filter proof</title><link rel="stylesheet" href="/assets/${css}"><style>body{padding:24px;background:white;color:#101828}button{margin:12px 8px 18px 0}#url-list,#local-list{padding:16px;border:1px solid #aaa;border-radius:12px;margin-bottom:24px}</style></head><body>${body}<script>window.__PAGE_DATA__=${JSON.stringify({layoutData:layout,appVariables:{}}).replaceAll('<','\\u003c')};window.__REACT_HYDRATION_PENDING__=true;</script><script type="module" src="/static/react/hydrate.js"></script></body></html>`;
}
const server=createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://fixture.test');
 if(url.pathname==='/proof.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="60"><rect width="180" height="60" fill="#15803d"/><text x="15" y="35" fill="white">Program visible</text></svg>');return;}
 if(url.pathname==='/static/react/hydrate.js'){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(new URL('examples/cf-full/console-dist/react/hydrate.js',root)));return;}
 if(/^\/assets\/[^/]+\.css$/.test(url.pathname)){res.setHeader('Content-Type','text/css');res.end(readFileSync(new URL('examples/cf-full/console-dist/frontbase-admin'+url.pathname,root)));return;}
 if(url.pathname==='/'||url.pathname==='/canvas/'){res.setHeader('Content-Type','text/html');res.end(await document(url.pathname==='/canvas/'));return;}
 const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const response=await app.request(url.pathname+url.search,{method:req.method,headers:{'content-type':'application/json'},...(body.length?{body}:{})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error('Synthetic proof error:',error.message);res.writeHead(500);res.end('Synthetic proof error');}
});
server.listen(0,'127.0.0.1',()=>console.log(`FILTER_PROOF_URL=http://127.0.0.1:${server.address().port}/`));
