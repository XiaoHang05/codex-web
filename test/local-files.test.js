import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const root=fileURLToPath(new URL('../.local/tests/',import.meta.url));fs.mkdirSync(root,{recursive:true});
const temporary=fs.mkdtempSync(path.join(root,'local-open-')),data=path.join(temporary,'data'),workspace=path.join(temporary,'workspace');fs.mkdirSync(data);fs.mkdirSync(workspace);
process.env.CODEX_WEB_DATA_DIR=data;process.env.CODEX_WEB_WORKSPACE=workspace;
fs.writeFileSync(path.join(data,'local-file-open.json'),JSON.stringify({version:1,protocol:'codex-local-file'}));
fs.mkdirSync(path.join(data,'codex/default'),{recursive:true});fs.writeFileSync(path.join(data,'codex/default/auth.json'),JSON.stringify({tokens:{account_id:'fixture-local-open'}}));
fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({codexBinary:process.execPath,codexArguments:[fileURLToPath(new URL('fixture-engine.mjs',import.meta.url))],profiles:[{id:'default',cwd:workspace,provider:'chatgpt'}]}));
let running,cookie,csrf,base,LocalFileTickets,accessKind='local';
async function request(url,body,extra={}){const response=await fetch(new URL(url,running.url),{headers:{cookie,'X-CSRF-Token':csrf,...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:response.status,value:await response.json()};}
before(async()=>{
 ({LocalFileTickets}=await import('../src/local-files.js'));
 const {startStandalone}=await import('../src/standalone.js');running=await startStandalone({port:0});
 const auth=await fetch(new URL('/codex-api/v1/auth/status',running.url));cookie=auth.headers.getSetCookie().map(row=>row.split(';')[0]).join('; ');csrf=(await auth.json()).csrf;
 const info=running.service.context.auth.info;running.service.context.auth.info=req=>({...info(req),accessKind});running.service.context.localFiles.platform='win32';
 const thread=await running.service.context.codex.rpc('default','thread/start',{cwd:workspace});await running.service.context.codex.rpc('default','thread/read',{threadId:thread.thread.id,includeTurns:true});base='/codex-api/v1/artifacts/web%3Adefault/'+thread.thread.id;
 fs.writeFileSync(path.join(workspace,'sample.txt'),'Original bytes');fs.writeFileSync(path.join(workspace,'sample.pdf'),'%PDF-1.4\nfixture');fs.writeFileSync(path.join(workspace,'sample.js'),'unexecuted');fs.writeFileSync(path.join(workspace,'sample.exe'),'unexecuted');fs.writeFileSync(path.join(workspace,'sample.html'),'<h1>Original HTML</h1><script>window.executed=true</script>');
});
after(async()=>{await running?.close();fs.rmSync(temporary,{recursive:true,force:true});});
test('browser open streams original files inline, supports ranges beyond preview limits and retains file authorization',async()=>{
 for(const [file,type]of [['sample.pdf','application/pdf'],['sample.txt','text/plain'],['sample.html','text/html'],['sample.js','text/plain']]){
  const response=await fetch(new URL(base+'?path='+file+'&open=1',running.url),{headers:{cookie}});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),new RegExp(type));assert.match(response.headers.get('content-disposition'),/^inline/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');if(file==='sample.html')assert.match(response.headers.get('content-security-policy'),/^sandbox;/);else assert.equal(response.headers.get('content-security-policy'),null);assert.equal(await response.text(),fs.readFileSync(path.join(workspace,file),'utf8'));
 }
 fs.writeFileSync(path.join(workspace,'large.txt'),Buffer.alloc(25*1024*1024,65));const response=await fetch(new URL(base+'?path=large.txt&open=1',running.url),{headers:{cookie,Range:'bytes=0-15'}});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,16);
 assert.equal((await request(base+'?path=sample.exe&open=1')).status,415);
 assert.equal((await request(base+'?path='+encodeURIComponent(path.join(data,'config.json'))+'&open=1')).status,403);
});
test('native tickets require local authentication and CSRF, are single-use, and cannot open executable file types',async()=>{
 assert.deepEqual((await request(base+'?path=sample.txt')).value.open,{browser:true,native:true});
 assert.equal((await request(base+'/open',{path:'sample.txt'},{'X-CSRF-Token':''})).status,403);
 for(const kind of ['lan','public','unknown']){accessKind=kind;assert.equal((await request(base+'/open',{path:'sample.txt'})).status,403);assert.equal((await request(base+'?path=sample.txt')).value.open.native,false);assert.equal((await request('/codex-api/v1/artifacts/local-open/consume',{token:'a'.repeat(64)})).status,403);}accessKind='local';
 for(const file of ['sample.exe','sample.js'])assert.equal((await request(base+'/open',{path:file})).status,415);
 assert.equal((await request(base+'/open',{path:path.join(data,'config.json')})).status,403);
 const issued=await request(base+'/open',{path:'sample.txt'});assert.equal(issued.status,200);assert.match(issued.value.url,/^codex-local-file:\/\/open\/[a-f0-9]{64}$/);assert.equal(JSON.stringify(issued.value).includes(workspace),false);
 const token=issued.value.url.split('/').at(-1),consumed=await request('/codex-api/v1/artifacts/local-open/consume',{token});assert.equal(consumed.status,200);assert.deepEqual(consumed.value,{path:fs.realpathSync(path.join(workspace,'sample.txt')),action:'open'});assert.equal((await request('/codex-api/v1/artifacts/local-open/consume',{token})).status,410);
 const stale=(await request(base+'/open',{path:'sample.txt'})).value.url.split('/').at(-1);fs.appendFileSync(path.join(workspace,'sample.txt'),' changed');assert.equal((await request('/codex-api/v1/artifacts/local-open/consume',{token:stale})).status,409);
});
test('tickets expire, enforce limits and revalidate paths',async()=>{
 let now=1;const tickets=new LocalFileTickets(data,{platform:'win32',now:()=>now}),stat=fs.statSync(path.join(workspace,'sample.txt')),real=fs.realpathSync(path.join(workspace,'sample.txt'));
 const token=tickets.issue({scope:'fixture'},real,stat).url.split('/').at(-1);now+=60001;await assert.rejects(tickets.consume(token,()=>({real,stat})),{status:410});
 for(let i=0;i<128;i++)tickets.issue({},real,stat);assert.throws(()=>tickets.issue({},real,stat),{status:429});
});
test('Windows protocol helper authenticates and consumes a ticket without launching desktop UI in plan mode',{skip:process.platform!=='win32'},async()=>{
 const issued=await request(base+'/open',{path:'sample.txt'}),script=fileURLToPath(new URL('../scripts/windows-file-open.ps1',import.meta.url));
 const output=await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-BaseUrl',new URL(running.url).origin+'/','-Uri',issued.value.url,'-PlanOnly'],{windowsHide:true});let out='',error='';child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('close',code=>code?reject(Error(error)):resolve(out));});
 assert.deepEqual(JSON.parse(output),{path:fs.realpathSync(path.join(workspace,'sample.txt')),useShellExecute:true});
});
