// Queue engine only, with an in-memory native adapter. No production APIs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ComposerQueue,queueDraft,queueTarget} from '../src/composer-queue.js';
const scope='web:test:fixture';
fs.mkdirSync(fileURLToPath(new URL('../.local/tests/',import.meta.url)),{recursive:true});
const draft=id=>({id,text:'消息 '+id,images:[],skill:null,params:{model:'a',effort:'high'},policy:{access:'read-only',approval:'manual'},createdAt:1});
function fixture(t){
 const prefix=fileURLToPath(new URL('../.local/tests/queue-test-',import.meta.url)),directory=fs.mkdtempSync(prefix);t.after(()=>{assert.ok(fs.realpathSync(directory).startsWith(prefix));fs.rmSync(directory,{recursive:true,force:true});});
 const file=path.join(directory,'queue.json'),events=[],sent=[],steered=[];let identity='account-a',busy=true,turnIds=['initial'],fail=false;
 const adapter={authorize:async()=>identity,snapshot:async()=>({busy,turnIds:[...turnIds],activeId:busy?'active':null}),send:async(target,item)=>{sent.push(item.id);if(fail)throw Error('response lost');},steer:async(target,item)=>{steered.push(item.id);if(fail)throw Error('response lost');}};
 const queue=new ComposerQueue(file,adapter,{emit:(...args)=>events.push(args)});
 return {file,adapter,queue,events,sent,steered,identity:value=>{identity=value;},busy:value=>{busy=value;},turn:value=>{turnIds.push(value);},fail:()=>{fail=true;},add:async(items)=>queue.update(scope,{revision:queue.public(scope).revision,items})};
}
test('persisted queue continues without a browser, in order, waiting for new native turn evidence',async t=>{
 const f=fixture(t);await f.add([draft('one'),draft('two')]);await f.queue.poll();assert.deepEqual(f.sent,[]);
 const restored=new ComposerQueue(f.file,f.adapter);f.busy(false);await restored.poll();assert.deepEqual(f.sent,['one']);
 await restored.poll();assert.deepEqual(f.sent,['one'],'stale idle state must not dispatch next item');
 f.turn('turn-one');f.busy(true);await restored.poll();assert.deepEqual(f.sent,['one']);
 f.busy(false);await restored.poll();assert.deepEqual(f.sent,['one','two']);assert.equal(restored.public(scope).items.length,0);
});
test('concurrent pages and scheduler cannot overwrite or send the same head twice',async t=>{
 const f=fixture(t);const results=await Promise.allSettled([f.queue.update(scope,{revision:0,items:[draft('one')]}),f.queue.update(scope,{revision:0,items:[draft('two')]})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 f.busy(false);await Promise.all([f.queue.poll(),f.queue.poll(),f.queue.poll()]);assert.equal(f.sent.length,1);assert.ok(f.events.length>=3);
});
test('uncertain native request pauses and needs an explicit retry; startup sending marker also pauses',async t=>{
 const f=fixture(t);await f.add([draft('one'),draft('two')]);f.busy(false);f.fail();await f.queue.poll();await f.queue.poll();assert.deepEqual(f.sent,['one']);assert.equal(f.queue.public(scope).items[0].status,'uncertain');
 await f.queue.update(scope,{action:'retry',id:'one'});assert.equal(f.queue.public(scope).items[0].status,'queued');
 const state=f.queue.state(scope);state.items[0].status='sending';f.queue.commit(scope,state);
 const restored=new ComposerQueue(f.file,f.adapter);await restored.poll();assert.equal(restored.public(scope).items[0].status,'uncertain');assert.deepEqual(f.sent,['one']);
});
test('failed queue storage after native acceptance pauses and never retries automatically',async t=>{
 const f=fixture(t);await f.add([draft('one')]);f.busy(false);const commit=f.queue.commit.bind(f.queue);f.queue.commit=(scope,state)=>{if(!state.items.length)throw Error('disk unavailable');return commit(scope,state);};
 await f.queue.poll();await f.queue.poll();assert.deepEqual(f.sent,['one']);assert.equal(f.queue.public(scope).items[0].status,'uncertain');
});
test('legacy import is idempotent after response loss, including already dispatched IDs',async t=>{
 const f=fixture(t);await f.queue.update(scope,{action:'import',items:[draft('one'),{...draft('two'),status:'sending'}]});
 await f.queue.update(scope,{action:'import',items:[draft('one')]});assert.equal(f.queue.public(scope).items.length,2);
 f.busy(false);await f.queue.poll();await f.queue.update(scope,{action:'import',items:[draft('one')]});assert.deepEqual(f.queue.public(scope).items.map(i=>i.id),['two']);assert.equal(f.queue.public(scope).items[0].status,'uncertain');
});
test('reorder, deletion and steering update server revision and preserve captured options',async t=>{
 const f=fixture(t);await f.add([draft('one'),draft('two'),draft('three')]);let state=f.queue.public(scope);
 await f.queue.update(scope,{revision:state.revision,items:[state.items[2],state.items[0]]});assert.deepEqual(f.queue.public(scope).items.map(i=>i.id),['three','one']);
 const beforeSteer=f.queue.public(scope).revision;await f.queue.update(scope,{action:'steer',id:'three'});assert.equal(f.queue.public(scope).revision,beforeSteer+2);assert.deepEqual(f.steered,['three']);assert.deepEqual(f.queue.public(scope).items.map(i=>i.id),['one']);assert.deepEqual(f.queue.public(scope).items[0].params,{model:'a',effort:'high'});
});
test('account change blocks background dispatch and queued mutations',async t=>{
 const f=fixture(t);await f.add([draft('one')]);f.identity('account-b');f.busy(false);await f.queue.poll();assert.deepEqual(f.sent,[]);assert.match(f.queue.public(scope).reason,/账号/);await assert.rejects(f.add([]),/账号/);
 f.identity('account-a');await f.queue.poll();assert.deepEqual(f.sent,['one']);
});
test('queue accepts only message data and defined model parameters',()=>{
 assert.equal(queueTarget('desktop:fixture').mode,'desktop');assert.throws(()=>queueTarget('../wrong'));
 assert.throws(()=>queueDraft({...draft('one'),params:{method:'arbitrary'}}));assert.throws(()=>queueDraft({...draft('one'),images:[{type:'image',url:'https://invalid.example/p.png'}]}));
 assert.throws(()=>queueDraft({...draft('one'),policy:{access:'other',approval:'manual'}}));
 assert.equal(queueDraft({...draft('one'),params:{collaborationMode:{mode:'plan',settings:{model:'a',reasoning_effort:'high'}}}}).params.collaborationMode.settings.developer_instructions,null);
});
test('dispatch publishes the draft before native execution and then its accepted turn',async t=>{
 const f=fixture(t);await f.add([draft('one')]);f.busy(false);
 f.adapter.send=async()=>{assert.equal(f.events.at(-1)[0],'composer-queue-dispatch');assert.equal(f.events.at(-1)[1].draft.text,'消息 one');return {turn:{id:'accepted',items:[]}};};
 await f.queue.poll();const sent=f.events.find(event=>event[0]==='composer-queue-sent')[1];
 assert.equal(sent.turn.id,'accepted');assert.equal(sent.draft.id,'one');
});
