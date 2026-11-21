import path from 'node:path';
import {dataRoot,fault} from './storage.js';
import {ComposerQueue,queueTarget} from './composer-queue.js';
import {nativePolicy} from './preferences.js';
import {principal} from './account.js';
import {desktopTurns} from '../public/codex/desktop-turn-state.js';
const running=turn=>['inProgress','in_progress','running'].includes(turn.status?.type||turn.status);
const input=draft=>[{type:'text',text:draft.text},...(draft.skill?[{type:'skill',...draft.skill}]:[]),...draft.images];
export function nativeQueueAdapter(ctx){
 const desktopSnapshots=new Map();
 ctx.desktop.on('state',({threadId,state})=>desktopSnapshots.set(threadId,state));
 ctx.desktop.on('offline',()=>desktopSnapshots.clear());
 const adapter={
  async authorize(target){
   const rows=ctx.history.list(),row=rows.find(r=>r.threadId===target.threadId);
   if(target.mode==='desktop'){
    if(!ctx.desktopAdapter)throw fault('桌面共享未启用',409);
    if(!row)throw fault('找不到桌面聊天',404);if(row.protected)throw fault('此聊天只读',403);if(row.accountMismatch)throw fault('请切换回聊天所属账号',409);
    const identity=principal(ctx.desktop.accountHome);if(!identity)throw fault('桌面账号未登录',409);return identity;
   }
   if(row)throw fault('桌面聊天必须通过桌面连接操作',409);
   const identity=ctx.codex.profileIdentity(target.profile),known=ctx.codex.profileHistory(target.profile).get(target.threadId);
   if(known?.archived)throw fault('聊天已归档',409);if(known?.principal&&known.principal!==identity)throw fault('请切换回聊天所属账号',409);
   if(!identity)throw fault('请先登录当前账号',409);return identity;
  },
  async snapshot(target){
   let turns,requests=[];
   if(target.mode==='desktop'){
    await ctx.desktop.connect();const state=await ctx.desktop.follow(target.threadId,{background:true});if(!state||desktopSnapshots.get(target.threadId)!==state)throw fault('等待桌面聊天状态同步',409);
    turns=desktopTurns(state);requests=state.requests||[];
    // Runtime state can be ahead of the persisted timeline.
    const runtime=state.threadRuntimeStatus?.type;
    return {turnIds:turns.map(t=>t.turnId||t.id).filter(Boolean),activeId:turns.find(running)?.turnId||turns.find(running)?.id,busy:turns.some(running)||['running','inProgress','busy'].includes(runtime)||requests.some(r=>r.completed!==true)};
   }
   const result=await ctx.codex.rpc(target.profile,'thread/read',{threadId:target.threadId,includeTurns:true});turns=result.thread?.turns;if(!Array.isArray(turns))throw fault('聊天状态未提供',502);
   const instance=ctx.codex.instances.get(target.profile);requests=[...instance?.approvals.values()||[]].filter(r=>r.params?.threadId===target.threadId);
   return {turnIds:turns.map(t=>t.id),activeId:turns.find(running)?.id,busy:turns.some(running)||!!instance?.active.has(target.threadId)||!!instance?.turnStarting||requests.length>0};
  },
  async send(target,draft){
   await adapter.authorize(target);ctx.preferences.overrideSession(target.scope,draft.policy);
   if(target.mode==='desktop'){const {model,effort,serviceTier,collaborationMode}=draft.params;return ctx.desktop.control(target.threadId,'send',{turnStart:{request:{threadId:target.threadId,input:input(draft),...nativePolicy(draft.policy),...(model?{model}:{}),...(effort?{effort}:{}),...(serviceTier?{serviceTier}:{}),...(collaborationMode?{collaborationMode}:{})},context:{inheritThreadSettings:true}}});}
   const instance=ctx.codex.instances.get(target.profile);if(!instance?.loaded.has(target.threadId))await ctx.codex.rpc(target.profile,'thread/resume',{threadId:target.threadId});
   return ctx.codex.rpc(target.profile,'turn/start',{threadId:target.threadId,input:input(draft),...draft.params});
  },
  async steer(target,draft,activeId){await adapter.authorize(target);return target.mode==='desktop'?ctx.desktop.control(target.threadId,'steer',{input:input(draft)}):ctx.codex.rpc(target.profile,'turn/steer',{threadId:target.threadId,expectedTurnId:activeId,input:input(draft)});},
 };
 return adapter;
}
export function ensureComposerQueue(ctx){
 if(ctx.codex.composerQueue)return ctx.codex.composerQueue;
 const queue=new ComposerQueue(path.join(dataRoot,'composer-queue.json'),nativeQueueAdapter(ctx),{emit:ctx.emit});ctx.codex.composerQueue=queue;queue.start();return queue;
}
export async function composerQueueRoute(req,res,ctx){
 const queue=ensureComposerQueue(ctx);
 if(req.path!=='/api/composer-queue')return false;
 const scope=req.query?.scope;
 if(queueTarget(scope).mode==='desktop'){
  if(!ctx.desktopAdapter)throw fault('桌面共享未启用',409);
  if(ctx.desktop.capabilities?.queue===false){
   ctx.desktop.authorize(queueTarget(scope).threadId);
   if(req.method!=='GET')throw fault('新版桌面暂不支持网站排队，请等待空闲后直接发送',409);
   res.json({scope,revision:0,items:[],nativeShared:false,reason:'新版桌面仅支持空闲时直接发送文字，排队请在 App 中操作'});return true;
  }
  queue.sharedQueue ||= await ctx.desktopAdapter.createQueue(ctx,queue);
  if(req.method==='GET'){const state=await queue.lock(scope,()=>queue.sharedQueue.read(scope));res.json(String(state.revision)===req.query?.since?{unchanged:true,revision:state.revision}:state);return true;}
  if(req.method==='PUT'){res.json(await queue.sharedQueue.update(scope,req.body||{}));return true;}
  res.status(405).json({error:'不支持的队列操作'});return true;
 }
 if(req.method==='GET'){const identity=await queue.adapter.authorize(queueTarget(scope)),saved=queue.state(scope);if(saved.items.length&&saved.principal!==identity)throw fault('队列属于之前的账号，请切换回原账号',409);const state=queue.public(scope);res.json(String(state.revision)===req.query?.since?{unchanged:true,revision:state.revision}:state);return true;}
 if(req.method==='PUT'){res.json(await queue.update(scope,req.body||{}));setImmediate(()=>void queue.poll());return true;}
 res.status(405).json({error:'不支持的队列操作'});return true;
}
