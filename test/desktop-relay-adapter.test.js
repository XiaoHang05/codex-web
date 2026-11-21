import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {discoverRelay,RelayConnection} from '../adapters/desktop/relay-client.js';
import {RelayDesktop,RelayComposerQueue,relaySnapshot} from '../adapters/desktop/relay-desktop.js';
import {principal} from '../adapters/desktop/desktop.js';

test('relay discovery validates native home, private pipe format and live PIDs',()=>{
 const home=path.resolve('fixture-home'),descriptor={format:1,home,pipe:'\\\\.\\pipe\\codex-web-desktop-relay-'+randomUUID(),token:'fixture-'.repeat(8),relayPid:1,nativePid:2};
 const discover=value=>discoverRelay(home,{read:()=>JSON.stringify(value),isAlive:()=>true});assert.equal(discover(descriptor).pipe,descriptor.pipe);
 for(const patch of [{home:path.resolve('other-home')},{pipe:'\\\\.\\pipe\\unrelated'},{token:'short'},{relayPid:-1},{format:2}])assert.equal(discover({...descriptor,...patch}),null);
 assert.equal(discoverRelay(home,{read:()=>JSON.stringify(descriptor),isAlive:()=>false}),null);
});
test('relay client handles fragmented authenticated replies and rejects arbitrary operations',async()=>{
 let count=0;const server=net.createServer(socket=>{let buffer=Buffer.alloc(0);socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(buffer.length<4||buffer.length<buffer.readUInt32LE()+4)return;const request=JSON.parse(buffer.subarray(4));assert.equal(request.token,'fixture-private-token');count++;const bytes=Buffer.from(JSON.stringify({id:request.id,result:{connected:true}})),header=Buffer.alloc(4);header.writeUInt32LE(bytes.length);socket.write(header.subarray(0,1));setImmediate(()=>socket.end(Buffer.concat([header.subarray(1),bytes])));});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const client=new RelayConnection('unused',{discover:()=>({pipe:'fixture',token:'fixture-private-token'}),connect:()=>net.connect(server.address().port,'127.0.0.1')});
 try{assert.equal(client.connected,false);assert.equal((await client.call('status')).connected,true);assert.equal(client.connected,true);for(const action of ['skills','mcp','account','limits','usage'])assert.equal((await client.call(action)).connected,true);await assert.rejects(client.call('unrelated-fixture-op'));await assert.rejects(client.call('read'));assert.equal(count,6);}finally{await new Promise(resolve=>server.close(resolve));}
});
function fixture(t,{running=false,pending=[],row={},queueRows=[]}={}){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'relay-adapter-'));fs.writeFileSync(path.join(home,'auth.json'),JSON.stringify({tokens:{account_id:'fixture-account'}}));
 const calls=[],history={home,list:()=>[{threadId:'fixture',verifiedPrincipal:principal(home),...row}]};const connection={async call(action,id,params){calls.push({action,id,params});if(action==='read')return {thread:{id,model:'fixture-model',reasoningEffort:'high',cwd:home,status:{type:running?'active':'idle'},turns:[{id:'turn',status:running?'inProgress':'completed',items:[]}]},pendingRequests:pending,threadSettings:{approvalPolicy:'never'}};if(action==='queueRead')return {data:queueRows};if(action==='queueStart'){queueRows.splice(queueRows.findIndex(item=>item.id===params.queuedSubmissionId),1);return {turn:{id:'queued-turn'}};}if(action==='queueAdd'){const added={id:'native-added',clientUserMessageId:params.clientUserMessageId,input:params.input};queueRows.push(added);return {queuedSubmission:added};}return {applied:true};}};
 const desktop=new RelayDesktop(history,{connection});t.after(()=>{desktop.close();fs.rmSync(home,{recursive:true,force:true});});return {desktop,calls,connection,queueRows};
}
test('native snapshots preserve pending approvals and actual model/settings',async t=>{
 const {desktop}=fixture(t,{pending:[{id:'approve-1',method:'item/fileChange/requestApproval',params:{threadId:'fixture'}}]});const state=await desktop.follow('fixture',{background:true});assert.equal(desktop.socket.writable,true);assert.equal(state.latestModel,'fixture-model');assert.equal(state.latestReasoningEffort,'high');assert.equal(state.latestThreadSettings.approvalPolicy,'never');assert.equal(state.requests[0].id,'approve-1');assert.equal(state.desktopCapabilities.interrupt,true);assert.equal(state.desktopCapabilities.edit,false);
 assert.throws(()=>relaySnapshot({thread:{id:'fixture'}}));
});
test('relay controls map images, active turn IDs and native settings without resume',async t=>{
 const idle=fixture(t);await idle.desktop.control('fixture','send',{requestId:'fixture-request',turnStart:{request:{input:[{type:'text',text:'hello'},{type:'image',url:'data:image/png;base64,AAAA'}],model:'fixture-model'}}});assert.equal(idle.calls.at(-1).action,'send');assert.equal(idle.calls.at(-1).params.requestId,'fixture-request');assert.equal(idle.calls.at(-1).params.input[1].type,'image');
 await idle.desktop.control('fixture','settings',{effort:'low'});assert.equal(idle.calls.at(-1).action,'settings');assert.equal(idle.calls.at(-1).params.effort,'low');
 await idle.desktop.control('fixture','settings',{policy:{access:'workspace-write',approval:'manual'}});assert.equal(idle.calls.at(-1).params.sandboxPolicy.type,'workspaceWrite');assert.equal(Object.hasOwn(idle.calls.at(-1).params,'permissions'),false);
 const busy=fixture(t,{running:true});await busy.desktop.control('fixture','steer',{input:[{type:'text',text:'more'}],expectedTurnId:'turn',requestId:'steer-request'});assert.equal(busy.calls.at(-1).params.expectedTurnId,'turn');await busy.desktop.control('fixture','interrupt',{expectedTurnId:'turn'});assert.deepEqual(busy.calls.at(-1).params,{turnId:'turn'});await assert.rejects(busy.desktop.control('fixture','interrupt',{expectedTurnId:'stale'}));await assert.rejects(busy.desktop.control('fixture','send',{turnStart:{request:{input:[]}}}));assert.equal(busy.calls.some(call=>call.action==='resume'),false);
});
test('protected, stale-account and unknown-creator writes never reach the relay',async t=>{
 for(const row of [{protected:true},{verifiedPrincipal:'different-account'},{verifiedPrincipal:null},{conflict:true}]){const {desktop,calls}=fixture(t,{row});await assert.rejects(desktop.control('fixture','send',{}));assert.equal(calls.length,0);}
});
test('approval replies use pending native IDs, reject resolved/mismatched requests and preserve decision shape',async t=>{
 const {desktop,calls}=fixture(t,{pending:[{id:12,method:'item/commandExecution/requestApproval',params:{threadId:'fixture'}}]});await desktop.control('fixture','command',{requestId:12,decision:'decline'});assert.deepEqual(calls.at(-1),{action:'answer',id:'fixture',params:{requestId:12,kind:'command',response:{decision:'decline'}}});await assert.rejects(desktop.control('fixture','file',{requestId:12,decision:'accept'}));await assert.rejects(desktop.control('fixture','command',{requestId:13,decision:'accept'}));
});
test('shared queue reflects native rows and starts only a user-selected existing ID',async t=>{
 const {desktop,calls}=fixture(t,{queueRows:[{id:'native-1',clientUserMessageId:'client-1',input:[{type:'text',text:'saved'}]}]});const queue=new RelayComposerQueue({desktop},{lock:async(_scope,run)=>run()});const state=await queue.read('desktop:fixture');assert.equal(state.items[0].text,'saved');assert.equal(state.nativeShared,true);await assert.rejects(queue.update('desktop:fixture',{action:'import',items:[]}));await assert.rejects(queue.update('desktop:fixture',{action:'start',id:'missing'}));const after=await queue.update('desktop:fixture',{action:'start',id:'native-1'});assert.deepEqual(after.items,[]);assert.equal(calls.filter(call=>call.action==='queueStart').length,1);
});
test('queue add never dispatches automatically and preserves native request identity',async t=>{
 const {desktop,calls}=fixture(t);const queue=new RelayComposerQueue({desktop},{lock:async(_scope,run)=>run()}),state=await queue.read('desktop:fixture');await queue.update('desktop:fixture',{revision:state.revision,items:[{id:'new-draft',text:'queued',images:[],params:{},policy:{access:'workspace-write',approval:'automatic'},createdAt:1}]});const added=calls.find(call=>call.action==='queueAdd');assert.equal(added.params.requestId,'new-draft');assert.equal(added.params.clientUserMessageId,'new-draft');assert.equal(calls.some(call=>call.action==='queueStart'),false);
});
test('native-only attachments remain untouched when appending another message',async t=>{
 const {desktop,calls}=fixture(t,{queueRows:[{id:'native-local-image',clientUserMessageId:'local-image-client',input:[{type:'localImage',path:'fixture-image.png'}]}]});const queue=new RelayComposerQueue({desktop},{lock:async(_scope,run)=>run()}),state=await queue.read('desktop:fixture');assert.equal(state.items[0].nativeInputUnsupported,true);await queue.update('desktop:fixture',{revision:state.revision,items:[...state.items,{id:'extra-draft',text:'extra',images:[],params:{},policy:{access:'workspace-write',approval:'automatic'}}]});assert.equal(calls.filter(call=>call.action==='queueAdd').length,1);assert.equal(calls.some(call=>call.action==='queueUpdate'),false);const latest=await queue.read('desktop:fixture');await assert.rejects(queue.update('desktop:fixture',{revision:latest.revision,items:latest.items.map(item=>item.id==='native-local-image'?{...item,text:'changed'}:item)}));
});
