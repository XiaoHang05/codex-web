import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
const browserAvailable=process.env.PLAYWRIGHT_MODULE&&process.env.CHROMIUM_BIN;
test('last user message editing cancels, regenerates once, keeps drafts and images, and survives reload',{skip:!browserAvailable&&'Set browser paths',timeout:60000},async()=>{
 const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-message-edit-browser-')),data=path.join(root,'data'),workspace=path.join(root,'workspace');
 fs.mkdirSync(path.join(data,'codex/default'),{recursive:true});fs.mkdirSync(workspace);
 process.env.CODEX_WEB_DATA_DIR=data;process.env.CODEX_WEB_WORKSPACE=workspace;
 fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({codexBinary:process.execPath,codexArguments:[fileURLToPath(new URL('./fixture-engine.mjs',import.meta.url))],profiles:[{id:'default',cwd:workspace,provider:'chatgpt'}]}));
 fs.writeFileSync(path.join(data,'codex/default/auth.json'),JSON.stringify({tokens:{account_id:'fixture-edit-browser'}}));
 const image={type:'image',url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='};
 let running,browser;
 try{
  const {startStandalone}=await import('../src/standalone.js');running=await startStandalone({port:0});
  const manager=running.service.context.codex;browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN,headless:true});
  for(const width of [1280,390]){
   const {thread}=await manager.rpc('default','thread/start',{cwd:workspace});
   await manager.rpc('default','turn/start',{threadId:thread.id,input:[{type:'text',text:'Earlier question'}]});await delay(25);
   const old=await manager.rpc('default','turn/start',{threadId:thread.id,input:[{type:'text',text:'Original question'},image]});await delay(25);
   const page=await browser.newPage({viewport:{width,height:850}}),errors=[];let posts=0;
   page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(new URL(request.url()).pathname==='/codex-api/v1/message-edit'&&request.method()==='POST')posts++;});
   await page.goto(new URL('/codex/?profile=default&thread='+thread.id,running.url).href);
   const edit=page.getByRole('button',{name:'修改消息并重新生成',exact:true});await edit.waitFor({state:'attached',timeout:10000}).catch(async failure=>{console.error(JSON.stringify({width,errors,body:(await page.locator('body').innerText()).slice(-5000)}));throw failure;});assert.equal(await edit.count(),1);
   const observer=await browser.newPage({viewport:{width,height:850}});await observer.goto(page.url());await observer.locator('.message.user').filter({hasText:'Original question'}).waitFor();
   await page.locator('#input').fill('Unsent composer draft');
   const latest=page.locator('.message.user').last();if(width===390)await latest.locator(':scope>span').first().click();else await latest.hover();
   assert.equal(await edit.evaluate(button=>button.previousElementSibling.getAttribute('aria-label')),'复制消息');
   await edit.click();let dialog=page.getByRole('dialog',{name:'修改最后一条消息',exact:true});await dialog.waitFor();
   await dialog.getByRole('textbox',{name:'修改最后一条消息',exact:true}).fill('Cancelled edit');await dialog.getByRole('button',{name:'取消',exact:true}).click();await dialog.waitFor({state:'detached'});assert.equal(posts,0);
   if(width===390)await latest.locator(':scope>span').first().click();else await latest.hover();await edit.click();dialog=page.getByRole('dialog',{name:'修改最后一条消息',exact:true});
   const field=dialog.getByRole('textbox',{name:'修改最后一条消息',exact:true});assert.equal(await field.inputValue(),'Original question');await field.fill('Revised question '+width);
   const response=page.waitForResponse(response=>response.url().endsWith('/codex-api/v1/message-edit')&&response.request().method()==='POST');
   await dialog.getByRole('button',{name:'保存并重新生成',exact:true}).evaluate(button=>{button.click();button.click();});assert.equal((await response).status(),200);
   await dialog.waitFor({state:'detached'});await page.locator('.message.user').filter({hasText:'Revised question '+width}).waitFor();
   await observer.locator('.message.user').filter({hasText:'Revised question '+width}).waitFor();assert.equal(await observer.locator('[data-turn-id="'+old.turn.id+'"]').count(),0);await observer.close();
   assert.equal(posts,1);assert.equal(await page.locator('.message.user').count(),2);assert.equal(await page.locator('[data-turn-id="'+old.turn.id+'"]').count(),0);
   assert.equal(await page.locator('#input').inputValue(),'Unsent composer draft');assert.equal(await page.locator('.message.user').last().locator('.user-image-attachments img').count(),1);
   await edit.waitFor({state:'attached'});assert.equal(await edit.count(),1);
   await page.reload();await page.locator('.message.user').filter({hasText:'Revised question '+width}).waitFor();assert.equal(await page.locator('.message.user').count(),2);assert.equal(await edit.count(),1);
   const after=(await manager.rpc('default','thread/read',{threadId:thread.id,includeTurns:true})).thread;
   assert.equal(after.turns.length,2);assert.equal(after.turns[0].items[0].content[0].text,'Earlier question');assert.deepEqual(after.turns[1].items[0].content[1],image);
   // A failed/ambiguous submit keeps the edited text and disables repeat submission.
   const last=page.locator('.message.user').last();if(width===390)await last.locator(':scope>span').first().click();else await last.hover();await edit.click();dialog=page.getByRole('dialog',{name:'修改最后一条消息',exact:true});
   await dialog.getByRole('textbox',{name:'修改最后一条消息',exact:true}).fill('Keep this failed edit');
   await page.route('**/codex-api/v1/message-edit',route=>route.request().method()==='POST'?route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'fixture outcome uncertain'})}):route.continue());
   await dialog.getByRole('button',{name:'保存并重新生成',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'fixture outcome uncertain'}).waitFor();
   assert.equal(await dialog.getByRole('textbox',{name:'修改最后一条消息',exact:true}).inputValue(),'Keep this failed edit');assert.equal(await dialog.getByRole('button',{name:'保存并重新生成',exact:true}).isDisabled(),true);
   await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(errors,[]);
   console.log(JSON.stringify({width,editPosts:posts,earlierTurnPreserved:true,attachmentPreserved:true,reload:true,pageErrors:errors}));await page.close();
  }
 }finally{await browser?.close();await running?.close();fs.rmSync(root,{recursive:true,force:true});}
});
