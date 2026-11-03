import assert from 'node:assert/strict';
import { datasourceRunner, isIntrospectable, dialectOf } from '../dist/db/datasource-runner.js';
import { serializeDatasource } from '../dist/compat/routes/sync-shapes.js';
import { resolveTurso } from '../dist/compat/providers/turso.js';

for (const kind of ['d1', 'cloudflare']) {
    let calls = 0;
    const runner = datasourceRunner(kind, { account_id:'account', database_id:'selected', api_token:'PRIVATE_TOKEN' }, async (input, init) => {
        const request = new Request(input, init);
        assert.equal(new URL(request.url).pathname, '/client/v4/accounts/account/d1/database/selected/query');
        assert.equal(request.headers.get('authorization'), 'Bearer PRIVATE_TOKEN');
        calls++;
        return Response.json({success:true,result:[{success:true,results:[{answer:1}],meta:{changes:0}}]});
    });
    assert.deepEqual(await runner.query('SELECT 1 AS answer'), [{answer:1}]);
    assert.equal(calls, 1);
    assert.equal(isIntrospectable(kind), true);
    assert.equal(dialectOf(kind), 'sqlite');
}
assert.equal(isIntrospectable('neon'), true);
assert.equal(dialectOf('neon'), 'postgres');
const selection = { provider_account_id:'account', database_id:'selected', account_id:'cf-account', project_ref:'project', project_id:'neon-project', db_id:'turso-db', db_name:'Turso', api_token:'PRIVATE_TOKEN', connection_uri:'PRIVATE_DSN' };
const serialized = serializeDatasource({id:'source',name:'Example',kind:'cloudflare',config:selection,created_at:'now',updated_at:'now'});
for (const key of ['provider_account_id','database_id','account_id','project_ref','project_id','db_id','db_name']) assert.equal(serialized[key], selection[key]);
assert.ok(!JSON.stringify(serialized).includes('PRIVATE'));
assert.deepEqual(resolveTurso({db_id:'second',db_name:'Second',databases:[{id:'first',url:'libsql://first',token:'first-key'},{id:'second',url:'libsql://second',token:'second-key'}]}),{url:'libsql://second',authToken:'second-key'});
console.log('Datasource selection, aliases, dialect and secret-redaction regressions passed');
