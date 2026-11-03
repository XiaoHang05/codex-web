import {projectIdentity} from './project-path.js';

export function projectNotificationControls({container,request,notice=()=>{},endpoint='/codex-api/v1/project-notifications'}){
  const sheet='/codex/project-notifications.css';if(!document.querySelector(`link[href="${sheet}"]`)){const link=document.createElement('link');link.rel='stylesheet';link.href=sheet;document.head.append(link);}
  container.classList.add('notification-project-panel');
  const heading=document.createElement('h3');heading.textContent='Codex 项目通知';
  const status=document.createElement('p');status.className='muted';status.setAttribute('role','status');
  const defaults=document.createElement('label');defaults.className='notification-project-default';
  const defaultToggle=document.createElement('input');defaultToggle.type='checkbox';defaultToggle.setAttribute('role','switch');defaultToggle.setAttribute('aria-label','新项目默认开启通知');
  defaults.append(defaultToggle,document.createTextNode('新项目默认开启通知'));
  const help=document.createElement('p');help.className='muted';help.textContent='默认值只影响之后出现的新项目；全部开启或关闭仅调整已有项目。';
  const actions=document.createElement('div');actions.className='notification-project-actions';
  const on=document.createElement('button'),off=document.createElement('button'),reload=document.createElement('button');
  on.textContent='开启全部项目';off.textContent='关闭全部项目';reload.textContent='刷新项目';
  for(const button of [on,off,reload]){button.type='button';button.className='secondary';actions.append(button);}
  const search=document.createElement('input');search.type='search';search.placeholder='搜索项目';search.setAttribute('aria-label','搜索通知项目');
  const list=document.createElement('div');list.className='notification-project-list';
  container.append(heading,status,defaults,help,actions,search,list);
  let state,busy=false,reading,epoch=0;const listeners=new Set();
  function paint(){
    for(const control of [defaultToggle,on,off,reload])control.disabled=busy||!state;
    defaultToggle.checked=state?.newProjectEnabled===true;
    for(const listener of listeners)listener();
    if(!state){status.textContent='正在读取项目通知…';return;}
    status.textContent=(!state.masterEnabled?'通知总开关已关闭，当前不发送通知。':!state.codexEnabled?'Codex 通知已关闭，当前不发送项目通知。':'项目通知生效；同时遵循事件、通道与设备接收设置。')+' 已开启 '+state.projects.filter(row=>row.enabled).length+' / '+state.projects.length+' 个项目';
    const query=search.value.trim().toLowerCase();list.replaceChildren();
    for(const row of state.projects.filter(row=>(row.name+' '+row.cwd).toLowerCase().includes(query))){
      const label=document.createElement('label');label.className='notification-project-row';
      const text=document.createElement('span'),name=document.createElement('strong'),directory=document.createElement('small');name.textContent=row.name;directory.textContent=row.cwd||'无项目目录';text.append(name,directory);
      const toggle=document.createElement('input');toggle.type='checkbox';toggle.setAttribute('role','switch');toggle.setAttribute('aria-label',row.name+' 项目通知');toggle.checked=row.enabled;toggle.disabled=busy;
      toggle.onchange=()=>void change({action:'project',key:row.key,enabled:toggle.checked});label.append(text,toggle);list.append(label);
    }
    if(!list.children.length){const empty=document.createElement('p');empty.className='muted';empty.textContent=query?'没有匹配的项目':'暂无项目，新项目将使用上方默认值。';list.append(empty);}
  }
  async function refresh(){
    if(busy)return;if(reading)return reading;
    const version=epoch;
    const pending=Promise.resolve().then(async()=>{try{const value=await request(endpoint);if(version===epoch){state=value;paint();}}catch(error){if(version===epoch)status.textContent='项目通知暂不可用：'+error.message;}finally{if(reading===pending)reading=null;}});
    reading=pending;return pending;
  }
  async function change(patch){
    if(busy||!state){paint();return;}const previous=state;epoch++;reading=null;busy=true;
    state={...state,...patch.action==='default'?{newProjectEnabled:patch.enabled}:{projects:state.projects.map(row=>patch.action==='all'||row.key===patch.key?{...row,enabled:patch.enabled}:row)}};
    paint();let error;
    try{state=await request(endpoint,{revision:previous.revision,...patch},'PUT');}
    catch(failure){error=failure;state=previous;}
    finally{busy=false;await refresh();paint();}
    if(error)notice(error.message);else notice('项目通知设置已生效'+(!state.masterEnabled?'；通知总开关已关闭，当前不发送通知':!state.codexEnabled?'；Codex 通知已关闭，当前不发送通知':''));
  }
  defaultToggle.onchange=()=>void change({action:'default',enabled:defaultToggle.checked});
  on.onclick=()=>void change({action:'all',enabled:true});off.onclick=()=>void change({action:'all',enabled:false});reload.onclick=()=>void refresh();search.oninput=paint;
  const key=cwd=>cwd&&cwd!=='未指定项目'?'path:'+projectIdentity(cwd):'unassigned';
  const enabled=cwd=>state?.projects.find(row=>row.key===key(cwd))?.enabled??state?.newProjectEnabled??true;
  window.addEventListener('focus',()=>void refresh());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  const timer=setInterval(()=>{if(!document.hidden)void refresh();},15000);
  paint();const ready=refresh();
  return {ready,refresh,enabled,status(cwd){return {enabled:enabled(cwd),loaded:!!state,busy,masterEnabled:state?.masterEnabled,codexEnabled:state?.codexEnabled};},subscribe(listener){listeners.add(listener);listener();return ()=>listeners.delete(listener);},async toggle(cwd){await ready;await change({action:'project',key:key(cwd),enabled:!enabled(cwd)});},close(){clearInterval(timer);listeners.clear();}};
}
