import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';

const testRoot=fileURLToPath(new URL('../.local/tests/',import.meta.url));
fs.mkdirSync(testRoot,{recursive:true});
const temporary=fs.mkdtempSync(path.join(testRoot,'service-'));
const data=path.join(temporary,'data'),workspace=path.join(temporary,'workspace');
fs.mkdirSync(data,{recursive:true});fs.mkdirSync(workspace,{recursive:true});
process.env.CODEX_WEB_DATA_DIR=data;process.env.CODEX_WEB_WORKSPACE=workspace;
process.env.CODEX_WEB_PUBLIC_ORIGIN='https://example.invalid:8443';
const fixture=fileURLToPath(new URL('./fixture-engine.mjs',import.meta.url));
fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({codexBinary:process.execPath,codexArguments:[fixture],profiles:[{id:'default',name:'Fixture',provider:'chatgpt',cwd:workspace}]}));
fs.mkdirSync(path.join(data,'codex/default'),{recursive:true});
fs.writeFileSync(path.join(data,'codex/default/auth.json'),JSON.stringify({tokens:{account_id:'fixture-account'}}));
let running,cookie,csrf,threadId;
async function request(endpoint,{method='GET',body,headers={}}={}){
  if(headers.host){
    return new Promise((resolve,reject)=>{
      const outgoing=http.request(new URL(endpoint,running.url),{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers}},response=>{
        let text='';response.setEncoding('utf8');response.on('data',chunk=>text+=chunk);response.on('end',()=>{let value;try{value=JSON.parse(text);}catch{value=text;}resolve({response:{status:response.statusCode,headers:{getSetCookie:()=>response.headers['set-cookie']||[]}},value});});
      });outgoing.on('error',reject);outgoing.end(body?JSON.stringify(body):undefined);
    });
  }
  const response=await fetch(new URL(endpoint,running.url),{method,headers:{...(cookie?{cookie}:{}),...(body?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
  const set=response.headers.getSetCookie();if(set.length&&!(headers.host))cookie=set.map(value=>value.split(';')[0]).join('; ');
  const text=await response.text();let value;try{value=JSON.parse(text);}catch{value=text;}return {response,value};
}
before(async()=>{const {startStandalone}=await import('../src/standalone.js');running=await startStandalone({port:0});});
after(async()=>{await running?.close();fs.rmSync(temporary,{recursive:true,force:true});});

test('standalone bootstraps only its explicit isolated storage',async()=>{
  const {response,value}=await request('/codex-api/v1/auth/status');assert.equal(response.status,200);assert.equal(value.authenticated,true);assert.equal(value.local,true);csrf=value.csrf;
  const auth=JSON.parse(fs.readFileSync(path.join(data,'auth.json'),'utf8'));assert.equal(auth.passwordHash,'');assert.deepEqual(auth.credentials,[]);
  assert.equal(fs.existsSync(path.join(data,'codex/default/AGENTS.md')),false);assert.equal(fs.existsSync(path.join(data,'codex/default/skills')),false);
});
test('static UI and all direct assets live under the package mount',async()=>{
  const {response,value}=await request('/codex/');assert.equal(response.status,200);assert.match(value,/Codex Web/);assert.equal(response.headers.get('x-codex-web-contract'),'1');
  for(const url of ['/codex/app.js','/codex/common.js','/codex/shared.css','/codex/vendor/purify.js','/codex/vendor/katex/katex.mjs','/codex/icons/codex-v1.webmanifest'])assert.equal((await request(url)).response.status,200,url);
});
test('desktop adapter defaults off and does not construct a socket',async()=>{
  const {value}=await request('/codex-api/v1/capabilities');assert.equal(value.desktop.enabled,false);assert.equal(running.service.context.desktop.socket,undefined);
  assert.equal((await request('/codex-api/v1/desktop-models')).response.status,409);
  assert.deepEqual((await request('/codex-api/v1/history')).value,[]);
});
test('foreign origins and writes without CSRF are rejected',async()=>{
  assert.equal((await request('/codex-api/v1/health',{headers:{Origin:'https://foreign.invalid'}})).response.status,403);
  assert.equal((await request('/codex-api/v1/appearance',{method:'PUT',body:{columnWidth:900},headers:{'X-CSRF-Token':''}})).response.status,403);
  assert.equal((await request('/codex-api/v1/services/dsh/start',{method:'POST',body:{}})).response.status,404);
});
test('local password initialization and authenticated proxy access retain the boundary',async()=>{
  assert.equal((await request('/codex-api/v1/auth/setup',{method:'POST',body:{password:'fixture-local-password'}})).response.status,200);
  csrf=(await request('/codex-api/v1/auth/status')).value.csrf;
  const publicHeaders={host:'example.invalid:8443','x-forwarded-proto':'https',cookie:''};
  assert.equal((await request('/codex-api/v1/health',{headers:publicHeaders})).response.status,401);
  const login=await request('/codex-api/v1/auth/login',{method:'POST',body:{password:'fixture-local-password'},headers:publicHeaders});assert.equal(login.response.status,200);
  const publicCookie=login.response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  assert.match(publicCookie,/__Host-codex_web=/);
  assert.equal((await request('/codex-api/v1/health',{headers:{...publicHeaders,cookie:publicCookie}})).response.status,200);
  const options=await request('/codex-api/v1/auth/passkey/register/options',{method:'POST',body:{}});assert.equal(options.response.status,200);assert.match(options.response.headers.getSetCookie().join('\n'),/Path=\/codex-api\/v1\/auth/);
  // Registration above changes only the challenge cookie; retrieve a fresh session.
  csrf=(await request('/codex-api/v1/auth/status')).value.csrf;
});
test('real child-process transport drives isolated fixture conversations',async()=>{
  const start=await request('/codex-api/v1/codex/default/rpc',{method:'POST',body:{method:'thread/start',params:{cwd:workspace}}});assert.equal(start.response.status,200);threadId=start.value.thread.id;
  const send=await request('/codex-api/v1/codex/default/rpc',{method:'POST',body:{method:'turn/start',params:{threadId,input:[{type:'text',text:'Fixture message'}]}}});assert.equal(send.response.status,200);
  await new Promise(resolve=>setTimeout(resolve,40));
  const read=await request('/codex-api/v1/codex/default/rpc',{method:'POST',body:{method:'thread/read',params:{threadId,includeTurns:true}}});assert.equal(read.response.status,200);assert.match(read.value.thread.turns[0].items[1].text,/Fixture response/);
  assert.equal((await request('/codex-api/v1/history')).value[0].threadId,threadId);
  assert.equal(fs.existsSync(path.join(data,'codex/default/AGENTS.md')),false);assert.equal(fs.existsSync(path.join(data,'codex/default/skills')),false);
});
test('RPC is allowlisted rather than an arbitrary native forwarding channel',async()=>{
  const result=await request('/codex-api/v1/codex/default/rpc',{method:'POST',body:{method:'process/spawn',params:{command:'unused'}}});assert.equal(result.response.status,403);
});
test('artifact access checks the configured private directory and original bytes',async()=>{
  const text='Portable fixture artifact.\n',file=path.join(workspace,'result.txt');fs.writeFileSync(file,text);
  const scope=encodeURIComponent('web:default'),base='/codex-api/v1/artifacts/'+scope+'/'+threadId;
  const preview=await request(base+'?path=result.txt');assert.equal(preview.response.status,200);assert.equal(preview.value.text,text);
  assert.equal((await request(base+'?path=result.txt&download=1')).value,text);
  assert.equal((await request(base+'?path='+encodeURIComponent(path.join(data,'auth.json')))).response.status,403);
  assert.equal((await request(base+'?path='+encodeURIComponent(path.join(os.tmpdir(),'unreferenced.txt')))).response.status,404);
});
test('conversation Markdown links open external logs without granting unrelated or private files',async()=>{
  const directory=path.join(temporary,'log-records');fs.mkdirSync(directory);
  const file=path.join(directory,'booking (complete).jsonl'),unrelated=path.join(directory,'unrelated.txt'),privateFile=path.join(data,'protected.txt');
  const bytes='{"event":"fixture-booking-complete"}\n{"event":"fixture-summary"}\n';fs.writeFileSync(file,bytes);fs.writeFileSync(unrelated,'not cited');fs.writeFileSync(privateFile,'fixture private');
  const base='/codex-api/v1/artifacts/web%3Adefault/'+threadId;
  const endpoint=(target,suffix='')=>base+'?path='+encodeURIComponent(target)+suffix;
  assert.equal((await request(endpoint(file))).response.status,403);
  const text=`[预约日志](<${file.replaceAll('\\','/')}>)\n[私有文件](<${privateFile.replaceAll('\\','/')}>)`;
  const send=await request('/codex-api/v1/codex/default/rpc',{method:'POST',body:{method:'turn/start',params:{threadId,input:[{type:'text',text}]}}});assert.equal(send.response.status,200);
  const preview=await request(endpoint(file));assert.equal(preview.response.status,200);assert.equal(preview.value.text,bytes);
  for(const suffix of ['&download=1','&open=1'])assert.equal((await request(endpoint(file,suffix))).value,bytes);
  assert.equal((await request(endpoint(unrelated))).response.status,403);
  assert.equal((await request(endpoint(privateFile))).response.status,403);
  const other=await request('/codex-api/v1/codex/default/rpc',{method:'POST',body:{method:'thread/start',params:{cwd:workspace}}});
  assert.equal((await request('/codex-api/v1/artifacts/web%3Adefault/'+other.value.thread.id+'?path='+encodeURIComponent(file))).response.status,403);
  if(process.platform!=='win32'){
    const alias=path.join(directory,'alias.txt');fs.symlinkSync(privateFile,alias);
    const linked=await request('/codex-api/v1/codex/default/rpc',{method:'POST',body:{method:'turn/start',params:{threadId,input:[{type:'text',text:`[文件](${alias})`}]}}});assert.equal(linked.response.status,200);
    assert.equal((await request(endpoint(alias))).response.status,403,'linked symlinks cannot expose private storage');
  }
});
test('SSE streams authenticated fixture completion events',async()=>{
  const response=await fetch(new URL('/codex-api/v1/events',running.url),{headers:{cookie}});assert.equal(response.status,200);
  const reader=response.body.getReader(),first=await reader.read();assert.match(new TextDecoder().decode(first.value),/event: ready/);
  await request('/codex-api/v1/codex/default/rpc',{method:'POST',body:{method:'turn/start',params:{threadId,input:[{type:'text',text:'Fixture streaming message'}]}}});
  let streamed='';while(!streamed.includes('turn/completed')){const chunk=await reader.read();assert.equal(chunk.done,false);streamed+=new TextDecoder().decode(chunk.value);}
  assert.match(streamed,/event: codex/);
  await reader.cancel();
});
