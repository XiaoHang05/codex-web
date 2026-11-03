import fs from 'node:fs';
import path from 'node:path';
import {fault} from '../../src/storage.js';
import {queueDraft,queueTarget} from '../../src/composer-queue.js';

// The App owns persistence and execution. This module only mirrors its queue;
// it never writes App storage or dispatches queued turns itself.
export function nativeQueuedMessage(draft,cwd,state={}){
 const prompt=draft.skill?`$${draft.skill.name}\n${draft.text}`:draft.text;
 const model=draft.params.model||state.latestModel;
 const collaborationMode=draft.params.collaborationMode||(model?{mode:state.latestCollaborationMode?.mode||state.latestThreadSettings?.collaborationMode?.mode||'default',settings:{model,reasoning_effort:draft.params.effort??state.latestReasoningEffort??null,developer_instructions:null}}:undefined);
 return {id:draft.id,text:draft.text,cwd,createdAt:draft.createdAt,
  context:{prompt,addedFiles:[],fileAttachments:draft.skill?[{path:draft.skill.path,label:draft.skill.name}]:[],ideContext:null,imageAttachments:draft.images.map((image,index)=>({id:`${draft.id}-${index}`,src:image.url,filename:`image-${index+1}.png`})),workspaceRoots:[cwd],commentAttachments:[],mcpAppModelContextAttachments:[]},
  submissionOptions:{executionHostId:'local',collaborationMode,serviceTier:draft.params.serviceTier??null,usePermissionSelection:true,permissionSelection:{kind:'profile',profileId:{'read-only':':read-only','workspace-write':':workspace','full-access':':danger-full-access'}[draft.policy.access]}},
  requiresExistingOwner:true,webComposerDraft:draft};
}
export function webQueuedMessage(message){
 const saved=message.webComposerDraft;
 const status=message.submission?.status==='sending'?'sending':message.submission?.status==='outcome-unknown'?'uncertain':message.pausedReason?'failed':'queued';
 return {...saved,id:message.id,text:message.text??message.context?.prompt??'',images:saved?.images||message.context?.imageAttachments?.filter(i=>i.src?.startsWith('data:image/')).map(i=>({type:'image',url:i.src}))||[],skill:saved?.skill||null,params:saved?.params||{},policy:saved?.policy||{access:'workspace-write',approval:'automatic'},createdAt:message.createdAt||0,status,...message.pausedReason?{error:message.pausedReason}:{}};
}
export class DesktopComposerQueue{
 constructor(ctx,queue,{readState}={}){
  this.ctx=ctx;this.queue=queue;this.watched=new Set();
  this.readState=readState||(()=>{const raw=JSON.parse(fs.readFileSync(path.join(ctx.desktop.accountHome,'.codex-global-state.json'),'utf8'));return raw['queued-follow-ups']||{};});
  this.onChange=({threadId})=>{const scope=`desktop:${threadId}`;if(this.watched.has(scope))void queue.lock(scope,()=>this.read(scope)).catch(()=>{});};
  ctx.desktop.on('queue',this.onChange);
  this.timer=setInterval(()=>{for(const scope of this.watched)void queue.lock(scope,()=>this.read(scope)).catch(()=>{});},2000);this.timer.unref();
 }
 close(){clearInterval(this.timer);this.ctx.desktop.removeListener('queue',this.onChange);}
 messages(threadId){const messages=this.readState()[threadId]||[];if(!Array.isArray(messages))throw fault('App 队列格式无法识别',502);return structuredClone(messages);}
 async read(scope){
  const target=queueTarget(scope),identity=await this.queue.adapter.authorize(target),state=this.queue.state(scope);
  if(state.items.length&&state.principal&&state.principal!==identity)throw fault('队列属于之前的账号',409);
  this.watched.add(scope);
  if(!state.nativeShared&&state.items.length)return this.queue.public(scope);
  const messages=this.messages(target.threadId),items=messages.map(webQueuedMessage);
  for(const item of state.nativeTransfer||[])if(!items.some(i=>i.id===item.id))items.push({...item,status:'uncertain',error:'迁入 App 的结果待确认；请先检查聊天记录'});
  const transfer=(state.nativeTransfer||[]).filter(i=>!messages.some(m=>m.id===i.id));
  const next={...state,nativeShared:true,items,nativeTransfer:transfer,principal:identity,wait:null};delete next.reason;
  if(JSON.stringify(state.items)!==JSON.stringify(items)||JSON.stringify(state.nativeTransfer||[])!==JSON.stringify(transfer)||!state.nativeShared)return this.queue.commit(scope,next);
  return this.queue.public(scope);
 }
 async write(target,messages,discardedMessageIds=[]){
  await this.queue.adapter.authorize(target);
  return this.ctx.desktop.queueControl(target.threadId,'queue',{state:{[target.threadId]:messages},discardedMessageIds});
 }
 async migrate(scope){
  const target=queueTarget(scope),state=this.queue.state(scope);if(state.nativeShared||!state.items.length)return;
  const identity=await this.queue.adapter.authorize(target);if(identity!==state.principal)throw fault('队列属于之前的账号',409);
  await this.ctx.desktop.follow(target.threadId,{background:true});
  const native=this.messages(target.threadId),ids=new Set(native.map(i=>i.id));
  const pending=state.items.filter(i=>!ids.has(i.id));
  // Persist the ownership handoff before IPC. On an ambiguous response no local
  // dispatcher can retry these messages; App keeps the original message IDs.
  const ready=pending.filter(i=>i.status==='queued');
  const conversation=this.ctx.desktop.states.get(target.threadId),cwd=conversation?.cwd;
  if(ready.length&&!cwd)throw fault('等待 App 工作目录同步',409);
  state.nativeShared=true;state.nativeTransfer=pending;this.queue.commit(scope,state);
  if(ready.length){
   await this.write(target,[...native,...ready.map(i=>nativeQueuedMessage(i,cwd,conversation))]);
   const committed=this.queue.state(scope);committed.nativeTransfer=pending.filter(i=>i.status!=='queued');this.queue.commit(scope,committed);
  }
  await this.read(scope);
 }
 async update(scope,body){
  return this.queue.lock(scope,async()=>{
   await this.migrate(scope);await this.read(scope);
   const target=queueTarget(scope),state=this.queue.state(scope),{action,id,revision}=body;
   if(state.nativeTransfer?.length){
    // Unconfirmed transfers can be discarded explicitly, but cannot be
    // automatically restored into the App queue by a stale browser snapshot.
    const pendingIds=new Set(state.nativeTransfer.map(i=>i.id));
    if(action===undefined&&revision===state.revision&&Array.isArray(body.items)){
     const incoming=body.items.map(queueDraft),keptIds=new Set(incoming.map(i=>i.id));
     const nativeIds=state.items.filter(i=>!pendingIds.has(i.id)).map(i=>i.id);
     if(JSON.stringify(incoming.filter(i=>!pendingIds.has(i.id)).map(i=>i.id))===JSON.stringify(nativeIds)&&incoming.every(i=>state.items.some(m=>m.id===i.id))){
      state.nativeTransfer=state.nativeTransfer.filter(i=>keptIds.has(i.id));this.queue.commit(scope,state);return this.read(scope);
     }
    }
    throw fault('请先核对 App 聊天记录，再删除待确认消息或重新发送',409);
   }
   const native=this.messages(target.threadId),existing=new Map(native.map(m=>[m.id,m]));
   // Refresh before every mutation to reject edits based on an older App queue.
   if(JSON.stringify(native.map(webQueuedMessage))!==JSON.stringify(state.items)) {await this.read(scope);throw fault('App 队列已更新，请重试',409);}
   if(action==='steer'){
    const message=existing.get(id);if(!message||message.submission?.status==='sending'||message.submission?.status==='outcome-unknown')throw fault('队列已变化',409);
    const snapshot=await this.queue.adapter.snapshot(target);if(!snapshot.activeId)throw fault('当前没有运行中的轮次',409);
    // Remove from the automatic queue before steering, preventing idle dispatch.
    await this.ctx.desktop.queueControl(target.threadId,'removeQueued',{messageId:id});
    try{await this.queue.adapter.steer(target,webQueuedMessage(message),snapshot.activeId);}catch(error){const saved=this.queue.state(scope);saved.nativeTransfer=[{...webQueuedMessage(message),status:'uncertain'}];this.queue.commit(scope,saved);throw error;}
   }else if(action==='retry'){
    const message=existing.get(id);if(!message||!message.pausedReason||message.submission?.status==='outcome-unknown')throw fault('请在 App 中确认这条消息的发送结果',409);
    const resumed={...message};delete resumed.pausedReason;
    await this.write(target,native.map(m=>m.id===id?resumed:m));
   }else{
    if(action!==undefined&&action!=='import')throw fault('未知队列操作');
    if(!Array.isArray(body.items)||body.items.length>100)throw fault('队列最多保存 100 条');
    const incoming=body.items.map(queueDraft);if(new Set(incoming.map(i=>i.id)).size!==incoming.length)throw fault('重复的队列消息');
    if(action!=='import'&&revision!==state.revision)throw fault('队列已更新，请重试',409);
    await this.ctx.desktop.follow(target.threadId,{background:true});const conversation=this.ctx.desktop.states.get(target.threadId),cwd=conversation?.cwd;if(!cwd)throw fault('等待 App 工作目录同步',409);
    const fresh=incoming.filter(i=>!existing.has(i.id)&&(action!=='import'||!state.seen.includes(i.id)));
    for(const item of fresh)if(state.seen.includes(item.id))throw fault('该消息已处理，请刷新队列',409);
    const messages=action==='import'?[...native,...fresh.map(i=>nativeQueuedMessage(i,cwd,conversation))]:incoming.map(i=>existing.get(i.id)||nativeQueuedMessage(i,cwd,conversation));
    if(native.some(m=>m.submission?.status==='sending'&&!messages.some(i=>i.id===m.id)))throw fault('消息正在发送，请稍后操作',409);
    if(JSON.stringify(messages).length>24*1024*1024)throw fault('排队图片过大',413);
    // Compare again after follow/discovery, which can yield while App edits.
    if(JSON.stringify(this.messages(target.threadId))!==JSON.stringify(native))throw fault('App 队列已更新，请重试',409);
    const staged=this.queue.state(scope);staged.nativeTransfer=fresh;staged.seen=[...new Set([...staged.seen,...fresh.map(i=>i.id)])];this.queue.commit(scope,staged);
    try{await this.write(target,messages,native.filter(m=>!messages.some(i=>i.id===m.id)).map(m=>m.id));}
    catch(error){
     // A lost reply must not turn an accepted App entry into a second send.
     // Only persisted IDs count as positive evidence; otherwise keep an
     // explicit uncertain entry and block automatic resubmission.
     const observed=this.messages(target.threadId);
     if(!fresh.length||!fresh.every(i=>observed.some(m=>m.id===i.id)))throw error;
    }
    const saved=this.queue.state(scope);saved.nativeTransfer=[];this.queue.commit(scope,saved);
   }
   return this.read(scope);
  });
 }
}
