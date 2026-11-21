import {mountExternalLinkPreviews} from './external-links.js';
mountExternalLinkPreviews();
import {mobileSidebarQuery,mountMobileSidebarShortcut} from './mobile-sidebar.js';
import {sidebarIcon,sidebarActionButton} from './sidebar-actions.js';
import {projectNotificationControls} from './project-notifications-ui.js';
import {sidebarResize} from './sidebar-resize.js';
import {mountFileCitations} from './file-citations-ui.js';
import {isArtifactLink} from './artifact-path.js';
import {mountMobileTopbar} from './mobile-topbar.js';
import {mountMobileDocumentScroll} from './mobile-document-scroll.js';
import {bottomFollow} from './bottom-follow.js';
import {subscriptionUI} from './account-subscription.js';
import {nearBottom as inBottomRange,bottomThreshold} from './scroll-policy.js';
import {restoreDisclosureScroll,mountWorkScrollContainment} from './disclosure-motion.js';
import {captureChatView,applyChatView,settleChatView} from './chat-view.js';
import {desktopComposerSettings} from './desktop-composer-settings.js';
import {composerAdd} from './composer-add.js';
import {composerResize} from './composer-resize.js';
import {observeLayoutMotion} from './layout-motion.js';
import {composerPredictions} from './composer-predictions.js';
import {composerModelSelection} from './model-selection.js';
import {newChatDefaultsUI,defaultModelSettings,defaultSpeed} from './new-chat-defaults.js';
import {appearanceFields,mountAppearanceSettings,applyAppearanceStyles} from './appearance.js';
import {historyPages,mergeDesktopHistory} from './history-pages-ui.js';
import {feedbackDialog} from './feedback-ui.js';
import {userContent} from './user-content.js';
import {workIcon} from './work-icons.js';
import {workSweepClock} from './work-sweep.js';
import {foldTurnWork} from './turn-work.js';
import {withProcessingStatus,retainUnpersistedTurn} from './processing-state.js';
import {threadActivity,desktopActivity} from './thread-activity.js';
import {recentThreadActivity,recentThreadsView,isRecentCodexMessage} from './recent-threads.js';
import {connectionRetryRecord,historicalConnectionRetry,recordConnectionError} from './connection-retry.js';
import {acceptNativeUser,acceptQueuedUser,acceptStartedTurn,restoreLocalUsers} from './live-user.js';
import {acceptReplyItem,appendReplyDelta,mergeReplyRead,discardReplyDrafts} from './stream-replies.js?v=retry-cleanup-1';
import {activeDesktopTurn,desktopTurns} from './desktop-turn-state.js';
import {taskControlState,paintTaskControl} from './task-control.js';
import {lastMessageEdit} from './message-edit-state.js';
import {editMessageDialog} from './message-edit-ui.js';
import {inlineQuestionRequest} from './inline-questions.js';
import {sandboxSettings} from './sandbox-ui.js';
import {loginFlow} from './login-flow.js';
import {$,api,loadingApi,session,bind,notice,browserState} from '/codex/common.js';
import {marked,renderMath} from './math-markdown.js';
import DOMPurify from '/codex/vendor/purify.js';
import {copyButton,turnItems,desktopTurnItems,userMetadata,animateDisclosure,mountDisclosures,replyActions,messageNavigator,processingHeader} from './message-ui.js';
import {preview,previewButton,imageThumbnail} from './artifact-ui.js';
import {replyImageMarkup,mountReplyImages} from './reply-images.js';
import {animatedSelect} from './animated-select.js';
import {sidebarOrdering} from './sidebar-order.js';
import {sidebarPress} from './sidebar-press.js';
import {openDownPopover,closeDownPopover} from './popover-motion.js';
import {openLayer,closeLayer} from './layer-motion.js';
import {projectListControls} from './sidebar-projects.js';
import {groupProjectRows,orderProjectGroups,projectIdentity,projectSetting,projectSettingKey,normalizeProjectDirectory} from './project-path.js';
import {chooseProject,projectInfo,setActionDisabled} from './project-picker.js';
import {workspaceChrome} from './workspace-chrome.js';
import {savedChat} from './chat-selection.js';
import {paintLoad,waitForLive} from './chat-load.js';
import {slashCommands,commandDialog} from './slash-commands.js';
import {limitedDesktop,limitedDesktopReason} from './desktop-capabilities.js';
import {statusView} from './native-status.js';
import {commandCatalog} from './command-catalog.js';
import {questionReply,questionFields,compactionRecord,conversationStatus} from './conversation-ui.js';
import {advancedRequest} from './approval-ui.js';
import {profileManagementUI} from './profile-management-ui.js';
import {queuedMessages,imageInput} from './composer-queue.js';
const questionStyles=document.createElement('link');questionStyles.rel='stylesheet';questionStyles.href='/codex/question-history.css';document.head.append(questionStyles);
const approvalStyles=document.createElement('link');approvalStyles.rel='stylesheet';approvalStyles.href='/codex/approval-ui.css';document.head.append(approvalStyles);
const recentStyles=document.createElement('link');recentStyles.rel='stylesheet';recentStyles.href='/codex/recent-threads.css';document.head.append(recentStyles);
// Chat restoration owns the viewport, including mobile document scrolling.
if('scrollRestoration' in history)history.scrollRestoration='manual';
mountMobileTopbar();
mountMobileDocumentScroll();
const timelineFollow=bottomFollow($('messages'));
const loadBanner=$('chat-load'),liveEvents=new EventTarget();
let viewLoad=null,liveReady=false,liveGeneration=0,booting=true,readyThread=null,webStateRevision=0;
function cancelViewLoad(){viewLoad?.abort();viewLoad=null;paintLoad(loadBanner,'');}
function beginViewLoad(text){
 cancelViewLoad();
 const load=new AbortController();viewLoad=load;
 paintLoad(loadBanner,text,{busy:true});
 return load;
}
function finishViewLoad(load,text='',retry){
 if(viewLoad!==load)return;
 cancelViewLoad();
 if(text)paintLoad(loadBanner,text,{retry});
}
const paneMode=new URLSearchParams(location.search).has('pane');const loginInfo=await session(AbortSignal.timeout(25000));const projectNoticeContainer=document.createElement('div');document.querySelector('[data-panel="notifications"]').append(projectNoticeContainer);const projectNotices=projectNotificationControls({container:projectNoticeContainer,request:api,notice});const serviceCapabilities=await loadingApi('/codex-api/v1/capabilities');Object.assign(browserState,serviceCapabilities.browserState);if(serviceCapabilities.standalone){const link=document.createElement('a');link.href='/codex/access.html';link.textContent='网站访问设置';document.querySelector('[data-panel="runtime"]').append(link);}let profile='default',settingsProfile='default',selected=null,rows=[],turnId=null,liveItems=new Map(),profiles=[],models=[],commandSkills=[];const feedbackThreads=new Set(),desktopFeedback=new Map();
const recentActivity=recentThreadActivity(),recentView=recentThreadsView($('recent-threads'),row=>open(row).catch(error=>notice(error.message)),{render:chatRowActions,pinned:row=>!!pinnedThreads[row.key]});
function renderRecent(){recentView.render(recentActivity.latest(rows),selected?.key,feedbackThreads);}
let recentFrame=0;
function markRecent(source,threadId){const row=rows.find(row=>row.threadId===threadId&&row.sources.includes(source));if(row)recentActivity.touch(row);else refreshAfterActivity();if(!recentFrame)recentFrame=requestAnimationFrame(()=>{recentFrame=0;renderRecent();});}
async function rpc(method,params={},id=profile,request=api){return request(`/codex-api/v1/codex/${id}/rpc`,{method,params});}
for(const id of ['composer-model','reasoning','access','approval'])animatedSelect($(id));
const fastModeIndicator=document.createElement('span');fastModeIndicator.className='fast-mode-indicator';fastModeIndicator.textContent='⚡';fastModeIndicator.hidden=true;fastModeIndicator.setAttribute('role','img');fastModeIndicator.setAttribute('aria-label','快速模式');fastModeIndicator.title='快速模式';$('reasoning').parentElement.querySelector('.select-trigger').prepend(fastModeIndicator);
const projectControls=projectListControls($('threads'),$('collapse-projects'));
let sidebarOrder={projects:[],threads:{}},projectNames={},pinnedProjects={},pinnedThreads={};const sidebarSort=sidebarOrdering($('threads'),async order=>{sidebarOrder=order;projectControls.sync();try{await api('/codex-api/v1/sidebar-order',order,'PUT');}catch(error){notice(error.message);}});
async function sidebarAction(kind,key,value){if(kind==='projectName')key=projectSettingKey(projectNames,key);if(kind==='projectPin')key=projectSettingKey(pinnedProjects,key);const result=await api('/codex-api/v1/sidebar-actions',{kind,key,value},'PUT');if(kind==='projectName')projectNames=result.projectNames;if(kind==='projectPin')pinnedProjects=result.pinnedProjects;if(kind==='threadPin')pinnedThreads=result.pinnedThreads;renderThreads();}
function rowProfile(row){return row.availableSources?.find(source=>source.startsWith('web:'))?.slice(4)||row.sources.find(source=>source.startsWith('web:'))?.slice(4);}
let openSidebarMenu=null,sidebarMenuAnchor=null;
function dismissSidebarMenu(){const panel=openSidebarMenu;if(!panel)return;openSidebarMenu=null;sidebarMenuAnchor?.setAttribute('aria-expanded','false');sidebarMenuAnchor=null;closeDownPopover(panel);}
function showSidebarMenu(items,x,y,anchor){if(openSidebarMenu&&anchor&&sidebarMenuAnchor===anchor){dismissSidebarMenu();return;}dismissSidebarMenu();const panel=document.createElement('div');panel.className='sidebar-context-menu';panel.setAttribute('role','menu');for(const [title,action,disabled] of items){const button=document.createElement('button');button.setAttribute('role','menuitem');button.textContent=title;setActionDisabled(button,disabled);button.onclick=async()=>{dismissSidebarMenu();try{await action();}catch(error){notice(error.message);}};panel.append(button);}document.body.append(panel);const width=panel.offsetWidth,height=panel.offsetHeight;panel.style.left=Math.max(8,Math.min(x,innerWidth-width-8))+'px';panel.style.top=Math.max(8,Math.min(y,innerHeight-height-8))+'px';openSidebarMenu=panel;sidebarMenuAnchor=anchor||null;anchor?.setAttribute('aria-expanded','true');openDownPopover(panel);panel.querySelector('button:not(:disabled)')?.focus();}
document.addEventListener('pointerdown',event=>{if(openSidebarMenu&&!openSidebarMenu.contains(event.target)&&!sidebarMenuAnchor?.contains(event.target)){dismissSidebarMenu();}});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&openSidebarMenu){event.preventDefault();event.stopImmediatePropagation();dismissSidebarMenu();}});
function attachSidebarMenu(element,items){sidebarPress(element,{onMenu:(x,y)=>showSidebarMenu(typeof items==='function'?items():items,x,y),startDrag:element.matches('.project>summary')?point=>sidebarSort.startDrag(element,point):undefined});}
const desktopProjectDrafts=new Set();
async function prepareDraft(text='正在准备新聊天…'){
 const load=beginViewLoad(text);
 try{await modelCatalog();finishViewLoad(load);}
 catch(error){
  finishViewLoad(load,'新聊天配置加载失败 · '+error.message,()=>void prepareDraft(text).catch(()=>{}));
  throw error;
 }
}
async function startInProject(cwd,{source='web',requestId=crypto.randomUUID()}={}){
 cwd=normalizeProjectDirectory(cwd);
 const previous=workspace.activeId();workspace.newChat();
 if(previous&&workspace.activeId()===previous)return false;
 if(source!=='desktop')return selectDraftProject(cwd);
 const tab=workspace.activeId(),load=beginViewLoad('正在创建桌面会话…');
 desktopProjectDrafts.add(tab);
 for(const id of ['send','input'])$(id).disabled=true;
 try{
  const result=await api('/codex-api/v1/desktop-projects/threads',{cwd,requestId,access:defaultsPolicy.access,approval:defaultsPolicy.approval});
  await refresh();
  if(load.signal.aborted||workspace.activeId()!==tab||selected){notice(result.warning||'桌面会话已创建，请从项目列表打开');return;}
  if(!result.attached)throw Error(result.warning||'桌面会话尚未连接');
  const row=rows.find(row=>row.threadId===result.thread.id&&row.sources.includes('desktop'));
  if(!row)throw Error('桌面会话已创建，列表仍在同步，请重试');
  await open(row);
 }catch(error){
  if(viewLoad===load)finishViewLoad(load,'桌面会话未就绪 · '+error.message,()=>void startInProject(cwd,{source,requestId}).catch(()=>{}));
  throw error;
 }finally{
  desktopProjectDrafts.delete(tab);
  if(workspace.activeId()===tab&&!selected&&!viewLoad)for(const id of ['send','input'])$(id).disabled=false;
 }
}
async function selectDraftProject(cwd,options={}){
 cwd=normalizeProjectDirectory(cwd);
 if(selected||options.source==='desktop')return startInProject(cwd,options);
 commandOptions={...commandOptions,cwd};
 localStorage.setItem('codex-command-options:'+(inputScope()||'new'),JSON.stringify(commandOptions));
 paintCommandOptions();workspace.saveDraft();$('input').focus();
 await prepareDraft('正在准备项目聊天…');
}
function openProjectPicker(newChat=false,cwd){return chooseProject({api:loadingApi,rows,desktopEnabled:serviceCapabilities.desktop.enabled,current:cwd||selected?.cwd||commandOptions.cwd||profiles.find(row=>row.id===profile)?.cwd,source:selected?.mode||'web',onSelect:newChat?startInProject:selectDraftProject,notice});}
function projectActions(cwd,{includeInfo=true}={}){const unavailable=cwd==='未指定项目';return [...(includeInfo?[['查看项目目录',()=>showProjectInfo(cwd),unavailable]]:[]),['在此项目新建网页会话',()=>startInProject(cwd,{source:'web'}),unavailable],...(serviceCapabilities.desktop.enabled?[['在此项目新建桌面会话',()=>startInProject(cwd,{source:'desktop'}),()=>unavailable||api('/codex-api/v1/desktop-projects/capabilities').then(result=>!result.create)]]:[]),[projectNotices.enabled(cwd)?'关闭项目通知':'开启项目通知',()=>projectNotices.toggle(cwd)],[projectSetting(pinnedProjects,cwd)?'取消置顶项目':'置顶项目',()=>sidebarAction('projectPin',cwd,!projectSetting(pinnedProjects,cwd))],['编辑项目名称',async()=>{const value=prompt('项目显示名称（留空恢复目录名）',projectSetting(projectNames,cwd)||'');if(value!==null)await sidebarAction('projectName',cwd,value.trim());else return false;}]];}
function canArchiveRow(row){return !!(rowProfile(row)||row.sources?.includes('desktop'))&&!row.protected&&!row.conflict&&!row.accountMismatch;}
function chatActions(row){return [[pinnedThreads[row.key]?'取消置顶聊天':'置顶聊天',()=>sidebarAction('threadPin',row.key,!pinnedThreads[row.key])],['归档聊天',()=>archiveRow(row),!canArchiveRow(row)]];}
function chatRowActions(row){
  const actions=document.createElement('div');actions.className='sidebar-thread-actions';const name=row.name||'会话';
  const menu=sidebarActionButton({label:'聊天菜单：'+name,icon:'more',notice,action:button=>{const rect=button.getBoundingClientRect();showSidebarMenu(chatActions(row),rect.left,rect.bottom,button);}});menu.setAttribute('aria-haspopup','menu');menu.setAttribute('aria-expanded','false');
  actions.append(menu,sidebarActionButton({label:'归档聊天：'+name,icon:'archive',notice,disabled:!canArchiveRow(row),action:()=>archiveRow(row)}));
  return actions;
}
function syncProjectNotificationButtons(){
  for(const button of document.querySelectorAll('.sidebar-project-notification')){
    const state=projectNotices.status(button.dataset.project);button.disabled=!state.loaded||state.busy;button.setAttribute('aria-checked',String(state.loaded&&state.enabled));button.setAttribute('aria-busy',String(state.busy));button.innerHTML=sidebarIcon(state.loaded&&state.enabled?'bell':'bellOff');
    const message=state.loaded?'项目通知'+(state.enabled?'已开启，点击关闭':'已关闭，点击开启'):'正在读取项目通知';
    const name=projectSetting(projectNames,button.dataset.project)||button.dataset.project.split(/[\\/]/).filter(Boolean).at(-1)||button.dataset.project;
    button.setAttribute('aria-label',name+' 项目通知');button.title=message+(state.loaded&&!state.masterEnabled?'；通知总开关已关闭':state.loaded&&!state.codexEnabled?'；Codex 通知已关闭':'');
  }
}
projectNotices.subscribe(syncProjectNotificationButtons);
function showProjectInfo(cwd){return projectInfo({cwd,name:projectSetting(projectNames,cwd),actions:projectActions(cwd,{includeInfo:false}),notice});}
function paintProjectDirectory(){const cwd=selected?.cwd||commandOptions.cwd||profiles.find(row=>row.id===profile)?.cwd,button=$('project-directory');button.querySelector('span').textContent=cwd?cwd.split(/[\\/]/).filter(Boolean).at(-1)||cwd:'选择项目';button.title=cwd||'为新会话选择项目目录';button.setAttribute('aria-label',selected&&cwd?'查看当前项目目录':'选择项目目录');}
async function archiveRow(row){const id=rowProfile(row);if((!id&&!row.sources?.includes('desktop'))||row.protected||row.conflict||row.accountMismatch)throw Error('此会话暂不能在网页归档');if(!confirm('归档“'+(row.name||'会话')+'”？历史会保留。'))return;const desktop=row.sources?.includes('desktop');const result=desktop?await api('/codex-api/v1/desktop-management/'+row.threadId+'/archive',{}):await rpc('thread/archive',{threadId:row.threadId},id);if(result?.warning)notice(result.warning);if(selected?.key===row.key){cancelViewLoad();workspace.detachMissing(row.threadId);selected=null;liveItems.clear();void loadQueue();render([]);$('title').textContent='新聊天';$('source').textContent='';stateLabel('已归档');}await refresh();}
const conversationUI=conversationStatus($('messages'),document.querySelector('.composer-wrap'),async(action,patch,context)=>{if(context?.mode==='desktop')throw Error('桌面目标的单独管理暂不可用，请在 App 中操作');if(!context||context.mode!=='web')throw Error('请先打开聊天');const result=await api(`/codex-api/v1/goals/web/${context.profile}/${context.threadId}`,{action,...patch});if(selected?.threadId===context.threadId&&profile===context.profile)conversationUI.goal(result.goal??null);});async function refreshGoal(){const target=selected;if(!target)return;try{const result=target.mode==='desktop'?await api('/codex-api/v1/desktop-goal/'+target.threadId):await rpc('thread/goal/get',{threadId:target.threadId});if(selected===target)conversationUI.goal(result.goal);}catch{if(selected===target)conversationUI.goal(null);}}
let displayedItems=[];const updateNavigator=messageNavigator($('messages'));
async function branchReply(item,target,activeProfile){try{const result=await api('/codex-api/v1/branches',{source:target.mode,profile:activeProfile,threadId:target.threadId,lastTurnId:item._turnId});await refresh();await open(rows.find(row=>row.threadId===result.thread.id)||{threadId:result.thread.id,name:'分支会话',cwd:result.thread.cwd,sources:['web:'+activeProfile]});}catch(error){notice(error.message);}}
let desktopMessages=[],desktopSnapshot=null,desktopMessageStamp='';
const limitedDesktopMode=()=>limitedDesktop(selected,serviceCapabilities.desktop.capabilities);
const directDesktopRequests=new Map(),limitedControls=new Map();let desktopCapabilityNote;
function paintDesktopCapabilities(){
 const limited=limitedDesktopMode();
 for(const id of ['composer-model','reasoning','access','approval','composer-add','archive']){const control=$(id);if(limited){if(!limitedControls.has(control)){limitedControls.set(control,{disabled:control.disabled,title:control.title,...(['access','approval'].includes(id)?{innerHTML:control.innerHTML,value:control.value}:{})});if(['access','approval'].includes(id))control.replaceChildren(new Option(id==='access'?'权限由 App 管理':'审批由 App 管理',''));}control.disabled=true;control.title=limitedDesktopReason;}else if(limitedControls.has(control)){Object.assign(control,limitedControls.get(control));limitedControls.delete(control);}}
 if(limited&&!desktopCapabilityNote){desktopCapabilityNote=document.createElement('p');desktopCapabilityNote.className='muted';desktopCapabilityNote.style.cssText='font-size:12px;margin:0 8px 6px';desktopCapabilityNote.textContent='仅支持读取与空闲时发文字；停止、插话、审批等请用 App。';document.querySelector('.composer-wrap').prepend(desktopCapabilityNote);}if(desktopCapabilityNote)desktopCapabilityNote.hidden=!limited;
 if(limited){for(const id of ['steer','interrupt']){$(id).disabled=true;$(id).title=limitedDesktopReason;}$('send').disabled=!chatStateReady||!!turnId||sendingTurn||!!selected.protected||!!selected.accountMismatch||!!selected.conflict;$('send').title=turnId?'请等待当前任务完成；排队与插话请在 App 中操作':'发送文字（沿用 App 设置）';$('send').setAttribute('aria-label','发送文字');}
}
const desktopPages=historyPages({api:loadingApi,current:()=>selected,changed:items=>{if(desktopSnapshot)desktopState(desktopSnapshot);else render(items);},notice,scroller:$('messages')});
async function refreshDesktopMessages(){const target=selected;if(target?.mode!=='desktop')return;if(limitedDesktopMode()){const result=await loadingApi(`/codex-api/v1/desktop/${target.threadId}/follow`,{});if(selected!==target)return;desktopState(result.state);}const result=await loadingApi(`/codex-api/v1/desktop/${target.threadId}/messages`);if(selected!==target)return;const stamp=JSON.stringify(result.messages);if(stamp!==desktopMessageStamp){desktopMessages=result.messages;desktopMessageStamp=stamp;if(desktopSnapshot)desktopState(desktopSnapshot);}}
const inputScope=()=>selected?`${selected.mode}:${selected.mode==='web'?profile:'desktop'}:${selected.threadId}`:null;
let restoreView=null,viewTimer,stopViewSettling;
function storedView(scope){try{return JSON.parse(localStorage.getItem('codex-view:'+scope)||'null');}catch{return null;}}
function saveView(){const scope=inputScope(),box=$('messages');if(!scope||restoreView&&!restoreView.ready)return;try{localStorage.setItem('codex-view:'+scope,JSON.stringify(captureChatView(box,desktopPages.items().length)));}catch{}}
mountWorkScrollContainment($('messages'));
// Once the reader interacts, streaming and late history must respect that view.
const releaseRestoredView=()=>{stopViewSettling?.();stopViewSettling=null;restoreView=null;};
for(const name of ['wheel','touchstart','pointerdown','disclosure-interaction','jump-latest'])$('messages').addEventListener(name,releaseRestoredView,{passive:true});
window.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)&&!event.target?.matches('input,textarea,[contenteditable="true"]'))releaseRestoredView();});
$('messages').addEventListener('scroll',()=>{clearTimeout(viewTimer);viewTimer=setTimeout(saveView,140);},{passive:true});window.addEventListener('pagehide',saveView);document.addEventListener('visibilitychange',()=>{if(document.hidden)saveView();});
function pendingInputs(scope){try{return JSON.parse(sessionStorage.getItem('accepted-inputs:'+scope)||'[]');}catch{return [];}}
function rememberInput(scope,item){const items=pendingInputs(scope);items.push(item);try{sessionStorage.setItem('accepted-inputs:'+scope,JSON.stringify(items.slice(-80)));}catch{}if(inputScope()===scope)render(displayedItems);}
function text(item){if(typeof item.text==='string')return item.text;if(typeof item.message==='string')return item.message;if(Array.isArray(item.content))return item.content.map(c=>c.text||c.inputText||'').join('\n');if(item.command)return `${Array.isArray(item.command)?item.command.join(' '):item.command}\n${item.aggregatedOutput||item.output||''}`;if(Array.isArray(item.changes))return item.changes.map(c=>`${c.path}\n${c.diff||''}`).join('\n');if(item.summary)return Array.isArray(item.summary)?item.summary.map(x=>typeof x==='string'?x:x.text||'').join('\n'):String(item.summary);if(item.type==='imageView')return item.path||item.filePath||item.file_path||'图像';if(item.type==='mcpToolCall')return `${item.tool||item.toolName||item.name||'工具'}\n${JSON.stringify(item.arguments||{},null,2)}\n${JSON.stringify(item.result||{},null,2)}`;return '';}
function markdown(content,{images=false}={}){const renderer=new marked.Renderer(),base=renderer.link;if(images)renderer.image=replyImageMarkup;renderer.link=function(token){if(isArtifactLink(token.href)){const span=document.createElement('span');span.textContent=token.href;const path=span.innerHTML.replaceAll('"','&quot;');return '<a href="#" data-artifact-path="'+path+'">'+this.parser.parseInline(token.tokens)+'</a>';}return base.call(this,token);};return marked.parse(content,{renderer});}
function sessionContext(contexts,expanded){
  const details=document.createElement('details');details.className='session-context';details.dataset.item='session-context';details.open=expanded.has('session-context');
  const labels=contexts.map(context=>({instructions:'项目指令',environment:'运行环境',page:'页面上下文'}[context.kind]));
  const summary=document.createElement('summary');summary.textContent='会话上下文 · '+[...new Set(labels)].join('、');
  const body=document.createElement('div');body.className='session-context-body';
  for(const {kind,text} of contexts){const section=document.createElement('section');const title=document.createElement('h3');title.textContent={instructions:'项目指令',environment:'运行环境',page:'页面上下文'}[kind];section.append(title);if(kind==='instructions'){const content=document.createElement('div');content.className='session-context-markdown';content.innerHTML=DOMPurify.sanitize(markdown(text.replace(/<\/?INSTRUCTIONS>/g,'')),{USE_PROFILES:{html:true},FORBID_TAGS:['img','style','form','input','button','iframe'],FORBID_ATTR:['style']});renderMath(content);section.append(content);}else{const pre=document.createElement('pre');pre.textContent=text;section.append(pre);}body.append(section);}
  details.append(summary,body);animateDisclosure(details,body);return details;
}
const toolTypes=new Set(['commandExecution','fileChange','mcpToolCall','reasoning','webSearch','imageView','collabAgentToolCall','plan']);
function commandSummary(item){
 const parsed=item.commandActions?.find(action=>typeof action.command==='string'&&action.command.trim())?.command;
 if(parsed)return parsed.replace(/\s+/g,' ').trim();
 let value=item.command;
 if(Array.isArray(value)){const flag=value.findIndex(arg=>/^-(?:command|c|lc)$/i.test(arg));value=flag>=0?value.slice(flag+1).join(' '):value.join(' ');}
 value=String(value||item.commandActions?.find(action=>action.command)?.command||'命令');
 const shell=value.match(/^(?:"[^"\n]*(?:pwsh|powershell|bash|sh|cmd)(?:\.exe)?"|[^\s]*(?:pwsh|powershell|bash|sh|cmd)(?:\.exe)?)\s+(?:-(?:NoLogo|NoProfile|NonInteractive)\s+)*[-/](?:Command|c|lc)\s+([\s\S]*)$/i);
 if(shell){value=shell[1].trim();if(value.length>1&&['"',"'"].includes(value[0])&&value.at(-1)===value[0])value=value.slice(1,-1);}
 return value.replace(/\s+/g,' ').trim();
}

function workActive(item){return item._turnStatus!=='completed'&&item._turnStatus!=='interrupted'&&item._turnStatus!=='failed'&&!['completed','failed','declined','cancelled','interrupted'].includes(item.status)&&(item._running||item.status==='inProgress');}
function commandKind(item){
 const action=item.commandActions?.find(action=>['read','listFiles','search'].includes(action.type));
 if(action)return action.type;
 const command=commandSummary(item);
 if(/\b(?:Get-Content|gc|cat|type|head|tail)\b/i.test(command)||/\bsed\s+-n\b/i.test(command))return 'read';
 if(/\b(?:rg|grep|Select-String)\b/i.test(command))return 'search';
 return 'run';
}
function reasoningTitle(item){const parts=Array.isArray(item.summary)?item.summary:[item.summary||''];const latest=parts.map(part=>typeof part==='string'?part:part?.text||'').filter(part=>part.trim()).at(-1)||'';const heading=latest.match(/\*\*([^*\n]+)\*\*|^#{1,6}\s+([^\n]+)/);return (heading?.[1]||heading?.[2]||latest.split('\n').find(line=>line.trim())||'').replace(/\*\*/g,'').trim();}
function toolLine(item){
  const active=workActive(item),failed=item.status==='failed'||item.exitCode!=null&&item.exitCode!==0,stopped=['declined','cancelled','interrupted'].includes(item.status);if(failed||stopped){const normal=toolLine({...item,status:'completed',exitCode:0,_running:false});return (failed?'失败：':'已停止：')+normal;}
  const name=p=>String(p||'').split(/[\\/]/).at(-1);
  if(item.type==='fileChange'){const changes=item.changes||[];const files=changes.map(c=>name(c.path));let added=0,removed=0;for(const change of changes)for(const line of (change.diff||'').split('\n')){if(line.startsWith('+')&&!line.startsWith('+++'))added++;if(line.startsWith('-')&&!line.startsWith('---'))removed++;}return `${active?'正在':'已'}${changes.some(c=>c.kind?.type==='add'||c.kind==='add')?'创建':'编辑'} ${files.join('、')||'文件'}${added||removed?' +'+added+' -'+removed:''}`;}
  if(item.type==='commandExecution'){const action=item.commandActions?.find(action=>['read','listFiles','search'].includes(action.type)),kind=commandKind(item);if(kind!=='run'){const detail=action?.path||action?.name||action?.query||commandSummary(item);const verb={read:'读取文件',listFiles:'浏览目录',search:'搜索文件'}[kind];return (active?'正在':'已')+verb+' '+detail;}const seconds=item.durationMs!=null?Math.max(1,Math.round(item.durationMs/1000)):null;return `${workActive(item)?'正在运行':seconds?'已在 '+seconds+'s 内运行':'已运行'} ${commandSummary(item)}`;}
  if(item.type==='webSearch'){const action=item.action||{};const detail=action.url||item.url||item.query||action.query||(item.queries||action.queries||[]).join('、');return (workActive(item)?'正在搜索网页':'已搜索网页')+(detail?'：'+detail:'');}
  if(item.type==='imageView')return (active?'正在查看图像 ':'已查看图像 ')+name(item.path||item.filePath||item.file_path);
  if(item.type==='mcpToolCall'){let args=item.arguments||{};if(typeof args==='string')try{args=JSON.parse(args);}catch{args={};}const detail=args.command||args.cmd||args.path||args.query||args.q||args.reason||'';return (active?'正在调用 ':'调用了工具 ')+(item.tool||item.toolName||item.name||'')+(detail?' · '+String(detail).slice(0,140):'');}
  if(item.type==='reasoning')return reasoningTitle(item)||(active?'正在思考':'思考过程');
  if(item.type==='plan')return active?'正在更新工作计划':'更新了工作计划';
  if(item.type==='collabAgentToolCall'){const action=item.tool||item.toolName||item.name||'Agent 协作';return (active?'正在协作：':'已协作：')+action;}
  return (active?'正在调用工具 ':'调用了工具 ')+(item.tool||item.toolName||item.name||'');
}
function currentWork(items,ongoing=false){
 const active=items.findLast(workActive);if(active)return active;
 // Tool completion does not close the latest work segment. While waiting for
 // its next call/reasoning event, keep a live heading until a timeline boundary.
 return ongoing?{type:'reasoning',status:'inProgress',_running:true,_turnStatus:'inProgress'}:null;
}
function batchOngoing(items,tail){return !!tail&&items.includes(tail)&&tail._turnStatus==='inProgress';}
function workBatchTails(items){
 const tails=new Map();for(const item of items){
  const visibleWork=item.type==='imageView'||toolTypes.has(item.type)&&(item.type!=='reasoning'||text(item).trim()||workActive(item));
  if(visibleWork||item.type==='userMessage'||['connectionRetry','contextCompaction'].includes(item.type)||!toolTypes.has(item.type)&&text(item).trim())tails.set(item._turnId,item);
 }return tails;
}
function workGroup(items,expanded,key,ongoing=false){
  if(items.length===1&&items[0].type==='reasoning'){
    const item=currentWork(items,ongoing)||items[0],row=document.createElement('div');row.className='single-work-record reasoning-record';row.dataset.item=key;row.dataset.workCount='1';row.dataset.thinking=String(workActive(item));
    const label=document.createElement('span');label.className='work-label';label.textContent=toolLine(item);label.title=text(item)||label.textContent;if(workActive(item))label.classList.add('work-live-text');row.append(workIcon('reasoning'),label);return row;
  }
  const group=document.createElement('details');group.className='work-group';group.dataset.item=key;group.dataset.workCount=String(items.length);group.open=expanded.has(key);
  const heading=document.createElement('summary');heading.className='work-title';const kinds=new Set(items.map(i=>i.type));const labels=[];
  const changes=items.filter(i=>i.type==='fileChange'),commands=items.filter(i=>i.type==='commandExecution');if(changes.some(i=>i.changes?.some(c=>c.kind?.type==='add'||c.kind==='add')))labels.push('创建了文件');if(changes.some(i=>i.changes?.some(c=>c.kind?.type!=='add'&&c.kind!=='add')))labels.push('编辑了文件');if(commands.some(i=>commandKind(i)==='read'))labels.push('读取了文件');if(commands.some(i=>commandKind(i)==='listFiles'))labels.push('浏览了目录');if(commands.some(i=>commandKind(i)==='search'))labels.push('搜索了文件');if(commands.some(i=>commandKind(i)==='run'))labels.push('运行了命令');const images=items.filter(i=>i.type==='imageView').length;if(images)labels.push('查看了 '+images+' 张图像');if(kinds.has('webSearch'))labels.push('搜索了网页');if(!labels.length)labels.push(kinds.has('reasoning')?'思考与工作过程':'执行了工具操作');group.dataset.activities=labels.join('、');
  const active=currentWork(items,ongoing);group.dataset.thinking=String(active?.type==='reasoning');group.dataset.thinkingLabel=active?.type==='reasoning'?toolLine(active):'';if(active){group.classList.add('work-running');heading.className='work-title work-live-summary';const preview=document.createElement('span');preview.className='work-live-text';const latest=toolLine(active);preview.textContent=latest;preview.title=latest;heading.append(preview);}else{const label=document.createElement('span');label.className='work-label';label.textContent=labels.join('，');heading.append(label);}heading.prepend(workIcon(active?.type||(kinds.has('fileChange')?'fileChange':kinds.has('commandExecution')?'commandExecution':items[0].type)));group.append(heading);const list=document.createElement('div');list.className='work-list';
  for(let index=0;index<items.length;index++){const item=items[index];if(item.type==='reasoning'){if(text(item).trim()){const pre=document.createElement('pre');pre.className='reasoning-content';pre.textContent=text(item);list.append(pre);}continue;}if(item.type==='imageView'){const images=[item];while(items[index+1]?.type==='imageView')images.push(items[++index]);const record=imageRecord(images,expanded,ongoing);if(images.length===items.length)return record;list.append(record);continue;}if(item.type==='webSearch'){const row=document.createElement('div');row.className='tool-row web-search-record';row.dataset.item=item.id;row.append(workIcon('webSearch'));const label=document.createElement('span');label.className='work-label';label.textContent=toolLine(item);label.title=label.textContent;if(workActive(item))label.classList.add('work-live-text');row.append(label);if(items.length===1){const live=currentWork(items,ongoing);row.dataset.thinking=String(live?.type==='reasoning');if(live?.type==='reasoning')row.firstElementChild.replaceWith(workIcon('reasoning'));row.classList.add('single-work-record');row.dataset.workCount='1';if(!currentWork(items,ongoing))label.textContent=labels.join('，');else{label.textContent=toolLine(currentWork(items,ongoing));label.classList.add('work-live-text');}return row;}list.append(row);continue;}const row=document.createElement('details');row.className='tool tool-row';row.dataset.thinking=String(item.type==='reasoning'&&workActive(item));row.dataset.item=item.id;row.open=expanded.has(item.id);const summary=document.createElement('summary');summary.className='work-title';const icon=workIcon(item.type);const label=document.createElement('span');label.className='work-label';label.textContent=toolLine(item);label.title=label.textContent;if(workActive(item))label.classList.add('work-live-text');const status=document.createElement('span');status.className='work-dot';status.hidden=!workActive(item);summary.append(icon,label,status);const body=document.createElement('div');body.className='tool-body';const pre=document.createElement('pre');pre.textContent=text(item);body.append(pre);const context=selected?{mode:selected.mode,profile,threadId:selected.threadId}:null;if(context&&item.type==='imageView'){const path=item.path||item.filePath||item.file_path;if(path)body.append(previewButton(path,context,'预览图像'));}if(context&&item.type==='fileChange')for(const change of item.changes||[])if(change.path)body.append(previewButton(change.path,context,'预览 '+String(change.path).split(/[\\/]/).at(-1)));row.append(summary,body);animateDisclosure(row,body);if(items.length===1){row.classList.add('single-work-record');row.dataset.workCount='1';row.dataset.activities=group.dataset.activities;if(!currentWork(items,ongoing))label.textContent=labels.join('，');else{label.textContent=toolLine(currentWork(items,ongoing));label.classList.add('work-live-text');}row.open=expanded.has(key)||expanded.has(item.id);const live=currentWork(items,ongoing);row.dataset.thinking=String(live?.type==='reasoning');if(live){icon.replaceWith(workIcon(live.type));label.classList.add('work-live-text');row.classList.add('work-running');}return row;}list.append(row);}group.append(list);animateDisclosure(group,list);return group;
}
function imageRecord(items,expanded,ongoing=false){const record=document.createElement('details');record.className='image-record';record.dataset.item='images:'+items[0].id;record.dataset.workCount=String(items.length);record.open=expanded.has(record.dataset.item);const summary=document.createElement('summary');const active=currentWork(items,ongoing),icon=workIcon(active?.type||'imageView');record.dataset.thinking=String(active?.type==='reasoning');icon.classList.add('image-record-icon');const label=document.createElement('span');label.textContent=active?(active.type==='imageView'?'正在查看图像':toolLine(active)):`已查看 ${items.length} 张图像`;if(currentWork(items,ongoing))label.classList.add('work-live-text');summary.append(icon,label);const body=document.createElement('div');body.className='image-record-body';for(const item of items){const path=item.path||item.filePath||item.file_path;if(path&&selected)body.append(imageThumbnail(path,{mode:selected.mode,profile,threadId:selected.threadId}));}record.append(summary,body);const load=()=>{if(record.open)for(const image of body.querySelectorAll('img[data-preview-src]')){image.src=image.dataset.previewSrc;delete image.dataset.previewSrc;}};record.addEventListener('toggle',load);if(record.open)load();animateDisclosure(record,body);return record;}
const replacedTurns=new Map(),syncWorkSweep=workSweepClock();
function render(items){
  const removed=replacedTurns.get(currentQueueScope());if(removed)items=items.filter(item=>!removed.has(item._turnId));
  items=withProcessingStatus(items,turnId);
  const edit=currentMessageEdit(),editableUser=edit.editable?items.findLast(item=>item.type==='userMessage'&&item._turnId===edit.turnId&&!item._steering):null;
  predictions.update(selected?{source:selected.mode,profile,threadId:selected.threadId}:null,items,!!turnId);
  if(renderStreaming.frame){cancelAnimationFrame(renderStreaming.frame);renderStreaming.frame=0;}
  displayedItems=items;const latestByTurn=new Map();for(const item of items)if(item.type!=='userMessage')latestByTurn.set(item._turnId,item);items=items.map(item=>item.type==='reasoning'&&workActive(item)&&latestByTurn.get(item._turnId)!==item?{...item,_running:false,status:'completed'}:item);const scope=inputScope();if(scope){const pending=pendingInputs(scope),remaining=pending.filter(item=>items.filter(native=>native.type==='userMessage'&&text(native).trim()===item.text.trim()).length<=item._baseline);try{sessionStorage.setItem('accepted-inputs:'+scope,JSON.stringify(remaining));}catch{}items=[...items];for(const pendingItem of remaining){const anchor=items.findIndex(item=>item.id===pendingItem._afterItem);items.splice(anchor<0?items.length:anchor+1,0,pendingItem);}}
  // Capture bottom intent before adding messages or replacing streamed content.
  const box=$('messages'),workListsAtBottom=restoreView?.saved?(restoreView.saved.distance??(restoreView.saved.bottom?0:Infinity))<=bottomThreshold(box):inBottomRange(box),nearBottom=timelineFollow.capture(),previousTop=box.scrollTop,expanded=new Set(restoreView?.saved?.expanded||[...box.querySelectorAll('details[open]')].map(e=>e.dataset.item)),previousNodes=new Map([...box.querySelectorAll('[data-item]')].map(element=>[element.dataset.item,element])),desired=[];let tools=[],images=[];const timedTurns=new Set();let renderItem;
  const mark=(node,item)=>{node.dataset.turnId=item?._turnId||'';node.dataset.work=String(!!item&&item.type!=='userMessage'&&!item._replyComplete&&item.phase!=='final_answer'&&!node.dataset.item?.startsWith('processing:'));return node;};
  const cached=(key,signature,create,item=renderItem)=>{let node=previousNodes.get(key);if(!node||node.dataset.signature!==signature){node=create();node.dataset.item=key;node.dataset.signature=signature;}mark(node,item);desired.push(node);};
  const workScroll=new Map([...box.querySelectorAll('.work-group>.work-list')].map(list=>[list.parentElement.dataset.item,{top:list.scrollTop,bottom:list.scrollHeight-list.scrollTop-list.clientHeight<10}]));
  const users=new Map(),contexts=[],seenContexts=new Set();for(const item of items)if(item.type==='userMessage'){const parsed=userContent(text(item),item);users.set(item,parsed);for(const context of parsed.contexts){const key=context.kind+':'+context.text;if(!seenContexts.has(key)){seenContexts.add(key);contexts.push(context);}}}
  if(contexts.length)cached('session-context',JSON.stringify(contexts),()=>sessionContext(contexts,expanded),null);
  const batchTails=workBatchTails(items);
  const flushTools=()=>{if(tools.length){const ongoing=batchOngoing(tools,batchTails.get(tools[0]._turnId));const key='group:'+(tools[0].id||items.indexOf(tools[0])),signature=JSON.stringify([ongoing,tools.map(item=>[item.id,item.type,item.status,item._turnStatus,item._running,toolLine(item),text(item)])]);cached(key,signature,()=>workGroup(tools,expanded,key,ongoing),tools[0]);tools=[];}};
  const flushImages=()=>{if(images.length){const ongoing=batchOngoing(images,batchTails.get(images[0]._turnId));cached('images:'+images[0].id,JSON.stringify([ongoing,images.map(item=>[item.id,item.path||item.filePath||item.file_path,item.status,item._turnStatus,item._running])]),()=>imageRecord(images,expanded,ongoing),images[0]);images=[];}};
  const flush=()=>{flushTools();flushImages();};
  for(const item of items){renderItem=item;if(item.type!=='userMessage'&&item._turnId&&!timedTurns.has(item._turnId)){timedTurns.add(item._turnId);const timing=processingHeader(item);if(timing){flush();cached('processing:'+item._turnId,JSON.stringify([item._processingStartedAt,item._durationMs,item._turnStatus,latestByTurn.get(item._turnId)?.type==='reasoning'&&workActive(latestByTurn.get(item._turnId))]),()=>timing);}}const retry=item.type==='connectionRetry'?item:historicalConnectionRetry(item,text(item));if(retry){flush();cached(retry.id||'retry:'+retry._turnId,JSON.stringify([retry.attempt,retry.reasons,retry._turnStatus,retry.historical]),()=>connectionRetryRecord(retry,expanded),retry);continue;}if(item.type==='contextCompaction'){flush();cached('compaction:'+item.id,JSON.stringify([item._running,item.windowNumber,text(item),item.contextStart]),()=>compactionRecord(item,expanded));continue;}if(item.type==='imageView'){flushTools();images.push(item);continue;}if(toolTypes.has(item.type)){flushImages();if(item.type!=='reasoning'||text(item).trim()||workActive(item))tools.push(item);continue;}const user=item.type==='userMessage'?users.get(item):null;const content=user?.text??text(item);if(!content&&!user?.images.length)continue;flush();const key=item.id||item._turnId+':'+items.indexOf(item),signature=JSON.stringify([content,user?.images,item===editableUser,item.type,item._replyComplete,item._sentAt,item._steering,item._turnStatus,item._completedAt,item._durationMs,item._deliveryStatus]);const previous=previousNodes.get(key);if(previous?.dataset.signature===signature){mark(previous,item);desired.push(previous);continue;}const p=document.createElement('div');p.dataset.item=key;p.dataset.signature=signature;p.className='message '+(item.type==='userMessage'?'user':'');
    if(item.type==='userMessage'){p.classList.toggle('with-images',!!user.images.length);if(user.images.length){const attachments=document.createElement('div');attachments.className='user-image-attachments';for(const image of user.images)attachments.append(imageThumbnail(image,{mode:selected.mode,profile,threadId:selected.threadId},{eager:true,zoom:true}));p.append(attachments);}const body=document.createElement('span');const answer=questionReply(content);if(answer){if(user.images.length)answer.node.classList.add('user-text-bubble');p.append(answer.node);}else if(content){body.textContent=content;if(user.images.length)body.className='user-text-bubble';p.append(body);}userMetadata(p,item,answer?.copy||content,{onEdit:item===editableUser?()=>openMessageEdit(item).catch(error=>notice(error.message)):null});}else{p.innerHTML=DOMPurify.sanitize(markdown(content,{images:true}),{USE_PROFILES:{html:true},FORBID_TAGS:['img','style','form','input','button','iframe'],FORBID_ATTR:['style']});renderMath(p);mountReplyImages(p,selected?{mode:selected.mode,profile,threadId:selected.threadId}:null);for(const link of p.querySelectorAll('a')){link.target='_blank';link.rel='noopener noreferrer';const href=link.dataset.artifactPath||link.getAttribute('href');if(selected&&href&&isArtifactLink(href)){link.onclick=event=>{event.preventDefault();preview(href,{mode:selected.mode,profile,threadId:selected.threadId});};}}for(const pre of p.querySelectorAll('pre')){const wrap=document.createElement('div');wrap.className='code-wrap';pre.replaceWith(wrap);wrap.append(pre);const copy=copyButton(pre.innerText,'复制代码');copy.classList.add('copy-code');wrap.append(copy);}if(item._replyComplete){const target=selected,activeProfile=profile;p.append(replyActions(item,content,scope,()=>branchReply(item,target,activeProfile),(rating,onSent)=>feedbackDialog({api,selected:target,profile:activeProfile,rating,itemId:item.id,onSent})));}}mountFileCitations(p,selected?{mode:selected.mode,profile,threadId:selected.threadId}:null);p.dataset.running=String(!!item._running);mountDisclosures(p,{expanded,restore:!!previous});mark(p,item);desired.push(p);
  }flush();desired.splice(0,desired.length,...foldTurnWork(desired,previousNodes,expanded));desktopPages.decorate(desired);if(selected&&chatStateReady&&!desired.length)cached('empty-chat',queued.length?'queued':'empty',()=>{const empty=document.createElement('p');empty.className='muted';empty.textContent=queued.length?'消息已加入队列，等待发送…':'此会话暂无消息';return empty;},null);for(let index=0;index<desired.length;index++)if(box.children[index]!==desired[index])box.insertBefore(desired[index],box.children[index]||null);while(box.children.length>desired.length)box.lastElementChild.remove();for(const list of box.querySelectorAll('.work-group>.work-list')){const saved=workScroll.get(list.parentElement.dataset.item);if(saved)list.scrollTop=saved.bottom?list.scrollHeight:saved.top;else list.scrollTop=workListsAtBottom?list.scrollHeight:0;}if(!restoreDisclosureScroll(box)){if(restoreView?.scope===scope){if(restoreView.ready)applyChatView(box,restoreView.saved);else box.scrollTop=box.scrollHeight;}else box.scrollTop=nearBottom?box.scrollHeight:previousTop;}updateNavigator();conversationUI.items(items,selected?{mode:selected.mode,profile,threadId:selected.threadId}:null);
  syncWorkSweep(box,scope);
  timelineFollow.commit(inBottomRange(box));
}
// Coalesce native/token bursts into the next display frame, retaining the latest state.
function renderStreaming(items){renderStreaming.items=items;if(renderStreaming.frame)return;renderStreaming.frame=requestAnimationFrame(()=>{renderStreaming.frame=0;render(renderStreaming.items);});}
function stateLabel(value){const raw=String(value||''),short=raw.replace(/^桌面 · /,'');const label={idle:'',active:'执行中',inProgress:'执行中',completed:'已完成',failed:'执行失败',notLoaded:'历史记录',interrupted:'已中断',waitingOnApproval:'等待审批','已连接桌面原实例':'','已连接':'','就绪':'','准备就绪':'','当前管理会话：只读':'只读','连接桌面会话…':'连接中'}[short]??short;$('state').textContent=label;$('state').title=raw;}
let activityRefreshTimer=null;
let historyLoaded=false;
function refreshAfterActivity(){if(activityRefreshTimer)return;activityRefreshTimer=setTimeout(()=>{activityRefreshTimer=null;void refresh().catch(()=>{});},1000);}
async function refresh(){rows=await loadingApi('/codex-api/v1/history');historyLoaded=true;if(selected?.mode==='web'){const current=rows.find(row=>row.threadId===selected.threadId&&row.sources.includes('web:'+profile));if(current){selected.accountMismatch=current.accountMismatch;if(current.accountMismatch)for(const id of ['send','steer'])$(id).disabled=true;}}renderThreads();}
function renderThreads(){
  renderRecent();
  const box=$('threads'),scroller=$('sidebar-history'),scroll=scroller.scrollTop,query=$('search').value.trim().toLowerCase();
  const collapsed=new Set([...box.querySelectorAll('details:not([open])')].map(e=>e.dataset.project));
  if(!box.children.length)try{for(const key of JSON.parse(localStorage.getItem('codex-collapsed-projects')||'[]'))collapsed.add(key);}catch{}
  box.replaceChildren();const groups=groupProjectRows(rows.filter(row=>!query||String(row.name+' '+row.cwd).toLowerCase().includes(query)),[...sidebarOrder.projects,...Object.keys(projectNames),...Object.keys(pinnedProjects)]),collapsedProjects=new Set([...collapsed].map(projectIdentity));
  for(const [key,unsorted]of orderProjectGroups(groups,sidebarOrder.projects,pinnedProjects)){const list=[...unsorted].sort((a,b)=>Number(!!pinnedThreads[b.key])-Number(!!pinnedThreads[a.key])||(b.updatedAt||0)-(a.updatedAt||0));
    const group=document.createElement('details');group.className='project';group.dataset.project=key;group.open=!!query||!collapsedProjects.has(projectIdentity(key));
    const summary=document.createElement('summary');summary.title=key+' · '+list.length+' 个聊天';
    const folder=document.createElement('span');folder.className='project-chevron';folder.innerHTML=sidebarIcon('folder');
    const name=document.createElement('span');name.className='project-name';name.textContent=projectSetting(projectNames,key)||key.split(/[\\/]/).filter(Boolean).at(-1)||key;
    const actions=document.createElement('div');actions.className='sidebar-project-actions';
    const notification=sidebarActionButton({label:'项目通知',icon:'more',action:()=>projectNotices.toggle(key),notice,lock:false});
    notification.classList.add('sidebar-project-notification');notification.dataset.project=key;notification.setAttribute('role','switch');notification.innerHTML=sidebarIcon('bellOff');
    const menu=sidebarActionButton({label:'项目菜单：'+name.textContent,icon:'more',notice,action:button=>{const rect=button.getBoundingClientRect();showSidebarMenu(projectActions(key),rect.left,rect.bottom,button);}});
    menu.setAttribute('aria-haspopup','menu');menu.setAttribute('aria-expanded','false');
    const create=sidebarActionButton({label:'新建聊天：'+name.textContent,icon:'compose',notice,disabled:key==='未指定项目',action:()=>startInProject(key,{source:'web'})});
    actions.append(notification,menu,create);summary.append(folder,name,actions);group.append(summary);
    attachSidebarMenu(summary,()=>projectActions(key));
    const body=document.createElement('div');body.className='project-body';
    for(const row of list){
      const item=document.createElement('div');item.className='thread'+(selected?.key===row.key?' selected':'')+(pinnedThreads[row.key]?' pinned':'');item.dataset.thread=row.threadId;
      const button=document.createElement('button');button.type='button';button.className='thread-open';
      const name=document.createElement('span');name.className='thread-name';name.textContent=row.name||'会话';
      const source=(row.sources.includes('desktop')?'桌面':'网页')+(row.sources.length>1?' · 共享会话':'')+(row.protected?' · 只读':'')+(row.conflict?' · 持有者冲突':'');
      button.title=name.textContent+' · '+source;button.setAttribute('aria-label',(row.needsAttention?'待处理审批，':feedbackThreads.has(row.key)?'有新回复，':'')+(row.running?'正在运行，':'')+name.textContent+'，'+source);button.setAttribute('aria-current',String(selected?.key===row.key));
      button.append(threadActivity(row,feedbackThreads.has(row.key)),name);button.onclick=()=>open(row).catch(e=>notice(e.message));
      attachSidebarMenu(button,()=>chatActions(row));
      item.append(button,chatRowActions(row));body.append(item);
    }
    group.append(body);animateDisclosure(group,body);group.addEventListener('toggle',()=>{try{localStorage.setItem('codex-collapsed-projects',JSON.stringify([...box.querySelectorAll('details:not([open])')].map(e=>e.dataset.project)));}catch{}});box.append(group);
  }
  if(historyLoaded&&!groups.size){const p=document.createElement('p');p.className='muted';p.textContent=query?'没有匹配的会话':'暂无会话';box.append(p);}projectControls.sync({search:!!query});syncProjectNotificationButtons();scroller.scrollTop=scroll;
}
function sidebar(show){if(matchMedia(mobileSidebarQuery).matches){document.body.classList.toggle('sidebar-open',show);$('sidebar-scrim').hidden=!show;$('sidebar').inert=!show;}else document.body.classList.toggle('sidebar-collapsed',!show);$('toggle-sidebar').setAttribute('aria-expanded',String(show));}
bind('toggle-sidebar',()=>{sidebar(true);if(matchMedia(mobileSidebarQuery).matches)$('close-sidebar').focus({preventScroll:true});else $('search').focus();});bind('close-sidebar',()=>{sidebar(false);$('toggle-sidebar').focus();});bind('sidebar-scrim',()=>sidebar(false));$('search').oninput=renderThreads;
bind('new-project',()=>openProjectPicker(true));bind('project-directory',()=>{if(selected?.cwd)showProjectInfo(selected.cwd);else openProjectPicker();});
sidebarResize($('sidebar'));
const mobile=matchMedia(mobileSidebarQuery);
mobile.addEventListener('change',()=>{
  document.body.classList.remove('sidebar-open','sidebar-collapsed');
  $('sidebar-scrim').hidden=true;$('sidebar').inert=booting||mobile.matches;
  $('toggle-sidebar').setAttribute('aria-expanded',String(!mobile.matches));
});
$('sidebar').inert=booting||mobile.matches;
if(!paneMode)mountMobileSidebarShortcut({toggle:()=>sidebar(!document.body.classList.contains('sidebar-open')),settings:document.querySelector('[data-panel="defaults"]'),notice});
document.addEventListener('keydown',event=>{if(booting)return;if(event.key==='Escape'){sidebar(false);closeLayer($('account-modal'),()=>{$('account-modal').style.display='none';});}if((event.ctrlKey||event.metaKey)&&event.key==='k'){event.preventDefault();$('new').click();}});
let defaultsPolicy={access:'workspace-write',approval:'manual'};let commandOptions={},pendingSkill=null,pendingImages=[],threadUsage=new Map();const modeStatus=document.createElement('div');modeStatus.className='composer-mode-status';document.querySelector('.composer').prepend(modeStatus);
const queueBox=document.createElement('section');queueBox.className='composer-queue';queueBox.setAttribute('aria-label','待发送消息');queueBox.hidden=true;document.querySelector('.composer-wrap').insertBefore(queueBox,document.querySelector('.composer'));
const composerSizing=composerResize(document.querySelector('.composer-wrap'),$('input'),queueBox,$('requests'),{beforeKeyboardFollow:()=>{stopViewSettling?.();restoreView=null;}});
observeLayoutMotion(document.querySelector('.composer-wrap'),{selector:'.animated-select,.select-trigger>span,.send-controls>button,.composer-mode-status>span,.composer-image-preview,.composer-queue-item,.composer-queue-header',key:node=>node.dataset.layoutKey||node});
const predictions=composerPredictions({input:$('input'),settings:document.querySelector('[data-panel="defaults"]'),request:api,blocked:()=>!!pendingSkill||!!pendingImages.length||!!selected?.protected||!!selected?.conflict||!!selected?.accountMismatch});
let queued=[],queueScope=null,queueReady=Promise.resolve(),queueOperation=Promise.resolve(),queueDispatching=false,queuePaused=false,awaitingDesktopStart=false,chatStateReady=false,sendingTurn=false,pendingPaste=Promise.resolve(),webQuestionTurns=[];
const imageMotionKeys=new WeakMap();let imageMotionSequence=0;
const imageTray=document.createElement('div');imageTray.className='composer-image-tray';imageTray.hidden=true;$('input').before(imageTray);
function paintImages(){
 predictions.refresh();
 imageTray.replaceChildren();imageTray.hidden=!pendingImages.length;
 for(const [index,item]of pendingImages.entries()){
  const preview=document.createElement('div');preview.className='composer-image-preview';if(!imageMotionKeys.has(item))imageMotionKeys.set(item,'image:'+ ++imageMotionSequence);preview.dataset.layoutKey=imageMotionKeys.get(item);
  const thumbnail=imageThumbnail(item.url,{mode:'desktop',threadId:selected?.threadId||''},{eager:true,zoom:true});thumbnail.classList.add('composer-image-open');thumbnail.setAttribute('aria-label','查看第 '+(index+1)+' 张待发送图片');
  const remove=document.createElement('button');remove.type='button';remove.className='composer-image-remove';remove.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg>';remove.setAttribute('aria-label','移除第 '+(index+1)+' 张图片');
  remove.onclick=event=>{event.stopPropagation();pendingImages.splice(index,1);paintCommandOptions();workspace.saveDraft();};preview.append(thumbnail,remove);imageTray.append(preview);
 }
}
function currentQueueScope(){return selected?(selected.mode==='web'?`web:${profile}:${selected.threadId}`:`desktop:${selected.threadId}`):null;}
function currentTaskControl(){if(limitedDesktopMode())return {disabled:true,action:'stop',label:'请在 App 中操作',title:limitedDesktopReason};return taskControlState({turns:selected?.mode==='desktop'?desktopTurns(desktopSnapshot):webQuestionTurns,activeTurn:turnId,ready:!!selected&&chatStateReady,blocked:!!selected?.protected||!!selected?.conflict||!!selected?.accountMismatch,pending:sendingTurn||awaitingDesktopStart||queued.length>0||queueDispatching||queuePaused});}
function currentMessageEdit(){
 const state=lastMessageEdit(selected?.mode==='desktop'?desktopTurns(desktopSnapshot):webQuestionTurns,{allowRunning:true});
 return {...state,editable:state.editable&&!limitedDesktopMode()&&!!selected&&chatStateReady&&(!turnId||turnId===state.turnId)&&!sendingTurn&&!awaitingDesktopStart&&!queued.length&&!selected.protected&&!selected.conflict&&!selected.accountMismatch};
}
function discardEditedTurn(id){
 if(!id||!currentQueueScope())return;
 const scope=currentQueueScope(),removed=replacedTurns.get(scope)||new Set();removed.add(id);replacedTurns.set(scope,removed);
 webReadEpoch++;for(const [key,item]of liveItems)if(item._turnId===id)liveItems.delete(key);
 if(selected?.mode==='desktop')desktopPages.discardTurn(id);else render([...liveItems.values()]);
}
async function openMessageEdit(item){
 const target=selected,scope=currentQueueScope(),control=currentMessageEdit();
 if(!control.editable||control.turnId!==item._turnId)throw Error('只能修改当前最后一条原始用户消息');
 return editMessageDialog({api,scope,turnId:item._turnId,isCurrent:()=>selected===target&&currentMessageEdit().editable&&currentMessageEdit().turnId===item._turnId,
  onBusy:busy=>{sendingTurn=busy;paintQueue();render(displayedItems);},
  onEdited:async result=>{if(selected!==target)return;discardEditedTurn(result.replacedTurnId);if(target.mode==='web'){if(result.turn?.id){acceptStartedTurn(liveItems,result.turn);turnId=result.turn.status==='completed'?null:result.turn.id;}await read();}else{await refreshDesktopMessages();if(desktopSnapshot)desktopState(desktopSnapshot);}markRecent(target.mode==='desktop'?'desktop':'web:'+profile,target.threadId);}
 });
}
function paintQueue(){
 paintDesktopCapabilities();
 for(const button of document.querySelectorAll('.edit-user-message'))button.disabled=!currentMessageEdit().editable;
 paintTaskControl($('interrupt'),currentTaskControl());paintDesktopCapabilities();
 const queuedMode=!!selected&&(!!turnId||awaitingDesktopStart||sendingTurn||queued.length>0||!chatStateReady);$('send').title=queuedMode?'加入发送队列（当前任务完成后发送）':'发送消息';$('send').setAttribute('aria-label',queuedMode?'加入发送队列':'发送消息');
 queueBox.replaceChildren();queueBox.hidden=!queued.length;if(!queued.length)return;
 const header=document.createElement('div');header.className='composer-queue-header';header.dataset.layoutKey='queue-header';const heading=document.createElement('strong');heading.textContent=`排队发送 · ${queued.length} 条`;const hint=document.createElement('span');hint.textContent=queuePaused?'发送结果待确认，请检查聊天记录':queueDispatching?'正在发送队首消息':queuedMessages.snapshot(queueScope)?.reason||(queuedMessages.snapshot(queueScope)?.nativeShared?'已同步到 App 队列，审批沿用 App 设置':'已保存到后端，任务完成后依次发送');header.append(heading,hint);
 if(queuePaused){const retry=document.createElement('button');retry.type='button';retry.textContent='确认重试';retry.onclick=async()=>{if(!confirm('请先检查聊天记录。确认这条消息尚未发出，需要重新发送？'))return;try{await queueAction('retry',queued[0].id);}catch(error){notice(error.message);}};header.append(retry);}queueBox.append(header);
 for(const [index,item]of queued.entries()){
  const row=document.createElement('div');row.className='composer-queue-item';row.dataset.layoutKey='queue:'+item.id;const content=document.createElement('div');content.className='composer-queue-content';const label=document.createElement('span');label.textContent=item.text||'图片消息';label.title=label.textContent;content.append(label);if(item.images?.length){const media=document.createElement('span');media.className='composer-queue-media';for(const [imageIndex,image]of item.images.entries()){const thumbnail=imageThumbnail(image.url,{mode:selected?.mode||'web',profile,threadId:selected?.threadId||''},{eager:true,zoom:true});thumbnail.type='button';thumbnail.setAttribute('aria-label','查看第 '+(imageIndex+1)+' 张排队图片');media.append(thumbnail);}content.append(media);}if(item.skill){const skill=document.createElement('small');skill.textContent='技能 · '+item.skill.name;content.append(skill);}const actions=document.createElement('div');actions.className='composer-queue-actions';
  const action=(name,run,disabled=false)=>{const button=document.createElement('button');button.type='button';button.textContent=name;button.disabled=queueDispatching||disabled;button.onclick=()=>Promise.resolve(run()).catch(error=>notice(error.message));actions.append(button);};
  action('编辑',async()=>{if($('input').value.trim()||pendingImages.length||pendingSkill)throw Error('请先处理输入框中尚未发送的草稿');await changeQueue(items=>items.filter(entry=>entry.id!==item.id));$('input').value=item.text;pendingImages=[...(item.images||[])];pendingSkill=item.skill||null;paintCommandOptions();$('input').dispatchEvent(new Event('input',{bubbles:true}));workspace.saveDraft();$('input').focus();});
  action('上移',()=>changeQueue(items=>{const copy=[...items];[copy[index-1],copy[index]]=[copy[index],copy[index-1]];return copy;}),index===0);
  action('下移',()=>changeQueue(items=>{const copy=[...items];[copy[index+1],copy[index]]=[copy[index],copy[index+1]];return copy;}),index===queued.length-1);
  action('引导',()=>queueAction('steer',item.id),!turnId||!!item.skill||!!selected?.protected||!!selected?.conflict||!!selected?.accountMismatch||item.status==='uncertain');
  action('删除',()=>changeQueue(items=>items.filter(entry=>entry.id!==item.id)));
  row.append(content,actions);queueBox.append(row);
 }
}
function acceptQueue(items){const previous=queued;queued=items;queuePaused=['uncertain','failed'].includes(items[0]?.status);queueDispatching=items.some(item=>item.status==='sending');paintQueue();if(selected?.mode==='web'){
 for(const draft of items)if(['sending','uncertain'].includes(draft.status)){acceptQueuedUser(liveItems,draft);const echo=[...liveItems.values()].find(item=>item._queueId===draft.id);if(echo&&!echo._turnId)echo._deliveryStatus=draft.status;}
 render([...liveItems.values()]);
 if(previous.some(draft=>!items.some(item=>item.id===draft.id)))void read().catch(()=>{});
}}
async function loadQueue(){if(limitedDesktopMode()){queueScope=currentQueueScope();queued=[];queueReady=Promise.resolve();paintQueue();return;}const scope=currentQueueScope();if(!scope)chatStateReady=false;queueScope=scope;queued=[];queuePaused=false;queueDispatching=false;paintQueue();queueReady=syncQueue().catch(error=>notice('无法读取后端队列：'+error.message));await queueReady;}
function syncQueue(){if(limitedDesktopMode())return Promise.resolve();const scope=queueScope;if(!scope)return Promise.resolve();const operation=queueOperation.catch(()=>{}).then(async()=>{const items=await queuedMessages.read(scope);if(scope===queueScope&&scope===currentQueueScope())acceptQueue(items);});queueOperation=operation;return operation;}
function changeQueue(update){const scope=queueScope;const operation=queueOperation.catch(()=>{}).then(async()=>{if(!scope||scope!==queueScope)throw Error('会话已切换');try{const next=await queuedMessages.write(scope,update(queued));if(scope===queueScope)acceptQueue(next);return next;}catch(error){try{const latest=await queuedMessages.read(scope);if(scope===queueScope)acceptQueue(latest);}catch{}throw error;}});queueOperation=operation;return operation;}
function queueAction(action,id){const scope=queueScope;const operation=queueOperation.catch(()=>{}).then(async()=>{if(!scope||scope!==queueScope)throw Error('会话已切换');const items=await queuedMessages[action](scope,id);if(scope===queueScope)acceptQueue(items);});queueOperation=operation;return operation;}
function restoreCommandOptions(){try{commandOptions=JSON.parse(localStorage.getItem('codex-command-options:'+(inputScope()||'new'))||'{}');}catch{commandOptions={};}if(selected&&commandOptions.cwd){delete commandOptions.cwd;try{localStorage.setItem('codex-command-options:'+inputScope(),JSON.stringify(commandOptions));}catch{}}pendingSkill=null;pendingImages=[];paintCommandOptions();}
function paintCommandOptions(){paintProjectDirectory();fastModeIndicator.hidden=!commandOptions.serviceTier||commandOptions.serviceTier==='default';modeStatus.replaceChildren();for(const label of [commandOptions.collaborationMode==='plan'?'计划模式':null,pendingSkill?'技能 · '+pendingSkill.name:null,commandOptions.cwd?'新聊天项目 · '+commandOptions.cwd.split(/[\\/]/).at(-1):null].filter(Boolean)){const chip=document.createElement('span');chip.dataset.layoutKey='mode:'+label;chip.textContent=label;const project=label.startsWith('新聊天项目 · ');if(label.startsWith('技能 · ')||project){const remove=document.createElement('button');remove.type='button';remove.className='attachment-remove';remove.setAttribute('aria-label',project?'取消新聊天项目':label.startsWith('技能 · ')?'移除待发送技能':'移除待发送图片');remove.textContent='×';remove.onclick=()=>{if(project){delete commandOptions.cwd;localStorage.setItem('codex-command-options:'+(inputScope()||'new'),JSON.stringify(commandOptions));}else if(label.startsWith('技能 · '))pendingSkill=null;else pendingImages=[];paintCommandOptions();workspace.saveDraft();};chip.append(remove);}modeStatus.append(chip);}paintImages();}
function syncDesktopSettings(patch,target=selected){
 if(target?.mode!=='desktop')return Promise.resolve();if(limitedDesktopMode())return Promise.reject(Error(limitedDesktopReason));
 if(target.protected||target.conflict||target.accountMismatch)return Promise.reject(Error('此桌面聊天不可修改设置'));
 syncDesktopSettings.pending=(syncDesktopSettings.pending||0)+1;
 const operation=(syncDesktopSettings.tail||Promise.resolve()).catch(()=>{}).then(()=>api('/codex-api/v1/desktop-features/'+target.threadId+'/settings',patch)).then(result=>{if(result.applied===false)throw Error('桌面未应用设置，请刷新后重试');return result;}).finally(()=>{syncDesktopSettings.pending--;});
 syncDesktopSettings.tail=operation;return operation;
}
async function nativeRead(method,params={},id=profile,target=selected){
 if(target?.mode!=='desktop')return rpc(method,params,id);
 const feature={'account/read':'account','skills/list':'skills','mcpServerStatus/list':'mcp','account/rateLimits/read':'limits','account/usage/read':'usage'}[method];if(!feature)throw Error('桌面只读查询未提供此功能');
 return api('/codex-api/v1/desktop-features/'+target.threadId+'/'+feature+(params.cursor?'?cursor='+encodeURIComponent(params.cursor):''));
}
async function refreshCommandSkills(){const target=selected,id=profile;const result=await nativeRead('skills/list',{},id);if(selected===target&&profile===id){const skills=(result.data||[]).flatMap(entry=>entry.skills||[]).filter(skill=>skill.enabled!==false);const changed=JSON.stringify(skills)!==JSON.stringify(commandSkills);commandSkills=skills;return changed;}return false;}
async function desktopUsage(){const target=selected,id=profile,usageState=desktopSnapshot;const results=await Promise.allSettled([nativeRead('account/usage/read',{},id,target),nativeRead('account/rateLimits/read',{},id,target),nativeRead('account/read',{},id,target)]);const usage=results[0].status==='fulfilled'?results[0].value:{},limits=results[1].status==='fulfilled'?results[1].value:{unavailable:results[1].reason.message};const account=results[2].status==='fulfilled'?results[2].value.account:null;const summary=usage.summary||{};return statusView({'账户':account?.email||account?.type||'未提供','套餐':account?.planType||account?.chatgptPlanType||'未提供','账户来源':'桌面 App 配置','累计 Token':summary.lifetimeTokens?.toLocaleString()??'未提供','单日最高 Token':summary.peakDailyTokens?.toLocaleString()??'未提供','最长任务（秒）':summary.longestRunningTurnSec??'未提供','连续使用（天）':summary.currentStreakDays??'未提供',...(results[0].status==='rejected'?{'用量读取':results[0].reason.message}:{}),...(results[2].status==='rejected'?{'账户读取':results[2].reason.message}:{})},threadUsage.get(target?.threadId)||usageState?.latestTokenUsageInfo,limits);}
function desktopRuntime(){const state=desktopSnapshot||{},settings=state.latestThreadSettings||{};return statusView({'运行来源':'桌面 App 原实例','聊天 ID':selected?.threadId,'原生状态':state.threadRuntimeStatus?.type||'尚未同步','项目':state.cwd||selected?.cwd,'模型':state.latestModel||settings.model,'推理':state.latestReasoningEffort??settings.effort,'模式':state.latestCollaborationMode?.mode||settings.collaborationMode?.mode,'速度':settings.serviceTier,'审批者':settings.approvalsReviewer},state.latestTokenUsageInfo,{unavailable:'使用 /account 查看桌面账号用量和额度'});}
async function desktopProviders(){const target=selected,snapshot=desktopSnapshot;const result=await api('/codex-api/v1/desktop-features/'+target.threadId+'/providers');if(selected!==target)return;return statusView({'配置中的提供方':result.activeProvider,'配置中的默认模型':result.defaultModel||'未设置','配置中的默认推理':result.defaultReasoning||'未设置','当前聊天模型':snapshot?.latestModel||'尚未同步','已配置提供方':result.providers.map(provider=>provider.name+' ('+provider.id+')').join('、'),'切换提供方':'当前 App 未提供共享写接口，请在 App 中操作；此处不会改动网页实例或桌面凭据。'},null,{unavailable:'以上为桌面配置，不表示运行中的引擎已重新应用配置。'});}
async function desktopArchives(){const result=await api('/codex-api/v1/desktop-management/archives');if(!result.threads.length){commandDialog('桌面已归档聊天','当前账号没有可恢复的已归档聊天。');return;}return result.threads.map(row=>({label:row.name,description:'恢复聊天 · '+(row.cwd||''),run:async()=>{if(!confirm('恢复“'+row.name+'”？'))return;const restored=await api('/codex-api/v1/desktop-management/'+row.threadId+'/unarchive',{});await refresh();notice(restored.warning||'已恢复桌面聊天');}}));}
async function viewDesktopGoal(){const target=selected;if(target?.mode!=='desktop')return;const {goal}=await api('/codex-api/v1/desktop-goal/'+target.threadId);if(selected!==target)return;const body=document.createElement('div');const text=document.createElement('p');text.textContent=goal?goal.objective:'此桌面聊天尚未设置目标';body.append(text);if(goal){const stats=document.createElement('p');stats.textContent='状态：'+goal.status+' · 已用 '+Number(goal.tokensUsed||0).toLocaleString()+' tokens'+(goal.tokenBudget?' / '+goal.tokenBudget:'');body.append(stats);}const caption=document.createElement('p');caption.className='muted';caption.textContent='网页仅查看桌面目标。单独暂停、创建、编辑、恢复和清除暂不可用，请在 App 中操作。';body.append(caption);const dialog=commandDialog('桌面目标',body);return dialog;}
const composerCommands=commandCatalog({$,rpc,api,nativeRead,desktopUsage,desktopProviders,desktopArchives,desktopRuntime,viewGoal:viewDesktopGoal,notice,read,state:()=>({selected,profile,turnId,desktopCapabilities:serviceCapabilities.desktop.capabilities}),models:()=>models,chooseProject:()=>openProjectPicker(),setProject:cwd=>openProjectPicker(true,cwd),rows:()=>rows,tokenUsage:()=>threadUsage.get(selected?.threadId)||desktopSnapshot?.latestTokenUsageInfo||desktopSnapshot?.tokenUsage,attachImage:url=>{pendingImages.push({type:'image',url});paintCommandOptions();workspace.saveDraft();},skills:()=>commandSkills,items:()=>displayedItems,options:()=>commandOptions,setOptions:async patch=>{const target=selected;const nativePatch=Object.fromEntries(Object.entries(patch).filter(([key])=>['serviceTier','collaborationMode'].includes(key)));if(Object.keys(nativePatch).length)await syncDesktopSettings(nativePatch,target);if(selected!==target)return;commandOptions={...commandOptions,...patch};localStorage.setItem('codex-command-options:'+(inputScope()||'new'),JSON.stringify(commandOptions));paintCommandOptions();workspace.saveDraft();notice(target?.mode==='desktop'?'已同步桌面设置，下次任务应用':'已更新，下次发送时应用');},useSkill:skill=>{pendingSkill={name:skill.name,path:skill.path};if(!$('input').value.startsWith('$'+skill.name+' '))$('input').value='$'+skill.name+' '+$('input').value;$('input').dispatchEvent(new Event('input',{bubbles:true}));paintCommandOptions();workspace.saveDraft();},editGoal:()=>{const button=document.querySelector('[aria-label="放大编辑目标"]');if(button&&!button.closest('[hidden]')){button.click();return;}const form=document.createElement('form');form.className='command-form';const text=document.createElement('textarea');text.placeholder='希望持续完成的目标';text.setAttribute('aria-label','目标内容');const save=document.createElement('button');save.textContent='创建目标';form.append(text,save);const target={...selected},id=profile,dialog=commandDialog('创建目标',form);form.onsubmit=async event=>{event.preventDefault();if(!text.value.trim())return;save.disabled=true;try{await api(`/codex-api/v1/goals/web/${id}/${target.threadId}`,{action:'edit',objective:text.value.trim()});dialog.leave();await refreshGoal();}catch(error){notice(error.message);save.disabled=false;}};text.focus();}});
const commandMenu=slashCommands($('input'),composerCommands,notice);
composerAdd({refreshSkills:refreshCommandSkills,button:$('composer-add'),input:$('input'),commands:composerCommands,skills:()=>commandSkills,rows:()=>rows,notice,closeSlash:()=>commandMenu.close(),append:text=>{const input=$('input');input.value+=(input.value&&!input.value.endsWith('\n')?'\n':'')+text+'\n';input.dispatchEvent(new Event('input',{bubbles:true}));workspace.saveDraft();},attachImages:async files=>{const tab=workspace.activeId();if(pendingImages.length+files.length>8)throw Error('一条消息最多添加 8 张图片');const images=await Promise.all(files.map(imageInput));if(workspace.activeId()!==tab){notice('会话已切换，请在当前会话重新添加图片');return;}pendingImages.push(...images);paintCommandOptions();workspace.saveDraft();}});
restoreCommandOptions();
$('reasoning').menuExtras=()=>{const model=models.find(model=>model.model===$('composer-model').value)||models.find(model=>model.isDefault)||models[0],tiers=model?.serviceTiers?.length?model.serviceTiers:(model?.additionalSpeedTiers||[]).map(id=>({id})),fast=tiers.find(tier=>['fast','priority'].includes(tier.id)),checked=['fast','priority','ultrafast'].includes(commandOptions.serviceTier);return [{label:'快速模式',description:fast?'更快响应，可能增加用量':'当前模型未返回可用快速档位',checked,disabled:!fast&&!checked,run:()=>{commandOptions={...commandOptions,serviceTier:checked?'default':fast.id};localStorage.setItem('codex-command-options:'+(inputScope()||'new'),JSON.stringify(commandOptions));paintCommandOptions();workspace.saveDraft();}}];};
const workspace=await workspaceChrome({$,notice,draftDatabase:browserState.queueDatabase+'-drafts',pinnedRow:row=>!!pinnedThreads[row?.key],togglePin:row=>sidebarAction('threadPin',row.key,!pinnedThreads[row.key]),attachments:()=>({skill:pendingSkill,images:pendingImages}),restoreAttachments:attachments=>{pendingSkill=attachments.skill&&typeof attachments.skill.name==='string'&&typeof attachments.skill.path==='string'?{name:attachments.skill.name,path:attachments.skill.path}:null;pendingImages=Array.isArray(attachments.images)?attachments.images.filter(image=>image?.type==='image'&&typeof image.url==='string'&&/^data:image\/(?:png|jpeg|webp);base64,/.test(image.url)).map(image=>({type:'image',url:image.url})):[];paintCommandOptions();},options:()=>commandOptions,reasoningOptions,restoreComposer:composer=>modelSelection.restore(composer),restoreOptions:options=>{commandOptions={...options};if(selected)delete commandOptions.cwd;localStorage.setItem('codex-command-options:'+(inputScope()||'new'),JSON.stringify(commandOptions));paintCommandOptions();},activateDraftProfile:async id=>{if(id===profile)return;if(!profiles.some(row=>row.id===id)){notice('草稿对应的配置已移除，请重新选择配置');return;}profile=id;await modelCatalog();void account(id).catch(error=>notice(error.message));},selected:()=>selected,profile:()=>profile,rows:()=>rows,items:()=>displayedItems,open,renderThreads,transcript:()=>displayedItems.filter(item=>['userMessage','agentMessage'].includes(item.type)).map(item=>(item.type==='userMessage'?'用户':'Codex')+'：\n'+text(item)).join('\n\n'),preview:file=>preview(file,{mode:selected.mode,profile,threadId:selected.threadId}),clear:()=>{if(mobile.matches)sidebar(false);stopViewSettling?.();restoreView=null;selected=null;modelSelection.reset();desktopPages.reset();turnId=null;liveItems.clear();desktopSnapshot=null;void loadQueue();conversationUI.goal(null);render([]);$('title').textContent='新聊天';$('source').textContent='';stateLabel('');$('input').value='';$('access').value=defaultsPolicy.access;$('approval').value=defaultsPolicy.approval;$('access').syncAppearance();$('approval').syncAppearance();for(const id of ['send','input'])$(id).disabled=false;for(const id of ['steer','interrupt'])$(id).disabled=true;commandOptions={};pendingSkill=null;pendingImages=[];paintCommandOptions();localStorage.removeItem('codex-last-view'+(paneMode?':side':''));const address=new URL(location.href);for(const key of ['thread','profile','source','fresh'])address.searchParams.delete(key);history.replaceState(null,'',address);void prepareDraft().catch(()=>{});}});
$('input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.repeat&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229&&!matchMedia('(pointer:coarse)').matches){event.preventDefault();$('send').click();}});
$('input').addEventListener('paste',event=>{const files=[...event.clipboardData?.items||[]].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);if(!files.length)return;event.preventDefault();const plain=event.clipboardData.getData('text/plain');if(plain){$('input').setRangeText(plain,$('input').selectionStart,$('input').selectionEnd,'end');$('input').dispatchEvent(new Event('input',{bubbles:true}));}const tab=workspace.activeId();pendingPaste=Promise.all(files.map(imageInput)).then(images=>{if(workspace.activeId()!==tab)return;if(pendingImages.length+images.length>8)throw Error('单条消息最多附加 8 张图片');pendingImages.push(...images);paintCommandOptions();workspace.saveDraft();}).catch(error=>notice('粘贴图片失败：'+error.message));});
for(const button of document.querySelectorAll('[data-prompt]'))button.onclick=()=>{$('input').value=button.dataset.prompt;$('input').focus();};
async function open(row,{restorePosition=true,carryDraft=false}={}){
  // Creating a chat must transfer the whole composer before selection restores
  // an empty draft. Do this synchronously, before loading the new conversation.
  const carriedDraft=carryDraft?{text:$('input').value,skill:pendingSkill,images:[...pendingImages]}:null;
  predictions.clear();
  stopViewSettling?.();stopViewSettling=null;saveView();clearTimeout(viewTimer);if(workspace.matchesSelection(selected))workspace.saveDraft();
  const previousProfile=profile;
  row={...row};
  const load=beginViewLoad('正在加载会话…');
  selected=row;webQuestionTurns=[];modelSelection.reset(true);chatStateReady=false;awaitingDesktopStart=false;feedbackThreads.delete(row.key);desktopPages.reset();commandMenu.close();conversationUI.goal(null);turnId=null;liveItems.clear();$('title').textContent=(row.name||'会话').slice(0,60);const web=row.sources.includes('desktop')?null:(row.availableSources?.find(source=>source.startsWith('web:'))||row.sources.find(s=>s.startsWith('web:')));selected.mode=web?'web':'desktop';if(web)profile=web.slice(4);void loadQueue();restoreCommandOptions();workspace.selected(row);if(carriedDraft){$('input').value=carriedDraft.text;pendingSkill=carriedDraft.skill;pendingImages=carriedDraft.images;paintCommandOptions();workspace.saveDraft();}$('source').textContent=selected.mode==='web'?'网页':'桌面';$('source').title=selected.mode==='web'?(row.accountMismatch?'网页实例 · 请切换回原账号':row.offline?'网页实例 · 连接中':'网页原生实例'):row.accountMismatch?'桌面实例 · 请切换回原账号':'桌面实例';void refreshGoal();
  const scope=inputScope();restoreView={scope,saved:restorePosition?storedView(scope):null,ready:false};try{localStorage.setItem('codex-last-view'+(paneMode?':side':''),JSON.stringify({threadId:row.threadId,key:row.key,principal:row.principal,profile,mode:selected.mode}));}catch{}const address=new URL(location.href);address.searchParams.set('thread',row.threadId);if(selected.mode==='web'){address.searchParams.set('profile',profile);address.searchParams.delete('source');}else address.searchParams.set('source','desktop');history.replaceState(null,'',address);
  if(mobile.matches)sidebar(false);renderThreads();for(const id of ['rename','fork','archive'])$(id).disabled=(selected.mode==='desktop'&&id!=='archive')||!!row.protected||row.conflict||row.accountMismatch;
  desktopMessages=[];desktopSnapshot=null;desktopMessageStamp='';
  renderRequests([],row.mode==='desktop');render([]);stateLabel('');
  $('input').disabled=false;setThreadReady(false);
  try{
    const pref=await loadingApi(`/codex-api/v1/session-preferences/${encodeURIComponent(row.mode==='web'?`web:${profile}:${row.threadId}`:`desktop:${row.threadId}`)}`);
    if(selected!==row)return;
    $('access').value=pref.access;$('approval').value=pref.approval;$('access').syncAppearance();$('approval').syncAppearance();
    let resumeGeneration=null,resumeRevision=null;
    const catalog=modelCatalog();void catalog.catch(()=>{});
    if(row.mode==='web'&&profile!==previousProfile)void account(profile).catch(error=>notice(error.message));
    commandSkills=[];void refreshCommandSkills().catch(error=>{if(selected===row)notice('技能读取失败：'+error.message);});
    if(row.mode==='desktop'){
      paintLoad(loadBanner,'正在读取桌面聊天记录…',{busy:true});
      desktopPages.reset(row);
      await Promise.all([refreshDesktopMessages(),desktopPages.start()]);
    }else{
      paintLoad(loadBanner,'正在打开网页会话…',{busy:true});
      const generation=liveReady?liveGeneration:null,revision=webStateRevision;
      const resumed=await rpc('thread/resume',{threadId:row.threadId},profile,loadingApi);
      if(selected!==row||load.signal.aborted)return;
      modelSelection.actual(resumed);
      if(resumed.thread?.id===row.threadId&&Array.isArray(resumed.thread.turns)){
        await read(true,resumed);
        resumeGeneration=generation;resumeRevision=revision;
      }
    }
    if(selected!==row)return;
    await catalog;
    if(selected!==row)return;
    const pending=restoreView;
    if(row.mode==='desktop'&&pending?.scope===scope&&pending.saved&&!pending.saved.bottom)await desktopPages.restoreCount(pending.saved.historyCount||0);
    if(selected!==row)return;
    await connectThread(row,load,resumeGeneration,resumeRevision);
    if(selected!==row)return;
    readyThread=row;setThreadReady(true);
    finishViewLoad(load);
    if(pending&&restoreView===pending){
      pending.ready=true;render(renderStreaming.frame?renderStreaming.items:displayedItems);
      stopViewSettling=settleChatView($('messages'),pending.saved,()=>{if(restoreView===pending)restoreView=null;});
    }else render(renderStreaming.frame?renderStreaming.items:displayedItems);
  }catch(error){
    if(selected!==row)return;
    setThreadReady(false);
    finishViewLoad(load,'会话未就绪 · '+error.message,()=>void open(row).catch(()=>{}));
    throw error;
  }
}
function setThreadReady(ready){
 chatStateReady=ready;
 const blocked=!ready||selected?.protected||selected?.conflict||selected?.accountMismatch;
 for(const id of ['send','steer'])$(id).disabled=!!blocked;
 paintQueue();
}
async function connectThread(row,load,snapshotGeneration=null,snapshotRevision=null){
 const desktop=row.mode==='desktop';
 while(selected===row&&!load.signal.aborted){
   paintLoad(loadBanner,desktop?'正在连接桌面会话…':'正在连接实时消息…',{busy:true});
   await waitForLive(liveEvents,()=>liveReady,load.signal,'实时连接尚未就绪');
   if(selected!==row||load.signal.aborted)return;
   const generation=liveGeneration;
   if(desktop){
     const response=await loadingApi(`/codex-api/v1/desktop/${row.threadId}/follow`,{});
     if(selected!==row||load.signal.aborted)return;
     if(response.state&&!desktopSnapshot)desktopState(response.state);
     await waitForLive(liveEvents,()=>!!desktopSnapshot||liveGeneration!==generation,load.signal,'桌面尚未同步当前会话');
   }else{
     paintLoad(loadBanner,'正在同步聊天记录…',{busy:true});
     if(snapshotGeneration!==generation||snapshotRevision!==webStateRevision)await read(true);
   }
   if(liveReady&&generation===liveGeneration)return;
   if(desktop)desktopSnapshot=null;
 }
}
async function reconnectThread(row){
 if(selected!==row)return;
 const load=beginViewLoad('实时连接中断，正在重连…');
 $('messages').querySelector('[data-item="empty-chat"]')?.remove();
 setThreadReady(false);
 if(row.mode==='desktop')desktopSnapshot=null;
 try{
   await connectThread(row,load);
   if(selected!==row||load.signal.aborted)return;
   setThreadReady(true);finishViewLoad(load);render(renderStreaming.frame?renderStreaming.items:displayedItems);
 }catch(error){
   if(selected===row)finishViewLoad(load,'实时同步失败 · '+error.message,()=>void reconnectThread(row));
 }
}

let webReadEpoch=0,replyHydrationPending=false;
async function read(initial=false,snapshot){if(!selected||selected.mode!=='web'||!initial&&!chatStateReady)return;const epoch=++webReadEpoch,target=selected,activeProfile=profile;const result=snapshot??await rpc('thread/read',{threadId:target.threadId,includeTurns:true},activeProfile,loadingApi);if(selected!==target||profile!==activeProfile||epoch!==webReadEpoch)return;const thread=result.thread;if(thread?.id!==target.threadId||!Array.isArray(thread.turns))throw Error('未收到当前会话的聊天记录');webQuestionTurns=thread.turns;modelSelection.actual(result);if(thread.webTokenUsage)threadUsage.set(target.threadId,thread.webTokenUsage);const previousActiveTurn=turnId,previousUsers=new Map(liveItems),retries=new Map([...liveItems.values()].filter(item=>item.type==='connectionRetry').map(item=>[item._turnId,item]));liveItems.clear();turnId=null;for(const turn of thread.turns||[]){if(turn.status==='inProgress')turnId=turn.id;const entries=turnItems(turn),retry=retries.get(turn.id),finalIndex=entries.findLastIndex(item=>item._replyComplete);if(retry)entries.splice(finalIndex<0?entries.length:finalIndex,0,{...retry,_turnStatus:turn.status});for(const item of entries)liveItems.set(item.id||crypto.randomUUID(),item);}turnId=turnId||retainUnpersistedTurn(liveItems,previousUsers,previousActiveTurn,thread.turns);mergeReplyRead(liveItems,previousUsers,{turns:thread.turns||[]});restoreLocalUsers(liveItems,previousUsers);render([...liveItems.values()]);paintQueue();stateLabel(thread.status?.type||'就绪');void requests().catch(error=>{if(selected===target)notice(error.message);});void drainQueue();}
function hasDesktopTimeline(state){return Array.isArray(state?.turns)||!!state?.turnHistory?.history;}
function desktopState(state,{streaming=false}={}){if(selected?.mode!=='desktop'||!hasDesktopTimeline(state))return;desktopSnapshot=state;if(!syncDesktopSettings.pending&&modelSelection.actual(state))void modelCatalog().catch(error=>notice(error.message));if(!syncDesktopSettings.pending){const actual=desktopComposerSettings(state);let changed=false;for(const [key,value]of [['collaborationMode',actual.mode],['serviceTier',actual.serviceTier]])if(value!==undefined&&commandOptions[key]!==value){commandOptions={...commandOptions,[key]:value};changed=true;}if(changed)paintCommandOptions();for(const [id,value]of [['access',actual.access],['approval',actual.approval]])if(value&&$(id).value!==value){$(id).value=value;$(id).syncAppearance();}$('approval').title=actual.granular?'App 当前使用精细审批规则；选择其他策略会更新桌面设置':'';}if(Object.hasOwn(state,'threadGoal'))conversationUI.goal(state.threadGoal||null);turnId=activeDesktopTurn(state);if(turnId||awaitingDesktopStart&&(desktopTurns(state).at(-1)?.turnId||desktopTurns(state).at(-1)?.id)!==awaitingDesktopStart)awaitingDesktopStart=false;paintQueue();const items=desktopTurns(state).flatMap(turn=>desktopTurnItems(turn,desktopMessages));(streaming?renderStreaming:render)(mergeDesktopHistory(desktopPages.items(),items));stateLabel(selected.protected?'当前管理会话：只读':limitedDesktopMode()?`桌面 · ${turnId?'执行中':'已连接'} · 仅文字，其他操作请用 App`:`桌面 · ${state.threadRuntimeStatus?.type||'已连接'}`);$('state').title=limitedDesktopMode()?limitedDesktopReason:'';renderRequests(state.requests||[],true);void drainQueue();}
async function requests(){const target=selected,id=profile;if(target?.mode!=='web')return;const pending=await loadingApi(`/codex-api/v1/codex/${id}/pending`);if(selected===target&&profile===id)renderRequests(pending,false);}
let renderedRequestsKey='';
function renderRequests(requests,desktopMode){
 if(desktopMode&&limitedDesktopMode()){$('requests').replaceChildren();return;}
  const target=selected,activeProfile=profile;const inline=inlineQuestionRequest(desktopMode?desktopTurns(desktopSnapshot):webQuestionTurns,target?.threadId);if(inline)requests=[...requests,inline];requests=requests.filter(request=>{const thread=request.params?.threadId||request.request?.params?.threadId||request.threadId;return request.completed!==true&&request.request?.completed!==true&&(!thread||thread===target?.threadId);});const key=JSON.stringify([target?.threadId,activeProfile,desktopMode,target?.protected,target?.accountMismatch,requests]);if(key===renderedRequestsKey)return;renderedRequestsKey=key;$('requests').replaceChildren();for(const request of requests){const panel=document.createElement('div');panel.className='card';const data=request.params||request.request?.params||request;const method=request.method||request.request?.method||'';const id=request.id??request.requestId;const title=document.createElement('h3');title.textContent=method.includes('requestUserInput')?'需要你的回答':'需要你的审批';panel.append(title);const details=document.createElement('pre');details.textContent=data.command||data.reason||data.message||JSON.stringify(data,null,2).slice(0,6000);panel.append(details);
    if(advancedRequest(panel,{data,method,notice,submit:result=>desktopMode?api(`/codex-api/v1/desktop/${target.threadId}/${method==='item/permissions/requestApproval'?'permissions':'mcp'}`,{requestId:id,response:result}):api(`/codex-api/v1/codex/${activeProfile}/answer`,{requestId:id,result})})){}
    else if(method.includes('requestUserInput')){details.remove();const fields=questionFields(panel,data.questions||[]);const answer=document.createElement('button');answer.textContent='提交回答';answer.onclick=async()=>{if(answer.disabled)return;answer.disabled=true;try{const result={answers:Object.fromEntries(fields.map(([key,value])=>{const answer=value();if(!answer)throw Error('请回答每个问题');return [key,{answers:[answer]}];}))};if(request.inline)await api(desktopMode?`/codex-api/v1/inline-questions/desktop/${target.threadId}`:`/codex-api/v1/inline-questions/web/${activeProfile}/${target.threadId}`,{turnId:data.turnId,answers:result.answers});else if(desktopMode)await api(`/codex-api/v1/desktop/${target.threadId}/question`,{requestId:id,response:result});else await api(`/codex-api/v1/codex/${activeProfile}/answer`,{requestId:id,result});panel.remove();if(!desktopMode)setTimeout(()=>read().catch(()=>{}),250);}catch(e){notice(e.message);answer.disabled=false;}};panel.append(answer);
    }else if(method.endsWith('/requestApproval')||method.includes('approval')){for(const [decision,name]of [['accept','批准'],['decline','拒绝']]){const button=document.createElement('button');button.textContent=name;button.className=decision==='decline'?'danger':'';button.onclick=async()=>{try{if(desktopMode)await api(`/codex-api/v1/desktop/${target.threadId}/${method.includes('file')||method.includes('File')?'file':'command'}`,{requestId:id,decision});else await api(`/codex-api/v1/codex/${activeProfile}/answer`,{requestId:id,result:{decision}});panel.remove();}catch(e){notice(e.message);}};panel.append(button);}}
    else{const p=document.createElement('p');p.textContent='此请求类型请在桌面处理；网页保留待处理状态。';panel.append(p);}if(selected?.protected||selected?.accountMismatch||selected?.conflict)panel.querySelectorAll('button,input,textarea,select').forEach(b=>b.disabled=true);$('requests').append(panel);
  }
}
async function savePolicy(target=selected,id=profile){if(!target)return;const policy={access:$('access').value,approval:$('approval').value};await syncDesktopSettings({policy},target);const key=target.mode==='web'?`web:${id}:${target.threadId}`:`desktop:${target.threadId}`;await api(`/codex-api/v1/sessions/${encodeURIComponent(key)}`,policy,'PUT');}
bind('new',()=>{workspace.newChat();});
bind('refresh',refresh);
function clearSentDraft(draft){if($('input').value.trim()!==draft.text||pendingImages.length!==(draft.images||[]).length||pendingImages.some((image,index)=>image.url!==draft.images[index].url))return;$('input').value='';composerSizing.refresh();pendingSkill=null;pendingImages=[];paintCommandOptions();workspace.saveDraft();}
async function drainQueue(){
 // Dispatch belongs exclusively to the server. Browser lifecycle and selected
 // chat only affect presentation, never whether queued messages are sent.
 await queueReady;try{await syncQueue();}catch{/* SSE and polling reconnect later. */}
}
async function submitSteering(draft){
 if(!selected||selected.protected||selected.conflict||selected.accountMismatch)throw Error('此会话不能插话');
 if(draft.skill)throw Error('带技能的消息暂不能改为插话');
 const target=selected,id=profile,activeTurn=turnId,scope=inputScope(),value=draft.text||'',input=[{type:'text',text:value},...(draft.images||[])];if(!activeTurn)throw Error('当前没有执行中的轮次');if(!value&&!draft.images?.length)throw Error('请输入追加指令或附加图片');
 const baseline=displayedItems.filter(item=>item.type==='userMessage'&&text(item)===value).length+pendingInputs(scope).filter(item=>item.text===value).length;
 const sentAt=Date.now(),afterItem=pendingInputs(scope).at(-1)?.id||displayedItems.at(-1)?.id;
 if(target.mode==='desktop')await api(`/codex-api/v1/desktop/${target.threadId}/steer`,{input});else await rpc('turn/steer',{threadId:target.threadId,expectedTurnId:activeTurn,input},id);
 markRecent(target.mode==='desktop'?'desktop':'web:'+id,target.threadId);
 if(value)rememberInput(scope,{id:'accepted:'+crypto.randomUUID(),type:'userMessage',text:value,_sentAt:sentAt,_baseline:baseline,_steering:true,_afterItem:afterItem,_turnId:activeTurn});
}
bind('send',async()=>{
 if(sendingTurn)return;if(!selected&&viewLoad)throw Error('新聊天正在准备，请稍候');if(selected&&!chatStateReady)throw Error('当前会话尚未就绪');if(!selected&&desktopProjectDrafts.has(workspace.activeId()))throw Error('正在创建桌面会话，请稍候');sendingTurn=true;
 try{
 await pendingPaste;
 if(selected?.mode==='desktop'&&syncDesktopSettings.pending)await syncDesktopSettings.tail;
 if(commandMenu.submit())return;
 const value=$('input').value.trim();if(!value&&!pendingImages.length)throw Error('请输入任务或粘贴图片');
 const draft={id:crypto.randomUUID(),text:value,images:[...pendingImages],skill:pendingSkill,params:modelParams(true),policy:{access:$('access').value,approval:$('approval').value},createdAt:Date.now()};
 const creation=modelParams(),draftOptions={...commandOptions},originalProfile=profile,originalTab=workspace.activeId();
 if(!selected){const result=await rpc('thread/start',creation,originalProfile);if(selected||profile!==originalProfile||workspace.activeId()!==originalTab)throw Error('聊天已切换，消息尚未发送');await api(`/codex-api/v1/sessions/${encodeURIComponent(`web:${originalProfile}:${result.thread.id}`)}`,draft.policy,'PUT');await refresh();if(selected||profile!==originalProfile||workspace.activeId()!==originalTab)throw Error('聊天已切换，消息尚未发送');await open(rows.find(r=>r.threadId===result.thread.id&&r.sources.includes('web:'+originalProfile))||{threadId:result.thread.id,name:'新会话',cwd:result.thread.cwd,sources:[`web:${originalProfile}`]},{carryDraft:true});if(selected?.threadId!==result.thread.id||profile!==originalProfile)throw Error('聊天已切换，消息尚未发送');commandOptions=draftOptions;delete commandOptions.cwd;workspace.saveDraft();localStorage.setItem('codex-command-options:'+(inputScope()||'new'),JSON.stringify(commandOptions));paintCommandOptions();}
 const target=selected;if(target.protected||target.conflict||target.accountMismatch)throw Error('此会话不能发送消息');
 if(limitedDesktopMode()){
  if(turnId)throw Error('请等待任务完成后发送；新版桌面不支持网站排队或插话');
  if(draft.images.length||draft.skill)throw Error('新版桌面仅支持文字，图片和技能请在 App 中发送');
  const key=target.threadId+':'+draft.text;if(!directDesktopRequests.has(key))directDesktopRequests.set(key,draft.id);
  await api(`/codex-api/v1/desktop/${target.threadId}/send`,{input:[{type:'text',text:draft.text}],requestId:directDesktopRequests.get(key)});
  directDesktopRequests.delete(key);if(selected===target)clearSentDraft(draft);await refreshDesktopMessages();return;
 }
 await queueReady;
 await changeQueue(items=>[...items,draft]);markRecent(target.mode==='desktop'?'desktop':'web:'+rowProfile(target),target.threadId);if(selected===target)clearSentDraft(draft);void drainQueue();
 }finally{sendingTurn=false;paintQueue();}
});
bind('steer',async()=>{await pendingPaste;const draft={text:$('input').value.trim(),images:[...pendingImages],skill:pendingSkill};await submitSteering(draft);clearSentDraft(draft);});
bind('interrupt',async()=>{
 const target=selected,control=currentTaskControl();if(!target||control.disabled)return;
 if(control.action==='continue'){
  sendingTurn=true;paintQueue();
  try{
   await queueReady;await syncQueue();if(target.mode==='desktop'&&syncDesktopSettings.pending)await syncDesktopSettings.tail;
   if(selected!==target)throw Error('会话已切换');
   if(target.mode==='desktop'){const response=await api(`/codex-api/v1/desktop/${target.threadId}/follow`,{});if(selected!==target)throw Error('会话已切换');if(!response.state)throw Error('等待桌面状态同步');desktopState(response.state);}else await read();
   const latest=currentTaskControl();
   if(selected!==target||latest.action!=='continue'||latest.turnId!==control.turnId||turnId||queued.length||target.protected||target.conflict||target.accountMismatch)throw Error('会话状态已变化，请确认后再继续');
   const result=target.mode==='desktop'?await api(`/codex-api/v1/desktop/${target.threadId}/send`,{input:[],turnTrigger:'resume_interrupted_task',expectedTurnId:control.turnId}):await rpc('turn/start',{threadId:target.threadId,input:[],turnTrigger:'resume_interrupted_task',...modelParams(true)});
   if(selected===target){if(result.turn?.id){turnId=result.turn.id;acceptStartedTurn(liveItems,result.turn);}else if(target.mode==='desktop'&&(desktopTurns(desktopSnapshot).at(-1)?.turnId||desktopTurns(desktopSnapshot).at(-1)?.id)===control.turnId)awaitingDesktopStart=control.turnId;}
   markRecent(target.mode==='desktop'?'desktop':'web:'+rowProfile(target),target.threadId);
  }finally{sendingTurn=false;paintQueue();}
  return;
 }
 const expectedTurnId=control.turnId;if(!expectedTurnId||!confirm('确认中断当前任务？'))return;if(selected!==target||turnId!==expectedTurnId)throw Error('当前轮次已变化，请重新确认');if(target.mode==='desktop')await api(`/codex-api/v1/desktop/${target.threadId}/interrupt`,{expectedTurnId});else await rpc('turn/interrupt',{threadId:target.threadId,turnId:expectedTurnId});
});
for(const id of ['access','approval'])$(id).onchange=()=>savePolicy().then(()=>notice('策略已保存，下次发送时应用')).catch(e=>notice(e.message));
function providerFields(){const provider=$('provider').value;$('base-url').closest('label').hidden=provider!=='custom';$('api-key').closest('label').hidden=provider==='chatgpt';$('model').placeholder=provider==='custom'?'输入服务支持的模型 ID（必填）':'留空使用原生默认模型';}
$('provider').onchange=()=>{$('api-key').value='';providerFields();};
function fillProfile(){const row=profiles.find(p=>p.id===$('profile').value);if(!row)return;settingsProfile=row.id;subscription.clear();$('profile-name').value=row.name;$('provider').value=row.provider;$('model').value=row.model||'';$('base-url').value=row.baseUrl||'';$('cwd').value=row.cwd||'';$('api-key').value='';$('device-login').dataset.providerDisabled=String(row.provider!=='chatgpt');login.paint();providerFields();void profileUI.refresh().catch(error=>notice(error.message));}
function isPlanProfile(id=settingsProfile){return (profiles.find(row=>row.id===id)?.provider||'chatgpt')==='chatgpt';}
const subscription=subscriptionUI({box:$('account-subscription'),api,selection:()=>settingsProfile,isPlan:isPlanProfile,button:$('refresh-subscription'),refreshAccount:id=>rpc('account/read',{refreshToken:true},id),notice});
async function account(id=settingsProfile){if(id===settingsProfile)subscription.clear();let label;if(!isPlanProfile(id))label=profiles.find(row=>row.id===id)?.provider==='custom'?'自定义服务 · 在模型提供方管理连接':'OpenAI API · 在模型提供方管理密钥';else{const result=await rpc('account/read',{refreshToken:false},id),a=result.account,plan=a?.planType||a?.chatgptPlanType;label=a?.type==='apiKey'?'请登录 ChatGPT 账号（当前为 API 凭据）':a?`${a.email||a.type||'已登录'}${plan?' · '+plan:''}`:'尚未登录网页账号';}if(id===profile)$('account-label').textContent=label;if(id!==settingsProfile)return;$('account-info').textContent=label;await subscription.refresh(id);}
function modelParams(forTurn=false){const mode=commandOptions.collaborationMode||'default',model=$('composer-model').value;return {...(!forTurn&&commandOptions.cwd?{cwd:normalizeProjectDirectory(commandOptions.cwd)}:{}),...(commandOptions.serviceTier?{serviceTier:commandOptions.serviceTier}:{}),...(forTurn&&model?{collaborationMode:{mode,settings:{model,reasoning_effort:$('reasoning').value||null,developer_instructions:null}}}:{}),...($('composer-model').value?{model:$('composer-model').value}:{}),...($('reasoning').value?{effort:$('reasoning').value}:{})};}
const defaultsUI=newChatDefaultsUI($);
const modelSelection=composerModelSelection($('composer-model'),$('reasoning'));let catalogEpoch=0;
function reasoningOptions(){modelSelection.chooseModel($('composer-model').value);}
async function modelCatalog(id=selected?.mode==='desktop'?'default':profile){
 if(limitedDesktopMode()){models=[];$('composer-model').replaceChildren(new Option('沿用 App 模型',''));$('reasoning').replaceChildren(new Option('沿用 App 推理',''));return;}
 const epoch=++catalogEpoch,scope=inputScope();
 const cwd=selected?.cwd||commandOptions.cwd;
 const [catalog,settings]=selected?.mode==='desktop'?[await loadingApi('/codex-api/v1/desktop-models'),{}]:await Promise.all([rpc('model/list',{},id,loadingApi),loadingApi('/codex-api/v1/model-settings/'+encodeURIComponent(id)+(cwd?'?cwd='+encodeURIComponent(cwd):'')).catch(()=>({}))]);
 if(epoch!==catalogEpoch||scope!==inputScope())return;
 models=catalog.data||[];modelSelection.catalog(models,selected?settings:defaultModelSettings(settings,defaultsPolicy));
 if(!selected&&commandOptions.serviceTier===undefined){const tier=defaultSpeed(defaultsPolicy,models.find(entry=>entry.model===$('composer-model').value));if(tier)commandOptions.serviceTier=tier;paintCommandOptions();}
}
$('composer-model').onchange=()=>{reasoningOptions();workspace.saveDraft();void syncDesktopSettings({model:$('composer-model').value,effort:$('reasoning').value||null}).catch(error=>notice(error.message));void modelCatalog().catch(error=>notice(error.message));};
$('reasoning').onchange=()=>{modelSelection.chooseEffort($('reasoning').value);workspace.saveDraft();void syncDesktopSettings({effort:$('reasoning').value||null}).catch(error=>notice(error.message));};

function webConversation(){if(!selected||selected.mode!=='web'||selected.protected||selected.conflict)throw Error('此操作只适用于网页持有的会话');}
bind('rename',async()=>{webConversation();const name=prompt('会话名称',selected.name);if(!name?.trim())return;await rpc('thread/name/set',{threadId:selected.threadId,name:name.trim()});selected.name=name.trim();$('title').textContent=selected.name;await refresh();});
bind('fork',async()=>{webConversation();const result=await rpc('thread/fork',{threadId:selected.threadId});await refresh();await open(rows.find(r=>r.threadId===result.thread.id)||{threadId:result.thread.id,name:'分支会话',cwd:result.thread.cwd,sources:[`web:${profile}`]});});
bind('archive',async()=>{if(selected?.mode==='desktop'){await archiveRow(selected);return;}webConversation();if(!confirm('归档当前会话？历史会保留。'))return;await rpc('thread/archive',{threadId:selected.threadId});cancelViewLoad();selected=null;liveItems.clear();void loadQueue();render([]);$('title').textContent='Codex';$('source').textContent='';stateLabel('已归档');await refresh();});
async function selectSettingsProfile(id){profiles=await api('/codex-api/v1/profiles');if(!profiles.some(row=>row.id===profile)){workspace.newChat();profile='default';await modelCatalog();} $('profile').replaceChildren();for(const p of profiles)$('profile').append(new Option(p.name,p.id));$('profile').value=id;fillProfile();await account();await settingsInfo();}
const profileUI=profileManagementUI({$,selection:()=>settingsProfile,select:selectSettingsProfile,notice,useProfile:async id=>{
 workspace.newChat();profile=id;commandOptions={};pendingSkill=null;pendingImages=[];paintCommandOptions();$('composer-model').value='';$('reasoning').value='';await modelCatalog();await account(id);
 const result=await rpc('thread/start',{});await refresh();await open(rows.find(row=>row.threadId===result.thread.id)||{threadId:result.thread.id,name:'新聊天',cwd:result.thread.cwd,sources:['web:'+id]});closeLayer($('account-modal'),()=>{$('account-modal').style.display='none';});
}});
bind('account',async()=>{$('account-modal').style.display='flex';openLayer($('account-modal'));$('close-account').focus();await selectSettingsProfile(profile);const skills=await rpc('skills/list',{},settingsProfile);$('skills').textContent=(skills.data||[]).flatMap(r=>(r.skills||[]).map(s=>s.name)).join('\n')||'暂无技能';});
bind('close-account',()=>{closeLayer($('account-modal'),()=>{$('account-modal').style.display='none';});$('account').focus();});$('profile').onchange=()=>{fillProfile();account().then(settingsInfo).catch(e=>notice(e.message));};
for(const tab of document.querySelectorAll('[data-settings]'))tab.onclick=()=>{for(const button of document.querySelectorAll('[data-settings]')){button.classList.toggle('active',button===tab);button.setAttribute('aria-pressed',String(button===tab));}for(const panel of document.querySelectorAll('[data-panel]'))panel.hidden=panel.dataset.panel!==tab.dataset.settings;document.querySelector('.settings-scroll').scrollTop=0;};
function settingsRow(parent,label,value){const row=document.createElement('div');row.className='settings-stat';const name=document.createElement('span');name.textContent=label;const detail=document.createElement('strong');detail.textContent=value??'未提供';row.append(name,detail);parent.append(row);}
const quotaDate=value=>value?new Date(value*1000).toLocaleString('zh-CN',{hourCycle:'h23'}):'未提供';
async function limits(){const id=settingsProfile,box=$('rate-limits');if(!isPlanProfile(id)){box.textContent='此配置使用 API，额度与费用由模型服务商管理。';return;}box.textContent='正在读取…';try{const result=await rpc('account/rateLimits/read',{},id);if(id!==settingsProfile)return;box.replaceChildren();const buckets=result.rateLimitsByLimitId||{codex:result.rateLimits};for(const [name,bucket]of Object.entries(buckets)){if(!bucket)continue;const card=document.createElement('div');card.className='quota-card';settingsRow(card,bucket.limitName||name,(bucket.planType||'').toUpperCase());for(const window of [bucket.primary,bucket.secondary].filter(Boolean)){const minutes=window.windowDurationMins;const label=minutes===10080?'每周额度':minutes===300?'5 小时额度':minutes?`${minutes} 分钟额度`:'额度窗口';settingsRow(card,label,`${Math.max(0,100-window.usedPercent)}% 剩余 · ${window.usedPercent}% 已用`);const meter=document.createElement('progress');meter.max=100;meter.value=Math.max(0,100-window.usedPercent);meter.setAttribute('aria-label',label+'剩余');card.append(meter);settingsRow(card,'自动恢复时间',quotaDate(window.resetsAt));}if(bucket.credits)settingsRow(card,'额外余额',bucket.credits.unlimited?'不限额':bucket.credits.balance||'0');if(bucket.individualLimit){const item=bucket.individualLimit;settingsRow(card,'月度额度',`${item.used} / ${item.limit}`);settingsRow(card,'月度恢复时间',quotaDate(item.resetsAt));}box.append(card);}const note=document.createElement('p');note.className='muted';note.textContent='窗口比例与账户累计 Token 分别展示；账单金额未由此接口提供。';box.append(note);}catch(error){box.textContent='暂时无法读取额度：'+error.message;}}
const sandboxUI=sandboxSettings({api,currentProfile:()=>settingsProfile,refresh:settingsInfo,notice});
async function settingsInfo(){const id=settingsProfile;const [preferences,status,sandbox]=await Promise.all([api('/codex-api/v1/new-chat-defaults'),api('/codex-api/v1/status'),rpc('windowsSandbox/readiness',{},id).catch(()=>({status:'unavailable'}))]);if(id!==settingsProfile)return;defaultsPolicy=preferences.defaults;applyAppearance(preferences.appearance);$('default-access').value=preferences.defaults.access;$('default-approval').value=preferences.defaults.approval;const [defaultCatalog,defaultNative]=await Promise.all([rpc('model/list',{},id),api('/codex-api/v1/model-settings/'+encodeURIComponent(id)).catch(()=>({}))]);if(id!==settingsProfile)return;defaultsUI.paint(defaultCatalog.data||[],defaultNative,defaultsPolicy);const runtime=status.codex.find(row=>row.id===id);login.sync(id,runtime);sandboxUI.update(runtime,sandbox);$('runtime-info').replaceChildren();for(const [label,value]of [['当前实例',runtime?.name],['运行状态',runtime?.running?'运行中':'未启动'],['进程 PID',runtime?.pid],['运行中的任务',runtime?.active],['待审批',runtime?.approvals],['模型来源',runtime?.provider],['默认模型',runtime?.model||'原生默认'],['工作目录',runtime?.cwd],['启动时间',runtime?.startedAt?new Date(runtime.startedAt).toLocaleString('zh-CN',{hourCycle:'h23'}):null],['Windows 沙箱',{ready:'已就绪',notConfigured:'未配置，命令执行可能不可用',updateRequired:'需要更新',unavailable:'状态读取失败'}[sandbox.status]||'未知状态'],['内核更新','由部署配置指定']])settingsRow($('runtime-info'),label,value);await Promise.all([limits(),usage()]);}
async function usage(){const id=settingsProfile,box=$('account-usage');if(!isPlanProfile(id)){box.textContent='当前接口未提供该 API 的账户累计用量。';return;}box.replaceChildren();try{const result=await rpc('account/usage/read',{},id);if(id!==settingsProfile)return;const summary=result.summary||{};for(const [label,key,suffix]of [['累计 Token','lifetimeTokens',''],['单日最高 Token','peakDailyTokens',''],['最长任务','longestRunningTurnSec',' 秒'],['当前连续使用','currentStreakDays',' 天'],['最长连续使用','longestStreakDays',' 天']])settingsRow(box,label,summary[key]==null?'未提供':Number(summary[key]).toLocaleString()+suffix);if(result.dailyUsageBuckets?.length){const details=document.createElement('details');details.className='daily-usage';const heading=document.createElement('summary');heading.textContent='每日 Token 用量';details.append(heading);for(const bucket of [...result.dailyUsageBuckets].sort((a,b)=>b.startDate.localeCompare(a.startDate)).slice(0,31))settingsRow(details,bucket.startDate,Number(bucket.tokens).toLocaleString());box.append(details);}}catch(error){box.textContent='账户用量暂不可用：'+error.message;}}
bind('refresh-limits',async()=>{await Promise.all([subscription.refresh(),limits(),usage()]);});
bind('save-defaults',async()=>{defaultsPolicy=(await api('/codex-api/v1/new-chat-defaults',{access:$('default-access').value,approval:$('default-approval').value,...defaultsUI.value()},'PUT')).defaults;notice('默认设置已保存，对新会话生效');});
mountAppearanceSettings(document);
function applyAppearance(value){
 const appearance=applyAppearanceStyles(document.body,value);
 for(const field of appearanceFields)$(field.id).value=String(appearance[field.key]/(field.inputScale||1));
}
for(const field of appearanceFields)$(field.id).onchange=async()=>{try{const input=Number($(field.id).value),value=field.inputScale?Math.round(input*field.inputScale):input;applyAppearance(await api('/codex-api/v1/appearance',{[field.key]:value},'PUT'));}catch(error){notice(error.message);}};
bind('reset-width',async()=>applyAppearance(await api('/codex-api/v1/appearance',{columnWidth:780},'PUT')));
for(const handle of document.querySelectorAll('.column-handle')){
  handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();const bounds=document.querySelector('.column-handles').getBoundingClientRect(),startX=event.clientX,startWidth=bounds.width,previous=parseInt(getComputedStyle(document.body).getPropertyValue('--chat-column-width'))||780,maxWidth=Math.min(1440,Math.floor(document.querySelector('.app-main').clientWidth-48));if(maxWidth<480)return;let width=previous;handle.setPointerCapture(event.pointerId);document.body.classList.add('resizing-column');const move=event=>{width=Math.round(Math.max(480,Math.min(maxWidth,startWidth+(event.clientX-startX)*(handle.dataset.side==='right'?2:-2))));document.body.style.setProperty('--chat-column-width',width+'px');$('column-width').value=String(width);};const finish=async event=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',finish);handle.removeEventListener('pointercancel',finish);document.body.classList.remove('resizing-column');if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);if(event.type==='pointercancel'){document.body.style.setProperty('--chat-column-width',previous+'px');return;}try{applyAppearance(await api('/codex-api/v1/appearance',{columnWidth:width},'PUT'));}catch(error){document.body.style.setProperty('--chat-column-width',previous+'px');notice(error.message);}};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);});
  handle.addEventListener('dblclick',()=>$('reset-width').click());
  handle.addEventListener('keydown',async event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const current=parseInt(getComputedStyle(document.body).getPropertyValue('--chat-column-width'))||780,direction=(event.key==='ArrowRight'?1:-1)*(handle.dataset.side==='right'?1:-1);try{applyAppearance(await api('/codex-api/v1/appearance',{columnWidth:Math.max(480,Math.min(1440,current+direction*20))},'PUT'));}catch(error){notice(error.message);}});
}
$('account-modal').addEventListener('click',event=>{if(event.target===$('account-modal'))$('close-account').click();});
$('account-modal').addEventListener('keydown',event=>{if(event.key!=='Tab')return;const focusable=[...$('account-modal').querySelectorAll('button,input,select,a[href]')].filter(element=>!element.disabled&&element.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}});
const login=loginFlow({rpc,currentProfile:()=>settingsProfile,container:$('login-code'),loginButton:$('device-login'),logoutButton:$('account-logout')});$('login-code').addEventListener('login-error',event=>notice(event.detail));
bind('device-login',()=>login.start());
bind('account-logout',async()=>{if(!confirm('确认退出网页实例的账号？桌面账号保持。'))return;await rpc('account/logout',{},settingsProfile);await account();});
bind('save-profile',async()=>{await api('/codex-api/v1/profiles',{id:settingsProfile,name:$('profile-name').value,provider:$('provider').value,model:$('model').value,baseUrl:$('base-url').value,apiKey:$('provider').value!=='chatgpt'?$('api-key').value:undefined,cwd:$('cwd').value},'PUT');$('api-key').value='';notice('配置已保存，网页实例下次启动后生效');});
const events=new EventSource('/codex-api/v1/events');events.addEventListener('project-notifications',()=>void projectNotices.refresh());
events.addEventListener('codex',event=>{const update=JSON.parse(event.data);if(update.profile===profile&&update.method==='thread/prediction/updated')predictions.notification(update.params);});
events.addEventListener('composer-queue',event=>{const update=JSON.parse(event.data);if(update.scope===queueScope)void syncQueue().catch(()=>{});});
events.addEventListener('composer-queue-dispatch',event=>{const update=JSON.parse(event.data);if(update.scope!==currentQueueScope()||selected?.mode!=='web')return;acceptQueuedUser(liveItems,update.draft);render([...liveItems.values()]);});
events.addEventListener('composer-queue-send-uncertain',event=>{const update=JSON.parse(event.data);if(update.scope!==currentQueueScope()||selected?.mode!=='web')return;const item=[...liveItems.values()].find(item=>item._queueId===update.id&&!item._turnId);if(item){item._deliveryStatus='uncertain';render([...liveItems.values()]);}});
events.addEventListener('composer-queue-sent',event=>{const update=JSON.parse(event.data);if(update.scope!==queueScope)return;if(selected?.mode==='web'){if(update.turn?.id){if(update.draft)acceptQueuedUser(liveItems,update.draft,update.turn.id);acceptStartedTurn(liveItems,update.turn,{queueId:update.draft?.id});turnId=update.turn.status==='completed'?null:update.turn.id;render([...liveItems.values()]);}void read().catch(()=>{});}else void refreshDesktopMessages().catch(()=>{});});
events.addEventListener('open',()=>void syncQueue().catch(()=>{}));
setInterval(()=>void syncQueue().catch(()=>{}),5000);
// Queue reconciliation recovers a missed start; active reads also recover a
// missed completion without resending anything or requiring a page reload.
let activeReadPending=false;
setInterval(()=>{if(selected?.mode!=='web'||!turnId||viewLoad||activeReadPending)return;activeReadPending=true;void read().catch(()=>{}).finally(()=>{activeReadPending=false;});},3000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncQueue().catch(()=>{});});
function markFeedback(source,threadId){const row=rows.find(row=>row.threadId===threadId&&row.sources.includes(source));if(row&&selected?.key!==row.key&&!feedbackThreads.has(row.key)){feedbackThreads.add(row.key);renderThreads();}}
events.addEventListener('codex',event=>{const x=JSON.parse(event.data);if(x.method==='account/login/completed'){login.completed(x.profile);if(x.profile===settingsProfile){account().then(settingsInfo).catch(()=>{});$('login-code').replaceChildren();notice(x.params?.success?'账号登录成功':'账号登录未完成');}void refresh().catch(()=>{});}const eventThread=x.params?.threadId;if(eventThread){if(isRecentCodexMessage(x))markRecent('web:'+x.profile,eventThread);if(x.method==='item/agentMessage/delta'||x.method==='item/completed'&&x.params?.item?.type==='agentMessage')markFeedback('web:'+x.profile,eventThread);if(['turn/started','turn/completed'].includes(x.method)){const row=rows.find(row=>row.threadId===eventThread&&row.sources.includes('web:'+x.profile));if(row){row.running=x.method==='turn/started';renderThreads();}void refresh().catch(()=>{});}if(x.id!==undefined||x.method==='serverRequest/resolved')void refresh().catch(()=>{});}if(x.profile!==profile)return;if(!selected||selected.mode!=='web'||(eventThread&&eventThread!==selected.threadId))return;
  if(['turn/started','turn/completed','error'].includes(x.method))webStateRevision++;
  if(x.method==='error'&&(x.params?.willRetry||liveItems.has('retry:'+x.params?.turnId))){if(x.params?.willRetry)discardReplyDrafts(liveItems,x.params);recordConnectionError(liveItems,{...x.params,startedAt:[...liveItems.values()].find(item=>item._turnId===x.params?.turnId)?._processingStartedAt});renderStreaming([...liveItems.values()]);}
  if(x.method==='turn/started'){acceptStartedTurn(liveItems,x.params.turn);turnId=x.params.turn.id;paintQueue();stateLabel('执行中');liveItems.set('thinking:'+turnId,{type:'reasoning',_running:true,_turnId:turnId,_turnStatus:'inProgress',_processingStartedAt:x.params.turn.startedAt??Date.now()});renderStreaming([...liveItems.values()]);}
  if(x.method==='item/started'||x.method==='item/completed'){const timing=[...liveItems.values()].find(item=>item._turnId===(x.params.turnId||turnId)&&item._processingStartedAt);liveItems.delete('thinking:'+turnId);const item={...x.params.item,_turnId:x.params.turnId||turnId,_turnStatus:'inProgress',_processingStartedAt:timing?._processingStartedAt??Date.now(),_replyComplete:false,_running:x.method==='item/started'};const old=liveItems.get(item.id);if(old?._sentAt)item._sentAt=old._sentAt;if(item.type==='userMessage')acceptNativeUser(liveItems,item);else acceptReplyItem(liveItems,item,{completed:x.method==='item/completed'});const retry=liveItems.get('retry:'+item._turnId);if(retry&&retry._turnStatus==='inProgress')liveItems.set(retry.id,{...retry,_turnStatus:'completed'});renderStreaming([...liveItems.values()]);}
  if(x.method==='thread/settings/updated')modelSelection.actual({latestThreadSettings:x.params.threadSettings});
  if(x.method==='item/reasoning/summaryTextDelta'){const item=liveItems.get(x.params.itemId)||{id:x.params.itemId,type:'reasoning',summary:[],_running:true,_turnId:x.params.turnId||turnId,_turnStatus:'inProgress',_processingStartedAt:[...liveItems.values()].find(item=>item._turnId===(x.params.turnId||turnId))?._processingStartedAt??Date.now()};item.summary=Array.isArray(item.summary)?item.summary:[];const index=x.params.summaryIndex||0;item.summary[index]=(item.summary[index]||'')+x.params.delta;liveItems.set(x.params.itemId,item);renderStreaming([...liveItems.values()]);}
  if(x.method==='item/agentMessage/delta'||x.method==='item/plan/delta'){const id=x.params.itemId;const item=liveItems.get(id)||{id,type:x.method==='item/plan/delta'?'plan':'agentMessage',text:'',_running:true,_turnId:x.params.turnId||turnId,_turnStatus:'inProgress',_processingStartedAt:[...liveItems.values()].find(item=>item._turnId===(x.params.turnId||turnId))?._processingStartedAt??Date.now()};const updated=appendReplyDelta(liveItems,{...x.params,turnId:x.params.turnId||turnId},item.type);if(updated?._replyGap||updated?._textOffset){if(!replyHydrationPending){replyHydrationPending=true;void read().catch(()=>{}).finally(()=>{replyHydrationPending=false;});}}renderStreaming([...liveItems.values()]);}
  if(x.method==='thread/tokenUsage/updated')threadUsage.set(x.params.threadId,x.params.tokenUsage);if(x.method==='thread/goal/updated')conversationUI.goal(x.params.goal);if(x.method==='thread/goal/cleared')conversationUI.goal(null);if(x.method==='thread/compacted'){liveItems.set('compact:'+x.params.turnId,{id:'compact:'+x.params.turnId,type:'contextCompaction',_sentAt:Date.now()});renderStreaming([...liveItems.values()]);}
  if(x.method==='turn/completed'){turnId=null;paintQueue();read().catch(e=>notice(e.message));}
  if(x.params?.item?.questions?.length)void read().catch(()=>{});
  if(x.id!==undefined||x.method==='serverRequest/resolved')requests().catch(()=>{});
});
events.addEventListener('desktop',event=>{const x=JSON.parse(event.data),activity=desktopActivity(x.state),previous=desktopFeedback.get(x.threadId);desktopFeedback.set(x.threadId,activity.feedback);if(recentActivity.desktopChanged(x.threadId,x.state))markRecent('desktop',x.threadId);if(previous===undefined||activity.feedback!==previous)refreshAfterActivity();if(previous!==undefined&&activity.feedback!==previous)markFeedback('desktop',x.threadId);const row=rows.find(row=>row.threadId===x.threadId&&row.sources.includes('desktop'));if(row){const changed=row.running!==activity.running||row.needsAttention!==activity.needsAttention;row.running=activity.running;row.needsAttention=activity.needsAttention;if(changed){renderThreads();refreshAfterActivity();}}if(selected?.mode==='desktop'&&selected.threadId===x.threadId&&x.state){const oldUsers=desktopTurns(desktopSnapshot).flatMap(turn=>turn.items||[]).filter(item=>['userMessage','steeringUserMessage','steered'].includes(item.type)).map(item=>item.id).join('|');const newUsers=desktopTurns(x.state).flatMap(turn=>turn.items||[]).filter(item=>['userMessage','steeringUserMessage','steered'].includes(item.type)).map(item=>item.id).join('|');desktopState(x.state,{streaming:true});liveEvents.dispatchEvent(new Event('change'));if(oldUsers!==newUsers)refreshDesktopMessages().catch(()=>{});}});
events.addEventListener('message-edited',event=>{const update=JSON.parse(event.data);if(update.scope!==currentQueueScope())return;discardEditedTurn(update.replacedTurnId);if(selected?.mode==='web')void read().catch(()=>{});else void refreshDesktopMessages().catch(()=>{});});
events.addEventListener('desktop-offline',event=>{if(serviceCapabilities.desktop.capabilities?.transport==='app-tools-v1'&&JSON.parse(event.data||'{}').transport!=='app-tools-v1')return;for(const row of rows)if(row.sources.includes('desktop')){row.running=false;row.needsAttention=false;}renderThreads();if(selected?.mode==='desktop'){
 const row=selected;desktopSnapshot=null;stateLabel('桌面离线，不会自动接管');setThreadReady(false);
 if(!viewLoad&&row===readyThread)paintLoad(loadBanner,'桌面已离线 · 可查看已加载的聊天记录',{retry:()=>void reconnectThread(row)});
}});
events.addEventListener('ready',()=>{
 liveReady=true;liveGeneration++;liveEvents.dispatchEvent(new Event('change'));
 if(selected&&selected===readyThread&&!viewLoad&&!chatStateReady)void reconnectThread(selected);
});
events.addEventListener('error',()=>{
 const connected=liveReady;
 liveReady=false;
 if(connected&&selected&&!viewLoad&&chatStateReady)void reconnectThread(selected);
});
const query=new URLSearchParams(location.search);
// A new entry opens the latest messages; a reload keeps this reading position.
const restoreInitialPosition=['reload','back_forward'].includes(performance.getEntriesByType('navigation')[0]?.type);
let lastView;try{lastView=JSON.parse(localStorage.getItem('codex-last-view'+(paneMode?':side':''))||'null');}catch{}
if(query.get('profile'))profile=query.get('profile');
else if(!query.has('thread')&&lastView?.profile)profile=lastView.profile;
else if(!query.has('thread')&&workspace.draftProfile())profile=workspace.draftProfile();
paintLoad(loadBanner,'正在读取网页配置…',{busy:true});
await loadingApi('/codex-api/v1/application');profiles=await loadingApi('/codex-api/v1/profiles');
if(!profiles.some(row=>row.id===profile))profile='default';
const initialPreferences=await loadingApi('/codex-api/v1/new-chat-defaults');
defaultsPolicy=initialPreferences.defaults;sidebarOrder=initialPreferences.sidebarOrder||sidebarOrder;
projectNames=initialPreferences.projectNames||{};pinnedProjects=initialPreferences.pinnedProjects||{};pinnedThreads=initialPreferences.pinnedThreads||{};
applyAppearance(initialPreferences.appearance);
paintLoad(loadBanner,'正在加载项目与会话列表…',{busy:true});
await refresh();settingsProfile=profile;
void account().catch(error=>notice(error.message));
const requested=query.get('thread')||(query.has('fresh')?null:lastView?.threadId);
if(requested){
  const source=query.get('source'),explicit=query.has('thread'),row=savedChat(rows,{threadId:requested,key:explicit?undefined:lastView?.key,principal:explicit?undefined:lastView?.principal,mode:source==='desktop'?'desktop':query.has('profile')?'web':explicit?undefined:lastView?.mode,profile:source==='desktop'?undefined:query.get('profile')||(!explicit?lastView?.profile:undefined)});
  if(row)await open(row,{restorePosition:restoreInitialPosition}).catch(()=>{});
  else{const recovered=workspace.detachMissing(requested);notice(recovered?'原聊天未加载，未发送内容已保留为新聊天草稿':'此聊天未加载或存在多个账号来源，请从会话列表选择');}
}
if(!selected){
 if(requested)paintLoad(loadBanner,'未找到要打开的会话，请从项目列表选择');
 else paintLoad(loadBanner,'正在准备新聊天…',{busy:true});
 try{await modelCatalog();if(!requested)paintLoad(loadBanner,'');}
 catch(error){paintLoad(loadBanner,'新聊天配置加载失败 · '+error.message,{retry:()=>location.reload()});}
 void refreshCommandSkills().catch(()=>{});
}
if(!query.has('fresh'))await workspace.restoreDraft();
booting=false;delete document.body.dataset.booting;
$('sidebar').inert=mobile.matches;
document.querySelector('.chat-header').inert=false;
document.querySelector('.composer-wrap').inert=false;
setInterval(()=>refresh().catch(()=>{}),30000);setInterval(()=>refreshDesktopMessages().catch(()=>{}),3000);

setInterval(()=>refreshGoal().catch(()=>{}),5000);
