import {nearBottom} from './scroll-policy.js';
import {restoreDisclosureScroll} from './disclosure-motion.js';

// Keep the pre-update bottom intent across streaming, image loads and composer
// animations. Reading older messages and disclosure anchoring retain ownership.
export function bottomFollow(scroller){
 let following=nearBottom(scroller),lastTop=scroller.scrollTop;
 const sync=()=>{
  if(!following)return;
  if(restoreDisclosureScroll(scroller)){following=false;return;}
  scroller.scrollTop=scroller.scrollHeight;lastTop=scroller.scrollTop;
 };
 scroller.addEventListener('scroll',()=>{
  const top=scroller.scrollTop;
  if(nearBottom(scroller))following=true;
  else if(top<lastTop-2)following=false;
  else if(following)sync();
  lastTop=top;
 },{passive:true});
 scroller.addEventListener('disclosure-interaction',()=>{following=false;});
 const resize=new ResizeObserver(sync),observed=new Set();
 const observe=()=>{
  const next=new Set([scroller,...scroller.children]);
  for(const node of observed)if(!next.has(node)){resize.unobserve(node);observed.delete(node);}
  for(const node of next)if(!observed.has(node)){resize.observe(node);observed.add(node);}
 };
 new MutationObserver(observe).observe(scroller,{childList:true});observe();
 const composer=scroller.closest('.chat-body')?.querySelector('.composer-wrap');
 if(composer)new ResizeObserver(sync).observe(composer);
 return {
  capture:()=>nearBottom(scroller)||(following&&scroller.scrollTop>=lastTop-2),
  commit(value){following=value;sync();},
 };
}
