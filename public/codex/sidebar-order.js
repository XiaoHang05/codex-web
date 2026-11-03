export function sidebarOrdering(container,onSave){
 let suppressClick=false;
 const scroller=container.closest('.sidebar-history')||container;
 const groups=()=>[...container.querySelectorAll(':scope>.project')];
 const move=(node,before)=>{
  if(node.nextSibling===before)return;
  const positions=new Map(groups().map(group=>[group,group.getBoundingClientRect().top]));
  container.insertBefore(node,before);
  if(!matchMedia('(prefers-reduced-motion:reduce)').matches)for(const group of groups()){
   const delta=positions.get(group)-group.getBoundingClientRect().top;
   if(delta)group.animate([{transform:`translateY(${delta}px)`},{transform:'none'}],{duration:180,easing:'ease-out'});
  }
  void onSave({projects:groups().map(group=>group.dataset.project),threads:{}});
 };
 function startDrag(heading,point){
  const node=heading.parentElement;let before=node.nextSibling,ended=false;
  const items=groups(),index=items.indexOf(node),previous=items[index-1],next=items[index+1];
  document.body.classList.add('sidebar-sorting');node.classList.add('sorting-source');
  const ghost=document.createElement('div'),marker=document.createElement('div');
  ghost.className='sort-ghost';ghost.textContent=heading.querySelector('span:nth-child(2)')?.textContent||heading.textContent;
  ghost.style.width=Math.min(node.getBoundingClientRect().width,280)+'px';
  marker.className='sort-insertion';marker.setAttribute('aria-hidden','true');document.body.append(ghost);
  const drag=point=>{
   if(ended)return;
   ghost.style.left=(point.clientX+12)+'px';ghost.style.top=(point.clientY-14)+'px';
   const candidates=groups().filter(group=>group!==node);
   before=candidates.find(group=>{const b=group.getBoundingClientRect();return point.clientY<b.top+b.height/2;})||null;
   const bounds=scroller.getBoundingClientRect(),original=node.getBoundingClientRect();
   const y=previous&&next&&before===next?original.top+original.height/2:before?before.getBoundingClientRect().top:candidates.at(-1)?.getBoundingClientRect().bottom||bounds.top;
   marker.style.left=(bounds.left+4)+'px';marker.style.width=(bounds.width-8)+'px';marker.style.transform=`translateY(${Math.max(bounds.top,Math.min(bounds.bottom,y))}px)`;
   if(point.clientY<bounds.top+30)scroller.scrollTop-=12;else if(point.clientY>bounds.bottom-30)scroller.scrollTop+=12;
  };
  drag(point);
  document.body.append(marker);
  return {move:drag,end(commit){
   if(ended)return;ended=true;ghost.remove();marker.remove();node.classList.remove('sorting-source');document.body.classList.remove('sidebar-sorting');
   suppressClick=true;setTimeout(()=>suppressClick=false,350);
   if(commit&&node.isConnected)move(node,before?.isConnected?before:null);
  }};
 }
 container.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();event.stopPropagation();}},true);
 container.addEventListener('keydown',event=>{
  const heading=event.target.closest('.project>summary');if(!heading||!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();const node=heading.parentElement,items=groups(),index=items.indexOf(node),target=items[index+(event.key==='ArrowUp'?-1:1)];
  if(target){move(node,event.key==='ArrowUp'?target:target.nextSibling);heading.focus();}
 },true);
 container.addEventListener('pointerdown',event=>{
  const heading=event.target.closest('.project>summary');
  if(!heading||event.button!==0||event.pointerType==='touch'||event.target.closest('button,a,input'))return;
  const startX=event.clientX,startY=event.clientY;let operation;heading.setPointerCapture(event.pointerId);
  const drag=point=>{if(!operation&&Math.hypot(point.clientX-startX,point.clientY-startY)<5)return;if(!operation)operation=startDrag(heading,point);else operation.move(point);};
  const end=point=>{
   heading.removeEventListener('pointermove',drag);heading.removeEventListener('pointerup',end);heading.removeEventListener('pointercancel',end);heading.removeEventListener('lostpointercapture',end);
   if(heading.hasPointerCapture(event.pointerId))heading.releasePointerCapture(event.pointerId);
   operation?.end(point.type==='pointerup');
  };
  heading.addEventListener('pointermove',drag);heading.addEventListener('pointerup',end);heading.addEventListener('pointercancel',end);heading.addEventListener('lostpointercapture',end);
 });
 return {startDrag};
}
