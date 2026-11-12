import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {lastMessageEdit,replaceMessageText} from '../public/codex/message-edit-state.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-message-edit-'));
process.env.CODEX_WEB_DATA_DIR=path.join(root,'data');process.env.CODEX_WEB_WORKSPACE=path.join(root,'workspace');
fs.mkdirSync(path.join(root,'data/codex/default'),{recursive:true});fs.mkdirSync(path.join(root,'workspace'));
fs.writeFileSync(path.join(root,'data/codex/default/auth.json'),JSON.stringify({tokens:{account_id:'fixture-edit'}}));
const {createCodexWeb}=await import('../src/service.js');
const {fault}=await import('../src/storage.js');
const {ensureComposerQueue}=await import('../src/composer-queue-native.js');
const {replacedMessageTurns}=await import('../src/message-edit-history.js');
const auth={info:()=>({authenticated:true}),session:()=>({id:'fixture'}),requireSession(req){if(req.headers['x-fixture-session']!=='fixture')throw fault('login',401);return {id:'fixture'};},csrf(req){if(req.headers['x-csrf-token']!=='fixture')throw fault('csrf',403);}};
const service=await createCodexWeb({config:{codexBinary:process.execPath,codexArguments:[fileURLToPath(new URL('./fixture-engine.mjs',import.meta.url))],profiles:[{id:'default',provider:'chatgpt',cwd:path.join(root,'workspace')}]},save(){},auth});
const app=express();app.use(service.middleware);const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port+'/codex-api/v1';
const manager=service.context.codex;
async function request(method,url,body,{session=true,csrf=true}={}){
 const response=await fetch(base+url,{method,headers:{...(session?{'X-Fixture-Session':'fixture'}:{}),...(csrf?{'X-CSRF-Token':'fixture'}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,body:await response.json()};
}
async function seed(input=[{type:'text',text:'Original last message'}]){
 const {thread}=await manager.rpc('default','thread/start',{});
 await manager.rpc('default','turn/start',{threadId:thread.id,input:[{type:'text',text:'Earlier message'}]});await delay(20);
 await manager.rpc('default','turn/start',{threadId:thread.id,input});await delay(20);
 const scope='web:default:'+thread.id,preview=await request('GET','/message-edit?scope='+scope);
 assert.equal(preview.status,200,JSON.stringify(preview));
 assert.equal(preview.body.text,'Original last message');
 return {threadId:thread.id,scope,preview:preview.body,payload:{scope,turnId:preview.body.turnId,revision:preview.body.revision,requestId:crypto.randomUUID(),message:'Revised last message'}};
}
const read=async id=>(await manager.rpc('default','thread/read',{threadId:id,includeTurns:true})).thread;

test.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await service.close();fs.rmSync(root,{recursive:true,force:true});});

test('eligibility selects only the last terminal original user message',()=>{
 const turn={id:'last',status:'completed',items:[{id:'user',type:'userMessage',content:[{type:'text',text:'question'}]}]};
 assert.equal(lastMessageEdit([turn]).editable,true);
 for(const changed of [{...turn,status:'inProgress'},{...turn,items:[]},{...turn,items:[...turn.items,{type:'steered'}]},{...turn,items:[{...turn.items[0],_questionReply:true}]}])assert.equal(lastMessageEdit([changed]).editable,false);
 assert.equal(lastMessageEdit([turn,{id:'later',status:'completed',items:[]}]).editable,false);
 const context='# AGENTS.md instructions\n<INSTRUCTIONS>fixture</INSTRUCTIONS>';
 const input=[{type:'text',text:context},{type:'text',text:'old',text_elements:[{start:0}]},{type:'image',url:'data:image/png;base64,eA=='},{type:'skill',name:'fixture',path:'/fixture/skill'}];
 const updated=replaceMessageText(input,'new');assert.equal(updated[0].text,context);assert.equal(updated[1].text,'new');assert.deepEqual(updated.slice(2),input.slice(2));assert.deepEqual(updated[1].text_elements,[]);
});

test('web edit replaces the final turn, retains earlier context and attachments, and deduplicates requests',async()=>{
 const input=[{type:'text',text:'Original last message'},{type:'image',url:'data:image/png;base64,eA=='},{type:'skill',name:'fixture',path:'/fixture/skill'}];
 const f=await seed(input),before=await read(f.threadId),first=await request('POST','/message-edit',f.payload);
 assert.equal(first.status,200,JSON.stringify(first));await delay(20);
 const after=await read(f.threadId);assert.equal(after.turns.length,2);assert.deepEqual(after.turns[0],before.turns[0]);assert.notEqual(after.turns[1].id,before.turns[1].id);
 assert.equal(after.turns[1].items[0].content[0].text,'Revised last message');assert.deepEqual(after.turns[1].items[0].content.slice(1),input.slice(1));
 assert.deepEqual(replacedMessageTurns(f.scope),[before.turns[1].id]);
 assert.deepEqual(await request('POST','/message-edit',f.payload),first);assert.equal((await read(f.threadId)).turns.length,2);
 assert.equal((await request('POST','/message-edit',{...f.payload,requestId:crypto.randomUUID()})).status,409);
 assert.equal((await request('POST','/message-edit',{...f.payload,message:'different'})).status,409);
 assert.equal((await request('POST','/codex/default/rpc',{method:'thread/revert',params:{threadId:f.threadId,beforeTurnId:after.turns[0].id}})).status,403);
});

test('authentication, CSRF, stale revision, busy state, pending approvals and queued input prevent edits',async()=>{
 const f=await seed();
 assert.equal((await request('GET','/message-edit?scope='+f.scope,null,{session:false})).status,401);
 assert.equal((await request('POST','/message-edit',f.payload,{csrf:false})).status,403);
 assert.equal((await request('POST','/message-edit',{...f.payload,revision:'0'.repeat(64)})).status,409);
 const instance=manager.instances.get('default');instance.active.set(f.threadId,'active');assert.equal((await request('POST','/message-edit',f.payload)).status,409);instance.active.delete(f.threadId);
 instance.approvals.set('pending',{params:{threadId:f.threadId}});assert.equal((await request('POST','/message-edit',f.payload)).status,409);instance.approvals.delete('pending');
 const queue=ensureComposerQueue(service.context);queue.value.queues[f.scope]={revision:1,principal:manager.profileIdentity('default'),items:[{id:'waiting',status:'failed'}]};
 assert.equal((await request('POST','/message-edit',f.payload)).status,409);delete queue.value.queues[f.scope];
 const known=manager.profileHistory('default').get(f.threadId),owner=known.principal;known.principal='different-owner';assert.equal((await request('POST','/message-edit',f.payload)).status,409);known.principal=owner;
 assert.equal((await read(f.threadId)).turns.at(-1).id,f.preview.turnId);
});

test('an in-flight edit blocks ordinary sends and does not dispatch a second edit',async()=>{
 const f=await seed(),original=manager.call;let enter,release;
 const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
 manager.call=async function(instance,method,params,...rest){if(method==='thread/revert'&&params.threadId===f.threadId){enter();await gate;}return original.call(this,instance,method,params,...rest);};
 try{
  const first=request('POST','/message-edit',f.payload);await entered;
  assert.equal((await request('POST','/codex/default/rpc',{method:'turn/start',params:{threadId:f.threadId,input:[{type:'text',text:'racing send'}]}})).status,409);
  const duplicate=request('POST','/message-edit',f.payload);release();const results=await Promise.all([first,duplicate]);assert.deepEqual(results[0],results[1]);assert.equal(results[0].status,200);
 }finally{release();manager.call=original;}
});

test('a definite old-engine unknown-method error uses one legacy rollback',async()=>{
 await delay(20);const f=await seed(),original=manager.call,calls=[];
 manager.call=async function(instance,method,params,...rest){if(params?.threadId===f.threadId){calls.push(method);if(method==='thread/revert')throw fault('Unknown method thread/revert',400);}return original.call(this,instance,method,params,...rest);};
 try{assert.equal((await request('POST','/message-edit',f.payload)).status,200);assert.equal(calls.filter(m=>m==='thread/revert').length,1);assert.equal(calls.filter(m=>m==='thread/rollback').length,1);}
 finally{manager.call=original;}
});

test('a failed send after reverting never automatically retries and keeps a private recovery record',async()=>{
 await delay(20);const f=await seed(),original=manager.call;let starts=0;
 manager.call=async function(instance,method,params,...rest){if(params?.threadId===f.threadId&&method==='turn/start'){starts++;throw fault('fixture response lost',504);}return original.call(this,instance,method,params,...rest);};
 try{
  const result=await request('POST','/message-edit',f.payload);assert.equal(result.status,409);assert.match(result.body.error,/待确认/);
  assert.equal((await request('POST','/message-edit',f.payload)).status,409);assert.equal(starts,1);
  assert.equal((await read(f.threadId)).turns.length,1);assert.deepEqual(replacedMessageTurns(f.scope),[f.preview.turnId]);
  const {messageEditDirectory}=await import('../src/message-edit-history.js');const record=JSON.parse(fs.readFileSync(path.join(messageEditDirectory(f.scope),f.payload.requestId+'.json')));
  assert.equal(record.originalTurn.id,f.preview.turnId);assert.equal(record.status,'uncertain');
 }finally{manager.call=original;}
});
