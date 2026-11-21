import {EventEmitter} from 'node:events';
import {randomUUID,createHash} from 'node:crypto';
import {fault} from '../../src/storage.js';
import {principal} from './desktop.js';
import {RelayConnection} from './relay-client.js';
import {desktopThreadSettings} from './desktop-settings.js';
import {queueDraft,queueTarget} from '../../src/composer-queue.js';
import {validatePermissions,validateElicitation} from '../../public/codex/request-protocol.js';

export const relayCapabilities=Object.freeze({transport:'stdio-relay-v1',read:true,send:true,steer:true,interrupt:true,approvals:true,queue:true,queueAutomatic:false,queueRetry:false,queueSteer:false,settings:true,compact:true,attachments:true,edit:false});
const methods={command:'item/commandExecution/requestApproval',file:'item/fileChange/requestApproval',question:'item/tool/requestUserInput',permissions:'item/permissions/requestApproval',mcp:'mcpServer/elicitation/request'};
const active=state=>(state?.turns||[]).filter(t=>t.status==='inProgress');
const requestInput=input=>{
 if(!Array.isArray(input)||input.length>32)throw fault('无效原生输入',400);
 return input.map(item=>{if(!item||!['text','image','localImage','skill','mention'].includes(item.type))throw fault('不支持的原生输入',400);return item.type==='text'?{...item,text_elements:item.text_elements||[]}:item;});
};
export function relaySnapshot(result,previous={}){
 const thread=result.thread;if(!thread||!Array.isArray(thread.turns))throw fault('桌面未返回完整聊天状态',502);
 const settings={...previous.latestThreadSettings,...result.threadSettings,...thread.settings};
 if(thread.model!=null)settings.model=thread.model;if(thread.reasoningEffort!==undefined)settings.effort=thread.reasoningEffort;
 return {cwd:thread.cwd,turns:thread.turns,requests:result.pendingRequests||[],threadRuntimeStatus:thread.status||{type:thread.turns.some(t=>t.status==='inProgress')?'inProgress':'idle'},latestThreadSettings:settings,latestModel:settings.model,latestReasoningEffort:settings.effort,latestCollaborationMode:settings.collaborationMode,desktopCapabilities:relayCapabilities};
}
export class RelayDesktop extends EventEmitter{
 constructor(history,{connection=new RelayConnection(history.home),emit=()=>{},clock=Date.now}={}){super();Object.assign(this,{history,accountHome:history.home,connection,emitHost:emit,clock});this.capabilities=relayCapabilities;this.states=new Map();this.owners=new Map();this.manualFollow=new Set();this.pollTimes=new Map();this.pending=new Map();this.connected=false;}
 get socket(){return {writable:this.connected};}
 authorize(id,write=false){const row=this.history.list().find(row=>row.threadId===id);if(!row)throw fault('找不到本地桌面聊天',404);const identity=principal(this.accountHome);if(!identity)throw fault('桌面账号未登录',409);if(row.accountMismatch||row.verifiedPrincipal&&row.verifiedPrincipal!==identity)throw fault('请切换回聊天所属账号',409);if(write&&(row.protected||row.conflict||!row.verifiedPrincipal))throw fault('此聊天不可操作或无法确认账号归属',403);return row;}
 async status(){const status=await this.connection.call('status');this.connected=status.connected===true;return {...status,capabilities:this.capabilities};}
 async follow(id,{background=false}={}){
  this.authorize(id);if(!background){this.manualFollow.add(id);this.pollTimes.set(id,this.clock());this.start();}
  if(this.pending.has(id))return this.pending.get(id);
  const promise=(async()=>{try{const result=await this.connection.call('read',id,{});if(result.thread?.id!==id)throw fault('桌面返回了其他聊天',502);const state=relaySnapshot(result,this.states.get(id));this.connected=true;this.states.set(id,state);this.owners.set(id,'stdio-relay-v1');this.emit('state',{threadId:id,state});if(this.manualFollow.has(id))this.emitHost('desktop',{threadId:id,state});return state;}catch(error){this.connected=false;throw error;}})();this.pending.set(id,promise);try{return await promise;}finally{this.pending.delete(id);}
 }
 start(){if(this.timer)return;this.timer=setInterval(()=>{for(const id of this.manualFollow){if(this.clock()-(this.pollTimes.get(id)||0)>90000){this.manualFollow.delete(id);continue;}void this.follow(id,{background:true}).catch(()=>this.emitHost('desktop-offline',{transport:'stdio-relay-v1'}));}},3000);this.timer.unref();}
 async control(id,action,params={}){
  if(!['send','steer','interrupt','settings','compact',...Object.keys(methods)].includes(action))throw fault('桌面中继暂不支持此操作',409);
  this.authorize(id,true);const state=await this.follow(id,{background:true});this.authorize(id,true);
  if(action==='send'){
   const request=params.turnStart?.request;if(!request)throw fault('缺少原生发送参数',400);if(active(state).length||state.requests.some(r=>r.completed!==true))throw fault('请等待当前任务和审批结束，或使用队列',409);
   const native={};for(const key of ['model','effort','serviceTier','collaborationMode','approvalPolicy','approvalsReviewer','sandboxPolicy','permissions','turnTrigger'])if(request[key]!==undefined)native[key]=request[key];native.input=requestInput(request.input);native.requestId=params.requestId||randomUUID();return this.connection.call('send',id,native);
  }
  if(action==='steer'||action==='interrupt'){
   const running=active(state);if(running.length!==1)throw fault('当前轮次尚未同步或已结束',409);const turn=running[0].id||running[0].turnId,expected=params.expectedTurnId;if(expected&&expected!==turn)throw fault('轮次已变化，请刷新后重试',409);
   if(action==='interrupt'){if(!expected)throw fault('停止操作必须指定当前轮次',409);return this.connection.call('interrupt',id,{turnId:turn});}
   return this.connection.call('steer',id,{input:requestInput(params.input),expectedTurnId:turn,requestId:params.requestId||randomUUID()});
  }
  if(action==='settings'){const settings=desktopThreadSettings(params,state);if(settings.sandboxPolicy!==undefined&&settings.permissions===null)delete settings.permissions;const response=await this.connection.call('settings',id,settings);state.latestThreadSettings={...state.latestThreadSettings,...settings,...(settings.sandboxPolicy!==undefined?{permissions:null,activePermissionProfile:null}:{})};return {...response,applied:true};}
  if(action==='compact'){if(active(state).length||state.requests.length)throw fault('请等待当前任务与审批结束',409);return this.connection.call('compact',id,{});}
  const pending=state.requests.find(r=>String(r.id)===String(params.requestId)&&r.method===methods[action]&&r.completed!==true);if(!pending)throw fault('审批已处理、尚未同步或类型不匹配',409);
  const response=['command','file'].includes(action)?{decision:params.decision}:params.response;if(action==='permissions')validatePermissions(pending.params,response);if(action==='mcp')validateElicitation(pending.params,response);
  return this.connection.call('answer',id,{requestId:pending.id,kind:action,response});
 }
 request(){throw fault('请使用专用桌面业务操作',409);}
 queueControl(){throw fault('请使用原生共享队列操作',409);}
 unfollowBackground(id){if(this.manualFollow.has(id))return false;this.states.delete(id);this.owners.delete(id);return true;}
 close(){clearInterval(this.timer);}
}

const metadataKey='codex_web_queue_v1';
function fromNative(item){let saved;try{saved=JSON.parse(item.responsesapiClientMetadata?.[metadataKey]||'null');}catch{}const input=item.input||[],unsupported=input.some(i=>!['text','image','skill'].includes(i.type)||i.type==='image'&&(typeof i.url!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(i.url)));const text=input.filter(i=>i.type==='text').map(i=>i.text).join('\n');return {id:item.id,text:text||(unsupported?'原生附件消息（请在 App 中查看附件）':''),images:input.filter(i=>i.type==='image'&&typeof i.url==='string'&&i.url.startsWith('data:image/')).map(i=>({type:'image',url:i.url})),skill:input.find(i=>i.type==='skill')||null,params:{},policy:saved?.policy||{access:'workspace-write',approval:'automatic'},createdAt:saved?.createdAt||0,status:'queued',nativeClientUserMessageId:item.clientUserMessageId,nativeInputUnsupported:unsupported};}
const draftInput=draft=>[{type:'text',text:draft.text,text_elements:[]},...draft.images,...(draft.skill?[{type:'skill',...draft.skill}]:[])];
export class RelayComposerQueue{
 constructor(ctx,queue){this.ctx=ctx;this.queue=queue;this.snapshots=new Map();this.revisions=new Map();this.receipts=new Map();}
 close(){}
 async read(scope){const {threadId,mode}=queueTarget(scope);if(mode!=='desktop')throw fault('队列来源不匹配',400);this.ctx.desktop.authorize(threadId);let cursor,rows=[],cursors=new Set();for(let page=0;page<100;page++){const result=await this.ctx.desktop.connection.call('queueRead',threadId,{...(cursor?{cursor}:{}),limit:100});if(!Array.isArray(result.data))throw fault('原生队列格式错误',502);rows.push(...result.data);cursor=result.nextCursor;if(!cursor)break;if(cursors.has(cursor)||page===99)throw fault('原生队列分页异常',502);cursors.add(cursor);}const fingerprint=createHash('sha256').update(JSON.stringify(rows)).digest('hex'),previous=this.snapshots.get(scope);if(previous?.fingerprint!==fingerprint)this.revisions.set(scope,(this.revisions.get(scope)||0)+1);const result={scope,revision:this.revisions.get(scope)||1,items:rows.map(fromNative),nativeShared:true,reason:'原生队列按 App 当前设置执行；已有旧队列未迁移'};this.snapshots.set(scope,{fingerprint,rows,result});return result;}
 async update(scope,body){return this.queue.lock(scope,async()=>{
  const {threadId}=queueTarget(scope);this.ctx.desktop.authorize(threadId,true);const state=await this.read(scope),snapshot=this.snapshots.get(scope);
  if(body.action==='start'){if(typeof body.id!=='string'||!state.items.some(item=>item.id===body.id))throw fault('原生排队消息已变化',409);await this.ctx.desktop.connection.call('queueStart',threadId,{queuedSubmissionId:body.id});return this.read(scope);}
  if(body.action!==undefined)throw fault('原生共享队列暂不支持此子操作，请在 App 中操作',409);
  if(body.revision!==state.revision)throw fault('原生队列已更新，请刷新后重试',409);
  if(!Array.isArray(body.items)||body.items.length>100)throw fault('无效队列内容',400);const before=new Map(state.items.map(i=>[i.id,i])),drafts=body.items.map(item=>{const native=before.get(item.id);if(!native?.nativeInputUnsupported)return queueDraft(item);if(JSON.stringify([item.text,item.images,item.skill])!==JSON.stringify([native.text,native.images,native.skill]))throw fault('此消息包含原生附件，请在 App 中编辑',409);return native;});if(new Set(drafts.map(i=>i.id)).size!==drafts.length)throw fault('重复的队列消息',400);
  const fresh=drafts.filter(d=>!before.has(d.id)),removed=state.items.filter(i=>!drafts.some(d=>d.id===i.id)),changed=drafts.filter(d=>before.has(d.id)&&JSON.stringify([d.text,d.images,d.skill])!==JSON.stringify([before.get(d.id).text,before.get(d.id).images,before.get(d.id).skill]));
  const reordered=!fresh.length&&!removed.length&&!changed.length&&JSON.stringify(drafts.map(i=>i.id))!==JSON.stringify(state.items.map(i=>i.id));
  if(fresh.length+removed.length+changed.length+(reordered?1:0)>1)throw fault('请每次只修改一条原生排队消息或调整顺序',409);
  if(fresh.length){const draft=fresh[0],key=scope+':'+draft.id,fingerprint=JSON.stringify(draftInput(draft)),existing=this.receipts.get(key);if(existing){if(existing.fingerprint!==fingerprint)throw fault('消息标识已使用',409);await existing.promise;}else{if(this.receipts.size>=1000)throw fault('队列发送记录已满',409);const promise=this.ctx.desktop.connection.call('queueAdd',threadId,{clientUserMessageId:draft.id,requestId:draft.id,input:draftInput(draft),responsesapiClientMetadata:{[metadataKey]:JSON.stringify({createdAt:draft.createdAt,policy:draft.policy})}});this.receipts.set(key,{fingerprint,promise});await promise;}}
  if(removed.length)await this.ctx.desktop.connection.call('queueDelete',threadId,{queuedSubmissionId:removed[0].id});
  if(changed.length)await this.ctx.desktop.connection.call('queueUpdate',threadId,{queuedSubmissionId:changed[0].id,input:draftInput(changed[0])});
  if(reordered)await this.ctx.desktop.connection.call('queueReorder',threadId,{queuedSubmissionIds:drafts.map(i=>i.id)});
  void snapshot;return this.read(scope);
 });}
}
