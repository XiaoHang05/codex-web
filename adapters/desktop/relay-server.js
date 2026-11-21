import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import {StringDecoder} from 'node:string_decoder';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {validatePermissions,validateElicitation} from '../../public/codex/request-protocol.js';

const MAX=32*1024*1024;
const GATEWAY_MAX=24*1024*1024;
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const idKey=id=>JSON.stringify([typeof id,id]);
const fields=(value,names)=>{if(!object(value)||Object.keys(value).some(key=>!names.includes(key)))throw error('Unsupported operation fields');return value;};
const required=(value,name)=>{if(typeof value!=='string'||!value.trim())throw error('Missing '+name);return value;};
const gatewayBytes=value=>{const data=Buffer.from(JSON.stringify(value));return data.length<=GATEWAY_MAX?data:Buffer.from(JSON.stringify({id:value.id,error:{message:'Desktop response is too large; use paginated history',status:413}}));};
const kinds={command:'item/commandExecution/requestApproval',file:'item/fileChange/requestApproval',question:'item/tool/requestUserInput',permissions:'item/permissions/requestApproval',mcp:'mcpServer/elicitation/request'};
export const relayCapabilities=Object.freeze({transport:'stdio-relay-v1',read:true,send:true,steer:true,interrupt:true,approvals:true,queue:true,queueAutomatic:false,queueRetry:false,queueSteer:false,settings:true,compact:true,attachments:true,edit:false});
const sendFields=['input','requestId','model','effort','serviceTier','collaborationMode','approvalPolicy','approvalsReviewer','sandboxPolicy','permissions','cwd','personality','summary','clientUserMessageId','turnTrigger','additionalContext','multiAgentMode'];
const settingsFields=['model','effort','serviceTier','collaborationMode','approvalPolicy','approvalsReviewer','sandboxPolicy','permissions','cwd','personality','summary','disabledPluginIds','environments','multiAgentMode'];
const operations={read:['thread/read',[]],loaded:['thread/loaded/list',[]],models:['model/list',['cursor','limit','includeHidden']],send:['turn/start',sendFields],steer:['turn/steer',['input','expectedTurnId','requestId']],interrupt:['turn/interrupt',['turnId']],settings:['thread/settings/update',settingsFields],compact:['thread/compact/start',[]],queueRead:['thread/queue/list',['cursor','limit']],queueAdd:['thread/queue/add',['clientUserMessageId','input','responsesapiClientMetadata','requestId']],queueUpdate:['thread/queue/update',['queuedSubmissionId','input','responsesapiClientMetadata']],queueDelete:['thread/queue/delete',['queuedSubmissionId']],queueReorder:['thread/queue/reorder',['queuedSubmissionIds']],queueStart:['thread/queue/start',['queuedSubmissionId']]};
Object.assign(operations,{skills:['skills/list',['cwds','forceReload']],mcp:['mcpServerStatus/list',['cursor','limit']],account:['account/read',['refreshToken']],limits:['account/rateLimits/read',[]],usage:['account/usage/read',[]]});
const globalReadActions=new Set(['loaded','models','skills','mcp','account','limits','usage']);

function validInput(input){
 if(!Array.isArray(input)||input.length>100)throw error('Invalid input');
 const allowed={text:['type','text','text_elements'],image:['type','url','fileId','detail'],localImage:['type','path','detail'],skill:['type','name','path'],mention:['type','name','path']};
 for(const item of input){if(!object(item)||!allowed[item.type])throw error('Unsupported input kind');fields(item,allowed[item.type]);if(item.type==='text'&&typeof item.text!=='string')throw error('Invalid text');if(item.type==='image'&&typeof item.url!=='string'&&typeof item.fileId!=='string')throw error('Invalid image');if(['localImage','skill','mention'].includes(item.type)&&typeof item.path!=='string')throw error('Invalid input path');}
}
function validateAnswer(pending,kind,response){
 if(kinds[kind]!==pending.method)throw error('Approval kind does not match',409);
 if(kind==='permissions')return validatePermissions(pending.params,response);
 if(kind==='mcp')return validateElicitation(pending.params,response);
 if(kind==='question'){
  fields(response,['answers']);if(!object(response.answers))throw error('Invalid question answers');
  const questions=pending.params?.questions||[],ids=new Set(questions.map(q=>q.id));
  if(Object.keys(response.answers).some(id=>!ids.has(id))||questions.some(q=>!object(response.answers[q.id])||!Array.isArray(response.answers[q.id].answers)||!response.answers[q.id].answers.length||response.answers[q.id].answers.some(a=>typeof a!=='string')))throw error('Question answer does not match pending questions');
  for(const answer of Object.values(response.answers))fields(answer,['answers']);return response;
 }
 fields(response,['decision']);
 const decision=response.decision;
 if(!['accept','acceptForSession','decline','cancel'].includes(decision)&&!(object(decision)&&kind==='command'&&Object.keys(decision).length===1&&('acceptWithExecpolicyAmendment'in decision||'applyNetworkPolicyAmendment'in decision)))throw error('Invalid approval decision');
 // Amendments are deliberately left to the desktop UI: they change policy.
 if(object(decision))throw error('Policy amendments require the desktop UI',409);
 return response;
}
export function relayDescriptorActive(home){
 try{const d=JSON.parse(fs.readFileSync(path.join(home,'desktop-relay.json'),'utf8'));if(d.format!==1||!Number.isInteger(d.relayPid)||d.home!==path.resolve(home))return false;try{process.kill(d.relayPid,0);return true;}catch(e){return e.code==='EPERM';}}catch{return false;}
}

export async function createDesktopRelay({child,input=process.stdin,output=process.stdout,home,pipe,timeoutMs=20000,closeChild=true}={}){
 if(!child?.stdin||!child.stdout||!home)throw error('A child and explicit home are required');
 home=path.resolve(home);fs.mkdirSync(home,{recursive:true});
 const lockFile=path.join(home,'desktop-relay.lock'),lockToken=randomUUID();let lock;
 try{lock=fs.openSync(lockFile,'wx',0o600);fs.writeFileSync(lock,JSON.stringify({pid:process.pid,token:lockToken}));fs.closeSync(lock);}catch(e){if(lock!==undefined)try{fs.closeSync(lock);}catch{}throw error('Desktop relay home is locked; verify its owner before retrying',409);}
 let leaseReleased=false;
 const releaseLease=()=>{if(leaseReleased)return;leaseReleased=true;try{if(JSON.parse(fs.readFileSync(lockFile,'utf8')).token===lockToken)fs.unlinkSync(lockFile);}catch{}};
 if(relayDescriptorActive(home)){releaseLease();throw error('An active desktop relay already owns this home',409);}
 const token=randomBytes(32).toString('hex'),prefix='desktop-relay-'+randomUUID()+':';
 pipe??=process.platform==='win32'?'\\\\.\\pipe\\codex-web-desktop-relay-'+randomUUID():path.join(os.tmpdir(),'codex-web-desktop-relay-'+randomUUID()+'.sock');
 const descriptor={format:1,pipe,token,relayPid:process.pid,nativePid:child.pid??null,home,capabilities:relayCapabilities};
 const file=path.join(home,'desktop-relay.json'),pending=new Map(),serverRequests=new Map(),settled=new Map(),receipts=new Map(),desktopInitializes=new Set(),desktopReads=new Map(),settings=new Map(),sockets=new Set();
 let initialized=false,closed=false,terminal=false;
 const status=()=>({connected:initialized&&!terminal,capabilities:relayCapabilities,relayPid:process.pid,nativePid:child.pid??null});
 const remember=(key)=>{settled.set(key,true);if(settled.size>10000)settled.delete(settled.keys().next().value);};
 const native=message=>{if(terminal||child.stdin.destroyed||!child.stdin.writable)throw error('Native desktop connection is closed; request was not retried',503);child.stdin.write(JSON.stringify(message)+'\n');};
 const desktop=message=>{if(!output.destroyed&&output.writable)output.write(JSON.stringify(message)+'\n');};
 const saveSettings=(id,value)=>{if(typeof id!=='string'||!object(value))return;const patch=Object.fromEntries(Object.entries(value).filter(([key,val])=>[...settingsFields,'activePermissionProfile'].includes(key)&&val!==undefined)),previous={...settings.get(id)};if(patch.sandboxPolicy!=null){delete previous.permissions;delete previous.activePermissionProfile;}if(patch.permissions!=null)delete previous.sandboxPolicy;settings.set(id,{...previous,...patch});};
 function rpc(method,params){
  if(!initialized||terminal)return Promise.reject(error('Desktop initialization has not completed',503));
  const id=prefix+randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(error('Native outcome unknown; no automatic retry',504));},timeoutMs);pending.set(id,{resolve,reject,timer});try{native({id,method,params});}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});
 }
 function onNative(message){
  if(!object(message))return;
  if(message.id!==undefined&&!message.method){
   const own=pending.get(message.id);if(own){pending.delete(message.id);clearTimeout(own.timer);message.error?own.reject(error(String(message.error.message||'Native request rejected'),409)):own.resolve(message.result);return;}
   if(typeof message.id==='string'&&message.id.startsWith(prefix))return;
   if(desktopInitializes.delete(idKey(message.id))&&!message.error)initialized=true;
   const observed=desktopReads.get(idKey(message.id));desktopReads.delete(idKey(message.id));if(observed&&!message.error){saveSettings(observed.threadId,observed);const result=message.result||{};saveSettings(result.thread?.id||observed.threadId,{...result,model:result.model??result.thread?.model,effort:result.reasoningEffort??result.thread?.reasoningEffort,sandboxPolicy:result.sandbox,activePermissionProfile:result.activePermissionProfile});}
  }
  if(message.method&&message.id!==undefined&&Object.values(kinds).includes(message.method)){const key=idKey(message.id);settled.delete(key);serverRequests.set(key,{id:message.id,method:message.method,params:message.params||{}});}
  if(message.method==='serverRequest/resolved'){const key=idKey(message.params?.requestId);serverRequests.delete(key);remember(key);}
  if(message.method==='thread/settings/updated')saveSettings(message.params?.threadId,message.params?.threadSettings||message.params?.settings||message.params);
  desktop(message);
 }
 function onDesktop(message){
  if(!object(message))throw error('Invalid desktop message');
  if(message.method==='initialize'&&message.id!==undefined)desktopInitializes.add(idKey(message.id));
  if(['turn/start','thread/start','thread/resume','thread/settings/update'].includes(message.method)&&message.id!==undefined&&object(message.params))desktopReads.set(idKey(message.id),message.params);
  if(typeof message.id==='string'&&message.id.startsWith(prefix))throw error('Reserved request namespace');
  if(message.id!==undefined&&!message.method){const key=idKey(message.id);if(settled.has(key))return;if(serverRequests.has(key)){serverRequests.delete(key);remember(key);}}
  native(message);
 }
 function consume(stream,handle){let buffer='';const decoder=new StringDecoder('utf8');const onData=chunk=>{buffer+=decoder.write(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));if(Buffer.byteLength(buffer)>MAX){terminate(error('Native frame exceeds limit',502));return;}let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;try{handle(JSON.parse(line));}catch(e){terminate(e);return;}}};stream.on('data',onData);return()=>stream.removeListener('data',onData);}
 const stopInput=consume(input,onDesktop),stopNative=consume(child.stdout,onNative);
 function terminate(reason=error('Native desktop disconnected; no automatic retry',503)){
  if(terminal)return;terminal=true;initialized=false;for(const p of pending.values()){clearTimeout(p.timer);p.reject(reason);}pending.clear();serverRequests.clear();
 }
 const childEnded=()=>{terminate();void close(false);},inputEnded=()=>void close(closeChild);
 child.once('exit',childEnded);child.once('error',childEnded);child.stdout.once('end',childEnded);child.stdin.on('error',childEnded);input.once('end',inputEnded);
 async function loaded(threadId){const result=await rpc('thread/loaded/list',{});if(!Array.isArray(result?.data)||!result.data.includes(threadId))throw error('Open this conversation in the desktop first; relay will not take ownership',409);}
 async function execute(action,threadId,params){
  if(action==='status'){fields(params,[]);return status();}
  if(action==='answer'){
   fields(params,['requestId','kind','response']);required(threadId,'threadId');const key=idKey(params.requestId),request=serverRequests.get(key);
   if(!request||request.params.threadId!==threadId)throw error('Pending request has already resolved or belongs to another conversation',409);
   const response=validateAnswer(request,params.kind,params.response);
   serverRequests.delete(key);remember(key);native({id:request.id,result:response});desktop({method:'serverRequest/resolved',params:{requestId:request.id,threadId}});return {answered:true};
  }
  const operation=operations[action];if(!operation)throw error('Unsupported desktop operation',409);
  fields(params,operation[1]);const [method]=operation;
  if(!globalReadActions.has(action))required(threadId,'threadId');
  if(action==='account'&&params.refreshToken!==undefined&&params.refreshToken!==false)throw error('Account reads cannot refresh authentication');
  if(['send','steer','queueAdd','queueUpdate'].includes(action))validInput(params.input);
  if(action==='steer')required(params.expectedTurnId,'expectedTurnId');
  if(action==='interrupt')required(params.turnId,'turnId');
  if(['queueUpdate','queueDelete'].includes(action))required(params.queuedSubmissionId,'queuedSubmissionId');
  if(action==='queueAdd')required(params.clientUserMessageId,'clientUserMessageId');
  if(action==='queueReorder'&&(!Array.isArray(params.queuedSubmissionIds)||params.queuedSubmissionIds.some(id=>typeof id!=='string')))throw error('Invalid queued submission IDs');
  if(action==='settings'&&params.permissions!=null&&params.sandboxPolicy!=null)throw error('permissions and sandboxPolicy are mutually exclusive');
  const args={...params};delete args.requestId;if(!globalReadActions.has(action))args.threadId=threadId;if(action==='read')args.includeTurns=true;if(action==='account')args.refreshToken=false;
  const perform=async()=>{if(!globalReadActions.has(action)&&!['read','queueRead'].includes(action))await loaded(threadId);const result=await rpc(method,args);if(action==='settings'||action==='send')saveSettings(threadId,args);if(action==='read')return {...result,threadSettings:settings.get(threadId)||{},pendingRequests:[...serverRequests.values()].filter(request=>request.params.threadId===threadId)};return result;};
  if(!['send','steer','queueAdd'].includes(action))return perform();
  required(params.requestId,'requestId');const key=threadId+':'+params.requestId,fingerprint=JSON.stringify([action,args]),previous=receipts.get(key);
  if(previous){if(previous.fingerprint!==fingerprint)throw error('Request identifier was already used for different input',409);return previous.promise;}
  if(receipts.size>=5000)throw error('Relay request receipt limit reached',409);
  // Save before any await. Ambiguous native outcomes are intentionally retained.
  const receipt={fingerprint};receipt.promise=perform();receipts.set(key,receipt);return receipt.promise;
 }
 const server=net.createServer(socket=>{
  sockets.add(socket);let buffer=Buffer.alloc(0),inflight=0;socket.setTimeout(60000,()=>socket.destroy());
  socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));
  socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(buffer.length>GATEWAY_MAX+4){socket.destroy();return;}while(buffer.length>=4){const size=buffer.readUInt32LE();if(!size||size>GATEWAY_MAX){socket.destroy();return;}if(buffer.length<size+4)return;const bytes=buffer.subarray(4,size+4);buffer=buffer.subarray(size+4);if(++inflight>32){socket.destroy();return;}void(async()=>{let request;const reply=value=>{if(socket.destroyed)return;const b=gatewayBytes(value),h=Buffer.alloc(4);h.writeUInt32LE(b.length);socket.write(Buffer.concat([h,b]));};try{request=JSON.parse(bytes);fields(request,['id','token','action','threadId','params']);const provided=typeof request.token==='string'?Buffer.from(request.token):Buffer.alloc(0),expected=Buffer.from(token);if(provided.length!==expected.length||!timingSafeEqual(provided,expected))throw error('Desktop relay authentication required',401);const result=await execute(request.action,request.threadId,request.params??{});reply({id:request.id,result});}catch(e){reply({id:request?.id??null,error:{message:e.status?e.message:'Desktop relay operation failed',status:e.status||500}});}finally{inflight--;}})();}});
 });
 const temporary=file+'.'+randomUUID()+'.tmp';
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(pipe,resolve);});if(terminal)throw error('Native desktop exited during relay startup',503);fs.writeFileSync(temporary,JSON.stringify(descriptor),{mode:0o600});fs.renameSync(temporary,file);}catch(e){await close(closeChild);try{fs.unlinkSync(temporary);}catch{}throw e;}
 async function close(kill=closeChild){if(closed)return;closed=true;terminate();stopInput();stopNative();input.removeListener('end',inputEnded);for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(()=>resolve()));try{const current=JSON.parse(fs.readFileSync(file,'utf8'));if(current.token===token&&current.pipe===pipe)fs.unlinkSync(file);}catch{}releaseLease();if(kill&&child.exitCode==null&&!child.killed)child.kill();}
 return {descriptor,status,close};
}
