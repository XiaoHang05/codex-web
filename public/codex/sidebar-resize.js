export function sidebarResize(sidebar){
 const key='codex-sidebar-width',mobile=matchMedia('(max-width:760px)');
 const handle=document.createElement('div');handle.className='sidebar-resizer';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-label','调整侧边栏宽度');handle.setAttribute('aria-orientation','vertical');sidebar.append(handle);
 const limit=()=>Math.max(220,Math.min(520,innerWidth-360));
 const apply=value=>{const width=Math.round(Math.max(220,Math.min(limit(),value)));document.body.style.setProperty('--sidebar-width',width+'px');handle.setAttribute('aria-valuemin','220');handle.setAttribute('aria-valuemax',String(limit()));handle.setAttribute('aria-valuenow',String(width));return width;};
 let saved;try{saved=Number(localStorage.getItem(key));}catch{}apply(saved>=220?saved:260);
 const save=()=>{try{localStorage.setItem(key,handle.getAttribute('aria-valuenow'));}catch{}};
 handle.addEventListener('pointerdown',event=>{
  if(event.button!==0||mobile.matches)return;event.preventDefault();const start=event.clientX,width=sidebar.getBoundingClientRect().width;handle.setPointerCapture(event.pointerId);document.body.classList.add('sidebar-resizing');
  const move=event=>apply(width+event.clientX-start);
  const end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);handle.removeEventListener('lostpointercapture',end);document.body.classList.remove('sidebar-resizing');if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);save();};
  handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);handle.addEventListener('lostpointercapture',end);
 });
 handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();apply(event.key==='Home'?220:event.key==='End'?limit():Number(handle.getAttribute('aria-valuenow'))+(event.key==='ArrowRight'?10:-10));save();});
 window.addEventListener('resize',()=>apply(Number(handle.getAttribute('aria-valuenow'))));
}
