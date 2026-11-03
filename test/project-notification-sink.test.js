import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createCodexWeb} from '../src/service.js';
const directory=fileURLToPath(new URL('../.local/project-sink-tests/',import.meta.url));fs.mkdirSync(directory,{recursive:true});
test('standalone injected sinks receive only enabled Codex projects',async()=>{
  const sent=[],service=await createCodexWeb({paths:{dataDirectory:directory,workspaceDirectory:directory},config:{profiles:[]},save(){},auth:{requireSession(){},csrf(){},info(){return {};},session(){return {};}},notifications:{enqueue:event=>sent.push(event)}});
  try{
    const p=service.context.projectNotifications;p.sync(['/work/a','/work/b'],{initial:true});p.update({revision:p.value.revision,action:'project',key:'path:/work/a',enabled:false});
    service.context.notifications.enqueue({source:'codex',cwd:'/work/a'});assert.equal(sent.length,0);
    service.context.notifications.enqueue({source:'codex',cwd:'/work/b'});assert.equal(sent.length,1);
  }finally{await service.close();}
});
