import fs from 'node:fs';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {fault} from '../../src/storage.js';
import {principal} from './desktop.js';

export const appToolsCapabilities=Object.freeze({transport:'app-tools-v1',read:true,send:true,steer:false,interrupt:false,approvals:false,queue:false,settings:false,edit:false,attachments:false});
export function discoverAppToolsPipe(){
 if(process.platform!=='win32')return null;
 try{const names=fs.readdirSync('\\\\.\\pipe\\');if(names.includes('codex-ipc'))return null;const candidates=names.filter(name=>/^codex-app-tools-[a-f0-9-]{36}$/.test(name));return candidates.length===1?'\\\\.\\pipe\\'+candidates[0]:null;}catch{return null;}
}

// Private, fixed allowlist. Neither tool names nor raw RPC are supplied by HTTP.
// In particular, discovering a tool does not authorize calling it.
export class AppToolsConnection{
 constructor({discover=discoverAppToolsPipe,connect=net.connect,timeout=20000}={}){Object.assign(this,{discover,connect,timeout});}
 async call(tool,threadId,args){
  if(!['read_thread','send_message_to_thread'].includes(tool))throw fault('桌面操作不受支持',409);
  const pipe=this.discover();if(!pipe)throw fault('桌面连接不可用，请确认桌面已启动',503);
  const id=randomUUID();
  return new Promise((resolve,reject)=>{
   const socket=this.connect(pipe);let buffer=Buffer.alloc(0),done=false;
   const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);socket.destroy();error?reject(error):resolve(value);};
   const timer=setTimeout(()=>finish(fault(tool==='send_message_to_thread'?'发送结果尚未确认，请先检查桌面聊天；不会自动重试':'桌面读取超时',504)),this.timeout);
   socket.on('error',()=>finish(fault('桌面连接已断开；请求不会自动重试',503)));
   socket.on('close',()=>{if(!done)finish(fault('桌面连接已断开；请求不会自动重试',503));});
   socket.on('connect',()=>{
    const message={jsonrpc:'2.0',id,method:'tools/call',params:{namespace:'codex_app',tool,arguments:args,callerSource:'codex',hostId:'local',threadId,turnId:'web-'+id,callId:id}};
    const data=Buffer.from(JSON.stringify(message)),header=Buffer.alloc(4);header.writeUInt32LE(data.length);socket.write(Buffer.concat([header,data]));
   });
   socket.on('data',chunk=>{
    buffer=Buffer.concat([buffer,chunk]);
    if(buffer.length<4)return;const size=buffer.readUInt32LE();if(!size||size>8*1024*1024)return finish(fault('桌面响应格式不正确',502));if(buffer.length<size+4)return;
    let response;try{response=JSON.parse(buffer.subarray(4,size+4));}catch{return finish(fault('桌面响应格式不正确',502));}
    if(response.id!==id)return finish(fault('桌面响应标识不匹配',502));
    if(response.error||response.result?.success!==true)return finish(fault('桌面未完成请求；不会自动重试，请在 App 中检查',409));
    const text=(response.result.contentItems||[]).filter(item=>item.type==='inputText').map(item=>item.text).join('\n');let value;try{value=JSON.parse(text);}catch{value={message:text};}finish(null,value);
   });
  });
 }
}

export function appToolsSnapshot(metadata,page){
 const groups=new Map();for(const item of page.items||[]){const id=item._turnId||'history';let turn=groups.get(id);if(!turn){turn={id,status:item._turnStatus||'completed',items:[]};groups.set(id,turn);}turn.items.push(item);}
 const native=metadata.thread?.status,type=typeof native==='string'?native:native?.type;
 const busy=type==='active'||type==='inProgress'||type==='running';
 const turns=[...groups.values()];if(busy&&!turns.some(turn=>turn.status==='inProgress'))turns.push({id:'native-active',status:'inProgress',items:[]});
 if(!busy)for(const turn of turns)if(turn.status==='inProgress')turn.status='completed';
 return {cwd:metadata.thread?.cwd,turns,requests:[],threadRuntimeStatus:{type:busy?'inProgress':'idle'},desktopCapabilities:appToolsCapabilities};
}

export class AppToolsDesktop extends EventEmitter{
 constructor(history,{connection=new AppToolsConnection(),emit=()=>{},clock=Date.now}={}){
  super();Object.assign(this,{history,accountHome:history.home,connection,emitHost:emit,clock});this.capabilities=appToolsCapabilities;this.states=new Map();this.owners=new Map();this.manualFollow=new Set();this.pending=new Map();this.receipts=new Map();this.connected=false;
 }
 get socket(){return {writable:this.connected};}
 status(){return {connected:this.connected,capabilities:this.capabilities};}
 authorize(id,write=false){
  const row=this.history.list().find(row=>row.threadId===id);if(!row)throw fault('找不到本地桌面聊天',404);
  const identity=principal(this.accountHome);
  if(!identity)throw fault('桌面账号未登录',409);
  if(row.accountMismatch||row.verifiedPrincipal&&row.verifiedPrincipal!==identity)throw fault('请切换回聊天所属账号',409);
  if(write&&(row.protected||!row.verifiedPrincipal))throw fault(row.protected?'当前管理聊天只读':'无法确认聊天账号归属，禁止发送',403);
  return row;
 }
 async follow(id,{background=false}={}){
  this.authorize(id);if(this.pending.has(id))return this.pending.get(id);
  const promise=(async()=>{
   try{
    const metadata=await this.connection.call('read_thread',id,{threadId:id,hostId:'local',includeTurns:false,maxOutputCharsPerItem:0});
    if(metadata.thread?.id!==id||metadata.thread?.hostId!=='local')throw fault('桌面返回的聊天或主机不匹配',502);
    const page=await this.history.read(id,{limit:100});const state=appToolsSnapshot(metadata,page);
    this.connected=true;this.states.set(id,state);this.owners.set(id,'app-tools-v1');
    if(!background){this.manualFollow.add(id);this.pollTimes??=new Map();this.pollTimes.set(id,this.clock());this.start();this.emitHost('desktop',{threadId:id,state});}
    this.emit('state',{threadId:id,state});return state;
   }catch(error){this.connected=false;throw error;}
  })();this.pending.set(id,promise);try{return await promise;}finally{this.pending.delete(id);}
 }
 start(){if(this.timer)return;this.timer=setInterval(()=>{for(const id of this.manualFollow){if(this.clock()-(this.pollTimes?.get(id)||0)>90000){this.manualFollow.delete(id);continue;}void this.follow(id,{background:true}).then(state=>this.emitHost('desktop',{threadId:id,state})).catch(()=>this.emitHost('desktop-offline',{transport:'app-tools-v1'}));}},3000);this.timer.unref();}
 async control(id,action,params={}){
  if(action!=='send')throw fault('新版桌面暂不支持此操作，请在 App 中操作',409);
  this.authorize(id,true);const request=params.turnStart?.request,input=request?.input;
  if(!Array.isArray(input)||!input.length||input.some(item=>item?.type!=='text'||typeof item.text!=='string'))throw fault('新版桌面仅支持文字发送',400);
  const prompt=input.map(item=>item.text).join('\n');if(!prompt.trim())throw fault('请输入文字',400);
  if(prompt.length>200000)throw fault('消息过长',413);
  const requestId=params.requestId;if(typeof requestId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(requestId))throw fault('发送需要唯一请求标识',400);
  const key=id+':'+requestId,identity=principal(this.accountHome),fingerprint=JSON.stringify([identity,prompt]);
  const existing=this.receipts.get(key);if(existing){if(existing.fingerprint!==fingerprint)throw fault('请求标识已用于另一条消息',409);return existing.promise;}
  // Retain both successful and ambiguous results. A repeated HTTP request must
  // never turn an unknown native outcome into a second message.
  if(this.receipts.size>=1000)throw fault('发送记录已满，请使用 App 发送',409);
  const receipt={fingerprint,sent:false};
  const promise=(async()=>{try{const state=await this.follow(id,{background:true});if(state.threadRuntimeStatus.type!=='idle')throw fault('聊天仍在执行，请等待完成后发送；新版不支持网站排队或插话',409);this.authorize(id,true);receipt.sent=true;await this.connection.call('send_message_to_thread',id,{threadId:id,hostId:'local',prompt});return {accepted:true};}catch(error){if(!receipt.sent&&this.receipts.get(key)===receipt)this.receipts.delete(key);throw error;}})();
  receipt.promise=promise;this.receipts.set(key,receipt);return promise;
 }
 queueControl(){throw fault('新版桌面暂不支持网站排队',409);}
 request(){throw fault('新版桌面暂不支持此操作，请在 App 中操作',409);}
 close(){clearInterval(this.timer);}
}
