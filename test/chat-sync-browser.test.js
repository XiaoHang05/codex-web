import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';

test('resume history stays readable while pending queries and history reads stall',{
 skip:!process.env.PLAYWRIGHT_MODULE&&'Set PLAYWRIGHT_MODULE',timeout:60000
},async()=>{
 const playwright=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href),{chromium}=playwright.default||playwright;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'chat-sync-')),data=path.join(root,'data'),workspace=path.join(root,'workspace');
 fs.mkdirSync(path.join(data,'codex/default'),{recursive:true});fs.mkdirSync(workspace);
 process.env.CODEX_WEB_DATA_DIR=data;process.env.CODEX_WEB_WORKSPACE=workspace;
 fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({codexBinary:process.execPath,codexArguments:[fileURLToPath(new URL('./fixture-engine.mjs',import.meta.url))],profiles:[{id:'default',cwd:workspace,provider:'chatgpt'}]}));
 let running,browser,releaseRead,releasePending,releaseCatalog;
 try{
  const {startStandalone}=await import('../src/standalone.js');running=await startStandalone({port:0});
  const manager=running.service.context.codex,original=manager.rpc.bind(manager);
  const {thread}=await original('default','thread/start',{cwd:workspace});
  const turns=Array.from({length:35},(_,i)=>({id:'turn-'+i,status:i===34?'inProgress':'completed',items:[{id:'user-'+i,type:'userMessage',content:[{type:'text',text:'Historical question '+i}]},{id:'answer-'+i,type:'agentMessage',text:('History answer '+i+'\n\n').repeat(4)}]}));
  const snapshot={thread:{...thread,turns},model:'fixture-model'};
  let reads=0;
  manager.rpc=async(id,method,params)=>{
   if(params.threadId===thread.id&&method==='thread/resume')return structuredClone(snapshot);
   if(params.threadId===thread.id&&method==='thread/read'){reads++;await new Promise(resolve=>{releaseRead=resolve;});return structuredClone(snapshot);}
   return original(id,method,params);
  };
  browser=await chromium.launch({...(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN}:{channel:'msedge'}),headless:true});
  for(const [width,scroll] of [[1440,'internal'],[390,'document'],[390,'internal']]){
   const page=await browser.newPage({viewport:{width,height:800}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/codex-api/v1/codex/default/pending',async route=>{await new Promise(resolve=>{releasePending=resolve;});await route.fulfill({json:[]}).catch(()=>{});});
   await page.goto(new URL('?profile=default&thread='+thread.id+'&mobileScroll='+scroll,running.url).href);
   await page.locator('.message.user').filter({hasText:'Historical question 0'}).waitFor({state:'attached'});
   await page.waitForFunction(()=>document.getElementById('chat-load').hidden&& !document.getElementById('send').disabled);
   assert.equal(reads,0,'a current resume snapshot must not wait for a redundant read');
   const emit=running.service.context.emit;
   // Exercise the loading scroll policy with an outstanding read on reload:
   // removing resume turns requires the normal read path.
   const savedTurns=snapshot.thread.turns;delete snapshot.thread.turns;
   await page.reload();
   await page.waitForFunction(()=>document.getElementById('chat-load').textContent.includes('同步聊天记录'));
   snapshot.thread.turns=savedTurns;
   // Live deltas arriving while that read waits used to pin every render down.
   for(let i=0;i<8;i++)emit('codex',{profile:'default',method:'item/agentMessage/delta',params:{threadId:thread.id,turnId:'turn-34',itemId:'live',delta:('Live paragraph '+i+'\n\n').repeat(20)}});
   await page.locator('.message:not(.user)').filter({hasText:'Live paragraph 7'}).waitFor();
   await page.locator('#messages').dispatchEvent('wheel',{deltaY:-900});
   await page.locator('#messages').evaluate(box=>{box.scrollTop=0;});
   for(let i=8;i<14;i++)emit('codex',{profile:'default',method:'item/agentMessage/delta',params:{threadId:thread.id,turnId:'turn-34',itemId:'live',delta:'More live '+i+'\n\n'}});
   await page.locator('.message:not(.user)').filter({hasText:'More live 13'}).waitFor();
   assert((await page.locator('#messages').evaluate(box=>box.scrollTop))<100,'streaming must respect an upward scroll during sync');
   releaseRead();releaseRead=null;
   await page.locator('.message.user').filter({hasText:'Historical question 0'}).waitFor({state:'attached'});
   await page.waitForFunction(()=>document.getElementById('chat-load').hidden);
   assert((await page.locator('#messages').evaluate(box=>box.scrollTop))<100,'late history must preserve the reader position');
   releasePending?.();releasePending=null;assert.deepEqual(errors,[]);
   console.log(JSON.stringify({width,scroll,resumeHistory:true,pendingNonBlocking:true,streamingScroll:true,lateHistory:true}));
   reads=0;await page.close();
  }
  const race=await browser.newPage();
  await race.addInitScript(()=>{const Native=EventSource;window.EventSource=class extends Native{constructor(...args){super(...args);this.addEventListener('codex',event=>{if(JSON.parse(event.data).method==='turn/completed')window.lifecycleSeen=true;});}};});
  await race.route('**/codex-api/v1/codex/default/rpc',async route=>{
   if(route.request().postDataJSON()?.method==='model/list')await new Promise(resolve=>{releaseCatalog=resolve;});
   await route.continue();
  });
  await race.goto(new URL('?profile=default&thread='+thread.id,running.url).href);
  await race.locator('.message.user').filter({hasText:'Historical question 0'}).waitFor({state:'attached'});
  running.service.context.emit('codex',{profile:'default',method:'turn/completed',params:{threadId:thread.id,turn:{id:'turn-34',status:'completed'}}});
  await race.waitForFunction(()=>window.lifecycleSeen);
  releaseCatalog();releaseCatalog=null;
  await race.waitForFunction(()=>document.getElementById('chat-load').textContent.includes('同步聊天记录'));
  assert(reads>0,'a lifecycle change during loading must invalidate the resume shortcut');
  releaseRead();releaseRead=null;
  await race.waitForFunction(()=>document.getElementById('chat-load').hidden);
  console.log(JSON.stringify({lifecycleRaceForcesFreshRead:true}));await race.close();
 }finally{releaseRead?.();releasePending?.();releaseCatalog?.();await browser?.close();await running?.close();fs.rmSync(root,{recursive:true,force:true});}
});
