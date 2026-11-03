import {fault} from './storage.js';

const id=/^[a-zA-Z0-9_-]{1,80}$/;
async function context(ctx,body){
 const {profile,source,threadId}=body;
 if(!id.test(profile||'')||!['web','desktop'].includes(source)||!id.test(threadId||''))throw fault('无效反馈会话');
 const p=ctx.codex.profile(profile);
 if(p.provider!=='chatgpt')throw fault('请在设置中选择已登录 ChatGPT 的网页配置来提交 OpenAI 反馈',409);
 let row;
 if(source==='desktop')row=ctx.history.list().find(row=>row.threadId===threadId);
 else{row=ctx.codex.profileHistory(profile).get(threadId);const identity=ctx.codex.profileIdentity(profile);if(!row?.principal||row.principal!==identity)throw fault('无法确认此会话属于当前网页账号，请切回原账号',409);}
 if(!row)throw fault('找不到反馈会话',404);
 const instance=await ctx.codex.start(profile),result=await ctx.codex.call(instance,'account/read',{refreshToken:false});
 if(result.account?.type!=='chatgpt')throw fault('请先在设置中登录网页 ChatGPT 账号',409);
 return {instance,account:result.account,name:row.name||'未命名会话',source,threadId,profile};
}
export async function feedback(req,res,ctx){
 if(req.path!=='/api/feedback')return false;
 if(req.method==='GET'){
  const c=await context(ctx,req.query);
  res.json({account:c.account.email||'已登录 ChatGPT 账号',profile:c.profile,name:c.name,contextAvailable:c.source==='web',logsAvailable:c.source==='web'});return true;
 }
 if(req.method!=='POST')throw fault('不支持的请求方式',405);
 const b=req.body||{};
 if(b.confirmed!==true||!['good','bad','bug','other'].includes(b.classification)||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>8000||typeof b.includeLogs!=='boolean'||typeof b.includeContext!=='boolean'||!/^[-a-f0-9]{36}$/.test(b.requestId||''))throw fault('请填写反馈内容并确认提交');
 if(b.source==='desktop'&&(b.includeLogs||b.includeContext))throw fault('桌面共享反馈只支持文字，不上传桌面日志或会话记录');
 ctx.feedbackRequests??=new Map();const requests=ctx.feedbackRequests;
 for(const [key,value]of requests)if(Date.now()-value.time>86400000)requests.delete(key);
 if(requests.has(b.requestId))throw fault('这次提交已处理或结果待确认，请勿重复提交',409);
 if(requests.size>=1000)throw fault('反馈提交次数过多，请稍后再试',429);
 // Reserve before awaiting account lookup: repeated clicks cannot race an upload.
 requests.set(b.requestId,{time:Date.now(),status:'validating'});
 let c;try{c=await context(ctx,b);}catch(error){requests.delete(b.requestId);throw error;}
 requests.get(b.requestId).status='pending';
 try{
  const result=await ctx.codex.call(c.instance,'feedback/upload',{
   classification:b.classification,reason:b.reason.trim(),includeLogs:b.includeLogs,
   threadId:b.includeContext?c.threadId:null,
   tags:{source:'codex-web',chat_source:c.source,chat_id:c.threadId,...(typeof b.itemId==='string'&&id.test(b.itemId)?{reply_id:b.itemId}:{})}
  },90000);
  if(typeof result?.threadId!=='string')throw fault('原生接口未返回反馈编号，结果待确认，请勿重复提交',502);
  requests.set(b.requestId,{time:Date.now(),status:'sent',reportId:result.threadId});
  res.json({ok:true,reportId:result.threadId});
 }catch(error){requests.set(b.requestId,{time:Date.now(),status:'unknown'});throw fault('反馈未确认成功：'+error.message+'。不会自动重试；结果不明时请勿重复提交。',error.status||502);}
 return true;
}
