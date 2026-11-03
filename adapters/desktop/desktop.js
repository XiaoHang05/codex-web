import {desktopHistoryPage} from './desktop-history-pages.js';
import {activeDesktopTurn,desktopTurns} from '../../public/codex/desktop-turn-state.js';
import {desktopReadOnly} from './desktop-access.js';
import net from 'node:net';
import {desktopTitles} from './desktop-titles.js';
import {accountPrincipal,threadPrincipals} from '../../src/account-identity.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fault, readJson } from '../../src/storage.js';
import {validatePermissions,validateElicitation} from '../../public/codex/request-protocol.js';
const versions = new Map([['initialize',0],['thread-follower-compact-thread',1],['thread-follower-update-thread-settings',2],['thread-follower-set-queued-follow-ups-state',1],['thread-follower-remove-queued-message',1],['thread-owner-discovery',1],['thread-follower-start-turn',2],['thread-follower-steer-turn',1],['thread-follower-interrupt-turn',4],['thread-follower-command-approval-decision',1],['thread-follower-file-approval-decision',1],['thread-follower-submit-user-input',1],['thread-follower-permissions-request-approval-response',1],['thread-follower-submit-mcp-server-elicitation-response',1]]);
const home = path.join(os.homedir(), '.codex');
const queueCapability=Symbol('internal native composer queue');
export function principal(directory = home) {
  const auth = readJson(path.join(directory, 'auth.json'), {});
  const id = auth.tokens?.account_id;
  return accountPrincipal(id);
}
export class Desktop extends EventEmitter {
  constructor({pipe='\\\\.\\pipe\\codex-ipc',homeDirectory=home}={}) { super(); this.pipe=pipe;this.accountHome=homeDirectory; this.pending = new Map(); this.states = new Map(); this.owners = new Map(); this.clientId = 'initializing-client'; this.buffer = Buffer.alloc(0); }
  async connect() {
    if (this.socket?.writable && this.clientId !== 'initializing-client') return;
    if (this.connecting) return this.connecting;
    this.connecting = this.open();
    try { await this.connecting; } finally { this.connecting = null; }
  }
  async open() {
    this.buffer = Buffer.alloc(0); this.clientId = 'initializing-client';
    const socket = this.socket = net.connect(this.pipe||'\\\\.\\pipe\\codex-ipc');
    socket.on('data', chunk => this.consume(chunk));
    socket.on('error', () => {});
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null; this.owners.clear();
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(fault('桌面连接已断开',503)); } this.pending.clear();
      this.emit('offline');
    });
    await new Promise((resolve,reject) => { const timer=setTimeout(()=>{socket.destroy();reject(fault('桌面连接超时',503));},3000);socket.once('connect',()=>{clearTimeout(timer);resolve();});socket.once('error',()=>{clearTimeout(timer);reject(fault('桌面离线',503));}); });
    const init = await this.request('initialize',{clientType:'codex-web'},false);
    this.clientId = init.clientId;
  }
  send(message) {
    if (!this.socket?.writable) throw fault('桌面离线',503);
    const data=Buffer.from(JSON.stringify(message));const frame=Buffer.alloc(4+data.length);frame.writeUInt32LE(data.length);data.copy(frame,4);this.socket.write(frame);
  }
  async request(method,params,connect=true,targetClientId) {
    if (!versions.has(method)) throw fault('桌面接口不在允许列表',403);
    if(connect)await this.connect();
    const requestId=randomUUID();
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(requestId);reject(fault('桌面请求超时，未自动重试',504));},20000);this.pending.set(requestId,{resolve,reject,timer});
      try{this.send({type:'request',requestId,sourceClientId:this.clientId,version:method==='thread-follower-interrupt-turn'&&params?.expectedTurnId==null?3:versions.get(method),method,params,timeoutMs:19000,...(targetClientId?{targetClientId}:{})});}catch(e){clearTimeout(timer);this.pending.delete(requestId);reject(e);}
    });
  }
  consume(chunk) {
    this.buffer=Buffer.concat([this.buffer,chunk]);
    while(this.buffer.length>=4){const n=this.buffer.readUInt32LE(0);if(!n||n>64*1024*1024){this.socket?.destroy();return;}if(this.buffer.length<n+4)return;
      let msg;try{msg=JSON.parse(this.buffer.subarray(4,n+4));}catch{this.socket?.destroy();return;}this.buffer=this.buffer.subarray(n+4);
      if(msg.type==='response'){const p=this.pending.get(msg.requestId);if(p){clearTimeout(p.timer);this.pending.delete(msg.requestId);msg.resultType==='success'?p.resolve({...msg.result,owner:msg.handledByClientId}):p.reject(fault('桌面未接受请求：'+String(msg.error).slice(0,160),409));}}
      if(msg.type==='client-discovery-request')this.send({type:'client-discovery-response',requestId:msg.requestId,response:{canHandle:false}});
      if(msg.type==='broadcast'&&msg.method==='thread-queued-followups-changed'&&msg.params?.hostId==='local'){
        const {conversationId,messages}=msg.params;
        if(this.owners.get(conversationId)===msg.sourceClientId&&Array.isArray(messages))this.emit('queue',{threadId:conversationId,messages});
      }
      if(msg.type==='broadcast'&&msg.method==='thread-stream-state-changed'){
        const {conversationId,change}=msg.params||{};if(!conversationId)continue;
        if(change?.type==='snapshot')this.states.set(conversationId,change.conversationState);
        if(change?.type==='patches'){
          const state=this.states.get(conversationId);if(state)for(const patch of change.patches||[]){
            const parts=Array.isArray(patch.path)?patch.path:[];if(!parts.length||parts.some(p=>['__proto__','prototype','constructor'].includes(p)))continue;
            let object=state;for(const key of parts.slice(0,-1)){if(object==null)break;object=object[key];}if(object==null)continue;
            const key=parts.at(-1);if(patch.op==='remove'){Array.isArray(object)?object.splice(Number(key),1):delete object[key];}else if(patch.op==='add'&&Array.isArray(object))object.splice(key==='-'?object.length:Number(key),0,patch.value);else object[key]=patch.value;
          }
        }
        this.stateTimers ||= new Map();if(!this.stateTimers.has(conversationId)){const timer=setTimeout(()=>{this.stateTimers.delete(conversationId);this.emit('state',{threadId:conversationId,state:this.states.get(conversationId)});},16);timer.unref();this.stateTimers.set(conversationId,timer);}
      }
    }
  }
  async follow(threadId,{background=false}={}) {
    this.manualFollow ||= new Set();
    const found=await this.request('thread-owner-discovery',{hostId:'local',conversationId:threadId});
    if(!found.owner)throw fault('该会话没有在线桌面持有者；不会自动接管',409);
    if(!background)this.manualFollow.add(threadId);
    this.owners.set(threadId,found.owner);
    this.send({type:'broadcast',sourceClientId:this.clientId,targetClientIds:[found.owner],version:1,method:'thread-stream-following-changed',params:{hostId:'local',conversationId:threadId,following:true}});
    return this.states.get(threadId)||null;
  }
  unfollowBackground(threadId) {
    if(this.manualFollow?.has(threadId))return false;
    const owner=this.owners.get(threadId);
    if(owner&&this.socket?.writable)this.send({type:'broadcast',sourceClientId:this.clientId,targetClientIds:[owner],version:1,method:'thread-stream-following-changed',params:{hostId:'local',conversationId:threadId,following:false}});
    this.owners.delete(threadId);this.states.delete(threadId);
    clearTimeout(this.stateTimers?.get(threadId));this.stateTimers?.delete(threadId);return true;
  }
  queueControl(threadId,action,params){if(!['queue','removeQueued'].includes(action))throw fault('无效原生队列操作');return this.control(threadId,action,params,queueCapability);}
  async control(threadId,action,params={},capability) {
    if(['queue','removeQueued'].includes(action)&&capability!==queueCapability)throw fault('请使用专用队列接口',403);
    if(desktopReadOnly(threadId))throw fault('当前管理会话受保护，只读',403);
    const creator=threadPrincipals(this.accountHome||home).get(threadId);if(creator&&creator!==principal(this.accountHome||home))throw fault('这个桌面会话属于之前的账号，请切换回原账号后操作',409);
    if(action==='interrupt'&&(typeof params.expectedTurnId!=='string'||!params.expectedTurnId))throw fault('停止操作必须指定当前轮次，请刷新聊天后重试',409);
    await this.follow(threadId);
    if(action==='send'&&params.expectedIdleTurnId){
      const state=this.states.get(threadId),turns=desktopTurns(state),last=turns.at(-1);
      if(!last||(last.turnId||last.id)!==params.expectedIdleTurnId||(last.status?.type||last.status)!=='completed'||activeDesktopTurn(state)||['active','running','inProgress','busy'].includes(state?.threadRuntimeStatus?.type)||(state?.requests||[]).some(request=>request.completed!==true&&request.request?.completed!==true))throw fault('问题所属轮次已变化，请刷新聊天',409);
      const {expectedIdleTurnId,...nativeParams}=params;params=nativeParams;
    }
    if(action==='steer'&&params.expectedTurnId&&activeDesktopTurn(this.states.get(threadId))!==params.expectedTurnId)throw fault('问题所属轮次已变化，请刷新聊天',409);
    // The desktop renderer reads text_elements directly, unlike the native
    // app-server which accepts omitted arrays. Normalize both send and steer.
    const desktopInput=input=>Array.isArray(input)?input.map(item=>item?.type==='text'?{...item,text_elements:Array.isArray(item.text_elements)?item.text_elements:[]}:item):input;
    if(action==='send'&&params.turnStart?.request)params={...params,turnStart:{...params.turnStart,request:{...params.turnStart.request,input:desktopInput(params.turnStart.request.input)}}};
    if(action==='steer'){
      const input=desktopInput(params.input),id=randomUUID(),cwd=this.states.get(threadId)?.cwd;
      // The desktop coordinator needs a restorable composer message, in
      // addition to the app-server input, for optimistic steering history.
      params={...params,input,clientUserMessageId:id,restoreMessage:{id,cwd,content:input,context:{workspaceRoots:cwd?[cwd]:[],commentAttachments:[]}}};
    }
    if(action==='send'&&params.turnStart?.request){const {sandbox,...request}=params.turnStart.request;if(sandbox!==undefined){if(!['read-only','workspace-write','danger-full-access'].includes(sandbox))throw fault('无效桌面访问权限');const cwd=this.states.get(threadId)?.cwd;if(sandbox==='workspace-write'&&(!cwd||!path.isAbsolute(cwd)))throw fault('桌面工作目录尚未同步，未发送消息',409);const sandboxPolicy=sandbox==='read-only'?{type:'readOnly',networkAccess:false}:sandbox==='workspace-write'?{type:'workspaceWrite',writableRoots:[cwd],networkAccess:false}:{type:'dangerFullAccess'};params={...params,turnStart:{...params.turnStart,request:{...request,sandboxPolicy},context:{...params.turnStart.context,useAppServerPermissionDefault:false,usePermissionSelection:false}}};}}
    if(action==='compact'){
      const state=this.states.get(threadId);if(!state)throw fault('等待桌面状态同步',409);const turns=Object.values(state?.turnHistory?.history?.entitiesByKey||{});turns.push(...state?.turns||[]);
      if(turns.some(turn=>turn.status==='inProgress')||['active','running','inProgress','busy'].includes(state?.threadRuntimeStatus?.type)||(state?.requests||[]).some(request=>request.completed!==true))throw fault('请等待当前轮次和审批结束后再压缩上下文',409);
      params={};
    }
    if(action==='settings'){
      const {desktopThreadSettings}=await import('./desktop-settings.js?v='+fs.statSync(new URL('./desktop-settings.js',import.meta.url)).mtimeMs);
      params={threadSettings:desktopThreadSettings(params,this.states.get(threadId))};
    }
    if(action==='interrupt')params={expectedTurnId:params.expectedTurnId,mode:'user-stop'};
    if(['permissions','mcp'].includes(action)){
      const pending=this.states.get(threadId)?.requests?.find(request=>String(request.id)===String(params.requestId)&&request.completed!==true);
      const method=action==='permissions'?'item/permissions/requestApproval':'mcpServer/elicitation/request';
      if(!pending||pending.method!==method)throw fault('审批已处理、尚未同步或类型不匹配',409);
      if(action==='permissions')validatePermissions(pending.params,params.response);else validateElicitation(pending.params,params.response);
    }
    const methods={compact:'thread-follower-compact-thread',settings:'thread-follower-update-thread-settings',queue:'thread-follower-set-queued-follow-ups-state',removeQueued:'thread-follower-remove-queued-message',send:'thread-follower-start-turn',steer:'thread-follower-steer-turn',interrupt:'thread-follower-interrupt-turn',command:'thread-follower-command-approval-decision',file:'thread-follower-file-approval-decision',question:'thread-follower-submit-user-input',permissions:'thread-follower-permissions-request-approval-response',mcp:'thread-follower-submit-mcp-server-elicitation-response'};
    if(!methods[action])throw fault('不支持的桌面操作');
    return this.request(methods[action],{...params,conversationId:threadId},true,this.owners.get(threadId));
  }
  close() {
    this.backgroundWatcher?.close();
    if(this.socket?.writable)for(const [threadId,owner]of this.owners)this.send({type:'broadcast',sourceClientId:this.clientId,targetClientIds:[owner],version:1,method:'thread-stream-following-changed',params:{hostId:'local',conversationId:threadId,following:false}});
    this.socket?.destroy();
  }
}
export class DesktopHistory {
  constructor(directory=home){this.home=directory;this.files=new Map();this.rows=[];this.refreshed=0;}
  list(){
    if(Date.now()-this.refreshed<15000)return this.rows;
    this.files.clear();this.rows=[];const directoryHome=this.home||home,titles=desktopTitles(directoryHome),identity=principal(directoryHome),identities=threadPrincipals(directoryHome);
    const directory=path.join(directoryHome,'sessions');if(!fs.existsSync(directory))return [];
    for(const name of fs.readdirSync(directory,{recursive:true}).filter(f=>f.endsWith('.jsonl'))){
      const file=path.join(directory,name);let fd;
      try{fd=fs.openSync(file,'r');const head=Buffer.alloc(32768);const n=fs.readSync(fd,head,0,head.length,0);const meta=JSON.parse(head.subarray(0,n).toString().split('\n')[0]);const p=meta.payload;if(meta.type!=='session_meta'||!p?.id)continue;
        this.files.set(p.id,file);this.rows.push({threadId:p.id,source:'desktop',verifiedPrincipal:identities.get(p.id)||null,identityEvidence:identities.has(p.id)?'native-creator-account':'unknown-native-history',accountMismatch:!!identities.get(p.id)&&identities.get(p.id)!==identity,name:titles.get(p.id)||p.cwd?.split(/[\\/]/).at(-1)||'桌面会话',cwd:p.cwd,updatedAt:fs.statSync(file).mtimeMs,protected:desktopReadOnly(p.id)});
      }catch{}finally{if(fd!==undefined)fs.closeSync(fd);}
    }this.refreshed=Date.now();return this.rows.sort((a,b)=>b.updatedAt-a.updatedAt);
  }
  read(id,options){return desktopHistoryPage(this,id,options);}
}
