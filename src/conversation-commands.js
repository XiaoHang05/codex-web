import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fault} from './storage.js';
const execute=promisify(execFile),idPattern=/^[a-zA-Z0-9_-]{1,80}$/;
export async function conversationCommands(req,res,ctx){
 if(req.path==='/api/conversation-command'&&req.method==='POST'){
  const {profile,threadId,action,target,source}=req.body||{};
  if(!idPattern.test(profile||'')||!idPattern.test(threadId||'')||!['compact','review'].includes(action))throw fault('无效会话命令');
  const desktopRow=ctx.history.list().find(row=>row.threadId===threadId);
  if(source==='desktop'||desktopRow){
   if(source!=='desktop'||!desktopRow)throw fault('会话来源不匹配',409);
   if(desktopRow.accountMismatch||desktopRow.protected||desktopRow.conflict)throw fault('此桌面会话不可操作',403);
   if(action!=='compact')throw fault('当前桌面共享协议未提供原生审查入口',409);
   res.json(await ctx.desktop.control(threadId,'compact',{}));return true;
  }
  const instance=await ctx.codex.start(profile);if(!instance.loaded.has(threadId))throw fault('请先打开该会话',409);if(instance.active.has(threadId))throw fault('请等待当前轮次完成',409);
  if(action==='compact'){await ctx.codex.rpc(profile,'thread/compact/start',{threadId});res.json({ok:true});return true;}
  if(!target||!['uncommittedChanges','baseBranch','commit','custom'].includes(target.type))throw fault('无效审查目标');const field={baseBranch:'branch',commit:'sha',custom:'instructions'}[target.type];if(field&&(typeof target[field]!=='string'||!target[field].trim()||target[field].length>8000))throw fault('请填写审查目标');
  const result=await ctx.codex.rpc(profile,'review/start',{threadId,delivery:'inline',target:{type:target.type,...(field?{[field]:target[field]}:{})}});res.json(result);return true;
 }
 const match=req.path.match(/^\/api\/git\/([^/]+)\/([a-zA-Z0-9_-]+)$/);if(!match)return false;if(req.method!=='GET')throw fault('Git 查看接口只读',405);
 const scope=decodeURIComponent(match[1]),threadId=match[2];let cwd;
 if(scope==='desktop')cwd=ctx.history.list().find(row=>row.threadId===threadId)?.cwd;
 else if(/^web:[a-zA-Z0-9_-]+$/.test(scope))cwd=ctx.codex.instances.get(scope.slice(4))?.threadMetadata?.get(threadId)?.cwd;
 if(!cwd)throw fault('请先打开会话',409);
 const git=async args=>{try{return (await execute('git',['--no-optional-locks','-c','core.fsmonitor=false','-c','core.pager=cat','-C',cwd,...args],{windowsHide:true,timeout:10000,maxBuffer:2*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'}})).stdout;}catch(error){if(args[0]==='log'&&/does not have any commits yet|unknown revision.*HEAD/i.test(error.stderr||''))return '';if(/not a git repository/i.test(error.stderr||''))throw fault('此项目尚不是 Git 仓库',409);if(error.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER')throw fault('输出超过 2 MB，请选择单个文件查看',413);throw fault('Git 读取失败：'+String(error.stderr||error.message).slice(0,800),502);}};
 const view=req.query.view||'status';if(!['status','log','diff'].includes(view))throw fault('未知 Git 视图');
 if(view==='status'){const [branch,status]=await Promise.all([git(['branch','--show-current']),git(['status','--porcelain=v1','-z','--untracked-files=normal'])]);const chunks=status.split('\0').filter(Boolean),files=[];for(let i=0;i<chunks.length;i++){const row=chunks[i],code=row.slice(0,2),name=row.slice(3);files.push({status:code,path:name,...(/[RC]/.test(code)?{originalPath:chunks[++i]}:{})});}res.json({branch:branch.trim()||'游离 HEAD',files});}
 else if(view==='log'){const output=await git(['log','-40','--date=iso-strict','--format=%h%x1f%an%x1f%aI%x1f%s']);res.json({commits:output.trim().split('\n').filter(Boolean).map(line=>{const [id,author,time,...subject]=line.split('\x1f');return {id,author,time,subject:subject.join('\x1f')};})});}
 else{const file=req.query.file;if(file!==undefined&&(typeof file!=='string'||file.length>2048||path.isAbsolute(file)||file.split(/[\\/]/).includes('..')||file.includes('\0')))throw fault('无效 Git 文件路径');const sensitive=/(^|[\\/])(?:\.env(?:\.[^\\/]*)?|auth\.json|.*(?:secret|credential|passkey|private[-_]?key|cookie|token).*)(?:[\\/]|$)|(^|[\\/])(?:hub[\\/]data|runtime[\\/]caddy[\\/]data|migration-backup)(?:[\\/]|$)/i;if(file&&sensitive.test(file))throw fault('此文件不提供差异预览',403);const exclusions=['**/.codex/**','**/.dsh/**','**/.env','**/.env.*','**/auth.json','**/*secret*','**/*credential*','**/*passkey*','**/*private*key*','**/*cookie*','**/*token*','hub/data/**','runtime/caddy/data/**','migration-backup/**'].map(pattern=>':(exclude,glob,icase)'+pattern);const args=['diff','--no-ext-diff','--no-textconv','--no-color',...(req.query.staged==='1'?['--cached']:[]),'--',file?':(literal)'+file:'.',...exclusions];res.json({diff:await git(args),staged:req.query.staged==='1'});}
 res.set('Cache-Control','no-store');return true;
}
