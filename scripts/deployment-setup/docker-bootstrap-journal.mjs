/** Docker bootstrap journal on an operator-mounted persistent directory. No Docker socket. */
import {mkdirSync,lstatSync,existsSync,readFileSync,writeFileSync,openSync,closeSync,fsyncSync,renameSync,unlinkSync,rmdirSync} from 'node:fs';
import {join,resolve,dirname,parse} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
function ancestors(path){for(let p=resolve(path);;p=dirname(p)){if(existsSync(p)&&(lstatSync(p).isSymbolicLink()||!lstatSync(p).isDirectory()))throw Error('bootstrap_volume_refused');if(p===parse(p).root)break;}}
export function dockerBootstrapJournal(directory){
 if(typeof directory!=='string'||resolve(directory)!==directory)throw Error('bootstrap_absolute_volume_required');
 ancestors(directory);mkdirSync(directory,{recursive:true,mode:0o700});
 const fileFor=c=>{if(c.target!=='docker'||!c.installationId||!c.destination)throw Error('bootstrap_target_refused');return join(directory,createHash('sha256').update(JSON.stringify([c.installationId,c.target,c.destination])).digest('hex')+'.json');};
 const read=c=>{ancestors(directory);const file=fileFor(c);if(!existsSync(file))return null;const stat=lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>65536)throw Error('bootstrap_journal_refused');return JSON.parse(readFileSync(file,'utf8'));};
 return {read:async c=>read(c),compareAndSwap:async(c,expected,next)=>{
  ancestors(directory);const file=fileFor(c),lock=file+'.lock';
  try{mkdirSync(lock,{mode:0o700});}catch{throw Error('bootstrap_locked_reconciliation_required');}
  let temp,fd;
  try{
   const current=read(c);if((current?.revision??null)!==expected)return false;
   if(next.revision!==(expected??-1)+1||next.installationId!==c.installationId||next.target!==c.target||next.destination!==c.destination)throw Error('bootstrap_journal_refused');
   const data=JSON.stringify(next);if(Buffer.byteLength(data)>65536)throw Error('bootstrap_journal_refused');
   temp=file+'.'+randomUUID()+'.tmp';fd=openSync(temp,'wx',0o600);writeFileSync(fd,data);fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temp,file);temp=undefined;return true;
  }finally{if(fd!==undefined)closeSync(fd);if(temp&&existsSync(temp))unlinkSync(temp);rmdirSync(lock);}
 }};
}
