import {fault} from './storage.js';

// Only the dedicated native prediction RPC is allowed here. Never substitute
// turn/start, thread/sample, a fork, or a separate model inference request.
const unsupported=new WeakSet(),requests=new WeakMap();
const valid=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value);
const unavailable=reason=>({status:'unavailable',reason,text:null});
export async function composerPredictionsRoute(req,res,ctx){
 if(req.path!=='/api/composer-predictions')return false;
 if(!['GET','POST'].includes(req.method))throw fault('输入预测仅支持 GET 和 POST',405);
 const data=req.method==='GET'?req.query:req.body;
 const {source,profile,threadId,sourceTurnId}=data||{};
 if(!['web','desktop'].includes(source)||!valid(threadId)||source==='web'&&!valid(profile)||req.method==='POST'&&!valid(sourceTurnId))throw fault('无效输入预测参数');
 if(source==='desktop'){
  const row=ctx.history.list().find(row=>row.threadId===threadId);
  if(!row)throw fault('找不到桌面聊天',404);
  if(row.accountMismatch||row.conflict)throw fault('聊天账号或持有者不匹配',409);
  res.json(unavailable('桌面 App 的原生输入预测尚未开放给网页连接；请在桌面 App 中使用。不会额外调用模型。'));return true;
 }
 if(ctx.history.list().some(row=>row.threadId===threadId))throw fault('桌面聊天必须通过桌面连接读取',409);
 const configuration=ctx.codex.profile(profile),instance=ctx.codex.instances.get(profile);
 if(configuration.provider!=='chatgpt'){res.json(unavailable('原生输入预测需要支持此功能的 ChatGPT 账号；API 配置不会生成替代预测。'));return true;}
 if(!instance?.ready){res.json(unavailable('网页实例尚未连接，连接后可重新检查输入预测。'));return true;}
 const known=ctx.codex.profileHistory(profile).get(threadId),identity=ctx.codex.profileIdentity(profile);
 if(!known||!identity||known.principal!==identity)throw fault('聊天账号不匹配或尚未验证',409);
 if(unsupported.has(instance)){res.json(unavailable('当前原生引擎尚未实现输入预测接口；不会额外调用模型。'));return true;}
 if(req.method==='GET'){res.json({status:'unknown',reason:'仅使用官方原生预测；是否可用由引擎和账号决定。',text:null});return true;}
 if(!instance.loaded.has(threadId)||instance.active.has(threadId)){res.json({status:'idle',text:null});return true;}
 const {thread}=await ctx.codex.call(instance,'thread/read',{threadId,includeTurns:true});
 const last=thread?.turns?.at(-1);
 if(!last||last.id!==sourceTurnId||last.status!=='completed'){res.json({status:'idle',text:null});return true;}
 let cache=requests.get(instance);if(!cache){cache=new Map();requests.set(instance,cache);}
 const key=JSON.stringify([identity,threadId,sourceTurnId]);
 if(!cache.has(key)){
  const request=ctx.codex.call(instance,'thread/prediction/request',{threadId,sourceTurnId}).then(()=>({status:'pending',threadId,sourceTurnId,text:null})).catch(error=>{
   if(/not implemented|unknown (?:method|variant)|method not found|unsupported method/i.test(error.message)){
    unsupported.add(instance);return unavailable('当前原生引擎尚未实现输入预测接口；不会额外调用模型。');
   }
   return unavailable('原生输入预测暂不可用，请检查账号资格、模型与连接；不会使用替代模型。');
  });
  cache.set(key,request);if(cache.size>128)cache.delete(cache.keys().next().value);
 }
 res.json(await cache.get(key));return true;
}
