import assert from 'node:assert/strict';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createInquiryForm } from '@frontbase/edge-core';
import { createSecretCipher } from '../dist/db/secret-cipher.js';
import { migrateUp } from '../dist/db/migrations.js';
import { createCompatApp } from '../dist/compat/app.js';
import { SyncStore } from '../dist/compat/sync-store.js';
import { Phase2Store } from '../dist/db/phase2-store.js';
import { LiveLayoutPublicationStore } from '../dist/compat/live-layout-publication.js';
import { renderLiveLayoutPublication } from '../dist/compat/live-layout-serving.js';

import { inquiryTickets, purgeExpiredInquiries } from '../dist/compat/inquiries.js';
import { snapshotWorkflow } from '../dist/compat/workflow-authoring.js';
import { deliverInquiry } from '../dist/compat/routes/inquiries.js';

export async function verifyPublishedInquiry({plan,options}) {
    const owner='inquiry-fixture', origin='https://live.example', path='/first/';
    const db=sqliteRunner(':memory:');
    await migrateUp(db);
    const cipher=await createSecretCipher('only-for-this-test');
    const store=new Phase2Store(db,owner,cipher), layoutStore=new LiveLayoutPublicationStore(db,owner);
    const workflowId=crypto.randomUUID(), now=()=>new Date().toISOString();
    const nodes=[
        {id:'submitted',type:'trigger',name:'Inquiry submitted',position:{x:0,y:0}},
        {id:'crm',type:'http_request',name:'CRM',position:{x:1,y:1},inputs:[
            {name:'url',value:'https://crm.example.test/inquiries',type:'string'},
            {name:'method',value:'POST',type:'string'},
        ]},
    ];
    const edges=[{id:'send',source:'submitted',target:'crm',sourceOutput:'payload',targetInput:'body'}];
    await store.upsertWorkflow({id:workflowId,name:'Receive inquiry',nodes:JSON.stringify(nodes),edges:JSON.stringify(edges),isActive:true},now());
    const row=await store.getWorkflow(workflowId);
    const version=await snapshotWorkflow(store,row,now(),'Local publication','fixture');
    await store.publishWorkflowIfVersion(workflowId,Number(row.version),now());
    // Later edits to the workflow draft cannot change the form's selected graph.
    await store.upsertWorkflow({id:workflowId,name:'Edited draft',nodes:JSON.stringify([nodes[0]]),edges:'[]',isActive:true},now());
    const form=createInquiryForm();
    form.submission.workflow={id:workflowId,versionId:version.id};
    const published=structuredClone(plan);
    published.templates.find(item=>item.role==='institution').layout.content.push({id:'ask-us',type:'Form',props:{publicFormDraft:form}});
    const revision=await layoutStore.prepare(published,now());
    await layoutStore.publish(revision,null,now());
    const render=(tenant,request,inquiry)=>renderLiveLayoutPublication(db,tenant,request,{...options,inquiry});
    async function getTicket(clock=Date.now) {
        const html=await (await render(owner,new Request(origin+path),inquiryTickets(cipher,clock))).text();
        assert.match(html,/<form[^>]+method="post"[^>]+action="\/api\/public\/inquiries"/);
        const token=html.match(/name="_ticket" value="([^"]+)"/)?.[1];
        assert.ok(token); return token;
    }
    const deliveries=[];
    let tenant=owner, destinationStatus=200, authenticated=false, delayDelivery;
    const datasource=await options.host.syncFor(owner).getDatasource(plan.configuration.datasourceId);
    await new SyncStore(db,owner,cipher).createDatasource({...datasource,name:'Fixture'},datasource.id,now());
    // A synthetic CRM destination owns its schema, matching rules, and outbound mail.
    await db.exec('CREATE TABLE fixture_contacts(email TEXT PRIMARY KEY, last_name TEXT)');
    for(const table of ['communications','tasks','mail_outbox'])
        await db.exec('CREATE TABLE fixture_'+table+'(inquiry_id TEXT PRIMARY KEY, contact_email TEXT, description TEXT)');
    const app=await createCompatApp({makeRunner:()=>db,sessionSecret:'only-for-this-test',now,
        requestTenant:async()=>tenant,resolvePrincipal:async()=>({tenant,user:authenticated?{role:'owner',id:'test'}:null}),
        externalFetch:async(input,init)=>{
        assert.equal(String(input),'https://crm.example.test/inquiries');
        if(delayDelivery) await delayDelivery;
        const {inquiry:event}=JSON.parse(init.body);
        deliveries.push(event);
        if(destinationStatus===200) {
            const effects={communications:event.fields.message,tasks:'Follow up on admission inquiry',mail_outbox:'Inquiry received'};
            await db.atomicWrite([
                {sql:'INSERT INTO fixture_contacts VALUES(?,?) ON CONFLICT(email) DO UPDATE SET last_name=excluded.last_name',params:[event.fields.email.toLowerCase(),event.fields.last_name]},
                ...Object.entries(effects).map(([table,description])=>({sql:'INSERT INTO fixture_'+table+' VALUES(?,?,?) ON CONFLICT(inquiry_id) DO NOTHING',params:[event.submissionId,event.fields.email,description]})),
            ]);
        }
        return new Response('fixture',{status:destinationStatus});
    }});
    const fields={first_name:'Test',last_name:'Student',email:'student@example.test',message:'Admission question',consent:'on'};
    const submit=(token,delta={},from=origin,ctx)=>app.request(origin+'/api/public/inquiries',{
        method:'POST',headers:{Origin:from},body:new URLSearchParams({...fields,_ticket:token,...delta}),
    },undefined,ctx);
    const ticket=await getTicket();
    const statuses=async()=>await db.query('SELECT workflow_status,encrypted_payload FROM public_inquiries WHERE tenant_slug=?',[owner]);
    assert.equal((await submit(ticket,{email:'invalid'})).status,422);
    assert.equal((await submit(ticket,{consent:''})).status,422);
    assert.equal((await submit(ticket,{owner:'wrong'})).status,422);
    assert.equal((await submit(ticket,{},'https://other.example')).status,403);
    tenant='another'; assert.equal((await submit(ticket)).status,409); tenant=owner;
    assert.equal((await submit(ticket+'junk')).status,409);
    assert.equal((await submit(await getTicket(()=>Date.now()-3600001))).status,409);
    assert.equal((await statuses()).length,0);
    const responses=await Promise.all([submit(ticket),submit(ticket)]);
    assert.deepEqual(responses.map(r=>r.status),[200,200]);
    assert.equal(deliveries.length,1);
    assert.equal(deliveries[0].source.recordId,'1');
    assert.equal(deliveries[0].source.collection,'institutions');
    assert.equal(deliveries[0].fields.message,fields.message);
    assert.equal((await statuses())[0].workflow_status,'completed');
    const history=await store.getExecution(deliveries[0].submissionId);
    assert.equal(history.status,'completed'); assert.equal(history.trigger,'inquiry.submitted');
    assert.doesNotMatch(JSON.stringify(history),/student@example|Admission|Test Student/);
    assert.doesNotMatch((await statuses())[0].encrypted_payload,/student@example|Admission/);
    assert.equal((await submit(ticket,{message:'different'})).status,409);
    let release,background;
    delayDelivery=new Promise(resolve=>{release=resolve;});
    try {
        const accepted=await submit(await getTicket(),{last_name:'Updated'},origin,{waitUntil:promise=>{background=promise;}});
        assert.equal(accepted.status,200);
        assert.ok(background,'Worker attaches follow-up to the request lifetime');
        assert.equal((await statuses()).filter(row=>row.workflow_status==='processing').length,1);
    } finally {release(); await background; delayDelivery=undefined;}
    assert.deepEqual(await db.query('SELECT last_name FROM fixture_contacts'),[{last_name:'Updated'}]);
    for(const table of ['communications','tasks','mail_outbox'])
        assert.equal((await db.query('SELECT inquiry_id FROM fixture_'+table)).length,2);
    destinationStatus=503;
    assert.equal((await submit(await getTicket())).status,200);
    assert.equal((await statuses()).filter(row=>row.workflow_status==='needs_review').length,1);
    const obsolete=await getTicket();
    const storeOnly=structuredClone(published);
    delete storeOnly.templates.find(item=>item.role==='institution').layout.content.at(-1).props.publicFormDraft.submission.workflow;
    const replacement=await layoutStore.prepare(storeOnly,now());
    await layoutStore.publish(replacement,{hash:revision,generation:1},now());
    assert.equal((await submit(obsolete)).status,409);
    assert.equal((await submit(await getTicket())).status,200);
    assert.equal((await statuses()).filter(row=>row.workflow_status==='recorded').length,1);
    assert.equal(deliveries.length,3);
    assert.equal((await app.request('/api/inquiries')).status,401);
    authenticated=true;
    assert.equal((await (await app.request('/api/inquiries?form=ask-us')).json()).inquiries.length,4);
    assert.equal((await (await app.request('/api/inquiries?form=other')).json()).inquiries.length,0);
    tenant='another'; assert.deepEqual((await (await app.request('/api/inquiries')).json()).inquiries,[]);
    await purgeExpiredInquiries(db,new Date(Date.now()+31*86400000).toISOString());
    assert.equal((await statuses()).length,0);
    const intake={id:'record',type:'inquiry_crm',inputs:[{name:'dataSource',value:'owned-source'}]};
    const mail={id:'confirm',type:'inquiry_confirmation'};
    const chain=[{source:'submitted',target:'record',sourceOutput:'output',targetInput:'input'},
        {source:'record',target:'confirm',sourceOutput:'output',targetInput:'input'}];
    const calls=[];
    let fresh=true;
    const actions={record:async(t,ds,event)=>{
        assert.equal(t,owner);assert.equal(ds,'owned-source');calls.push('crm');return fresh;
    },confirm:async(email,id)=>{assert.equal(email,fields.email);assert.ok(id);calls.push('mail');}};
    async function run(edges) {
        const pinned=await snapshotWorkflow(store,{...row,nodes:JSON.stringify([nodes[0],intake,mail]),edges:JSON.stringify(edges)},now(),'CRM','fixture');
        return deliverInquiry(store,{...deliveries[0],workflow:{id:workflowId,versionId:pinned.id}},()=>{throw Error('unexpected HTTP');},actions);
    }
    assert.equal(await run(chain),'completed');assert.deepEqual(calls,['crm','mail']);
    fresh=false;
    assert.equal(await run(chain),'needs_review');assert.deepEqual(calls,['crm','mail','crm']);
    assert.equal(await run([{...chain[0],targetInput:'dataSource'},chain[1]]),'needs_review');
    assert.equal(await run([chain[0],{...chain[1],source:'submitted'}]),'needs_review');
    assert.deepEqual(calls,['crm','mail','crm']);
    db.close();
    console.log('Published inquiry: render, validation, tenant isolation, concurrent retry, encrypted receipt, workflow success/failure and stale publication PASS');
}
