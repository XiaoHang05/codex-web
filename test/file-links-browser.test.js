import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';

const browserAvailable=process.env.PLAYWRIGHT_MODULE&&process.env.CHROMIUM_BIN;
test('ordinary conversation links preview external JSONL files and retain downloads in desktop and narrow layouts',{skip:!browserAvailable&&'Set PLAYWRIGHT_MODULE and CHROMIUM_BIN for the real browser regression',timeout:60000},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'codex-file-links-browser-'));
  const data=path.join(temporary,'data'),workspace=path.join(temporary,'workspace'),logs=path.join(temporary,'logs');
  for(const directory of [data,workspace,logs,path.join(data,'codex/default')])fs.mkdirSync(directory,{recursive:true});
  process.env.CODEX_WEB_DATA_DIR=data;process.env.CODEX_WEB_WORKSPACE=workspace;
  fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({codexBinary:process.execPath,codexArguments:[fileURLToPath(new URL('./fixture-engine.mjs',import.meta.url))],profiles:[{id:'default',cwd:workspace,provider:'chatgpt'}]}));
  fs.writeFileSync(path.join(data,'codex/default/auth.json'),JSON.stringify({tokens:{account_id:'fixture-browser'}}));
  const file=path.join(logs,'booking (complete).jsonl'),bytes='{"event":"fixture-booking"}\n{"event":"fixture-summary"}\n';fs.writeFileSync(file,bytes);
  let running,browser;
  try{
    const {startStandalone}=await import('../src/standalone.js');running=await startStandalone({port:0});
    const manager=running.service.context.codex,thread=(await manager.rpc('default','thread/start',{cwd:workspace})).thread;
    await manager.rpc('default','turn/start',{threadId:thread.id,input:[{type:'text',text:'Fixture request'}]});
    const call=manager.call.bind(manager);
    manager.call=async(instance,method,params)=>{
      const result=await call(instance,method,params);
      if(method==='thread/read'&&result.thread?.id===thread.id){const linkPath=file.replaceAll('\\','/');result.thread.turns[0].items[1].text=`[正式预约全过程](<${linkPath}>)\n\n[文件 URL](<file://${linkPath}>)\n\n[日志行号](${encodeURI(file)}:2:1)`;}
      return result;
    };
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const target=new URL('/codex/',running.url);target.searchParams.set('profile','default');target.searchParams.set('thread',thread.id);
    let clicks=0;
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:850});await page.goto(target.href);
      for(const label of ['正式预约全过程','文件 URL','日志行号']){
        const link=page.locator('.message:not(.user) a').filter({hasText:label});await link.waitFor();await link.click();
        const preview=page.locator('.artifact-panel.open .text-preview');
        await preview.waitFor({timeout:10000}).catch(async error=>{console.error(JSON.stringify({width,label,href:await link.getAttribute('href'),preview:await page.locator('.artifact-content').innerText()}));throw error;});assert.equal(await preview.textContent(),bytes);
        assert.equal(await page.locator('.artifact-panel.open a.artifact-download').getAttribute('download'),path.basename(file));
        assert.equal(await page.locator('.artifact-panel.open a.artifact-download').isVisible(),true);
        if(width===1280&&label==='正式预约全过程'){
          const downloaded=page.waitForEvent('download');await page.locator('.artifact-panel.open a.artifact-download').click();
          const download=await downloaded;assert.equal(fs.readFileSync(await download.path(),'utf8'),bytes);
        }
        await page.locator('.artifact-panel.open .artifact-close').click();clicks++;
      }
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({widths:[1280,390],fileLinkClicks:clicks,preview:'original JSONL bytes',pageErrors:errors}));
  }finally{await browser?.close();await running?.close();fs.rmSync(temporary,{recursive:true,force:true});}
});
