// A separate provider ID is required: native built-in providers are immutable.
// Keep official ChatGPT authentication while opting out of WebSocket retries.
import {fault} from './storage.js';
export const chatgptHttpProvider='web_chatgpt_http';
export function chatgptHttpParams(params={}) {
 return {...params,modelProvider:chatgptHttpProvider,config:{...params.config,
  ['model_providers.'+chatgptHttpProvider]:{
   name:'OpenAI',base_url:'https://chatgpt.com/backend-api/codex',
   wire_api:'responses',requires_openai_auth:true,supports_websockets:false,
  },
 }};
}

export async function ensureChatgptHttp(manager,instance,threadId,policy) {
 if(instance.profile.provider!=='chatgpt'||instance.httpThreads?.has(threadId))return;
 instance.httpMigrations??=new Map();
 if(instance.httpMigrations.has(threadId))return instance.httpMigrations.get(threadId);
 const migration=(async()=>{
  const busy=()=>instance.active.has(threadId)||[...instance.approvals.values()].some(row=>row.params?.threadId===threadId);
  if(busy())throw fault('请等待当前任务与审批完成后再发送',409);
  const previous=await manager.call(instance,'thread/resume',chatgptHttpParams({threadId,...policy}));
  if(previous.modelProvider!==chatgptHttpProvider){
   // Rejoining an already loaded thread ignores provider overrides. Reload only
   // this idle, persisted thread; never restart the engine or interrupt a turn.
   if(busy()||previous.thread?.status?.type==='active'||previous.thread?.turns?.some(turn=>turn.status==='inProgress'))throw fault('请等待当前任务与审批完成后再发送',409);
   if(instance.unmaterialized?.has(threadId))throw fault('请新建聊天后发送；这个空白聊天尚未保存',409);
   await manager.call(instance,'thread/unsubscribe',{threadId});
   instance.loaded.delete(threadId);
   const config=previous.reasoningEffort?{model_reasoning_effort:previous.reasoningEffort}:{};
   const resumed=await manager.call(instance,'thread/resume',chatgptHttpParams({threadId,...policy,
    model:previous.model,cwd:previous.cwd||previous.thread?.cwd,
    serviceTier:previous.serviceTier,config,
   }));
   if(resumed.modelProvider!==chatgptHttpProvider)throw fault('聊天连接设置尚未生效，请稍后重试',409);
  }
  instance.loaded.add(threadId);
  instance.httpThreads??=new Set();instance.httpThreads.add(threadId);
 })();
 instance.httpMigrations.set(threadId,migration);
 try{await migration;}finally{instance.httpMigrations.delete(threadId);}
}
