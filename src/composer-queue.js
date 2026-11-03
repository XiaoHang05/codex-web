import {readJson,writeJson,fault} from './storage.js';
const effortValues=['none','minimal','low','medium','high','xhigh','max','ultra'];
export function queueTarget(scope){
 const match=/^(?:web:([a-zA-Z0-9_-]{1,48}):|desktop:)([a-zA-Z0-9_-]{1,80})$/.exec(scope||'');
 if(!match)throw fault('无效队列会话');return {scope,mode:match[1]?'web':'desktop',profile:match[1]||null,threadId:match[2]};
}
export function queueDraft(value){
 if(!value||typeof value.id!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(value.id)||typeof value.text!=='string'||value.text.length>200000)throw fault('无效排队消息');
 const images=value.images||[];if(!Array.isArray(images)||images.length>8||images.some(i=>i?.type!=='image'||typeof i.url!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(i.url)||i.url.length>=1500000))throw fault('无效排队图片');
 const skill=value.skill;if(skill&&(typeof skill.name!=='string'||skill.name.length>200||typeof skill.path!=='string'||skill.path.length>2048))throw fault('无效技能');
 if(!value.text.trim()&&!images.length)throw fault('排队消息不能为空');
 const policy=value.policy;if(!policy||!['read-only','workspace-write','full-access'].includes(policy.access)||!['manual','automatic','never'].includes(policy.approval))throw fault('无效队列权限');
 const p=value.params||{},params={};
 if(Object.keys(p).some(k=>!['model','effort','serviceTier','collaborationMode'].includes(k)))throw fault('无效队列参数');
 if(p.model!==undefined){if(typeof p.model!=='string'||!p.model||p.model.length>200)throw fault('无效模型');params.model=p.model;}
 if(p.effort!==undefined){if(!effortValues.includes(p.effort))throw fault('无效推理等级');params.effort=p.effort;}
 if(p.serviceTier!==undefined){if(!['default','fast','priority','ultrafast'].includes(p.serviceTier))throw fault('无效速度档位');params.serviceTier=p.serviceTier;}
 if(p.collaborationMode){const c=p.collaborationMode;if(!['plan','default'].includes(c.mode)||typeof c.settings?.model!=='string'||c.settings.model.length>200||!(c.settings.reasoning_effort==null||effortValues.includes(c.settings.reasoning_effort))||c.settings.developer_instructions!=null)throw fault('无效协作模式');params.collaborationMode={mode:c.mode,settings:{model:c.settings.model,reasoning_effort:c.settings.reasoning_effort??null,developer_instructions:null}};}
 return {id:value.id,text:value.text,images:images.map(i=>({type:'image',url:i.url})),skill:skill?{name:skill.name,path:skill.path}:null,params,policy:{access:policy.access,approval:policy.approval},createdAt:Number.isFinite(value.createdAt)?value.createdAt:Date.now(),status:'queued'};
}
export class ComposerQueue{
 constructor(file,adapter,{emit=()=>{}}={}){this.file=file;this.adapter=adapter;this.emit=emit;this.value=readJson(file,{version:1,queues:{}});this.locks=new Map();this.polling=false;for(const [scope,state]of Object.entries(this.value.queues))if(state.items.some(i=>i.status==='sending')){for(const item of state.items)if(item.status==='sending'){item.status='uncertain';item.error='服务重启前发送结果待确认';}this.commit(scope,state);}}
 start(){if(this.timer)return;this.timer=setInterval(()=>void this.poll(),2000);this.timer.unref();void this.poll();}
 close(){clearInterval(this.timer);this.timer=null;this.sharedQueue?.close();}
 state(scope){queueTarget(scope);return structuredClone(this.value.queues[scope]||{revision:0,items:[],seen:[],principal:null,wait:null});}
 public(scope){const {seen,principal,...state}=this.state(scope);return state;}
 commit(scope,state){const revision=(this.value.queues[scope]?.revision||0)+1,next={...this.value,queues:{...this.value.queues,[scope]:{...state,revision}}};writeJson(this.file,next);this.value=next;this.emit('composer-queue',{scope,revision});return this.public(scope);}
 lock(scope,run){const previous=this.locks.get(scope)||Promise.resolve();const operation=previous.catch(()=>{}).then(run);this.locks.set(scope,operation);operation.finally(()=>{if(this.locks.get(scope)===operation)this.locks.delete(scope);}).catch(()=>{});return operation;}
 async update(scope,{revision,items,action,id}){
  const target=queueTarget(scope);
  return this.lock(scope,async()=>{
   const principal=await this.adapter.authorize(target),state=this.state(scope);
   if(state.items.length&&state.principal!==principal)throw fault('队列属于之前的账号，请切换回原账号',409);
   if(action==='retry'){
    const head=state.items[0];if(!head||head.id!==id||!['sending','uncertain','failed'].includes(head.status))throw fault('队列已变化，请刷新后重试',409);
    head.status='queued';delete head.error;return this.commit(scope,state);
   }
   if(action==='steer'){
    const item=state.items.find(i=>i.id===id);if(!item||item.status==='sending'||item.status==='uncertain'||item.skill)throw fault('这条排队消息不能改为引导',409);
    const snapshot=await this.adapter.snapshot(target);if(!snapshot.activeId)throw fault('当前没有运行中的轮次',409);
    item.status='sending';this.commit(scope,state);
    try{await this.adapter.steer(target,item,snapshot.activeId);}catch(error){item.status='uncertain';item.error=error.message;this.commit(scope,state);throw error;}
    state.items=state.items.filter(i=>i.id!==id);return this.commit(scope,state);
   }
   if(!Array.isArray(items)||items.length>100)throw fault('队列最多保存 100 条');
   const incoming=items.map(queueDraft);if(new Set(incoming.map(i=>i.id)).size!==incoming.length)throw fault('重复的队列消息');
   if(action==='import'){
    for(const item of incoming)if(!state.seen.includes(item.id)&&!state.items.some(i=>i.id===item.id)){const old=items.find(i=>i.id===item.id);if(old.status&&old.status!=='queued'){item.status='uncertain';item.error='旧浏览器队列发送结果待确认';}state.items.push(item);state.seen.push(item.id);}
   }else{
    if(action!==undefined)throw fault('未知队列操作');
    if(revision!==state.revision)throw fault('队列已更新，请查看最新队列后重新操作',409);
    if(state.items.some(i=>i.status==='sending'))throw fault('队首正在发送，请稍后操作',409);
    const existing=new Map(state.items.map(i=>[i.id,i]));
    state.items=incoming.map(item=>{if(existing.has(item.id))return existing.get(item.id);if(state.seen.includes(item.id))throw fault('该消息已处理，请刷新队列',409);state.seen.push(item.id);return item;});
   }
   if(state.items.length>100||JSON.stringify(state.items).length>24*1024*1024)throw fault('排队消息过多或图片过大',413);
   state.principal=principal;delete state.reason;return this.commit(scope,state);
  });
 }
 async poll(){
  if(this.polling)return;this.polling=true;
  try{await Promise.allSettled(Object.keys(this.value.queues).filter(s=>this.value.queues[s].items.length).map(scope=>this.lock(scope,()=>this.dispatch(scope))));}finally{this.polling=false;}
 }
 async dispatch(scope){
  if(scope.startsWith('desktop:')&&this.sharedQueue){await this.sharedQueue.migrate(scope);return;}
  let state=this.state(scope);const item=state.items[0],target=queueTarget(scope);if(!item||item.status!=='queued')return;
  try{
   const principal=await this.adapter.authorize(target);if(principal!==state.principal)throw fault('账号已变化，队列等待原账号');
   const snapshot=await this.adapter.snapshot(target);
   if(state.reason){delete state.reason;this.commit(scope,state);state=this.state(scope);}
   if(state.wait){const found=snapshot.turnIds.filter(id=>!state.wait.baseline.includes(id));if(!found.length)return;state.wait=null;this.commit(scope,state);state=this.state(scope);}
   if(snapshot.busy)return;
   state.items[0].status='sending';delete state.reason;this.commit(scope,state);
   // Save the sending marker before the native call. An interrupted/ambiguous
   // request is never automatically resent after browser or server restarts.
   let result;
   this.emit('composer-queue-dispatch',{scope,draft:item});
   try{result=await this.adapter.send(target,item);}catch(error){state=this.state(scope);state.items[0].status='uncertain';state.items[0].error=error.message;this.commit(scope,state);this.emit('composer-queue-send-uncertain',{scope,id:item.id});return;}
   state=this.state(scope);state.items.shift();state.wait={baseline:snapshot.turnIds,acceptedTurnId:result?.turn?.id||null};this.commit(scope,state);this.emit('composer-queue-sent',{scope,id:item.id,draft:item,turn:result?.turn});
  }catch(error){state=this.state(scope);if(state.reason!==error.message){state.reason=error.message;if(state.items[0]?.status==='sending'){state.items[0].status='uncertain';state.items[0].error=error.message;}this.commit(scope,state);}}
 }
}
