import {sidebarLongPressMs} from './sidebar-press.js';
import {openDownPopover,closeDownPopover} from './popover-motion.js';

export const mobileSidebarQuery='(max-width:760px), (pointer:coarse) and (max-width:1024px)';
export function mountMobileSidebarShortcut({toggle,settings,notice=()=>{}}){
  const key='codex-mobile-sidebar-shortcut',mobile=matchMedia(mobileSidebarQuery);
  const number=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;
  function read(){try{const saved=JSON.parse(localStorage.getItem(key)||'null');return {enabled:saved?.enabled!==false,x:number(saved?.x,1),y:number(saved?.y,.64)};}catch{return {enabled:true,x:1,y:.64};}}
  let state=read(),press,menu,suppressUntil=0,touchContextUntil=0,feedback;
  const button=document.createElement('button');button.type='button';button.id='mobile-sidebar-shortcut';button.className='mobile-sidebar-shortcut';button.title='会话列表；可拖动，长按打开菜单';button.setAttribute('aria-controls','sidebar');
  button.innerHTML='<span class="mobile-sidebar-shortcut-glyph"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16m4-11h4m-4 4h4"/></svg></span><svg class="mobile-sidebar-shortcut-progress" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21"/></svg>';document.body.append(button);
  const glyph=button.querySelector('.mobile-sidebar-shortcut-glyph');
  function pulse(){feedback?.cancel();if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;feedback=glyph.animate([{transform:'scale(.86)'},{transform:'scale(1.1)',offset:.6},{transform:'scale(1)'}],{duration:220,easing:'ease-out'});}
  function clearPressFeedback(){button.classList.remove('pressing','holding','dragging');}
  const section=document.createElement('section');section.className='mobile-sidebar-shortcut-settings';const heading=document.createElement('h3');heading.textContent='移动端侧栏';const label=document.createElement('label'),enabled=document.createElement('input');enabled.type='checkbox';enabled.id='mobile-sidebar-shortcut-enabled';label.append(enabled,document.createTextNode('显示悬浮会话按钮'));const help=document.createElement('p');help.className='muted';help.textContent='可拖动位置，长按可关闭；在这里重新开启。';section.append(heading,label,help);
  const gestures=settings.querySelector('[data-appearance="gestures"]');if(gestures)gestures.after(section);else settings.append(section);
  const save=()=>{try{localStorage.setItem(key,JSON.stringify(state));}catch{notice('悬浮按钮设置仅在本次打开期间生效');}};
  function bounds(){const viewport=window.visualViewport,size=button.offsetWidth||48;const left=(viewport?.offsetLeft||0)+8,top=(viewport?.offsetTop||0)+8;return {left,top,width:Math.max(0,(viewport?.width||innerWidth)-size-16),height:Math.max(0,(viewport?.height||innerHeight)-size-16)};}
  function place(){const rect=bounds();button.style.left=(rect.left+state.x*rect.width)+'px';button.style.top=(rect.top+state.y*rect.height)+'px';}
  function dismiss(){if(!menu)return;const previous=menu;menu=null;closeDownPopover(previous);}
  function syncExpanded(){const expanded=document.body.classList.contains('sidebar-open');button.setAttribute('aria-expanded',String(expanded));button.setAttribute('aria-label',expanded?'收起会话列表':'打开会话列表');}
  function paint(){enabled.checked=state.enabled;button.hidden=!state.enabled||!mobile.matches;if(button.hidden)dismiss();place();}
  function setEnabled(value){state.enabled=value;save();paint();}
  function showMenu(){
    if(menu){dismiss();return;}if(!mobile.matches||!state.enabled)return;
    menu=document.createElement('div');menu.className='mobile-sidebar-shortcut-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','悬浮会话按钮菜单');
    for(const [text,action]of [[document.body.classList.contains('sidebar-open')?'收起会话列表':'打开会话列表',()=>toggle()],['恢复默认位置',()=>{state.x=1;state.y=.64;save();place();}],['关闭悬浮按钮',()=>setEnabled(false)]]){const entry=document.createElement('button');entry.type='button';entry.setAttribute('role','menuitem');entry.textContent=text;entry.onclick=()=>{dismiss();action();};menu.append(entry);}
    document.body.append(menu);const rect=button.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(rect.right-menu.offsetWidth,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(rect.bottom+6,innerHeight-menu.offsetHeight-8))+'px';openDownPopover(menu);menu.querySelector('button').focus();
  }
  enabled.onchange=()=>setEnabled(enabled.checked);
  function activate(){pulse();if(menu){dismiss();return;}toggle();}
  button.onclick=event=>{event.preventDefault();if(Date.now()>=suppressUntil)activate();};
  button.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();if(press?.source==='touch'||Date.now()<touchContextUntil||Date.now()<suppressUntil)return;showMenu();});
  button.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();event.stopPropagation();showMenu();}});
  function begin(point,id,source){
    if(press||!mobile.matches)return;const rect=button.getBoundingClientRect(),delay=sidebarLongPressMs(button);
    press={id,source,x:point.clientX,y:point.clientY,left:rect.left,top:rect.top,oldX:state.x,oldY:state.y,dragged:false,long:false};
    feedback?.cancel();button.style.setProperty('--shortcut-hold-duration',delay+'ms');button.classList.add('pressing','holding');
    if(source==='touch')touchContextUntil=Date.now()+delay+1500;
    press.timer=setTimeout(()=>{if(!press||press.dragged)return;press.long=true;suppressUntil=Date.now()+1000;clearPressFeedback();pulse();if(!menu)showMenu();},delay);
  }
  function move(point){
    if(!press||press.long)return;const dx=point.clientX-press.x,dy=point.clientY-press.y;
    if(!press.dragged&&Math.hypot(dx,dy)<(press.source==='touch'?14:6))return;
    clearTimeout(press.timer);press.dragged=true;button.classList.remove('pressing','holding');button.classList.add('dragging');const rect=bounds();state.x=number((press.left+dx-rect.left)/(rect.width||1),1);state.y=number((press.top+dy-rect.top)/(rect.height||1),.64);place();
  }
  function end(commit){
    if(!press)return;clearTimeout(press.timer);const previous=press;press=null;clearPressFeedback();suppressUntil=Date.now()+600;
    if(previous.dragged){if(commit)save();else{state.x=previous.oldX;state.y=previous.oldY;place();}}
    else if(commit&&!previous.long)activate();
    if(previous.source==='pointer'&&button.hasPointerCapture(previous.id))button.releasePointerCapture(previous.id);
  }
  // Touch owns touch gestures: WebViews may cancel pointer events during a native hold.
  const touchEvents='ontouchstart' in window;
  button.addEventListener('touchstart',event=>{if(event.cancelable)event.preventDefault();if(event.touches.length!==1){end(false);return;}const point=event.touches[0];begin(point,point.identifier,'touch');},{passive:false});
  button.addEventListener('touchmove',event=>{if(press?.source!=='touch')return;if(event.cancelable)event.preventDefault();if(event.touches.length!==1){end(false);return;}const point=[...event.touches].find(point=>point.identifier===press.id);if(point)move(point);},{passive:false});
  button.addEventListener('touchend',event=>{if(press?.source!=='touch')return;if(event.cancelable)event.preventDefault();if([...event.changedTouches].some(point=>point.identifier===press.id))end(!event.touches.length);},{passive:false});
  button.addEventListener('touchcancel',()=>{if(press?.source==='touch')end(false);},{passive:true});
  button.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'&&touchEvents||event.button!==0)return;event.preventDefault();begin(event,event.pointerId,'pointer');if(press?.source==='pointer')button.setPointerCapture(event.pointerId);});
  button.addEventListener('pointermove',event=>{if(press?.source==='pointer'&&press.id===event.pointerId)move(event);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,event=>{if(press?.source==='pointer'&&press.id===event.pointerId)end(type==='pointerup');});
  document.addEventListener('pointerdown',event=>{if(menu&&!menu.contains(event.target)&&!button.contains(event.target))dismiss();},true);
  document.addEventListener('keydown',event=>{if(menu&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();dismiss();button.focus();}},true);
  const resize=()=>{dismiss();end(false);paint();};
  window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);mobile.addEventListener('change',resize);
  window.addEventListener('storage',event=>{if(event.key===key){state=read();paint();}});
  new MutationObserver(syncExpanded).observe(document.body,{attributes:true,attributeFilter:['class']});
  syncExpanded();paint();return {closeMenu:dismiss};
}
