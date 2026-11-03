import {commandDialog} from './slash-commands.js';
import {groupProjectRows,normalizeProjectDirectory} from './project-path.js';
const folder='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';
const button=(label,action)=>{const node=document.createElement('button');node.type='button';node.textContent=label;node.onclick=action;return node;};
export function setActionDisabled(node,disabled=false){
 const result=typeof disabled==='function'?disabled():disabled;
 if(result&&typeof result.then==='function'){node.disabled=true;Promise.resolve(result).then(value=>{if(node.isConnected)node.disabled=!!value;}).catch(()=>{node.disabled=true;});}
 else node.disabled=!!result;
}
export function projectInfo({cwd,name,onNew,notice,actions:projectActions=[]}){
 cwd=normalizeProjectDirectory(cwd);
 const content=document.createElement('div');content.className='project-picker';
 const label=document.createElement('p');label.textContent=name||cwd.split(/[\\/]/).filter(Boolean).at(-1)||cwd;
 const path=document.createElement('code');path.className='project-full-path';path.textContent=cwd;
 const actions=document.createElement('div');actions.className='project-picker-actions';
 const dialog=commandDialog('项目目录',content);
 actions.append(button('复制路径',async()=>{try{await navigator.clipboard.writeText(cwd);notice('已复制目录路径');}catch{notice('复制失败，请选中路径复制');}}));
 const entries=projectActions.length?projectActions:onNew?[['在此项目新建会话',()=>onNew(cwd)]]:[];
 for(const [title,action,disabled=false]of entries){const node=button(title,async()=>{node.disabled=true;try{if(await action()!==false)dialog.leave();}catch(error){notice(error.message);}finally{setActionDisabled(node,disabled);}});setActionDisabled(node,disabled);actions.append(node);}
 content.append(label,path,actions);return dialog;
}
export function chooseProject({api,rows,current,onSelect,notice,source='web',desktopEnabled=true}){
 const content=document.createElement('div');content.className='project-picker';
 const description=document.createElement('p');description.className='muted';description.textContent='选择运行 Codex 的服务器上的目录，用于新会话。';
 const instanceLabel=document.createElement('label');instanceLabel.className='project-instance-label';instanceLabel.textContent='会话所属实例';
 instanceLabel.hidden=!desktopEnabled;
 const instance=document.createElement('select');instance.setAttribute('aria-label','会话所属实例');instance.append(new Option('网页实例','web'),new Option('桌面实例（检查连接中…）','desktop'));instance.options[1].disabled=true;instance.value=source==='desktop'?'desktop':'web';instanceLabel.append(instance);
 const instanceStatus=document.createElement('p');instanceStatus.className='muted project-instance-status';instanceStatus.setAttribute('role','status');
 const form=document.createElement('form');form.className='project-path-form';
 const input=document.createElement('input');input.type='text';input.value=normalizeProjectDirectory(current)||'';input.placeholder='输入完整目录路径';input.setAttribute('aria-label','项目目录路径');
 const go=button('打开目录');go.type='submit';form.append(input,go);
 const tabs=document.createElement('div');tabs.className='project-picker-tabs';
 const known=button('已有项目',()=>drawKnown()),browse=button('浏览目录',()=>void load(input.value.trim()));tabs.append(known,browse);
 const status=document.createElement('p');status.className='project-picker-status';status.setAttribute('role','status');
 const list=document.createElement('div');list.className='project-picker-list';
 const search=document.createElement('input');search.type='search';search.className='project-folder-search';search.setAttribute('aria-label','搜索文件夹名称');
 const actions=document.createElement('div');actions.className='project-picker-actions';
 const choose=button('使用此目录',()=>void select(input.value.trim()));choose.disabled=!input.value.trim();actions.append(choose);
 content.append(description,instanceLabel,instanceStatus,form,tabs,search,status,list,actions);const dialog=commandDialog('选择项目目录',content);
 let request=0,closed=false,view='known',directory=null,selecting=false,capabilities=null;const creationIds=new Map();
 const leave=dialog.leave;dialog.leave=()=>{closed=true;request++;leave();};
 function tab(active){view=active;search.placeholder=active==='browse'?'搜索当前目录下的文件夹':'搜索已有项目';known.setAttribute('aria-pressed',String(active==='known'));browse.setAttribute('aria-pressed',String(active==='browse'));}
 function item(name,cwd,action){const row=button('',action);row.className='project-picker-item';const icon=document.createElement('span');icon.innerHTML=folder;const text=document.createElement('span'),title=document.createElement('strong'),path=document.createElement('small');title.textContent=name;path.textContent=cwd;text.append(title,path);row.append(icon,text);return row;}
 function drawKnown(){request++;tab('known');search.disabled=false;list.replaceChildren();status.textContent='';const query=search.value.trim().toLocaleLowerCase(),projects=[...groupProjectRows(rows.filter(row=>row.cwd)).keys()].map(normalizeProjectDirectory),matches=projects.filter(cwd=>cwd.toLocaleLowerCase().includes(query));for(const cwd of matches)list.append(item(cwd.split(/[\\/]/).filter(Boolean).at(-1)||cwd,cwd,()=>{input.value=cwd;choose.disabled=false;void select(cwd);}));if(!matches.length)status.textContent=query?'没有匹配的项目':'暂无已有项目，请输入路径或浏览目录。';}
 function drawDirectory(){if(!directory)return;list.replaceChildren();const query=search.value.trim().toLocaleLowerCase(),matches=directory.directories.filter(entry=>entry.name.toLocaleLowerCase().includes(query));if(directory.parent!==null)list.append(item('上一级',directory.parent||'此电脑',()=>void load(directory.parent)));for(const entry of matches)list.append(item(entry.name,normalizeProjectDirectory(entry.path),()=>void load(entry.path)));status.textContent=query?matches.length?`找到 ${matches.length} 个文件夹`:'当前目录下没有匹配的文件夹':directory.directories.length?'':directory.path?'此目录没有子文件夹，可以直接选择。':'没有可访问的磁盘';}
 async function load(cwd){if(selecting)return;const id=++request;tab('browse');directory=null;list.replaceChildren();status.textContent='正在读取目录…';choose.disabled=true;search.disabled=true;try{const result=await api('/codex-api/v1/project-directories'+(cwd?'?path='+encodeURIComponent(normalizeProjectDirectory(cwd)):''));if(id!==request||closed||!content.isConnected)return;directory=result;input.value=normalizeProjectDirectory(result.path);search.value='';search.disabled=false;drawDirectory();choose.disabled=!result.path;}catch(error){if(id===request&&!closed){list.replaceChildren();search.disabled=false;status.textContent=error.message;}}}
 async function select(cwd){if(selecting)return;if(instance.value==='desktop'&&!capabilities?.create){status.textContent=capabilities?.reason||'正在检查桌面连接，请稍候';return;}if(!cwd){status.textContent='请先选择或输入目录';return;}const id=++request,controls=[...content.querySelectorAll('button,input,select')].map(node=>[node,node.disabled]);selecting=true;for(const [node]of controls)node.disabled=true;status.textContent='正在检查目录…';try{const result=await api('/codex-api/v1/project-directories?path='+encodeURIComponent(normalizeProjectDirectory(cwd)));if(id!==request||closed||!content.isConnected)return;status.textContent=instance.value==='desktop'?'正在创建桌面会话并等待 App 连接…':'正在准备网页会话…';const key=instance.value+':'+normalizeProjectDirectory(result.path);if(!creationIds.has(key))creationIds.set(key,crypto.randomUUID());if(await onSelect(normalizeProjectDirectory(result.path),{source:instance.value,requestId:creationIds.get(key)})===false){status.textContent='请先关闭一个聊天标签页，再新建会话';return;}dialog.leave();}catch(error){if(id===request&&!closed)status.textContent=error.message;}finally{selecting=false;for(const [node,disabled]of controls)node.disabled=disabled;choose.disabled=!input.value.trim();}}
 form.onsubmit=event=>{event.preventDefault();void load(input.value.trim());};input.oninput=()=>{request++;choose.disabled=!input.value.trim();status.textContent='';};
 search.oninput=()=>{if(view==='known')drawKnown();else drawDirectory();};
 function paintInstance(){instanceStatus.textContent=instance.value==='desktop'?(capabilities?.create?'使用桌面账号和原生会话；电脑端会打开新聊天，加载期间请稍候。':capabilities?.reason||'正在检查桌面连接…'):'使用当前网页账号配置；首次发送时创建会话。';}
 instance.onchange=paintInstance;
 if(desktopEnabled)void api('/codex-api/v1/desktop-projects/capabilities').then(result=>{if(closed)return;capabilities=result;instance.options[1].textContent=result.create?'桌面实例（已连接）':'桌面实例（暂不可用）';instance.options[1].disabled=!result.create;paintInstance();}).catch(()=>{if(closed)return;capabilities={create:false,reason:'无法检查桌面连接，请稍后重试'};instance.options[1].textContent='桌面实例（连接失败）';paintInstance();});
 drawKnown();paintInstance();input.focus();return dialog;
}
export function projectInfoButton(onClick){const node=button('',event=>{event.preventDefault();event.stopPropagation();onClick();});node.className='project-info-button';node.setAttribute('aria-label','查看项目目录');node.title='查看项目目录';node.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></svg>';node.addEventListener('pointerdown',event=>event.stopPropagation());return node;}
