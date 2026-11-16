import {inlinePgParams,type DbRunner} from '@frontbase/edge-infra';

/** Coalesce independent, compiler-owned SELECTs through the existing runner.
 * The queue lasts one microtask; identical reads share results only within this request.
 * A new request creates a new batcher. It never accepts browser SQL.
 * Other dialects retain their adapter's ordinary query implementation. */
export function liveQueryBatch(runner:DbRunner):(sql:string,params?:unknown[])=>Promise<Record<string,unknown>[]> {
    if(runner.dialect!=='postgres')return (sql,params)=>runner.query(sql,params);
    type Read={sql:string;params:unknown[];resolve:(rows:Record<string,unknown>[])=>void;reject:(reason:unknown)=>void};
    let pending:Read[]=[];
    const flush=async()=>{
        const reads=pending;pending=[];
        try{
            if(reads.length===1){reads[0]!.resolve(await runner.query(reads[0]!.sql,reads[0]!.params));return;}
            const sql=reads.map((read,index)=>`SELECT ${index} AS "__fb_batch", COALESCE(jsonb_agg(to_jsonb(fb_row)), '[]'::jsonb) AS "__fb_rows" FROM (${inlinePgParams(read.sql,read.params)}) fb_row`).join(' UNION ALL ');
            const rows=await runner.query(sql);
            if(rows.length!==reads.length)throw Error('live_batch_response_invalid');
            const results=new Map<number,Record<string,unknown>[]>();
            for(const row of rows){
                const index=row.__fb_batch,value=row.__fb_rows;
                if(!Number.isSafeInteger(index)||Number(index)<0||Number(index)>=reads.length||results.has(Number(index))||!Array.isArray(value)||value.some(item=>!item||typeof item!=='object'||Array.isArray(item)))throw Error('live_batch_response_invalid');
                results.set(Number(index),value);
            }
            reads.forEach((read,index)=>read.resolve(results.get(index)!));
        }catch(error){reads.forEach(read=>read.reject(error));}
    };
    const execute=(sql:string,params:unknown[]=[]):Promise<Record<string,unknown>[]>=>{
        // Bound every batch; a single overflowing read keeps the adapter path.
        if(pending.length>=16)return runner.query(sql,params);
        return new Promise((resolve,reject)=>{
            pending.push({sql,params,resolve,reject});
            if(pending.length===1)queueMicrotask(()=>{void flush();});
        });
    };
    // Use the compiled SQL, not object insertion order or irrelevant pagination
    // parameters. The directory resolver and list hydration can request the same
    // count/list; each must still run parameter and tenant validation upstream.
    const reads=new Map<string,Promise<Record<string,unknown>[]>>();
    return (sql,params=[])=>{
        const key=JSON.stringify([sql,params]);
        let result=reads.get(key);
        if(!result){result=execute(sql,params);reads.set(key,result);}
        return result;
    };
}
