import {workIcon} from './work-icons.js';
import {openUpPopover,closeUpPopover} from './popover-motion.js';

const pluginNames=[
 ['Documents','创建和编辑文档',['documents','document']],['PDF','读取、创建和检查 PDF',['pdf']],
 ['Spreadsheets','创建和编辑电子表格',['spreadsheets','spreadsheet']],['Presentations','创建和编辑演示文稿',['presentations','presentation']],
 ['Template Creator','从参考内容创建可复用模板',['template-creator','template creator']],
 ['浏览器','控制 App 内浏览器',['browser-use','browser']],['电脑','控制 Windows 应用',['computer-use','computer']],
 ['Code Review','审查和管理代码',['code-review','code review','review-agent']],['Visualize','创建交互式可视化',['visualize','visualization']],
 ['Pets','创建和管理虚拟宠物',['work-pets','pets']],['Plugin Management','发现和管理插件',['plugin-management']],['Sites','构建和发布网站',['sites:','sites-building']]
];
export function addCatalog({commands,skills,rows,files,append}){
 const all=commands(),get=name=>all.find(item=>item.name===name),used=new Set();
 const command=(name,label,icon)=>({...get(name),label,icon,group:'添加',disabled:get(name)?.disabled||(!get(name)?'当前功能尚未接入':null)});
 const items=[{label:'文件和文件夹',description:'添加图片、文本文件或路径引用',icon:'fileChange',group:'添加',run:files},
  {label:'附加 Microsoft Edge',description:'附加浏览器页面',icon:'webSearch',group:'添加',disabled:'网页暂不能读取 Edge 标签页，请复制网址到输入框'},
  command('project','在项目中工作','mcpToolCall'),{...command('goal','目标','contextCompaction'),description:get('goal')?.description},command('plan','计划模式','reasoning'),command('sketch','绘图','fileChange')];
 for(const [label,description,aliases]of pluginNames){
  const matches=skills().filter(skill=>aliases.some(alias=>(skill.name+' '+(skill.interface?.displayName||'')).toLowerCase().includes(alias)));
  matches.forEach(skill=>used.add(skill.name));
  const choices=matches.map(skill=>all.find(item=>item.name==='skill:'+skill.name)).filter(Boolean);
  // Native code review is also available without a separately installed skill.
  const fallback=label==='Code Review'?get('review'):null;
  items.push({label,description,icon:label==='浏览器'?'webSearch':'mcpToolCall',group:'插件',disabled:choices.length?null:fallback?.disabled||(!fallback?'当前实例未提供此插件或技能':null),run:choices.length?()=>choices.length===1?choices[0].run():choices:fallback?.run});
 }
 for(const skill of skills().filter(skill=>!used.has(skill.name))){const entry=all.find(item=>item.name==='skill:'+skill.name);if(entry)items.push({...entry,label:skill.interface?.displayName||skill.name,icon:'mcpToolCall',group:'其他技能'});}
 for(const [label,description]of [['Hotline','按用户所在地区查询帮助热线'],['Safety Settings','家长控制与可信联系人设置'],['Search Service','搜索服务']])items.push({label,description,icon:'webSearch',group:'应用',disabled:'网页尚未接入 App 应用上下文；可在消息中说明需要的功能'});
 items.push({...get('mcp'),label:'MCP 服务与工具',icon:'mcpToolCall',group:'应用'});
 items.push({label:'添加 ChatGPT 对话',description:'引用 ChatGPT 中的对话',icon:'collabAgentToolCall',group:'ChatGPT 对话',disabled:'网页暂不能读取 ChatGPT 对话列表'});
 items.push({label:'添加浏览器标签页',description:'附加 Edge 或其他浏览器中的页面',icon:'webSearch',group:'标签页',disabled:'网页没有读取其他浏览器标签页的权限，请粘贴页面网址'});
 const chats=rows().filter(row=>!row.accountMismatch&&!row.conflict);
 for(const row of chats)items.push({label:row.name||row.threadId,description:'引用聊天标题与 ID · '+(row.cwd||''),icon:'collabAgentToolCall',group:'文件和聊天',search:row.threadId+' '+(row.cwd||''),run:()=>append(`参考 Codex 聊天：${row.name||'未命名'}（聊天 ID：${row.threadId}）`)});
 return items;
}

export function composerAdd({button,input,commands,skills,rows,append,attachImages,notice,closeSlash,refreshSkills}){
 let panel,search,list,submenu=null,busy=false,positionFrame=0;
 const composer=button.closest('.composer'),touch=()=>matchMedia('(pointer:coarse)').matches;
 const close=(focus=false)=>{const editing=touch()&&[input,search].includes(document.activeElement);if(editing&&document.activeElement===search)input.focus({preventScroll:true});cancelAnimationFrame(positionFrame);positionFrame=0;anchorObserver.disconnect();if(panel)closeUpPopover(panel);panel=null;submenu=null;button.setAttribute('aria-expanded','false');if(focus&&!editing)button.focus({preventScroll:true});};
 // Keyboard, browser chrome and orientation changes move the anchor; keep the menu open.
 function position(){
  if(!panel)return;
  const viewport=window.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
  const anchor=composer.getBoundingClientRect(),bottom=Math.max(top+8,Math.min(anchor.top-6,top+height-8)),menuWidth=Math.min(520,width-16);
  panel.style.width=menuWidth+'px';panel.style.left=Math.max(left+8,Math.min(anchor.left,left+width-menuWidth-8))+'px';
  panel.style.bottom=Math.max(8,innerHeight-bottom)+'px';panel.style.maxHeight=Math.max(0,Math.min(320,height*.45,bottom-top-24))+'px';
 }
 const reposition=()=>{if(!panel||positionFrame)return;positionFrame=requestAnimationFrame(()=>{positionFrame=0;position();});};
 const anchorObserver=new ResizeObserver(reposition);
 // Keep the current keyboard state on touch; search opens it only when tapped.
 const focusMenu=()=>{if(!touch())search?.focus({preventScroll:true});};
 const files=()=>[
  {label:'添加图片',description:'选择图片，加入输入框上方的图片预览',run:()=>pick('image/*',attachImages)},
  {label:'添加文本文件',description:'将文件名和文本内容加入草稿，最多 8 个、共 512 KB',run:()=>pick('.txt,.md,.csv,.tsv,.json,.js,.ts,.py,.css,.html,.xml,.yaml,.yml,.toml,.log,.tex,.sql,.rs,.go,.java,.c,.cpp,.h,.sh,.ps1',attachText)},
  {label:'引用文件或文件夹',description:'填写引擎所在电脑上的路径',run:()=>{const value=prompt('文件或文件夹路径（引擎所在电脑）');if(value?.trim())append('@'+value.trim());}}
 ];
 function pick(accept,action){const picker=document.createElement('input');picker.type='file';picker.multiple=true;picker.accept=accept;picker.hidden=true;document.body.append(picker);picker.onchange=async()=>{try{await action([...picker.files]);}catch(error){notice(error.message);}finally{picker.remove();}};picker.oncancel=()=>picker.remove();picker.click();}
 async function attachText(files){if(files.length>8||files.reduce((total,file)=>total+file.size,0)>512*1024)throw Error('请选择最多 8 个文本文件，合计不超过 512 KB');const contents=await Promise.all(files.map(async file=>{const text=await file.text();if(text.includes('\0'))throw Error(file.name+' 不是可读取的文本文件');return `文件：${file.name}\n${text}`;}));if(contents.length)append(contents.join('\n\n'));}
 const catalog=()=>addCatalog({commands,skills,rows,files,append});
 const choices=()=>[...list.querySelectorAll('button:not(:disabled)')];
 function draw(){
  const query=search.value.trim().toLowerCase();let entries=(submenu||catalog()).filter(item=>[item.label,item.description,item.name,item.search,item.disabled].join(' ').toLowerCase().includes(query));
  // Recent chats stay short until searched; installed skills are always listed.
  if(!query){let count=0;entries=entries.filter(item=>item.group!=='文件和聊天'||++count<=12);}
  list.replaceChildren();let group='';
  for(const item of entries){if(item.group&&group!==item.group){group=item.group;const heading=document.createElement('div');heading.className='slash-heading';heading.textContent=group;list.append(heading);}
   const row=document.createElement('button');row.type='button';row.className='slash-option composer-add-option';row.setAttribute('role','menuitem');row.disabled=!!item.disabled;row.setAttribute('aria-disabled',String(!!item.disabled));row.title=item.disabled||item.description||item.label;
   const content=document.createElement('span'),label=document.createElement('strong'),description=document.createElement('small');label.textContent=item.label||item.name;description.textContent=item.disabled||item.description||'';content.append(label,description);row.append(workIcon(item.icon||'mcpToolCall'),content);row.onclick=()=>void choose(item);list.append(row);
  }
  if(!entries.length){const empty=document.createElement('p');empty.className='composer-add-empty';empty.textContent='没有匹配的功能、技能或聊天';list.append(empty);}
 }
 async function choose(item){if(busy||item.disabled)return;busy=true;try{const next=await item.run?.();if(Array.isArray(next)){if(!panel)return;submenu=next;search.value='';draw();focusMenu();}else{close();if(!touch()&&!document.querySelector('[role="dialog"]:not([inert]):not([aria-hidden="true"])'))input.focus({preventScroll:true});}}catch(error){notice(error.message);}finally{busy=false;}}
 function open(){if(panel){close();return;}closeSlash();panel=document.createElement('div');panel.className='slash-menu composer-add-menu';panel.id='composer-add-menu';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','添加内容');
  const top=document.createElement('div');top.className='composer-add-search';const back=document.createElement('button');back.type='button';back.className='composer-add-back';back.textContent='返回';back.onclick=()=>{if(submenu){submenu=null;search.value='';draw();focusMenu();}else close(true);};search=document.createElement('input');search.type='search';search.placeholder='搜索功能、技能或聊天';search.setAttribute('aria-label','搜索添加内容');top.append(back,search);list=document.createElement('div');list.className='composer-add-list';list.setAttribute('role','menu');panel.append(top,list);document.body.append(panel);button.setAttribute('aria-expanded','true');
  position();anchorObserver.observe(composer);
  search.oninput=draw;panel.onkeydown=event=>{if(event.isComposing)return;const enabled=choices(),index=enabled.indexOf(document.activeElement);if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(submenu){submenu=null;search.value='';draw();focusMenu();}else close(true);}else if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();enabled[(index+(event.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length]?.focus();}else if(event.key==='Enter'&&event.target===search){event.preventDefault();enabled[0]?.click();}};draw();openUpPopover(panel);focusMenu();if(refreshSkills)Promise.resolve().then(()=>refreshSkills()).then(changed=>{if(changed&&panel&&!submenu)draw();}).catch(error=>notice('技能目录读取失败：'+error.message));
 }
 button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','composer-add-menu');button.setAttribute('aria-expanded','false');button.onclick=open;
 document.addEventListener('pointerdown',event=>{const inMenu=panel?.contains(event.target),trigger=button.contains(event.target),inInput=input.contains(event.target);if(touch()&&[input,search].includes(document.activeElement)&&(trigger||inMenu&&event.target.closest('button')))event.preventDefault();if(panel&&!inMenu&&!trigger&&!inInput)close();});
 input.addEventListener('input',()=>{if(/^\s*\//.test(input.value))close();});window.addEventListener('resize',reposition);window.visualViewport?.addEventListener('resize',reposition);window.visualViewport?.addEventListener('scroll',reposition);
 return {close};
}
