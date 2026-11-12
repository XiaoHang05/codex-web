import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {configurePaths,packageRoot,fault} from './storage.js';
import {CodexManager} from './codex.js';
import {Preferences,nativePolicy} from './preferences.js';
import {disabledDesktop} from './disabled-desktop.js';
import {historyList,codexRoute} from './history-list.js';
import {modelSettings} from './model-settings.js';
import {profileManagement} from './profile-management.js';
import {projectDirectories} from './project-directories.js';
import {inlineQuestionsRoute} from './inline-questions.js';
import {composerQueueRoute} from './composer-queue-native.js';
import {messageEditRoute} from './message-edit.js';
import {composerPredictionsRoute} from './composer-predictions.js';
import {artifacts} from './artifacts.js';
import {LocalFileTickets} from './local-files.js';
import {feedback} from './feedback.js';
import {windowsSandbox} from './windows-sandbox.js';
import {conversationCommands} from './conversation-commands.js';
import {accountSubscription} from './account-subscription.js';
import {updateAppearance} from '../public/codex/appearance.js';
import {ProjectNotifications,projectNotificationsRoute} from './project-notifications.js';
import {createReleaseAssets} from './release-assets.js';

export const contractVersion=1;
export const embeddingFeatures={pinnedAssets:true};
export const apiPrefix='/codex-api/v1';
const packageVersion=JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'),'utf8')).version;

export async function createCodexWeb(options) {
  if (!options?.auth?.requireSession || !options.auth.csrf || !options.auth.info) throw Error('An authentication adapter is required');
  const paths=configurePaths(options.paths);
  const clients=new Set(),owned=!options.services?.codex;
  let ownsDesktop=false;
  const emit=(type,data)=>{
    const frame=`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for(const client of clients){if(client.destroyed||client.writableLength>8*1024*1024){clients.delete(client);client.destroy();}else client.write(frame);}
    options.onEvent?.(type,data);
  };
  const preferences=options.services?.preferences||new Preferences(paths.dataDirectory);
  const projectNotifications=options.projectNotifications||new ProjectNotifications(paths.dataDirectory);
  const notificationSink=options.notifications||{enqueue:()=>null};
  const notifications={enqueue(event,...args){if(event.source==='codex'&&!projectNotifications.allowed(event.cwd))return;return notificationSink.enqueue(event,...args);}};
  const codex=options.services?.codex||new CodexManager(options.config,emit,notifications,preferences);
  const ctx={config:options.config,save:options.save,auth:options.auth,preferences,codex,notifications,projectNotifications,emit,paths,privateRoots:options.privateRoots||[],...disabledDesktop()};
  ctx.localFiles=new LocalFileTickets(paths.dataDirectory);
  if(options.desktopAdapter)ctx.desktopAdapter=options.desktopAdapter;
  else if(options.config.desktop?.enabled===true){
    const {createDesktopAdapter}=await import('../adapters/desktop/index.js');
    ctx.desktopAdapter=await createDesktopAdapter(options.config.desktop,ctx);
    ownsDesktop=true;
  }
  if(ctx.desktopAdapter){ctx.desktop=ctx.desktopAdapter.desktop;ctx.history=ctx.desktopAdapter.history;}

  const internal=express.Router({strict:true});
  internal.get('/api/auth/status',(req,res)=>res.json(ctx.auth.info(req)));
  if(!options.embedded){
  for(const [route,method]of [['login','login'],['setup','setup'],['logout','logout']]){
    if(typeof ctx.auth[method]==='function')internal.post('/api/auth/'+route,async(req,res)=>{
      if(route==='logout')ctx.auth.csrf(req);
      res.json(await ctx.auth[method](req,res));
    });
  }
  for(const registration of [false,true])for(const step of ['options','verify']){
    internal.post('/api/auth/passkey/'+(registration?'register/':'')+step,async(req,res)=>{
      if(registration)ctx.auth.csrf(req);
      res.json(await ctx.auth[step](req,res,registration));
    });
  }
  }
  internal.use((req,res,next)=>{try{ctx.auth.requireSession(req);if(!['GET','HEAD'].includes(req.method))ctx.auth.csrf(req);next();}catch(error){next(error);}});
  internal.get('/api/capabilities',(req,res)=>res.json({contractVersion,apiPrefix,standalone:!options.embedded,desktop:{enabled:!!ctx.desktopAdapter},browserState:{queueDatabase:'codex-web-composer-queue',...options.browserState},features:{chat:true,attachments:true,approvals:true}}));
  internal.get('/api/application',(req,res)=>res.json({service:'codex-web',version:packageVersion,contractVersion,hotReload:!!options.embedded,release:options.assetVersion||null}));
  internal.get('/api/health',(req,res)=>res.json({ready:true,service:'codex-web',contractVersion}));
  internal.get('/api/profiles',(req,res)=>res.json(ctx.config.profiles));
  internal.put('/api/profiles',async(req,res)=>res.json(await codex.updateProfile(req.body,ctx.save)));
  internal.get('/api/status',(req,res)=>res.json({codex:codex.status(),desktop:{enabled:!!ctx.desktopAdapter,connected:!!ctx.desktop.socket?.writable}}));
  internal.get('/api/history',async(req,res)=>res.json(await historyList(ctx)));
  internal.all('/api/project-notifications',(req,res)=>projectNotificationsRoute(req,res,{
    policy:projectNotifications,auth:ctx.auth,
    discover:async()=>{const rows=await historyList(ctx);return rows.map(row=>row.cwd);},
    status:()=>({masterEnabled:options.notificationStatus?.().masterEnabled,codexEnabled:preferences.value.notifications.codex.enabled,names:preferences.value.projectNames||{}}),
    changed:()=>emit('project-notifications',{revision:projectNotifications.value.revision}),
  }));
  internal.post('/api/codex/:id/rpc',(req,res)=>codexRoute(req,res,ctx));
  internal.post('/api/codex/:id/answer',(req,res)=>res.json(codex.answer(req.params.id,req.body.requestId,req.body.result)));
  internal.get('/api/codex/:id/pending',(req,res)=>res.json(codex.pending(req.params.id)));
  internal.get('/api/new-chat-defaults',(req,res)=>res.json(preferences.snapshot()));
  internal.put('/api/new-chat-defaults',(req,res)=>{preferences.updateDefaults(req.body);res.json(preferences.snapshot());});
  internal.get('/api/session-preferences/:key',(req,res)=>res.json(preferences.registerSession(req.params.key)));
  internal.put('/api/sessions/:key',(req,res)=>res.json(preferences.overrideSession(req.params.key,req.body)));
  internal.get('/api/project-directories',async(req,res)=>res.json(await projectDirectories(req.query.path)));
  internal.get('/api/model-settings/:id',async(req,res)=>{
    const cwd=req.query.cwd;if(cwd!==undefined&&(typeof cwd!=='string'||cwd.length>2048))throw fault('无效工作目录');
    res.json(await modelSettings(codex,req.params.id,cwd));
  });
  internal.put('/api/appearance',(req,res)=>{preferences.value.appearance=updateAppearance(preferences.value.appearance,req.body);preferences.save();res.json(preferences.value.appearance);});
  internal.put('/api/sidebar-order',(req,res)=>{
    const {projects,threads}=req.body||{};
    const valid=items=>Array.isArray(items)&&items.length<=5000&&items.every(item=>typeof item==='string'&&item.length>0&&item.length<=2000)&&new Set(items).size===items.length;
    if(!valid(projects)||!threads||typeof threads!=='object'||Array.isArray(threads)||Object.keys(threads).length>1000||Object.values(threads).some(items=>!valid(items)))throw fault('无效排序');
    preferences.value.sidebarOrder={projects,threads};preferences.save();res.json(preferences.value.sidebarOrder);
  });
  internal.put('/api/sidebar-actions',(req,res)=>{
    const {kind,key,value}=req.body||{},fields={projectName:'projectNames',projectPin:'pinnedProjects',threadPin:'pinnedThreads'};
    if(!Object.hasOwn(fields,kind)||typeof key!=='string'||!key||key.length>2000||['__proto__','prototype','constructor'].includes(key)||(kind==='projectName'?(typeof value!=='string'||value.length>100):typeof value!=='boolean'))throw fault('无效侧栏操作');
    const field=fields[kind],state=preferences.value[field]||{};
    if(Object.keys(state).length>=5000&&!Object.hasOwn(state,key))throw fault('侧栏记录已满',413);
    if(value)state[key]=value;else delete state[key];preferences.value[field]=state;preferences.save();res.json({[field]:state});
  });
  internal.post('/api/goals/web/:id/:thread',async(req,res)=>{
    const {action,objective}=req.body||{},threadId=req.params.thread;
    if(!['pause','resume','edit','delete'].includes(action)||action==='edit'&&(typeof objective!=='string'||!objective.trim()||objective.length>20000))throw fault('无效目标操作');
    if(ctx.history.list().some(row=>row.threadId===threadId))throw fault('桌面目标请在桌面操作',409);
    await codex.rpc(req.params.id,'thread/read',{threadId,includeTurns:false});const instance=codex.instances.get(req.params.id);
    if(action==='delete'){await codex.call(instance,'thread/goal/clear',{threadId});res.json({goal:null});}
    else res.json(await codex.call(instance,'thread/goal/set',action==='edit'?{threadId,objective:objective.trim()}:{threadId,status:action==='pause'?'paused':'active'}));
  });
  internal.post('/api/branches',async(req,res)=>{
    const {source,profile,threadId,lastTurnId}=req.body||{};
    if(!['web','desktop'].includes(source)||!/^[-a-zA-Z0-9_]{1,80}$/.test(threadId||'')||!/^[-a-zA-Z0-9_]{1,80}$/.test(lastTurnId||''))throw fault('无效分支参数');
    let params={threadId,lastTurnId};
    if(source==='desktop'){ctx.history.list();const file=ctx.history.files.get(threadId);if(!file)throw fault('找不到原始聊天',404);params.path=file;}
    else if(ctx.history.list().some(row=>row.threadId===threadId))throw fault('会话来源不匹配',409);
    res.json(await codex.rpc(profile,'thread/fork',params));
  });
  internal.get('/api/events',options.eventStream||((req,res)=>{
    res.set({'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();res.write('event: ready\ndata: {}\n\n');clients.add(res);
    const timer=setInterval(()=>{if(!ctx.auth.session(req)){res.end();return;}res.write(': heartbeat\n\n');},15000);timer.unref();
    res.on('close',()=>{clearInterval(timer);clients.delete(res);});
  }));
  internal.use(async(req,res,next)=>{
    try{
      if(req.path.startsWith('/api/desktop')||req.path.startsWith('/api/inline-questions/desktop/')){
        if(!ctx.desktopAdapter){if(req.path==='/api/desktop-projects/capabilities'){res.json({create:false,reason:'桌面共享未启用'});return;}throw fault('桌面共享未启用',409);}
        if(await ctx.desktopAdapter.handle(req,res,ctx))return;
      }
      // Only explicit feature handlers enter this service. There is no generic
      // forwarding route, host management route, or account reset channel.
      for(const [matches,handler]of [
        [req.path.startsWith('/api/profile-management'),profileManagement],
        [req.path==='/api/composer-queue',composerQueueRoute],
        [req.path==='/api/message-edit',messageEditRoute],
        [req.path==='/api/composer-predictions',composerPredictionsRoute],
        [req.path.startsWith('/api/inline-questions/'),inlineQuestionsRoute],
        [req.path.startsWith('/api/artifacts/'),artifacts],
        [req.path==='/api/feedback',feedback],
        [req.path.startsWith('/api/account-subscription/'),accountSubscription],
        [req.path.startsWith('/api/windows-sandbox/'),windowsSandbox],
        [req.path==='/api/conversation-command'||req.path.startsWith('/api/git/'),conversationCommands],
      ])if(matches&&await handler(req,res,ctx))return;
      res.status(404).json({error:'未知 Codex Web 接口'});
    }catch(error){next(error);}
  });

  const middleware=express.Router({strict:true});
  middleware.use((req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Codex-Web-Contract':String(contractVersion)});next();});
  if(options.assetVersion)middleware.use((req,res,next)=>{res.set('X-Codex-Web-Release',options.assetVersion);next();});
  middleware.use(apiPrefix,express.json({limit:'12mb'}),(req,res,next)=>{
    const original=req.url;req.url='/api'+req.url;
    internal(req,res,error=>{req.url=original;next(error);});
  });
  middleware.get('/codex',(req,res)=>res.redirect('/codex/'));
  middleware.use('/codex',(req,res,next)=>{
    if(options.embedded&&req.path==='/access.html'){res.status(404).end();return;}
    const publicLogin=req.path==='/login.html'||req.path==='/vendor/webauthn.js'||req.path.startsWith('/icons/');
    if(publicLogin)return next();
    try{ctx.auth.requireSession(req);next();}catch(error){if(error.status===401)res.redirect('/login?next='+encodeURIComponent(req.originalUrl));else next(error);}
  },options.assetVersion?createReleaseAssets(path.join(packageRoot,'public','codex'),options.assetVersion):express.static(path.join(packageRoot,'public','codex'),{dotfiles:'deny',redirect:true}));
  middleware.use((error,req,res,next)=>{if(res.headersSent){res.destroy();return;}res.status(error.status||500).json({error:error.status?error.message:'Codex Web 服务错误'});});

  return {contractVersion,middleware,context:ctx,async close(){
    for(const client of clients)client.end();clients.clear();
    if(owned){codex.composerQueue?.close();for(const id of codex.instances.keys())await codex.stop(id,true);}
    if(ownsDesktop)await ctx.desktopAdapter?.close();
  }};
}
