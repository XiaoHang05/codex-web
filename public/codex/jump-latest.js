import {nearBottom} from './scroll-policy.js';
const itemKey=item=>item.id||[item._turnId,item.type].join(':');
const signature=item=>JSON.stringify([item.type,item.text,item.content,item.summary,item.output,item.aggregatedOutput,item.status,item._running,item._replyComplete,item.changes,item.attempt,item.windowNumber]);
export function jumpLatest(scroller){
 const controls=document.createElement('div');controls.className='jump-latest-controls';controls.hidden=true;
 const bottom=document.createElement('button');bottom.type='button';bottom.className='jump-latest';bottom.setAttribute('aria-label','回到最新消息');bottom.title='回到最新消息';bottom.innerHTML='<svg class="jump-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14m-6-6 6 6 6-6"/></svg><svg class="jump-dots" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
 controls.append(bottom);scroller.parentElement.append(controls);
 let hasUnread=false,scope=null,previous=new Map(),jumpFrame=0;
 const gap=()=>scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight;
 const sync=()=>{
  if(gap()<=2)hasUnread=false;
  controls.hidden=nearBottom(scroller);
  controls.classList.toggle('has-unread',hasUnread);
  bottom.setAttribute('aria-label',hasUnread?'有新消息，回到最新消息':'回到最新消息');bottom.title=hasUnread?'有新消息，回到最新消息':'回到最新消息';
  const parent=scroller.parentElement.getBoundingClientRect(),bounds=scroller.getBoundingClientRect();controls.style.bottom=(parent.bottom-bounds.bottom+12)+'px';
 };
 const cancel=()=>{cancelAnimationFrame(jumpFrame);jumpFrame=0;};
 const jump=()=>{
  cancel();const start=scroller.scrollTop,started=performance.now();
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){scroller.scrollTo({top:scroller.scrollHeight,behavior:'instant'});sync();return;}
  const step=now=>{const progress=Math.min(1,(now-started)/260),target=scroller.scrollHeight-scroller.clientHeight;scroller.scrollTo({top:start+(target-start)*(1-Math.pow(1-progress,3)),behavior:'instant'});if(progress<1)jumpFrame=requestAnimationFrame(step);else{jumpFrame=0;sync();}};jumpFrame=requestAnimationFrame(step);
 };
 bottom.onclick=jump;
 scroller.addEventListener('wheel',cancel,{passive:true});scroller.addEventListener('touchstart',cancel,{passive:true});scroller.addEventListener('scroll',sync,{passive:true});new ResizeObserver(sync).observe(scroller);
 window.addEventListener('appearancechange',sync);
 return {sync,items(items,context){
  const nextScope=context?[context.mode,context.profile||'',context.threadId].join(':'):null;
  const next=new Map(items.map(item=>[itemKey(item),signature(item)]));
  if(nextScope!==scope){cancel();hasUnread=false;previous=new Map();scope=nextScope;}
  if(previous.size&&!nearBottom(scroller)){
   const lastShared=items.findLastIndex(item=>previous.has(itemKey(item)));
   // Older pages inserted before the shared timeline do not create unread
   // activity; appended records and changes to existing records do.
   const changed=items.some(item=>previous.has(itemKey(item))&&previous.get(itemKey(item))!==next.get(itemKey(item)));
   if(changed||items.length>lastShared+1)hasUnread=true;
  }
  previous=next;sync();
 }};
}
