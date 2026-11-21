import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {fault} from '../../src/storage.js';

const actions=new Set(['status','read','loaded','send','steer','interrupt','settings','compact','queueRead','queueAdd','queueUpdate','queueDelete','queueReorder','queueStart','answer','models','skills','mcp','account','limits','usage']);
const maximum=24*1024*1024;
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
export function discoverRelay(home,{read=file=>fs.readFileSync(file,'utf8'),isAlive=alive}={}){
 try{
  const descriptor=JSON.parse(read(path.join(home,'desktop-relay.json')));
  if(descriptor.format!==1||typeof descriptor.home!=='string'||path.resolve(descriptor.home).toLowerCase()!==path.resolve(home).toLowerCase()||!/^\\\\\.\\pipe\\codex-web-desktop-relay-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(descriptor.pipe)||typeof descriptor.token!=='string'||descriptor.token.length<32||descriptor.token.length>256||!Number.isSafeInteger(descriptor.relayPid)||descriptor.relayPid<=0||!Number.isSafeInteger(descriptor.nativePid)||descriptor.nativePid<=0||!isAlive(descriptor.relayPid)||!isAlive(descriptor.nativePid))return null;
  return descriptor;
 }catch{return null;}
}
export class RelayConnection{
 constructor(home,{discover=()=>discoverRelay(home),connect=pipe=>net.connect(pipe),timeout=20000}={}){Object.assign(this,{home,discover,connect,timeout});this.connected=false;}
 available(){return !!this.discover();}
 async call(action,threadId,params={}){
  if(!actions.has(action))throw fault('桌面中继不支持此操作',409);
  if(!['status','loaded','models','skills','mcp','account','limits','usage'].includes(action)&&(typeof threadId!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(threadId)))throw fault('无效桌面聊天',400);
  const descriptor=this.discover();if(!descriptor)throw fault('桌面完整连接尚未启动',503);
  const id=randomUUID(),data=Buffer.from(JSON.stringify({id,token:descriptor.token,action,threadId,params}));if(data.length>maximum)throw fault('桌面请求过大',413);
  return new Promise((resolve,reject)=>{
   let socket,buffer=Buffer.alloc(0),done=false;
   const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);socket?.destroy();if(error){this.connected=false;reject(error);}else{if(action==='status')this.connected=value?.connected===true;resolve(value);}};
   const timer=setTimeout(()=>finish(fault('桌面请求结果尚未确认，不会自动重试',504)),this.timeout);
   try{socket=this.connect(descriptor.pipe);}catch{return finish(fault('桌面中继连接失败',503));}
   socket.once('connect',()=>{const header=Buffer.alloc(4);header.writeUInt32LE(data.length);socket.write(Buffer.concat([header,data]));});
   socket.on('error',()=>finish(fault('桌面中继连接已断开，不会自动重试',503)));
   socket.once('close',()=>{if(!done)finish(fault('桌面中继连接已断开，不会自动重试',503));});
   socket.on('data',chunk=>{if(done)return;buffer=Buffer.concat([buffer,chunk]);if(buffer.length<4)return;const size=buffer.readUInt32LE();if(!size||size>maximum||buffer.length>maximum+4)return finish(fault('桌面中继响应过大或格式错误',502));if(buffer.length<size+4)return;let message;try{message=JSON.parse(buffer.subarray(4,size+4));}catch{return finish(fault('桌面中继响应格式错误',502));}if(message.id!==id)return finish(fault('桌面中继响应标识不匹配',502));if(message.error)return finish(fault(String(message.error.message||'桌面操作失败').slice(0,300),[400,403,404,409,413,502,503,504].includes(message.error.status)?message.error.status:502));finish(null,message.result);});
  });
 }
}
