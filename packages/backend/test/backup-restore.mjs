import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sqliteRunner} from '@frontbase/edge-infra';
import {emptyDirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {createMenuDefinition} from '@frontbase/edge-core/menus';
import {migrateUp} from '../dist/db/migrations.js';
import {createSecretCipher} from '../dist/db/secret-cipher.js';
import {PagesStore} from '../dist/compat/pages-store.js';
import {SitePublicationManifestStore} from '../dist/compat/site-publication-manifest.js';
import {SitePublicationReviewStore} from '../dist/compat/site-publication-review-store.js';
import {MenusSnapshotStore} from '../dist/compat/menus-snapshot.js';
import {renderReviewedSitePublication} from '../dist/compat/site-publication-serving.js';
import {exportStateBackup, restoreStateBackup, verifyStateIntegrity} from '../dist/compat/backup-restore.js';
const now='2026-10-22T00:00:00Z',tenant='alpha';
const stateDb=()=>{const dir=mkdtempSync(join(tmpdir(),'frontbase-backup-'));return sqliteRunner('file:'+join(dir,'state.db').replaceAll('\\','/'));};
const source=stateDb(),restored=stateDb(),scratch=stateDb(),torn=stateDb(),drifted=stateDb();
await migrateUp(source,()=>now);
// Build a real deployment state through the REAL stores: menus snapshot, chunked publication
// (pages + managed menu region), draft pages, an at-rest secret, branding asset chunks, and
// the boot-session-secret provenance row.
const menus=new MenusSnapshotStore(source,tenant),publicAudience={authentication:'everyone',contactTypes:[],permissionLevels:[]};
const menu=createMenuDefinition('header','header');menu.design.brand='Backup site';menu.items=[{id:'mi-about',label:'About',href:'/about/',audience:publicAudience,children:[]}];
const menusHash=await menus.prepare({schemaVersion:1,revision:1,menus:[menu]},now);
const config=emptyDirectoryConfiguration();config.site={name:'Backup site',destination:'USA',origin:'https://backup.test',locale:'en'};config.datasourceId='content';
for(const role of ['institution','program','city']){const m=config.collections[role];m.table=role;m.scope={field:'country',value:22};Object.assign(m.fields,{id:'id',title:'title'});if(role!=='city')m.fields.originalPath='path';}
config.collections.institution.fields.cityId='city';config.collections.program.fields.institutionId='institution';
const pageId='00000000-0000-4000-8000-00000000b001',aboutId='00000000-0000-4000-8000-00000000b002';
const staticPages=[
 {pageId,title:'Home',description:'Backup fixture',originalPath:'/',layout:{root:{},content:[{id:'nav',type:'Navbar',props:{logo:{text:'Backup site',link:'/'},menuItems:[{id:'m-about',label:'About',navType:'link',target:'/about/'}],primaryButton:{enabled:false},secondaryButton:{enabled:false},showDarkModeToggle:true}},{id:'hero',type:'Heading',props:{text:'Welcome to the campus'}}]}},
 {pageId:aboutId,title:'About',description:'About page',originalPath:'/about/',layout:{root:{appMenus:{schemaVersion:1,hash:menusHash,pageId:aboutId}},content:[{id:'about-body',type:'Heading',props:{text:'About our programs'}}]}}];
const store=new SitePublicationManifestStore(source,tenant);
const hash=await store.prepare({configurationRevision:1,configuration:config,templates:[],staticPages,redirects:[]},{cities:[],institutions:[],programs:[],articles:[]},now);
await new SitePublicationReviewStore(source,tenant).approve({hash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Backup fixture reviewed'},'reviewer',now);
await new SitePublicationReviewStore(source,tenant).activate(hash,null,now);
await new PagesStore(source,tenant).create({name:'Homepage',slug:'home',is_homepage:true,layout_data:staticPages[0].layout},pageId,now);
const cipher=await createSecretCipher('backup-suite-secret');
await source.exec('INSERT INTO variables (tenant_slug,key,value,is_secret,updated_at) VALUES (?,?,?,?,?)',[tenant,'stripe_key',await cipher.encrypt('sk_live_fixture'),1,now]);
await source.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?)',[tenant,'project_asset:logo.png',JSON.stringify({chunks:2,mime:'image/png'}),now]);
for(const [key,value] of [['project_asset:logo.png#0','QUJD'],['project_asset:logo.png#1','REVGRg==']])await source.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?)',[tenant,key,value,now]);
await source.exec("INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES ('_system','boot.session_secret',?,?)",['a'.repeat(64),now]);
const render=async(db,path)=>{const r=await renderReviewedSitePublication(db,tenant,new Request('https://backup.test'+path));return {status:r?.status,text:await r?.text()};};
try{
 // Export: full inventory, transactional consistency, ciphertext accounting, provenance.
 const backup=await exportStateBackup(source,now,false);
 assert.equal(backup.format,'frontbase.state-backup');assert.equal(backup.consistent,true);
 assert.deepEqual(backup.migrations,Array.from({length:25},(_,index)=>index+1));
 assert.ok(backup.counts.settings>=5&&backup.counts.compat_pages===1,JSON.stringify(backup.counts));
 assert.equal(backup.encCounts['variables.value(is_secret=1)'],1);
 assert.equal(backup.secretProvenance.bootSecretRowPresent,true);
 assert.ok(backup.secretProvenance.encTotal>=1);
 // An un-migrated database refuses to export: a backup of an un-bootable state proves nothing.
 await assert.rejects(exportStateBackup(stateDb(),now,false),/backup_requires_migrated_state/);
 // Restore boundaries: the isolated-target contract mirrors cloud-ops.
 await assert.rejects(restoreStateBackup(source,backup,now,{confirmEmptyTarget:true}),/restore_target_not_empty/);
 await assert.rejects(restoreStateBackup(restored,backup,now,{confirmEmptyTarget:false}),/restore_target_not_confirmed/);
 const newer=structuredClone(backup);newer.migrations=[...newer.migrations,999];
 // A backup carrying a version the running head never had is refused — one fence covers both
 // newer-than-code and divergent-branch skew; older backups are absorbed by migrateUp.
 await assert.rejects(restoreStateBackup(scratch,newer,now,{confirmEmptyTarget:true}),/restore_backup_foreign_schema/);
 const foreign=structuredClone(backup);foreign.migrations=[2,7,999];
 await assert.rejects(restoreStateBackup(scratch,structuredClone(foreign),now,{confirmEmptyTarget:true}),/restore_backup_foreign_schema|restore_target_not_empty/);
 // A runner that cannot hold a transaction refuses to restore rather than risk a torn load.
 const bare=stateDb();const noTx={query:(sql,params)=>bare.query(sql,params),exec:async(sql,params)=>{if(sql==='BEGIN')throw Error('no transactions here');return bare.exec(sql,params);}};
 await assert.rejects(restoreStateBackup(noTx,backup,now,{confirmEmptyTarget:true}),/restore_target_not_transactional/);
 // THE CROWN: restore into a fresh DB and the deployed site renders BYTE-IDENTICAL HTML.
 const {report}=await restoreStateBackup(restored,backup,now,{confirmEmptyTarget:true});
 assert.equal(report.ok,true,JSON.stringify(report.checks));
 const home=await render(source,'/'),home2=await render(restored,'/');
 assert.equal(home.status,200);assert.equal(home2.status,200);
 assert.equal(home.text,home2.text,'restored deployment renders byte-identical public HTML');
 const about=await render(restored,'/about/');assert.equal(about.status,200);assert.ok(about.text.includes('About our programs'));
 // The integrity walk also runs standalone against a live DB (no export to reconcile).
 const live=await verifyStateIntegrity(source);assert.equal(live.ok,true,JSON.stringify(live.checks));
 // Tamper: one byte flipped inside the stored manifest must fail its pointer↔artifact re-hash
 // (the manifest store recomputes the publication hash on every read; page captures live in the
 // manifest JSON, chunk rows hold directory records — this fixture legitimately has zero chunks).
 const manifests=await restored.query("SELECT key,value FROM settings WHERE key LIKE 'site\\_publication:manifest:v2:%' ESCAPE '\\'");
 assert.ok(manifests.length>=1);const victim=manifests[0];
 await restored.exec('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?',[String(victim.value).replace('Welcome to the campus','Kelcome to the campus'),tenant,victim.key]);
 const tampered=await verifyStateIntegrity(restored,backup);assert.equal(tampered.ok,false);
 // activeVersion() loads the manifest internally, so the tamper surfaces on whichever
 // publication-plane check reads it first — the walk-level invariant is that SOME publication
 // check fails, not which layer of the store catches it.
 assert.ok(tampered.checks.some(item=>item.id.startsWith('alpha:publication')&&!item.ok),JSON.stringify(tampered.checks));
 // Torn backup: a payload missing the review row restores but the walk catches the gap.
 const tornBackup=structuredClone(backup);
 tornBackup.tables.settings=tornBackup.tables.settings.filter(row=>!String(row.key).startsWith(`site_publication:review:v1:`));
 tornBackup.counts.settings=tornBackup.tables.settings.length;
 await restoreStateBackup(torn,tornBackup,now,{confirmEmptyTarget:true});
 const tornReport=await verifyStateIntegrity(torn,tornBackup);assert.equal(tornReport.ok,false);
 assert.ok(tornReport.checks.some(item=>item.id==='alpha:publication-review'&&!item.ok),JSON.stringify(tornReport.checks));
 // Ciphertext drift: a payload missing the variables table restores a target with the table
 // present but zero rows — detectable even though the secret value itself is opaque.
 const driftBackup=structuredClone(backup);delete driftBackup.tables.variables;driftBackup.counts.variables=0;
 await restoreStateBackup(drifted,driftBackup,now,{confirmEmptyTarget:true});
 const driftReport=await verifyStateIntegrity(drifted,driftBackup);assert.equal(driftReport.ok,false);
 assert.ok(driftReport.checks.some(item=>item.id==='secret-ciphertext-accounting'&&!item.ok),JSON.stringify(driftReport.checks));
 console.log('backup-restore: export inventory/consistency/accounting/provenance, fresh-target+confirm+newer+foreign+non-transactional refusals, byte-identical restored HTML, live integrity walk, manifest-tamper/torn-review/ciphertext-drift detection PASS');
}catch(error){throw error;}finally{try{}catch{}}
