import {restoreDisclosureScroll} from './disclosure-motion.js';
import {keyboardBottom} from './keyboard-bottom.js';
import {layoutTiming} from './layout-motion.js';
// Bottom-anchored sizing, shared by mouse, pen, touch and keyboard.
export function composerResize(wrap,input,queue,requests,options={}){
 const composer=wrap.querySelector('.composer'),body=wrap.closest('.chat-body');
 const messages=body.querySelector('.messages');
 const keyboard=keyboardBottom(messages,input,{beforeFollow:options.beforeKeyboardFollow});
 // Never shrink the live textarea to measure it: that temporarily enlarges
 // the message viewport and clamps its scrollTop below the final bottom.
 const measure=input.cloneNode(false);measure.removeAttribute('id');measure.removeAttribute('name');measure.removeAttribute('aria-label');measure.setAttribute('aria-hidden','true');measure.tabIndex=-1;measure.disabled=true;
 Object.assign(measure.style,{position:'absolute',visibility:'hidden',pointerEvents:'none',top:'0',left:'0',height:'0px',minHeight:'0px',maxHeight:'none'});composer.append(measure);
 const dock=document.createElement('div');dock.className='composer-dock';
 const auxiliary=document.createElement('div');auxiliary.className='composer-auxiliary';
 const content=document.createElement('div');content.className='composer-auxiliary-content';
 const status=wrap.querySelector('.conversation-status');
 content.append(requests);if(status)content.append(status);content.append(queue);auxiliary.append(content);
 dock.append(auxiliary);wrap.prepend(dock);
 const small=matchMedia('(max-width:760px)'),reduced=matchMedia('(prefers-reduced-motion:reduce)'),key=()=> 'codex-composer-heights:'+(small.matches?'mobile':'desktop');
 let sizes={},frame=0,drag=null,auxAnimation=null,auxTarget=null;
 const load=()=>{try{const saved=JSON.parse(localStorage.getItem(key())||'{}');sizes={};for(const name of ['input','auxiliary'])if(Number.isFinite(saved[name])&&saved[name]>0)sizes[name]=saved[name];}catch{sizes={};}};
 const save=()=>{try{localStorage.setItem(key(),JSON.stringify(sizes));}catch{/* Resizing remains available without browser storage. */}};
 const handles={};
 function handle(name,label,before){
  const node=document.createElement('div');node.className='composer-height-handle';node.tabIndex=0;node.setAttribute('role','separator');node.setAttribute('aria-orientation','horizontal');node.setAttribute('aria-label',label);node.title='上下拖动调整高度，双击恢复自动高度；方向键微调';(name==='input'?before:dock).prepend(node);handles[name]=node;
  node.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();drag={name,id:event.pointerId,y:event.clientY,height:(name==='input'?input:auxiliary).getBoundingClientRect().height};node.setPointerCapture(event.pointerId);node.classList.add('dragging');});
  window.addEventListener('pointermove',event=>{if(drag?.id!==event.pointerId||drag.name!==name)return;sizes[name]=drag.height+drag.y-event.clientY;update();sizes[name]=Number(node.getAttribute('aria-valuenow'));});
  const finish=event=>{if(drag?.id!==event.pointerId||drag.name!==name)return;drag=null;node.classList.remove('dragging');save();};
  window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
  const reset=()=>{delete sizes[name];save();update();};node.addEventListener('dblclick',reset);
  node.addEventListener('keydown',event=>{if(event.key==='Home'){event.preventDefault();reset();return;}if(!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();sizes[name]=Number(node.getAttribute('aria-valuenow'))+(event.key==='ArrowUp'?1:-1)*(event.shiftKey?24:8);update();sizes[name]=Number(node.getAttribute('aria-valuenow'));save();});
 }
 handle('auxiliary','调整输入框上方内容高度',auxiliary);handle('input','调整输入区高度',composer);
 function sizeAuxiliary(height,present){
  if(height===auxTarget&&!(auxAnimation&&drag?.name==='auxiliary'))return;
  const previous=dock.hidden?0:auxiliary.getBoundingClientRect().height;
  auxAnimation?.cancel();auxAnimation=null;auxTarget=height;
  dock.hidden=!present&&previous===0;dock.inert=!present;
  auxiliary.style.height=height+'px';
  if(Math.abs(previous-height)>.5&&drag?.name!=='auxiliary'&&!reduced.matches){
   dock.hidden=false;
   const animation=auxiliary.animate([{height:previous+'px'},{height:height+'px'}],layoutTiming);auxAnimation=animation;
   animation.onfinish=()=>{if(auxAnimation!==animation)return;auxAnimation=null;if(!present)dock.hidden=true;};
  }else dock.hidden=!present;
 }
 function update(){
  const pinned=messages&&messages.scrollHeight-messages.scrollTop-messages.clientHeight<=2;
  const present=[...content.children].some(node=>!node.hidden&&(node===requests?node.children.length>0:node.childNodes.length>0));
  if(present)dock.hidden=false;
  const viewport=window.visualViewport?.height||innerHeight;
  const available=Math.max(100,Math.min(body.clientHeight,viewport));
  const min=Math.ceil(parseFloat(getComputedStyle(input).lineHeight)||22)+10;
  const overhead=wrap.getBoundingClientRect().height-(dock.hidden?0:dock.getBoundingClientRect().height)-input.getBoundingClientRect().height;
  const max=Math.max(min,Math.min(available*.55,available-overhead-(present?60:0)-80));
  const scrollTop=input.scrollTop;let desired=sizes.input;
  if(desired==null){measure.style.width=input.getBoundingClientRect().width+'px';measure.value=input.value;desired=Math.min(120,measure.scrollHeight);}
  const height=Math.round(Math.max(min,Math.min(max,desired)));input.style.height=height+'px';input.scrollTop=scrollTop;
  // Measure intrinsic content independently of the viewport being animated.
  // Include the summary's padding so a lone collapsed status row fits exactly.
  const row=status?.querySelector('.goal-status>summary'),rowStyle=getComputedStyle(row||status||content),statusStyle=getComputedStyle(status||content);
  const pixels=value=>parseFloat(value)||0;
  const line=pixels(rowStyle.lineHeight)||pixels(rowStyle.fontSize)*1.5;
  const rowHeight=Math.ceil(Math.max(row?.getBoundingClientRect().height||line+pixels(rowStyle.paddingTop)+pixels(rowStyle.paddingBottom),status?.querySelector('.goal-controls')?.getBoundingClientRect().height||0)+pixels(statusStyle.paddingTop)+pixels(statusStyle.paddingBottom));
  const natural=present?Math.ceil(content.getBoundingClientRect().height):0;
  const auxMin=Math.min(natural,rowHeight),auxMax=Math.min(natural,Math.max(auxMin,available-overhead-height-80));
  const desiredAux=sizes.auxiliary??viewport*.24;
  const auxHeight=present?Math.ceil(Math.max(auxMin,Math.min(auxMax,desiredAux))):0;
  auxiliary.style.overflowY=natural<=auxHeight?'hidden':'auto';
  sizeAuxiliary(auxHeight,present);
  for(const [name,node]of Object.entries(handles)){node.setAttribute('aria-valuemin',String(name==='input'?min:auxMin));node.setAttribute('aria-valuemax',String(Math.floor(name==='input'?max:auxMax)));node.setAttribute('aria-valuenow',String(name==='input'?Math.round(input.getBoundingClientRect().height):auxHeight));node.setAttribute('aria-valuetext',node.getAttribute('aria-valuenow')+' 像素');}
  if(!restoreDisclosureScroll(messages)&&!keyboard.sync()&&pinned)messages.scrollTop=messages.scrollHeight;
 }
 const refresh=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);};
 reduced.addEventListener('change',()=>{auxAnimation?.cancel();auxAnimation=null;refresh();});
 load();input.addEventListener('input',refresh);small.addEventListener('change',()=>{load();refresh();});window.addEventListener('resize',refresh);window.visualViewport?.addEventListener('resize',refresh);
 new ResizeObserver(refresh).observe(wrap);new ResizeObserver(refresh).observe(body);
 new ResizeObserver(refresh).observe(content);
 new MutationObserver(refresh).observe(content,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','open']});
 update();return {refresh};
}
