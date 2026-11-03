import {nearBottom,defaultBottomThreshold} from './scroll-policy.js';
// Each action chooses its edge from the current conversation viewport.
const scrollOwners=new WeakMap();
// Contain wheel/touch scrolling only while the work list actually overflows.
export function mountWorkScrollContainment(messages){
 const observed=new Set();
 const resize=new ResizeObserver(sync);
 function sync(){
  const lists=[...messages.querySelectorAll('.work-list')],next=new Set(lists.flatMap(list=>[list,...list.children]));
  for(const node of observed)if(!next.has(node)){resize.unobserve(node);observed.delete(node);}
  for(const node of next)if(!observed.has(node)){observed.add(node);resize.observe(node);}
  for(const list of lists)list.classList.toggle('work-scroll-contained',list.clientHeight>0&&list.scrollHeight>list.clientHeight+1);
 }
 const changes=new MutationObserver(sync);changes.observe(messages,{childList:true,subtree:true,characterData:true});sync();
 return ()=>{changes.disconnect();resize.disconnect();};
}
// Streaming renders and composer resizing must respect an ongoing disclosure.
export function restoreDisclosureScroll(scroller){const owner=scrollOwners.get(scroller);if(!owner)return false;owner.restore();return true;}
export const upwardDisclosureDistance=defaultBottomThreshold;
// Initialize only lists revealed by this expansion; leave their parent list
// and subsequent manual scrolling alone.
export function positionWorkLists(sections,direction){
 for(const section of sections){
  const lists=[...(section.matches('.work-list')?[section]:[]),...section.querySelectorAll('.work-list')];
  for(const list of lists)if(list.clientHeight)list.scrollTop=direction==='up'?list.scrollHeight:0;
 }
}
export function disclosureAnchor(disclosure,closing,{edge=()=>disclosure.getBoundingClientRect().bottom}={}){
 const local=disclosure.closest('.work-list'),messages=disclosure.closest('.messages');
 messages?.dispatchEvent(new Event('disclosure-interaction'));
 const candidate=local&&local.scrollHeight>local.clientHeight+1?local:messages;
 // Use the conversation viewport, even inside a locally scrolling work list.
 const viewport=messages||candidate;
 const direction=nearBottom(viewport)?'up':'down';
 disclosure.dataset.expansionDirection=direction;
 const scroller=candidate,readEdge=direction==='up'?edge:()=>disclosure.getBoundingClientRect().top,fixedEdge=readEdge();
 const containers=[...new Set([local,candidate,messages].filter(Boolean))];
 // Anchor the actual panel edge, not total scrollHeight. A capped inner work
 // list can change height without changing its parent's scrollHeight, and can
 // hit scrollTop=0 during collapse. Let the outer timeline absorb the remainder.
 let started=false,finished=false,endEdge=fixedEdge,progress=()=>0;
 const anchor={direction,scroller,
  start(){started=true;for(const container of containers)scrollOwners.set(container,anchor);},
  // Measure the reachable final edge synchronously, without painting the final
  // layout. Short timelines can no longer support the original scroll offset.
  plan(change,undo){const positions=containers.map(container=>container.scrollTop);try{change();for(const container of containers)container.scrollTop+=readEdge()-fixedEdge;endEdge=readEdge();}finally{undo();containers.forEach((container,index)=>{container.scrollTop=positions[index];});}},
  track(readProgress){progress=readProgress;},
  release(){finished=true;anchor.restore();for(const container of containers)if(scrollOwners.get(container)===anchor)scrollOwners.delete(container);},
  restore(){if(!disclosure.isConnected||started&&scrollOwners.get(messages||candidate)!==anchor)return;const fraction=finished?1:Math.max(0,Math.min(1,progress()||0)),target=fixedEdge+(endEdge-fixedEdge)*fraction;for(const container of containers){const delta=readEdge()-target;if(Math.abs(delta)>.1)container.scrollTop+=delta;}}
 };
 return anchor;
}
