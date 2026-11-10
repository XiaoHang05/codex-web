// Animate a layout change as one transaction. Translations keep text sharp;
// nested targets subtract their parent's movement instead of moving twice.
export const layoutTiming={duration:220,easing:'cubic-bezier(.2,.7,.2,1)'};
export function observeLayoutMotion(root,{selector,key=node=>node}={}){
 const reduced=matchMedia('(prefers-reduced-motion:reduce)'),animations=new Map(),ghosts=new Set(),exits=new Map();
 let previous=new Map(),frame=0,tick=0,stopped=false;
 const targets=()=>[...root.querySelectorAll(selector)].filter(node=>!node.closest('[data-layout-ghost]'));
 const visible=node=>node.isConnected&&node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden';
 function snapshot(){
  const next=new Map();
  for(const node of targets())if(visible(node)){
   const rect=node.getBoundingClientRect();if(!rect.width||!rect.height)continue;
   next.set(key(node),{node,rect,opacity:getComputedStyle(node).opacity,text:node.textContent,clone:node.cloneNode(true),parentClass:node.parentElement.className});
  }
  return next;
 }
 function cancel(){
  for(const animation of animations.values())animation.cancel();animations.clear();
  for(const ghost of ghosts)ghost.remove();ghosts.clear();exits.clear();cancelAnimationFrame(tick);tick=0;
 }
 function animate(node,frames,finish){
  const animation=node.animate(frames,layoutTiming);animations.set(node,animation);
  animation.finished.then(()=>{if(animations.get(node)!==animation)return;animations.delete(node);finish?.();}).catch(()=>{});
 }
 function follow(){
  tick=0;
  // Store visual positions every frame so an interrupted transition resumes
  // from where it is now, including rapid on/off/on interactions.
  for(const entry of previous.values())if(visible(entry.node)){entry.rect=entry.node.getBoundingClientRect();entry.opacity=getComputedStyle(entry.node).opacity;}
  if(animations.size)tick=requestAnimationFrame(follow);
 }
 function flush(){
  frame=0;if(stopped)return;
  const before=new Map(previous);
  for(const [id,{entry,ghost}]of exits)before.set(id,{...entry,rect:ghost.getBoundingClientRect(),opacity:getComputedStyle(ghost).opacity});
  cancel();const next=snapshot();previous=next;
  if(reduced.matches||document.body.hasAttribute('data-booting')||!before.size)return;
  const movement=new Map();
  for(const [id,entry]of next){const old=before.get(id);if(old)movement.set(entry.node,{x:old.rect.left-entry.rect.left,y:old.rect.top-entry.rect.top});}
  for(const [id,entry]of next){
   const old=before.get(id),delta=movement.get(entry.node)||{x:0,y:0};
   let ancestor=entry.node.parentElement;while(ancestor&&ancestor!==root&&!movement.has(ancestor))ancestor=ancestor.parentElement;
   const parent=movement.get(ancestor)||{x:0,y:0},x=delta.x-parent.x,y=delta.y-parent.y;
   const entering=!old,changed=old&&old.text!==entry.text&&entry.node.childElementCount===0;
   if(entering||changed||Math.abs(x)>.5||Math.abs(y)>.5){
    const from={transform:`translate(${entering?0:x}px,${entering?3:y}px)`,opacity:entering||changed?0:old.opacity};
    animate(entry.node,[from,{transform:'translate(0,0)',opacity:entry.opacity}]);
   }
  }
  for(const [id,old]of before)if(!next.has(id)){
   // Exits leave layout immediately. A noninteractive visual copy fades while
   // the remaining real controls slide into place and stay fully usable.
   const ghost=document.createElement('div');ghost.className=old.parentClass;ghost.dataset.layoutGhost='';ghost.inert=true;ghost.setAttribute('aria-hidden','true');
   for(const node of [old.clone,...old.clone.querySelectorAll('[id]')]){node.removeAttribute('id');node.removeAttribute('name');}
   Object.assign(ghost.style,{position:'fixed',left:old.rect.left+'px',top:old.rect.top+'px',width:old.rect.width+'px',height:old.rect.height+'px',margin:'0',padding:'0',border:'0',background:'transparent',pointerEvents:'none',zIndex:'2',minWidth:'0',maxWidth:'none',overflow:'visible'});
   old.clone.hidden=false;Object.assign(old.clone.style,{margin:'0',width:old.rect.width+'px',height:old.rect.height+'px'});ghost.append(old.clone);root.append(ghost);ghosts.add(ghost);exits.set(id,{entry:old,ghost});
   animate(ghost,[{opacity:old.opacity,transform:'translateY(0)'},{opacity:0,transform:'translateY(-3px)'}],()=>{exits.delete(id);ghosts.delete(ghost);ghost.remove();});
  }
  if(animations.size)tick=requestAnimationFrame(follow);
 }
 const schedule=records=>{
  if(records?.every(record=>record.target.closest?.('[data-layout-ghost]')||record.type==='childList'&&[...record.addedNodes,...record.removedNodes].every(node=>node.nodeType===1&&node.hasAttribute('data-layout-ghost'))))return;
  if(!frame)frame=requestAnimationFrame(flush);
 };
 const observer=new MutationObserver(schedule);observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class']});
 const reset=()=>{cancelAnimationFrame(frame);frame=0;cancel();previous=snapshot();};
 window.addEventListener('resize',reset);root.addEventListener('scroll',reset,true);reduced.addEventListener('change',reset);previous=snapshot();
 return {refresh:schedule,stop(){stopped=true;observer.disconnect();window.removeEventListener('resize',reset);root.removeEventListener('scroll',reset,true);reduced.removeEventListener('change',reset);cancelAnimationFrame(frame);cancel();}};
}
