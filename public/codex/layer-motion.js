const layers=new WeakMap();
function move(overlay,panel,closing,finish){
 const old=layers.get(overlay);
 const fromOverlay=old?getComputedStyle(overlay).opacity:closing?1:0;
 const fromPanel=old?getComputedStyle(panel).transform:closing?'none':'translateY(10px) scale(.98)';
 old?.forEach(animation=>animation.cancel());layers.delete(overlay);
 overlay.style.animation='none';panel.style.animation='none';overlay.inert=closing;
 if(matchMedia('(prefers-reduced-motion:reduce)').matches){finish?.();return;}
 const options={duration:closing?150:200,easing:'cubic-bezier(.2,.7,.2,1)',fill:'both'};
 const animations=[overlay.animate([{opacity:fromOverlay},{opacity:closing?0:1}],options),
  panel.animate([{transform:fromPanel},{transform:closing?'translateY(8px) scale(.985)':'none'}],options)];
 layers.set(overlay,animations);
 Promise.all(animations.map(animation=>animation.finished)).then(()=>{
  if(layers.get(overlay)!==animations)return;
  layers.delete(overlay);finish?.();animations.forEach(animation=>animation.cancel());
 }).catch(()=>{});
}
export function openLayer(overlay,panel=overlay.firstElementChild){move(overlay,panel,false);}
export function closeLayer(overlay,finish=()=>overlay.remove(),panel=overlay.firstElementChild){
 if(overlay.inert)return;move(overlay,panel,true,finish);
}

const regions=new WeakMap();
export function revealRegion(element,show){
 const old=regions.get(element),height=old?element.getBoundingClientRect().height:show?0:element.getBoundingClientRect().height;
 const opacity=old?getComputedStyle(element).opacity:show?0:1;
 const saved=old?.saved||{minHeight:element.style.minHeight,overflow:element.style.overflow};
 old?.animation.cancel();regions.delete(element);
 element.style.minHeight=saved.minHeight;element.style.overflow=saved.overflow;
 element.hidden=false;element.inert=!show;
 const target=show?element.getBoundingClientRect().height:0;
 if(matchMedia('(prefers-reduced-motion:reduce)').matches){element.hidden=!show;return;}
 element.style.minHeight='0';element.style.overflow='hidden';
 const animation=element.animate([{height:height+'px',opacity},{height:target+'px',opacity:show?1:0}],{duration:180,easing:'ease-out'});
 const state={animation,saved};regions.set(element,state);
 animation.finished.then(()=>{if(regions.get(element)!==state)return;regions.delete(element);element.hidden=!show;element.style.minHeight=saved.minHeight;element.style.overflow=saved.overflow;}).catch(()=>{});
}
