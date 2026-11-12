import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fault} from '../../src/storage.js';
import {replacedMessageTurns} from '../../src/message-edit-history.js';

const caches=new Map();
function compactionStart(payload){return (Array.isArray(payload.replacement_history)?payload.replacement_history:[]).flatMap(item=>{if(item.type!=='message')return [];const text=(Array.isArray(item.content)?item.content:[]).filter(part=>['input_text','output_text','text'].includes(part.type)&&typeof part.text==='string').map(part=>part.text).join('\n');return text.trim()?[(item.role?item.role+'：\n':'')+text]:[];}).join('\n\n');}
function completedTool(item){
 if(item?.type==='CommandExecution'){
  const command=Array.isArray(item.command)?item.command.join(' '):String(item.command||'');
  const parsed=Array.isArray(item.parsed_cmd)?item.parsed_cmd:[];
  const actions=parsed.filter(action=>['read','listFiles','search'].includes(action?.type)).map(action=>({type:action.type,path:action.path,name:action.name,query:action.query,command:action.cmd}));
  const duration=item.duration?.secs!=null?item.duration.secs*1000+(item.duration.nanos||0)/1e6:null;
  return {id:item.id,type:'commandExecution',command,commandActions:actions,status:item.status,exitCode:item.exit_code,durationMs:duration,aggregatedOutput:String(item.aggregated_output||item.formatted_output||'').slice(0,16000)};
 }
 if(item?.type==='FileChange')return {id:item.id,type:'fileChange',status:item.status,changes:Object.entries(item.changes||{}).map(([path,change])=>({path,kind:{type:change.type},diff:String(change.unified_diff||'').slice(0,16000)}))};
 return null;
}
const digest=text=>createHash('sha256').update(text).digest('hex');
async function* lines(file,size){
 let pending=Buffer.alloc(0),offset=0;
 if(!size)return;
 for await(const chunk of fs.createReadStream(file,{end:size-1,highWaterMark:128*1024})){
  const data=pending.length?Buffer.concat([pending,chunk]):chunk;let start=0,next;
  while((next=data.indexOf(10,start))!==-1){yield {offset,length:next-start,line:data.subarray(start,next)};offset+=next-start+1;start=next+1;}
  pending=data.subarray(start);
 }
 if(pending.length)yield {offset,length:pending.length,line:pending};
 // JSON parsing below ignores an incomplete record while the desktop appends it.
}
async function build(file,stat){
 const records=[],turns=new Map(),responses=new Set(),users=new Set(),nativeCompactions=[];let activeTurn;
 for await(const row of lines(file,stat.size)){
  const raw=row.line.toString('utf8');
  if(!/"type"\s*:\s*"(?:message|task_started|task_complete|turn_aborted|agent_message|item_completed|compacted)"/.test(raw))continue;
  let entry;try{entry=JSON.parse(raw);}catch{continue;}
  const p=entry.payload;if(!p)continue;
  if(entry.type==='compacted'){records.push({offset:row.offset,length:row.length,id:'compaction:'+row.offset,compaction:true,turnId:activeTurn,sentAt:entry.timestamp});continue;}
  if(entry.type==='event_msg'&&p.type==='task_started'){activeTurn=p.turn_id;turns.set(activeTurn,{status:'inProgress',startedAt:p.started_at??entry.timestamp});continue;}
  if(entry.type==='event_msg'&&['task_complete','turn_aborted'].includes(p.type)){
   const turn=turns.get(p.turn_id)||{};Object.assign(turn,{status:p.type==='task_complete'?'completed':'interrupted',completedAt:p.completed_at??entry.timestamp,durationMs:p.duration_ms});turns.set(p.turn_id,turn);continue;
  }
  if(entry.type==='event_msg'&&p.type==='item_completed'&&p.item?.type==='ContextCompaction'){nativeCompactions.push({id:p.item.id,turnId:p.turn_id||activeTurn,sentAt:entry.timestamp});continue;}
  if(entry.type==='event_msg'&&p.type==='item_completed'&&['CommandExecution','FileChange'].includes(p.item?.type)){
   records.push({offset:row.offset,length:row.length,id:p.item.id||'history-tool:'+row.offset,turnId:p.turn_id||activeTurn,tool:true,sentAt:entry.timestamp});continue;
  }
  const response=entry.type==='response_item'&&p.type==='message'&&['user','assistant'].includes(p.role);
  const event=entry.type==='event_msg'&&p.type==='agent_message';if(!response&&!event)continue;
  const text=event?p.message:(p.content||[]).map(c=>c.text||'').join('\n');
  const user=response&&p.role==='user';if(!text&&!(user&&(p.content||[]).some(c=>['image','input_image','localImage'].includes(c.type))))continue;
  const meta=p.internal_chat_message_metadata_passthrough||{},turnId=meta.turn_id||activeTurn;
  const signature=!user?digest(String(turnId)+'\0'+text):null;if(response&&!user)responses.add(signature);
  const steering=user&&!!turnId&&users.has(turnId);if(user)users.add(turnId);
  records.push({offset:row.offset,length:row.length,id:p.id||'history:'+row.offset,turnId,user,event,signature,steering,sentAt:meta.create_time??entry.timestamp});
 }
 for(const record of records.filter(record=>record.compaction)){const index=nativeCompactions.findIndex(native=>native.id&&(!record.turnId||!native.turnId||record.turnId===native.turnId)&&Math.abs(Date.parse(native.sentAt)-Date.parse(record.sentAt))<30000);if(index>=0)record.nativeId=nativeCompactions.splice(index,1)[0].id;}
 const filtered=records.filter(record=>!record.event||!responses.has(record.signature));
 const lastReplies=new Map();for(const record of filtered)if(!record.user&&!record.compaction&&!record.tool)lastReplies.set(record.turnId,record.offset);
 return {records:filtered,turns,lastReplies};
}
async function index(file,stat){
 const key=stat.size+':'+stat.mtimeMs;let cache=caches.get(file);
 if(!cache||cache.key!==key){cache={key,promise:build(file,stat)};caches.set(file,cache);cache.promise.catch(()=>{if(caches.get(file)===cache)caches.delete(file);});}
 if(caches.size>6)caches.delete(caches.keys().next().value);
 return cache.promise;
}
export async function desktopHistoryPage(history,id,{cursor,limit=100}={}){
 history.list();const file=history.files.get(id);if(!file)throw fault('找不到本地历史',404);
 limit=Number(limit);if(!Number.isInteger(limit)||limit<1||limit>200)throw fault('无效历史分页大小',400);
 if(cursor!==undefined&&!/^(?:0|[1-9]\d*)$/.test(String(cursor)))throw fault('无效历史游标',400);
 const before=cursor===undefined?Infinity:Number(cursor);if(!Number.isSafeInteger(before)&&before!==Infinity)throw fault('无效历史游标',400);
 const stat=fs.statSync(file);if(before!==Infinity&&before>stat.size)throw fault('历史文件已变化，请重新打开聊天',409);
 const data=await index(file,stat),end=before===Infinity?data.records.length:data.records.findIndex(r=>r.offset>=before);
 const stop=end<0?data.records.length:end,start=Math.max(0,stop-limit),records=data.records.slice(start,stop);
 const fd=await fs.promises.open(file,'r'),items=[];
 try{for(const record of records){
  const bytes=Buffer.alloc(record.length);const {bytesRead}=await fd.read(bytes,0,bytes.length,record.offset);
  if(bytesRead!==bytes.length)throw fault('历史文件已变化，请重新打开聊天',409);
  let row;try{row=JSON.parse(bytes.toString('utf8'));}catch{throw fault('历史文件已变化，请重新打开聊天',409);}
  const p=row.payload;if(record.compaction){items.push({id:record.id,type:'contextCompaction',nativeId:record.nativeId,windowNumber:Number.isInteger(p.window_number)?p.window_number:null,message:typeof p.message==='string'?p.message:'',contextStart:compactionStart(p),_sentAt:record.sentAt,_turnId:record.turnId});continue;}
  if(record.tool){const tool=completedTool(p.item);if(tool){const turn=data.turns.get(record.turnId);items.push({...tool,_sentAt:record.sentAt,_turnId:record.turnId,_turnStatus:turn?.status,_processingStartedAt:turn?.startedAt});}continue;}
  const turn=data.turns.get(record.turnId),text=record.event?p.message:(p.content||[]).map(c=>c.text||'').join('\n');
  items.push({id:record.id,type:record.user?'userMessage':'agentMessage',phase:p.phase,text,...(record.user?{content:p.content}:{}),_sentAt:record.sentAt,_turnId:record.turnId,_steering:record.steering,_turnStatus:turn?.status,_completedAt:turn?.completedAt,_durationMs:turn?.durationMs,_processingStartedAt:turn?.startedAt,_replyComplete:turn?.status==='completed'&&data.lastReplies.get(record.turnId)===record.offset&&p.phase!=='commentary'});
 }}finally{await fd.close();}
 const removed=new Set(replacedMessageTurns('desktop:'+id));
 return {items:items.filter(item=>!removed.has(item._turnId)),source:'desktop',hasMore:start>0,nextCursor:start>0?String(records[0].offset):null,totalMessages:data.records.filter(record=>!removed.has(record.turnId)).length,fileBytes:stat.size};
}
