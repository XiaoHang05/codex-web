import fs from 'node:fs';
import path from 'node:path';
// A short-lived read-only catalog process uses the desktop home/config.
// It never loads/resumes chats, submits turns, changes goals or executes tools.
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {findCodex} from '../../src/codex.js';
import {fault} from '../../src/storage.js';
const operations={account:'account/read',skills:'skills/list',mcp:'mcpServerStatus/list',limits:'account/rateLimits/read',usage:'account/usage/read',providers:'config/read'};
const cached=new Map();
export async function desktopCatalog(operation,{home,cwd,config,cursor}={}){
 if(!Object.hasOwn(operations,operation))throw fault('未知桌面目录查询',403);
 if(cursor!==undefined&&(typeof cursor!=='string'||cursor.length>4000))throw fault('无效目录游标');
 const stamp=name=>{try{return fs.statSync(path.join(home,name)).mtimeMs;}catch{return 0;}};const key=JSON.stringify([home,cwd,operation,cursor,stamp('auth.json'),stamp('config.toml')]),old=cached.get(key);if(old&&Date.now()-old.at<10000)return old.promise;
 const promise=query(operations[operation],{home,cwd,config,cursor}).then(result=>operation==='providers'?desktopProviderSummary(result):result);cached.set(key,{at:Date.now(),promise});promise.catch(()=>{if(cached.get(key)?.promise===promise)cached.delete(key);});if(cached.size>80)cached.delete(cached.keys().next().value);return promise;
}
export function desktopProviderSummary(result){
 const value=result?.config||{},id=value.model_provider||'openai';
 const providers=Object.entries(value.model_providers||{}).map(([key,provider])=>({id:key,name:typeof provider?.name==='string'?provider.name:key,wireApi:provider?.wire_api||null,requiresOpenaiAuth:provider?.requires_openai_auth===true}));
 if(!providers.some(provider=>provider.id==='openai'))providers.unshift({id:'openai',name:'OpenAI',wireApi:'responses',requiresOpenaiAuth:true});
 // Never relay raw config: provider headers, URL credentials and literal API keys
 // can all contain secrets. The UI only needs identifiers and protocol flags.
 return {activeProvider:id,defaultModel:value.model||null,defaultReasoning:value.model_reasoning_effort||null,providers,liveEngineApplied:false};
}
export async function desktopArchive(action,{threadId,...options}){
 if(!['archive','unarchive'].includes(action)||!/^[-a-zA-Z0-9_]{1,80}$/.test(threadId||''))throw fault('无效桌面归档操作');
 return query('thread/'+action,{...options,params:{threadId}});
}
async function query(method,{home,cwd,config,cursor,params:explicitParams}){
 const env={...process.env,CODEX_HOME:home};for(const key of ['OPENAI_API_KEY','CODEX_ACCESS_TOKEN','CODEX_API_KEY','CODEX_WEB_PROVIDER_KEY'])delete env[key];
 const proc=spawn(findCodex(config),['app-server','--listen','stdio://'],{cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']}),pending=new Map();let sequence=1;
 const rejectAll=()=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(fault('桌面配置查询进程已退出',503));}pending.clear();};proc.on('error',rejectAll);proc.on('exit',rejectAll);proc.stderr.resume();
 const send=message=>{if(!proc.stdin.writable)throw fault('桌面配置查询不可用',503);proc.stdin.write(JSON.stringify(message)+'\n');};
 const lines=readline.createInterface({input:proc.stdout});lines.on('line',line=>{let message;try{message=JSON.parse(line);}catch{return;}
  if(message.method){if(message.id!==undefined)try{send({id:message.id,error:{code:-32601,message:'Read-only catalog: interactive requests are not supported'}});}catch{}return;}
  const request=pending.get(message.id);if(!request)return;pending.delete(message.id);clearTimeout(request.timer);if(message.error)request.reject(fault('桌面配置查询失败：'+String(message.error.message||'原生接口不支持').slice(0,600),502));else request.resolve(message.result);
 });
 const call=(method,params)=>new Promise((resolve,reject)=>{const id=sequence++,timer=setTimeout(()=>{pending.delete(id);reject(fault('桌面配置查询超时',504));},30000);pending.set(id,{resolve,reject,timer});try{send({id,method,params});}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}});
 try{await call('initialize',{clientInfo:{name:'codex_web_desktop_catalog',version:'0.1.0'},capabilities:{experimentalApi:true}});send({method:'initialized',params:{}});const params=explicitParams??(method==='account/read'?{refreshToken:false}:method==='config/read'?{includeLayers:false,cwd}:method==='skills/list'?{cwds:cwd?[cwd]:[],forceReload:false}:method==='mcpServerStatus/list'?{limit:50,...(cursor?{cursor}:{})}:{});
  if(method==='thread/archive'){const {goal}=await call('thread/goal/get',{threadId:params.threadId});if(goal?.status==='active')throw fault('请先在 App 暂停此聊天的活动目标，再归档',409);}
  try{return await call(method,params);}catch(error){if(method==='thread/archive'&&error.message.includes('already has an active writer'))throw fault('此聊天仍被 App 引擎持有，当前共享协议不能归档；请在 App 中归档',409);throw error;}
 }
 finally{lines.close();rejectAll();proc.stdin.end();const timer=setTimeout(()=>{if(proc.exitCode===null)proc.kill();},1500);timer.unref();proc.once('exit',()=>clearTimeout(timer));}
}
