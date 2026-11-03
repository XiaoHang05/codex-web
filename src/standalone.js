import http from 'node:http';
import express from 'express';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createAuth} from './auth.js';
import {configurePaths,loadConfig,packageRoot} from './storage.js';
import {createCodexWeb} from './service.js';

export async function startStandalone({port=Number(process.env.CODEX_WEB_PORT||3290)}={}) {
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid port');
  configurePaths();const {config,save}=loadConfig();
  config.port=port;config.publicOrigin=process.env.CODEX_WEB_PUBLIC_ORIGIN||config.publicOrigin||null;
  const auth=createAuth(config),app=express();app.disable('x-powered-by');
  app.use((req,res,next)=>{try{auth.context(req);auth.ensureLocal(req,res);next();}catch(error){next(error);}});
  const service=await createCodexWeb({config,save,auth});
  app.get('/',(req,res)=>res.redirect('/codex/'));
  app.get('/login',(req,res)=>res.sendFile(path.join(packageRoot,'public/codex/login.html')));
  app.get('/codex/vendor/webauthn.js',(req,res)=>res.sendFile(path.join(packageRoot,'node_modules/@simplewebauthn/browser/dist/bundle/index.umd.min.js')));
  app.use(service.middleware);
  app.use((req,res)=>res.status(404).json({error:'Not found'}));
  app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.status?error.message:'Service error'}));
  const server=http.createServer(app);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  // Ephemeral ports are useful for isolated tests; never infer a public origin.
  config.port=server.address().port;
  return {server,service,url:`http://127.0.0.1:${config.port}/codex/`,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await service.close();auth.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const running=await startStandalone();console.log('Codex Web: '+running.url);
  let closing=false;const close=async()=>{if(closing)return;closing=true;await running.close();};
  process.on('SIGINT',close);process.on('SIGTERM',close);
}
