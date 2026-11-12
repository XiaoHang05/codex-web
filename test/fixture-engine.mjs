// Deterministic local protocol fixture. It never contacts a provider or executes tools.
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
const threads=new Map();let sequence=0;
const send=message=>process.stdout.write(JSON.stringify(message)+'\n');
for await(const line of readline.createInterface({input:process.stdin})){
  let message;try{message=JSON.parse(line);}catch{continue;}
  const {id,method,params={}}=message;if(id===undefined)continue;
  let result;
  switch(method){
    case 'initialize':result={userAgent:'fixture'};break;
    case 'account/read':result={account:{type:'chatgpt',email:'operator@example.invalid'}};break;
    case 'model/list':result={data:[{id:'fixture-model',model:'fixture-model',displayName:'Fixture model',isDefault:true,defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'medium',description:'Fixture'}]}]};break;
    case 'config/read':result={config:{model:'fixture-model',model_reasoning_effort:'medium'}};break;
    case 'windowsSandbox/readiness':result={status:'ready'};break;
    case 'skills/list':result={data:[]};break;
    case 'thread/list':result={data:[...threads.values()],nextCursor:null};break;
    case 'account/rateLimits/read':result={rateLimits:{primary:{usedPercent:10,windowDurationMins:300,resetsAt:2000000000},planType:'fixture'}};break;
    case 'account/usage/read':result={summary:{lifetimeTokens:0},dailyUsageBuckets:[]};break;
    case 'thread/start':{
      const thread={id:'fixture-thread-'+(++sequence),name:'Fixture conversation',cwd:params.cwd,createdAt:Math.floor(Date.now()/1000),updatedAt:Math.floor(Date.now()/1000),turns:[]};threads.set(thread.id,thread);result={thread,model:'fixture-model',modelProvider:'openai'};break;
    }
    case 'thread/read':case 'thread/resume':result={thread:threads.get(params.threadId),model:'fixture-model'};break;
    case 'thread/goal/get':result={goal:null};break;
    case 'thread/revert':{
      const thread=threads.get(params.threadId),at=thread?.turns.findIndex(turn=>turn.id===params.beforeTurnId);
      if(!thread||at<0){send({id,error:{message:'Unknown fixture turn'}});continue;}
      thread.turns.splice(at);result={thread};break;
    }
    case 'thread/rollback':{
      const thread=threads.get(params.threadId);thread.turns.splice(-params.numTurns);result={thread};break;
    }
    case 'turn/start':{
      const thread=threads.get(params.threadId),turn={id:'fixture-turn-'+(++sequence),status:params.fixtureHold?'inProgress':'completed',items:[{id:'fixture-user-'+sequence,type:'userMessage',content:params.input},{id:'fixture-answer-'+sequence,type:'agentMessage',text:'Fixture response **ready**.'}]};
      if(!thread){send({id,error:{message:'Unknown fixture thread'}});continue;}
      thread.turns.push(turn);result={turn};
      setTimeout(()=>{send({method:'turn/started',params:{threadId:thread.id,turn:{...turn,status:'inProgress'}}});send({method:'item/completed',params:{threadId:thread.id,turnId:turn.id,item:turn.items[1]}});if(!params.fixtureHold)send({method:'turn/completed',params:{threadId:thread.id,turn}});},10);break;
    }
    case 'turn/interrupt':{
      const thread=threads.get(params.threadId),turn=thread?.turns.at(-1);
      if(!turn||turn.id!==params.turnId||turn.status!=='inProgress'){send({id,error:{message:'Fixture active turn changed'}});continue;}
      setTimeout(()=>{turn.status='interrupted';send({method:'turn/completed',params:{threadId:thread.id,turn}});},30);result={};break;
    }
    default:send({id,error:{code:-32601,message:'Method not supported by fixture'}});continue;
  }
  send({id,result});
}
