import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const available=process.env.PLAYWRIGHT_MODULE&&process.env.CHROMIUM_BIN;
test('image drafts migrate, exceed localStorage quota, reload, clear and recover from storage failure',{skip:!available&&'Set browser paths',timeout:60000},async()=>{
 const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
 const source=fs.readFileSync(new URL('../public/codex/workspace-storage.js',import.meta.url));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/storage.js'?'text/javascript':'text/html');res.end(req.url==='/storage.js'?source:'<!doctype html><title>Draft fixture</title>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN,headless:true});
  for(const width of [1280,390]){
   const context=await browser.newContext({viewport:{width,height:850}}),page=await context.newPage();
   await page.goto('http://127.0.0.1:'+server.address().port);
   const initial=await page.evaluate(async()=>{
    const {workspaceStorage}=await import('/storage.js');window.notices=[];
    const legacy={current:{id:'legacy',draft:'keep this',attachments:{images:[{type:'image',url:'data:image/png;base64,'+'A'.repeat(500000)}]}},drafts:{}};
    localStorage.setItem('codex-workspace',JSON.stringify(legacy));
    window.store=await workspaceStorage('draft-test',{notice:text=>notices.push(text)});
    const migrated=JSON.stringify(store.value)===JSON.stringify(legacy)&&localStorage.getItem('codex-workspace')===null;
    const images=Array.from({length:8},(_,i)=>({type:'image',url:'data:image/png;base64,'+String(i).repeat(1400000)}));
    const large={current:{id:'large',draft:'hello\n\nworld',attachments:{images}},drafts:{}};
    let quota=false;try{localStorage.setItem('quota-test',JSON.stringify(large));}catch{quota=true;}localStorage.removeItem('quota-test');
    await store.save(large);await store.flush();return {migrated,quota,notices};
   });
   assert.deepEqual(initial,{migrated:true,quota:true,notices:[]});
   await page.reload();
   const restored=await page.evaluate(async()=>{
    const {workspaceStorage}=await import('/storage.js');window.notices=[];
    window.store=await workspaceStorage('draft-test',{notice:text=>notices.push(text)});
    return {text:store.value.current.draft,images:store.value.current.attachments.images.length,last:store.value.current.attachments.images[7].url.length,notices};
   });
   assert.equal(restored.text,'hello\n\nworld');assert.equal(restored.images,8);assert(restored.last>1400000);assert.deepEqual(restored.notices,[]);
   const failures=await page.evaluate(async()=>{
    const {workspaceStorage}=await import('/storage.js');const warnings=[];
    const broken={getItem:()=>null,setItem:()=>{throw Error('quota');}};
    const fallback=await workspaceStorage('fallback',{notice:text=>warnings.push(text),storage:broken,indexedDB:{open(){throw Error('disabled');}}});
    await fallback.save({current:{draft:'retained'}});await fallback.save({current:{draft:'retained'}});
    // A failed migration must leave the legacy copy untouched.
    localStorage.setItem('codex-workspace',JSON.stringify({current:{draft:'legacy retained'}}));
    await workspaceStorage('blocked',{notice(){},indexedDB:{open(){throw Error('disabled');}}});
    const retained=JSON.parse(localStorage.getItem('codex-workspace')).current.draft;
    localStorage.removeItem('codex-workspace');
    await store.save({current:{draft:'',attachments:{images:[]}},drafts:{}});
    return {warnings:warnings.length,retained};
   });assert.deepEqual(failures,{warnings:1,retained:'legacy retained'});
   await page.reload();assert.equal(await page.evaluate(async()=>{const {workspaceStorage}=await import('/storage.js');return (await workspaceStorage('draft-test',{notice(){}})).value.current.attachments.images.length;}),0);
   console.log(JSON.stringify({width,migration:true,largeImages:8,reload:true,clear:true,failurePreserved:true}));await context.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
