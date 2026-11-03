// Save an item and its viewport offset; absolute scrollTop alone drifts when
// history is paged or work records change height.
export function captureChatView(box,historyCount=0){
 const bounds=box.getBoundingClientRect();
 const anchor=[...box.children].find(node=>node.dataset.item!=='history-load-earlier'&&node.getBoundingClientRect().bottom>bounds.top);
 return {top:box.scrollTop,distance:Math.max(0,box.scrollHeight-box.scrollTop-box.clientHeight),bottom:box.scrollHeight-box.scrollTop-box.clientHeight<=2,anchor:anchor?.dataset.item,offset:anchor?anchor.getBoundingClientRect().top-bounds.top:0,historyCount,expanded:[...box.querySelectorAll('details[open]')].map(node=>node.dataset.item)};
}
export function applyChatView(box,saved){
 if(!saved||saved.bottom){box.scrollTop=box.scrollHeight;return;}
 const anchor=[...box.children].find(node=>node.dataset.item===saved.anchor);
 box.scrollTop=anchor?box.scrollTop+anchor.getBoundingClientRect().top-box.getBoundingClientRect().top-(saved.offset||0):Number(saved.top)||0;
}
// Images, disclosure animation and composer layout can settle after history.
// Preserve the chosen viewport through those changes until the user interacts.
export function settleChatView(box,saved,done){
 let stopped=false,frame;
 const apply=()=>{if(!stopped)applyChatView(box,saved);};
 const stop=()=>{if(stopped)return;stopped=true;cancelAnimationFrame(frame);observer.disconnect();for(const name of ['wheel','touchstart','pointerdown','keydown','disclosure-interaction'])box.removeEventListener(name,stop);window.removeEventListener('keydown',key);done();};
 const key=event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))stop();};
 const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(apply);});
 observer.observe(box);for(const child of box.children)observer.observe(child);
 for(const name of ['wheel','touchstart','pointerdown','keydown','disclosure-interaction'])box.addEventListener(name,stop,{passive:true});window.addEventListener('keydown',key);
 apply();frame=requestAnimationFrame(apply);
 return stop;
}
