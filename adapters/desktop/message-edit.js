import {Desktop,principal,interruptEditingTurn} from './desktop.js';
import {setTimeout as delay} from 'node:timers/promises';
import {desktopReadOnly} from './desktop-access.js';
import {threadPrincipals} from '../../src/account-identity.js';
import {desktopTurns} from '../../public/codex/desktop-turn-state.js';
import {lastMessageEdit} from '../../public/codex/message-edit-state.js';
import {fault} from '../../src/storage.js';

export async function editDesktopMessage(desktop,threadId,{turnId,message,interruptRunning=false}){
 if(desktopReadOnly(threadId))throw fault('此聊天只读',403);
 const creator=threadPrincipals(desktop.accountHome).get(threadId);
 if(creator&&creator!==principal(desktop.accountHome))throw fault('请切换回聊天所属账号',409);
 desktop.messageEditBusy??=new Set();
 if(desktop.messageEditBusy.has(threadId))throw fault('此消息正在修改',409);
 desktop.messageEditBusy.add(threadId);
 try{
 await desktop.follow(threadId);
 let state=desktop.states.get(threadId),latest=lastMessageEdit(desktopTurns(state),{allowRunning:interruptRunning});
 if(!latest.editable||latest.turnId!==turnId||(state?.requests||[]).some(request=>request.completed!==true&&request.request?.completed!==true))throw fault('会话状态已变化，请刷新后重新修改',409);
 const originalText=latest.text;
 if(latest.running){
  await interruptEditingTurn(desktop,threadId,turnId);
  const deadline=Date.now()+10000;
  while(true){
   await desktop.follow(threadId);
   state=desktop.states.get(threadId);latest=lastMessageEdit(desktopTurns(state),{allowRunning:true});
   if(!latest.editable||latest.turnId!==turnId||latest.text!==originalText||(state?.requests||[]).some(r=>r.completed!==true&&r.request?.completed!==true))throw fault('停止期间消息已变化，未重新生成',409);
   if(!latest.running&&!['active','running','inProgress','busy'].includes(state?.threadRuntimeStatus?.type))break;
   if(Date.now()>=deadline)throw fault('当前生成尚未确认停止，未重新生成',409);
   await delay(100);
  }
 }
 if(['active','running','inProgress','busy'].includes(state?.threadRuntimeStatus?.type))throw fault('会话仍在执行，请稍后重试',409);
 // Reuse the existing socket and owner, with this release's explicit protocol list.
 // The host's already-running Desktop object can predate this new operation.
 return await Desktop.prototype.request.call(desktop,'thread-follower-edit-last-user-turn',{
  conversationId:threadId,turnId,message,allowEarlierMessages:false,shouldSendPermissionOverrides:false,
 },true,desktop.owners.get(threadId));
 }finally{desktop.messageEditBusy.delete(threadId);}
}
