export function mountMobileTopbar(){
  const header=document.querySelector('.chat-header'),messages=document.getElementById('messages');
  if(!header||!messages)return;
  const styles=document.createElement('link');styles.rel='stylesheet';styles.href='/codex/mobile-topbar.css';document.head.append(styles);
  const wrapper=document.createElement('div');wrapper.className='mobile-topbar';header.before(wrapper);wrapper.append(header);
  const sidebarToggle=document.getElementById('toggle-sidebar');
  const capsule=document.createElement('button');capsule.type='button';capsule.className='mobile-menu-capsule';capsule.setAttribute('aria-label','打开项目与会话');capsule.setAttribute('aria-controls','sidebar');capsule.setAttribute('aria-hidden','true');capsule.inert=true;
  capsule.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';
  wrapper.after(capsule);
  capsule.onclick=()=>{show();sidebarToggle?.click();};
  const mobile=matchMedia('(max-width:760px)');
  let hidden=false,gesture=null,distance=0,lastDirection=0;
  function locked(){return document.body.classList.contains('sidebar-open')||!!wrapper.querySelector('details[open]')||(wrapper.contains(document.activeElement)&&document.activeElement.matches(':focus-visible'));}
  function show(){hidden=false;wrapper.classList.remove('is-retracted');wrapper.inert=false;capsule.classList.remove('is-visible');capsule.inert=true;capsule.setAttribute('aria-hidden','true');distance=0;lastDirection=0;}
  function move(delta){
    if(!mobile.matches||locked()){show();return;}
    if(Math.abs(delta)<1)return;
    const direction=Math.sign(delta);
    if(direction!==lastDirection)distance=0;
    lastDirection=direction;distance+=Math.abs(delta);
    if(distance<14)return;
    if(direction<0){show();return;}
    if(messages.scrollHeight<=messages.clientHeight+2)return;
    if(!hidden){hidden=true;wrapper.classList.add('is-retracted');wrapper.inert=true;if(sidebarToggle){capsule.classList.add('is-visible');capsule.inert=false;capsule.setAttribute('aria-hidden','false');}}
    distance=0;
  }
  // Ignore gestures inside independently scrolling code or work panes.
  function nestedScroller(target){
    for(let node=target instanceof Element?target:null;node&&node!==messages;node=node.parentElement){
      const css=getComputedStyle(node);
      if(/auto|scroll/.test(css.overflowY)&&node.scrollHeight>node.clientHeight+2)return true;
      if(/auto|scroll/.test(css.overflowX)&&node.scrollWidth>node.clientWidth+2)return true;
    }
    return false;
  }
  messages.addEventListener('touchstart',event=>{
    gesture=event.touches.length===1&&!nestedScroller(event.target)?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;
    distance=0;lastDirection=0;
  },{passive:true});
  messages.addEventListener('touchmove',event=>{
    if(!gesture||event.touches.length!==1){gesture=null;return;}
    const touch=event.touches[0],dx=touch.clientX-gesture.x,dy=gesture.y-touch.clientY;
    if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>8){gesture=null;return;}
    move(dy);gesture={x:touch.clientX,y:touch.clientY};
  },{passive:true});
  for(const type of ['touchend','touchcancel'])messages.addEventListener(type,()=>{gesture=null;},{passive:true});
  messages.addEventListener('wheel',event=>{if(!nestedScroller(event.target)&&Math.abs(event.deltaY)>Math.abs(event.deltaX))move(event.deltaY);},{passive:true});
  // Streaming updates and restored scroll positions deliberately do not drive this UI.
  mobile.addEventListener('change',show);
  wrapper.addEventListener('focusin',show);
  wrapper.addEventListener('toggle',()=>{if(locked())show();},true);
  new MutationObserver(()=>{if(locked())show();}).observe(document.body,{attributes:true,attributeFilter:['class']});
  const measure=()=>wrapper.style.setProperty('--mobile-topbar-height',`${wrapper.getBoundingClientRect().height}px`);
  new ResizeObserver(measure).observe(wrapper);
  measure();
  return {show};
}
