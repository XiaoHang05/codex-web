import {nearBottom} from './scroll-policy.js';

export function keyboardBottom(messages,input,{beforeFollow=()=>{}}={}){
  const mobile=matchMedia('(max-width:760px)'),viewport=window.visualViewport;
  const height=()=>viewport?.height||innerHeight;
  let session=null,frame=0;
  const keyboardOpen=()=>session&&session.height-height()>80;
  function capture(){
    if(!mobile.matches||keyboardOpen())return;
    // Capture before focus/resize: the smaller viewport increases bottom distance.
    session={height:height(),follow:nearBottom(messages)};
  }
  function follows(){return !!(mobile.matches&&document.activeElement===input&&session?.follow&&keyboardOpen());}
  function sync(){
    if(!follows())return false;
    beforeFollow();messages.scrollTop=messages.scrollHeight;return true;
  }
  const refresh=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(sync);};
  const cancel=()=>{if(session)session.follow=false;cancelAnimationFrame(frame);};
  input.addEventListener('pointerdown',capture,{passive:true});
  input.addEventListener('focus',capture);
  input.addEventListener('blur',()=>{session=null;cancelAnimationFrame(frame);});
  for(const type of ['touchstart','wheel','pointerdown','keydown'])messages.addEventListener(type,cancel,{passive:true});
  mobile.addEventListener('change',()=>{session=null;});
  window.addEventListener('resize',refresh);viewport?.addEventListener('resize',refresh);
  new ResizeObserver(refresh).observe(messages);
  return {sync};
}
