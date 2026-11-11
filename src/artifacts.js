import fs from 'node:fs';import path from 'node:path';import mammoth from 'mammoth';import {fault,dataRoot,projectRoot} from './storage.js';
import {userContent} from '../public/codex/user-content.js';
import {citedFile,desktopFileCitation,webFileCitation} from './artifact-references.js?v=1';
import {localClient} from './local-files.js';
const imageTypes={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif'};
const textTypes=new Set(['.md','.markdown','.txt','.log','.json','.jsonc','.csv','.tsv','.js','.mjs','.ts','.tsx','.jsx','.css','.html','.htm','.py','.ps1','.cmd','.bat','.yaml','.yml','.toml','.xml','.tex','.sql','.rs','.go','.java','.c','.cpp','.h','.sh']);
function within(root,file){const relative=path.relative(root,file);return !relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
export async function resolveArtifact(scope,thread,requested,ctx){
  let cwd,turns;
  if(scope==='desktop'){const row=ctx.history.list().find(row=>row.threadId===thread);if(!row)throw fault('找不到会话',404);cwd=row.cwd;const state=ctx.desktop.states.get(thread);turns=state?.turnHistory?.history?.entitiesByKey?Object.values(state.turnHistory.history.entitiesByKey):state?.turns;}
  else if(/^web:[a-zA-Z0-9_-]+$/.test(scope)){const instance=ctx.codex.instances.get(scope.slice(4)),meta=instance?.threadMetadata?.get(thread);if(!meta)throw fault('先打开该会话再预览',409);cwd=meta.cwd;turns=meta.turns;}
  else throw fault('未知会话来源',400);
  if(typeof requested!=='string'||!requested||requested.length>2048||requested.includes('\0')||requested.startsWith('\\\\')||requested.startsWith('//')||!cwd)throw fault('无效文件路径');
  const resolved=path.resolve(cwd,requested);if(!fs.existsSync(resolved))throw fault('文件不存在',404);const real=fs.realpathSync(resolved),root=fs.realpathSync(cwd);
  for(const privateRoot of [dataRoot,...(ctx.privateRoots||[])])if(within(fs.existsSync(privateRoot)?fs.realpathSync(privateRoot):privateRoot,real))throw fault('该文件不提供预览',403);
  const reference=(turns||[]).flatMap(turn=>turn.items||[]).some(item=>item.type==='imageView'&&path.resolve(cwd,item.path||item.filePath||item.file_path||'')===resolved||item.type==='userMessage'&&userContent(item.text||(item.content||[]).map(part=>part.text||part.inputText||'').join('\n'),item).images.some(image=>!image.startsWith('data:')&&path.resolve(cwd,image)===resolved))||scope==='desktop'&&!within(root,real)&&Object.hasOwn(imageTypes,path.extname(real).toLowerCase())&&await ctx.desktopAdapter?.imageReference(ctx.history,thread,cwd,resolved);
  if(!within(root,real)&&!(reference&&Object.hasOwn(imageTypes,path.extname(real).toLowerCase()))){
    const cited=(turns||[]).flatMap(turn=>turn.items||[]).some(item=>['userMessage','agentMessage','assistantMessage'].includes(item.type)&&citedFile(item,cwd,resolved))||(scope==='desktop'?await desktopFileCitation(ctx.history,thread,cwd,resolved):await webFileCitation(ctx.codex,scope.slice(4),thread,cwd,resolved));
    if(!cited)throw fault('只能访问此会话工作目录或明确引用的文件',403);
  }
  const relative=path.relative(root,real).replaceAll('\\','/');if(/(^|\/)(\.codex|\.dsh|\.git|node_modules|migration-backup)(\/|$)|(^|\/)hub\/data(\/|$)|runtime\/caddy\/data(\/|$)/i.test(relative)||/(^|\/)(\.env(?:\..*)?|auth\.json|.*(?:secret|credential|passkey|private[-_]?key|cookie|token).*)$/i.test(relative))throw fault('该文件不提供预览',403);
  const stat=fs.statSync(real);if(!stat.isFile())throw fault('只能预览文件');
  return {real,stat};
}
export async function artifacts(req,res,ctx){
  if(req.path==='/api/artifacts/local-open/consume'){
    if(req.method!=='POST')throw fault('需要 POST',405);
    if(!localClient(req,ctx.auth))throw fault('仅限本机打开',403);
    res.set('Cache-Control','no-store');res.json(await ctx.localFiles.consume(req.body?.token,record=>resolveArtifact(record.scope,record.thread,record.requested,ctx)));return true;
  }
  const match=req.path.match(/^\/api\/artifacts\/([^/]+)\/([a-zA-Z0-9_-]+)(\/open)?$/);if(!match)return false;
  const native=!!match[3];if(req.method!==(native?'POST':'GET'))throw fault(native?'需要 POST':'只读预览',405);
  if(native&&!localClient(req,ctx.auth))throw fault('仅限本机打开',403);
  const scope=decodeURIComponent(match[1]),thread=match[2],requested=native?req.body?.path:req.query.path;
  const {real,stat}=await resolveArtifact(scope,thread,requested,ctx);
  const extension=path.extname(real).toLowerCase(),name=path.basename(real);res.set('Cache-Control','no-store');
  if(native){res.json(ctx.localFiles.issue({scope,thread,requested},real,stat));return true;}
  const browser=!!imageTypes[extension]||extension==='.pdf'||textTypes.has(extension);
  const describe=record=>res.json({...record,open:{browser,native:localClient(req,ctx.auth)&&ctx.localFiles.allowed(real)}});
  if(req.query.open==='1'){
    if(!browser)throw fault('浏览器不支持直接打开此格式',415);
    const type=imageTypes[extension]||(extension==='.pdf'?'application/pdf':extension==='.html'||extension==='.htm'?'text/html':'text/plain');
    if(type==='text/html')res.set('Content-Security-Policy',"sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    res.set('X-Content-Type-Options','nosniff');res.set('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.type(type);res.sendFile(real,{dotfiles:'allow'});return true;
  }
  // Downloads use the same authorization as previews and stream the original.
  if(req.query.download==='1'){
    res.set('Content-Security-Policy',"sandbox; default-src 'none'");res.set('X-Content-Type-Options','nosniff');res.type('application/octet-stream');
    res.download(real,name,{dotfiles:'allow'},error=>{if(error){if(res.headersSent)res.destroy();else res.status(error.status||500).json({error:'文件下载失败'});}});return true;
  }
  const unavailable=note=>{describe({kind:'unsupported',name,size:stat.size,note});return true;};
  if(stat.size>24*1024*1024){if(req.query.raw==='1')throw fault('文件超过预览大小限制',413);return unavailable('文件超过预览大小限制，可点击上方按钮下载查看。');}
  if(req.query.raw==='1'){
    const type=imageTypes[extension]||(extension==='.pdf'?'application/pdf':null);if(!type)throw fault('此格式没有原始预览',400);
    res.set('Content-Type',type);res.set('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(name)}`);res.send(fs.readFileSync(real));return true;
  }
  if(imageTypes[extension])describe({kind:'image',name,size:stat.size});
  else if(extension==='.pdf')describe({kind:'pdf',name,size:stat.size});
  else if(extension==='.docx'){if(stat.size>8*1024*1024)return unavailable('Word 文档超过预览大小限制，可下载查看。');try{const result=await mammoth.convertToHtml({buffer:fs.readFileSync(real)},{externalFileAccess:false});describe({kind:'html',name,html:result.value,note:'Word 内容预览，复杂排版可能与原件不同'});}catch{return unavailable('无法生成此 Word 文档的预览，可下载原文件查看。');}}
  else if(textTypes.has(extension)){if(stat.size>2*1024*1024)return unavailable('文本超过预览大小限制，可下载查看。');const content=fs.readFileSync(real,'utf8');if(content.includes('\0'))return unavailable('无法以文本预览此文件，可下载查看。');describe({kind:extension==='.md'||extension==='.markdown'?'markdown':extension==='.html'||extension==='.htm'?'html':'text',name,text:content,html:extension==='.html'||extension==='.htm'?content:undefined});}
  else return unavailable('暂不支持预览此格式，可点击上方按钮下载查看。');return true;
}
