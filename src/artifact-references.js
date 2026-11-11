import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {Marked} from '../public/codex/vendor/marked.js';
import {fileCitationExtension} from '../public/codex/file-citations.js';
import {isArtifactLink,normalizeArtifactPath} from '../public/codex/artifact-path.js';

const markdown=new Marked({extensions:[fileCitationExtension]});

export function citedFile(item,cwd,resolved){
  const text=[typeof item.text==='string'?item.text:'',...(Array.isArray(item.content)?item.content:[]).map(part=>part?.text||part?.inputText||'')].join('\n');
  let cited=false;
  // Match links with the same Markdown lexer used by the UI, including reference
  // links and escaped destinations. Code examples and images grant no access.
  markdown.walkTokens(markdown.lexer(text),token=>{
    const destination=token.type==='fileCitation'?token.path:token.type==='link'&&isArtifactLink(token.href)?token.href:null;
    if(destination&&path.resolve(cwd,normalizeArtifactPath(destination))===resolved)cited=true;
  });
  return cited;
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
