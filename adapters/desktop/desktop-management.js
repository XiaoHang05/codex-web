import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {principal} from './desktop.js';
import {accountPrincipal} from '../../src/account-identity.js';
import {desktopReadOnly} from './desktop-access.js';
import {fault,readJson} from '../../src/storage.js';

export function desktopStoredThread(home,id){
 let database;try{database=new DatabaseSync(path.join(home,'state_5.sqlite'),{readOnly:true});return database.prepare('SELECT id,name,title,cwd,archived,creator_account_id FROM threads WHERE id=?').get(id);}finally{database?.close();}
}
export function desktopArchivedThreads(home){
 const identity=principal(home);if(!identity)return [];
 let database;try{database=new DatabaseSync(path.join(home,'state_5.sqlite'),{readOnly:true});return database.prepare('SELECT id,name,title,cwd,creator_account_id FROM threads WHERE archived=1 ORDER BY updated_at DESC').all().filter(row=>row.creator_account_id&&accountPrincipal(row.creator_account_id)===identity&&!desktopReadOnly(row.id)).map(row=>({threadId:row.id,name:row.name||row.title||'已归档聊天',cwd:row.cwd}));}finally{database?.close();}
}
export function assertDesktopIdle(state){
 if(!state)throw fault('等待桌面状态同步',409);
 const turns=[...Object.values(state.turnHistory?.history?.entitiesByKey||{}),...(state.turns||[])];
 if(turns.some(turn=>turn.status==='inProgress')||['active','running','inProgress','busy'].includes(state.threadRuntimeStatus?.type)||(state.requests||[]).some(request=>request.completed!==true)||state.threadGoal?.status==='active')throw fault('请先停止此聊天的任务、审批和持续目标，再归档',409);
}
export async function freshDesktopState(desktop,threadId){
 let timer,listener;
 const pending=new Promise((resolve,reject)=>{listener=event=>{if(event.threadId===threadId&&event.state)resolve(event.state);};desktop.on('state',listener);timer=setTimeout(()=>reject(fault('桌面状态尚未同步，未执行操作',409)),3000);});
 // Attach a rejection handler before discovery, which can itself fail.
 pending.catch(()=>{});
 try{await desktop.follow(threadId,{background:true});return await pending;}finally{clearTimeout(timer);desktop.removeListener('state',listener);}
}
export async function desktopManagementRoute(req,res,ctx){
 if(req.path==='/api/desktop-management/archives'){
  if(req.method!=='GET')throw fault('归档列表仅支持 GET',405);res.json({threads:desktopArchivedThreads(ctx.desktop.accountHome)});return true;
 }
 const match=req.path.match(/^\/api\/desktop-management\/([-a-zA-Z0-9_]{1,80})\/(archive|unarchive)$/);if(!match)return false;
 if(req.method!=='POST')throw fault('管理操作仅支持 POST',405);
 if(Object.keys(req.body||{}).length)throw fault('管理接口不接受额外参数');
 const [,threadId,action]=match,home=ctx.desktop.accountHome,row=desktopStoredThread(home,threadId),identity=principal(home);
 if(!row)throw fault('找不到桌面聊天',404);
 if(!identity||!row.creator_account_id||accountPrincipal(row.creator_account_id)!==identity)throw fault('无法确认此聊天属于当前桌面账号',409);
 if(desktopReadOnly(threadId))throw fault('此管理聊天只读',403);
 ctx.desktopManagementBusy??=new Set();if(ctx.desktopManagementBusy.has(threadId))throw fault('此聊天正在处理管理操作',409);ctx.desktopManagementBusy.add(threadId);
 try{
  if(action==='archive'){
   if(row.archived)throw fault('此聊天已经归档',409);
   try{assertDesktopIdle(await freshDesktopState(ctx.desktop,threadId));}catch(error){
    // A historical chat may have no owner. Native archive still enforces the
    // cross-process writer lock; never try to release or bypass that lock.
    if(!/no-client-found|client-cannot-handle-request/.test(error.message))throw error;
   }
   const queued=readJson(path.join(home,'.codex-global-state.json'),{})['queued-follow-ups']?.[threadId];
   if(!Array.isArray(queued)&&queued!==undefined)throw fault('无法确认 App 队列状态',409);
   if(queued?.length)throw fault('请先处理此聊天的排队消息，再归档',409);
  }else if(!row.archived)throw fault('此聊天尚未归档',409);
  const {desktopArchive}=await import('./desktop-catalog.js?v='+fs.statSync(new URL('./desktop-catalog.js',import.meta.url)).mtimeMs);
  await desktopArchive(action,{threadId,home,cwd:row.cwd,config:ctx.config});
  const stored=desktopStoredThread(home,threadId);if(!!stored?.archived!==(action==='archive'))throw fault('原生归档结果尚未确认，请刷新列表',502);
  let broadcastSent=false;try{await ctx.desktop.connect();ctx.desktop.send({type:'broadcast',sourceClientId:ctx.desktop.clientId,version:action==='archive'?2:1,method:action==='archive'?'thread-archived':'thread-unarchived',params:{hostId:'local',conversationId:threadId,...(action==='archive'?{cwd:row.cwd}:{})}});broadcastSent=true;}catch{}
  ctx.history.refreshed=0;
  res.json({ok:true,archived:action==='archive',broadcastSent,...(!broadcastSent?{warning:'原生存储已更新，但 App 通知未发送；请刷新 App 列表。'}:{})});return true;
 }finally{ctx.desktopManagementBusy.delete(threadId);}
}
