// Keep the native timeline as the spine. Insert archive-only entries at their
// nearest shared boundary; missing timestamps must never move an active turn.
function mergeOrder(archive,live){
 const result=[...live],present=new Set(live);
 let previous=null;
 for(let index=0;index<archive.length;index++){
  const entry=archive[index];
  if(present.has(entry)){previous=entry;continue;}
  let next=null;
  for(let following=index+1;following<archive.length;following++)if(present.has(archive[following])){next=archive[following];break;}
  const position=next!==null?result.indexOf(next):previous!==null?result.indexOf(previous)+1:0;
  result.splice(position,0,entry);previous=entry;
 }
 return result;
}
export function mergeDesktopHistory(archive,live){
 if(!live.length)return archive;
 const groups=new Map();
 const key=item=>item._turnId||'item:'+item.id;
 for(const item of [...archive,...live])if(!groups.has(key(item)))groups.set(key(item),{archive:[],live:[]});
 for(const [kind,items] of [['archive',archive],['live',live]])for(const item of items)groups.get(key(item))[kind].push(item);
 const signature=item=>item.type+'\0'+(item.text??item.content?.map(part=>part.text||'').join('\n')??'');
 const groupOrder=items=>[...new Set(items.map(item=>groups.get(key(item))))];
 const merged=mergeOrder(groupOrder(archive),groupOrder(live)).flatMap(group=>{
  group.live=group.live.map(native=>{
   if(native.type!=='userMessage'||native.content?.some(part=>['image','input_image','localImage'].includes(part.type)))return native;
   const saved=group.archive.find(item=>item.type==='userMessage'&&(item.id===native.id||signature(item)===signature(native))&&item.content?.length);
   return saved?{...native,content:saved.content}:native;
  });
  const ids=new Map(group.live.filter(item=>item.id).map(item=>[item.id,item])),used=new Set();
  // Reserve exact ID matches before matching messages with changed native IDs.
  for(const item of group.archive)if(ids.has(item.id))used.add(ids.get(item.id));
  const archived=group.archive.map(item=>{
   if(ids.has(item.id))return ids.get(item.id);
   const match=['userMessage','agentMessage'].includes(item.type)?group.live.find(candidate=>!used.has(candidate)&&signature(candidate)===signature(item)):null;
   if(match){used.add(match);return match;}return item;
  });
  return mergeOrder(archived,group.live);
 });
 // A compaction can happen inside a turn. Turn-level sorting would put it
 // after every live item of that turn, so restore its archive boundary.
 const markers=archive.filter(item=>item.type==='contextCompaction');
 const sameMarker=(item,marker)=>item.type==='contextCompaction'&&(item.id===marker.id||item.id===marker.nativeId||item.windowNumber!=null&&item.windowNumber===marker.windowNumber);
 const result=merged.filter(item=>!markers.some(marker=>sameMarker(item,marker)));
 const locate=item=>{const exact=result.findIndex(candidate=>candidate.id===item.id);if(exact>=0)return exact;return result.findIndex(candidate=>candidate._turnId===item._turnId&&signature(candidate)===signature(item));};
 for(const marker of markers){const at=archive.indexOf(marker);let position=-1;
  for(let index=at+1;index<archive.length;index++){const next=locate(archive[index]);if(next>=0){position=next;break;}}
  if(position<0)for(let index=at-1;index>=0;index--){const previous=locate(archive[index]);if(previous>=0){position=previous+1;break;}}
  const native=live.find(item=>sameMarker(item,marker));result.splice(position<0?result.length:position,0,native?{...native,...marker,contextStart:marker.contextStart||native.contextStart,message:marker.message||native.message}:marker);
 }
 return result;
}
export function historyPages({api,current,changed,notice,scroller}){
 let target=null,archive=[],cursor=null,more=false,busy=false,epoch=0;
 const button=document.createElement('button');button.type='button';button.className='history-load-earlier';button.dataset.item='history-load-earlier';
 const paint=()=>{button.textContent=busy?'正在加载更早消息…':'加载更早消息';button.disabled=busy;button.dataset.loading=String(busy);};paint();
 const load=async(initial=false)=>{
  if(!target||busy||!initial&&!more)return;
  const active=target,generation=epoch,oldCursor=cursor;busy=true;paint();
  const anchor=[...scroller.children].find(node=>node.dataset.item!=='history-load-earlier'&&node.getBoundingClientRect().bottom>scroller.getBoundingClientRect().top);
  const anchorKey=anchor?.dataset.item,anchorY=anchor?.getBoundingClientRect().top,top=scroller.scrollTop;
  try{
   const result=await api(`/codex-api/v1/desktop/${active.threadId}/history-page`+(initial?'':'?cursor='+encodeURIComponent(oldCursor)));
   if(generation!==epoch||current()!==active)return;
   archive=initial?result.items:[...result.items,...archive];cursor=result.nextCursor;more=!!result.hasMore;
   changed(archive);
   if(!initial){const node=[...scroller.children].find(node=>node.dataset.item===anchorKey);scroller.scrollTop=node?scroller.scrollTop+node.getBoundingClientRect().top-anchorY:top;}
  }finally{if(generation===epoch){busy=false;paint();}}
 };
 button.onclick=()=>load().catch(error=>notice(error.message));
 return {discardTurn(turnId){epoch++;busy=false;archive=archive.filter(item=>item._turnId!==turnId);paint();changed(archive);},reset(row=null){epoch++;target=row;archive=[];cursor=null;more=false;busy=false;paint();},start:()=>load(true),items:()=>archive,async restoreCount(count){const generation=epoch;while(generation===epoch&&more&&archive.length<count){const before=archive.length,previousCursor=cursor;await load();if(archive.length<=before||cursor===previousCursor)break;}},decorate(nodes){if(target&&current()===target&&more)nodes.splice(nodes[0]?.dataset.item==='session-context'?1:0,0,button);}};
}
