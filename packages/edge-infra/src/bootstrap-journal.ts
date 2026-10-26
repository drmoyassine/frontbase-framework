/** Durable bootstrap ownership in a fixed, initially empty SQLite/D1 coordinator.
 * Hosts must pin this coordinator independently of editable application bindings.
 * This module does not establish that provider-level anchor. It uses the existing DbRunner.
 * No provider credential or application migration is stored here. */
import type {DbRunner} from './providers/types.js';
import type {BootstrapContext,BootstrapJournal,BootstrapRecord} from '@frontbase/edge-core/deployment-bootstrap';
import {validateDeploymentManifest} from '@frontbase/edge-core/deployment';
const table='_frontbase_bootstrap';
const inventory="SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT IN ('_cf_METADATA','_frontbase_bootstrap') LIMIT 1";
const fail=():never=>{throw Error('bootstrap_state_refused');};
function identity(context:BootstrapContext):string {
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(context.installationId)||!['cloudflare','vercel','docker'].includes(context.target)||!context.destination||context.destination.length>256||!/^[A-Za-z0-9_./:-]+$/.test(context.destination))fail();
 return JSON.stringify([context.installationId,context.target,context.destination]);
}
function encode(context:BootstrapContext,next:BootstrapRecord,expected:number|null):string {
 if(next.installationId!==context.installationId||next.target!==context.target||next.destination!==context.destination||next.version!==1||next.revision!==(expected??-1)+1||!Number.isSafeInteger(next.revision)||next.revision<0||!['reviewed','applying','uncertain','active'].includes(next.phase)||!/^[a-f0-9]{64}$/.test(next.fingerprint)||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(next.operationId))fail();
 const result=validateDeploymentManifest(next.manifest);if(!result.ready||result.manifest.target!==context.target)fail();
 if(Object.keys(next).some(k=>!['installationId','target','destination','version','revision','operationId','phase','fingerprint','manifest'].includes(k)))fail();
 const value=JSON.stringify(next);if(new TextEncoder().encode(value).length>65536)fail();return value;
}
export function sqlBootstrapJournal(db:DbRunner,owner:BootstrapContext):BootstrapJournal {
 const key=identity(owner);if(db.dialect&&db.dialect!=='sqlite')fail();
 const check=(context:BootstrapContext)=>{if(identity(context)!==key)fail();};
 return {
  async read(context){check(context);const rows=await db.query('SELECT owner,revision,record FROM '+table+' WHERE singleton=1');if(rows.length!==1||rows[0]!.owner!==key)fail();const row=rows[0]!;if(row.revision===-1&&row.record===null)return null;if(typeof row.record!=='string')fail();const record=JSON.parse(row.record as string) as BootstrapRecord;encode(context,record,Number(row.revision)-1);if(record.revision!==row.revision)fail();return record;},
  async compareAndSwap(context,expected,next){check(context);if(expected!==null&&(!Number.isSafeInteger(expected)||expected<0))fail();const record=encode(context,next,expected);
   const rows=await db.query('UPDATE '+table+' SET revision=?,record=? WHERE singleton=1 AND owner=? AND revision=? RETURNING revision',[next.revision,record,key,expected??-1]);
   return rows.length===1&&rows[0]!.revision===next.revision;
  }
 };
}
/** Explicit owner-authorized admission only. Never call this just because application boot failed.
 * Existing application tables cause refusal before DDL. A singleton owner prevents two installations
 * from claiming the same database. Lost responses are recovered by reading the same owner. */
export async function admitBootstrapState(db:DbRunner,context:BootstrapContext):Promise<BootstrapJournal> {
 const owner=identity(context);if(db.dialect&&db.dialect!=='sqlite')fail();
 if((await db.query(inventory)).length)fail();
 await db.exec('CREATE TABLE IF NOT EXISTS '+table+' (singleton INTEGER PRIMARY KEY CHECK(singleton=1), owner TEXT NOT NULL, revision INTEGER NOT NULL, record TEXT)');
 // Recheck emptiness inside the claim statement, not only in a preceding request.
 await db.query('INSERT INTO '+table+' (singleton,owner,revision,record) SELECT 1,?,-1,NULL WHERE NOT EXISTS ('+inventory+') ON CONFLICT(singleton) DO NOTHING RETURNING singleton',[owner]);
 const journal=sqlBootstrapJournal(db,context);await journal.read(context);return journal;
}
