export function sidebarLongPressMs(element){
 const value=Number.parseFloat(getComputedStyle(element).getPropertyValue('--sidebar-long-press-ms'));
 return Number.isFinite(value)?Math.max(200,Math.min(3000,value)):550;
}

// Touch holds have one owner. Native scrolling remains available before the hold.
export function sidebarPress(element,{onMenu,startDrag}){
 let press,suppressUntil=0,nativeMenuUntil=0;
 const distance=point=>Math.hypot(point.clientX-press.x,point.clientY-press.y);
 function clear(commit=false){
  if(!press)return;
  clearTimeout(press.timer);press.drag?.end(commit);element.classList.remove('sidebar-press-ready');press=undefined;
 }
 element.addEventListener('contextmenu',event=>{
  event.preventDefault();event.stopPropagation();
  if(press||event.pointerType==='touch'||event.pointerType!=='mouse'&&Date.now()<nativeMenuUntil)return;
  onMenu(event.clientX,event.clientY);
 });
 element.addEventListener('keydown',event=>{
  if(event.key!=='ContextMenu'&&!(event.shiftKey&&event.key==='F10'))return;
  event.preventDefault();event.stopPropagation();const box=element.getBoundingClientRect();onMenu(box.left+18,box.bottom);
 });
 element.addEventListener('click',event=>{
  if(Date.now()<suppressUntil){event.preventDefault();event.stopPropagation();}
 },true);
 element.addEventListener('touchstart',event=>{
  clear();
  const interactive=event.target.closest('button,a,input,select,textarea');
  if(event.touches.length!==1||interactive&&interactive!==element)return;
  const touch=event.touches[0],delay=sidebarLongPressMs(element);
  press={id:touch.identifier,x:touch.clientX,y:touch.clientY,armed:false};nativeMenuUntil=Date.now()+delay+1000;
  press.timer=setTimeout(()=>{
   if(!element.isConnected){clear();return;}
   if(press){press.armed=true;element.classList.add('sidebar-press-ready');}
  },delay);
 },{passive:true});
 element.addEventListener('touchmove',event=>{
  if(!press)return;
  if(event.touches.length!==1){clear();return;}
  const touch=[...event.touches].find(touch=>touch.identifier===press.id);if(!touch){clear();return;}
  if(!press.armed){if(distance(touch)>8){suppressUntil=Date.now()+500;clear();}return;}
  if(!press.drag&&distance(touch)>8){
   if(!startDrag){suppressUntil=Date.now()+500;clear();return;}
   press.drag=startDrag(touch);
  }
  if(event.cancelable)event.preventDefault();
  press.drag?.move(touch);
 },{passive:false});
 element.addEventListener('touchend',event=>{
  if(!press)return;
  if(event.touches.length){clear();return;}
  const touch=[...event.changedTouches].find(touch=>touch.identifier===press.id);if(!touch)return;
  const armed=press.armed,dragging=!!press.drag,stationary=distance(touch)<=8;
  if(armed){suppressUntil=Date.now()+600;nativeMenuUntil=Date.now()+800;if(event.cancelable)event.preventDefault();}
  clear(dragging);
  if(armed&&!dragging&&stationary)onMenu(touch.clientX,touch.clientY);
 },{passive:false});
 element.addEventListener('touchcancel',()=>{if(press?.armed)suppressUntil=Date.now()+600;clear();},{passive:true});
}
