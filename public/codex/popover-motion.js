// Upward popovers reveal and hide from the same fixed bottom edge. No vertical
// translation or center scaling, including interrupted close/open sequences.
const animations=new WeakMap();
function move(panel,closing,finish,direction='up'){
 const previous=animations.get(panel),current=previous?{clipPath:getComputedStyle(panel).clipPath,opacity:getComputedStyle(panel).opacity}:null;animations.delete(panel);previous?.cancel();
 panel.style.animation='none';panel.style.transform='none';
 if(!closing){panel.hidden=false;panel.inert=false;panel.removeAttribute('aria-hidden');}
 else{panel.inert=true;panel.setAttribute('aria-hidden','true');}
 if(matchMedia('(prefers-reduced-motion:reduce)').matches){finish?.();return;}
 const collapsed={clipPath:direction==='up'?'inset(100% 0 0 0 round 13px)':'inset(0 0 100% 0 round 13px)',opacity:0},expanded={clipPath:'inset(0 0 0 0 round 13px)',opacity:1};
 const animation=panel.animate([current||(closing?expanded:collapsed),closing?collapsed:expanded],{duration:closing?160:200,easing:'cubic-bezier(.2,.7,.2,1)',fill:'both'});
 animations.set(panel,animation);
 animation.finished.then(()=>{if(animations.get(panel)!==animation)return;animations.delete(panel);finish?.();animation.cancel();}).catch(()=>{});
}
export function openUpPopover(panel){move(panel,false);}
export function closeUpPopover(panel,finish=()=>panel.remove()){move(panel,true,finish);}
export function openDownPopover(panel){move(panel,false,undefined,'down');}
export function closeDownPopover(panel,finish=()=>panel.remove()){move(panel,true,finish,'down');}
