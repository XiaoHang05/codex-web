import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';

const compiler=path.join(process.env.WINDIR||'', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const supported=process.platform==='win32'&&fs.existsSync(compiler);
function build(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-relay-shim-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const exe=path.join(directory,'shim with spaces.exe');
 const source=fileURLToPath(new URL('../adapters/desktop/windows-relay-shim.cs',import.meta.url));
 const result=spawnSync(compiler,['/nologo','/target:exe','/optimize+','/out:'+exe,source],{windowsHide:true,encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);return {directory,exe};
}
test('Windows relay shim preserves argv, binary stdio, stderr and the child exit code',{skip:!supported},t=>{
 const {directory,exe}=build(t),entry=path.join(directory,'fixture relay.cjs');
 fs.writeFileSync(entry,"process.stdout.write(JSON.stringify(process.argv.slice(2))+'\\n');process.stderr.write('fixture stderr\\n');process.stdin.on('data',b=>process.stdout.write(b));process.stdin.on('end',()=>{process.exitCode=7;});");
 const args=['','two words','a"b','plain\\','two slashes\\\\','quoted trailing \\','Unicode 中文','$(literal) & `literal`'];
 const input=Buffer.alloc(1024*1024);for(let i=0;i<input.length;i++)input[i]=i%256;
 const result=spawnSync(exe,args,{windowsHide:true,env:{...process.env,CODEX_WEB_RELAY_NODE_BINARY:process.execPath,CODEX_WEB_RELAY_ENTRY:entry},input,maxBuffer:4*1024*1024,timeout:10000});
 assert.equal(result.error,undefined);assert.equal(result.status,7);assert.equal(result.stderr.toString(),'fixture stderr\n');
 const end=result.stdout.indexOf(10);assert.deepEqual(JSON.parse(result.stdout.subarray(0,end).toString()),args);assert.deepEqual(result.stdout.subarray(end+1),input);
});
test('Windows relay shim exits when the child exits while parent stdin stays open',{skip:!supported},async t=>{
 const {directory,exe}=build(t),entry=path.join(directory,'quick child.cjs');fs.writeFileSync(entry,"process.stdout.write('quick child');process.exit(3);");
 const child=spawn(exe,[],{windowsHide:true,env:{...process.env,CODEX_WEB_RELAY_NODE_BINARY:process.execPath,CODEX_WEB_RELAY_ENTRY:entry},stdio:['pipe','pipe','pipe']});
 t.after(()=>{if(child.exitCode===null)child.kill();});
 let output='';child.stdout.on('data',data=>output+=data);
 const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Shim did not exit after its child')),5000);child.once('exit',code=>{clearTimeout(timer);resolve(code);});child.once('error',error=>{clearTimeout(timer);reject(error);});});
 assert.equal(code,3);assert.equal(output,'quick child');
});
test('Windows relay shim flushes a small JSONL request and response while stdin remains open',{skip:!supported},async t=>{
 const {directory,exe}=build(t),entry=path.join(directory,'interactive child.cjs');
 fs.writeFileSync(entry,"const r=require('node:readline').createInterface({input:process.stdin});r.on('line',line=>{process.stdout.write(line+'\\n');process.stderr.write('received\\n');});");
 const child=spawn(exe,[],{windowsHide:true,env:{...process.env,CODEX_WEB_RELAY_NODE_BINARY:process.execPath,CODEX_WEB_RELAY_ENTRY:entry},stdio:['pipe','pipe','pipe']});
 t.after(()=>{child.stdin.end();if(child.exitCode===null)child.kill();});
 let output='',error='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>error+=data);
 const received=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Small JSONL was buffered while stdin remained open')),2000);const check=()=>{if(output.includes('\n')&&error.includes('\n')){clearTimeout(timer);resolve();}};child.stdout.on('data',check);child.stderr.on('data',check);child.once('error',failure=>{clearTimeout(timer);reject(failure);});});
 child.stdin.write('{"id":1,"method":"fixture/read"}\n');await received;
 assert.equal(child.stdin.writableEnded,false);assert.equal(output,'{"id":1,"method":"fixture/read"}\n');assert.equal(error,'received\n');
 child.stdin.end();await new Promise(resolve=>child.once('exit',resolve));
});
test('Desktop launcher refuses an already running executable before build or launch',{skip:!supported},t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-relay-guard-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const script=fileURLToPath(new URL('../scripts/start-desktop-relay.ps1',import.meta.url));
 const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),runtime=path.join(directory,'not-created');
 // The running test Node process is a disposable fixture identity. No real
 // Desktop executable is used by this negative launch-path test.
 const result=spawnSync(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-DesktopExecutable',process.execPath,'-NativeBinary',process.execPath,'-NodeBinary',process.execPath,'-NativeHome',directory,'-RuntimeDirectory',runtime],{windowsHide:true,encoding:'utf8',timeout:10000});
 assert.equal(result.error,undefined);assert.notEqual(result.status,0);assert.match(result.stderr,/Desktop is already running/);assert.equal(fs.existsSync(runtime),false);
});
