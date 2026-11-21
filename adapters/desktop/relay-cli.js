import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createDesktopRelay,relayDescriptorActive} from './relay-server.js';

export function isAppServerMain(args){const index=args.indexOf('app-server');if(index<0||args.includes('--help')||args.includes('-h')||args.includes('--print-startup-config'))return false;return !['daemon','proxy','generate-ts','generate-json-schema','help'].includes(args[index+1]);}
export async function runRelayCli(args=process.argv.slice(2),env=process.env){
 const binary=env.CODEX_WEB_RELAY_NATIVE_BINARY;if(!binary||!path.isAbsolute(binary))throw Error('An absolute original native binary is required');
 const home=env.CODEX_HOME||path.join(os.homedir(),'.codex'),nativeEnv={...env};delete nativeEnv.CODEX_CLI_PATH;
 const relayed=isAppServerMain(args);
 if(relayed&&(relayDescriptorActive(home)||fs.existsSync(path.join(home,'desktop-relay.lock'))))throw Error('A desktop relay already owns this home or its lock; refusing to start another native engine');
 const child=spawn(binary,args,{env:nativeEnv,windowsHide:true,stdio:relayed?['pipe','pipe','inherit']:'inherit'});
 const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});exited.catch(()=>{});
 let relay;try{if(relayed)relay=await createDesktopRelay({child,home});}catch(e){if(child.exitCode==null&&!child.killed)child.kill();await exited.catch(()=>{});throw e;}
 const stop=()=>{if(relay)void relay.close();else if(child.exitCode==null&&!child.killed)child.kill();};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{return await exited;}finally{await relay?.close(false);process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runRelayCli().then(code=>{process.exitCode=code;}).catch(error=>{process.stderr.write('Desktop relay: '+error.message+'\n');process.exitCode=1;});
