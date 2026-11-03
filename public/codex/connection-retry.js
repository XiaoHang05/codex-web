import {animateDisclosure} from './message-ui.js';

export function connectionRetryRecord(item,expanded){
  const details=document.createElement('details');details.className='connection-retry';details.dataset.item=item.id||'retry:'+item._turnId;details.dataset.running=String(!item.historical&&item._turnStatus==='inProgress');details.open=expanded.has(details.dataset.item);
  const summary=document.createElement('summary');summary.className='work-title';const label=document.createElement('span');label.className='work-label';label.textContent=item.historical||item._turnStatus==='inProgress'?`正在重新连接 ${item.attempt}/${item.limit||5}`:item._turnStatus==='completed'?'已重新连接':'连接失败';
  const icon=document.createElement('span');icon.className='work-icon connection-retry-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" focusable="false"><path d="M2.5 8.5a14.5 14.5 0 0 1 19 0M5.8 12a9.5 9.5 0 0 1 12.4 0M9.2 15.5a4.5 4.5 0 0 1 5.6 0"/><circle cx="12" cy="19" r="1"/></svg>';summary.append(icon,label);
  const body=document.createElement('div');body.className='connection-retry-body';
  for(const reason of item.reasons?.length?item.reasons:['原始记录未提供详细原因']){const line=document.createElement('div');line.textContent=reason;body.append(line);}
  details.append(summary,body);animateDisclosure(details,body);return details;
}

export function historicalConnectionRetry(item,content){
  if(item.type==='userMessage'||item.type==='connectionRetry'||item.phase==='final_answer')return null;
  const match=String(content||'').trim().match(/^(?:Reconnecting\.\.\.|正在重新连接)\s*(\d+)\s*\/\s*(\d+)(?:\r?\n([\s\S]*))?$/i);
  if(!match)return null;
  return {...item,type:'connectionRetry',historical:item._turnStatus!=='inProgress',attempt:Number(match[1]),limit:Number(match[2]),reasons:retryReasons(item,match[3])};
}

// App error items and native error notifications carry details separately from the title.
export function retryReasons(item,inline){
  return [...new Set([inline,item.additionalDetails,item.additional_details,item.error?.additionalDetails,item.error?.additional_details,...(item.reasons||[])].filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()))];
}

export function recordConnectionError(items,{turnId,error,willRetry,startedAt}){
  if(!turnId)return;
  const key='retry:'+turnId,previous=items.get(key),message=typeof error==='string'?error:error?.message||'';
  const counter=message.trim().match(/^(?:Reconnecting\.\.\.|正在重新连接)\s*(\d+)\s*\/\s*(\d+)(?:\r?\n([\s\S]*))?$/i);
  const reasons=retryReasons(typeof error==='object'&&error?error:{},counter?counter[3]:message);
  items.set(key,{id:key,type:'connectionRetry',_turnId:turnId,_turnStatus:willRetry?'inProgress':'failed',_processingStartedAt:previous?._processingStartedAt??startedAt??Date.now(),attempt:counter?Number(counter[1]):(previous?.attempt||0)+1,limit:counter?Number(counter[2]):previous?.limit||5,reasons:[...(previous?.reasons||[]),...reasons]});
}
