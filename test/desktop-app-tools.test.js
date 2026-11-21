import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {AppToolsConnection,AppToolsDesktop,appToolsSnapshot} from '../adapters/desktop/app-tools.js';
import {limitedDesktop,desktopCommandSupported} from '../public/codex/desktop-capabilities.js';
import {principal} from '../adapters/desktop/desktop.js';

test('new desktop pipe frames requests, handles fragmented replies and never forwards arbitrary tools',async()=>{
 const calls=[];const server=net.createServer(socket=>{let buffer=Buffer.alloc(0);socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(buffer.length<4||buffer.length<4+buffer.readUInt32LE())return;const request=JSON.parse(buffer.subarray(4));calls.push(request);const body=Buffer.from(JSON.stringify({id:request.id,result:{success:true,contentItems:[{type:'inputText',text:'{"thread":{"id":"fixture"}}'}]}})),head=Buffer.alloc(4);head.writeUInt32LE(body.length);socket.write(head.subarray(0,2));setImmediate(()=>socket.end(Buffer.concat([head.subarray(2),body])));});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const connection=new AppToolsConnection({discover:()=> 'fixture-pipe',connect:()=>net.connect(server.address().port,'127.0.0.1')});
 try{const value=await connection.call('read_thread','fixture',{threadId:'fixture'});assert.equal(value.thread.id,'fixture');assert.equal(calls[0].params.namespace,'codex_app');assert.equal(calls[0].params.threadId,'fixture');await assert.rejects(connection.call('unsupported-fixture-operation','fixture',{}));assert.equal(calls.length,1);}finally{await new Promise(resolve=>server.close(resolve));}
});

function fixture(t,{busy=false,failSend=false,row={}}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-tools-'));fs.writeFileSync(path.join(directory,'auth.json'),JSON.stringify({tokens:{account_id:'fixture-account'}}));
 const calls=[],history={home:directory,list:()=>[{threadId:'fixture',verifiedPrincipal:principal(directory),...row}],read:async()=>({items:[{id:'message',type:'userMessage',text:'fixture',_turnId:'turn',_turnStatus:'completed'}]})};
 const connection={async call(tool,id,args){calls.push({tool,id,args});if(tool==='read_thread')return {thread:{id,hostId:'local',status:{type:busy?'active':'idle'},cwd:directory}};if(failSend)throw Error('connection lost');return {sent:true};}};
 const desktop=new AppToolsDesktop(history,{connection});t.after(()=>{desktop.close();fs.rmSync(directory,{recursive:true,force:true});});return {desktop,calls};
}
const message=(id='request-fixture')=>({requestId:id,turnStart:{request:{input:[{type:'text',text:'fixture text'}]}}});
test('idle text send preserves native settings, deduplicates concurrent requests and rejects reuse',async t=>{
 const {desktop,calls}=fixture(t);await Promise.all([desktop.control('fixture','send',message()),desktop.control('fixture','send',message())]);assert.equal(calls.filter(c=>c.tool==='send_message_to_thread').length,1);assert.deepEqual(calls.at(-1).args,{threadId:'fixture',hostId:'local',prompt:'fixture text'});const changed=message();changed.turnStart.request.input[0].text='changed';await assert.rejects(desktop.control('fixture','send',changed));
});
test('ambiguous native send never retries on repeated request',async t=>{
 const {desktop,calls}=fixture(t,{failSend:true});await assert.rejects(desktop.control('fixture','send',message()));await assert.rejects(desktop.control('fixture','send',message()));assert.equal(calls.filter(c=>c.tool==='send_message_to_thread').length,1);
});
test('busy, protected, mismatched and unverified chats cannot send',async t=>{
 for(const options of [{busy:true},{row:{protected:true}},{row:{accountMismatch:true}},{row:{verifiedPrincipal:'previous-account'}},{row:{verifiedPrincipal:null}}]){const {desktop,calls}=fixture(t,options);await assert.rejects(desktop.control('fixture','send',message()));assert.equal(calls.filter(c=>c.tool==='send_message_to_thread').length,0);}
});
test('unsupported controls and attachments are rejected before native calls',async t=>{
 const {desktop,calls}=fixture(t);for(const action of ['steer','interrupt','command','question','queue','settings','compact'])await assert.rejects(desktop.control('fixture',action,{}));const image=message();image.turnStart.request.input.push({type:'image',url:'fixture'});await assert.rejects(desktop.control('fixture','send',image));assert.equal(calls.length,0);
});
test('read-only snapshots keep history, carry capabilities and represent native activity',()=>{
 const state=appToolsSnapshot({thread:{status:{type:'active'}}},{items:[{id:'a',_turnId:'old',_turnStatus:'completed'}]});assert.equal(state.turns[0].items[0].id,'a');assert.equal(state.turns.at(-1).status,'inProgress');assert.equal(state.desktopCapabilities.approvals,false);assert.equal(limitedDesktop({mode:'desktop'},state.desktopCapabilities),true);for(const name of ['compact','model','skills','sketch'])assert.equal(desktopCommandSupported(name),false);
});
