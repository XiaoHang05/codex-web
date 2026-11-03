import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {fileCitations} from '../public/codex/file-citations.js';
import {normalizeArtifactPath} from '../public/codex/artifact-path.js';

export function citedFile(item,cwd,resolved){
  const text=[typeof item.text==='string'?item.text:'',...(Array.isArray(item.content)?item.content:[]).map(part=>part?.text||part?.inputText||'')].join('\n');
  return fileCitations(text).some(citation=>path.resolve(cwd,normalizeArtifactPath(citation.path))===resolved);
}
export async function webFileCitation(codex,profile,thread,cwd,resolved){
  const instance=codex.instances.get(profile);if(!instance)return false;
  for(const turn of instance.streamReplies?.values()||[]){
    if(turn.threadId===thread&&[...turn.items.values()].some(item=>citedFile(item,cwd,resolved)))return true;
  }
  // Read an already running instance only. Never start, resume or take over it.
  if(!instance.ready||typeof codex.call!=='function')return false;
  const result=await codex.call(instance,'thread/read',{threadId:thread,includeTurns:true});
  if(result.thread?.id!==thread)return false;
  return (result.thread.turns||[]).flatMap(turn=>turn.items||[]).some(item=>['userMessage','agentMessage','assistantMessage'].includes(item.type)&&citedFile(item,cwd,resolved));
}
export async function desktopFileCitation(history,id,cwd,resolved){
  history.list();const file=history.files?.get(id);if(!file)return false;
  const stream=fs.createReadStream(file,{encoding:'utf8'}),lines=readline.createInterface({input:stream,crlfDelay:Infinity});
  try{
    for await(const line of lines){
      let row;try{row=JSON.parse(line);}catch{continue;}
      const item=row.payload;
      if(row.type==='response_item'&&item?.type==='message'&&['user','assistant'].includes(item.role)&&citedFile(item,cwd,resolved))return true;
    }
    return false;
  }finally{lines.close();stream.destroy();}
}
