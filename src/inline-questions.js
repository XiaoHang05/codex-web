import {fault} from './storage.js';
import {desktopTurns} from '../public/codex/desktop-turn-state.js';
import fs from 'node:fs';
import {nativePolicy} from './preferences.js';

export async function inlineQuestionsRoute(req,res,ctx){
 const match=req.path.match(/^\/api\/inline-questions\/(desktop|web)\/([-a-zA-Z0-9_]{1,80})(?:\/([-a-zA-Z0-9_]{1,80}))?$/);
 if(!match)return false;
 if(req.method!=='POST')throw fault('回答接口仅支持 POST',405);
 ctx.auth.csrf(req);
 const [,source,id,webThread]=match,threadId=source==='desktop'?id:webThread;
 if(!threadId||source==='desktop'&&webThread)throw fault('无效聊天来源');
 const stamp=fs.statSync(new URL('../public/codex/inline-questions.js',import.meta.url)).mtimeMs;
 const {inlineQuestionRequest,inlineQuestionReply}=await import('../public/codex/inline-questions.js?v='+stamp);
 const row=ctx.history.list().find(row=>row.threadId===threadId);
 let turns;
 if(source==='desktop'){
  if(!row)throw fault('找不到桌面聊天',404);
  if(row.protected)throw fault('此聊天只读',403);
  if(row.accountMismatch||row.conflict)throw fault('桌面聊天所属账号或持有者不匹配',409);
  await ctx.desktop.follow(threadId,{background:true});
  const state=ctx.desktop.states.get(threadId);if(!state)throw fault('等待桌面状态同步',409);
  turns=desktopTurns(state);
 }else{
  if(row)throw fault('桌面会话必须通过桌面连接回答',409);
  turns=(await ctx.codex.rpc(id,'thread/read',{threadId,includeTurns:true})).thread?.turns;
 }
 const request=inlineQuestionRequest(turns,threadId);let text;
 try{text=inlineQuestionReply(request,req.body);}catch(error){throw fault(error.message,409);}
 const input=[{type:'text',text}],expectedTurnId=request.params.turnId;
 // Preserve the native envelope and check the observed turn before dispatch.
 let result;
 if(request.params.idle){
  if(source==='desktop'){
   const policy=nativePolicy(ctx.preferences?.registerSession(`desktop:${threadId}`)||{access:'workspace-write',approval:'manual'});
   result=await ctx.desktop.control(threadId,'send',{expectedIdleTurnId:expectedTurnId,turnStart:{request:{threadId,input,approvalPolicy:policy.approvalPolicy,approvalsReviewer:policy.approvalsReviewer},context:{inheritThreadSettings:true}}});
  }else result=await ctx.codex.rpc(id,'turn/start',{threadId,input});
 }else result=source==='desktop'?await ctx.desktop.control(threadId,'steer',{expectedTurnId,input}):await ctx.codex.rpc(id,'turn/steer',{threadId,expectedTurnId,input});
 res.json({ok:true,result});return true;
}
