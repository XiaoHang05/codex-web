import {Desktop,DesktopHistory} from './desktop.js';
import {editDesktopMessage} from './message-edit.js';
import {DesktopWatch} from './desktop-watch.js';
import {DesktopNotifications} from './desktop-notifications.js';
import {DesktopCompletions} from './desktop-completions.js';
import {desktopUpdated} from './desktop-updated.js';
import {internalDesktopThreads} from './desktop-session-filter.js';
import {desktopHistoryPage} from './desktop-history-pages.js';
import {desktopInputs,desktopImageReference} from './desktop-inputs.js';
import {desktopFeatureRoute} from './desktop-features.js';
import {desktopManagementRoute} from './desktop-management.js';
import {DesktopComposerQueue} from './desktop-composer-queue.js';
import {desktopGoal} from './conversation-goal.js';
import {inlineQuestionRequest} from '../../public/codex/inline-questions.js';
import {desktopModelCatalog} from '../../src/model-settings.js';
import {nativePolicy} from '../../src/preferences.js';
import {fault} from '../../src/storage.js';
import {desktopTurns,activeDesktopTurn} from '../../public/codex/desktop-turn-state.js';
import {AppToolsDesktop,discoverAppToolsPipe} from './app-tools.js';
import {discoverRelay} from './relay-client.js';
import {RelayDesktop,RelayComposerQueue} from './relay-desktop.js';

// Desktop sharing depends on a platform-specific, versioned native IPC surface.
// It is loaded only by explicit configuration or an authenticated embedder.
export async function createDesktopAdapter(options, ctx, existing) {
  if(!existing && (typeof options.homeDirectory!=='string'||!options.homeDirectory)) throw Error('Desktop sharing requires an explicit homeDirectory');
  const history=existing?.history||new DesktopHistory(options.homeDirectory);
  const sharedKey=Symbol.for('codex-web.desktop-app-tools.v1');
  const relayKey=Symbol.for('codex-web.desktop-stdio-relay.v1');
  const useRelay=options.discoverRelay===true&&!options.pipe&&discoverRelay(history.home);
  const useAppTools=options.discoverAppTools===true&&!existing?.desktop?.socket?.writable&&!options.pipe&&discoverAppToolsPipe();
  let desktop;
  if(useRelay){
    desktop=existing?.desktop?.[relayKey]||new RelayDesktop(history,{emit:ctx.emit});
    Object.setPrototypeOf(desktop,RelayDesktop.prototype);
    if(existing?.desktop)existing.desktop[relayKey]=desktop;
  }else if(useAppTools){
    desktop=existing?.desktop?.[sharedKey]||new AppToolsDesktop(history,{emit:ctx.emit});
    Object.setPrototypeOf(desktop,AppToolsDesktop.prototype);
    if(existing?.desktop)existing.desktop[sharedKey]=desktop;
  }else desktop=existing?.desktop||new Desktop({homeDirectory:options.homeDirectory,...(options.pipe?{pipe:options.pipe}:{})});
  const modern=desktop instanceof AppToolsDesktop;
  const relay=desktop instanceof RelayDesktop;
  const owned=!existing;
  if(owned&&!modern&&!relay){
    desktop.manualFollow ||= new Set();
    desktop.notificationObserver=new DesktopNotifications(ctx.notifications);
    desktop.on('state',data=>{if(desktop.manualFollow.has(data.threadId))ctx.emit('desktop',data);desktop.notificationObserver.observe(data);});
    desktop.on('offline',()=>ctx.emit('desktop-offline',{}));
    if(options.observe===true){desktop.backgroundWatcher=new DesktopWatch(desktop,history,{journal:new DesktopCompletions(history,ctx.notifications)});desktop.backgroundWatcher.start();}
  }
  return {
    desktop,history,
    editLastMessage:(threadId,params)=>{if(desktop.capabilities?.edit===false)throw fault('此桌面连接暂不支持修改历史消息，请在 App 中操作',409);return editDesktopMessage(desktop,threadId,params);},
    imageReference:desktopImageReference,
    createQueue:(context,queue)=>relay?new RelayComposerQueue(context,queue):new DesktopComposerQueue(context,queue),
    async list(){
      const updated=desktopUpdated(history.home),internal=internalDesktopThreads(history.home);
      return history.list().filter(row=>!internal.has(row.threadId)).map(row=>{
        const state=desktop.socket?.writable?desktop.states.get(row.threadId):null;
        const turns=Object.values(state?.turnHistory?.history?.entitiesByKey||{});if(!turns.length)turns.push(...state?.turns||[]);
        return {...row,updatedAt:updated.get(row.threadId)||row.updatedAt,running:turns.some(turn=>['inProgress','in_progress','running'].includes(turn.status?.type||turn.status)),needsAttention:(state?.requests||[]).some(request=>request.completed!==true&&request.request?.completed!==true)||!!inlineQuestionRequest(turns,row.threadId)};
      });
    },
    async handle(req,res,context){
      if(modern&&req.path==='/api/desktop-projects/capabilities'){res.json({create:false,reason:'新版桌面暂不支持网站新建聊天，请在 App 中新建'});return true;}
      if(modern&&req.path.startsWith('/api/desktop-projects/'))throw fault('新版桌面暂不支持网站新建聊天',409);
      if(relay&&req.path==='/api/desktop-projects/capabilities'){res.json({create:false,reason:'桌面中继控制现有会话，新聊天请先在 App 中打开'});return true;}
      if(relay&&req.path.startsWith('/api/desktop-projects/'))throw fault('请先在 App 中打开新聊天',409);
      if(modern&&req.path.startsWith('/api/inline-questions/desktop/'))throw fault('请在 App 中回答问题',409);
      if(modern&&req.path.startsWith('/api/desktop-features/')&&['settings','compact'].includes(req.path.split('/').at(-1)))throw fault('新版桌面暂不支持网站修改设置或压缩',409);
      if(modern&&req.method!=='GET'&&req.path.startsWith('/api/desktop-management/'))throw fault('新版桌面暂不支持此管理操作，请在 App 中操作',409);
      if(relay&&req.method!=='GET'&&req.path.startsWith('/api/desktop-management/'))throw fault('桌面会话归档与恢复请在 App 中操作',409);
      if(req.path.startsWith('/api/desktop-projects/')){
        if(options.projectRoutes&&await options.projectRoutes(req,res,context))return true;
        if(req.path==='/api/desktop-projects/capabilities'){res.json({create:false,reason:'此适配器未配置桌面新会话助手'});return true;}
        throw fault('未配置桌面新会话助手',409);
      }
      if(req.path==='/api/desktop-models'&&req.method==='GET'){res.json(relay?await desktop.connection.call('models',null,{}):await desktopModelCatalog(desktop.accountHome));return true;}
      const relayFeature=req.path.match(/^\/api\/desktop-features\/([-a-zA-Z0-9_]{1,80})\/(skills|mcp|account|limits|usage)$/);
      if(relay&&relayFeature){
        if(req.method!=='GET')throw fault('桌面信息接口只读',405);
        const row=desktop.authorize(relayFeature[1]),feature=relayFeature[2];
        const params=feature==='skills'?{cwds:row.cwd?[row.cwd]:[],forceReload:false}:feature==='mcp'?{limit:50,...(req.query?.cursor?{cursor:req.query.cursor}:{})}:feature==='account'?{refreshToken:false}:{};
        res.json(await desktop.connection.call(feature,null,params));return true;
      }
      if(await desktopFeatureRoute(req,res,context)||await desktopManagementRoute(req,res,context))return true;
      const goal=req.path.match(/^\/api\/desktop-goal\/([-a-zA-Z0-9_]{1,80})$/);
      if(goal&&req.method==='GET'){if(!history.list().some(row=>row.threadId===goal[1]))throw fault('找不到会话',404);res.json({goal:desktopGoal(goal[1],desktop.accountHome)});return true;}
      const match=req.path.match(/^\/api\/desktop\/([-a-zA-Z0-9_]{1,80})\/(history-page|history|messages|follow|send|steer|interrupt|command|file|question|permissions|mcp)$/);
      if(!match)return false;
      const [,threadId,action]=match;
      if(['history','history-page','messages'].includes(action)){
        if(req.method!=='GET')throw fault('历史接口只读',405);
        res.json(action==='messages'?{messages:desktopInputs(history,threadId)}:await desktopHistoryPage(history,threadId,req.query));return true;
      }
      if(req.method!=='POST')throw fault('桌面控制仅支持 POST',405);
      if(action==='follow'){res.json({state:await desktop.follow(threadId)});return true;}
      if(desktop.messageEditBusy?.has(threadId))throw fault('此会话正在修改消息，请稍候',409);
      let params=req.body||{};
      if(action==='send'){
        const recovery=params.turnTrigger==='resume_interrupted_task';
        if(modern&&params.turnTrigger!==undefined)throw fault('新版桌面仅支持文字发送，请在 App 中继续任务',409);
        if(params.turnTrigger!==undefined&&!recovery)throw fault('无效轮次触发方式');
        if(recovery){
          if(!Array.isArray(params.input)||params.input.length||typeof params.expectedTurnId!=='string'||!params.expectedTurnId)throw fault('继续任务需要空输入和原轮次');
          const state=await desktop.follow(threadId),latest=desktopTurns(state).at(-1);
          if(!latest||(latest.turnId||latest.id)!==params.expectedTurnId||!['interrupted','failed'].includes(latest.status)||activeDesktopTurn(state)||['active','running','inProgress','busy'].includes(state?.threadRuntimeStatus?.type)||(state?.requests||[]).some(request=>request.completed!==true&&request.request?.completed!==true))throw fault('会话状态已变化，请刷新后再继续',409);
        }
        params={...(modern||relay?{requestId:params.requestId}:{}),turnStart:{request:{threadId,input:params.input,...(recovery?{turnTrigger:'resume_interrupted_task'}:{}),...(!relay?nativePolicy(context.preferences.registerSession(`desktop:${threadId}`)):{})},context:{inheritThreadSettings:true}}};
      }
      res.json(await desktop.control(threadId,action,params));return true;
    },
    async close(){if(owned)desktop.close();},
  };
}
