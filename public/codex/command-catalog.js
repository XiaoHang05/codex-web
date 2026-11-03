import {feedbackDialog} from './feedback-ui.js';
import {mcpView,statusView} from './native-status.js';
import {sketch} from './sketch.js';
import {gitView} from './git-view.js';
import {commandDialog} from './slash-commands.js';
export function commandCatalog(env){
 const {$,rpc,api,notice}=env,nativeRead=env.nativeRead||rpc,state=()=>env.state(),item=(name,description,run,disabled)=>({name,description,run,disabled});
 const selectedModel=()=>env.models().find(model=>model.model===$('composer-model').value)||env.models().find(model=>model.isDefault)||env.models()[0];
 const select=id=>()=>[...$(id).options].map(option=>({label:option.textContent,description:option.selected?'当前选项':'',run:()=>{ $(id).value=option.value;$(id).dispatchEvent(new Event('change',{bubbles:true}));notice('已选择 '+option.textContent);}}));
 const settings=tab=>async()=>{await $('account').onclick();document.querySelector('[data-settings="'+tab+'"]').click();};
 const draft=text=>()=>{$('input').value=text;$('input').dispatchEvent(new Event('input',{bubbles:true}));};
 return ()=>{const {selected,profile,turnId}=state(),web=selected?.mode==='web'&&!selected.protected&&!selected.conflict,webOnly=web?null:selected?.mode==='desktop'?'当前桌面共享协议没有此操作的原生入口':'请先打开会话',writable=!!selected&&!selected.protected&&!selected.conflict&&!selected.accountMismatch,writeOnly=writable?null:'请先打开可操作的会话',idle=turnId?'请等待当前任务结束后操作':null;
  const commands=[
   item('new','新建独立原生会话',()=>$('new').onclick()),
   item('project','选择已有项目、浏览目录或输入路径，用于新聊天',()=>env.chooseProject()),
   item('sketch','绘制草图并加入待发送消息',()=>sketch(env.attachImage)),
   item('usage','打开账户套餐和用量信息',()=>selected?.mode==='desktop'?env.desktopUsage():settings('account')()),
   item('resume','搜索并继续已有会话',()=>{$('toggle-sidebar').click();$('search').focus();}),
   item('fork','从当前会话分支',()=>$('fork').onclick(),webOnly),
   item('rename','重命名当前会话',()=>$('rename').onclick(),webOnly),
   item('archive','归档当前会话（App 持有的桌面聊天需在 App 操作）',()=>$('archive').onclick(),writeOnly||idle),
   item('archives','查看并恢复桌面账号的已归档聊天',()=>env.desktopArchives(),selected?.mode==='desktop'?null:'请先打开桌面聊天'),
   item('model','选择模型',select('composer-model')),
   item('reasoning','选择推理强度',select('reasoning')),
   item('fast','快速模式与服务档位（可能增加用量）',arg=>{const model=selectedModel(),tiers=model?.serviceTiers?.length?model.serviceTiers:(model?.additionalSpeedTiers||[]).map(id=>({id,name:id,description:''}));const choices=[{label:'标准速度',description:'使用 default 档位',run:()=>env.setOptions({serviceTier:'default'})},...tiers.filter(tier=>tier.id!=='default').map(tier=>({label:tier.name||tier.id,description:tier.description,run:()=>env.setOptions({serviceTier:tier.id})}))];if(arg==='off')return choices[0].run();if(arg==='on'){const fast=tiers.find(tier=>tier.id==='fast'||tier.id==='priority');if(!fast)throw Error('此模型没有返回可用快速档位');return env.setOptions({serviceTier:fast.id});}return choices;}),
   item('permissions','访问权限：只读、工作区、完全访问',select('access')),
   item('approvals','审批策略：手动、自动审查、无需审批',select('approval')),
   item('plan','进入原生计划模式',()=>env.setOptions({collaborationMode:'plan'}),selected&&(selected.protected||selected.conflict||selected.accountMismatch)?'此会话不可切换模式':null),
   item('agent','恢复执行模式',()=>env.setOptions({collaborationMode:'default'}),selected&&(selected.protected||selected.conflict||selected.accountMismatch)?'此会话不可切换模式':null),
   item('compact','压缩当前会话上下文',async()=>{if(!confirm('压缩当前会话的上下文？'))return;await api('/codex-api/v1/conversation-command',{profile,threadId:selected.threadId,source:selected.mode,action:'compact'});notice('已提交上下文压缩');},writeOnly||idle),
   item('review','原生代码审查：未提交、分支、提交或自定义',()=>[
    {label:'审查未提交更改',run:()=>review({type:'uncommittedChanges'})},
    {label:'对比分支',run:()=>{const branch=prompt('基准分支');if(branch?.trim())return review({type:'baseBranch',branch:branch.trim()});}},
    {label:'审查某次提交',run:()=>{const sha=prompt('提交 SHA');if(sha?.trim())return review({type:'commit',sha:sha.trim()});}},
    {label:'自定义审查',run:()=>{const instructions=prompt('审查要求');if(instructions?.trim())return review({type:'custom',instructions:instructions.trim()});}}
   ],webOnly||idle),
   item('skills','浏览并调用当前实例可用技能',async()=>{const result=await nativeRead('skills/list',{},profile,selected),skills=(result.data||[]).flatMap(entry=>entry.skills||[]).filter(skill=>skill.enabled!==false);if(!skills.length){commandDialog('可用技能','当前实例未返回可用技能。');return;}return skills.map(skill=>({label:skill.interface?.displayName||skill.name,description:skill.description||skill.shortDescription,run:()=>env.useSkill(skill)}));}),
   item('mcp','查看 MCP 服务、工具和连接状态',()=>mcpView((method,params,id)=>nativeRead(method,params,id,selected),{profile,selected})),
   item('status','查看当前会话、模型、权限、上下文及速率限制',async()=>{let limits;try{limits=await nativeRead('account/rateLimits/read',{},profile,selected);}catch(error){limits={unavailable:error.message};}return statusView({'聊天 ID':selected?.threadId||'尚未发送的草稿','来源':selected?.mode==='desktop'?'桌面同实例':'网页独立实例','配置来源':selected?.mode==='desktop'?'桌面 App 配置':profile,'项目':selected?.cwd||env.options().cwd,'下次使用模型':selectedModel()?.model,'下次推理强度':$('reasoning').value||'原生接口未提供','访问权限':$('access').selectedOptions[0]?.textContent,'审批策略':$('approval').selectedOptions[0]?.textContent,'运行状态':turnId?'执行中':'空闲','速度档位':env.options().serviceTier||'默认'},env.tokenUsage(),limits);}),
   item('goal',selected?.mode==='desktop'?'查看桌面目标（单独暂停与管理暂不可用）':'创建或编辑持续目标',()=>selected?.mode==='desktop'?env.viewGoal():env.editGoal(),selected?.mode==='desktop'?null:webOnly),
   item('git','查看项目分支、文件状态、提交记录和 Git diff',()=>gitView({selected,profile},api),!selected?'请先打开会话':null),
   item('diff','查看本次会话的文件改动',()=>{const changes=env.items().filter(item=>item.type==='fileChange').flatMap(item=>item.changes||[]);commandDialog('会话文件改动',changes.length?changes.map(change=>change.path+'\n'+(change.diff||'原生接口未返回 diff')).join('\n\n'):'当前已加载会话没有文件更改记录。');}),
   item('mention','插入文件引用（填写路径，不会立即发送）',arg=>{const file=arg||prompt('文件路径');if(file?.trim())draft('@'+file.trim()+' ')();}),
   item('init','起草项目 AGENTS.md 请求，确认后发送',draft('阅读项目，帮我起草或完善 AGENTS.md。保留已有约束，先说明建议修改内容。')),
   item('stop','中断当前正在执行的轮次',()=>$('interrupt').onclick(),!selected||selected.protected?'此会话不可中断':!turnId?'当前没有执行中的轮次':null),
   item('settings','全局默认设置和显示偏好',settings('defaults')),
   item('account','账户套餐、速率限制与用量',()=>selected?.mode==='desktop'?env.desktopUsage():settings('account')()),
   item('login','打开 ChatGPT 账户登录入口',settings('account'),selected?.mode==='desktop'?'桌面账号登录请在 App 中操作':null),
   item('provider',selected?.mode==='desktop'?'查看桌面模型提供方配置（切换仍需 App）':'模型提供方与 API 配置',()=>selected?.mode==='desktop'?env.desktopProviders():settings('provider')()),
   item('runtime','查看原生运行配置',()=>selected?.mode==='desktop'?env.desktopRuntime():settings('runtime')()),
   item('feedback','填写并提交 OpenAI 反馈',()=>feedbackDialog({api,selected,profile}),!selected?'请先打开会话':null),
   item('pet','桌面虚拟宠物',()=>{},'桌面宠物控制接口暂未开放，网页不伪造桌面宠物状态'),
   item('help','查看 Web 命令与原生接口支持范围',()=>commandDialog('命令帮助','输入 / 搜索命令，↑↓ 选择，Enter 或 Tab 执行，Esc 关闭。\n\n快速模式与推理强度独立，档位来自原生模型目录。\n\n桌面与独立 Web 实例均支持计划模式、模型、推理、速度和权限设置、上下文压缩、技能、文件与图片、排队和引导。桌面目标仅可查看，单独暂停及其他管理仍需在 App 中操作；未被 App 引擎持有的桌面历史聊天可归档与恢复；引擎持有的聊天会明确拒绝归档。目标创建、编辑、继续和清除，以及分支、重命名与原生审查仍需 App 提供共享入口。\n\n技能选择后加入待发送消息，由你点击发送。\n云端任务、插件安装管理、后台终端停止等尚未接入；/stop 当前仅中断轮次，不会终止进程。'))
  ];
  const labels={feedback:'▤ 反馈',pet:'♙ 虚拟宠物',project:'▱ 在项目中使用 Codex',sketch:'〰 绘图',usage:'◴ 使用情况和计费',new:'＋ 新建聊天',resume:'◷ 继续聊天',fork:'⑂ 分支到新聊天',rename:'✎ 重命名',archive:'▣ 归档',archives:'▣ 已归档聊天',model:'◇ 模型',reasoning:'◉ 推理',fast:'ϟ 快速',permissions:'◈ 访问权限',approvals:'☑ 审批策略',plan:'☷ 计划模式',agent:'▷ 执行模式',compact:'⇥ 压缩上下文',review:'⌕ 代码审查',skills:'▧ 技能',mcp:'♧ MCP',status:'◴ 状态',goal:'◎ 目标',git:'⑂ Git',diff:'± 文件改动',mention:'@ 引用文件',init:'✎ 项目指令',stop:'■ 中断轮次',settings:'⚙ 设置',account:'◴ 使用情况和计费',login:'↗ 登录',provider:'◇ 模型提供方',runtime:'⌘ 运行信息',help:'? 帮助'};for(const command of commands)command.label=labels[command.name];
  return [...commands,...env.skills().map(skill=>({name:'skill:'+skill.name,label:skill.interface?.displayName||skill.name,description:skill.description||skill.shortDescription,group:'技能',run:()=>env.useSkill(skill)}))];
  async function review(target){if(!confirm('启动一次原生代码审查？这会使用模型额度。'))return;await api('/codex-api/v1/conversation-command',{profile,threadId:selected.threadId,action:'review',target});await env.read();}
 };
}
