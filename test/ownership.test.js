import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCodexWeb} from '../src/service.js';

const directory=fileURLToPath(new URL('../.local/tests/ownership/',import.meta.url));
fs.mkdirSync(directory,{recursive:true});
const auth={info:()=>({authenticated:true}),requireSession:()=>({id:'fixture'}),csrf(){},session:()=>({id:'fixture'})};
const paths={dataDirectory:directory,workspaceDirectory:directory};
function adapter(){let closed=0;return {desktop:new EventEmitter(),history:{list:()=>[],files:new Map()},close(){closed++;},closed:()=>closed};}
test('closing an embedded service never stops injected engine instances',async()=>{
  let stopped=0;const desktop=adapter(),manager={instances:new Map([['fixture',{}]]),stop(){stopped++;}};
  const service=await createCodexWeb({config:{profiles:[]},save(){},auth,paths,services:{codex:manager},desktopAdapter:desktop,embedded:true});
  await service.close();assert.equal(stopped,0);assert.equal(desktop.closed(),0);assert.equal(manager.instances.size,1);
});
test('owning a web engine does not confer ownership of an injected desktop adapter',async()=>{
  const desktop=adapter();
  const service=await createCodexWeb({config:{profiles:[]},save(){},auth,paths,desktopAdapter:desktop});
  await service.close();assert.equal(desktop.closed(),0);
});
