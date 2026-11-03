import {disclosureAnchor,positionWorkLists} from './disclosure-motion.js';
export function copyButton(value,label){
  const button=document.createElement('button');button.className='copy-icon';button.title=label;button.setAttribute('aria-label',label);
  button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
  button.onclick=async event=>{event.stopPropagation();try{await navigator.clipboard.writeText(value);button.classList.add('copied');button.title='已复制';button.setAttribute('aria-label','已复制');setTimeout(()=>{button.classList.remove('copied');button.title=label;button.setAttribute('aria-label',label);},1400);}catch{button.title='复制失败，请检查浏览器权限';}};return button;
}
export function turnItems(turn){const items=turn.items||[],last=items.findLastIndex(item=>['agentMessage','plan'].includes(item.type));let users=0;return items.map((item,index)=>({...item,_steering:item._questionReply?false:item._steering||(item.type==='userMessage'&&users++>0),_turnStatus:turn.status,_processingStartedAt:turn.turnStartedAtMs??turn.startedAt,_durationMs:turn.durationMs??(turn.completedAt!=null&&turn.startedAt!=null?(turn.completedAt-turn.startedAt)*1000:null),_completedAt:turn.completedAt??turn.agentMessageCompletedAtMsById?.[item.id]??(turn.turnStartedAtMs&&turn.durationMs!=null?turn.turnStartedAtMs+turn.durationMs:null),_sentAt:item._sentAt??turn.startedAt??turn.turnStartedAtMs,_replyComplete:turn.status==='completed'&&index===last&&item.phase!=='commentary',_turnId:turn.turnId||turn.id,_running:turn.status==='inProgress'&&(item.status==='inProgress'||index===items.length-1&&!['completed','failed','declined'].includes(item.status))}));}
export function desktopTurnItems(turn,messages){
 const index=new Map(messages.filter(message=>message.prefix).map(message=>[message.prefix,message]));
 const steering=(turn.items||[]).filter(item=>item.type==='steeringUserMessage'&&item.status!=='failed'&&item.status!=='cancelled');
 const represented=new Set(steering.map(item=>item.serverUserMessageId).filter(Boolean).map(id=>String(id).slice(0,23)));
 const items=(turn.items||[]).flatMap(item=>{
  if(item.type==='steeringUserMessage'){
   if(!steering.includes(item))return [];
   const input=item.input||item.restoreMessage?.content||[],message=index.get(String(item.serverUserMessageId||'').slice(0,23));
   return [{...item,type:'userMessage',text:message?.text||input.map(part=>part.text||'').join('\n')||item.restoreMessage?.text||'',content:message?.content||input,_sentAt:item.restoreMessage?.createdAt||message?._sentAt,_steering:true}];
  }
  if(item.type==='userMessage'){
   const message=index.get(String(item.id).replace(/^msg_/,'').slice(0,23));
   return [{...item,...(message?.content?{content:message.content}:{}),_sentAt:item._sentAt??message?._sentAt}];
  }
  if(item.type!=='steered')return [item];
  const prefix=String(item.id).slice(0,23);if(represented.has(prefix))return [];
  const message=index.get(prefix);return [{...item,type:'userMessage',text:message?message.text:'追加指令正在同步…',content:message?.content||item.content,_sentAt:message?._sentAt,_steering:true}];
 });return turnItems({...turn,items});
}
export function userMetadata(element,item,content){
  const actions=document.createElement('div');actions.className='user-actions';const historical=item._steering&&item._turnStatus&&item._turnStatus!=='inProgress';element.classList.toggle('historical-steering',!!historical);
  const raw=item._sentAt??item.timestamp??item.createdAt;if(raw&&!historical){const date=new Date(typeof raw==='number'?(raw<1e12?raw*1000:raw):raw);if(!Number.isNaN(date.getTime())){const time=document.createElement('time');time.dateTime=date.toISOString();time.textContent=date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});time.title=date.toLocaleString('zh-CN',{hourCycle:'h23'});actions.append(time);}}
  if(item._deliveryStatus){const status=document.createElement('span');status.textContent=item._deliveryStatus==='sending'?'发送中':'发送结果待确认';status.className='user-delivery-status';element.append(status);}
  actions.append(copyButton(content,'复制消息'));element.append(actions);element.addEventListener('click',()=>element.classList.toggle('show-metadata'));element.tabIndex=0;
}
const boundDisclosures=new WeakSet();
export function mountDisclosures(root,{expanded=new Set(),restore=false}={}){let index=0;for(const details of root.querySelectorAll('details')){details.dataset.item||='body:'+root.dataset.item+':detail:'+index;index++;if(restore)details.open=expanded.has(details.dataset.item);if(boundDisclosures.has(details))continue;const summary=details.querySelector(':scope>summary');if(!summary)continue;const body=document.createElement('div');body.className='markdown-disclosure-body';for(const child of [...details.childNodes])if(child!==summary)body.append(child);details.append(body);animateDisclosure(details,body);}}
export function animateDisclosure(details,content){
  if(boundDisclosures.has(details))return;boundDisclosures.add(details);
  const heading=details.querySelector(':scope>summary');let animation;
  heading.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();const closing=details.open&&!animation;if(animation)return;
    const anchor=disclosureAnchor(details,closing);
    anchor.start();
    if(matchMedia('(prefers-reduced-motion:reduce)').matches){details.open=!details.open;if(!closing)positionWorkLists([content],anchor.direction);anchor.release();return;}
    anchor.plan(()=>{details.open=!closing;},()=>{details.open=closing;});
    if(!closing){details.open=true;positionWorkLists([content],anchor.direction);}
    details.dataset.closing=String(closing);
    const height=content.getBoundingClientRect().height;
    content.style.overflow='hidden';
    animation=content.animate(closing?[{height:height+'px',opacity:1},{height:'0px',opacity:0}]:[{height:'0px',opacity:0},{height:height+'px',opacity:1}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});
    anchor.track(()=>animation?.effect.getComputedTiming().progress);
    const keepFollowingPosition=()=>{if(!animation)return;anchor.restore();requestAnimationFrame(keepFollowingPosition);};requestAnimationFrame(keepFollowingPosition);
    animation.onfinish=()=>{delete details.dataset.closing;if(closing)details.open=false;content.style.overflow='';if(!closing)positionWorkLists([content],anchor.direction);anchor.release();animation=null;};
  });
}

const icons={like:'<path d="M7 10v10H3V10zM7 10l5-7c1-1 3 0 2 3l-1 4h6c2 0 2 2 1 4l-2 6H7"/>',dislike:'<path d="M7 14V4H3v10zM7 14l5 7c1 1 3 0 2-3l-1-4h6c2 0 2-2 1-4l-2-6H7"/>',branch:'<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10m0-5h6a6 6 0 0 0 6-5"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'};
function iconButton(name,label){const button=document.createElement('button');button.className='copy-icon reply-'+name;button.title=label;button.setAttribute('aria-label',label);button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[name]+'</svg>';return button;}
export function replyActions(item,content,scope,onBranch,onFeedback){
 const actions=document.createElement('div');actions.className='message-actions';actions.append(copyButton(content,'复制回复'));
 const key='codex-openai-feedback:'+scope+':'+(item.id||item._turnId);let rating;try{rating=localStorage.getItem(key);}catch{}
 const ratings=[];for(const [name,label]of [['like','好评'],['dislike','差评']]){const button=iconButton(name,label+' · 向 OpenAI 反馈');ratings.push(button);button.setAttribute('aria-pressed',String(rating===name));button.onclick=async()=>{if(!onFeedback)return;try{await onFeedback(name,()=>{rating=name;try{localStorage.setItem(key,rating);}catch{}for(const candidate of ratings)candidate.setAttribute('aria-pressed',String(candidate.classList.contains('reply-'+rating)));});}catch(error){button.title=error.message;}};actions.append(button);}
 const branch=iconButton('branch','从此回复分支到新聊天');branch.disabled=!item._turnId;branch.onclick=async()=>{branch.disabled=true;try{await onBranch(item);}finally{branch.disabled=false;}};actions.append(branch);
 const raw=item._completedAt??item._sentAt,date=raw?new Date(typeof raw==='number'&&raw<1e12?raw*1000:raw):null,time=document.createElement('time');time.className='reply-time';if(date&&!Number.isNaN(date.getTime())){time.dateTime=date.toISOString();time.textContent=date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});time.title=(item._completedAt?'回复完成：':'原始记录仅有轮次开始时间：')+date.toLocaleString('zh-CN',{hourCycle:'h23'});}else{time.textContent='时间未知';time.title='原始记录未提供时间';}actions.append(time);return actions;
}
export function messageNavigator(scroller){
 const nav=document.createElement('nav');nav.className='message-navigator';nav.setAttribute('aria-label','消息位置导航');scroller.parentElement.append(nav);let nodes=[],frame;
 const update=()=>{frame=null;const bounds=scroller.getBoundingClientRect();let active=nodes.findIndex(node=>node.getBoundingClientRect().bottom>bounds.top+40);if(active<0)active=nodes.length-1;[...nav.children].forEach((button,index)=>{button.classList.toggle('active',index===active);button.setAttribute('aria-current',index===active?'true':'false');});};
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);nav.classList.add('scrolling');clearTimeout(nav.hideTimer);nav.hideTimer=setTimeout(()=>nav.classList.remove('scrolling'),1300);};scroller.addEventListener('scroll',schedule,{passive:true});new ResizeObserver(schedule).observe(scroller);
 return ()=>{const next=[...scroller.querySelectorAll(':scope>.message')];if(next.length===nodes.length&&next.every((node,index)=>node===nodes[index])){schedule();return;}nodes=next;nav.replaceChildren();for(const [index,node]of nodes.entries()){const button=document.createElement('button');button.className='message-marker';const content=node.querySelector(':scope>span')?.textContent||node.textContent;button.title=(node.classList.contains('user')?'你：':'Codex：')+content.slice(0,70);button.setAttribute('aria-label','定位第 '+(index+1)+' 条消息：'+button.title);button.style.setProperty('--marker-width',Math.min(18,6+Math.log2(1+content.length)*1.1)+'px');button.onclick=()=>{scroller.scrollTo({top:scroller.scrollTop+node.getBoundingClientRect().top-scroller.getBoundingClientRect().top-20,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});};nav.append(button);}nav.hidden=nodes.length<2;schedule();};
}

function processingLabel(element){if(element.dataset.thinking==='true')return;if(element.dataset.running!=='true'&&element.dataset.duration===''){element.querySelector('span').textContent='用时未提供';return;}if(element.dataset.running==='true'&&!Number.isFinite(Number(element.dataset.started))){element.querySelector('span').textContent='进行中';return;}let duration=Number(element.dataset.duration);if(element.dataset.running==='true')duration=Math.max(0,Date.now()-Number(element.dataset.started));const seconds=Math.max(0,Math.floor(duration/1000)),minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60);element.querySelector('span').textContent=(element.dataset.running==='true'?'已处理 ':'用时 ')+(hours?hours+' 小时 ':'')+(minutes%60?minutes%60+' 分 ':'')+(seconds%60||!minutes?seconds%60+' 秒':'');}
export function processingHeader(item){const raw=item._processingStartedAt;const started=typeof raw==='number'?(raw<1e12?raw*1000:raw):Date.parse(raw);const running=item._turnStatus==='inProgress';const heading=document.createElement('div');heading.className='reply-processing';heading.dataset.started=String(started);heading.dataset.duration=Number.isFinite(item._durationMs)&&item._durationMs>=0?String(item._durationMs):'';heading.dataset.running=String(running);const label=document.createElement('span'),line=document.createElement('span');line.className='reply-processing-line';line.setAttribute('aria-hidden','true');heading.append(label,line);processingLabel(heading);return heading;}
if(typeof document!=='undefined')setInterval(()=>{for(const element of document.querySelectorAll('.reply-processing[data-running=true]'))processingLabel(element);},1000);
