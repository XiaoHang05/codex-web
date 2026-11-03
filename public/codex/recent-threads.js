import {desktopTurns} from './desktop-turn-state.js';
import {threadActivity} from './thread-activity.js';

export function isRecentCodexMessage(event){
 return event.method==='turn/started'||event.method==='item/agentMessage/delta'||['item/started','item/completed'].includes(event.method)&&['userMessage','agentMessage'].includes(event.params?.item?.type);
}

// History provides the initial order; live message activity fills in disk/index delays.
export function recentThreadActivity(clock=Date.now){
 const times=new Map(),desktopMessages=new Map();let last=0;
 return {
  touch(row){if(!row?.key)return;last=Math.max(clock(),last+1);times.set(row.key,last);},
  latest(rows){return [...rows].sort((a,b)=>Math.max(b.updatedAt||0,times.get(b.key)||0)-Math.max(a.updatedAt||0,times.get(a.key)||0)).slice(0,5);},
  desktopChanged(threadId,state){
   const stamp=JSON.stringify(desktopTurns(state).flatMap(turn=>(turn.items||[]).filter(item=>['userMessage','steeringUserMessage','steered','agentMessage'].includes(item.type)).map(item=>[item.id,item.type,item.text,item.content])));
   const previous=desktopMessages.get(threadId);desktopMessages.set(threadId,stamp);
   return previous!==undefined&&previous!==stamp;
  }
 };
}

export function recentThreadsView(container,onOpen,actions){
 const list=container.querySelector('.recent-thread-list'),buttons=new Map();let signature='';
 return {render(rows,selectedKey,feedback){
  const next=JSON.stringify(rows.map(row=>[row.key,row.name,row.cwd,row.sources,row.protected,row.conflict,row.accountMismatch,row.running,row.needsAttention,feedback.has(row.key),row.key===selectedKey,actions?.pinned(row)]));
  if(next===signature)return;signature=next;container.hidden=!rows.length;
  const keys=new Set(rows.map(row=>row.key));for(const [key,button]of buttons)if(!keys.has(key)){button.remove();buttons.delete(key);}
  rows.forEach((row,index)=>{
   let button=buttons.get(row.key);if(!button){button=document.createElement(actions?'div':'button');if(!actions)button.type='button';buttons.set(row.key,button);}
   button.className='recent-thread'+(row.key===selectedKey?' selected':'');button.dataset.thread=row.threadId;
   button.setAttribute('aria-current',String(row.key===selectedKey));
   const name=row.name||'会话';button.title=name+(row.cwd?'\n'+row.cwd:'');
   button.setAttribute('aria-label',(row.needsAttention?'待处理审批，':feedback.has(row.key)?'有新回复，':'')+(row.running?'正在运行，':'')+name);
   const title=document.createElement('span');title.className='recent-thread-title';title.textContent=name;
   const opener=actions?document.createElement('button'):button;if(actions){opener.type='button';opener.className='recent-thread-open';opener.setAttribute('aria-label',button.getAttribute('aria-label'));opener.setAttribute('aria-current',String(row.key===selectedKey));button.removeAttribute('aria-label');button.removeAttribute('aria-current');}
   opener.replaceChildren(threadActivity(row,feedback.has(row.key)),title);opener.onclick=()=>onOpen(row);
   if(actions)button.replaceChildren(opener,actions.render(row));
   if(list.children[index]!==button)list.insertBefore(button,list.children[index]||null);
  });
 }};
}
