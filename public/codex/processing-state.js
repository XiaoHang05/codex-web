// Keep a visible timing row even while a confirmed turn has no work items yet.
const starts=new Map();
export function retainUnpersistedTurn(items,previous,activeTurn,turns){
 if(!activeTurn||turns.some(turn=>turn.id===activeTurn))return null;
 for(const [key,item]of previous)if(item._turnId===activeTurn&&!items.has(key))items.set(key,item);
 return activeTurn;
}
export function withProcessingStatus(items,activeTurn){
 const result=[...items],turns=new Map();
 for(const item of items)if(item._turnId){
  const turn=turns.get(item._turnId)||{items:[]};turn.items.push(item);
  if(item._turnStatus)turn.status=item._turnStatus;
  if(item._processingStartedAt!=null)turn.started=item._processingStartedAt;
  turns.set(item._turnId,turn);
 }
 if(activeTurn&&!turns.has(activeTurn))turns.set(activeTurn,{items:[],status:'inProgress'});
 for(const [id,turn]of turns){
  if(turn.started!=null)starts.set(id,turn.started);
  if(turn.status!=='inProgress'&&id!==activeTurn)continue;
  if(!starts.has(id))starts.set(id,Date.now());
  if(turn.items.some(item=>item.type!=='userMessage'))continue;
  const marker={id:'processing-status:'+id,type:'processingStatus',_turnId:id,_turnStatus:'inProgress',_processingStartedAt:starts.get(id)};
  const index=result.findLastIndex(item=>item._turnId===id);
  result.splice(index<0?result.length:index+1,0,marker);
 }
 while(starts.size>512)starts.delete(starts.keys().next().value);
 return result.map(item=>item._turnStatus==='inProgress'&&item._processingStartedAt==null?{...item,_processingStartedAt:starts.get(item._turnId)}:item);
}
