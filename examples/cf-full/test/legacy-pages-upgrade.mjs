// Run after pnpm -r build. The fixtures use only local Workerd and temporary D1 files.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(join(root, 'package.json'));
const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve('wrangler'))('miniflare');
const fromRepo = path => import(pathToFileURL(join(root, path)).href);
const {d1RunnerFromBinding} = await fromRepo('packages/edge-infra/dist/providers/runners.js');
const {MIGRATIONS, migrateUp, appliedVersions} = await fromRepo('packages/backend/dist/db/migrations.js');
const {UserStore} = await fromRepo('packages/backend/dist/index.js');
const {seedOwner} = await fromRepo('packages/backend/dist/auth/seed.js');
const {emptyDirectoryConfiguration} = await fromRepo('packages/edge-core/dist/directory/configuration.js');
const {SitePublicationManifestStore} = await fromRepo('packages/backend/dist/compat/site-publication-manifest.js');
const {SitePublicationReviewStore} = await fromRepo('packages/backend/dist/compat/site-publication-review-store.js');
const {renderReviewedSitePublication} = await fromRepo('packages/backend/dist/compat/site-publication-serving.js');
const now = '2026-10-25T00:00:00Z';
const owner = '_root';
const email = 'upgrade@example.test';
const password = 'Synthetic isolated upgrade passphrase 261118';
const oldId = 'c2943e17-25d4-4e9d-8fe0-ae01bd545e40';
const reviewedId = '016d6cc3-6053-453f-b0b9-e20829d96a37';
const panelPath = '/api/project/pages-workspace/';
const pageLayout = text => ({root:{},content:[{id:'headline',type:'Heading',props:{text}}]});

for (const version of [22, 25]) {
  const d1Persist = await mkdtemp(join(tmpdir(), 'frontbase-pages-install-'));
  const d1Databases = {DB:'legacy-pages-' + version};
  const makeHost = options => new Miniflare(convertV4MiniflareOptions({modules:true,resourcePersistencePath:d1Persist,d1Databases,compatibilityDate:'2026-09-07',compatibilityFlags:['nodejs_compat'],...options}));
  let host;
  try {
    host = makeHost({script:'export default {fetch() { return new Response("fixture"); }}'});
    let db = d1RunnerFromBinding(await host.getD1Database('DB'));
    await migrateUp(db, () => now, MIGRATIONS.filter(m => m.version <= version));
    assert.equal(await seedOwner(new UserStore(db,owner), {email,password,role:'master_admin',tenantSlug:owner,now}).then(r=>r.seeded),true);
    await db.exec('INSERT INTO compat_pages (id,tenant_slug,name,slug,title,is_homepage,is_public,is_published,layout_data,created_at,updated_at) VALUES (?,?,?,?,?,0,1,1,?,?,?)',
      [oldId,owner,'Existing page','existing','Existing page',JSON.stringify(pageLayout('Legacy page kept')),now,now]);
    let reviewedHash, reviewedHtml;
    if (version === 25) {
      const configuration = emptyDirectoryConfiguration();
      Object.assign(configuration.site,{name:'Historical fixtures',origin:'https://legacy.test',locale:'en',destination:'USA'});
      configuration.datasourceId = 'fixture-source';
      for (const role of ['institution','program','city']) {
        const mapping = configuration.collections[role];
        mapping.table = role;
        mapping.scope = {field:'country',value:22};
        Object.assign(mapping.fields,{id:'id', title:'title'});
        if (role !== 'city') mapping.fields.originalPath = 'path';
      }
      configuration.collections.institution.fields.cityId = 'city';
      configuration.collections.program.fields.institutionId = 'institution';
      const layout = pageLayout('Reviewed page kept');
      await db.exec('INSERT INTO compat_pages (id,tenant_slug,name,slug,title,is_homepage,is_public,is_published,layout_data,created_at,updated_at) VALUES (?,?,?,?,?,0,1,0,?,?,?)',
        [reviewedId,owner,'Reviewed page','reviewed','Reviewed page',JSON.stringify(layout),now,now]);
      reviewedHash = await new SitePublicationManifestStore(db,owner).prepare({
        configuration,configurationRevision:1,templates:[],redirects:[],
        staticPages:[{pageId:reviewedId,originalPath:'/reviewed',title:'Reviewed page',description:'',layout}]
      },{institutions:[],programs:[],cities:[],articles:[],pages:[]},now);
      const review = new SitePublicationReviewStore(db,owner);
      await review.approve({hash:reviewedHash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Synthetic historical fixture'},'reviewer',now);
      await review.activate(reviewedHash,null,now);
      reviewedHtml = await (await renderReviewedSitePublication(db,owner,new Request('https://legacy.test/reviewed'))).text();
    }
    assert.equal((await appliedVersions(db)).at(-1),version);
    const historicalPages = await db.query('SELECT id,name,slug,is_published,layout_data,created_at,updated_at FROM compat_pages ORDER BY id');
    const historicalPublications = await db.query("SELECT key,value FROM settings WHERE key LIKE 'site_publication:%' ORDER BY key");
    await host.dispose();
    host = undefined;

    let upgradedMigrations;
    for (const restart of [false,true]) {
      const modulesRoot = join(root,'examples/cf-full/dist');
      const modules = ['worker.mjs','pg-worker.mjs'].map(file => ({type:'ESModule',path:join(modulesRoot,file)}));
      host = makeHost({modulesRoot,modules,bindings:{SESSION_SECRET:'synthetic-isolated-pages-install-secret'}});
      db = d1RunnerFromBinding(await host.getD1Database('DB'));
      assert.equal(await new UserStore(db,owner).countUsers(),1,'historical owner persisted before HTTP boot');
      const test = (path, init) => host.dispatchFetch('http://local.test'+path, init);
      const login = await test('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
      assert.equal(login.status,200, 'existing owner can sign in: '+(login.ok?'':await login.clone().text()));
      const cookie = login.headers.getSetCookie().find(value=>value.startsWith('frontbase_session=')).split(';')[0];
      assert.equal((await test(panelPath)).status,401);
      const response = await test(panelPath,{headers:{cookie}});
      assert.equal(response.status,200, 'authenticated Pages workspace');
      const workspace = await response.json();
      const existing = workspace.entries.find(entry=>entry.pageId===oldId);
      assert.equal(existing.publicationStatus,'published');
      assert.equal(existing.path,'/existing');
      const publicPage = await test('/existing');
      assert.equal(publicPage.status,200);
      assert.match(await publicPage.text(), /Legacy page kept/);
      assert.deepEqual(await appliedVersions(db),MIGRATIONS.map(m=>m.version));
      const migrationRows = await db.query('SELECT version,applied_at FROM _migrations ORDER BY version');
      if (restart) assert.deepEqual(migrationRows,upgradedMigrations,'restart does not repeat migrations');
      else upgradedMigrations = migrationRows;
      assert.deepEqual(await db.query('SELECT id,name,slug,is_published,layout_data,created_at,updated_at FROM compat_pages WHERE id IN (?,?) ORDER BY id',[oldId,reviewedId]),historicalPages);
      assert.deepEqual(await db.query("SELECT key,value FROM settings WHERE key LIKE 'site_publication:%' ORDER BY key"),historicalPublications);
      if (reviewedHash) {
        assert.equal(workspace.publication.hash,reviewedHash);
        const captured = workspace.entries.find(entry=>entry.pageId===reviewedId);
        assert.equal(captured.publicationStatus,'published');
        assert.equal(captured.publishedPath,'/reviewed');
        assert.equal(await (await renderReviewedSitePublication(db,owner,new Request('https://legacy.test/reviewed'))).text(),reviewedHtml);
        assert.equal((await test('/reviewed')).status,404,'capture-only content stays out of public live serving');
      }
      console.log('Workerd upgrade v%d → v26, %s: owner, inventory, public route and persisted records passed',version,restart?'restart':'first start');
      await host.dispose();
      host = undefined;
    }
  } finally {
    await host?.dispose();
    await rm(d1Persist,{recursive:true,force:true});
  }
}
