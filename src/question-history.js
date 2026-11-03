import fs from 'node:fs';
import path from 'node:path';
import {fault} from './storage.js';
const caches=new Map(),reading=new Map();
const clean=value=>String(value??'').slice(0,4000);
function usageBreakdown(value){if(!value||typeof value!=='object')return null;const fields={inputTokens:'input_tokens',cachedInputTokens:'cached_input_tokens',cacheWriteInputTokens:'cache_write_input_tokens',outputTokens:'output_tokens',reasoningOutputTokens:'reasoning_output_tokens',totalTokens:'total_tokens'},result={};for(const [key,native]of Object.entries(fields)){const number=value[native];if(Number.isSafeInteger(number)&&number>=0)result[key]=number;}return Object.keys(result).length?result:null;}
function within(root,file){const relative=path.relative(root,file);return relative!== '..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
function consume(cache,line){
 let row;try{row=JSON.parse(line);}catch{return;}
 const item=row.payload;if(row.type==='turn_context')cache.turnId=item?.turn_id;
 if(row.type==='event_msg'&&item?.type==='token_count'&&item.info){const total=usageBreakdown(item.info.total_token_usage),last=usageBreakdown(item.info.last_token_usage),window=item.info.model_context_window;if(total||last){cache.usage={total,last,modelContextWindow:Number.isSafeInteger(window)&&window>0?window:null};cache.usageAt=row.timestamp;}}
 if(row.type!=='response_item'||!item)return;
 if(item.type==='function_call'&&/(?:^|[./])request_user_input(?:_async)?$/.test(item.name||'')){
  let args;try{args=JSON.parse(item.arguments);}catch{return;}if(!Array.isArray(args.questions)||!item.call_id)return;
  const questions=args.questions.filter(q=>q&&typeof q==='object').slice(0,30).map(q=>({id:clean(q.id),question:clean(q.question||q.header),isSecret:q.isSecret===true,options:(q.isSecret?[]:Array.isArray(q.options)?q.options:[]).filter(o=>o&&typeof o==='object').slice(0,30).map(o=>({label:clean(o.label),description:clean(o.description)}))}));
  cache.calls.set(item.call_id,{callId:item.call_id,turnId:item.internal_chat_message_metadata_passthrough?.turn_id||cache.turnId,questions});
  if(cache.calls.size>10000)throw fault('此聊天提问历史过多，请在桌面查看',413);
 }
 if(item.type==='function_call_output'&&cache.calls.has(item.call_id)){
  let output;try{output=JSON.parse(item.output);}catch{return;}if(!output?.answers||typeof output.answers!=='object')return;
  const call=cache.calls.get(item.call_id);call.answers=call.questions.map(q=>({question:q.question,options:q.options,answer:q.isSecret?'[已回答，内容已隐藏]':(Object.hasOwn(output.answers,q.id)&&Array.isArray(output.answers[q.id]?.answers)?output.answers[q.id].answers.map(clean).join('、'):'未回答')}));
  const raw=item.internal_chat_message_metadata_passthrough?.create_time;call.sentAt=typeof raw==='number'?(raw<1e12?raw*1000:raw):row.timestamp;
 }
}
async function scan(file){
 const stat=await fs.promises.stat(file);let cache=caches.get(file);
 if(cache&&cache.size===stat.size&&cache.mtime===stat.mtimeMs)return cache;
 if(!cache||stat.size<=cache.size)cache={size:0,mtime:0,remainder:Buffer.alloc(0),discarding:false,calls:new Map()};
 if(stat.size>cache.size){
  const stream=fs.createReadStream(file,{start:cache.size,end:stat.size-1,highWaterMark:64*1024});
  for await(const chunk of stream){const data=Buffer.concat([cache.remainder,chunk]);let offset=0,index;while((index=data.indexOf(10,offset))>=0){if(cache.discarding)cache.discarding=false;else if(index-offset<=2*1024*1024)consume(cache,data.subarray(offset,index).toString('utf8'));offset=index+1;}cache.remainder=Buffer.from(data.subarray(offset));if(cache.remainder.length>2*1024*1024){cache.remainder=Buffer.alloc(0);cache.discarding=true;}}
 }
 cache.size=stat.size;cache.mtime=stat.mtimeMs;caches.delete(file);caches.set(file,cache);if(caches.size>64)caches.delete(caches.keys().next().value);return cache;
}
async function historyCache(file,home){
 if(typeof file!=='string'||!file.endsWith('.jsonl')||!within(path.resolve(home),path.resolve(file)))return null;
 try{if(!within(await fs.promises.realpath(home),await fs.promises.realpath(file)))return null;}catch(error){if(error.code==='ENOENT')return null;throw error;}
 if(!reading.has(file))reading.set(file,scan(file).finally(()=>reading.delete(file)));
 return reading.get(file);
}
export async function usageHistory(file,home){const cache=await historyCache(file,home);return cache?.usage?{usage:cache.usage,at:cache.usageAt}:null;}
export async function questionHistory(file,home){const cache=await historyCache(file,home);return cache?[...cache.calls.values()].filter(row=>row.answers&&row.turnId).map(row=>({id:'question-answer:'+row.callId,type:'userMessage',_questionReply:true,_sentAt:row.sentAt,_turnId:row.turnId,text:'<send_user_message_question_reply>\n'+JSON.stringify(row.answers)+'\n</send_user_message_question_reply>'})):[];}
export async function enrichQuestions(thread,home){
 const usage=await usageHistory(thread.path,home);if(usage){thread.webTokenUsage=usage.usage;thread.webTokenUsageAt=usage.at;}const rows=await questionHistory(thread.path,home);if(!rows.length)return;
 for(const turn of thread.turns||[]){const answers=rows.filter(row=>row._turnId===turn.id);if(!answers.length)continue;const items=turn.items||[],known=new Set(items.map(item=>item.id));const fresh=answers.filter(row=>!known.has(row.id));let index=items.findIndex(item=>['agentMessage','plan'].includes(item.type)&&item.phase!=='commentary');if(index<0)index=items.length;turn.items=[...items.slice(0,index),...fresh,...items.slice(index)];}
}
