const reply=item=>['agentMessage','plan'].includes(item?.type);
const discardedByItems=new WeakMap();
export function discardReplyDrafts(items,{turnId,discardedReplyIds}={}){
 let discarded=discardedByItems.get(items);if(!discarded){discarded=new Set();discardedByItems.set(items,discarded);}
 const ids=Array.isArray(discardedReplyIds)?discardedReplyIds:[...items.values()].filter(item=>reply(item)&&item._turnId===turnId&&item._running).map(item=>item.id);
 for(const id of ids){discarded.add(id);items.delete(id);}
}
export function acceptReplyItem(items,item,{completed=false}={}){
 if(reply(item)&&discardedByItems.get(items)?.has(item.id))return;
 const previous=items.get(item.id);
 if(!reply(item)||!previous){items.set(item.id,item);return;}
 if(!completed&&(previous._turnStatus==='completed'||item._streamRevision!==undefined&&item._streamRevision<(previous._streamRevision||0)))return;
 if(!completed&&previous.text&&(!item.text||previous.text.startsWith(item.text)))item={...item,text:previous.text,_streamRevision:Math.max(item._streamRevision||0,previous._streamRevision||0),_textOffset:previous._textOffset};
 items.set(item.id,item);
}
export function appendReplyDelta(items,params,type){
 if(discardedByItems.get(items)?.has(params.itemId))return;
 const previous=items.get(params.itemId),revision=params.streamRevision;
 if(previous?._turnStatus==='completed')return previous;
 if(revision!==undefined&&revision<=(previous?._streamRevision||0))return previous;
 const item=previous||{id:params.itemId,type,text:'',_running:true,_turnId:params.turnId,_turnStatus:'inProgress'};
 const offset=params.textOffset;
 if(offset===undefined)item.text=(item.text||'')+params.delta;
 else{
  const start=item._textOffset||0,end=start+(item.text||'').length;
  if(!previous){item._textOffset=offset;item.text=params.delta;}
  else if(offset<=end&&offset>=start)item.text=(item.text||'')+params.delta.slice(Math.max(0,end-offset));
  else if(offset>end){item._replyGap=true;}
 }
 if(revision!==undefined)item._streamRevision=revision;
 items.set(item.id,item);return item;
}
export function mergeReplyRead(items,previous,{turns=[]}={}){
 const terminalTurns=new Set(turns.filter(turn=>['completed','interrupted','failed'].includes(turn.status)).map(turn=>turn.id));
 for(const turn of turns)if(turn.webDiscardedReplyIds?.length)discardReplyDrafts(items,{turnId:turn.id,discardedReplyIds:turn.webDiscardedReplyIds});
 const discarded=discardedByItems.get(items);
 for(const id of discarded||[])items.delete(id);
 for(const live of previous.values()){
  if(!reply(live)||discarded?.has(live.id))continue;const snapshot=items.get(live.id);
  if(terminalTurns.has(live._turnId))continue;
  if(!snapshot){if(live._running||live._streamRevision)items.set(live.id,live);continue;}
  if(snapshot._turnStatus==='completed')continue;
  if((snapshot._streamRevision||0)>=(live._streamRevision||0)&&snapshot._streamRevision!==undefined)continue;
  if(live._replyGap)continue;
  const offset=live._textOffset||0,prefix=snapshot.text||'',tail=live.text||'';
  if(prefix.length>=offset&&prefix.length<offset+tail.length){
   snapshot.text=prefix+tail.slice(prefix.length-offset);snapshot._streamRevision=live._streamRevision;
  }else if(!offset&&tail.startsWith(prefix)){snapshot.text=tail;snapshot._streamRevision=live._streamRevision;}
 }
}
