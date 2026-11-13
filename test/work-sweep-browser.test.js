import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL} from 'node:url';

test('work sweep crosses once and retains its clock through streaming replacements',{
 skip:!process.env.PLAYWRIGHT_MODULE&&'Set PLAYWRIGHT_MODULE for the browser regression',timeout:60000
},async()=>{
 const playwright=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href),{chromium}=playwright.default||playwright;
 const assets=new Map(['work-live.css','work-sweep.js'].map(name=>['/'+name,fs.readFileSync(new URL('../public/codex/'+name,import.meta.url))]));
 const server=http.createServer((req,res)=>{
  if(assets.has(req.url)){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(assets.get(req.url));}
  else {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><link rel="stylesheet" href="/work-live.css"><style>:root{--muted:#777;--fg:#fff}body{background:#222;color:#fff;font:16px sans-serif}</style><main id="work"></main>');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({...(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN}:{channel:'msedge'}),headless:true});
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:600}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.evaluate(async()=>{
    const {workSweepClock}=await import('/work-sweep.js');window.sync=workSweepClock();
    window.paint=(label='正在思考',turn='one',scope='chat-one')=>{
     const row=document.createElement('div');row.dataset.turnId=turn;
     const span=document.createElement('span');span.className='work-live-text';span.textContent=label;row.append(span);
     document.querySelector('#work').replaceChildren(row);sync(document.querySelector('#work'),scope);
     return span.getAnimations()[0];
    };
    window.original=paint();
   });
   await page.waitForFunction(()=>original.currentTime>200);
   const continuity=await page.evaluate(()=>{
    const originalStart=original.startTime,before=original.currentTime;
    let after;
    // Every render creates a new node, like changed reasoning summaries and
    // work groups. Switching from reasoning to a tool keeps the turn clock.
    for(let index=0;index<25;index++)after=paint(index%2?'正在执行命令':'正在思考 '+index);
    return {originalStart,newStart:after.startTime,before,after:after.currentTime};
   });
   assert.equal(continuity.originalStart,continuity.newStart);
   assert(continuity.after>=continuity.before&&continuity.after-continuity.before<100);
   const frames=await page.evaluate(()=>{
    const label=document.querySelector('.work-live-text'),animation=label.getAnimations()[0];animation.pause();
    const positions=[];
    for(let time=0;time<=6600;time+=100){animation.currentTime=time;positions.push(parseFloat(getComputedStyle(label).backgroundPositionX));}
    return {positions,repeat:getComputedStyle(label).backgroundRepeat,base:getComputedStyle(label).backgroundColor};
   });
   assert.equal(frames.repeat,'no-repeat');assert.notEqual(frames.base,'rgba(0, 0, 0, 0)');
   for(let index=0;index<frames.positions.length;index++){
    const expected=100-110*((index*100%2200)/2200);
    const atBoundary=index>0&&index*100%2200===0;
    assert(Math.abs(frames.positions[index]-expected)<.1||(atBoundary&&Math.abs(frames.positions[index]+10)<.1),'single continuous pass at '+index*100+'ms');
   }
   const restart=await page.evaluate(()=>{
    const fresh=paint('正在思考','two');const freshTime=fresh.currentTime;
    const switched=paint('正在思考','two','chat-two');return {freshTime,switchedTime:switched.currentTime};
   });
   assert(restart.freshTime<100&&restart.switchedTime<100);
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await page.evaluate(()=>{paint();return document.querySelector('.work-live-text').getAnimations().length;}),0);
   assert.notEqual(await page.locator('.work-live-text').evaluate(node=>getComputedStyle(node).webkitTextFillColor),'rgba(0, 0, 0, 0)');
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.evaluate(()=>{const row=document.querySelector('#work');row.replaceChildren();sync(row,'chat-one');paint();document.querySelector('.work-live-text').classList.remove('work-live-text');sync(row,'chat-one');});
   assert.equal(await page.locator('#work').evaluate(node=>node.getAnimations({subtree:true}).length),0);
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({width,continuity,sampledCycles:3,restart,reducedMotion:true,completion:true,errors}));
   await page.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
