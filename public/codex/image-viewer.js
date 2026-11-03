export function imageViewer(){
 const overlay=document.createElement('div');overlay.className='image-zoom';overlay.inert=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','图像查看器');
 overlay.innerHTML='<button class="icon-button zoom-close" aria-label="关闭大图"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg></button><div class="zoom-stage"><div class="zoom-canvas"></div></div><div class="zoom-toolbar"><button aria-label="缩小图像">−</button><output aria-live="polite">100%</output><button aria-label="放大图像">＋</button><span></span><button aria-label="适应窗口">适应窗口</button><button aria-label="原始大小">1:1</button></div>';
 document.body.append(overlay);const stage=overlay.querySelector('.zoom-stage'),canvas=overlay.querySelector('.zoom-canvas'),buttons=overlay.querySelectorAll('.zoom-toolbar button'),output=overlay.querySelector('output');let image,scale=1,fit=1,focus,autoFit=true;
 const paint=()=>{if(!image?.naturalWidth)return;const width=image.naturalWidth*scale,height=image.naturalHeight*scale;canvas.style.width=Math.max(stage.clientWidth,width+32)+'px';canvas.style.height=Math.max(stage.clientHeight,height+32)+'px';image.style.width=width+'px';image.style.height=height+'px';output.value=Math.round(scale*100)+'%';buttons[0].disabled=scale<=.01;buttons[1].disabled=scale>=5;};
 const resize=()=>{if(!image?.naturalWidth)return;fit=Math.min(1,(stage.clientWidth-32)/image.naturalWidth,(stage.clientHeight-32)/image.naturalHeight);if(autoFit)scale=Math.max(.01,fit);paint();};
 let panX=0,panY=0,drag;
 const position=()=>{if(image)image.style.transform=`translate(calc(-50% + ${panX}px),calc(-50% + ${panY}px))`;};
 const resetPan=()=>{panX=panY=0;position();};
 const change=value=>{autoFit=false;scale=Math.max(.01,Math.min(5,value));paint();};
 const close=()=>{overlay.classList.remove('open');overlay.inert=true;focus?.focus();};
 buttons[0].onclick=()=>change(scale/1.25);buttons[1].onclick=()=>change(scale*1.25);buttons[2].onclick=()=>{autoFit=true;resetPan();resize();stage.scrollTo(0,0);};buttons[3].onclick=()=>change(1);
 overlay.querySelector('.zoom-close').onclick=close;overlay.onclick=event=>{if(event.target===stage||event.target===canvas||event.target===overlay)close();};
 stage.addEventListener('wheel',event=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();change(scale*(event.deltaY<0?1.1:1/1.1));},{passive:false});
 document.addEventListener('keydown',event=>{if(!overlay.classList.contains('open'))return;if(event.key==='Escape'){event.preventDefault();close();}else if(event.key==='+'||event.key==='='){event.preventDefault();change(scale*1.25);}else if(event.key==='-'){event.preventDefault();change(scale/1.25);}else if(event.key==='0'){autoFit=true;resize();}else if(event.key==='Tab'){const available=[overlay.querySelector('.zoom-close'),...buttons].filter(button=>!button.disabled);const index=available.indexOf(document.activeElement);event.preventDefault();available[(index+(event.shiftKey?-1:1)+available.length)%available.length].focus();}});
 window.addEventListener('resize',()=>{if(overlay.classList.contains('open'))resize();});
 return {open(src,alt,origin=document.activeElement){focus=origin;autoFit=true;canvas.replaceChildren();image=document.createElement('img');image.alt=alt||'图像';image.draggable=false;resetPan();image.onload=resize;image.onerror=()=>{output.value='加载失败';};image.ondblclick=()=>{if(autoFit)change(1);else{autoFit=true;resetPan();resize();}};
 image.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();drag={id:event.pointerId,x:event.clientX,y:event.clientY,panX,panY};image.setPointerCapture(event.pointerId);image.classList.add('dragging');};
 image.onpointermove=event=>{if(!drag||drag.id!==event.pointerId)return;panX=drag.panX+event.clientX-drag.x;panY=drag.panY+event.clientY-drag.y;position();};
 const end=()=>{drag=null;image.classList.remove('dragging');};image.onpointerup=end;image.onpointercancel=end;image.onlostpointercapture=end;
 canvas.append(image);overlay.classList.add('open');overlay.inert=false;image.src=src;stage.scrollTo(0,0);overlay.querySelector('.zoom-close').focus();requestAnimationFrame(resize);},close};
}
