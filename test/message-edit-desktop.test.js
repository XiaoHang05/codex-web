import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-desktop-edit-'));
process.env.CODEX_WEB_DATA_DIR=path.join(root,'data');process.env.CODEX_WEB_WORKSPACE=root;
fs.writeFileSync(path.join(root,'auth.json'),JSON.stringify({tokens:{account_id:'fixture-desktop'}}));
const {Desktop}=await import('../adapters/desktop/desktop.js');
const {editDesktopMessage}=await import('../adapters/desktop/message-edit.js');
const {messageEditRoute}=await import('../src/message-edit.js');
const {desktopHistoryPage}=await import('../adapters/desktop/desktop-history-pages.js');
const {recordMessageRevert}=await import('../src/message-edit-history.js');
const state=()=>({turns:[{turnId:'last-turn',status:'completed',params:{input:[{type:'text',text:'original'},{type:'image',url:'data:image/png;base64,eA=='}]},items:[{type:'userMessage',id:'user',content:[{type:'text',text:'original'}]}]}],threadRuntimeStatus:{type:'idle'},requests:[]});
function fixture(){
 const desktop=new Desktop({homeDirectory:root}),sent=[],events=[];let row={threadId:'fixture-desktop',protected:false};
 desktop.states.set(row.threadId,state());desktop.owners.set(row.threadId,'original-owner');desktop.clientId='fixture-client';desktop.connect=async()=>{};desktop.follow=async id=>{const state=desktop.states.get(id);desktop.emit('state',{threadId:id,state});return state;};
 desktop.send=message=>{
  sent.push(message);
  const result=Buffer.from(JSON.stringify({type:'response',requestId:message.requestId,resultType:'success',handledByClientId:'original-owner',result:{ok:true}}));
  const frame=Buffer.alloc(4+result.length);frame.writeUInt32LE(result.length);result.copy(frame,4);queueMicrotask(()=>desktop.consume(frame));
 };
 const ctx={desktop,history:{list:()=>[row],files:new Map()},codex:{emit:(...args)=>events.push(args)},preferences:{},desktopAdapter:{createQueue:async()=>({read:async()=>({items:[]}),close(){}}),editLastMessage:(id,params)=>editDesktopMessage(desktop,id,params)},emit(){}};
 const call=async(method,body)=>{let response;await messageEditRoute({path:'/api/message-edit',method,query:{scope:'desktop:fixture-desktop'},body},{json:value=>response=value},ctx);return response;};
 return {ctx,desktop,sent,events,call,row};
}
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
test('desktop edits use version 2 native owner IPC and preserve original attachments in the owner',async()=>{
 const f=fixture();try{
  const preview=await f.call('GET'),before=structuredClone(f.desktop.states.get('fixture-desktop'));
  const result=await f.call('POST',{scope:'desktop:fixture-desktop',turnId:preview.turnId,revision:preview.revision,requestId:'desktop-edit',message:'revised'});
  assert.equal(result.ok,true);assert.equal(f.sent.length,1);
  const message=f.sent[0];assert.equal(message.method,'thread-follower-edit-last-user-turn');assert.equal(message.version,2);assert.equal(message.targetClientId,'original-owner');
  assert.deepEqual(message.params,{conversationId:'fixture-desktop',turnId:'last-turn',message:'revised',allowEarlierMessages:false,shouldSendPermissionOverrides:false});
  assert.deepEqual(f.desktop.states.get('fixture-desktop'),before);
  assert.deepEqual(f.events[0],['message-edited',{scope:'desktop:fixture-desktop',replacedTurnId:'last-turn'}]);
 }finally{f.ctx.codex.composerQueue.close();}
});
test('desktop protection, account mismatch, stale turns and approvals reject without sending native control',async()=>{
 const f=fixture();try{
  for(const [patch,status]of [[{protected:true},403],[{accountMismatch:true},409]]){
   Object.assign(f.row,patch);await assert.rejects(f.call('GET'),error=>error.status===status);Object.assign(f.row,{protected:false,accountMismatch:false});
  }
  await assert.rejects(editDesktopMessage(f.desktop,'fixture-desktop',{turnId:'older-turn',message:'wrong'}));
  f.desktop.states.get('fixture-desktop').requests=[{id:'approval'}];
  await assert.rejects(editDesktopMessage(f.desktop,'fixture-desktop',{turnId:'last-turn',message:'wrong'}));
  assert.equal(f.sent.length,0);
 }finally{f.ctx.codex.composerQueue.close();}
});
test('replaced desktop turns cannot return through cached raw history pages',async()=>{
 const file=path.join(root,'history.jsonl'),rows=[];
 for(const [turn,text]of [['earlier','keep'],['removed','discard']])rows.push(
  {type:'event_msg',payload:{type:'task_started',turn_id:turn}},
  {type:'response_item',payload:{id:'user-'+turn,type:'message',role:'user',content:[{type:'input_text',text}]}},
  {type:'event_msg',payload:{type:'task_complete',turn_id:turn}},
 );
 fs.writeFileSync(file,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
 const history={files:new Map([['history-fixture',file]]),list(){}};
 assert.equal((await desktopHistoryPage(history,'history-fixture',{})).items.length,2);
 recordMessageRevert({codex:{emit(){}}},{scope:'desktop:history-fixture'},'removed');
 const result=await desktopHistoryPage(history,'history-fixture',{});assert.equal(result.items.length,1);assert.equal(result.items[0].text,'keep');
});
