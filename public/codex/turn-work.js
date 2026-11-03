import {disclosureAnchor,positionWorkLists} from './disclosure-motion.js';
// One controller per turn. Work segments stay in chronological DOM order,
// separated by visible steering messages, and share the top time disclosure.
function animateTurn(disclosure,summary){
 summary.addEventListener('click',event=>{
  event.preventDefault();event.stopPropagation();if(disclosure._animating)return;
  const closing=disclosure.open,sections=disclosure._sections||[];
  // Closed details may retain client rects for their clipped content. Those
  // stale rectangles must never count as a visible timeline edge.
  const edge=()=>Math.max(disclosure.getBoundingClientRect().bottom,...(disclosure._timelineNodes||sections).filter(node=>!node.hidden&&(disclosure.open||!disclosure.contains(node))&&node.getClientRects().length).map(node=>node.getBoundingClientRect().bottom));
  const anchor=disclosureAnchor(disclosure,closing,{edge}),scroller=anchor.scroller;
  anchor.start();
  if(!matchMedia('(prefers-reduced-motion:reduce)').matches){
   const open=disclosure.open,hidden=sections.map(section=>section.hidden);
   anchor.plan(()=>{disclosure.open=!closing;for(const section of sections.slice(1))section.hidden=closing;},()=>{disclosure.open=open;sections.forEach((section,index)=>{section.hidden=hidden[index];});});
  }
  if(!closing){disclosure.open=true;for(const section of sections)section.hidden=false;positionWorkLists(sections,anchor.direction);}
  const follow=()=>{if(!disclosure._animating)return;anchor.restore();requestAnimationFrame(follow);};
  let animations=[],restoreSpacing=()=>{};
  const finish=()=>{if(closing){disclosure.open=false;for(const section of sections.slice(1))section.hidden=true;}restoreSpacing();for(const animation of animations)animation.cancel();if(!closing)positionWorkLists(sections,anchor.direction);disclosure._animating=false;delete disclosure.dataset.closing;anchor.release();};
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){finish();return;}
  disclosure._animating=true;disclosure.dataset.closing=String(closing);
  // The space above each section disappears with the section. Move that space
  // inside its animated box so closing cannot drop a whole margin at the end.
  // Inline !important is needed because the shared spacing layer owns margins.
  const layout=sections.map(section=>{const style=getComputedStyle(section);return {section,height:section.getBoundingClientRect().height,gap:parseFloat(style.marginTop)||0,padding:parseFloat(style.paddingTop)||0,original:['margin-top','box-sizing','overflow'].map(name=>[name,section.style.getPropertyValue(name),section.style.getPropertyPriority(name)])};});
  restoreSpacing=()=>{for(const {section,original}of layout)for(const [name,value,priority]of original)if(value)section.style.setProperty(name,value,priority);else section.style.removeProperty(name);};
  animations=layout.map(({section,height,gap,padding})=>{
   section.style.setProperty('margin-top','0px','important');section.style.boxSizing='border-box';section.style.overflow='hidden';
   const expanded={height:height+gap+'px',paddingTop:padding+gap+'px',opacity:1},collapsed={height:'0px',paddingTop:'0px',opacity:0};
   return section.animate(closing?[expanded,collapsed]:[collapsed,expanded],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)',fill:'both'});
  });
  anchor.track(()=>animations[0]?.effect.getComputedTiming().progress);
  if(scroller)requestAnimationFrame(follow);
  Promise.all(animations.map(animation=>animation.finished.catch(()=>{}))).then(finish);
 });
}
function syncWorkChildren(parent,nodes){if(parent.childNodes.length!==nodes.length||nodes.some((node,index)=>parent.childNodes[index]!==node))parent.replaceChildren(...nodes);}
export function foldTurnWork(nodes,previous,expanded){
 const result=[];
 for(let index=0;index<nodes.length;index++){
  const heading=nodes[index];if(!heading.dataset.item?.startsWith('processing:')){result.push(heading);continue;}
  const turn=heading.dataset.turnId;let end=index+1;
  while(end<nodes.length&&!nodes[end].dataset.item?.startsWith('processing:')&&(!nodes[end].dataset.turnId||nodes[end].dataset.turnId===turn))end++;
  const turnNodes=nodes.slice(index+1,end);
  const entries=turnNodes.filter(node=>!node.classList.contains('thinking-status'));
  if(!entries.some(node=>node.dataset.work==='true')){result.push(heading);index=end-1;result.push(...entries);continue;}
  const key='turn-work:'+turn,old=previous.get(key),disclosure=old||document.createElement('details'),running=heading.dataset.running==='true',wasRunning=old?.dataset.running==='true';
  let summary=old?.querySelector(':scope>summary'),body=old?.querySelector(':scope>.turn-work-body');
  if(!old){disclosure.className='turn-work';disclosure.dataset.item=key;summary=document.createElement('summary');body=document.createElement('div');body.className='turn-work-body';disclosure.append(summary,body);disclosure.open=running||expanded.has(key);animateTurn(disclosure,summary);}
  summary.className='reply-processing';summary.replaceChildren(...[...heading.childNodes].map(node=>node.cloneNode(true)));for(const name of ['started','duration','running'])summary.dataset[name]=heading.dataset[name];summary.title='展开或收起本轮全部工作过程';disclosure.dataset.running=String(running);
  const arrow=document.createElement('span');arrow.className='turn-work-chevron';arrow.setAttribute('aria-hidden','true');arrow.textContent='›';summary.insertBefore(arrow,summary.querySelector('.reply-processing-line'));
  summary.dataset.thinking='false';
  result.push(disclosure);const sections=[body];let work=[],first=true;
  const flush=()=>{if(!work.length)return;if(first){syncWorkChildren(body,work);first=false;}else{const segmentKey='turn-work-segment:'+turn+':'+work[0].dataset.item;const section=previous.get(segmentKey)||document.createElement('div');section.className='turn-work-body turn-work-segment';section.dataset.item=segmentKey;section.dataset.owner=key;syncWorkChildren(section,work);section.hidden=!disclosure.open;sections.push(section);result.push(section);}work=[];};
  for(const node of entries){if(node.dataset.work==='true'){work.push(node);}else{flush();if(first){syncWorkChildren(body,[]);first=false;}result.push(node);}}
  flush();disclosure._sections=sections;disclosure._timelineNodes=[...sections,...entries.filter(node=>node.dataset.work!=='true')];index=end-1;
  if(wasRunning&&!running&&disclosure.open&&!disclosure.dataset.collapseScheduled){disclosure.dataset.collapseScheduled='true';requestAnimationFrame(()=>{delete disclosure.dataset.collapseScheduled;if(disclosure.isConnected&&disclosure.dataset.running!=='true'&&disclosure.open)summary.click();});}
 }
 return result;
}
