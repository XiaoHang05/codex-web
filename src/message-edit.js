import path from 'node:path';
import {createHash} from 'node:crypto';
import {fault,readJson,writeJson} from './storage.js';
import {ensureComposerQueue} from './composer-queue-native.js';
import {queueTarget} from './composer-queue.js';
import {desktopTurns} from '../public/codex/desktop-turn-state.js';
import {lastMessageEdit,replaceMessageText} from '../public/codex/message-edit-state.js';
import {messageEditDirectory,recordMessageRevert} from './message-edit-history.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const id=value=>typeof value==='string'&&/^[-a-zA-Z0-9_]{1,80}$/.test(value);
async function inspect(ctx,queue,target){
 const identity=await queue.adapter.authorize(target);
 if(target.mode==='desktop'){
  queue.sharedQueue ||= await ctx.desktopAdapter.createQueue(ctx,queue);
  await queue.sharedQueue.read(target.scope);
 }
 if(queue.state(target.scope).items.length)throw fault('请先处理发送队列，再修改最后一条消息',409);
 const snapshot=await queue.adapter.snapshot(target);
 if(snapshot.busy)throw fault('请等待当前任务和审批结束，再修改消息',409);
 let turns;
 if(target.mode==='desktop')turns=desktopTurns(ctx.desktop.states.get(target.threadId));
 else turns=(await ctx.codex.rpc(target.profile,'thread/read',{threadId:target.threadId,includeTurns:true})).thread?.turns;
 const edit=lastMessageEdit(turns);
 if(!edit.editable)throw fault(edit.reason,409);
 const turn=turns.at(-1),item=(turn.items||[]).find(item=>item.type==='userMessage');
 const input=turn.params?.input||item.content||[{type:'text',text:item.text||''}];
 const revision=hash(JSON.stringify({identity,turnId:edit.turnId,input}));
 return {...edit,revision,identity,turn,input};
}

async function webEdit(ctx,target,current,message,submitted){
 const manager=ctx.codex,instance=await manager.start(target.profile);
 if(instance.active.has(target.threadId)||instance.turnStarting||instance.accountOperationBusy||instance.authPending||instance.sandboxSetupPending||instance.sandboxNeedsRestart)throw fault('实例状态已变化，请稍后重新修改',409);
 instance.messageEditBusy??=new Set();
 if(instance.messageEditBusy.has(target.threadId))throw fault('此消息正在修改',409);
 const input=replaceMessageText(current.input,message);
 instance.messageEditBusy.add(target.threadId);instance.turnStarting=(instance.turnStarting||0)+1;
 try{
  if(instance.profile.provider==='chatgpt'){
   const account=await manager.call(instance,'account/read',{refreshToken:false});
   if(account.account?.type!=='chatgpt')throw fault('请先登录当前 ChatGPT 账号',409);
  }
  if(!instance.loaded.has(target.threadId))await manager.rpcUnlocked(target.profile,'thread/resume',{threadId:target.threadId});
  // Recheck after any resume/configuration reads and before destructive history work.
  const check=(await manager.rpcUnlocked(target.profile,'thread/read',{threadId:target.threadId,includeTurns:true})).thread;
  const latest=lastMessageEdit(check?.turns);
  const requests=[...instance.approvals.values()].some(request=>request.params?.threadId===target.threadId);
  if(!latest.editable||latest.turnId!==current.turnId||instance.active.has(target.threadId)||requests)throw fault('会话状态已变化，请刷新后重新修改',409);
  submitted();
  try{await manager.call(instance,'thread/revert',{threadId:target.threadId,beforeTurnId:current.turnId});}
  catch(error){
   // Only a definite unknown-method response is safe to retry with the legacy API.
   if(!/unknown (?:method|request)|method (?:not found|not supported)|unsupported (?:method|request)/i.test(error.message))throw error;
   await manager.call(instance,'thread/rollback',{threadId:target.threadId,numTurns:1});
  }
  for(const [key,turn] of instance.streamReplies||[])if(turn.threadId===target.threadId&&turn.id===current.turnId)instance.streamReplies.delete(key);
  instance.turnSummaries?.delete(current.turnId);
  recordMessageRevert(ctx,target,current.turnId);
  // Do not expose either revert method through generic browser RPC.
  return manager.rpcUnlocked(target.profile,'turn/start',{threadId:target.threadId,input,turnTrigger:'edit_user_message'});
 }finally{instance.messageEditBusy.delete(target.threadId);instance.turnStarting--;}
}

export async function messageEditRoute(req,res,ctx){
 if(req.path!=='/api/message-edit')return false;
 if(!['GET','POST'].includes(req.method))throw fault('消息修改仅支持 GET 和 POST',405);
 const body=req.body||{},target=queueTarget(req.method==='GET'?req.query?.scope:body.scope),queue=ensureComposerQueue(ctx);
 return queue.lock(target.scope,async()=>{
  const identity=await queue.adapter.authorize(target);
  if(req.method==='GET'){
   const {turn,input,identity:owner,...preview}=await inspect(ctx,queue,target);res.json(preview);return true;
  }
  if(!id(body.requestId)||!id(body.turnId)||typeof body.revision!=='string'||!/^[a-f0-9]{64}$/.test(body.revision)||typeof body.message!=='string'||!body.message.trim()||body.message.length>200000)throw fault('无效的消息修改参数');
  const directory=messageEditDirectory(target.scope),file=path.join(directory,body.requestId+'.json'),latestFile=path.join(directory,'latest.json');
  const digest=hash(JSON.stringify({identity,...target,turnId:body.turnId,revision:body.revision,message:body.message}));
  const previous=readJson(file,null);
  if(previous){
   if(previous.digest!==digest)throw fault('修改请求编号已被使用',409);
   if(previous.status==='accepted'){res.json(previous.result);return true;}
   throw fault('上次修改结果待确认，请刷新聊天核对，未自动重试',409);
  }
  const pending=readJson(latestFile,null);
  if(pending?.turnId===body.turnId&&['submitted','uncertain'].includes(pending.status))throw fault('上次修改结果待确认，请刷新聊天核对，未自动重试',409);
  const current=await inspect(ctx,queue,target);
  if(current.turnId!==body.turnId||current.revision!==body.revision)throw fault('消息或会话状态已变化，请重新打开修改',409);
  if(body.message===current.text)throw fault('消息内容尚未修改');
  const receipt={requestId:body.requestId,scope:target.scope,turnId:current.turnId,digest,status:'saved',createdAt:new Date().toISOString(),originalTurn:current.turn};
  const save=status=>{receipt.status=status;writeJson(file,receipt);writeJson(latestFile,{requestId:body.requestId,turnId:current.turnId,status});};
  save('saved');
  try{
   let native;
   if(target.mode==='desktop'){
    if(!ctx.desktopAdapter.editLastMessage)throw fault('当前桌面适配器未提供消息修改能力',409);
    save('submitted');native=await ctx.desktopAdapter.editLastMessage(target.threadId,{turnId:current.turnId,message:body.message});recordMessageRevert(ctx,target,current.turnId);
   }else native=await webEdit(ctx,target,current,body.message,()=>save('submitted'));
   const result={ok:true,requestId:body.requestId,replacedTurnId:current.turnId,...(native?.turn?{turn:native.turn}:{})};
   receipt.result=result;save('accepted');
   res.json(result);return true;
  }catch(error){
   const uncertain=receipt.status==='submitted';save(uncertain?'uncertain':'rejected');
   if(uncertain)throw fault('修改结果待确认，请刷新聊天核对，未自动重试',409);
   throw error;
  }
 });
}
