// Full transient replies for refresh/reconnect; persisted history stays native.
const replyTypes=new Set(['agentMessage','plan']);
const terminal=status=>['completed','interrupted','failed'].includes(status);
const revision=instance=>instance.streamReplyRevision=(instance.streamReplyRevision||0)+1;
export function recordStreamReply(instance,message){
 const {method,params}=message;if(!params?.threadId||!params.turnId&&!params.turn?.id)return;
 const turnId=params.turnId||params.turn.id;
 instance.streamReplies??=new Map();const key=params.threadId+'\0'+turnId;
 let turn=instance.streamReplies.get(key);
 if(!turn){turn={threadId:params.threadId,id:turnId,status:'inProgress',items:new Map()};instance.streamReplies.set(key,turn);}
 turn.pending??=new Set();turn.discarded??=new Set();
 if(method==='error'&&params.willRetry){
  // A failed sampling attempt is rolled back by the engine. Its partial
  // messages must not survive in the refresh cache or browser timeline.
  params.discardedReplyIds=[...turn.pending];
  for(const id of turn.pending){turn.items.delete(id);turn.discarded.add(id);}
  turn.pending.clear();
 }
 if(method==='turn/completed')turn.status=params.turn.status||'completed';
 if(['item/started','item/completed'].includes(method)&&replyTypes.has(params.item?.type)){
  if(turn.discarded.has(params.item.id))return;
  if(method==='item/started')turn.pending.add(params.item.id);else turn.pending.delete(params.item.id);
  const previous=turn.items.get(params.item.id),item={...params.item,_streamRevision:revision(instance)};
  if(method==='item/started'&&previous?.text&&(!item.text||previous.text.startsWith(item.text)))item.text=previous.text;
  turn.items.set(item.id,item);params.item=item;
 }
 if(['item/agentMessage/delta','item/plan/delta'].includes(method)){
  if(turn.discarded.has(params.itemId))return;
  turn.pending.add(params.itemId);
  const item=turn.items.get(params.itemId)||{id:params.itemId,type:method==='item/plan/delta'?'plan':'agentMessage',text:''};
  params.textOffset=(item.text||'').length;params.streamRevision=revision(instance);
  item.text=(item.text||'')+params.delta;item._streamRevision=params.streamRevision;turn.items.set(item.id,item);
 }
 // Keep recent completed turns through the native persistence handoff.
 const completed=[...instance.streamReplies].filter(([,turn])=>turn.status!=='inProgress');
 while(completed.length>16)instance.streamReplies.delete(completed.shift()[0]);
}
export function streamReplySnapshot(instance,thread){
 const turns=(thread.turns||[]).map(turn=>({...turn,items:(turn.items||[]).map(item=>({...item}))}));
 for(const cached of instance.streamReplies?.values()||[]){
  if(cached.threadId!==thread.id||!cached.items.size&&!cached.discarded?.size)continue;
  let turn=turns.find(turn=>turn.id===cached.id);
  if(!turn){if(cached.status!=='inProgress')continue;turn={id:cached.id,status:cached.status,items:[]};turns.push(turn);}
  // A terminal native turn is authoritative, including items it omits.
  // Do not append abandoned attempts just because their IDs are absent.
  if(terminal(turn.status))continue;
  if(cached.discarded?.size){turn.webDiscardedReplyIds=[...cached.discarded];turn.items=turn.items.filter(item=>!cached.discarded.has(item.id));}
  for(const item of cached.items.values()){
   const index=turn.items.findIndex(existing=>existing.id===item.id);
   if(index>=0){const native=turn.items[index];turn.items[index]={...native,...item};}
   else turn.items.push({...item});
  }
 }
 return {...thread,turns};
}
