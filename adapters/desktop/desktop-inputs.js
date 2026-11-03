import fs from 'node:fs';import {fault} from '../../src/storage.js';
import path from 'node:path';import readline from 'node:readline';
import {userContent} from '../../public/codex/user-content.js';
const caches=new Map();
export async function desktopImageReference(history,id,cwd,resolved){
  history.list();const file=history.files.get(id);if(!file)return false;
  const stream=fs.createReadStream(file,{encoding:'utf8'}),lines=readline.createInterface({input:stream,crlfDelay:Infinity});
  try{for await(const line of lines){
    let row;try{row=JSON.parse(line);}catch{continue;}
    const item=row.payload;if(row.type!=='response_item'||item?.type!=='message'||item.role!=='user')continue;
    const text=(item.content||[]).map(part=>part.text||'').join('\n');
    // Check file references separately: rendering may prefer embedded copies.
    const images=[...userContent(text).images,...userContent('',{content:item.content}).images];
    if(images.some(image=>!image.startsWith('data:')&&path.resolve(cwd,image)===resolved))return true;
  }return false;}finally{lines.close();stream.destroy();}
}
export function desktopInputs(history,id){history.list();const file=history.files.get(id);if(!file)throw fault('找不到桌面会话',404);const stat=fs.statSync(file);let cache=caches.get(file);if(cache&&cache.size===stat.size&&cache.mtime===stat.mtimeMs)return cache.messages;
  const initial=!cache||stat.size<cache.size;const offset=initial?Math.max(0,stat.size-16*1024*1024):cache.size;const buffer=Buffer.alloc(stat.size-offset),fd=fs.openSync(file,'r');try{fs.readSync(fd,buffer,0,buffer.length,offset);}finally{fs.closeSync(fd);}
  let content=(initial?'':cache.remainder)+buffer.toString('utf8');if(initial&&offset>0)content=content.slice(content.indexOf('\n')+1);const lines=content.split('\n'),remainder=lines.pop()||'';const messages=initial?[]:[...cache.messages];
  for(const line of lines)try{const row=JSON.parse(line),item=row.payload;if(row.type!=='response_item'||item?.type!=='message'||item.role!=='user')continue;const text=(item.content||[]).map(part=>part.text||'').join('\n');if(!text&&!(item.content||[]).some(part=>['image','input_image','localImage'].includes(part.type)))continue;const metadata=item.internal_chat_message_metadata_passthrough||{};messages.push({id:item.id||'input:'+row.timestamp,prefix:String(item.id||'').replace(/^msg_/,'').slice(0,23),text,content:item.content,_sentAt:metadata.create_time||row.timestamp,turnId:metadata.turn_id});}catch{}
  cache={size:stat.size,mtime:stat.mtimeMs,messages:messages.slice(-400),remainder};caches.set(file,cache);if(caches.size>150)caches.delete(caches.keys().next().value);return cache.messages;
}
