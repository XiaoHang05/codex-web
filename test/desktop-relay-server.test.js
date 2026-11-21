import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createDesktopRelay} from '../adapters/desktop/relay-server.js';
import {isAppServerMain,runRelayCli} from '../adapters/desktop/relay-cli.js';

const root=fileURLToPath(new URL('../.local/tests/relay-server/',import.meta.url));fs.mkdirSync(root,{recursive:true});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t,{timeoutMs=300,onRequest}={}){
 const home=fs.mkdtempSync(path.join(root,'run-')),child=new EventEmitter();Object.assign(child,{stdin:new PassThrough(),stdout:new PassThrough(),pid:12345,exitCode:null,killed:false,kill(){this.killed=true;}});
 const input=new PassThrough(),output=new PassThrough(),native=[],desktop=[];let nativeBuffer='',desktopBuffer='';
 output.on('data',chunk=>{desktopBuffer+=chunk;let i;while((i=desktopBuffer.indexOf('\n'))>=0){desktop.push(JSON.parse(desktopBuffer.slice(0,i)));desktopBuffer=desktopBuffer.slice(i+1);}});
 child.stdin.on('data',chunk=>{nativeBuffer+=chunk;let i;while((i=nativeBuffer.indexOf('\n'))>=0){const message=JSON.parse(nativeBuffer.slice(0,i));nativeBuffer=nativeBuffer.slice(i+1);native.push(message);if(!message.method)continue;if(onRequest?.(message,child)===false)continue;const result=message.method==='thread/loaded/list'?{data:['fixture']}:message.method==='thread/read'?{thread:{id:message.params.threadId,turns:[]}}:message.method==='turn/start'?{turn:{id:'fixture-turn',status:'inProgress'}}:{};child.stdout.write(JSON.stringify({id:message.id,result})+'\n');}});
 const relay=await createDesktopRelay({child,input,output,home,timeoutMs,closeChild:false});
 t.after(async()=>{await relay.close(false);if(!home.startsWith(root))throw Error('Unexpected fixture path');fs.rmSync(home,{recursive:true,force:true});});
 input.write(JSON.stringify({id:'desktop-init',method:'initialize',params:{clientInfo:{name:'fixture'}}})+'\n');await tick();
 const call=(action,params={},threadId='fixture',overrides={})=>new Promise((resolve,reject)=>{
  const socket=net.connect(relay.descriptor.pipe);let bytes=Buffer.alloc(0);socket.on('error',reject);socket.on('connect',()=>{const data=Buffer.from(JSON.stringify({id:'gateway-request',token:relay.descriptor.token,action,threadId,params,...overrides})),header=Buffer.alloc(4);header.writeUInt32LE(data.length);socket.write(Buffer.concat([header,data]));});socket.on('data',data=>{bytes=Buffer.concat([bytes,data]);if(bytes.length<4||bytes.length<bytes.readUInt32LE()+4)return;const value=JSON.parse(bytes.subarray(4,bytes.readUInt32LE()+4));socket.destroy();resolve(value);});
 });
 return {relay,call,child,input,output,native,desktop,home};
}

test('relay preserves desktop handshake and isolates its own replies from stdout',async t=>{
 const {relay,call,desktop,home,input,native}=await fixture(t);assert.equal(relay.status().connected,true);assert.deepEqual(desktop[0],{id:'desktop-init',result:{}});
 const status=await call('status');assert.equal(status.result.capabilities.interrupt,true);assert.equal(JSON.parse(fs.readFileSync(path.join(home,'desktop-relay.json'))).nativePid,12345);
 await call('read');assert.equal(desktop.length,1);const text='中文分块';const frame=Buffer.from(JSON.stringify({id:'desktop-text',method:'fixture/echo',params:{text}})+'\n');const index=frame.indexOf(Buffer.from(text))+1;input.write(frame.subarray(0,index));input.write(frame.subarray(index));await tick();assert.equal(native.at(-1).params.text,text);assert.equal(desktop.at(-1).id,'desktop-text');
});
test('gateway rejects bad token, arbitrary actions and extra method fields before native access',async t=>{
 const {call,native}=await fixture(t);const initial=native.length;assert.equal((await call('status',{},'fixture',{token:'wrong'})).error.status,401);assert.equal((await call('unrelated-fixture-op')).error.status,409);assert.equal((await call('read',{method:'fixture/unsupported'})).error.status,400);assert.equal(native.length,initial);
});
test('global catalogs use the same initialized engine without thread loading or credential refresh',async t=>{
 const {call,native}=await fixture(t);const initial=native.length;
 for(const [action,params,method]of [['skills',{cwds:['/fixture'],forceReload:false},'skills/list'],['mcp',{cursor:'fixture-page',limit:20},'mcpServerStatus/list'],['account',{},'account/read'],['limits',{},'account/rateLimits/read'],['usage',{},'account/usage/read']]){
  assert.deepEqual((await call(action,params,null)).result,{});assert.equal(native.at(-1).method,method);assert.equal(Object.hasOwn(native.at(-1).params,'threadId'),false);
 }
 assert.equal(native.slice(initial).some(message=>message.method==='thread/loaded/list'),false);
 assert.equal(native.find(message=>message.method==='account/read').params.refreshToken,false);
 const before=native.length;assert.equal((await call('account',{refreshToken:true},null)).error.status,400);assert.equal(native.length,before);
});
test('writes require an already loaded thread and never resume ownership',async t=>{
 const {call,native}=await fixture(t);assert.equal((await call('interrupt',{turnId:'turn'},'not-loaded')).error.status,409);assert.equal(native.some(item=>item.method==='thread/resume'),false);assert.equal(native.some(item=>item.method==='turn/interrupt'),false);
 const result=await call('settings',{model:'fixture-model',effort:'high'});assert.deepEqual(result.result,{});assert.equal((await call('read')).result.threadSettings.model,'fixture-model');
 await call('settings',{permissions:':fixture-profile'});await call('settings',{permissions:null,sandboxPolicy:{type:'workspaceWrite',writableRoots:[],networkAccess:false}});const observed=(await call('read')).result.threadSettings;assert.equal(observed.permissions,null);assert.equal(observed.sandboxPolicy.type,'workspaceWrite');
});
test('send and steer deduplicate concurrent gateway requests without changing desktop request IDs',async t=>{
 const {call,native}=await fixture(t),params={input:[{type:'text',text:'fixture'}],requestId:'same-send'};
 const values=await Promise.all([call('send',params),call('send',params)]);assert.equal(values[0].result.turn.id,'fixture-turn');assert.equal(values[1].result.turn.id,'fixture-turn');assert.equal(native.filter(item=>item.method==='turn/start').length,1);
 assert.equal((await call('send',{...params,input:[{type:'text',text:'changed'}]})).error.status,409);
 await Promise.all([call('steer',{...params,requestId:'same-steer',expectedTurnId:'fixture-turn'}),call('steer',{...params,requestId:'same-steer',expectedTurnId:'fixture-turn'})]);assert.equal(native.filter(item=>item.method==='turn/steer').length,1);
});
test('a native send timeout remains ambiguous and is never retried',async t=>{
 const {call,native}=await fixture(t,{timeoutMs:25,onRequest:message=>message.method==='turn/start'?false:undefined}),params={input:[{type:'text',text:'fixture'}],requestId:'timeout-send'};
 assert.equal((await call('send',params)).error.status,504);assert.equal((await call('send',params)).error.status,504);assert.equal(native.filter(item=>item.method==='turn/start').length,1);
});
test('desktop and web approval responses are first-writer-wins and thread-scoped',async t=>{
 const {call,child,input,native,desktop}=await fixture(t);const request={id:'native-approval',method:'item/commandExecution/requestApproval',params:{threadId:'fixture',turnId:'turn',command:'fixture'}};
 child.stdout.write(JSON.stringify(request)+'\n');assert.equal((await call('read')).result.pendingRequests.length,1);
 assert.equal((await call('answer',{requestId:request.id,kind:'command',response:{decision:'decline'}},'other')).error.status,409);
 assert.equal((await call('answer',{requestId:request.id,kind:'command',response:{decision:'decline'}})).result.answered,true);
 input.write(JSON.stringify({id:request.id,result:{decision:'accept'}})+'\n');assert.equal(native.filter(item=>item.id===request.id&&!item.method).length,1);assert.equal(desktop.at(-1).method,'serverRequest/resolved');
 const second={...request,id:'second-approval'};child.stdout.write(JSON.stringify(second)+'\n');input.write(JSON.stringify({id:second.id,result:{decision:'decline'}})+'\n');assert.equal((await call('answer',{requestId:second.id,kind:'command',response:{decision:'accept'}})).error.status,409);assert.equal(native.filter(item=>item.id===second.id&&!item.method).length,1);
});
test('permission subset and complete question answers are enforced before forwarding',async t=>{
 const {call,child,native}=await fixture(t);child.stdout.write(JSON.stringify({id:'permission',method:'item/permissions/requestApproval',params:{threadId:'fixture',permissions:{network:{enabled:false}}}})+'\n');
 assert.equal((await call('answer',{requestId:'permission',kind:'permissions',response:{permissions:{network:{enabled:true}}}})).error.status,400);
 child.stdout.write(JSON.stringify({id:'question',method:'item/tool/requestUserInput',params:{threadId:'fixture',questions:[{id:'question-id'}]}})+'\n');
 assert.equal((await call('answer',{requestId:'question',kind:'question',response:{answers:{}}})).error.status,400);
 assert.equal(native.filter(item=>['permission','question'].includes(item.id)&&!item.method).length,0);
});
test('native queue mutations map fixed identifiers and do not auto-start existing queues',async t=>{
 const {call,native}=await fixture(t);await call('queueAdd',{requestId:'queue-request',clientUserMessageId:'draft',input:[{type:'text',text:'fixture queued'}]});await call('queueRead',{cursor:'page-two',limit:100});assert.equal(native.at(-1).params.cursor,'page-two');assert.equal(native.some(item=>item.method==='thread/queue/start'),false);await call('queueStart',{queuedSubmissionId:'selected-item'});assert.equal(native.at(-1).params.queuedSubmissionId,'selected-item');
});
test('native disconnect rejects pending operations and removes only its own descriptor',async t=>{
 const {call,child,relay,home}=await fixture(t,{onRequest:message=>message.method==='turn/start'?false:undefined});const waiting=call('send',{requestId:'disconnect',input:[{type:'text',text:'fixture'}]});await tick();child.exitCode=1;child.emit('exit',1);const result=await Promise.race([waiting,new Promise(resolve=>setTimeout(()=>resolve(null),100))]);assert.ok(!result||result.error);await relay.close(false);assert.equal(fs.existsSync(path.join(home,'desktop-relay.json')),false);assert.equal(child.killed,false);
});
test('CLI wraps only app-server main and leaves version/schema/proxy/startup invocations native',()=>{
 assert.equal(isAppServerMain(['-c','fixture=true','app-server','--analytics-default-enabled']),true);for(const args of [['--version'],['app-server','--help'],['app-server','generate-json-schema','--out','fixture'],['app-server','proxy'],['app-server','--print-startup-config','--startup-client-info','{}']])assert.equal(isAppServerMain(args),false);
});

test('desktop startup policy probe preserves standalone JSON and does not claim the live relay home',t=>{
 const home=fs.mkdtempSync(path.join(root,'startup-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const lock=path.join(home,'desktop-relay.lock');fs.writeFileSync(lock,'existing owner');
 const cliFile=fileURLToPath(new URL('../adapters/desktop/relay-cli.js',import.meta.url)),fixtureFile=fileURLToPath(new URL('./fixture-relay-engine.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[cliFile,fixtureFile,'app-server','--print-startup-config','--startup-client-info','{}'],{env:{...process.env,CODEX_HOME:home,CODEX_WEB_RELAY_NATIVE_BINARY:process.execPath},windowsHide:true,stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:10000});
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');assert.deepEqual(JSON.parse(result.stdout),{appServerVersion:'fixture-version',configRequirements:{requirements:null}});assert.equal(fs.readFileSync(lock,'utf8'),'existing owner');assert.equal(fs.existsSync(path.join(home,'desktop-relay.json')),false);
});
test('an active relay locks its home and CLI refuses to launch a second native engine',async t=>{
 const {home,child}=await fixture(t);
 await assert.rejects(createDesktopRelay({home,child,input:new PassThrough(),output:new PassThrough(),closeChild:false}),/locked/);
 await assert.rejects(runRelayCli(['app-server'],{CODEX_HOME:home,CODEX_WEB_RELAY_NATIVE_BINARY:process.execPath}),/refusing to start another/);
});
test('CLI runs one isolated fixture engine and cleans its descriptor when desktop stdin closes',async t=>{
 const home=fs.mkdtempSync(path.join(root,'cli-')),cliFile=fileURLToPath(new URL('../adapters/desktop/relay-cli.js',import.meta.url)),fixtureFile=fileURLToPath(new URL('./fixture-relay-engine.mjs',import.meta.url));
 const cli=spawn(process.execPath,[cliFile,fixtureFile,'app-server'],{env:{...process.env,CODEX_HOME:home,CODEX_WEB_RELAY_NATIVE_BINARY:process.execPath},windowsHide:true,stdio:['pipe','pipe','pipe']});
 const exit=new Promise(resolve=>{cli.once('exit',(code,signal)=>resolve({code,signal}));cli.once('error',error=>resolve({error:error.message}));});let stdout='',stderr='';cli.stdout.on('data',data=>stdout+=data);cli.stderr.on('data',data=>stderr+=data);
 t.after(async()=>{cli.stdin.end();await Promise.race([exit,new Promise(resolve=>setTimeout(resolve,1500))]);if(cli.exitCode===null&&!cli.killed){cli.kill();await exit;}if(!home.startsWith(root))throw Error('Unexpected fixture path');fs.rmSync(home,{recursive:true,force:true});});
 const wait=async condition=>{for(let i=0;i<100;i++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,15));}throw Error('Fixture relay timed out: '+stderr);};
 cli.stdin.write(JSON.stringify({id:'desktop-cli-init',method:'initialize',params:{clientInfo:{name:'fixture'}}})+'\n');await wait(()=>stdout.includes('fixture-relay-engine')&&fs.existsSync(path.join(home,'desktop-relay.json')));
 const descriptor=JSON.parse(fs.readFileSync(path.join(home,'desktop-relay.json'),'utf8'));assert.equal(descriptor.relayPid,cli.pid);assert.notEqual(descriptor.nativePid,cli.pid);
 const response=await new Promise((resolve,reject)=>{const socket=net.connect(descriptor.pipe);let buffer=Buffer.alloc(0);socket.once('error',reject);socket.once('connect',()=>{const data=Buffer.from(JSON.stringify({id:'fixture-status',token:descriptor.token,action:'status',params:{}})),head=Buffer.alloc(4);head.writeUInt32LE(data.length);socket.write(Buffer.concat([head,data]));});socket.on('data',data=>{buffer=Buffer.concat([buffer,data]);if(buffer.length<4||buffer.length<4+buffer.readUInt32LE())return;socket.destroy();resolve(JSON.parse(buffer.subarray(4)));});});
 assert.equal(response.result.connected,true);assert.equal(response.result.nativePid,descriptor.nativePid);cli.stdin.end();await exit;await wait(()=>!fs.existsSync(path.join(home,'desktop-relay.json')));assert.equal(fs.existsSync(path.join(home,'desktop-relay.lock')),false);
});
