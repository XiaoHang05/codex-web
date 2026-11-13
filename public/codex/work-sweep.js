// Rendering streamed work may replace the label or its entire group. Keep the
// CSS animation on the same document-timeline clock for the duration of a turn.
export function workSweepClock(){
 let scope,starts=new Map();
 return (root,nextScope)=>{
  if(scope!==nextScope){scope=nextScope;starts.clear();}
  const active=new Set();
  for(const label of root.querySelectorAll('.work-live-text')){
   const turn=label.closest('[data-turn-id]')?.dataset.turnId;
   if(!turn)continue;
   active.add(turn);
   for(const animation of label.getAnimations()){
    if(animation.animationName!=='work-sweep')continue;
    if(!starts.has(turn))starts.set(turn,animation.startTime??document.timeline.currentTime);
    const start=starts.get(turn);
    if(start!=null&&animation.startTime!==start)animation.startTime=start;
   }
  }
  for(const turn of starts.keys())if(!active.has(turn))starts.delete(turn);
 };
}
