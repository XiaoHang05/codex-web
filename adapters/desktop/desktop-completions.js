import fs from 'node:fs';import path from 'node:path';
import {dataRoot,readJson,writeJson} from '../../src/storage.js';
import {approvalSummary} from '../../src/notification-format.js';
// Incremental journal reads cover short turns and app-tool inline questions.
export class DesktopCompletions {
  constructor(history,notifications,{directory=dataRoot,clock=Date.now}={}){
    this.history=history;this.notifications=notifications;this.clock=clock;
    this.file=path.join(directory,'desktop-notification-cursors.json');
    this.state=readJson(this.file,{initialized:false,since:clock(),files:{}});this.error=null;this.lastSuccess=null;
  }
  consume(line,row,since,cursor){
    let event;try{event=JSON.parse(line);}catch{return;}
    const payload=event.payload;
    // Inline questions are app tools, so they never appear in native IPC requests.
    // Wait for acceptance, retaining bounded call metadata across chunks/restarts.
    if(event.type==='response_item'&&Date.parse(event.timestamp)>=Math.max(since,this.state.asyncQuestionsSince??this.clock())){
      if(payload?.type==='function_call'&&/^(?:functions\.)?request_user_input_async$/.test(payload.name||'')&&typeof payload.call_id==='string'){
        let args;try{args=JSON.parse(payload.arguments);}catch{return;}
        const questions=Array.isArray(args?.questions)?args.questions.filter(q=>q&&typeof q.title==='string'&&q.title.trim()).slice(0,30):[];
        if(!questions.length)return;
        const pending=cursor.asyncQuestions||={};
        Object.defineProperty(pending,payload.call_id,{value:approvalSummary({questions},'requestUserInput'),enumerable:true,writable:true,configurable:true});
        for(const id of Object.keys(pending).slice(0,-32))delete pending[id];
      }
      if(payload?.type==='function_call_output'&&Object.hasOwn(cursor.asyncQuestions||{},payload.call_id)){
        const summary=cursor.asyncQuestions[payload.call_id];delete cursor.asyncQuestions[payload.call_id];
        let result;try{result=JSON.parse(payload.output);}catch{return;}
        if(result?.accepted===true)this.notifications.enqueue({source:'codex',cwd:row.cwd,threadName:row.name,id:`desktop:${row.threadId}:question:${payload.call_id}`,kind:'question',summary,path:`/codex/?source=desktop&thread=${encodeURIComponent(row.threadId)}`});
      }
    }
    if(event.type!=='event_msg'||payload?.type!=='task_complete'||typeof payload.turn_id!=='string')return;
    if(!(Date.parse(event.timestamp)>=since))return;
    this.notifications.enqueue({source:'codex',cwd:row.cwd,threadName:row.name,id:`desktop:${row.threadId}:turn:${payload.turn_id}:completed`,kind:'completed',summary:payload.last_agent_message||'任务已完成，打开会话查看回复',path:`/codex/?source=desktop&thread=${encodeURIComponent(row.threadId)}`});
  }
  poll(rows){
    // Start this new event category at deployment, without replaying old questions.
    this.state.asyncQuestionsSince??=this.clock();
    const retained=new Set(),changed=[];let failures=0;
    for(const row of rows){
      const file=this.history.files.get(row.threadId);if(!file||retained.has(row.threadId))continue;retained.add(row.threadId);
      try{
        const stat=fs.statSync(file);let cursor=this.state.files[row.threadId];
        if(!cursor||cursor.file!==file||cursor.offset>stat.size){
          cursor=this.state.files[row.threadId]={file,offset:this.state.initialized&&!cursor?0:stat.size,mtime:0,since:cursor?this.clock():this.state.since,discard:false};
        }
        if(cursor.offset<stat.size||cursor.mtime!==stat.mtimeMs)changed.push({row,file,stat,cursor});
      }catch{failures++;}
    }
    // Fairly drain bounded chunks; an oversized or partial line cannot block others.
    changed.sort((a,b)=>(a.cursor.checked||0)-(b.cursor.checked||0));
    for(const {row,file,stat,cursor}of changed.slice(0,4)){
      let fd;try{
        fd=fs.openSync(file,'r');
        for(let i=0;i<4&&cursor.offset<stat.size;i++){
          const buffer=Buffer.alloc(Math.min(512*1024,stat.size-cursor.offset));const n=fs.readSync(fd,buffer,0,buffer.length,cursor.offset);if(!n)break;const chunk=buffer.subarray(0,n);
          if(cursor.discard){const end=chunk.indexOf(10);cursor.offset+=end<0?n:end+1;if(end>=0)cursor.discard=false;continue;}
          const end=chunk.lastIndexOf(10);
          if(end<0){if(n===512*1024){cursor.discard=true;cursor.offset+=n;}break;}
          for(const line of chunk.subarray(0,end).toString('utf8').split('\n'))this.consume(line,row,cursor.since,cursor);
          cursor.offset+=end+1;
        }
        cursor.mtime=stat.mtimeMs;cursor.checked=this.clock();
      }catch{failures++;}finally{if(fd!==undefined)fs.closeSync(fd);}
    }
    for(const id of Object.keys(this.state.files))if(!retained.has(id))delete this.state.files[id];
    this.state.initialized=true;writeJson(this.file,this.state);this.lastSuccess=this.clock();this.error=failures?`${failures} 个桌面日志暂时不可读`:null;
  }
  status(){return {lastSuccess:this.lastSuccess,error:this.error,files:Object.keys(this.state.files).length};}
}
